import { watch, nextTick, ref } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { workingSecondsBetween, DEFAULT_WORK_DAYS } from '../utils/workSchedule'

/**
 * Parse a duration string like "5m", "30s", "1h", "1.5h", "90s" into seconds.
 * Returns null if not a valid duration.
 */
function parseDuration(str) {
  const m = str.match(/^(\d+(?:\.\d+)?)\s*(s|m|h)$/i)
  if (!m) return null
  const val = parseFloat(m[1])
  switch (m[2].toLowerCase()) {
    case 's': return val
    case 'm': return val * 60
    case 'h': return val * 3600
  }
  return null
}

/**
 * Extract duration filter from a query string.
 * Supported patterns:
 *   >5m             — service time longer than 5 minutes
 *   <30s            — service time shorter than 30 seconds
 *   >=1h            — service time 1 hour or longer
 *   <=10m           — service time 10 minutes or shorter
 *   5m-30m          — service time between 5 and 30 minutes
 *   wait:>30m       — waiting time longer than 30 minutes
 *   sojourn:>=1h    — sojourn time (wait + service) 1 hour or longer
 *   service:<10m    — explicit service time (same as no prefix)
 *
 * Returns { filter: { min, max, attribute } | null, rest: string }
 * where rest is the remaining query after removing the duration filter.
 * attribute is 'duration' (default), 'waiting', or 'sojourn'.
 */
const ATTR_ALIASES = {
  wait: 'waiting', waiting: 'waiting', wacht: 'waiting',
  sojourn: 'sojourn', doorloop: 'sojourn',
  service: 'duration', duration: 'duration', dur: 'duration',
}

function extractDurationFilter(query) {
  // Optional attribute prefix: "wait:", "sojourn:", "service:", etc.
  const prefixRe = /^(wait|waiting|wacht|sojourn|doorloop|service|duration|dur)\s*:\s*/i
  let attribute = 'duration'
  let q = query

  const prefixMatch = q.match(prefixRe)
  if (prefixMatch) {
    attribute = ATTR_ALIASES[prefixMatch[1].toLowerCase()] || 'duration'
    q = q.slice(prefixMatch[0].length)
  }

  // Range pattern: 5m-30m, 1s-2h
  const rangeMatch = q.match(/(\d+(?:\.\d+)?(?:s|m|h))\s*-\s*(\d+(?:\.\d+)?(?:s|m|h))/i)
  if (rangeMatch) {
    const min = parseDuration(rangeMatch[1])
    const max = parseDuration(rangeMatch[2])
    if (min !== null && max !== null) {
      const rest = q.replace(rangeMatch[0], '').trim()
      return { filter: { min, max, attribute }, rest }
    }
  }

  // Comparison pattern: >5m, <30s, >=1h, <=10m
  const cmpMatch = q.match(/(>=?|<=?)\s*(\d+(?:\.\d+)?(?:s|m|h))/i)
  if (cmpMatch) {
    const op = cmpMatch[1]
    const val = parseDuration(cmpMatch[2])
    if (val !== null) {
      const rest = q.replace(cmpMatch[0], '').trim()
      let min = null, max = null
      if (op === '>') min = val + 0.001
      else if (op === '>=') min = val
      else if (op === '<') max = val - 0.001
      else if (op === '<=') max = val
      return { filter: { min, max, attribute }, rest }
    }
  }

  return { filter: null, rest: query }
}

/**
 * Reactive search: watches searchQuery and computes highlightedTaskKeys.
 * Call once from App.vue to activate.
 * Automatically scrolls to the first matching task.
 *
 * Debounced: waits 250ms after user stops typing before scanning.
 */
export function useSearch() {
  const store = useTimelineStore()
  let debounceTimer = null

  watch(
    () => store.searchQuery,
    (q) => {
      // Clear immediately when query is empty
      const raw = q.trim()
      if (!raw) {
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
        store.highlightedTaskKeys = new Set()
        store.searchResults = []
        store.searchResultIndex = -1
        return
      }

      // Debounce: wait 250ms before scanning
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        runSearch(raw, store)
      }, 250)
    },
    { immediate: true }
  )
}

/**
 * Run the actual search — single pass through all tasks.
 */
function runSearch(raw, store) {
  const { filter: durFilter, rest } = extractDurationFilter(raw)
  const query = rest.toLowerCase()

  // Determine match mode once, avoid re-checking per task
  let mode = 'text' // default: freetext
  let matchCaseId = null
  let matchTaskId = null
  let textTerms = [] // multiple space-separated terms for AND matching

  const caseTaskMatch = query.match(/^c(\d+)\.t(\d+)$/i)
  if (caseTaskMatch) {
    mode = 'ct'
    matchCaseId = parseInt(caseTaskMatch[1])
    matchTaskId = parseInt(caseTaskMatch[2])
  } else {
    const caseMatch = query.match(/^c(\d+)$/i)
    if (caseMatch) {
      mode = 'c'
      matchCaseId = parseInt(caseMatch[1])
    } else {
      const taskMatch = query.match(/^t(\d+)$/i)
      if (taskMatch) {
        mode = 't'
        matchTaskId = parseInt(taskMatch[1])
      }
    }
  }

  // For text mode, split query into individual terms for AND matching
  if (mode === 'text' && query) {
    textTerms = query.split(/\s+/).filter(Boolean)
  }

  // Duration-only filter
  if (durFilter && !query) mode = 'dur'

  // Work schedule config for duration filters
  const useWs = durFilter && durFilter.attribute !== 'duration' && store.wsEnabled
  const wsStartH = store.wsStartH
  const wsEndH = store.wsEndH
  const workDays = DEFAULT_WORK_DAYS

  const keys = new Set()
  const results = []

  // Single pass through all tracks/tasks
  const tracks = store.tracks
  for (let ti = 0; ti < tracks.length; ti++) {
    const tr = tracks[ti]
    const tasks = tr.tasks
    const trId = tr.id
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]

      // Duration filter (applies to all modes)
      if (durFilter) {
        let val
        switch (durFilter.attribute) {
          case 'waiting':
            if (useWs && t.absAssigned && t.absStart) {
              val = workingSecondsBetween(t.absAssigned, t.absStart, wsStartH, wsEndH, workDays)
              if (isNaN(val)) val = t.waiting || 0
            } else {
              val = t.waiting || 0
            }
            break
          case 'sojourn':
            if (useWs && t.absAssigned && t.absEnd) {
              val = workingSecondsBetween(t.absAssigned, t.absEnd, wsStartH, wsEndH, workDays)
              if (isNaN(val)) val = (t.waiting || 0) + (t.end - t.start)
            } else {
              val = (t.waiting || 0) + (t.end - t.start)
            }
            break
          default: val = t.end - t.start; break
        }
        if (durFilter.min !== null && val < durFilter.min) continue
        if (durFilter.max !== null && val > durFilter.max) continue
      }

      let matched = false
      switch (mode) {
        case 'dur': matched = true; break
        case 'ct': matched = t.caseId === matchCaseId && t.taskId === matchTaskId; break
        case 'c': matched = t.caseId === matchCaseId; break
        case 't': matched = t.taskId === matchTaskId; break
        case 'text': {
          // AND matching: every term must appear in agent OR taskName
          const agentLc = t.agent.toLowerCase()
          const taskLc = (t.taskName || '').toLowerCase()
          matched = textTerms.every(term =>
            agentLc.includes(term) || taskLc.includes(term)
          )
          break
        }
      }

      if (matched) {
        const key = `${trId}-${t.caseId}-${t.taskId}-${t.agent}`
        keys.add(key)
        results.push({ taskKey: key, task: t, trackId: trId, agent: t.agent })
      }
    }
  }

  store.highlightedTaskKeys = keys
  store.searchResults = results
  store.searchResultIndex = results.length > 0 ? 0 : -1
  if (results.length > 0) scrollToTask(results[0], store)
}

/**
 * Scroll to a specific task by computing the correct scroll positions
 * for both the horizontal track scroll and vertical timeline scroll.
 * Uses task data directly instead of relying on scrollIntoView.
 */
export function scrollToTask(match, store) {
  nextTick(() => {
    const { task, trackId, agent } = match
    const pps = store.pxPerSecond

    // 1. Find the track's hscroll container
    const trackEl = document.querySelector(`.track[data-track-id="${trackId}"]`)
    if (!trackEl) return

    const hscroll = trackEl.querySelector('.track-hscroll')
    if (!hscroll) return

    // 2. Compute horizontal scroll to center the task
    const taskLeftPx = task.start * pps
    const taskWidthPx = Math.max(2, (task.end - task.start) * pps)
    const taskCenterPx = taskLeftPx + taskWidthPx / 2
    const viewportW = hscroll.clientWidth
    // Target scroll: center the task in the viewport (account for 130px agent label)
    const targetScrollLeft = Math.max(0, taskCenterPx - (viewportW - 130) / 2)

    // 3. Set horizontal scroll on ALL hscroll containers (centralized sync)
    store.markProgrammaticScroll()
    store.syncScrollAll(null, targetScrollLeft)

    // 4. Scroll the track vertically into view in .timeline-scroll
    const timelineScroll = document.querySelector('.timeline-scroll')
    if (timelineScroll) {
      // Find the agent lane within this track to scroll to the correct vertical position
      const agentRows = trackEl.querySelectorAll('.agent-row-wrap')
      let targetRow = null

      // Find the row for the matching agent
      agentRows.forEach(row => {
        const nameEl = row.querySelector('.lane-agent-name')
        if (nameEl && nameEl.textContent.trim() === agent) {
          targetRow = row
        }
      })

      const scrollTarget = targetRow || trackEl
      const containerRect = timelineScroll.getBoundingClientRect()
      const targetRect = scrollTarget.getBoundingClientRect()

      // Check if the target is already visible
      const isVisible = targetRect.top >= containerRect.top && targetRect.bottom <= containerRect.bottom
      if (!isVisible) {
        // Scroll the target to the center of the visible area
        const targetCenter = targetRect.top + targetRect.height / 2
        const containerCenter = containerRect.top + containerRect.height / 2
        const scrollDelta = targetCenter - containerCenter
        timelineScroll.scrollBy({ top: scrollDelta, behavior: 'smooth' })
      }
    }
  })
}

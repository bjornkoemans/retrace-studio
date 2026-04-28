/**
 * Search autocomplete suggestions.
 * Returns matching suggestions based on the current raw text input,
 * including data-driven suggestions (task names, agent names) from loaded tracks.
 */
import { useTimelineStore } from '../stores/timelineStore'

const FILTER_SUGGESTIONS = [
  { label: 'wait:', description: 'Waiting time (assigned → start)', insert: 'wait:', trigger: /^w/i },
  { label: 'wacht:', description: 'Wachttijd (NL)', insert: 'wacht:', trigger: /^w/i },
  { label: 'waiting:', description: 'Waiting time (full)', insert: 'waiting:', trigger: /^wa/i },
  { label: 'sojourn:', description: 'Sojourn time (assigned → end)', insert: 'sojourn:', trigger: /^s/i },
  { label: 'service:', description: 'Service time (start → end)', insert: 'service:', trigger: /^se/i },
  { label: 'doorloop:', description: 'Doorlooptijd (NL)', insert: 'doorloop:', trigger: /^d/i },
  { label: 'duration:', description: 'Duration filter', insert: 'duration:', trigger: /^du/i },
  { label: 'dur:', description: 'Duration (short)', insert: 'dur:', trigger: /^du/i },
]

const OPERATOR_SUGGESTIONS = [
  { label: '>',  description: 'Greater than', insert: '>' },
  { label: '>=', description: 'Greater than or equal', insert: '>=' },
  { label: '<',  description: 'Less than', insert: '<' },
  { label: '<=', description: 'Less than or equal', insert: '<=' },
]

const UNIT_SUGGESTIONS = [
  { label: 's', description: 'Seconds' },
  { label: 'm', description: 'Minutes' },
  { label: 'h', description: 'Hours' },
]

// ── Data-driven suggestions cache ──
let _cachedTracks = null
let _cachedTaskNames = []
let _cachedAgentNames = []

function refreshDataCache(tracks) {
  if (tracks === _cachedTracks) return
  _cachedTracks = tracks
  const taskSet = new Set()
  const agentSet = new Set()
  for (const tr of tracks) {
    for (const t of tr.tasks) {
      if (t.taskName) taskSet.add(t.taskName)
      if (t.agent) agentSet.add(t.agent)
    }
  }
  _cachedTaskNames = [...taskSet].sort()
  _cachedAgentNames = [...agentSet].sort()
}

function getDataSuggestions(text) {
  const lower = text.toLowerCase()
  const results = []

  // Match task names (fuzzy: includes)
  for (const name of _cachedTaskNames) {
    if (name.toLowerCase().includes(lower)) {
      results.push({
        label: name,
        description: 'Task',
        insert: name,
        category: 'task',
      })
    }
    if (results.length >= 5) break
  }

  // Match agent names (fuzzy: includes)
  for (const name of _cachedAgentNames) {
    if (name.toLowerCase().includes(lower)) {
      results.push({
        label: name,
        description: 'Agent',
        insert: name,
        category: 'agent',
      })
    }
    if (results.length >= 8) break
  }

  return results
}

/**
 * Extract the last "word" from the input text for suggestion matching.
 * Returns { prefix: "previous words ", current: "lastWord" }
 */
function splitLastWord(text) {
  const lastSpace = text.lastIndexOf(' ')
  if (lastSpace === -1) return { prefix: '', current: text }
  return { prefix: text.slice(0, lastSpace + 1), current: text.slice(lastSpace + 1) }
}

/**
 * Get autocomplete suggestions for the current text.
 * Suggestions are based on the last word being typed, so users can
 * combine multiple terms (e.g., "Technician-000002 Contact doctor").
 *
 * @param {string} text - Current raw text in the input (after chips)
 * @returns {Array<{ label: string, description: string, insert: string, category: string }>}
 */
export function getSuggestions(text) {
  if (!text || !text.trim()) return []
  const t = text.trim()

  // Refresh data cache from store
  try {
    const store = useTimelineStore()
    refreshDataCache(store.tracks)
  } catch { /* store not ready */ }

  // For filter prefix building (wait:, operators, units), use the full text
  // since these are always the first/only token

  // After a prefix like "wait:" — suggest operators
  const prefixDone = t.match(/^(wait|waiting|wacht|sojourn|doorloop|service|duration|dur)\s*:\s*$/i)
  if (prefixDone) {
    return OPERATOR_SUGGESTIONS.map(s => ({
      ...s,
      insert: t + s.insert,
      category: 'operator',
    }))
  }

  // After prefix + operator + number without unit: suggest units
  const needsUnit = t.match(/^(?:(?:wait|waiting|wacht|sojourn|doorloop|service|duration|dur)\s*:\s*)?(?:>=?|<=?)\s*(\d+(?:\.\d+)?)$/i)
  if (needsUnit) {
    const num = needsUnit[1]
    return UNIT_SUGGESTIONS.map(s => ({
      label: `${num}${s.label}`,
      description: s.description,
      insert: t + s.label,
      category: 'unit',
    }))
  }

  // Bare number without unit (e.g., user typed "30" after operator context)
  const bareNum = t.match(/^(>=?|<=?)\s*(\d+(?:\.\d+)?)$/i)
  if (bareNum) {
    const prefix = bareNum[1]
    const num = bareNum[2]
    return UNIT_SUGGESTIONS.map(s => ({
      label: `${prefix}${num}${s.label}`,
      description: s.description,
      insert: `${prefix}${num}${s.label}`,
      category: 'unit',
    }))
  }

  // For text suggestions, use the LAST WORD being typed
  // This allows combining terms: "Technician-000002 Contact" → suggest based on "Contact"
  const { prefix: prevWords, current: lastWord } = splitLastWord(t)

  if (!lastWord) return []

  if (/^[a-z]/i.test(lastWord) && !lastWord.includes(':') && !lastWord.includes('>') && !lastWord.includes('<')) {
    const results = []

    // Filter prefix matches (only when it's the first word and short)
    if (!prevWords && lastWord.length <= 8) {
      const prefixMatches = FILTER_SUGGESTIONS.filter(s => s.trigger.test(lastWord) && s.label.toLowerCase().startsWith(lastWord.toLowerCase()))
      for (const s of prefixMatches) {
        results.push({
          label: s.label,
          description: s.description,
          insert: s.insert,
          category: 'prefix',
        })
      }
    }

    // Data suggestions (task names, agent names) — require 2+ chars
    if (lastWord.length >= 2) {
      const dataMatches = getDataSuggestions(lastWord)
      // Prepend previous words to the insert value
      for (const m of dataMatches) {
        results.push({
          ...m,
          insert: prevWords + m.insert,
        })
      }
    }

    return results.slice(0, 8)
  }

  return []
}

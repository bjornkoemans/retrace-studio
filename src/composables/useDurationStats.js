import { computed } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { workingSecondsBetween } from '../utils/workSchedule'

/**
 * Compute duration distributions from loaded tracks.
 * For each track, groups task durations by (taskName, agent).
 */
export function useDurationStats() {
  const store = useTimelineStore()

  /**
   * Get the effective display name for a task.
   * Falls back to "Task <id>" if taskName is empty.
   */
  function effectiveName(t) {
    return t.taskName || `Task ${t.taskId}`
  }

  /**
   * Returns a map: trackId → { taskNames: string[], agents: string[] }
   */
  const trackOptions = computed(() => {
    const result = {}
    for (const track of store.tracks) {
      const taskNames = new Set()
      const agents = new Set()
      for (const t of track.tasks) {
        taskNames.add(effectiveName(t))
        agents.add(t.agent)
      }
      result[track.id] = {
        taskNames: [...taskNames].sort(),
        agents: ['All agents', ...[...agents].sort()],
      }
    }
    return result
  })

  /**
   * Get durations for a specific track, filtered by taskName and optionally agent.
   * Returns array of { duration, workingDuration, absStart, absEnd, agent, caseId }
   */
  function getDurations(trackId, taskName, agent) {
    const track = store.tracks.find(t => t.id === trackId)
    if (!track) return []
    return track.tasks
      .filter(t => {
        if (effectiveName(t) !== taskName) return false
        if (agent && agent !== 'All agents' && t.agent !== agent) return false
        return true
      })
      .map(t => {
        const calendarDuration = t.end - t.start
        // Compute working hours duration from absolute timestamps
        const wd = (t.absStart && t.absEnd)
          ? workingSecondsBetween(t.absStart, t.absEnd)
          : calendarDuration
        return {
          duration: calendarDuration,
          workingDuration: (isNaN(wd) || wd <= 0) ? calendarDuration : wd,
          agent: t.agent,
          caseId: t.caseId,
        }
      })
      .filter(d => d.duration > 0)
  }

  /**
   * Compute histogram bins from an array of durations.
   * @param {Array} durations - Array of { duration, workingDuration, agent, caseId }
   * @param {number} numBins - Number of histogram bins
   * @param {boolean} useWorkHours - If true, use working hours durations
   * @returns {{ bins, stats, nTotal, nRemoved }}
   */
  function computeHistogram(durations, numBins = 20, useWorkHours = false) {
    if (durations.length === 0) {
      return { bins: [], stats: { mean: 0, median: 0, std: 0, min: 0, max: 0, n: 0 }, nTotal: 0, nRemoved: 0 }
    }

    const allValues = durations
      .map(d => useWorkHours ? d.workingDuration : d.duration)
      .filter(v => v > 0)
      .sort((a, b) => a - b)

    const nTotal = allValues.length
    const values = allValues
    const nRemoved = 0
    const n = values.length
    if (n === 0) {
      return { bins: [], stats: { mean: 0, median: 0, std: 0, min: 0, max: 0, n: 0 }, nTotal, nRemoved }
    }

    const min = values[0]
    const max = values[n - 1]
    const mean = values.reduce((s, v) => s + v, 0) / n
    const median = n % 2 === 0
      ? (values[n / 2 - 1] + values[n / 2]) / 2
      : values[Math.floor(n / 2)]
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n
    const std = Math.sqrt(variance)

    // Compute bins
    const range = max - min
    if (range === 0) {
      return {
        bins: [{ x0: min - 0.5, x1: max + 0.5, count: n }],
        stats: { mean, median, std, min, max, n },
        nTotal, nRemoved,
      }
    }

    const binWidth = range / numBins
    const bins = []
    for (let i = 0; i < numBins; i++) {
      bins.push({
        x0: min + i * binWidth,
        x1: min + (i + 1) * binWidth,
        count: 0,
      })
    }

    for (const v of values) {
      let idx = Math.floor((v - min) / binWidth)
      if (idx >= numBins) idx = numBins - 1
      bins[idx].count++
    }

    return { bins, stats: { mean, median, std, min, max, n }, nTotal, nRemoved }
  }

  return {
    trackOptions,
    getDurations,
    computeHistogram,
  }
}

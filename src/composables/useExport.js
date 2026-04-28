import { useTimelineStore } from '../stores/timelineStore'
import { computeTrackStats } from './useProcessMiningStats'
import { fmtDur, fmtPct, fmtNum } from '../utils/formatStats'
import { fmtTimePrecise } from '../utils/formatTime'

export function useExport() {
  const store = useTimelineStore()

  /**
   * Export the current timeline view as PNG.
   * Dynamically imports html2canvas to keep bundle size small.
   */
  async function exportPNG() {
    store.showToast('Rendering screenshot...')
    try {
      const { default: html2canvas } = await import('html2canvas')
      const target = document.querySelector('.timeline-scroll')
      if (!target) { store.showToast('Nothing to export'); return }
      const canvas = await html2canvas(target, {
        backgroundColor: null,
        scale: 2,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = 'retrace-timeline.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
      store.showToast('Screenshot saved!')
    } catch (e) {
      store.showToast('Export failed — html2canvas may not be installed')
    }
  }

  /**
   * Export statistics for all tracks as CSV.
   */
  function exportStatsCSV() {
    const rows = []
    store.tracks.forEach(track => {
      const stats = computeTrackStats(track)
      if (!stats) return
      rows.push({
        Track: track.title,
        Cases: stats.nCases,
        Tasks: stats.nTasks,
        Resources: stats.nResources,
        Activities: stats.nActivities,
        'Duration (s)': Math.round(stats.totalDuration),
        'Cycle Time Avg (s)': Math.round(stats.cycleTime.avg),
        'Cycle Time Min (s)': Math.round(stats.cycleTime.min),
        'Cycle Time Max (s)': Math.round(stats.cycleTime.max),
        'Processing Time Avg (s)': Math.round(stats.processingTime.avg),
        'Waiting Time Avg (s)': Math.round(stats.waitingTime.avg),
        'Flow Efficiency Avg (%)': fmtNum(stats.flowEfficiency.avg),
        'Utilization Avg (%)': fmtNum(stats.resourceUtilization.avg),
        'Arrival Rate (cases/hr)': fmtNum(stats.arrivalRate),
        'Avg WIP': fmtNum(stats.avgWIP),
      })
    })
    if (rows.length === 0) { store.showToast('No tracks to export'); return }
    const headers = Object.keys(rows[0])
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h]}"`).join(','))].join('\n')
    downloadFile('retrace-stats.csv', csv, 'text/csv')
    store.showToast('Statistics exported!')
  }

  /**
   * Export annotations and bookmarks as JSON.
   */
  function exportAnnotations() {
    const data = {
      annotations: store.annotations.map(a => ({
        time: a.time,
        timeFormatted: fmtTimePrecise(a.time),
        text: a.text,
        trackId: a.trackId,
      })),
      bookmarks: store.bookmarks.map(b => ({
        time: b.time,
        timeFormatted: fmtTimePrecise(b.time),
        label: b.label,
      })),
      exportedAt: new Date().toISOString(),
    }
    downloadFile('retrace-annotations.json', JSON.stringify(data, null, 2), 'application/json')
    store.showToast('Annotations exported!')
  }

  /**
   * Generate a shareable link encoding the current view state.
   */
  function generateShareLink() {
    const state = {
      pps: store.pxPerSecond,
      ph: Math.round(store.playheadTime),
      iso: store.isolatedCaseId,
      q: store.searchQuery || undefined,
      vm: store.viewMode !== 'timeline' ? store.viewMode : undefined,
    }
    // Remove undefined values
    Object.keys(state).forEach(k => state[k] === undefined && delete state[k])
    const encoded = btoa(JSON.stringify(state))
    const url = `${window.location.origin}${window.location.pathname}#state=${encoded}`
    navigator.clipboard.writeText(url).then(
      () => store.showToast('Link copied to clipboard!'),
      () => store.showToast('Could not copy link')
    )
    return url
  }

  /**
   * Restore view state from URL hash.
   */
  function restoreFromHash() {
    const hash = window.location.hash
    if (!hash || !hash.includes('state=')) return
    try {
      const encoded = hash.split('state=')[1]
      const state = JSON.parse(atob(encoded))
      if (state.pps) store.pxPerSecond = state.pps
      if (state.ph) store.playheadTime = state.ph
      if (state.iso !== undefined) store.isolatedCaseId = state.iso
      if (state.q) store.searchQuery = state.q
      if (state.vm) store.viewMode = state.vm
      window.location.hash = ''
    } catch (e) { /* invalid hash, ignore */ }
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return { exportPNG, exportStatsCSV, exportAnnotations, generateShareLink, restoreFromHash }
}

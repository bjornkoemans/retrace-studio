import { caseColor } from '../utils/colors'

/**
 * Draw the heatmap overview on a canvas context.
 * Uses its own pixels-per-second scale that fits the full duration into the canvas width.
 * Each agent gets a thin horizontal row; tasks are drawn as colored rectangles.
 */
export function drawHeatmap(ctx, opts) {
  const {
    agents, track, store,
    canvasW, canvasH,
    rowHeight, heatmapPps,
    hoveredAgentIdx,
  } = opts

  const dpr = window.devicePixelRatio || 1
  const iso = store.isolatedCaseId
  const searchActive = store.highlightedTaskKeys.size > 0
  const dimAlpha = store.dimOpacity
  const showWait = store.showWait
  const idx = track._agentIndex

  // Get CSS variable colors for backgrounds
  const styles = getComputedStyle(document.documentElement)
  const stripeBg = styles.getPropertyValue('--lane-stripe').trim() || 'rgba(0,0,0,0.02)'
  const highlightBg = styles.getPropertyValue('--heatmap-row-highlight')?.trim() || 'rgba(93,173,226,0.15)'

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, canvasW, canvasH)

  for (let ai = 0; ai < agents.length; ai++) {
    const agent = agents[ai]
    const y = ai * rowHeight
    const h = rowHeight - 1 // 1px gap between rows

    // Alternating stripe background
    if (ai % 2 === 0) {
      ctx.fillStyle = stripeBg
      ctx.fillRect(0, y, canvasW, rowHeight)
    }

    // Hovered row highlight
    if (ai === hoveredAgentIdx) {
      ctx.fillStyle = highlightBg
      ctx.fillRect(0, y, canvasW, rowHeight)
    }

    // Draw tasks
    const tasks = idx ? (idx.get(agent) || []) : []
    for (let ti = 0; ti < tasks.length; ti++) {
      const t = tasks[ti]
      if (!store.showZeroDuration && t.end - t.start <= 0) continue

      // Dimming logic
      const taskKey = `${track.id}-${t.caseId}-${t.taskId}-${t.agent}`
      const active = track.activeCases.has(t.caseId)
      const isIsolated = iso !== null && t.caseId === iso
      const highlighted = searchActive && store.highlightedTaskKeys.has(taskKey)
      const searchDimmed = searchActive && !highlighted
      const dimmed = searchDimmed || !active || (iso !== null && !isIsolated)

      // Wait block (simplified, semi-transparent)
      if (showWait && t.waiting > 1) {
        const wx = (t.start - t.waiting) * heatmapPps
        const ww = Math.max(1, t.waiting * heatmapPps)
        const c = caseColor(t.caseId)
        ctx.globalAlpha = dimmed ? dimAlpha * 0.5 : 0.15
        ctx.fillStyle = c
        ctx.fillRect(wx, y, ww, h)
        ctx.globalAlpha = 1
      }

      // Task block — minimum 2px wide so tasks are always visible
      const x = t.start * heatmapPps
      const w = Math.max(2, (t.end - t.start) * heatmapPps)

      ctx.globalAlpha = dimmed ? dimAlpha : 0.85
      ctx.fillStyle = caseColor(t.caseId)
      ctx.fillRect(x, y, w, h)
      ctx.globalAlpha = 1
    }
  }

  ctx.restore()
}

/**
 * Hit-test: given mouse coordinates relative to the canvas,
 * find which agent row and optionally which task is under the cursor.
 */
export function hitTest(mouseX, mouseY, opts) {
  const { agents, track, store, rowHeight, heatmapPps } = opts
  const idx = track._agentIndex

  const agentIndex = Math.floor(mouseY / rowHeight)
  if (agentIndex < 0 || agentIndex >= agents.length) return null

  const agent = agents[agentIndex]
  const tasks = idx ? (idx.get(agent) || []) : []

  // Linear scan for task at this time position
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    if (!store.showZeroDuration && t.end - t.start <= 0) continue
    const tx = t.start * heatmapPps
    const tw = Math.max(2, (t.end - t.start) * heatmapPps)
    if (mouseX >= tx && mouseX <= tx + tw) {
      return { agent, agentIndex, task: t }
    }
  }

  return { agent, agentIndex, task: null }
}

/**
 * Draw a simple time axis at the top of the heatmap.
 */
export function drawTimeAxis(ctx, opts) {
  const { canvasW, axisH, totalDuration, heatmapPps } = opts
  const dpr = window.devicePixelRatio || 1

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, canvasW, axisH)

  const styles = getComputedStyle(document.documentElement)
  const textColor = styles.getPropertyValue('--text-muted')?.trim() || '#999'
  const lineColor = styles.getPropertyValue('--lane-border')?.trim() || '#eee'

  // Calculate nice tick interval
  const targetTicks = Math.floor(canvasW / 80) // ~80px between ticks
  const rawInterval = totalDuration / Math.max(1, targetTicks)

  // Round to nice intervals (1m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 24h, 2d, 7d, 14d, 30d)
  const niceIntervals = [60, 300, 900, 1800, 3600, 7200, 14400, 28800, 43200, 86400, 172800, 604800, 1209600, 2592000]
  let interval = niceIntervals[niceIntervals.length - 1]
  for (let i = 0; i < niceIntervals.length; i++) {
    if (niceIntervals[i] >= rawInterval) { interval = niceIntervals[i]; break }
  }

  ctx.fillStyle = textColor
  ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.textAlign = 'center'
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 0.5

  for (let t = 0; t <= totalDuration; t += interval) {
    const x = t * heatmapPps
    if (x > canvasW) break

    // Tick line
    ctx.beginPath()
    ctx.moveTo(x, axisH - 8)
    ctx.lineTo(x, axisH)
    ctx.stroke()

    // Label
    const label = fmtDurationCompact(t)
    ctx.fillText(label, x, axisH - 10)
  }

  // Bottom line
  ctx.beginPath()
  ctx.moveTo(0, axisH - 0.5)
  ctx.lineTo(canvasW, axisH - 0.5)
  ctx.stroke()

  ctx.restore()
}

function fmtDurationCompact(seconds) {
  if (seconds < 3600) {
    return Math.floor(seconds / 60) + 'm'
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
  }
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  return h > 0 ? `${d}d${h}h` : `${d}d`
}

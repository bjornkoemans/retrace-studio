import { watch, onMounted, onBeforeUnmount } from 'vue'

/**
 * Canvas-based lane renderer — replaces hundreds of TaskBlock DOM nodes
 * with a single <canvas> per agent lane.
 *
 * The canvas covers the visible viewport + a large buffer (1500px each side).
 * During normal scrolling, the canvas moves naturally with the scroll container
 * and is only repositioned/redrawn when the viewport drifts far enough from the
 * last draw position that the buffer would run out. This means most scroll frames
 * require zero canvas work.
 */
export function useLaneRenderer(canvasRef, props, store, opts) {
  let rafId = null
  let dpr = 1
  // Track the viewport position of the last draw, so we can skip redraws
  // when the scroll is still within the buffer zone.
  let _lastDrawVpLeft = -Infinity
  let _lastDrawVpWidth = 0
  let _lastDrawPps = 0

  // ── Drawing ──────────────────────────────────────────────────────────

  function draw() {
    rafId = null
    const canvas = canvasRef.value
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    dpr = window.devicePixelRatio || 1
    const laneH = store.laneHeight
    const pps = store.pxPerSecond

    // Canvas covers the viewport + large buffer, not the full track.
    // The large buffer (1500px) means the canvas only needs to be redrawn
    // when the user scrolls >800px from the last draw position.
    const BUFFER = 1500
    const vpLeft = Math.max(0, store.viewportLeft - BUFFER)
    const vpRight = store.viewportLeft + store.viewportWidth + BUFFER
    const canvasW = vpRight - vpLeft
    const canvasH = laneH

    // Track draw position for smart-redraw checks
    _lastDrawVpLeft = store.viewportLeft
    _lastDrawVpWidth = store.viewportWidth
    _lastDrawPps = pps

    // Position the canvas at the viewport's left edge
    canvas.style.left = vpLeft + 'px'
    canvas.style.width = canvasW + 'px'
    canvas.style.height = canvasH + 'px'

    // Resize physical pixels
    const physW = Math.round(canvasW * dpr)
    const physH = Math.round(canvasH * dpr)
    if (canvas.width !== physW || canvas.height !== physH) {
      canvas.width = physW
      canvas.height = physH
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvasW, canvasH)

    // Translate so we can use world-space coordinates
    // (task positions in px) → canvas-local by subtracting vpLeft
    const offsetX = -vpLeft

    const blockH = store.blockHeight
    const blockT = store.blockTop
    const showWait = store.showWait
    const showLabels = store.showLabels
    const showCollabBorder = store.showCollabBorder
    const isolated = store.isolatedCaseId !== null
    const isolatedCaseId = store.isolatedCaseId
    const dimOp = store.dimOpacity
    const searchActive = store.highlightedTaskKeys.size > 0
    const hlKeys = store.highlightedTaskKeys
    const selectedTask = store.selectedTask
    const trackId = props.track.id
    const activeCases = props.track.activeCases

    const tasks = opts.tasks.value

    // Two-pass rendering: wait blocks first (background), then task blocks on top.
    // This ensures task blocks always paint over wait blocks, matching original
    // DOM z-index behaviour (wait z-index:5, task z-index:10).

    // ── Pass 1: Wait blocks (behind everything) ──
    if (showWait) {
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i]
        if (!(t.waiting > 1)) continue
        const taskStartPx = t.start * pps
        if (taskStartPx < vpLeft - t.waiting * pps) continue  // entire wait block off-screen left
        const waitLeft = (t.start - t.waiting) * pps
        if (waitLeft > vpRight) continue

        const color = opts.caseColor(t.caseId)
        const active = activeCases.has(t.caseId)
        const isIsolated = isolated && t.caseId === isolatedCaseId
        const dimmed = !active || (isolated && !isIsolated)
        const taskKey = `${trackId}-${t.caseId}-${t.taskId}-${t.agent}`
        const searchDimmed = searchActive && !hlKeys.has(taskKey)
        const isDimmed = searchDimmed || dimmed

        const wLeft = waitLeft + offsetX
        const wRight = taskStartPx + offsetX  // wait block ends exactly at task start
        const wWidth = wRight - wLeft
        if (wWidth < 1) continue

        ctx.save()
        // Clip to wait block bounds so stripes/border never bleed outside
        ctx.beginPath()
        ctx.rect(wLeft, blockT, wWidth, blockH)
        ctx.clip()

        ctx.globalAlpha = isDimmed ? dimOp : 0.15
        ctx.fillStyle = color
        ctx.fillRect(wLeft, blockT, wWidth, blockH)
        // Diagonal stripes
        ctx.globalAlpha = isDimmed ? dimOp * 0.5 : 0.12
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let sx = 0; sx < wWidth + blockH; sx += 6) {
          ctx.moveTo(wLeft + sx, blockT)
          ctx.lineTo(wLeft + sx - blockH, blockT + blockH)
        }
        ctx.stroke()
        // Dashed border
        ctx.globalAlpha = isDimmed ? dimOp : 0.25
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.strokeRect(wLeft + 0.5, blockT + 0.5, wWidth - 1, blockH - 1)
        ctx.setLineDash([])
        ctx.restore()
      }
    }

    // ── Pass 2: Task blocks (on top of wait blocks) ──
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]
      const taskRight = t.end * pps
      if (taskRight < vpLeft) continue
      const taskLeft = t.start * pps
      if (taskLeft > vpRight) continue

      const color = opts.caseColor(t.caseId)
      const active = activeCases.has(t.caseId)
      const isIsolated = isolated && t.caseId === isolatedCaseId
      const dimmed = !active || (isolated && !isIsolated)

      const taskKey = `${trackId}-${t.caseId}-${t.taskId}-${t.agent}`
      const highlighted = searchActive && hlKeys.has(taskKey)
      const searchDimmed = searchActive && !highlighted
      const isDimmed = searchDimmed || dimmed

      const focused = selectedTask &&
        selectedTask.caseId === t.caseId &&
        selectedTask.taskId === t.taskId &&
        selectedTask.agent === t.agent &&
        selectedTask.trackId === trackId

      const bLeft = taskLeft + offsetX
      const rawW = (t.end - t.start) * pps
      const bWidth = rawW < 4 ? 6 : rawW  // zero/tiny-duration tasks get visible min width

      ctx.save()
      ctx.globalAlpha = isDimmed ? dimOp : 1

      // Background
      ctx.fillStyle = color
      const radius = Math.min(4, bWidth / 2)
      roundRect(ctx, bLeft, blockT, bWidth, blockH, radius)
      ctx.fill()

      // Border
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'
      ctx.lineWidth = 1
      roundRect(ctx, bLeft + 0.5, blockT + 0.5, bWidth - 1, blockH - 1, radius)
      ctx.stroke()

      // Collab dashed border
      if (t.isCollab && showCollabBorder) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        roundRect(ctx, bLeft + 1, blockT + 1, bWidth - 2, blockH - 2, radius)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Search highlight glow
      if (highlighted) {
        ctx.shadowColor = getComputedAccent()
        ctx.shadowBlur = 8
        ctx.strokeStyle = getComputedAccent()
        ctx.lineWidth = 2
        roundRect(ctx, bLeft, blockT, bWidth, blockH, radius)
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // Focus ring
      if (focused) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        roundRect(ctx, bLeft - 1, blockT - 1, bWidth + 2, blockH + 2, radius + 1)
        ctx.stroke()
        ctx.strokeStyle = getComputedAccent()
        ctx.lineWidth = 2
        roundRect(ctx, bLeft - 3, blockT - 3, bWidth + 6, blockH + 6, radius + 2)
        ctx.stroke()
      }

      // Label
      if (showLabels && bWidth > 22) {
        const label = bWidth > 45
          ? `C${t.caseId}.T${t.taskId}`
          : `C${t.caseId}`
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 9px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'rgba(0,0,0,0.3)'
        ctx.shadowOffsetY = 1
        ctx.shadowBlur = 1
        // Clip text to block width
        ctx.save()
        ctx.beginPath()
        ctx.rect(bLeft, blockT, bWidth, blockH)
        ctx.clip()
        ctx.fillText(label, bLeft + bWidth / 2, blockT + blockH / 2, bWidth - 4)
        ctx.restore()
        ctx.shadowBlur = 0
        ctx.shadowOffsetY = 0
      }

      ctx.restore()
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  let _accentColor = null
  function getComputedAccent() {
    if (!_accentColor) {
      _accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-primary').trim() || '#6366f1'
    }
    return _accentColor
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2
    if (h < 2 * r) r = h / 2
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  // ── Hit testing (find task at canvas coordinate) ────────────────────

  function hitTest(canvasX) {
    // canvasX is relative to the canvas element's left edge.
    // Convert to world-space by adding the canvas's actual position (set at last draw).
    // IMPORTANT: use _lastDrawVpLeft, NOT store.viewportLeft — between redraws the
    // canvas stays at its last-drawn position while the viewport continues scrolling.
    const BUFFER = 1500
    const drawVp = _lastDrawVpLeft === -Infinity ? store.viewportLeft : _lastDrawVpLeft
    const vpLeft = Math.max(0, drawVp - BUFFER)
    const worldX = canvasX + vpLeft

    const pps = store.pxPerSecond
    const tasks = opts.tasks.value

    // Reverse iteration: later tasks are drawn on top
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i]
      const left = t.start * pps
      const rawW = (t.end - t.start) * pps
      const width = rawW < 4 ? 6 : rawW
      if (worldX >= left && worldX <= left + width) {
        return t
      }
    }
    return null
  }

  // ── Scheduling ──────────────────────────────────────────────────────

  function scheduleDraw() {
    if (rafId) return
    rafId = requestAnimationFrame(draw)
  }

  /**
   * Only schedule a redraw if the viewport has moved far enough that the
   * existing canvas buffer would run out. During normal scrolling most
   * frames skip the redraw entirely — the canvas just rides the native
   * scroll for free.
   */
  function scheduleDrawIfNeeded() {
    // Always redraw if we never drew, or zoom/resize changed
    if (_lastDrawVpLeft === -Infinity ||
        store.pxPerSecond !== _lastDrawPps ||
        store.viewportWidth !== _lastDrawVpWidth) {
      scheduleDraw()
      return
    }
    // Redraw when the viewport has scrolled past ~60% of the buffer
    // (BUFFER=1500, threshold=900). This gives a 600px safety margin.
    const drift = Math.abs(store.viewportLeft - _lastDrawVpLeft)
    if (drift > 900) {
      scheduleDraw()
    }
  }

  // Watch viewport position — uses smart threshold check
  const stopWatchViewport = watch(
    () => [store.viewportLeft, store.viewportWidth],
    scheduleDrawIfNeeded,
    { deep: false }
  )

  // Watch all other dependencies — always triggers a redraw
  const stopWatchOther = watch(
    () => [
      store.pxPerSecond,
      store.laneHeight,
      store.blockHeight,
      store.blockTop,
      store.showWait,
      store.showLabels,
      store.showCollabBorder,
      store.isolatedCaseId,
      store.dimOpacity,
      store.highlightedTaskKeys,
      store.selectedTask,
      props.width,
      opts.tasks.value,
    ],
    scheduleDraw,
    { deep: false }
  )

  onMounted(() => {
    // Listen for theme changes to reset accent color cache
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const resetAccent = () => { _accentColor = null; scheduleDraw() }
    mq.addEventListener('change', resetAccent)
    // Also observe class changes on <html> for manual dark mode toggle
    const obs = new MutationObserver(() => { _accentColor = null; scheduleDraw() })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    scheduleDraw()

    onBeforeUnmount(() => {
      if (rafId) cancelAnimationFrame(rafId)
      stopWatchViewport()
      stopWatchOther()
      mq.removeEventListener('change', resetAccent)
      obs.disconnect()
    })
  })

  return { scheduleDraw, hitTest }
}

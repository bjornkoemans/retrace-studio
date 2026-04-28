import { ref } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'

export function usePlayback() {
  const store = useTimelineStore()
  let playRAF = null
  let lastFrameTime = 0

  function togglePlay() {
    store.isPlaying = !store.isPlaying
    if (store.isPlaying) {
      // Re-enable auto-follow when playback starts
      store.autoFollow = true
      lastFrameTime = performance.now()
      playRAF = requestAnimationFrame(playTick)
    } else {
      cancelAnimationFrame(playRAF)
    }
  }

  function playTick(now) {
    if (!store.isPlaying) return
    const dt = (now - lastFrameTime) / 1000
    lastFrameTime = now
    store.playheadTime += dt * store.playbackSpeed

    if (store.playheadTime >= store.globalMaxDuration) {
      store.playheadTime = store.globalMaxDuration
      store.isPlaying = false
    }

    // Auto-scroll: lock playhead at 50% of viewport, every frame
    if (store.isPlaying && store.autoFollow) {
      followPlayhead()
    }

    if (store.isPlaying) playRAF = requestAnimationFrame(playTick)
  }

  function followPlayhead() {
    const playheadPx = store.playheadTime * store.pxPerSecond
    const vpLeft = store.viewportLeft
    const vpWidth = store.viewportWidth - 130 // effective scrollable width (minus sticky label)
    const halfVp = vpWidth * 0.5

    // Only kick in once playhead crosses the 50% mark
    if (playheadPx <= vpLeft + halfVp) return

    // Pin playhead exactly at 50% by setting scrollLeft every frame
    const targetScrollLeft = playheadPx - halfVp

    store.markProgrammaticScroll()
    store.syncScrollAll(null, targetScrollLeft)
  }

  function stopPlayback() {
    store.isPlaying = false
    cancelAnimationFrame(playRAF)
  }

  return { togglePlay, stopPlayback }
}

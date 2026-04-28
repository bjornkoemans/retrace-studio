<script setup>
import { ref, provide, onMounted, onUnmounted } from 'vue'
import { useTimelineStore } from './stores/timelineStore'
import { usePlayback } from './composables/usePlayback'
import { useTheme } from './composables/useTheme'
import { useSearch } from './composables/useSearch'
import { useKeyboardNav } from './composables/useKeyboardNav'
import { useExport } from './composables/useExport'
import AppHeader from './components/AppHeader.vue'
import ImportOverlay from './components/ImportOverlay.vue'
import SettingsOverlay from './components/SettingsOverlay.vue'
import LegendBar from './components/LegendBar.vue'
import TimelinePanel from './components/TimelinePanel.vue'
import ComparisonStudio from './components/ComparisonOverlay.vue'
import PlaybackBar from './components/PlaybackBar.vue'
import TaskTooltip from './components/TaskTooltip.vue'
import ToastNotification from './components/ToastNotification.vue'
import AnnotationPanel from './components/AnnotationPanel.vue'
import ExportOverlay from './components/ExportOverlay.vue'
import DurationDistributionPanel from './components/DurationDistributionPanel.vue'
import ControlFlowStudio from './components/ControlFlowStudio.vue'
import OnboardingTour from './components/OnboardingTour.vue'

const store = useTimelineStore()
const { togglePlay } = usePlayback()
const { initTheme } = useTheme()
const { selectNextTask, selectNextAgent } = useKeyboardNav()
const { restoreFromHash } = useExport()

// Activate search watcher
useSearch()

// Toggle: set to true to disable the 1000px minimum width check
const DISABLE_MIN_WIDTH = true
if (DISABLE_MIN_WIDTH) document.body.classList.add('no-min-width')

const importOpen = ref(false)
const settingsOpen = ref(false)
const annotationsOpen = ref(false)
const exportOpen = ref(false)
const distributionOpen = ref(false)
const compareOpen = ref(false)
const controlFlowOpen = ref(false)

provide('importOpen', importOpen)
provide('settingsOpen', settingsOpen)
provide('annotationsOpen', annotationsOpen)
provide('exportOpen', exportOpen)
provide('distributionOpen', distributionOpen)
provide('compareOpen', compareOpen)
provide('controlFlowOpen', controlFlowOpen)

const SCRUB_STEP = 10
const SCRUB_STEP_LARGE = 60
const SPEED_STEPS = [60, 120, 300, 600, 1800, 3600]
const SPEED_LABELS = ['1 min/s', '2 min/s', '5 min/s', '10 min/s', '30 min/s', '1 hr/s']

function changeSpeed(dir) {
  const i = SPEED_STEPS.indexOf(store.playbackSpeed)
  const cur = i === -1 ? 0 : i
  const next = Math.max(0, Math.min(SPEED_STEPS.length - 1, cur + dir))
  store.playbackSpeed = SPEED_STEPS[next]
  store.showToast('Speed: ' + SPEED_LABELS[next])
}

function anyOverlayOpen() {
  return importOpen.value || settingsOpen.value || annotationsOpen.value || exportOpen.value || distributionOpen.value || compareOpen.value || controlFlowOpen.value
}

function onKeydown(e) {
  if (e.target.matches('input, select, textarea')) return

  if (anyOverlayOpen()) {
    if (e.key === 'Escape') {
      importOpen.value = false
      settingsOpen.value = false
      annotationsOpen.value = false
      exportOpen.value = false
      distributionOpen.value = false
      compareOpen.value = false
      controlFlowOpen.value = false
    }
    return
  }

  // Keyboard navigation: Tab for task nav, Up/Down for agent nav (when task selected)
  if (store.enableKeyboardNav && store.selectedTask) {
    if (e.code === 'Tab') {
      e.preventDefault()
      selectNextTask(e.shiftKey ? -1 : 1)
      return
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault()
      selectNextAgent(-1)
      return
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault()
      selectNextAgent(1)
      return
    }
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault()
      togglePlay()
      break
    case 'ArrowLeft':
      e.preventDefault()
      store.playheadTime = Math.max(0, store.playheadTime - (e.shiftKey ? SCRUB_STEP_LARGE : SCRUB_STEP))
      break
    case 'ArrowRight':
      e.preventDefault()
      store.playheadTime = Math.min(store.globalMaxDuration, store.playheadTime + (e.shiftKey ? SCRUB_STEP_LARGE : SCRUB_STEP))
      break
    case 'ArrowUp':
      e.preventDefault()
      changeSpeed(1)
      break
    case 'ArrowDown':
      e.preventDefault()
      changeSpeed(-1)
      break
    case 'Home':
      e.preventDefault()
      store.playheadTime = 0
      break
    case 'End':
      e.preventDefault()
      store.playheadTime = store.globalMaxDuration
      break
    case 'KeyC':
      if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); store.clearIsolation() }
      break
    case 'KeyI':
      if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); importOpen.value = true }
      break
    case 'KeyB':
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        store.addBookmark(store.playheadTime)
      }
      break
    case 'KeyD':
      if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); distributionOpen.value = true }
      break
    case 'KeyR':
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        compareOpen.value = !compareOpen.value
      }
      break
    case 'KeyF':
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        controlFlowOpen.value = !controlFlowOpen.value
      }
      break
    case 'KeyE':
      if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); exportOpen.value = true }
      break
    case 'KeyS':
      if (!e.ctrlKey && !e.metaKey) {
        // Toggle stats handled in TrackStats via S key
      }
      break
    case 'Comma':
      if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); settingsOpen.value = true }
      break
    case 'KeyZ':
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); store.undo() }
      break
    case 'Escape':
      store.clearIsolation()
      store.clearSelection()
      break
    case 'Slash':
      if (!e.shiftKey) {
        e.preventDefault()
        document.querySelector('.search-bar input')?.focus()
      }
      break
    case 'Digit1': store.playbackSpeed = 60; store.showToast('Speed: 1 min/s'); break
    case 'Digit2': store.playbackSpeed = 120; store.showToast('Speed: 2 min/s'); break
    case 'Digit3': store.playbackSpeed = 300; store.showToast('Speed: 5 min/s'); break
    case 'Digit4': store.playbackSpeed = 600; store.showToast('Speed: 10 min/s'); break
    case 'Digit5': store.playbackSpeed = 1800; store.showToast('Speed: 30 min/s'); break
    case 'Digit6': store.playbackSpeed = 3600; store.showToast('Speed: 1 hr/s'); break
    case 'Equal':
    case 'NumpadAdd':
      e.preventDefault()
      store.pxPerSecond = Math.min(3, +(store.pxPerSecond + 0.1).toFixed(1))
      break
    case 'Minus':
    case 'NumpadSubtract':
      e.preventDefault()
      store.pxPerSecond = Math.max(0.1, +(store.pxPerSecond - 0.1).toFixed(1))
      break
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  initTheme()
  await store.restoreTracks()
  store.restoreAnnotations()
  restoreFromHash()
})
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="app-shell">
    <!-- Minimum width fallback -->
    <div class="min-width-fallback">
      <div class="fallback-content">
        <svg class="fallback-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        <h2>Resize your window</h2>
        <p>RETrace Studio requires a screen width of at least 1000px.</p>
      </div>
    </div>
    <div class="app-container">
      <AppHeader />
      <div class="main">
        <div class="timeline-panel">
          <LegendBar v-if="store.tracks.length > 0 && (store.showLegend || store.showMarkerLegend)" />
          <TimelinePanel />
          <PlaybackBar v-if="store.tracks.length > 0" />
        </div>
      </div>
    </div>
    <ImportOverlay />
    <SettingsOverlay />
    <AnnotationPanel />
    <ExportOverlay />
    <DurationDistributionPanel />
    <ComparisonStudio />
    <ControlFlowStudio />
    <TaskTooltip />
    <ToastNotification />
    <OnboardingTour />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--app-shell-bg);
  color: var(--text-primary);
}
.app-shell {
  width: 100vw;
  height: 100vh;
  background: var(--app-shell-bg);
  padding: var(--app-container-padding);
  overflow: hidden;
}
.app-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: var(--app-container-radius);
  overflow: hidden;
  background: var(--bg-primary);
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.1);
}
.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.timeline-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 100%;
  position: relative;
}

/* ── Minimum width fallback ── */
.min-width-fallback {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: var(--bg-primary);
  align-items: center;
  justify-content: center;
}
@media (max-width: 999px) {
  body:not(.no-min-width) .min-width-fallback {
    display: flex;
  }
  body:not(.no-min-width) .app-container {
    display: none !important;
  }
}
.fallback-content {
  text-align: center;
  padding: 32px;
  max-width: 360px;
}
.fallback-icon {
  width: 48px;
  height: 48px;
  color: var(--accent-primary);
  margin-bottom: 16px;
}
.fallback-content h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.fallback-content p {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}
</style>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { usePlayback } from '../composables/usePlayback'
import { fmtTime } from '../utils/formatTime'

const store = useTimelineStore()
const { togglePlay } = usePlayback()

// Zoom
function zoomBy(delta) {
  const newPps = Math.round((store.pxPerSecond + delta) * 10) / 10
  preserveScrollOnZoom(Math.max(0.1, Math.min(3, newPps)))
}
function onZoom(e) {
  preserveScrollOnZoom(parseFloat(e.target.value))
}
function preserveScrollOnZoom(newPps) {
  const oldPps = store.pxPerSecond
  const vpLeft = store.viewportLeft
  const vpWidth = store.viewportWidth
  let scrollTime = 0
  if (oldPps > 0) {
    const centerX = vpLeft + vpWidth / 2 - 130
    scrollTime = centerX / oldPps
  }
  store.pxPerSecond = newPps
  nextTick(() => {
    const newScrollLeft = Math.max(0, scrollTime * newPps - vpWidth / 2 + 130)
    store.syncScrollAll(null, newScrollLeft)
  })
}

const speedOptions = [
  { value: 60, label: '1x' },
  { value: 120, label: '2x' },
  { value: 300, label: '5x' },
  { value: 600, label: '10x' },
  { value: 1800, label: '30x' },
  { value: 3600, label: '60x' },
]

const currentSpeedLabel = computed(() => {
  const opt = speedOptions.find(o => o.value === store.playbackSpeed)
  return opt ? opt.label : '1x'
})

const speedMenuOpen = ref(false)

function setSpeed(val) {
  store.playbackSpeed = val
  speedMenuOpen.value = false
}

function onScrub(e) {
  store.playheadTime = parseFloat(e.target.value)
}

const progress = computed(() => {
  if (!store.globalMaxDuration) return 0
  return (store.playheadTime / store.globalMaxDuration) * 100
})
</script>

<template>
  <div class="playback-pill">
    <!-- Play/Pause -->
    <button class="play-btn" :class="{ playing: store.isPlaying }" @click="togglePlay" :title="store.isPlaying ? 'Pause' : 'Play'">
      <svg v-if="!store.isPlaying" viewBox="0 0 16 16" fill="currentColor" class="play-icon"><path d="M4.5 2.5l9 5.5-9 5.5z"/></svg>
      <svg v-else viewBox="0 0 16 16" fill="currentColor" class="play-icon"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>
    </button>

    <!-- Scrub slider -->
    <div class="scrub-wrap">
      <input
        type="range"
        :min="0"
        :max="Math.ceil(store.globalMaxDuration)"
        :value="store.playheadTime"
        step="1"
        @input="onScrub"
        class="scrub-slider"
        :style="{ '--progress': progress + '%' }"
      />
    </div>

    <!-- Time -->
    <span class="time-label">{{ fmtTime(store.playheadTime) }}</span>

    <!-- Speed selector -->
    <div class="speed-wrap">
      <button class="speed-btn" @click="speedMenuOpen = !speedMenuOpen">{{ currentSpeedLabel }}</button>
      <div v-if="speedMenuOpen" class="speed-backdrop" @click="speedMenuOpen = false"></div>
      <div v-if="speedMenuOpen" class="speed-menu">
        <button
          v-for="opt in speedOptions"
          :key="opt.value"
          class="speed-option"
          :class="{ active: store.playbackSpeed === opt.value }"
          @click="setSpeed(opt.value)"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div class="pill-sep"></div>

    <!-- Zoom controls -->
    <div class="zoom-controls">
      <button class="zoom-btn" @click="zoomBy(-0.1)" title="Zoom out">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 6h7"/></svg>
      </button>
      <input type="range" min="0.1" max="3" step="0.1" :value="store.pxPerSecond" @input="onZoom" class="zoom-slider" />
      <button class="zoom-btn" @click="zoomBy(0.1)" title="Zoom in">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2.5v7M2.5 6h7"/></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.playback-pill {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 5px;
  background: var(--surface-overlay);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 12px;
  box-shadow: var(--shadow-xl);
  z-index: 50;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Play button */
.play-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--accent-primary);
  color: #fff;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s ease, transform 0.15s ease;
}
.play-btn:hover {
  transform: scale(1.08);
}
.play-btn:active {
  transform: scale(0.95);
}
.play-btn.playing {
  background: var(--accent-danger);
}
.play-icon {
  width: 11px;
  height: 11px;
}
/* Shift play triangle slightly right for optical centering */
.play-btn:not(.playing) .play-icon {
  margin-left: 1.5px;
}

/* Scrub slider */
.scrub-wrap {
  width: 200px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.scrub-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--header-btn-border);
  outline: none;
  cursor: pointer;
}
.scrub-slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--accent-primary) 0%,
    var(--accent-primary) var(--progress),
    var(--header-btn-border) var(--progress),
    var(--header-btn-border) 100%
  );
}
.scrub-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-primary);
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  margin-top: -4px;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.scrub-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

/* Time display */
.time-label {
  font-size: 11px;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  color: var(--surface-overlay-text);
  white-space: nowrap;
  min-width: 48px;
  opacity: 0.8;
}

/* Speed selector */
.speed-wrap {
  position: relative;
}
.speed-btn {
  padding: 3px 8px;
  border: 1px solid var(--surface-overlay-border);
  background: transparent;
  color: var(--surface-overlay-text);
  border-radius: 8px;
  cursor: pointer;
  font-size: 10px;
  font-weight: 600;
  font-family: 'SF Mono', ui-monospace, monospace;
  transition: background 0.15s ease;
}
.speed-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}
.speed-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 98;
}
.speed-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  background: var(--surface-overlay);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 10px;
  box-shadow: var(--shadow-xl);
  z-index: 99;
}
.speed-option {
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: var(--surface-overlay-text);
  font-size: 10px;
  font-weight: 500;
  font-family: 'SF Mono', ui-monospace, monospace;
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
  transition: background 0.1s ease;
}
.speed-option:hover {
  background: rgba(255, 255, 255, 0.08);
}
.speed-option.active {
  color: var(--accent-primary);
  font-weight: 700;
}

/* Pill separator */
.pill-sep {
  width: 1px;
  height: 16px;
  background: var(--surface-overlay-border);
  opacity: 0.5;
  flex-shrink: 0;
}

/* Zoom controls */
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}
.zoom-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--surface-overlay-text);
  border-radius: 8px;
  cursor: pointer;
  opacity: 0.6;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.zoom-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  opacity: 1;
}
.zoom-btn:active {
  transform: scale(0.9);
}
.zoom-btn svg {
  width: 11px;
  height: 11px;
}
.zoom-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 56px;
  height: 3px;
  background: var(--surface-overlay-border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  margin: 0;
}
.zoom-slider::-webkit-slider-runnable-track {
  height: 3px;
  background: var(--surface-overlay-border);
  border-radius: 2px;
}
.zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-primary);
  border: none;
  margin-top: -3.5px;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.zoom-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}
</style>

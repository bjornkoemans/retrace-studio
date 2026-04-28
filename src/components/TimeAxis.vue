<script setup>
import { computed, ref } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { fmtTime, fmtTimePrecise } from '../utils/formatTime'

const props = defineProps({
  track: { type: Object, required: true },
  width: { type: Number, required: true },
})

const store = useTimelineStore()

// Inline annotation input (positioned as fixed overlay)
const showAnnotationInput = ref(false)
const annotationInputX = ref(0)
const annotationInputY = ref(0)
const annotationInputTime = ref(0)
const annotationText = ref('')
const annotationInputRef = ref(null)

function submitAnnotation() {
  const text = annotationText.value.trim()
  if (text) {
    store.addAnnotation(annotationInputTime.value, text, props.track.id)
  }
  closeAnnotationInput()
}

function closeAnnotationInput() {
  showAnnotationInput.value = false
  annotationText.value = ''
}

function autoGrow(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function onInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitAnnotation()
  }
  if (e.key === 'Escape') {
    closeAnnotationInput()
  }
}

const ticks = computed(() => {
  const pps = store.pxPerSecond
  let interval
  if (pps > 5) interval = 60
  else if (pps > 1) interval = 300
  else if (pps > 0.3) interval = 600
  else interval = 1800

  const result = []
  for (let s = 0; s <= props.track.totalDuration; s += interval) {
    result.push({ time: s, left: s * pps })
  }
  return result
})

// Use a click timer to differentiate single from double click
let clickTimer = null

function onTicksClick(e) {
  // Ignore clicks on the annotation input
  if (e.target.closest('.annotation-input-wrap')) return

  if (clickTimer) {
    // Double-click detected — cancel the single click
    clearTimeout(clickTimer)
    clickTimer = null
    onTicksDblClick(e)
    return
  }
  // Delay single-click to see if a second click arrives
  const rect = e.currentTarget.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  clickTimer = setTimeout(() => {
    clickTimer = null
    store.playheadTime = Math.max(0, Math.min(clickX / store.pxPerSecond, store.globalMaxDuration))
  }, 250)
}

function onTicksDblClick(e) {
  if (!store.showAnnotations) return
  const rect = e.currentTarget.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const time = Math.max(0, clickX / store.pxPerSecond)

  // Position the input as fixed overlay at the click location
  // (can't use relative positioning — parent has overflow-y: hidden)
  annotationInputTime.value = time
  annotationInputX.value = e.clientX
  annotationInputY.value = rect.bottom + 4
  annotationText.value = ''
  showAnnotationInput.value = true

  // Focus the input after it renders
  setTimeout(() => {
    annotationInputRef.value?.focus()
  }, 0)
}

function onTicksMouseMove(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const hoverX = e.clientX - rect.left
  const hoverSec = Math.max(0, hoverX / store.pxPerSecond)

  document.querySelectorAll('.hoverhead').forEach((hh) => {
    hh.style.display = 'block'
    hh.style.left = hoverX + 130 + 'px'
  })

  const hoverTip = document.getElementById('hoverTip')
  if (hoverTip) {
    hoverTip.style.display = 'block'
    hoverTip.style.left = e.clientX + 'px'
    hoverTip.style.top = rect.bottom + 4 + 'px'
    hoverTip.textContent = fmtTimePrecise(hoverSec)
  }
}

function onTicksMouseLeave() {
  document.querySelectorAll('.hoverhead').forEach((hh) => {
    hh.style.display = 'none'
  })
  const hoverTip = document.getElementById('hoverTip')
  if (hoverTip) hoverTip.style.display = 'none'
}
</script>

<template>
  <div class="time-axis-row">
    <div class="time-axis-labels">Agent</div>
    <div
      class="time-axis-ticks"
      :style="{ width: width + 'px' }"
      @click="onTicksClick"
      @mousemove="onTicksMouseMove"
      @mouseleave="onTicksMouseLeave"
    >
      <div v-for="tick in ticks" :key="tick.time" class="tick" :style="{ left: tick.left + 'px' }">
        {{ fmtTime(tick.time) }}
      </div>
    </div>
    <!-- Annotation input: fixed overlay to avoid overflow clipping -->
    <Teleport to="body">
      <div v-if="showAnnotationInput" class="annotation-input-wrap" :style="{ left: annotationInputX + 'px', top: annotationInputY + 'px' }">
        <textarea
          ref="annotationInputRef"
          v-model="annotationText"
          class="annotation-input"
          placeholder="Annotation text… (Enter to save, Shift+Enter for new line)"
          rows="2"
          @input="autoGrow"
          @keydown="onInputKeydown"
          @blur="submitAnnotation"
        ></textarea>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.time-axis-row {
  display: flex;
  height: 24px;
  background: var(--axis-bg);
  border-bottom: 1px solid var(--axis-border);
  position: sticky;
  top: 0;
  z-index: 40;
}
.time-axis-labels {
  position: sticky;
  left: 0;
  width: 130px;
  min-width: 130px;
  background: var(--axis-bg);
  z-index: 41;
  border-right: 1px solid var(--axis-border);
  display: flex;
  align-items: center;
  padding-left: 8px;
  font-size: 10px;
  color: var(--axis-label-text);
}
.time-axis-ticks {
  position: relative;
  cursor: pointer;
}
.tick {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 1px solid var(--axis-border);
  font-size: 9px;
  color: var(--axis-tick-text);
  padding: 3px 0 0 3px;
}
</style>

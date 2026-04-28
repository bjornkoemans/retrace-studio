<script setup>
import { computed, ref } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { fmtTimePrecise } from '../utils/formatTime'

const props = defineProps({
  annotation: { type: Object, required: true },
})

const store = useTimelineStore()
const popoverOpen = ref(false)

const COLORS = {
  warning: 'var(--accent-warning)',
  primary: 'var(--accent-primary)',
  danger: 'var(--accent-danger)',
}

const lineColor = computed(() => COLORS[props.annotation.color] || COLORS.warning)
const leftPx = computed(() => props.annotation.time * store.pxPerSecond + 130 + 'px')
const timeLabel = computed(() => fmtTimePrecise(props.annotation.time))

const popoverX = ref(0)
const popoverY = ref(0)

function togglePopover(e) {
  e.stopPropagation()
  if (!popoverOpen.value) {
    // Position relative to click
    popoverX.value = e.clientX
    popoverY.value = e.clientY + 20
  }
  popoverOpen.value = !popoverOpen.value
}

function closePopover() {
  popoverOpen.value = false
}

function deleteAnnotation(e) {
  e.stopPropagation()
  store.removeAnnotation(props.annotation.id)
}

function jumpToTime(e) {
  e.stopPropagation()
  store.playheadTime = props.annotation.time
  store.scrollToTime(props.annotation.time)
}
</script>

<template>
  <div class="annotation-marker" :style="{ left: leftPx, borderLeftColor: lineColor }">
    <div class="annotation-flag" :style="{ background: lineColor }" @click="togglePopover">
      <svg viewBox="0 0 16 16" fill="currentColor" class="annotation-icon">
        <path d="M3.5 2A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0012.5 2h-9zM5 5h6v1H5V5zm0 2.5h6v1H5v-1zM5 10h4v1H5v-1z"/>
      </svg>
    </div>
    <!-- Popover + backdrop: teleported to body to avoid overflow clipping -->
    <Teleport to="body">
      <div v-if="popoverOpen" class="annotation-backdrop" @click="closePopover"></div>
      <div v-if="popoverOpen" class="annotation-popover" :style="{ left: popoverX + 'px', top: popoverY + 'px' }" @click.stop>
        <div class="popover-time" @click="jumpToTime">{{ timeLabel }}</div>
        <div class="popover-text">{{ annotation.text }}</div>
        <button class="popover-delete" @click="deleteAnnotation" title="Delete annotation">&times;</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.annotation-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 2px dashed;
  z-index: 32;
  pointer-events: none;
}
.annotation-flag {
  position: absolute;
  top: -2px;
  left: -1px;
  width: 18px;
  height: 18px;
  border-radius: 0 4px 4px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  cursor: pointer;
  opacity: 0.85;
}
.annotation-flag:hover {
  opacity: 1;
  transform: scale(1.1);
}
.annotation-icon {
  width: 11px;
  height: 11px;
  color: #fff;
}
</style>

<!-- Global styles for teleported popover + backdrop -->
<style>
.annotation-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 9990;
}
.annotation-popover {
  position: fixed;
  min-width: 160px;
  max-width: 280px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.25);
  padding: 8px 28px 8px 10px;
  z-index: 9991;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.popover-time {
  font-size: 9px;
  font-family: 'SF Mono', monospace;
  color: var(--accent-primary);
  cursor: pointer;
  font-weight: 600;
}
.popover-time:hover {
  text-decoration: underline;
}
.popover-text {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.4;
  word-break: break-word;
  white-space: pre-wrap;
}
.popover-delete {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
}
.popover-delete:hover {
  color: var(--accent-danger);
  background: rgba(255,0,0,0.08);
}
</style>

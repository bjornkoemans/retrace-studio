<script setup>
import { computed } from 'vue'
import { caseColor } from '../utils/colors'

const props = defineProps({
  tasks: { type: Array, required: true },
  currentTask: { type: Object, default: null },
  color: { type: String, default: null },
  width: { type: Number, default: 220 },
  height: { type: Number, default: 18 },
})

const caseDuration = computed(() => {
  if (props.tasks.length === 0) return 1
  const maxEnd = Math.max(...props.tasks.map(t => t.end))
  const minStart = Math.min(...props.tasks.map(t => t.start))
  return maxEnd - minStart || 1
})

const minStart = computed(() => {
  return Math.min(...props.tasks.map(t => t.start))
})

const bars = computed(() => {
  const dur = caseDuration.value
  const ms = minStart.value
  return props.tasks.map(t => {
    const x = ((t.start - ms) / dur) * props.width
    const w = Math.max(2, ((t.end - t.start) / dur) * props.width)
    const isCurrent = props.currentTask &&
      t.caseId === props.currentTask.caseId &&
      t.taskId === props.currentTask.taskId &&
      t.agent === props.currentTask.agent
    return { x, w, color: caseColor(t.caseId), isCurrent, task: t }
  })
})
</script>

<template>
  <svg :width="width" :height="height" class="mini-timeline">
    <rect
      x="0" y="0" :width="width" :height="height"
      fill="rgba(255,255,255,0.04)" rx="3"
    />
    <rect
      v-for="(bar, i) in bars"
      :key="i"
      :x="bar.x"
      :width="bar.w"
      y="2"
      :height="height - 4"
      :fill="bar.isCurrent ? '#ffffff' : bar.color"
      :opacity="bar.isCurrent ? 1 : 0.5"
      :stroke="bar.isCurrent ? bar.color : 'none'"
      :stroke-width="bar.isCurrent ? 2 : 0"
      rx="2"
    />
  </svg>
</template>

<style scoped>
.mini-timeline {
  display: block;
  margin-top: 4px;
  border-radius: 3px;
  overflow: hidden;
}
</style>

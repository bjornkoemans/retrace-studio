<script setup>
import { computed } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { useTooltip } from '../composables/useTooltip'
import { caseColor } from '../utils/colors'

const props = defineProps({
  task: { type: Object, required: true },
  track: { type: Object, required: true },
})

const store = useTimelineStore()
const { showTip, moveTip, hideTip } = useTooltip()

const active = computed(() => props.track.activeCases.has(props.task.caseId))
const isolated = computed(() => store.isolatedCaseId !== null)
const isIsolated = computed(() => isolated.value && props.task.caseId === store.isolatedCaseId)

// Search highlighting
const taskKey = computed(() => `${props.track.id}-${props.task.caseId}-${props.task.taskId}-${props.task.agent}`)
const searchActive = computed(() => store.highlightedTaskKeys.size > 0)
const highlighted = computed(() => searchActive.value && store.highlightedTaskKeys.has(taskKey.value))
const searchDimmed = computed(() => searchActive.value && !highlighted.value)

// Keyboard focus
const focused = computed(() => {
  const sel = store.selectedTask
  return sel && sel.caseId === props.task.caseId && sel.taskId === props.task.taskId && sel.agent === props.task.agent && sel.trackId === props.track.id
})

const dimmed = computed(() => {
  if (searchDimmed.value) return true
  return !active.value || (isolated.value && !isIsolated.value)
})

const color = computed(() => caseColor(props.task.caseId))

const blockStyle = computed(() => {
  const t = props.task
  const pps = store.pxPerSecond
  return {
    left: t.start * pps + 'px',
    width: Math.max(2, (t.end - t.start) * pps) + 'px',
    height: store.blockHeight + 'px',
    top: store.blockTop + 'px',
    background: color.value,
    zIndex: focused.value ? 25 : highlighted.value ? 22 : dimmed.value ? 1 : 10,
    opacity: dimmed.value ? store.dimOpacity : undefined,
  }
})

const showWaitBlock = computed(() => {
  return store.showWait && props.task.waiting > 1
})

const waitStyle = computed(() => {
  if (!showWaitBlock.value) return {}
  const t = props.task
  const pps = store.pxPerSecond
  const c = color.value
  return {
    left: (t.start - t.waiting) * pps + 'px',
    width: t.waiting * pps + 'px',
    height: store.blockHeight + 'px',
    top: store.blockTop + 'px',
    background: `linear-gradient(0deg, ${c}22, ${c}22), repeating-linear-gradient(45deg, transparent, transparent 3px, ${c}30 3px, ${c}30 6px)`,
    borderColor: c + '40',
    opacity: dimmed.value ? store.dimOpacity : undefined,
    zIndex: dimmed.value ? 0 : 5,
  }
})

const blockLabel = computed(() => {
  if (!store.showLabels) return ''
  const bw = (props.task.end - props.task.start) * store.pxPerSecond
  if (bw > 45) return `C${props.task.caseId}.T${props.task.taskId}`
  if (bw > 22) return `C${props.task.caseId}`
  return ''
})

const isCollab = computed(() => props.task.isCollab && store.showCollabBorder)

function onBlockClick(e) {
  e.stopPropagation()
  if (e.metaKey || e.ctrlKey) {
    // Ctrl/Cmd + click: select task for keyboard nav
    store.selectTask(props.task, props.track)
  } else {
    store.toggleIsolation(props.task.caseId)
  }
}

function onMouseEnter(e) {
  showTip(e, props.task, props.track)
}
</script>

<template>
  <!-- Wait block -->
  <div v-if="showWaitBlock" class="wait-block" :style="waitStyle"></div>

  <!-- Task block -->
  <div
    class="task-block"
    :class="{ collab: isCollab, dim: dimmed, highlighted: highlighted, focused: focused }"
    :style="blockStyle"
    @mouseenter="onMouseEnter"
    @mousemove="moveTip"
    @mouseleave="hideTip"
    @click="onBlockClick"
  >
    {{ blockLabel }}
  </div>
</template>

<style scoped>
.task-block {
  position: absolute;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  border: 1px solid var(--task-border);
  min-width: 2px;
  /* transition removed for perf — causes GPU layer per element with large datasets */
}
.task-block:hover {
  box-shadow: 0 2px 8px var(--task-shadow-hover);
  z-index: 20 !important;
  transform: scaleY(1.08);
}
.task-block.collab {
  border: 2px dashed var(--task-collab-border);
}
.task-block.highlighted {
  box-shadow: 0 0 0 2px var(--accent-primary), 0 0 8px var(--accent-primary);
}
.task-block.focused {
  outline: 2px solid #fff;
  outline-offset: 1px;
  box-shadow: 0 0 0 3px var(--accent-primary), 0 0 12px var(--accent-primary);
}
.wait-block {
  position: absolute;
  border-radius: 4px 0 0 4px;
  border: 1px dashed var(--wait-border);
  pointer-events: none;
}
</style>

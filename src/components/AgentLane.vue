<script setup>
import { computed, ref } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { useTooltip } from '../composables/useTooltip'
import { useLaneRenderer } from '../composables/useLaneRenderer'
import { caseColor } from '../utils/colors'
import { markerSvg, AT_LABELS } from '../utils/assignmentTypes'

const props = defineProps({
  track: { type: Object, required: true },
  agent: { type: String, required: true },
  width: { type: Number, required: true },
})

const store = useTimelineStore()
const { showTip, moveTip, hideTip } = useTooltip()

// Use agent index for O(1) lookup instead of filtering all tasks
const agentTasks = computed(() => {
  const idx = props.track._agentIndex
  const tasks = idx ? (idx.get(props.agent) || []) : props.track.tasks.filter((t) => t.agent === props.agent)
  if (store.showZeroDuration) return tasks
  return tasks.filter((t) => t.end - t.start > 0)
})

// Canvas ref + renderer
const canvasRef = ref(null)
const { hitTest } = useLaneRenderer(canvasRef, props, store, {
  tasks: agentTasks,
  caseColor,
})

// ── Assignment markers (kept as DOM — very few per lane) ──
const BUFFER_PX = 300
const assignMarkers = computed(() => {
  if (!store.showAssign) return []

  const pps = store.pxPerSecond
  const vpLeft = store.viewportLeft - BUFFER_PX
  const vpRight = store.viewportLeft + store.viewportWidth + BUFFER_PX
  const isolated = store.isolatedCaseId !== null
  const markers = []

  const tasks = agentTasks.value
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    if (!task.assignmentType && !task.absAssigned) continue
    const active = props.track.activeCases.has(task.caseId)
    const isIsolated = isolated && task.caseId === store.isolatedCaseId
    if (!active || (isolated && !isIsolated)) continue

    const px = task.assigned * pps
    if (px < vpLeft || px > vpRight) continue

    const color = caseColor(task.caseId)
    const type = task.assignmentType || 'assigned'
    const svg = markerSvg(type, color)

    let title = task.assignmentType
      ? (AT_LABELS[task.assignmentType] || task.assignmentType)
      : 'Assigned'
    if (store.showVolunteers && task.volunteerIds && task.volunteerIds.length > 0) {
      let volStr
      if (store.volFormat === 'names') {
        volStr = task.volunteerIds.map((id) => props.track.agentIdToName[id] || `Agent ${id}`).join(', ')
      } else {
        volStr = task.volunteerIds.join(', ')
      }
      title += '\nVolunteers: ' + volStr
    }

    markers.push({ px, svg, title, key: `${task.caseId}-${task.taskId}` })
  }

  markers.sort((a, b) => a.px - b.px)
  const groups = []
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i]
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && Math.abs(m.px - lastGroup[0].px) < 3) {
      lastGroup.push(m)
    } else {
      groups.push([m])
    }
  }

  const result = []
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]
    for (let i = 0; i < group.length; i++) {
      result.push({ ...group[i], left: group[i].px + i * 9 })
    }
  }

  return result
})

// ── Mouse interaction on canvas ──
function onCanvasMouseMove(e) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const task = hitTest(x)
  if (task) {
    canvas.style.cursor = 'pointer'
    showTip(e, task, props.track)
  } else {
    canvas.style.cursor = 'default'
    hideTip()
  }
}

function onCanvasMouseLeave() {
  hideTip()
}

function onCanvasClick(e) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const task = hitTest(x)
  if (task) {
    e.stopPropagation()
    if (e.metaKey || e.ctrlKey) {
      store.selectTask(task, props.track)
    } else {
      store.toggleIsolation(task.caseId)
    }
  } else {
    store.clearIsolation()
  }
}

function onLaneClick() {
  store.clearIsolation()
}

// Agent rename
const editingName = ref(false)
const editName = ref('')
const nameInputRef = ref(null)

function startRenameAgent() {
  editName.value = props.agent
  editingName.value = true
  setTimeout(() => nameInputRef.value?.select(), 0)
}

function saveAgentName() {
  if (editName.value.trim() && editName.value.trim() !== props.agent) {
    store.renameAgent(props.track.id, props.agent, editName.value)
  }
  editingName.value = false
}
</script>

<template>
  <div class="agent-row-wrap">
    <div class="agent-label">
      <span class="lane-drag-handle" title="Drag to reorder lane">&#x2807;</span>
      <input
        v-if="editingName"
        ref="nameInputRef"
        v-model="editName"
        class="lane-name-input"
        @keyup.enter="saveAgentName"
        @keyup.escape="editingName = false"
        @blur="saveAgentName"
      />
      <span v-else class="lane-agent-name" @dblclick="startRenameAgent" title="Double-click to rename">{{ agent }}</span>
    </div>
    <div
      class="agent-lane"
      :style="{ width: width + 'px', height: store.laneHeight + 'px' }"
      @click="onLaneClick"
    >
      <canvas
        ref="canvasRef"
        class="lane-canvas"
        @mousemove="onCanvasMouseMove"
        @mouseleave="onCanvasMouseLeave"
        @click="onCanvasClick"
      />
      <!-- Assignment markers (inline SVG — very few per lane) -->
      <span
        v-for="marker in assignMarkers"
        :key="'am-' + marker.key"
        class="am"
        :style="{ left: marker.left + 'px', top: (store.blockTop - 8) + 'px' }"
        :title="marker.title"
        v-html="marker.svg"
      />
    </div>
  </div>
</template>

<style scoped>
.agent-row-wrap {
  display: flex;
}
.agent-label {
  position: sticky;
  left: 0;
  width: 130px;
  min-width: 130px;
  z-index: 30;
  background: var(--lane-label-bg);
  border-right: 2px solid var(--lane-label-border);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--lane-label-text);
  flex-shrink: 0;
}
.lane-drag-handle {
  cursor: grab;
  color: var(--text-muted);
  font-size: 11px;
  user-select: none;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.agent-row-wrap:hover .lane-drag-handle {
  opacity: 0.5;
}
.lane-drag-handle:hover {
  opacity: 1 !important;
}
.lane-drag-handle:active {
  cursor: grabbing;
}
.lane-agent-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}
.lane-name-input {
  width: 90px;
  font-size: 11px;
  font-weight: 600;
  color: var(--lane-label-text);
  background: var(--bg-secondary, rgba(255,255,255,0.1));
  border: 1px solid var(--accent-primary);
  border-radius: 3px;
  padding: 0 4px;
  outline: none;
}
.agent-row-wrap:nth-child(even) .agent-label {
  background: var(--lane-label-bg-alt);
}
.agent-lane {
  position: relative;
  border-bottom: 1px solid var(--lane-border);
  contain: layout style paint;
}
.agent-row-wrap:nth-child(even) .agent-lane {
  background: var(--lane-stripe);
}
.lane-canvas {
  position: absolute;
  top: 0;
  /* left, width, height set dynamically by useLaneRenderer */
}
/* ── Assignment markers ── */
.am {
  position: absolute; z-index: 15;
  pointer-events: none; user-select: none;
  transform: translateX(-50%);
  line-height: 0;
}
</style>

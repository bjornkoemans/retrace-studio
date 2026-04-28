<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { useTooltip } from '../composables/useTooltip'
import { drawHeatmap, drawTimeAxis, hitTest } from '../composables/useHeatmapRenderer'
import { fmtTimePrecise } from '../utils/formatTime'
import AgentLane from './AgentLane.vue'

const props = defineProps({
  track: { type: Object, required: true },
})

const store = useTimelineStore()
const { showTip, moveTip, hideTip } = useTooltip()

const canvasRef = ref(null)
const axisRef = ref(null)
const containerRef = ref(null)
const hoveredAgentIdx = ref(-1)
const expandedAgent = ref(null)
const containerWidth = ref(800) // measured from DOM

const AXIS_H = 24 // time axis height in px
const rowHeight = computed(() => store.overviewRowHeight)
const trackWidth = computed(() => props.track.totalDuration * store.pxPerSecond)
const totalDuration = computed(() => props.track.totalDuration)

// Visible agents (same logic as TimelineTrack)
const orderedAgents = computed(() => props.track.agentOrder || props.track.agents)
const visibleAgents = computed(() => {
  const agents = orderedAgents.value
  if (store.showZeroDuration) return agents
  const idx = props.track._agentIndex
  if (idx) {
    return agents.filter(agent => {
      const agTasks = idx.get(agent)
      if (!agTasks) return false
      for (let i = 0; i < agTasks.length; i++) {
        if (agTasks[i].end - agTasks[i].start > 0) return true
      }
      return false
    })
  }
  return agents.filter(agent =>
    props.track.tasks.some(t => t.agent === agent && t.end - t.start > 0)
  )
})

const totalHeight = computed(() => visibleAgents.value.length * rowHeight.value)

// Label interval: show a name every ~20px of vertical space
const labelInterval = computed(() => Math.max(1, Math.floor(20 / rowHeight.value)))

// Heatmap uses its own scale: fit entire duration into the available canvas width
const canvasW = computed(() => Math.max(100, containerWidth.value - 130)) // minus label column
const heatmapPps = computed(() => {
  if (!totalDuration.value || totalDuration.value <= 0) return 1
  return canvasW.value / totalDuration.value
})

let rafId = null

function scheduleRedraw() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    redraw()
  })
}

function redraw() {
  const canvas = canvasRef.value
  const axisCanvas = axisRef.value
  if (!canvas) return

  const dpr = window.devicePixelRatio || 1
  const w = canvasW.value
  const lh = totalHeight.value

  // Main heatmap canvas
  canvas.width = w * dpr
  canvas.height = Math.max(1, lh) * dpr

  const ctx = canvas.getContext('2d')
  drawHeatmap(ctx, {
    agents: visibleAgents.value,
    track: props.track,
    store,
    canvasW: w,
    canvasH: lh,
    rowHeight: rowHeight.value,
    heatmapPps: heatmapPps.value,
    hoveredAgentIdx: hoveredAgentIdx.value,
  })

  // Time axis canvas
  if (axisCanvas) {
    axisCanvas.width = w * dpr
    axisCanvas.height = AXIS_H * dpr
    const axCtx = axisCanvas.getContext('2d')
    drawTimeAxis(axCtx, {
      canvasW: w,
      axisH: AXIS_H,
      totalDuration: totalDuration.value,
      heatmapPps: heatmapPps.value,
    })
  }
}

// Measure container width
let resizeObs = null

onMounted(() => {
  nextTick(() => {
    measureWidth()
    if (containerRef.value) {
      resizeObs = new ResizeObserver(measureWidth)
      resizeObs.observe(containerRef.value)
    }
    redraw()
  })
})

function measureWidth() {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.clientWidth
  }
}

onUnmounted(() => {
  if (resizeObs) resizeObs.disconnect()
  if (rafId) cancelAnimationFrame(rafId)
})

// Reactive redraws
watch(
  () => [
    store.isolatedCaseId, store.showWait,
    store.showZeroDuration, store.dimOpacity, store.overviewRowHeight,
    store.highlightedTaskKeys.size,
    props.track.agentOrder, props.track.activeCases,
    visibleAgents.value.length,
    canvasW.value, heatmapPps.value,
  ],
  scheduleRedraw
)

// Also redraw on hover changes
watch(hoveredAgentIdx, scheduleRedraw)

// Canvas mouse interactions
function getCanvasCoords(e) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return null
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function onCanvasMouseMove(e) {
  const coords = getCanvasCoords(e)
  if (!coords) return

  const hit = hitTest(coords.x, coords.y, {
    agents: visibleAgents.value,
    track: props.track,
    store,
    rowHeight: rowHeight.value,
    heatmapPps: heatmapPps.value,
  })

  if (hit) {
    hoveredAgentIdx.value = hit.agentIndex
    if (hit.task) {
      showTip(e, hit.task, props.track)
    } else {
      hideTip()
    }
  } else {
    hoveredAgentIdx.value = -1
    hideTip()
  }
}

function onCanvasMouseLeave() {
  hoveredAgentIdx.value = -1
  hideTip()
}

function onCanvasClick(e) {
  const coords = getCanvasCoords(e)
  if (!coords) return

  const hit = hitTest(coords.x, coords.y, {
    agents: visibleAgents.value,
    track: props.track,
    store,
    rowHeight: rowHeight.value,
    heatmapPps: heatmapPps.value,
  })

  if (hit) {
    if (hit.task) {
      store.toggleIsolation(hit.task.caseId)
    } else {
      expandedAgent.value = expandedAgent.value === hit.agent ? null : hit.agent
    }
  }
}

// Label hover tooltip
function onLabelEnter(e, agent) {
  const idx = props.track._agentIndex
  const tasks = idx ? (idx.get(agent) || []) : []
  let workTime = 0
  for (let i = 0; i < tasks.length; i++) workTime += tasks[i].end - tasks[i].start
  const util = ((workTime / (props.track.totalDuration || 1)) * 100).toFixed(1)

  const synth = {
    agent,
    caseId: `${tasks.length} tasks`,
    taskId: 0,
    taskName: `Util: ${util}% | Work: ${fmtTimePrecise(workTime)}`,
    start: 0, end: 0, assigned: 0, waiting: 0,
    absAssigned: '', absStart: '', absEnd: '',
  }
  showTip(e, synth, props.track)
}

function onLabelLeave() { hideTip() }

function onLabelClick(agent) {
  expandedAgent.value = expandedAgent.value === agent ? null : agent
}
</script>

<template>
  <div ref="containerRef" class="heatmap-container">
    <!-- Time axis row -->
    <div class="heatmap-axis-row">
      <div class="heatmap-axis-label">Agent</div>
      <canvas ref="axisRef" class="heatmap-axis-canvas"
        :style="{ width: canvasW + 'px', height: AXIS_H + 'px' }" />
    </div>
    <!-- Heatmap body -->
    <div class="heatmap-body" :style="{ height: totalHeight + 'px' }">
      <!-- Label column -->
      <div class="heatmap-labels" :style="{ height: totalHeight + 'px' }">
        <div
          v-for="(agent, i) in visibleAgents"
          :key="agent"
          class="heatmap-label-row"
          :class="{ hovered: hoveredAgentIdx === i, even: i % 2 === 0 }"
          :style="{ height: rowHeight + 'px' }"
          @mouseenter="onLabelEnter($event, agent)"
          @mousemove="moveTip"
          @mouseleave="onLabelLeave"
          @click="onLabelClick(agent)"
        >
          <span v-if="i % labelInterval === 0" class="heatmap-label-text">
            {{ agent.length > 12 ? agent.slice(0, 11) + '\u2026' : agent }}
          </span>
        </div>
      </div>
      <!-- Canvas -->
      <canvas
        ref="canvasRef"
        class="heatmap-canvas"
        :style="{ width: canvasW + 'px', height: totalHeight + 'px' }"
        @mousemove="onCanvasMouseMove"
        @mouseleave="onCanvasMouseLeave"
        @click="onCanvasClick"
      />
    </div>

    <!-- Expanded agent lane (scrolls with the normal timeline) -->
    <div v-if="expandedAgent" class="heatmap-expanded">
      <div class="heatmap-expanded-header">
        <span class="heatmap-expanded-name">{{ expandedAgent }}</span>
        <button class="heatmap-expanded-close" @click="expandedAgent = null">&times;</button>
      </div>
      <div class="heatmap-expanded-lane" :style="{ width: trackWidth + 130 + 'px' }">
        <AgentLane :track="track" :agent="expandedAgent" :width="trackWidth" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.heatmap-container {
  width: 100%;
}

/* Time axis row */
.heatmap-axis-row {
  display: flex;
  height: 24px;
  border-bottom: 1px solid var(--lane-border);
}

.heatmap-axis-label {
  width: 130px;
  min-width: 130px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  display: flex;
  align-items: flex-end;
  padding: 0 8px 2px;
  background: var(--lane-label-bg);
  border-right: 2px solid var(--lane-label-border);
}

.heatmap-axis-canvas {
  display: block;
}

/* Heatmap body */
.heatmap-body {
  display: flex;
}

.heatmap-labels {
  width: 130px;
  min-width: 130px;
  background: var(--lane-label-bg);
  border-right: 2px solid var(--lane-label-border);
  overflow: hidden;
}

.heatmap-label-row {
  display: flex;
  align-items: center;
  padding-left: 6px;
  cursor: pointer;
  overflow: hidden;
}

.heatmap-label-row.even {
  background: var(--lane-label-bg-alt);
}

.heatmap-label-row.hovered {
  background: var(--heatmap-row-highlight, rgba(93, 173, 226, 0.2));
}

.heatmap-label-text {
  font-size: 7px;
  font-weight: 600;
  color: var(--lane-label-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
}

.heatmap-canvas {
  display: block;
  cursor: crosshair;
}

/* Expanded agent detail */
.heatmap-expanded {
  border-top: 2px solid var(--accent-primary);
  background: var(--card-bg);
  overflow-x: auto;
}

.heatmap-expanded-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  background: var(--accent-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  position: sticky;
  left: 0;
}

.heatmap-expanded-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heatmap-expanded-close {
  background: none;
  border: none;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.heatmap-expanded-close:hover {
  opacity: 0.7;
}

.heatmap-expanded-lane {
  display: inline-flex;
  flex-direction: column;
  min-width: 100%;
}
</style>

<script setup>
import { computed, ref, watch } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { useCaseFlow } from '../composables/useCaseFlow'
import { caseColor } from '../utils/colors'
import { fmtTime } from '../utils/formatTime'

const store = useTimelineStore()

const selectedTrackIdx = ref(0)
const selectedTrack = computed(() => store.tracks[selectedTrackIdx.value] || store.tracks[0])

// Auto-select first case if none selected
watch(() => selectedTrack.value, (track) => {
  if (track && store.selectedCaseForFlow === null && track.caseIds.length > 0) {
    store.selectedCaseForFlow = track.caseIds[0]
  }
}, { immediate: true })

const { caseTasks, agents, caseStart, caseDuration, nodes, edges } = useCaseFlow(
  computed(() => selectedTrack.value),
  computed(() => store.selectedCaseForFlow)
)

const LANE_HEIGHT = 56
const LANE_PADDING = 8
const NODE_HEIGHT = 32
const HEADER_WIDTH = 140
const MARGIN_RIGHT = 40

const svgWidth = computed(() => {
  const contentWidth = 800
  return HEADER_WIDTH + contentWidth + MARGIN_RIGHT
})

const svgHeight = computed(() => {
  return agents.value.length * LANE_HEIGHT + 40
})

const contentWidth = computed(() => svgWidth.value - HEADER_WIDTH - MARGIN_RIGHT)

function nodeX(node) {
  return HEADER_WIDTH + (node.relStart / caseDuration.value) * contentWidth.value
}

function nodeW(node) {
  return Math.max(20, (node.duration / caseDuration.value) * contentWidth.value)
}

function nodeY(node) {
  return node.laneIndex * LANE_HEIGHT + LANE_PADDING + 20
}

function edgePath(edge) {
  const fromNode = nodes.value.find(n => n.id === edge.fromId)
  const toNode = nodes.value.find(n => n.id === edge.toId)
  if (!fromNode || !toNode) return ''
  const x1 = nodeX(fromNode) + nodeW(fromNode)
  const y1 = nodeY(fromNode) + NODE_HEIGHT / 2
  const x2 = nodeX(toNode)
  const y2 = nodeY(toNode) + NODE_HEIGHT / 2
  const mx = (x1 + x2) / 2
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
}
</script>

<template>
  <div class="caseflow-container">
    <div class="caseflow-toolbar">
      <div class="caseflow-selectors">
        <label>Track:</label>
        <select v-model.number="selectedTrackIdx">
          <option v-for="(t, i) in store.tracks" :key="t.id" :value="i">{{ t.title }}</option>
        </select>
        <label>Case:</label>
        <select v-model.number="store.selectedCaseForFlow">
          <option v-for="cid in (selectedTrack?.caseIds || [])" :key="cid" :value="cid">C{{ cid }}</option>
        </select>
      </div>
      <div class="caseflow-info" v-if="caseTasks.length > 0">
        {{ caseTasks.length }} tasks &middot; {{ agents.length }} agents &middot; {{ fmtTime(caseDuration) }}
      </div>
    </div>

    <div class="caseflow-scroll" v-if="caseTasks.length > 0">
      <svg :width="svgWidth" :height="svgHeight" class="caseflow-svg">
        <!-- Lane backgrounds -->
        <g v-for="(agent, i) in agents" :key="'lane-' + agent">
          <rect
            :x="0" :y="i * LANE_HEIGHT + 20"
            :width="svgWidth" :height="LANE_HEIGHT"
            :fill="i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'"
          />
          <line
            :x1="0" :y1="(i + 1) * LANE_HEIGHT + 20"
            :x2="svgWidth" :y2="(i + 1) * LANE_HEIGHT + 20"
            stroke="rgba(255,255,255,0.06)" stroke-width="1"
          />
          <text
            :x="8" :y="i * LANE_HEIGHT + 20 + LANE_HEIGHT / 2"
            fill="var(--surface-overlay-text-muted)"
            font-size="10" dominant-baseline="middle"
          >{{ agent }}</text>
        </g>

        <!-- Edges (connector arrows) -->
        <path
          v-for="(edge, i) in edges" :key="'e-' + i"
          :d="edgePath(edge)"
          fill="none"
          :stroke="edge.isBottleneck ? 'var(--accent-danger)' : 'var(--surface-overlay-text-muted)'"
          :stroke-width="edge.isBottleneck ? 2.5 : 1.5"
          :stroke-dasharray="edge.isBottleneck ? '6,3' : 'none'"
          opacity="0.6"
        />

        <!-- Nodes (task blocks) -->
        <g v-for="node in nodes" :key="node.id">
          <rect
            :x="nodeX(node)" :y="nodeY(node)"
            :width="nodeW(node)" :height="NODE_HEIGHT"
            :fill="caseColor(node.task.caseId)"
            rx="4"
            :stroke="store.selectedTask && store.selectedTask.taskId === node.task.taskId ? '#fff' : 'rgba(0,0,0,0.2)'"
            stroke-width="1"
            class="flow-node"
          />
          <text
            v-if="nodeW(node) > 30"
            :x="nodeX(node) + nodeW(node) / 2"
            :y="nodeY(node) + NODE_HEIGHT / 2"
            fill="#fff" font-size="9" font-weight="700"
            text-anchor="middle" dominant-baseline="middle"
            style="text-shadow: 0 1px 1px rgba(0,0,0,0.3); pointer-events: none;"
          >T{{ node.task.taskId }}</text>
        </g>

        <!-- Wait time labels on bottleneck edges -->
        <text
          v-for="(edge, i) in edges.filter(e => e.isBottleneck)" :key="'wt-' + i"
          :x="(() => { const fn = nodes.find(n => n.id === edge.fromId); const tn = nodes.find(n => n.id === edge.toId); return fn && tn ? (nodeX(fn) + nodeW(fn) + nodeX(tn)) / 2 : 0 })()"
          :y="(() => { const fn = nodes.find(n => n.id === edge.fromId); const tn = nodes.find(n => n.id === edge.toId); return fn && tn ? (nodeY(fn) + nodeY(tn)) / 2 + NODE_HEIGHT / 2 - 4 : 0 })()"
          fill="var(--accent-danger)" font-size="8" font-weight="600"
          text-anchor="middle"
        >{{ fmtTime(edge.waitTime) }}</text>
      </svg>
    </div>

    <div v-else class="caseflow-empty">
      Select a track and case to view the flow diagram.
    </div>
  </div>
</template>

<style scoped>
.caseflow-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
}
.caseflow-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-secondary);
}
.caseflow-selectors {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}
.caseflow-selectors select {
  padding: 3px 8px;
  font-size: 11px;
  border: 1px solid var(--border-primary);
  border-radius: 5px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  outline: none;
}
.caseflow-info {
  font-size: 11px;
  color: var(--text-muted);
}
.caseflow-scroll {
  flex: 1;
  overflow: auto;
  padding: 16px;
}
.caseflow-svg {
  display: block;
}
.flow-node {
  cursor: pointer;
  transition: opacity 0.12s;
}
.flow-node:hover {
  opacity: 0.85;
}
.caseflow-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-dim);
  font-size: 14px;
}
</style>

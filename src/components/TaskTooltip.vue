<script setup>
import { useTimelineStore } from '../stores/timelineStore'
import { useTooltip } from '../composables/useTooltip'
import { fmtAbsTime } from '../utils/formatTime'
import { fmtDur } from '../utils/formatStats'
import { caseColor } from '../utils/colors'
import { markerSvg, AT_LABELS, AT_COLORS } from '../utils/assignmentTypes'
import MiniTimeline from './MiniTimeline.vue'

const store = useTimelineStore()
const { tipState, tooltipEl } = useTooltip()

function volDisplay(task, track) {
  if (!task.volunteerIds || task.volunteerIds.length === 0) return ''
  if (store.volFormat === 'names') {
    return task.volunteerIds.map((id) => track.agentIdToName[id] || `Agent ${id}`).join(', ')
  }
  return task.volunteerIds.join(', ')
}

function taskLabel(t) {
  if (!t) return ''
  return `C${t.caseId}.T${t.taskId} (${t.agent})`
}
</script>

<template>
  <!-- Hover tip (time) -->
  <div id="hoverTip" class="hoverhead-tip"></div>

  <!-- Task tooltip -->
  <div ref="tooltipEl" class="tooltip" :class="{ vis: tipState.visible }" :style="{ left: tipState.x + 'px', top: tipState.y + 'px' }">
    <template v-if="tipState.task">
      <div class="tip-header">C{{ tipState.task.caseId }}.T{{ tipState.task.taskId }}: {{ tipState.task.taskName }}</div>
      <div class="tip-section">
        <div class="tip-section-label">Agent</div>
        <div>{{ tipState.task.agent }}</div>
        <div v-if="tipState.task.isCollab" class="tip-collab-line">
          Collab: <span class="tip-collab-agents">{{ tipState.task.allAgents }}</span>
        </div>
      </div>
      <div class="tip-section">
        <div class="tip-section-label">Timing</div>
        <div class="tip-row"><span class="tip-key">Assigned</span><span class="tip-val">{{ fmtAbsTime(tipState.task.absAssigned) }}</span></div>
        <div class="tip-row"><span class="tip-key">Start</span><span class="tip-val">{{ fmtAbsTime(tipState.task.absStart) }}</span></div>
        <div class="tip-row"><span class="tip-key">End</span><span class="tip-val">{{ fmtAbsTime(tipState.task.absEnd) }}</span></div>
        <div class="tip-row"><span class="tip-key">Duration</span><span class="tip-val">{{ ((tipState.task.end - tipState.task.start) / 60).toFixed(1) }} min</span></div>
        <div class="tip-row"><span class="tip-key">Waiting</span><span class="tip-val">{{ (tipState.task.waiting / 60).toFixed(1) }} min</span></div>
      </div>
      <!-- Case Summary -->
      <div v-if="tipState.caseSummary" class="tip-section">
        <div class="tip-section-label">Case {{ tipState.task.caseId }} Summary</div>
        <div class="tip-row"><span class="tip-key">Start</span><span class="tip-val">{{ fmtAbsTime(tipState.caseSummary.absStart) }}</span></div>
        <div class="tip-row"><span class="tip-key">End</span><span class="tip-val">{{ fmtAbsTime(tipState.caseSummary.absEnd) }}</span></div>
        <div class="tip-row"><span class="tip-key">Throughput</span><span class="tip-val">{{ fmtDur(tipState.caseSummary.throughput) }}</span></div>
        <div class="tip-row"><span class="tip-key">Processing</span><span class="tip-val">{{ fmtDur(tipState.caseSummary.processing) }}</span></div>
        <div class="tip-row"><span class="tip-key">Waiting</span><span class="tip-val">{{ fmtDur(tipState.caseSummary.waiting) }}</span></div>
      </div>

      <div v-if="tipState.task.assignmentType" class="tip-section">
        <div class="tip-section-label">Assignment</div>
        <div class="tip-at-row">
          <span class="tip-at-icon" v-html="markerSvg(tipState.task.assignmentType, AT_COLORS[tipState.task.assignmentType] || '#999', 11)"></span>
          <span :style="{ color: AT_COLORS[tipState.task.assignmentType] || '#999' }">{{ AT_LABELS[tipState.task.assignmentType] || tipState.task.assignmentType }}</span>
        </div>
        <div v-if="store.showVolunteers && tipState.task.volunteerIds?.length > 0" class="tip-collab-line">
          Volunteers: <span class="tip-collab-agents">{{ volDisplay(tipState.task, tipState.track) }}</span>
        </div>
      </div>

      <!-- Predecessors / Successors -->
      <div v-if="store.showPredecessors && (tipState.predecessor || tipState.successor)" class="tip-section">
        <div class="tip-section-label">Predecessors / Successors</div>
        <div v-if="tipState.predecessor" class="tip-row">
          <span class="tip-key">Prev</span>
          <span class="tip-val tip-flow-val">{{ taskLabel(tipState.predecessor) }}</span>
        </div>
        <div v-if="tipState.successor" class="tip-row">
          <span class="tip-key">Next</span>
          <span class="tip-val tip-flow-val">{{ taskLabel(tipState.successor) }}</span>
        </div>
      </div>

      <!-- Concurrent Agents -->
      <div v-if="store.showConcurrentAgents && tipState.concurrentAgents.length > 0" class="tip-section">
        <div class="tip-section-label">Concurrent on Case</div>
        <div class="tip-concurrent">{{ tipState.concurrentAgents.join(', ') }}</div>
      </div>

      <!-- Mini Timeline -->
      <div v-if="store.showMiniTimeline && tipState.caseTimeline.length > 1" class="tip-section tip-mini-section">
        <div class="tip-section-label">Case Timeline</div>
        <MiniTimeline
          :tasks="tipState.caseTimeline"
          :currentTask="tipState.task"
          :color="caseColor(tipState.task.caseId)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.hoverhead-tip {
  display: none;
  position: fixed;
  z-index: 500;
  background: var(--surface-overlay);
  color: var(--surface-overlay-text);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  font-family: 'SF Mono', monospace;
  box-shadow: var(--shadow-md);
  transform: translateX(-50%);
}
.tooltip {
  display: none;
  position: fixed;
  z-index: 500;
  background: var(--surface-overlay);
  color: var(--surface-overlay-text);
  padding: 0;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.5;
  pointer-events: none;
  max-width: 320px;
  max-height: calc(100vh - 8px);
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}
.tooltip.vis {
  display: block;
}
.tip-header {
  padding: 8px 12px;
  background: var(--surface-overlay-header);
  font-weight: 700;
  font-size: 12px;
  color: var(--surface-overlay-text);
}
.tip-section {
  padding: 6px 12px;
  border-top: 1px solid var(--surface-overlay-border);
}
.tip-section:first-of-type {
  border-top: none;
}
.tip-section-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--surface-overlay-text-muted);
  margin-bottom: 2px;
}
.tip-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.tip-key {
  color: var(--surface-overlay-text-muted);
  flex-shrink: 0;
}
.tip-val {
  color: var(--surface-overlay-text);
  text-align: right;
}
.tip-flow-val {
  font-size: 10px;
  opacity: 0.85;
}
.tip-collab-line {
  color: var(--surface-overlay-text-muted);
  margin-top: 2px;
}
.tip-collab-agents {
  color: var(--surface-overlay-text);
}
.tip-concurrent {
  font-size: 10px;
  color: var(--surface-overlay-text);
  opacity: 0.85;
}
.tip-mini-section {
  padding-bottom: 8px;
}
.tip-at-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tip-at-icon {
  display: inline-flex;
  flex-shrink: 0;
  line-height: 0;
}
</style>

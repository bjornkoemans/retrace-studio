<script setup>
import { ref, computed } from 'vue'
import { computeTrackStats } from '../composables/useProcessMiningStats'
import { fmtDur, fmtPct, fmtNum } from '../utils/formatStats'
import { DEFAULT_WORK_DAYS } from '../utils/workSchedule'
import { useTimelineStore } from '../stores/timelineStore'

const props = defineProps({
  track: { type: Object, required: true },
})

const store = useTimelineStore()

const workSchedule = computed(() => {
  if (!store.wsEnabled) return null
  return {
    enabled: true,
    startH: store.wsStartH,
    endH: store.wsEndH,
    workDays: DEFAULT_WORK_DAYS,
  }
})

const stats = computed(() => computeTrackStats(props.track, workSchedule.value))

const expanded = ref({
  overview: true,
  cycleTime: true,
  processingTime: true,
  waitingTime: true,
  idleTime: true,
  flowEfficiency: false,
  serviceTime: false,
  resource: false,
  process: false,
})

function toggleSection(key) {
  expanded.value[key] = !expanded.value[key]
}
</script>

<template>
  <div v-if="stats" class="track-stats">
    <!-- Work Schedule toggle -->
    <div class="ws-bar">
      <label class="ws-toggle">
        <input type="checkbox" v-model="store.wsEnabled" />
        <span>Work hours only</span>
      </label>
      <template v-if="store.wsEnabled">
        <div class="ws-time">
          <input type="number" class="ws-input" v-model.number="store.wsStartH" min="0" max="23" />
          <span class="ws-sep">–</span>
          <input type="number" class="ws-input" v-model.number="store.wsEndH" min="1" max="24" />
          <span class="ws-unit">h</span>
        </div>
        <span class="ws-hint">Mon–Fri</span>
      </template>
    </div>
    <div class="track-stats-grid">
      <!-- ═══ Overview ═══ -->
      <div class="stat-section">
        <div class="stat-section-header" @click="toggleSection('overview')">
          <span class="stat-section-label">Overview</span>
          <span class="chevron" :class="{ open: expanded.overview }">&#9656;</span>
        </div>
        <div v-if="expanded.overview" class="stat-section-body">
          <div class="stat-row"><span class="stat-key">Cases</span><span class="stat-val">{{ stats.nCases }}</span></div>
          <div class="stat-row"><span class="stat-key">Events / Tasks</span><span class="stat-val">{{ stats.nTasks }}</span></div>
          <div class="stat-row"><span class="stat-key">Resources</span><span class="stat-val">{{ stats.nResources }}</span></div>
          <div v-if="stats.nActivities > 0" class="stat-row"><span class="stat-key">Activities</span><span class="stat-val">{{ stats.nActivities }}</span></div>
          <div class="stat-row"><span class="stat-key">Timespan</span><span class="stat-val">{{ fmtDur(stats.totalDuration) }}</span></div>
          <div v-if="stats.collabTasks > 0" class="stat-row">
            <span class="stat-key">Collab tasks</span>
            <span class="stat-val">{{ stats.collabTasks }} <span class="stat-pct">({{ fmtPct(stats.collabPct) }})</span></span>
          </div>
        </div>
      </div>

      <!-- ═══ Cycle Time ═══ -->
      <div class="stat-section">
        <div class="stat-section-header" @click="toggleSection('cycleTime')">
          <span class="stat-section-label">Cycle Time / Throughput Time</span>
          <span class="chevron" :class="{ open: expanded.cycleTime }">&#9656;</span>
        </div>
        <div v-if="expanded.cycleTime" class="stat-section-body">
          <div class="stat-hint">End-to-end duration per case</div>
          <div class="stat-row"><span class="stat-key">Average</span><span class="stat-val">{{ fmtDur(stats.cycleTime.avg) }}</span></div>
          <div class="stat-row"><span class="stat-key">Median</span><span class="stat-val">{{ fmtDur(stats.cycleTime.median) }}</span></div>
          <div class="stat-row"><span class="stat-key">Min</span><span class="stat-val">{{ fmtDur(stats.cycleTime.min) }}</span></div>
          <div class="stat-row"><span class="stat-key">Max</span><span class="stat-val">{{ fmtDur(stats.cycleTime.max) }}</span></div>
        </div>
      </div>

      <!-- ═══ Processing Time ═══ -->
      <div class="stat-section">
        <div class="stat-section-header" @click="toggleSection('processingTime')">
          <span class="stat-section-label">Processing Time</span>
          <span class="chevron" :class="{ open: expanded.processingTime }">&#9656;</span>
        </div>
        <div v-if="expanded.processingTime" class="stat-section-body">
          <div class="stat-hint">Total active work time per case</div>
          <div class="stat-row"><span class="stat-key">Average</span><span class="stat-val">{{ fmtDur(stats.processingTime.avg) }}</span></div>
          <div class="stat-row"><span class="stat-key">Median</span><span class="stat-val">{{ fmtDur(stats.processingTime.median) }}</span></div>
          <div class="stat-row"><span class="stat-key">Min</span><span class="stat-val">{{ fmtDur(stats.processingTime.min) }}</span></div>
          <div class="stat-row"><span class="stat-key">Max</span><span class="stat-val">{{ fmtDur(stats.processingTime.max) }}</span></div>
        </div>
      </div>

      <!-- ═══ Waiting Time ═══ -->
      <div class="stat-section">
        <div class="stat-section-header" @click="toggleSection('waitingTime')">
          <span class="stat-section-label">Waiting Time</span>
          <span class="chevron" :class="{ open: expanded.waitingTime }">&#9656;</span>
        </div>
        <div v-if="expanded.waitingTime" class="stat-section-body">
          <div class="stat-hint">Explicit queue time (assigned → start)</div>
          <div class="stat-row"><span class="stat-key">Average</span><span class="stat-val">{{ fmtDur(stats.waitingTime.avg) }}</span></div>
          <div class="stat-row"><span class="stat-key">Median</span><span class="stat-val">{{ fmtDur(stats.waitingTime.median) }}</span></div>
          <div class="stat-row"><span class="stat-key">Min</span><span class="stat-val">{{ fmtDur(stats.waitingTime.min) }}</span></div>
          <div class="stat-row"><span class="stat-key">Max</span><span class="stat-val">{{ fmtDur(stats.waitingTime.max) }}</span></div>
        </div>
      </div>

      <!-- ═══ Idle Time ═══ -->
      <div class="stat-section">
        <div class="stat-section-header" @click="toggleSection('idleTime')">
          <span class="stat-section-label">Idle Time</span>
          <span class="chevron" :class="{ open: expanded.idleTime }">&#9656;</span>
        </div>
        <div v-if="expanded.idleTime" class="stat-section-body">
          <div class="stat-hint">Gaps with no activity: cycle − processing − waiting</div>
          <div class="stat-row"><span class="stat-key">Average</span><span class="stat-val">{{ fmtDur(stats.idleTime.avg) }}</span></div>
          <div class="stat-row"><span class="stat-key">Median</span><span class="stat-val">{{ fmtDur(stats.idleTime.median) }}</span></div>
          <div class="stat-row"><span class="stat-key">Min</span><span class="stat-val">{{ fmtDur(stats.idleTime.min) }}</span></div>
          <div class="stat-row"><span class="stat-key">Max</span><span class="stat-val">{{ fmtDur(stats.idleTime.max) }}</span></div>
        </div>
      </div>

      <!-- ═══ Flow Efficiency ═══ -->
      <div class="stat-section">
        <div class="stat-section-header" @click="toggleSection('flowEfficiency')">
          <span class="stat-section-label">Flow Efficiency</span>
          <span class="chevron" :class="{ open: expanded.flowEfficiency }">&#9656;</span>
        </div>
        <div v-if="expanded.flowEfficiency" class="stat-section-body">
          <div class="stat-hint">Processing time / cycle time</div>
          <div class="stat-row">
            <span class="stat-key">Average</span>
            <span class="stat-val">
              <span class="stat-bar-wrap"><span class="stat-bar" :style="{ width: Math.min(100, stats.flowEfficiency.avg) + '%' }"></span></span>
              {{ fmtPct(stats.flowEfficiency.avg) }}
            </span>
          </div>
          <div class="stat-row"><span class="stat-key">Median</span><span class="stat-val">{{ fmtPct(stats.flowEfficiency.median) }}</span></div>
          <div class="stat-row"><span class="stat-key">Min</span><span class="stat-val">{{ fmtPct(stats.flowEfficiency.min) }}</span></div>
          <div class="stat-row"><span class="stat-key">Max</span><span class="stat-val">{{ fmtPct(stats.flowEfficiency.max) }}</span></div>
        </div>
      </div>

      <!-- ═══ Service Time ═══ -->
      <div class="stat-section">
        <div class="stat-section-header" @click="toggleSection('serviceTime')">
          <span class="stat-section-label">Service Time (per task)</span>
          <span class="chevron" :class="{ open: expanded.serviceTime }">&#9656;</span>
        </div>
        <div v-if="expanded.serviceTime" class="stat-section-body">
          <div class="stat-hint">Duration of individual task executions</div>
          <div class="stat-row"><span class="stat-key">Average</span><span class="stat-val">{{ fmtDur(stats.serviceTime.avg) }}</span></div>
          <div class="stat-row"><span class="stat-key">Median</span><span class="stat-val">{{ fmtDur(stats.serviceTime.median) }}</span></div>
          <div class="stat-row"><span class="stat-key">Min</span><span class="stat-val">{{ fmtDur(stats.serviceTime.min) }}</span></div>
          <div class="stat-row"><span class="stat-key">Max</span><span class="stat-val">{{ fmtDur(stats.serviceTime.max) }}</span></div>
          <div class="stat-subsection-label" style="margin-top: 6px">Sojourn Time (wait + service)</div>
          <div class="stat-row"><span class="stat-key">Average</span><span class="stat-val">{{ fmtDur(stats.sojournTime.avg) }}</span></div>
          <div class="stat-row"><span class="stat-key">Max</span><span class="stat-val">{{ fmtDur(stats.sojournTime.max) }}</span></div>
        </div>
      </div>

      <!-- ═══ Resource Performance ═══ -->
      <div class="stat-section">
        <div class="stat-section-header" @click="toggleSection('resource')">
          <span class="stat-section-label">Resource Performance</span>
          <span class="chevron" :class="{ open: expanded.resource }">&#9656;</span>
        </div>
        <div v-if="expanded.resource" class="stat-section-body">
          <div class="stat-subsection-label">Utilization</div>
          <div class="stat-row">
            <span class="stat-key">Average</span>
            <span class="stat-val">
              <span class="stat-bar-wrap"><span class="stat-bar" :style="{ width: stats.resourceUtilization.avg + '%' }"></span></span>
              {{ fmtPct(stats.resourceUtilization.avg) }}
            </span>
          </div>
          <div class="stat-row"><span class="stat-key">Min</span><span class="stat-val">{{ fmtPct(stats.resourceUtilization.min) }}</span></div>
          <div class="stat-row"><span class="stat-key">Max</span><span class="stat-val">{{ fmtPct(stats.resourceUtilization.max) }}</span></div>
          <div class="stat-subsection-label">Throughput (tasks/hr)</div>
          <div class="stat-row"><span class="stat-key">Average</span><span class="stat-val">{{ fmtNum(stats.resourceThroughput.avg) }}</span></div>
          <div class="stat-row"><span class="stat-key">Min</span><span class="stat-val">{{ fmtNum(stats.resourceThroughput.min) }}</span></div>
          <div class="stat-row"><span class="stat-key">Max</span><span class="stat-val">{{ fmtNum(stats.resourceThroughput.max) }}</span></div>
          <div class="stat-subsection-label">Workload (tasks/resource)</div>
          <div class="stat-row"><span class="stat-key">Average</span><span class="stat-val">{{ fmtNum(stats.resourceWorkload.avg, 0) }}</span></div>
          <div class="stat-row"><span class="stat-key">Min</span><span class="stat-val">{{ fmtNum(stats.resourceWorkload.min, 0) }}</span></div>
          <div class="stat-row"><span class="stat-key">Max</span><span class="stat-val">{{ fmtNum(stats.resourceWorkload.max, 0) }}</span></div>
        </div>
      </div>

      <!-- ═══ Process-Level ═══ -->
      <div class="stat-section">
        <div class="stat-section-header" @click="toggleSection('process')">
          <span class="stat-section-label">Process-Level</span>
          <span class="chevron" :class="{ open: expanded.process }">&#9656;</span>
        </div>
        <div v-if="expanded.process" class="stat-section-body">
          <div class="stat-row"><span class="stat-key">Arrival Rate</span><span class="stat-val">{{ fmtNum(stats.arrivalRate) }} cases/hr</span></div>
          <div class="stat-row"><span class="stat-key">Avg WIP</span><span class="stat-val" title="Little's Law: lambda x W">{{ fmtNum(stats.avgWIP) }} cases</span></div>
          <div v-if="stats.handovers.total > 0" class="stat-row"><span class="stat-key">Handovers (avg/case)</span><span class="stat-val">{{ fmtNum(stats.handovers.avg) }}</span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.track-stats {
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--track-header-border);
  overflow: hidden;
}
.track-stats-grid {
  padding: 4px 0 8px;
  columns: 2;
  column-gap: 0;
}
@media (max-width: 800px) {
  .track-stats-grid {
    columns: 1;
  }
}
.stat-section {
  padding: 0 14px;
  break-inside: avoid;
}
.stat-section + .stat-section {
  border-top: 1px solid var(--border-secondary);
}
.stat-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 6px 0 3px;
  user-select: none;
}
.stat-section-header:hover .stat-section-label {
  color: var(--text-primary);
}
.stat-section-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  transition: color 0.15s;
}
.chevron {
  font-size: 10px;
  color: var(--text-muted);
  transition: transform 0.2s;
  display: inline-block;
}
.chevron.open {
  transform: rotate(90deg);
}
.stat-section-body {
  padding-bottom: 6px;
}
.stat-hint {
  font-size: 9px;
  color: var(--text-muted);
  font-style: italic;
  margin-bottom: 4px;
  line-height: 1.3;
}
.stat-subsection-label {
  font-size: 9px;
  font-weight: 600;
  color: var(--text-muted);
  margin-top: 4px;
  margin-bottom: 2px;
  opacity: 0.8;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1px 0;
  font-size: 11px;
}
.stat-key {
  color: var(--text-muted);
}
.stat-val {
  color: var(--text-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  gap: 6px;
}
.stat-pct {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 10px;
}
.stat-bar-wrap {
  width: 50px;
  height: 6px;
  background: var(--bg-quaternary);
  border-radius: 3px;
  overflow: hidden;
}
.stat-bar {
  height: 100%;
  background: var(--accent-success);
  border-radius: 3px;
  transition: width 0.3s ease;
}
/* ── Work Schedule bar ── */
.ws-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 14px 3px;
  border-bottom: 1px solid var(--border-secondary);
}
.ws-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  white-space: nowrap;
}
.ws-toggle input {
  accent-color: var(--accent-primary);
  width: 13px;
  height: 13px;
  cursor: pointer;
}
.ws-time {
  display: flex;
  align-items: center;
  gap: 2px;
}
.ws-input {
  width: 38px;
  padding: 2px 4px;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  border: 1px solid var(--border-secondary);
  border-radius: 3px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  -moz-appearance: textfield;
}
.ws-input::-webkit-inner-spin-button,
.ws-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.ws-input:focus { outline: 1px solid var(--accent-primary); }
.ws-sep {
  font-size: 10px;
  color: var(--text-muted);
  margin: 0 1px;
}
.ws-unit {
  font-size: 9px;
  color: var(--text-muted);
  margin-left: 1px;
}
.ws-hint {
  font-size: 9px;
  color: var(--text-muted);
  font-style: italic;
}
</style>

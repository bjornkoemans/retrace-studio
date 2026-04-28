<script setup>
import { ref, computed, nextTick } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { caseColor } from '../utils/colors'

const MAX_VISIBLE_CHIPS = 3

const props = defineProps({
  track: { type: Object, required: true },
  agent: { type: String, required: true },
})

const store = useTimelineStore()
const showTooltip = ref(false)
const tooltipStyle = ref({})
const moreRef = ref(null)
const tooltipRef = ref(null)

const agentTasks = computed(() => {
  const tasks = props.track.tasks.filter((t) => t.agent === props.agent)
  if (store.showZeroDuration) return tasks
  return tasks.filter((t) => t.end - t.start > 0)
})

const currentTask = computed(() => {
  const t = store.playheadTime
  return agentTasks.value.find((tk) => tk.start <= t && t < tk.end)
})

const waitingTask = computed(() => {
  const t = store.playheadTime
  return agentTasks.value.find((tk) => tk.assigned <= t && t < tk.start)
})

const queuedTasks = computed(() => {
  const t = store.playheadTime
  return agentTasks.value
    .filter((tk) => tk.assigned <= t && t < tk.start)
    .sort((a, b) => a.assigned - b.assigned)
})

const visibleTasks = computed(() => {
  return queuedTasks.value.slice(0, MAX_VISIBLE_CHIPS)
})

const hiddenTasks = computed(() => {
  return queuedTasks.value.slice(MAX_VISIBLE_CHIPS)
})

const hiddenCount = computed(() => {
  return hiddenTasks.value.length
})

const currentPct = computed(() => {
  if (!currentTask.value) return 0
  const t = store.playheadTime
  const ct = currentTask.value
  return Math.min(100, ((t - ct.start) / (ct.end - ct.start)) * 100).toFixed(0)
})

async function onMoreEnter() {
  if (!moreRef.value) return
  showTooltip.value = true

  // Wait for DOM to render the tooltip so we can measure it
  await nextTick()

  const badgeRect = moreRef.value.getBoundingClientRect()
  const tip = tooltipRef.value
  if (!tip) return

  const tipRect = tip.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 8

  // Anchor to the right edge of the +N badge, vertically centered
  let left = badgeRect.right + pad
  let top = badgeRect.top + badgeRect.height / 2 - tipRect.height / 2

  // If it goes off the right edge, flip to the left side
  if (left + tipRect.width > vw - pad) {
    left = badgeRect.left - tipRect.width - pad
  }

  // Clamp vertically within viewport
  if (top < pad) top = pad
  if (top + tipRect.height > vh - pad) top = vh - pad - tipRect.height

  tooltipStyle.value = {
    left: left + 'px',
    top: top + 'px',
  }
}

function onMoreLeave() {
  showTooltip.value = false
}
</script>

<template>
  <div class="queue-agent" :style="{ height: store.laneHeight + 'px' }">
    <!-- Row 1: Status -->
    <div class="queue-status-row">
      <template v-if="currentTask">
        <span class="queue-status-badge working">Working</span>
        <span class="queue-current-chip" :style="{ background: caseColor(currentTask.caseId) }">
          C{{ currentTask.caseId }}.T{{ currentTask.taskId }}
        </span>
        <span class="queue-pct">{{ currentPct }}%</span>
      </template>
      <template v-else-if="waitingTask">
        <span class="queue-status-badge waiting">Waiting</span>
        <span class="queue-current-chip" :style="{ background: caseColor(waitingTask.caseId) }">
          C{{ waitingTask.caseId }}.T{{ waitingTask.taskId }}
        </span>
      </template>
      <template v-else>
        <span class="queue-status-badge idle">Idle</span>
      </template>
    </div>

    <!-- Row 2: Queue bar -->
    <div class="queue-bar">
      <span class="queue-bar-label">Queue</span>
      <template v-if="queuedTasks.length > 0">
        <span
          v-for="q in visibleTasks"
          :key="`${q.caseId}-${q.taskId}`"
          class="queue-bar-chip"
          :style="{ background: caseColor(q.caseId) }"
        >
          C{{ q.caseId }}.T{{ q.taskId }}
        </span>
        <span
          v-if="hiddenCount > 0"
          ref="moreRef"
          class="queue-bar-more"
          @mouseenter="onMoreEnter"
          @mouseleave="onMoreLeave"
        >
          +{{ hiddenCount }}
        </span>
      </template>
      <span v-else class="queue-bar-empty">empty</span>
    </div>

    <!-- Teleported tooltip so it escapes overflow:hidden ancestors -->
    <Teleport to="body">
      <div
        v-if="showTooltip && hiddenCount > 0"
        ref="tooltipRef"
        class="queue-tooltip"
        :style="tooltipStyle"
      >
        <span
          v-for="q in hiddenTasks"
          :key="`tip-${q.caseId}-${q.taskId}`"
          class="queue-tooltip-chip"
          :style="{ background: caseColor(q.caseId) }"
        >
          C{{ q.caseId }}.T{{ q.taskId }}
        </span>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.queue-agent {
  padding: 4px 8px;
  border-bottom: 1px solid var(--lane-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}
.queue-agent:nth-child(even) {
  background: var(--lane-stripe);
}
.queue-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.queue-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.queue-status-badge.working {
  background: var(--status-working-bg);
  color: var(--status-working-text);
}
.queue-status-badge.waiting {
  background: var(--status-waiting-bg);
  color: var(--status-waiting-text);
}
.queue-status-badge.idle {
  background: var(--status-idle-bg);
  color: var(--status-idle-text);
}
.queue-current-chip {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
}
.queue-pct {
  font-size: 10px;
  color: var(--queue-pct-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.queue-bar {
  display: flex;
  align-items: center;
  gap: 3px;
  background: var(--queue-bar-bg);
  border-radius: 4px;
  padding: 2px 6px;
  min-height: 18px;
  overflow: hidden;
}
.queue-bar-chip {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
  max-width: 80px;
}
.queue-bar-more {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  color: var(--queue-label-text);
  background: rgba(0, 0, 0, 0.08);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.queue-bar-more:hover {
  background: rgba(0, 0, 0, 0.15);
}
.queue-bar-empty {
  font-size: 9px;
  color: var(--queue-empty-text);
  font-style: italic;
}
.queue-bar-label {
  font-size: 8px;
  color: var(--queue-label-text);
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
</style>

<!-- Global (unscoped) styles for the teleported tooltip -->
<style>
.queue-tooltip {
  position: fixed;
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  z-index: 10000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  max-width: 300px;
  max-height: 50vh;
  overflow-y: auto;
  pointer-events: none;
}
.queue-tooltip-chip {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
}
</style>

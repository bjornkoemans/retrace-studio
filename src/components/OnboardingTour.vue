<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'

const store = useTimelineStore()
const visible = ref(false)
const step = ref(0)
const spotStyle = ref({})
const cardStyle = ref({})

const STORAGE_KEY = 'retrace-onboarded'

const steps = [
  {
    title: 'Welcome to RETrace Studio',
    text: 'A resource-focused process mining tool that visualises event logs from a resource perspective. We\'ve loaded two example logs to show you around.',
    selector: null,
  },
  {
    title: 'Import your data',
    text: 'Click here to import your own CSV event log. Map columns to cases, activities, resources, and timestamps — the tool auto-detects most formats.',
    selector: '.header-btn.ghost', // first ghost button = import
    side: 'bottom',
  },
  {
    title: 'Timeline — your resource view',
    text: 'Each row is an agent (resource). Colored blocks are tasks per case — hover for details, click to select, drag handles to reorder lanes.',
    selector: '.timeline-panel',
    side: 'top-inside',
  },
  {
    title: 'Playback controls',
    text: 'Press Space to play/pause. Arrow keys scrub through time, 1-6 set speed presets. The playhead shows which tasks are active at any moment.',
    selector: '.playback-pill',
    side: 'top',
  },
  {
    title: 'Search & filter',
    text: 'Press / to search. Filter by activity name, duration (>5m), case ID (C1), or wait time (wait:>30m). Results highlight on the timeline.',
    selector: '.search-bar',
    side: 'bottom',
  },
  {
    title: 'Multiple datasets',
    text: 'You can load multiple logs at once. Each track has its own timeline, stats, and agent lanes. Try comparing the two example logs!',
    selector: '.track-header',
    side: 'bottom',
  },
  {
    title: 'Analytics studios',
    text: 'Open the Analytics menu for Duration Distribution (D), Comparison Studio (R), and Control Flow Studio (F) — full process mining dashboards.',
    selector: '.analytics-trigger',
    side: 'bottom',
  },
]

function positionStep() {
  const s = steps[step.value]

  if (!s.selector) {
    // No spotlight — use a tiny invisible spot to create the full-screen dim
    spotStyle.value = {
      display: 'block',
      left: '50%', top: '50%', width: '1px', height: '1px',
      borderColor: 'transparent', borderRadius: '50%',
    }
    cardStyle.value = {
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
    }
    return
  }

  const el = document.querySelector(s.selector)
  if (!el) {
    spotStyle.value = { display: 'none' }
    cardStyle.value = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    return
  }

  const r = el.getBoundingClientRect()
  const pad = 8

  // Spotlight position
  spotStyle.value = {
    display: 'block',
    left: (r.left - pad) + 'px',
    top: (r.top - pad) + 'px',
    width: (r.width + pad * 2) + 'px',
    height: (r.height + pad * 2) + 'px',
  }

  // Card position
  const cardW = 340
  const gap = 14
  const side = s.side || 'bottom'
  let top, left

  if (side === 'bottom') {
    top = r.bottom + gap
    left = r.left + r.width / 2 - cardW / 2
  } else if (side === 'top') {
    top = r.top - gap - 200
    left = r.left + r.width / 2 - cardW / 2
  } else if (side === 'top-inside') {
    top = r.top + 20
    left = r.left + r.width / 2 - cardW / 2
  }

  // Clamp
  left = Math.max(16, Math.min(window.innerWidth - cardW - 16, left))
  top = Math.max(16, Math.min(window.innerHeight - 220, top))

  cardStyle.value = { top: top + 'px', left: left + 'px', transform: 'none' }
}

watch(step, () => nextTick(positionStep))

function next() {
  if (step.value < steps.length - 1) step.value++
  else dismiss()
}
function prev() { if (step.value > 0) step.value-- }
function dismiss() {
  visible.value = false
  localStorage.setItem(STORAGE_KEY, '1')
}

function onKeydown(e) {
  if (!visible.value) return
  if (e.key === 'Escape') { dismiss(); e.stopPropagation() }
  if (e.key === 'ArrowRight' || e.key === 'Enter') { next(); e.stopPropagation(); e.preventDefault() }
  if (e.key === 'ArrowLeft') { prev(); e.stopPropagation(); e.preventDefault() }
}

function onResize() { if (visible.value) positionStep() }

// ── Build parsed track data from raw rows ──
function buildTrack(title, raw, baseTime) {
  const tasks = []
  const agentSet = new Set()
  const caseSet = new Set()
  let taskId = 1

  for (const r of raw) {
    const start = r.s
    const end = r.s + r.d
    const assigned = r.s - r.w
    agentSet.add(r.agent)
    caseSet.add(r.c)
    tasks.push({
      caseId: r.c, caseIdRaw: `Case-${r.c}`, taskId: taskId++,
      taskName: r.task, agent: r.agent,
      start, end, assigned,
      absStart: new Date((baseTime + start) * 1000).toISOString(),
      absEnd: new Date((baseTime + end) * 1000).toISOString(),
      absAssigned: new Date((baseTime + assigned) * 1000).toISOString(),
      waiting: r.w, isCollab: false, allAgents: r.agent,
      assignmentType: '', volunteerIds: [],
    })
  }

  const agents = [...agentSet].sort()
  const caseIds = [...caseSet].sort()
  let totalDuration = 0
  for (const t of tasks) { if (t.end > totalDuration) totalDuration = t.end }
  const agentIdToName = {}
  for (const a of agents) agentIdToName[a] = a
  store.addTrackFromParsed(title, { tasks, agents, caseIds, totalDuration, agentIdToName })
}

function loadExampleData() {
  const m = 60
  const base1 = new Date('2026-03-20T09:00:00').getTime() / 1000

  // Dataset 1: Loan Application (Scenario A)
  // Agent schedules verified: no overlapping tasks per agent (including wait blocks)
  // Clerk-001: [0,8] [8,25] [26,33] [97,105] [122,137] [137,144]
  // Clerk-002: [5,12] [12,33] [33,47] [79,92] [103,116] [116,123]
  // Analyst-001: [24,42] [47,62] [62,84] [98,117]
  // Analyst-002: [33,52] [52,74] [74,96]
  buildTrack('Loan Application — Scenario A', [
    // Case 1 — approved
    { c: 1, task: 'Receive Application', agent: 'Clerk-001', s: 0, d: 8*m, w: 0 },
    { c: 1, task: 'Verify Documents', agent: 'Clerk-001', s: 10*m, d: 15*m, w: 2*m },
    { c: 1, task: 'Credit Check', agent: 'Analyst-001', s: 27*m, d: 15*m, w: 3*m },
    { c: 1, task: 'Risk Assessment', agent: 'Analyst-002', s: 54*m, d: 20*m, w: 2*m },
    { c: 1, task: 'Approve Loan', agent: 'Clerk-002', s: 82*m, d: 10*m, w: 3*m },
    { c: 1, task: 'Notify Customer', agent: 'Clerk-001', s: 100*m, d: 5*m, w: 3*m },
    // Case 2 — rejected
    { c: 2, task: 'Receive Application', agent: 'Clerk-002', s: 5*m, d: 7*m, w: 0 },
    { c: 2, task: 'Verify Documents', agent: 'Clerk-002', s: 15*m, d: 18*m, w: 3*m },
    { c: 2, task: 'Credit Check', agent: 'Analyst-002', s: 35*m, d: 17*m, w: 2*m },
    { c: 2, task: 'Risk Assessment', agent: 'Analyst-001', s: 64*m, d: 20*m, w: 2*m },
    { c: 2, task: 'Reject Loan', agent: 'Clerk-002', s: 108*m, d: 8*m, w: 5*m },
    { c: 2, task: 'Notify Customer', agent: 'Clerk-002', s: 118*m, d: 5*m, w: 2*m },
    // Case 3 — approved with parallel appraisal
    { c: 3, task: 'Receive Application', agent: 'Clerk-001', s: 27*m, d: 6*m, w: 1*m },
    { c: 3, task: 'Verify Documents', agent: 'Clerk-002', s: 35*m, d: 12*m, w: 2*m },
    { c: 3, task: 'Credit Check', agent: 'Analyst-001', s: 49*m, d: 13*m, w: 2*m },
    { c: 3, task: 'Appraise Property', agent: 'Analyst-002', s: 76*m, d: 20*m, w: 2*m },
    { c: 3, task: 'Risk Assessment', agent: 'Analyst-001', s: 100*m, d: 17*m, w: 2*m },
    { c: 3, task: 'Approve Loan', agent: 'Clerk-001', s: 125*m, d: 12*m, w: 3*m },
    { c: 3, task: 'Notify Customer', agent: 'Clerk-001', s: 139*m, d: 5*m, w: 2*m },
  ], base1)

  // Dataset 2: Loan Application (Scenario B) — same agents & cases, different assignments & durations
  // Agent schedules verified: no overlapping tasks per agent
  // Clerk-001:    [0,6] [6,20] [75,83] [83,89] [112,122] [122,128]
  // Clerk-002:    [3,10] [12,17] [17,30] [30,42] [86,100] [100,106]
  // Analyst-001:  [20,40] [42,58] [58,75] [92,112]
  // Analyst-002:  [30,50] [50,72] [72,92]
  const base2 = new Date('2026-03-20T10:30:00').getTime() / 1000
  buildTrack('Loan Application — Scenario B', [
    // Case 1 — approved (different agents than Scenario A)
    { c: 1, task: 'Receive Application', agent: 'Clerk-002', s: 3*m, d: 7*m, w: 0 },
    { c: 1, task: 'Verify Documents', agent: 'Clerk-002', s: 19*m, d: 11*m, w: 2*m },
    { c: 1, task: 'Credit Check', agent: 'Analyst-002', s: 32*m, d: 18*m, w: 2*m },
    { c: 1, task: 'Risk Assessment', agent: 'Analyst-001', s: 60*m, d: 15*m, w: 2*m },
    { c: 1, task: 'Approve Loan', agent: 'Clerk-001', s: 78*m, d: 5*m, w: 3*m },
    { c: 1, task: 'Notify Customer', agent: 'Clerk-001', s: 85*m, d: 4*m, w: 2*m },
    // Case 2 — rejected (swapped clerks, longer processing)
    { c: 2, task: 'Receive Application', agent: 'Clerk-001', s: 0, d: 6*m, w: 0 },
    { c: 2, task: 'Verify Documents', agent: 'Clerk-001', s: 8*m, d: 12*m, w: 2*m },
    { c: 2, task: 'Credit Check', agent: 'Analyst-001', s: 22*m, d: 18*m, w: 2*m },
    { c: 2, task: 'Risk Assessment', agent: 'Analyst-002', s: 52*m, d: 20*m, w: 2*m },
    { c: 2, task: 'Reject Loan', agent: 'Clerk-002', s: 90*m, d: 10*m, w: 4*m },
    { c: 2, task: 'Notify Customer', agent: 'Clerk-002', s: 102*m, d: 4*m, w: 2*m },
    // Case 3 — approved with parallel appraisal (different analyst assignments)
    { c: 3, task: 'Receive Application', agent: 'Clerk-002', s: 12*m, d: 5*m, w: 0 },
    { c: 3, task: 'Verify Documents', agent: 'Clerk-002', s: 32*m, d: 10*m, w: 2*m },
    { c: 3, task: 'Credit Check', agent: 'Analyst-001', s: 44*m, d: 14*m, w: 2*m },
    { c: 3, task: 'Appraise Property', agent: 'Analyst-002', s: 74*m, d: 18*m, w: 2*m },
    { c: 3, task: 'Risk Assessment', agent: 'Analyst-001', s: 94*m, d: 18*m, w: 2*m },
    { c: 3, task: 'Approve Loan', agent: 'Clerk-001', s: 114*m, d: 8*m, w: 2*m },
    { c: 3, task: 'Notify Customer', agent: 'Clerk-001', s: 124*m, d: 4*m, w: 2*m },
  ], base2)
}

function startTour() {
  if (localStorage.getItem(STORAGE_KEY)) return
  if (store.tracks.length === 0) loadExampleData()
  visible.value = true
  nextTick(positionStep)
  window.addEventListener('resize', onResize)
  document.addEventListener('keydown', onKeydown, true)
}

const tourStarted = ref(false)
watch(() => store.tracksRestored, (v) => {
  if (v && !tourStarted.value) {
    tourStarted.value = true
    nextTick(startTour)
  }
}, { immediate: true })
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="onb-fade">
      <div v-if="visible" class="onb-overlay" @click.self="dismiss">
        <!-- Dim backdrop -->
        <div class="onb-dim"></div>
        <!-- Spotlight ring -->
        <div v-if="spotStyle.display !== 'none'" class="onb-spot" :style="spotStyle"></div>

        <!-- Card -->
        <div class="onb-card" :style="cardStyle">
          <div class="onb-card-head">
            <span class="onb-step-badge">{{ step + 1 }} / {{ steps.length }}</span>
            <button class="onb-skip" @click="dismiss">Skip tour &times;</button>
          </div>
          <h2 class="onb-title">{{ steps[step].title }}</h2>
          <p class="onb-text">{{ steps[step].text }}</p>
          <div class="onb-footer">
            <div class="onb-dots">
              <span v-for="(s, i) in steps" :key="i"
                class="onb-dot" :class="{ active: i === step, done: i < step }"
                @click="step = i"></span>
            </div>
            <div class="onb-btns">
              <button v-if="step > 0" class="onb-btn onb-btn-sec" @click="prev">Back</button>
              <button class="onb-btn onb-btn-pri" @click="next">
                {{ step < steps.length - 1 ? 'Next' : 'Get Started' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.onb-overlay {
  position: fixed; inset: 0; z-index: 9999;
}
.onb-dim {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  pointer-events: none;
}

/* Spotlight ring around highlighted element */
.onb-spot {
  position: fixed; z-index: 10000;
  border-radius: 10px;
  border: 2px solid var(--accent-primary, #6366f1);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.25), 0 0 24px rgba(99, 102, 241, 0.15);
  background: transparent;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.onb-card {
  position: fixed; z-index: 10001;
  background: var(--bg-primary, #fff);
  border-radius: 14px;
  padding: 16px 20px 14px;
  width: 340px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06);
  transition: top 0.35s cubic-bezier(0.4,0,0.2,1), left 0.35s cubic-bezier(0.4,0,0.2,1);
}
.onb-card-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
}
.onb-step-badge {
  font-size: 10px; font-weight: 600;
  color: var(--accent-primary, #6366f1);
  background: rgba(99,102,241,0.1);
  padding: 2px 8px; border-radius: 10px;
}
.onb-skip {
  border: none; background: none;
  color: var(--text-muted); font-size: 11px; cursor: pointer;
  opacity: 0.6; transition: opacity 0.15s;
}
.onb-skip:hover { opacity: 1; }

.onb-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.onb-text { font-size: 12px; color: var(--text-muted); line-height: 1.55; margin-bottom: 14px; }

.onb-footer { display: flex; align-items: center; justify-content: space-between; }
.onb-dots { display: flex; gap: 5px; }
.onb-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--text-muted); opacity: 0.2;
  cursor: pointer; transition: all 0.2s;
}
.onb-dot.active { opacity: 1; background: var(--accent-primary); transform: scale(1.3); }
.onb-dot.done { opacity: 0.5; background: var(--accent-primary); }

.onb-btns { display: flex; gap: 6px; }
.onb-btn {
  padding: 6px 14px; border-radius: 7px; font-size: 11px; font-weight: 600;
  cursor: pointer; border: none; transition: all 0.15s;
}
.onb-btn-pri { background: var(--accent-primary); color: #fff; }
.onb-btn-pri:hover { filter: brightness(1.1); }
.onb-btn-sec { background: var(--bg-secondary, rgba(0,0,0,0.06)); color: var(--text-primary); }
.onb-btn-sec:hover { background: var(--bg-tertiary, rgba(0,0,0,0.1)); }

/* Transitions */
.onb-fade-enter-active { transition: opacity 0.3s ease; }
.onb-fade-leave-active { transition: opacity 0.25s ease; }
.onb-fade-enter-from, .onb-fade-leave-to { opacity: 0; }
</style>

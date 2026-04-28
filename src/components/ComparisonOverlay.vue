<script setup>
import { ref, reactive, computed, watch, onMounted, inject } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { computeComparisonStats } from '../composables/useComparisonStats'
import { fmtDur, fmtPct, fmtNum } from '../utils/formatStats'
import { markerSvg, AT_COLORS as AT_COLORS_SHARED } from '../utils/assignmentTypes'
import { DEFAULT_WORK_DAYS } from '../utils/workSchedule'

const store = useTimelineStore()
const compareOpen = inject('compareOpen')
function close() { compareOpen.value = false }

// ── Track selection ──
const trackIdA = ref(null)
const trackIdB = ref(null)

// Auto-select top 2 tracks on mount / when tracks change
function initTracks() {
  if (store.tracks.length >= 2) {
    if (!trackIdA.value || !store.tracks.some(t => t.id === trackIdA.value)) trackIdA.value = store.tracks[0].id
    if (!trackIdB.value || !store.tracks.some(t => t.id === trackIdB.value)) trackIdB.value = store.tracks[1]?.id ?? store.tracks[0].id
  } else if (store.tracks.length === 1) {
    trackIdA.value = store.tracks[0].id
    trackIdB.value = store.tracks[0].id
  }
}
onMounted(initTracks)
watch(() => store.tracks.length, initTracks)

const trackA = computed(() => store.tracks.find(t => t.id === trackIdA.value) || null)
const trackB = computed(() => store.tracks.find(t => t.id === trackIdB.value) || null)
// Short display names for A/B labels
const nameA = computed(() => trackA.value?.title?.replace(/^.*—\s*/, '') || 'A')
const nameB = computed(() => trackB.value?.title?.replace(/^.*—\s*/, '') || 'B')

// ── Filters ──
const selectedAgents = ref(null) // null = all
const selectedActivities = ref(null)
const filterExpanded = ref(false)

const allAgents = computed(() => {
  const s = new Set()
  if (trackA.value) trackA.value.agents.forEach(a => s.add(a))
  if (trackB.value) trackB.value.agents.forEach(a => s.add(a))
  return [...s].sort()
})
const allActivities = computed(() => {
  const s = new Set()
  const addFrom = (track) => { if (track) track.tasks.forEach(t => { if (t.taskName) s.add(t.taskName) }) }
  addFrom(trackA.value); addFrom(trackB.value)
  return [...s].sort()
})

function toggleAgent(agent) {
  if (!selectedAgents.value) selectedAgents.value = new Set(allAgents.value)
  if (selectedAgents.value.has(agent)) selectedAgents.value.delete(agent)
  else selectedAgents.value.add(agent)
  if (selectedAgents.value.size === allAgents.value.length) selectedAgents.value = null
  selectedAgents.value = selectedAgents.value ? new Set(selectedAgents.value) : null // trigger reactivity
}
function toggleActivity(act) {
  if (!selectedActivities.value) selectedActivities.value = new Set(allActivities.value)
  if (selectedActivities.value.has(act)) selectedActivities.value.delete(act)
  else selectedActivities.value.add(act)
  if (selectedActivities.value.size === allActivities.value.length) selectedActivities.value = null
  selectedActivities.value = selectedActivities.value ? new Set(selectedActivities.value) : null
}
function clearFilters() { selectedAgents.value = null; selectedActivities.value = null }

const filters = computed(() => {
  if (!selectedAgents.value && !selectedActivities.value) return null
  return { agents: selectedAgents.value, activities: selectedActivities.value }
})
const filterCount = computed(() => {
  let c = 0
  if (selectedAgents.value) c += allAgents.value.length - selectedAgents.value.size
  if (selectedActivities.value) c += allActivities.value.length - selectedActivities.value.size
  return c
})

// ── Work Schedule (from store) ──
const workSchedule = computed(() => {
  if (!store.wsEnabled) return null
  return {
    enabled: true,
    startH: store.wsStartH,
    endH: store.wsEndH,
    workDays: DEFAULT_WORK_DAYS, // Mon-Fri
  }
})

// ── Comparison data ──
const cmp = computed(() => computeComparisonStats(trackA.value, trackB.value, filters.value, workSchedule.value))

// ── Section nav ──
const activeSection = ref('overview')
const sectionGroups = [
  { group: 'Process', items: [
    { id: 'overview',   label: 'Overview',   icon: '#' },
    { id: 'time',       label: 'Time',       icon: 'T' },
    { id: 'assignment', label: 'Assignment',  icon: 'A' },
    { id: 'activities', label: 'Activities',  icon: 'X' },
  ]},
  { group: 'Cases', items: [
    { id: 'efficiency',   label: 'Efficiency',  icon: 'E' },
    { id: 'throughput',   label: 'Throughput',   icon: 'P' },
    { id: 'handovers',    label: 'Handovers',    icon: 'H' },
    { id: 'caseVariants', label: 'Variants',     icon: 'C' },
  ]},
  { group: 'Resources', items: [
    { id: 'workload',     label: 'Workload',     icon: 'W' },
    { id: 'utilization',  label: 'Utilization',  icon: 'U' },
    { id: 'agentTime',    label: 'Agent Time',   icon: 'R' },
    { id: 'volunteering', label: 'Volunteering',  icon: 'V' },
  ]},
]

// ── Chart modes: side-by-side vs overlay ──
const chartModes = reactive({})
function mode(id) { return chartModes[id] || 'side' }
function toggleMode(id) { chartModes[id] = mode(id) === 'side' ? 'overlay' : 'side' }

// ── Tooltip ──
const tip = reactive({ show: false, x: 0, y: 0, label: '', rows: [] })
function showTip(e, label, rows) {
  tip.label = label
  tip.rows = rows
  tip.x = e.clientX + 12
  tip.y = e.clientY - 8
  tip.show = true
}
function moveTip(e) { tip.x = e.clientX + 12; tip.y = e.clientY - 8 }
function hideTip() { tip.show = false }

// ── SVG helpers ──
function s(val, dMin, dMax, rMin, rMax) {
  if (dMax === dMin) return rMin
  return rMin + ((val - dMin) / (dMax - dMin)) * (rMax - rMin)
}
function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
function arc(cx, cy, r, s0, s1) {
  if (s1 - s0 >= 360) s1 = s0 + 359.99
  const a = polar(cx, cy, r, s1), b = polar(cx, cy, r, s0)
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${s1 - s0 > 180 ? 1 : 0} 0 ${b.x} ${b.y}`
}

// ── Chart constants ──
const W = 400, H = 200
const P = { t: 12, r: 60, b: 28, l: 80 }
const cW = W - P.l - P.r, cH = H - P.t - P.b

function trunc(s, max = 18) { return s && s.length > max ? s.slice(0, max - 2) + '..' : s }

// ── OVERVIEW computed ──
const overviewMetrics = computed(() => {
  if (!cmp.value) return []
  const sa = cmp.value.statsA, sb = cmp.value.statsB
  return [
    { l: 'Cases', a: sa.nCases, b: sb.nCases, f: 'n', sub: '' },
    { l: 'Tasks', a: sa.nTasks, b: sb.nTasks, f: 'n', sub: '' },
    { l: 'Resources', a: sa.nResources, b: sb.nResources, f: 'n', sub: '' },
    { l: 'Cycle Time', a: sa.cycleTime.avg, b: sb.cycleTime.avg, f: 'd', sub: 'avg per case' },
    { l: 'Processing', a: sa.processingTime.avg, b: sb.processingTime.avg, f: 'd', sub: 'merged active time' },
    { l: 'Waiting', a: sa.waitingTime.avg, b: sb.waitingTime.avg, f: 'd', sub: 'wait not in processing' },
    { l: 'Efficiency', a: sa.flowEfficiency.avg, b: sb.flowEfficiency.avg, f: 'p', sub: 'processing / cycle' },
    { l: 'Utilization', a: sa.resourceUtilization.avg, b: sb.resourceUtilization.avg, f: 'p', sub: 'work / duration avg' },
    { l: 'Throughput', a: sa.resourceThroughput.avg, b: sb.resourceThroughput.avg, f: 'n1', sub: 'tasks/hr avg' },
    { l: 'WIP', a: sa.avgWIP, b: sb.avgWIP, f: 'n1', sub: '\u03BB \u00D7 CT (Little\'s Law)' },
  ]
})
function fv(v, f) { return f === 'd' ? fmtDur(v) : f === 'p' ? fmtPct(v) : f === 'n' ? fmtNum(v, 0) : fmtNum(v, 1) }

// ── TIME chart data ──
// sub: array of {t,s} pairs — t=normal text, s=subscript text
const timeRows = computed(() => {
  if (!cmp.value) return []
  const sa = cmp.value.statsA, sb = cmp.value.statsB
  return [
    { l: 'Lead Time', sub: [{t:'t'},{s:'end'},{t:' \u2212 t'},{s:'assigned'}], a: sa.leadTime.avg, b: sb.leadTime.avg },
    { l: 'Cycle Time', sub: [{t:'t'},{s:'end'},{t:' \u2212 t'},{s:'start'}], a: sa.cycleTime.avg, b: sb.cycleTime.avg },
    { l: 'Processing', sub: [{t:'\u222A[t'},{s:'start'},{t:', t'},{s:'end'},{t:']'}], a: sa.processingTime.avg, b: sb.processingTime.avg },
    { l: 'Waiting', sub: [{t:'\u222A[t'},{s:'assigned'},{t:', t'},{s:'start'},{t:'] \u2212 proc'}], a: sa.waitingTime.avg, b: sb.waitingTime.avg },
    { l: 'Idle', sub: [{t:'cycle \u2212 proc \u2212 wait'}], a: sa.idleTime.avg, b: sb.idleTime.avg },
  ]
})
const timeMax = computed(() => Math.max(...timeRows.value.flatMap(r => [r.a, r.b]), 1))

// ── WORKLOAD chart data ──
const wkAgents = computed(() => cmp.value?.agentComparison || [])
const wkMax = computed(() => Math.max(...wkAgents.value.map(p => Math.max(p.a?.taskCount || 0, p.b?.taskCount || 0)), 1))

// ── UTILIZATION ──
const utMax = computed(() => Math.max(...(cmp.value?.agentComparison || []).map(p => Math.max(p.a?.throughput || 0, p.b?.throughput || 0)), 1))

// ── ASSIGNMENT donuts ──
const AT_COLORS = AT_COLORS_SHARED
const ACOL_FALLBACK = ['#a855f7','#ec4899','#14b8a6','#f97316','#6366f1','#78716c']
function donutSlices(types) {
  let ang = 0, fi = 0
  return (types || []).map((t) => {
    const sw = (t.pct / 100) * 360
    const c = AT_COLORS[t.type] || ACOL_FALLBACK[fi++ % ACOL_FALLBACK.length]
    const sl = { ...t, s: ang, e: ang + sw, c }
    ang += sw; return sl
  })
}

// ── VOLUNTEERING ──
const volRows = computed(() => {
  if (!cmp.value) return []
  const mapA = new Map((cmp.value.volunteering.a.byAgent || []).map(r => [r.agent, r]))
  const mapB = new Map((cmp.value.volunteering.b.byAgent || []).map(r => [r.agent, r]))
  const all = new Set([...mapA.keys(), ...mapB.keys()])
  return [...all].sort().map(agent => ({
    agent,
    volA: mapA.get(agent)?.volunteerCount || 0,
    volB: mapB.get(agent)?.volunteerCount || 0,
    assA: mapA.get(agent)?.assignedCount || 0,
    assB: mapB.get(agent)?.assignedCount || 0,
  }))
})
const volMax = computed(() => Math.max(...volRows.value.flatMap(r => [r.volA, r.volB]), 1))

// ── THROUGHPUT histogram ──
const thHist = computed(() => {
  if (!cmp.value) return null
  const vA = cmp.value.caseCycleTimesA, vB = cmp.value.caseCycleTimesB
  if (!vA.length && !vB.length) return null
  const mn = Math.min(...vA, ...vB), mx = Math.max(...vA, ...vB)
  if (mx === mn) return null
  const n = 20, bw = (mx - mn) / n
  const bA = new Array(n).fill(0), bB = new Array(n).fill(0)
  for (const v of vA) { let i = Math.floor((v - mn) / bw); if (i >= n) i = n - 1; bA[i]++ }
  for (const v of vB) { let i = Math.floor((v - mn) / bw); if (i >= n) i = n - 1; bB[i]++ }
  const mc = Math.max(...bA, ...bB, 1)
  const q = (arr) => { const ss = [...arr].sort((a,b)=>a-b), nn = ss.length; if (!nn) return null; return { min:ss[0], q1:ss[Math.floor(nn*.25)], med:ss[Math.floor(nn*.5)], q3:ss[Math.floor(nn*.75)], max:ss[nn-1] } }
  return { bA, bB, mn, mx, bw, n, mc, boxA: q(vA), boxB: q(vB) }
})

// ── EFFICIENCY histogram ──
const effHist = computed(() => {
  if (!cmp.value) return null
  const vA = cmp.value.caseFlowEffA, vB = cmp.value.caseFlowEffB
  if (!vA.length && !vB.length) return null
  const n = 20, bw = 5
  const bA = new Array(n).fill(0), bB = new Array(n).fill(0)
  for (const v of vA) { let i = Math.floor(v / bw); if (i >= n) i = n - 1; if (i < 0) i = 0; bA[i]++ }
  for (const v of vB) { let i = Math.floor(v / bw); if (i >= n) i = n - 1; if (i < 0) i = 0; bB[i]++ }
  return { bA, bB, n, bw, mc: Math.max(...bA, ...bB, 1) }
})

// ── HANDOVER ──
const hoData = computed(() => cmp.value?.handoverMatrix || null)

// ── AGENT TIME (per-agent drill-down) ──
const agentTimeRows = computed(() => {
  if (!cmp.value) return []
  const totalA = cmp.value.statsA.totalDuration
  const totalB = cmp.value.statsB.totalDuration
  return (cmp.value.agentComparison || []).map(p => ({
    agent: p.agent,
    a: p.a ? {
      proc: p.a.workingTime, wait: p.a.waitingTime, idle: p.a.idleTime,
      procPct: totalA > 0 ? (p.a.workingTime / totalA) * 100 : 0,
      waitPct: totalA > 0 ? (p.a.waitingTime / totalA) * 100 : 0,
      idlePct: totalA > 0 ? (p.a.idleTime / totalA) * 100 : 0,
      total: totalA, util: p.a.utilization,
    } : null,
    b: p.b ? {
      proc: p.b.workingTime, wait: p.b.waitingTime, idle: p.b.idleTime,
      procPct: totalB > 0 ? (p.b.workingTime / totalB) * 100 : 0,
      waitPct: totalB > 0 ? (p.b.waitingTime / totalB) * 100 : 0,
      idlePct: totalB > 0 ? (p.b.idleTime / totalB) * 100 : 0,
      total: totalB, util: p.b.utilization,
    } : null,
    utilDelta: (p.a && p.b) ? p.b.utilization - p.a.utilization : null,
  }))
})
const agentTimeBarW = 260
const utilDeltaRows = computed(() => {
  return agentTimeRows.value
    .filter(r => r.utilDelta !== null)
    .sort((a, b) => b.utilDelta - a.utilDelta)
})
const utilDeltaMax = computed(() => Math.max(...utilDeltaRows.value.map(r => Math.abs(r.utilDelta)), 0.1))

// ── CASE VARIANTS ──
const caseVariantsData = computed(() => {
  if (!cmp.value) return null
  const cmA = cmp.value.statsA.caseMetrics
  const cmB = cmp.value.statsB.caseMetrics
  if (!cmA.length && !cmB.length) return null

  // Task count histogram
  const maxTasks = Math.max(...cmA.map(c => c.taskCount), ...cmB.map(c => c.taskCount), 1)
  const taskBins = Math.min(maxTasks + 1, 25) // cap bins
  const taskBw = maxTasks < 25 ? 1 : (maxTasks + 1) / 25
  const tHistA = new Array(taskBins).fill(0), tHistB = new Array(taskBins).fill(0)
  for (const c of cmA) { let i = Math.floor(c.taskCount / taskBw); if (i >= taskBins) i = taskBins - 1; tHistA[i]++ }
  for (const c of cmB) { let i = Math.floor(c.taskCount / taskBw); if (i >= taskBins) i = taskBins - 1; tHistB[i]++ }
  const tHistMax = Math.max(...tHistA, ...tHistB, 1)

  // Resource count histogram
  const maxRes = Math.max(...cmA.map(c => c.resourceCount), ...cmB.map(c => c.resourceCount), 1)
  const resBins = Math.min(maxRes + 1, 20)
  const resBw = maxRes < 20 ? 1 : (maxRes + 1) / 20
  const rHistA = new Array(resBins).fill(0), rHistB = new Array(resBins).fill(0)
  for (const c of cmA) { let i = Math.floor(c.resourceCount / resBw); if (i >= resBins) i = resBins - 1; rHistA[i]++ }
  for (const c of cmB) { let i = Math.floor(c.resourceCount / resBw); if (i >= resBins) i = resBins - 1; rHistB[i]++ }
  const rHistMax = Math.max(...rHistA, ...rHistB, 1)

  // Scatter: taskCount vs cycleTime
  const maxCycle = Math.max(...cmA.map(c => c.cycleTime), ...cmB.map(c => c.cycleTime), 1)

  return {
    cmA, cmB, maxTasks, taskBins, taskBw, tHistA, tHistB, tHistMax,
    maxRes, resBins, resBw, rHistA, rHistB, rHistMax,
    maxCycle,
  }
})

// ── ACTIVITIES ──
const actData = computed(() => {
  if (!cmp.value) return null
  const acts = cmp.value.activityComparison.filter(a => a.inA && a.inB)
  if (!acts.length) return null
  return {
    acts,
    maxDur: Math.max(...acts.map(a => Math.max(a.a?.avgDuration || 0, a.b?.avgDuration || 0)), 1),
    maxCnt: Math.max(...acts.map(a => Math.max(a.a?.count || 0, a.b?.count || 0)), 1),
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cs-overlay">
      <div v-if="compareOpen" class="cs-overlay-backdrop" @click.self="close">
        <div class="cs-page">
      <!-- ─── Header ─── -->
      <div class="cs-header">
        <div class="cs-brand">Comparison Studio</div>
        <div class="cs-selectors">
          <div class="cs-sel sel-a">
            <span class="sel-dot dot-a"></span>
            <select v-model="trackIdA" class="sel-input">
              <option v-for="tr in store.tracks" :key="tr.id" :value="tr.id">{{ tr.title }}</option>
            </select>
          </div>
          <span class="cs-vs">vs</span>
          <div class="cs-sel sel-b">
            <span class="sel-dot dot-b"></span>
            <select v-model="trackIdB" class="sel-input">
              <option v-for="tr in store.tracks" :key="tr.id" :value="tr.id">{{ tr.title }}</option>
            </select>
          </div>
        </div>
        <button class="cs-close" @click="close">Back to Timeline</button>
      </div>

      <div class="cs-body">
        <!-- ─── Sidebar ─── -->
        <div class="cs-sidebar">
          <div class="cs-nav">
            <div v-for="grp in sectionGroups" :key="grp.group" class="cs-nav-group">
              <div class="cs-nav-heading">{{ grp.group }}</div>
              <button v-for="sec in grp.items" :key="sec.id"
                class="cs-nav-item" :class="{ active: activeSection === sec.id }"
                @click="activeSection = sec.id">
                <span class="nav-icon">{{ sec.icon }}</span>
                <span class="nav-label">{{ sec.label }}</span>
              </button>
            </div>
          </div>
          <div class="cs-filters">
            <button class="filter-toggle" @click="filterExpanded = !filterExpanded">
              Filters
              <span v-if="filterCount > 0" class="filter-badge">{{ filterCount }}</span>
              <span class="filter-chevron" :class="{ open: filterExpanded }">&gt;</span>
            </button>
            <div v-if="filterExpanded" class="filter-body">
              <div v-if="filterCount > 0" class="filter-clear" @click="clearFilters">Clear all</div>
              <div class="filter-group">
                <div class="filter-group-label">Agents</div>
                <label v-for="ag in allAgents" :key="ag" class="filter-item">
                  <input type="checkbox" :checked="!selectedAgents || selectedAgents.has(ag)" @change="toggleAgent(ag)" />
                  <span>{{ ag }}</span>
                </label>
              </div>
              <div class="filter-group" v-if="allActivities.length > 0">
                <div class="filter-group-label">Activities</div>
                <label v-for="act in allActivities" :key="act" class="filter-item">
                  <input type="checkbox" :checked="!selectedActivities || selectedActivities.has(act)" @change="toggleActivity(act)" />
                  <span>{{ act }}</span>
                </label>
              </div>
            </div>
          </div>
          <!-- ── Work Schedule ── -->
          <div class="cs-work-schedule">
            <label class="ws-toggle">
              <input type="checkbox" v-model="store.wsEnabled" />
              <span>Work hours only</span>
            </label>
            <div v-if="store.wsEnabled" class="ws-config">
              <div class="ws-row">
                <label class="ws-label">Start</label>
                <input type="number" class="ws-input" v-model.number="store.wsStartH" min="0" max="23" />
                <span class="ws-unit">:00</span>
              </div>
              <div class="ws-row">
                <label class="ws-label">End</label>
                <input type="number" class="ws-input" v-model.number="store.wsEndH" min="1" max="24" />
                <span class="ws-unit">:00</span>
              </div>
              <div class="ws-hint">Mon–Fri only. Nights &amp; weekends excluded from waiting/idle.</div>
            </div>
          </div>
        </div>

        <!-- ─── Main content ─── -->
        <div class="cs-main" v-if="cmp">

          <!-- ═══ OVERVIEW ═══ -->
          <template v-if="activeSection === 'overview'">
            <div class="kpi-strip">
              <div v-for="m in overviewMetrics" :key="m.l" class="kpi-chip"
                @mouseenter="showTip($event, m.l, [{c:'a',l:nameA,v:fv(m.a,m.f)},{c:'b',l:nameB,v:fv(m.b,m.f)}])"
                @mousemove="moveTip" @mouseleave="hideTip">
                <div class="kpi-chip-label">{{ m.l }}</div>
                <div class="kpi-chip-vals">
                  <span class="v-a">{{ fv(m.a, m.f) }}</span>
                  <span class="v-b">{{ fv(m.b, m.f) }}</span>
                </div>
                <div v-if="m.sub" class="kpi-chip-sub">{{ m.sub }}</div>
              </div>
            </div>
            <!-- Agent time breakdown (real wallclock) -->
            <div class="chart-row">
              <div class="chart-box" v-for="(side, idx) in ['a','b']" :key="'ab-'+side">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }} — Agent Time (avg per agent)</div>
                <svg viewBox="0 0 320 40" class="mini-svg">
                  <defs><clipPath :id="'clip-ab-'+side"><rect x="0" y="4" width="320" height="32" rx="4" /></clipPath></defs>
                  <g :clip-path="`url(#clip-ab-${side})`">
                    <rect x="0" y="4" :width="cmp.agentTimeBreakdown[side].total > 0 ? (cmp.agentTimeBreakdown[side].processing / cmp.agentTimeBreakdown[side].total) * 320 : 0" height="32" fill="var(--accent-success)" opacity="0.8"
                      @mouseenter="showTip($event, 'Processing', [{c:'g',l:'',v:fmtDur(cmp.agentTimeBreakdown[side].processing)},{c:'g',l:'',v:fmtPct(cmp.agentTimeBreakdown[side].processingPct)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <rect :x="cmp.agentTimeBreakdown[side].total > 0 ? (cmp.agentTimeBreakdown[side].processing / cmp.agentTimeBreakdown[side].total) * 320 : 0" y="4"
                      :width="cmp.agentTimeBreakdown[side].total > 0 ? (cmp.agentTimeBreakdown[side].waiting / cmp.agentTimeBreakdown[side].total) * 320 : 0" height="32" fill="var(--accent-warning)" opacity="0.8"
                      @mouseenter="showTip($event, 'Waiting', [{c:'w',l:'',v:fmtDur(cmp.agentTimeBreakdown[side].waiting)},{c:'w',l:'',v:fmtPct(cmp.agentTimeBreakdown[side].waitingPct)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <rect :x="cmp.agentTimeBreakdown[side].total > 0 ? ((cmp.agentTimeBreakdown[side].processing + cmp.agentTimeBreakdown[side].waiting) / cmp.agentTimeBreakdown[side].total) * 320 : 0" y="4"
                      :width="cmp.agentTimeBreakdown[side].total > 0 ? (cmp.agentTimeBreakdown[side].idle / cmp.agentTimeBreakdown[side].total) * 320 : 0" height="32" fill="var(--accent-danger)" opacity="0.35"
                      @mouseenter="showTip($event, 'Idle', [{c:'r',l:'',v:fmtDur(cmp.agentTimeBreakdown[side].idle)},{c:'r',l:'',v:fmtPct(cmp.agentTimeBreakdown[side].idlePct)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  </g>
                </svg>
                <div class="mini-legend">
                  <span class="ml-i"><span class="ml-s" style="background:var(--accent-success)"></span>Processing {{ fmtDur(cmp.agentTimeBreakdown[side].processing) }} ({{ fmtPct(cmp.agentTimeBreakdown[side].processingPct) }})</span>
                  <span class="ml-i"><span class="ml-s" style="background:var(--accent-warning)"></span>Waiting {{ fmtDur(cmp.agentTimeBreakdown[side].waiting) }} ({{ fmtPct(cmp.agentTimeBreakdown[side].waitingPct) }})</span>
                  <span class="ml-i"><span class="ml-s" style="background:var(--accent-danger);opacity:.35"></span>Idle {{ fmtDur(cmp.agentTimeBreakdown[side].idle) }} ({{ fmtPct(cmp.agentTimeBreakdown[side].idlePct) }})</span>
                </div>
                <div class="breakdown-sub">Total duration: {{ fmtDur(cmp.agentTimeBreakdown[side].total) }}</div>
              </div>
            </div>
            <!-- Case time breakdown (avg per case) -->
            <div class="chart-row">
              <div class="chart-box" v-for="(side, idx) in ['a','b']" :key="side">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }} — Case Time (avg per case)</div>
                <svg viewBox="0 0 320 40" class="mini-svg">
                  <defs><clipPath :id="'clip-ct-'+side"><rect x="0" y="4" width="320" height="32" rx="4" /></clipPath></defs>
                  <g :clip-path="`url(#clip-ct-${side})`">
                    <rect x="0" y="4" :width="cmp.timeComposition[side].cycle > 0 ? (cmp.timeComposition[side].processing / cmp.timeComposition[side].cycle) * 320 : 0" height="32" fill="var(--accent-success)" opacity="0.8"
                      @mouseenter="showTip($event, 'Processing', [{c:'g',l:'',v:fmtDur(cmp.timeComposition[side].processing)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <rect :x="cmp.timeComposition[side].cycle > 0 ? (cmp.timeComposition[side].processing / cmp.timeComposition[side].cycle) * 320 : 0" y="4"
                      :width="cmp.timeComposition[side].cycle > 0 ? (cmp.timeComposition[side].waiting / cmp.timeComposition[side].cycle) * 320 : 0" height="32" fill="var(--accent-warning)" opacity="0.8"
                      @mouseenter="showTip($event, 'Waiting', [{c:'w',l:'',v:fmtDur(cmp.timeComposition[side].waiting)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <rect :x="cmp.timeComposition[side].cycle > 0 ? ((cmp.timeComposition[side].processing + cmp.timeComposition[side].waiting) / cmp.timeComposition[side].cycle) * 320 : 0" y="4"
                      :width="cmp.timeComposition[side].cycle > 0 ? (cmp.timeComposition[side].idle / cmp.timeComposition[side].cycle) * 320 : 0" height="32" fill="var(--accent-danger)" opacity="0.35"
                      @mouseenter="showTip($event, 'Idle', [{c:'r',l:'',v:fmtDur(cmp.timeComposition[side].idle)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  </g>
                </svg>
                <div class="mini-legend">
                  <span class="ml-i"><span class="ml-s" style="background:var(--accent-success)"></span>Processing {{ fmtDur(cmp.timeComposition[side].processing) }}</span>
                  <span class="ml-i"><span class="ml-s" style="background:var(--accent-warning)"></span>Waiting {{ fmtDur(cmp.timeComposition[side].waiting) }}</span>
                  <span class="ml-i"><span class="ml-s" style="background:var(--accent-danger);opacity:.35"></span>Idle {{ fmtDur(cmp.timeComposition[side].idle) }}</span>
                </div>
                <div class="breakdown-sub">Cycle Time: {{ fmtDur(cmp.timeComposition[side].cycle) }}</div>
              </div>
            </div>
            <!-- Efficiency gauges -->
            <div class="chart-row">
              <div class="chart-box" v-for="(side, idx) in ['a','b']" :key="'eff-'+side">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }} — Flow Efficiency</div>
                <svg viewBox="0 0 160 160" class="gauge-svg">
                  <circle cx="80" cy="80" r="58" fill="none" stroke="var(--surface-overlay-border)" stroke-width="10" />
                  <path :d="arc(80, 80, 58, 0, Math.min(359.9, (cmp.deltas.flowEfficiency[side] / 100) * 360))"
                    fill="none" :stroke="idx === 0 ? 'var(--accent-primary)' : 'var(--accent-warning)'" stroke-width="10" stroke-linecap="round" />
                  <text x="80" y="78" text-anchor="middle" class="gauge-big">{{ fmtPct(cmp.deltas.flowEfficiency[side]) }}</text>
                  <text x="80" y="94" text-anchor="middle" class="gauge-sub">processing / cycle</text>
                </svg>
              </div>
            </div>
          </template>

          <!-- ═══ TIME METRICS ═══ -->
          <template v-if="activeSection === 'time'">
            <div class="section-head">
              <span>Time Metrics (avg per case)</span>
              <button class="mode-toggle" @click="toggleMode('time')" :title="mode('time') === 'side' ? 'Combine into one chart' : 'Show side by side'">
                {{ mode('time') === 'side' ? 'Overlay' : 'Side-by-side' }}
              </button>
            </div>
            <!-- Side-by-side -->
            <div v-if="mode('time') === 'side'" class="chart-row">
              <div class="chart-box" v-for="(side, idx) in ['a','b']" :key="side">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }}</div>
                <svg :viewBox="`0 0 ${W} ${timeRows.length * 48 + P.t + P.b}`" class="chart-svg">
                  <template v-for="(r, i) in timeRows" :key="r.l">
                    <text :x="P.l - 6" :y="P.t + i * 48 + 14" text-anchor="end" class="bl">{{ r.l }}</text>
                    <text :x="P.l - 6" :y="P.t + i * 48 + 25" text-anchor="end" class="bl-sub">
                      <template v-for="(p, pi) in r.sub" :key="pi"><tspan v-if="p.t" baseline-shift="0">{{ p.t }}</tspan><tspan v-if="p.s" class="bl-subscript" baseline-shift="sub" font-size="5">{{ p.s }}</tspan></template>
                    </text>
                    <rect :x="P.l" :y="P.t + i * 48 + 6" :width="Math.max(2, s(r[side], 0, timeMax, 0, cW))" height="22" rx="3"
                      :fill="idx === 0 ? 'var(--accent-primary)' : 'var(--accent-warning)'" opacity="0.8"
                      @mouseenter="showTip($event, r.l, [{c: side, l: idx===0?nameA:nameB, v: fmtDur(r[side])}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <text :x="P.l + s(r[side], 0, timeMax, 0, cW) + 5" :y="P.t + i * 48 + 21" class="bv">{{ fmtDur(r[side]) }}</text>
                  </template>
                </svg>
              </div>
            </div>
            <!-- Overlay -->
            <div v-else class="chart-box chart-box-full">
              <svg :viewBox="`0 0 700 ${timeRows.length * 58 + P.t + P.b}`" class="chart-svg">
                <template v-for="(r, i) in timeRows" :key="r.l">
                  <text :x="P.l - 6" :y="P.t + i * 58 + 16" text-anchor="end" class="bl">{{ r.l }}</text>
                  <text :x="P.l - 6" :y="P.t + i * 58 + 27" text-anchor="end" class="bl-sub">
                    <template v-for="(p, pi) in r.sub" :key="pi"><tspan v-if="p.t" baseline-shift="0">{{ p.t }}</tspan><tspan v-if="p.s" class="bl-subscript" baseline-shift="sub" font-size="5">{{ p.s }}</tspan></template>
                  </text>
                  <rect :x="P.l" :y="P.t + i * 58 + 6" :width="Math.max(2, s(r.a, 0, timeMax, 0, 540))" height="16" rx="2" fill="var(--accent-primary)" opacity="0.8"
                    @mouseenter="showTip($event, r.l, [{c:'a',l:nameA,v:fmtDur(r.a)},{c:'b',l:nameB,v:fmtDur(r.b)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  <rect :x="P.l" :y="P.t + i * 58 + 26" :width="Math.max(2, s(r.b, 0, timeMax, 0, 540))" height="16" rx="2" fill="var(--accent-warning)" opacity="0.8"
                    @mouseenter="showTip($event, r.l, [{c:'a',l:nameA,v:fmtDur(r.a)},{c:'b',l:nameB,v:fmtDur(r.b)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  <text :x="P.l + Math.max(s(r.a, 0, timeMax, 0, 540), s(r.b, 0, timeMax, 0, 540)) + 5" :y="P.t + i * 58 + 18" class="bv">{{ nameA }} {{ fmtDur(r.a) }}</text>
                  <text :x="P.l + Math.max(s(r.a, 0, timeMax, 0, 540), s(r.b, 0, timeMax, 0, 540)) + 5" :y="P.t + i * 58 + 38" class="bv bv-b">{{ nameB }} {{ fmtDur(r.b) }}</text>
                </template>
              </svg>
              <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }}</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }}</span></div>
            </div>
          </template>

          <!-- ═══ WORKLOAD ═══ -->
          <template v-if="activeSection === 'workload'">
            <div class="section-head">
              <span>Workload Balance</span>
              <button class="mode-toggle" @click="toggleMode('workload')">{{ mode('workload') === 'side' ? 'Overlay' : 'Side-by-side' }}</button>
            </div>
            <div class="formula-hint">Gini = \u03A3|x\u1D62 \u2212 x\u2C7C| / (2n\u00B2\u03BC) &mdash; 0 = equal, 1 = one agent does all</div>
            <!-- Gini gauges -->
            <div class="chart-row">
              <div v-for="(side, idx) in ['a','b']" :key="'g-'+side" class="chart-box">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }} Gini: {{ cmp.workloadBalance[side].gini.toFixed(3) }}</div>
                <svg viewBox="0 0 180 100" class="gauge-svg">
                  <path :d="arc(90, 90, 60, -90, 90)" fill="none" stroke="var(--surface-overlay-border)" stroke-width="10" stroke-linecap="round" />
                  <path :d="arc(90, 90, 60, -90, -90 + cmp.workloadBalance[side].gini * 180)" fill="none"
                    :stroke="cmp.workloadBalance[side].gini < 0.3 ? 'var(--accent-success)' : cmp.workloadBalance[side].gini < 0.5 ? 'var(--accent-warning)' : 'var(--accent-danger)'"
                    stroke-width="10" stroke-linecap="round" />
                  <text x="90" y="82" text-anchor="middle" class="gauge-sub">{{ cmp.workloadBalance[side].gini < 0.3 ? 'Balanced' : cmp.workloadBalance[side].gini < 0.5 ? 'Moderate' : 'Imbalanced' }}</text>
                </svg>
              </div>
            </div>
            <!-- Agent task bars -->
            <div v-if="mode('workload') === 'side'" class="chart-row">
              <div v-for="(side, idx) in ['a','b']" :key="'wk-'+side" class="chart-box">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }} — Tasks/Agent</div>
                <svg :viewBox="`0 0 ${W} ${wkAgents.length * 26 + P.t + P.b}`" class="chart-svg">
                  <template v-for="(p, i) in wkAgents" :key="p.agent">
                    <text :x="P.l - 6" :y="P.t + i * 26 + 15" text-anchor="end" class="bl">{{ trunc(p.agent) }}</text>
                    <rect :x="P.l" :y="P.t + i * 26 + 2" :width="Math.max(2, s(p[side]?.taskCount || 0, 0, wkMax, 0, cW))" height="18" rx="2"
                      :fill="idx === 0 ? 'var(--accent-primary)' : 'var(--accent-warning)'" opacity="0.8"
                      @mouseenter="showTip($event, p.agent, [{c:side,l:idx===0?nameA:nameB,v:(p[side]?.taskCount||0)+' tasks'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <text :x="P.l + s(p[side]?.taskCount || 0, 0, wkMax, 0, cW) + 4" :y="P.t + i * 26 + 15" class="bv">{{ p[side]?.taskCount || 0 }}</text>
                  </template>
                </svg>
              </div>
            </div>
            <div v-else class="chart-box chart-box-full">
              <div class="chart-box-title">Tasks per Agent (combined)</div>
              <svg :viewBox="`0 0 700 ${wkAgents.length * 34 + P.t + P.b}`" class="chart-svg">
                <template v-for="(p, i) in wkAgents" :key="p.agent">
                  <text :x="P.l - 6" :y="P.t + i * 34 + 18" text-anchor="end" class="bl">{{ trunc(p.agent) }}</text>
                  <rect :x="P.l" :y="P.t + i * 34 + 2" :width="Math.max(2, s(p.a?.taskCount||0, 0, wkMax, 0, 540))" height="12" rx="2" fill="var(--accent-primary)" opacity="0.8"
                    @mouseenter="showTip($event, p.agent, [{c:'a',l:nameA,v:(p.a?.taskCount||0)+' tasks'},{c:'b',l:nameB,v:(p.b?.taskCount||0)+' tasks'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  <rect :x="P.l" :y="P.t + i * 34 + 16" :width="Math.max(2, s(p.b?.taskCount||0, 0, wkMax, 0, 540))" height="12" rx="2" fill="var(--accent-warning)" opacity="0.8"
                    @mouseenter="showTip($event, p.agent, [{c:'a',l:nameA,v:(p.a?.taskCount||0)+' tasks'},{c:'b',l:nameB,v:(p.b?.taskCount||0)+' tasks'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                </template>
              </svg>
              <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }}</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }}</span></div>
            </div>
          </template>

          <!-- ═══ UTILIZATION ═══ -->
          <template v-if="activeSection === 'utilization'">
            <div class="section-head">
              <span>Resource Utilization</span>
              <button class="mode-toggle" @click="toggleMode('util')">{{ mode('util') === 'side' ? 'Overlay' : 'Side-by-side' }}</button>
            </div>
            <div class="formula-hint">Utilization = \u03A3(t<sub>end</sub> \u2212 t<sub>start</sub>) / T<sub>total</sub> &mdash; Throughput = tasks / T<sub>total</sub>(hr)</div>
            <div v-if="mode('util') === 'side'" class="chart-row">
              <div v-for="(side, idx) in ['a','b']" :key="'ut-'+side" class="chart-box">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }} — Utilization %</div>
                <svg :viewBox="`0 0 ${W} ${(cmp.agentComparison||[]).length * 26 + P.t + P.b}`" class="chart-svg">
                  <template v-for="(p, i) in cmp.agentComparison" :key="p.agent">
                    <text :x="P.l - 6" :y="P.t + i * 26 + 15" text-anchor="end" class="bl">{{ trunc(p.agent) }}</text>
                    <rect :x="P.l" :y="P.t + i * 26 + 2" :width="Math.max(2, (p[side]?.utilization || 0) / 100 * cW)" height="18" rx="2"
                      :fill="idx === 0 ? 'var(--accent-primary)' : 'var(--accent-warning)'" opacity="0.8"
                      @mouseenter="showTip($event, p.agent, [{c:side,l:'Util',v:fmtPct(p[side]?.utilization||0)},{c:side,l:'Tasks/hr',v:fmtNum(p[side]?.throughput||0)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <text :x="P.l + (p[side]?.utilization || 0) / 100 * cW + 4" :y="P.t + i * 26 + 15" class="bv">{{ fmtPct(p[side]?.utilization || 0) }}</text>
                  </template>
                </svg>
              </div>
            </div>
            <div v-else class="chart-box chart-box-full">
              <div class="chart-box-title">Utilization % (combined)</div>
              <svg :viewBox="`0 0 700 ${(cmp.agentComparison||[]).length * 34 + P.t + P.b}`" class="chart-svg">
                <template v-for="(p, i) in cmp.agentComparison" :key="p.agent">
                  <text :x="P.l - 6" :y="P.t + i * 34 + 18" text-anchor="end" class="bl">{{ trunc(p.agent) }}</text>
                  <rect :x="P.l" :y="P.t + i * 34 + 2" :width="Math.max(2, (p.a?.utilization||0)/100*540)" height="12" rx="2" fill="var(--accent-primary)" opacity="0.8"
                    @mouseenter="showTip($event, p.agent, [{c:'a',l:nameA+' Util',v:fmtPct(p.a?.utilization||0)},{c:'b',l:nameB+' Util',v:fmtPct(p.b?.utilization||0)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  <rect :x="P.l" :y="P.t + i * 34 + 16" :width="Math.max(2, (p.b?.utilization||0)/100*540)" height="12" rx="2" fill="var(--accent-warning)" opacity="0.8"
                    @mouseenter="showTip($event, p.agent, [{c:'a',l:nameA+' Util',v:fmtPct(p.a?.utilization||0)},{c:'b',l:nameB+' Util',v:fmtPct(p.b?.utilization||0)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                </template>
              </svg>
              <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }}</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }}</span></div>
            </div>
            <!-- Throughput lollipop always combined -->
            <div class="chart-box chart-box-full">
              <div class="chart-box-title">Throughput (tasks/hr)</div>
              <svg :viewBox="`0 0 700 ${(cmp.agentComparison||[]).length * 24 + P.t + P.b}`" class="chart-svg">
                <template v-for="(p, i) in cmp.agentComparison" :key="'lp-'+p.agent">
                  <text :x="P.l - 6" :y="P.t + i * 24 + 12" text-anchor="end" class="bl">{{ trunc(p.agent) }}</text>
                  <line :x1="P.l" :x2="P.l + 540" :y1="P.t + i * 24 + 8" :y2="P.t + i * 24 + 8" stroke="var(--surface-overlay-border)" stroke-width="1" />
                  <circle v-if="p.a" :cx="P.l + s(p.a.throughput, 0, utMax, 0, 540)" :cy="P.t + i * 24 + 8" r="4.5" fill="var(--accent-primary)"
                    @mouseenter="showTip($event, p.agent, [{c:'a',l:nameA,v:fmtNum(p.a.throughput)+'/hr'},{c:'b',l:nameB,v:fmtNum(p.b?.throughput||0)+'/hr'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  <circle v-if="p.b" :cx="P.l + s(p.b.throughput, 0, utMax, 0, 540)" :cy="P.t + i * 24 + 8" r="4.5" fill="var(--accent-warning)"
                    @mouseenter="showTip($event, p.agent, [{c:'a',l:nameA,v:fmtNum(p.a?.throughput||0)+'/hr'},{c:'b',l:nameB,v:fmtNum(p.b.throughput)+'/hr'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                </template>
              </svg>
              <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }}</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }}</span></div>
            </div>
          </template>

          <!-- ═══ AGENT TIME (per-agent drill-down) ═══ -->
          <template v-if="activeSection === 'agentTime'">
            <div class="section-head">
              <span>Agent Time Breakdown</span>
              <button class="mode-toggle" @click="toggleMode('agentTime')">{{ mode('agentTime') === 'side' ? 'Overlay' : 'Side-by-side' }}</button>
            </div>
            <div class="formula-hint">Per-agent wallclock: processing + waiting + idle = total duration</div>
            <!-- Side-by-side -->
            <div v-if="mode('agentTime') === 'side'" class="chart-row">
              <div class="chart-box" v-for="(side, idx) in ['a','b']" :key="'at-'+side">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }}</div>
                <svg :viewBox="`0 0 ${P.l + agentTimeBarW + 10} ${agentTimeRows.length * 28 + 8}`" class="chart-svg">
                  <template v-for="(r, i) in agentTimeRows" :key="r.agent">
                    <text :x="P.l - 6" :y="i * 28 + 18" text-anchor="end" class="bl">{{ trunc(r.agent) }}</text>
                    <template v-if="r[side]">
                      <defs><clipPath :id="`clip-at-${side}-${i}`"><rect :x="P.l" :y="i * 28 + 4" :width="agentTimeBarW" height="20" rx="3" /></clipPath></defs>
                      <g :clip-path="`url(#clip-at-${side}-${i})`">
                        <rect :x="P.l" :y="i * 28 + 4" :width="r[side].total > 0 ? (r[side].proc / r[side].total) * agentTimeBarW : 0" height="20" fill="var(--accent-success)" opacity="0.8"
                          @mouseenter="showTip($event, r.agent, [{c:'g',l:'Processing',v:fmtDur(r[side].proc)+' ('+fmtPct(r[side].procPct)+')'},{c:'w',l:'Waiting',v:fmtDur(r[side].wait)+' ('+fmtPct(r[side].waitPct)+')'},{c:'r',l:'Idle',v:fmtDur(r[side].idle)+' ('+fmtPct(r[side].idlePct)+')'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                        <rect :x="P.l + (r[side].total > 0 ? (r[side].proc / r[side].total) * agentTimeBarW : 0)" :y="i * 28 + 4"
                          :width="r[side].total > 0 ? (r[side].wait / r[side].total) * agentTimeBarW : 0" height="20" fill="var(--accent-warning)" opacity="0.8"
                          @mouseenter="showTip($event, r.agent, [{c:'g',l:'Processing',v:fmtDur(r[side].proc)+' ('+fmtPct(r[side].procPct)+')'},{c:'w',l:'Waiting',v:fmtDur(r[side].wait)+' ('+fmtPct(r[side].waitPct)+')'},{c:'r',l:'Idle',v:fmtDur(r[side].idle)+' ('+fmtPct(r[side].idlePct)+')'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                        <rect :x="P.l + (r[side].total > 0 ? ((r[side].proc + r[side].wait) / r[side].total) * agentTimeBarW : 0)" :y="i * 28 + 4"
                          :width="r[side].total > 0 ? (r[side].idle / r[side].total) * agentTimeBarW : 0" height="20" fill="var(--accent-danger)" opacity="0.35"
                          @mouseenter="showTip($event, r.agent, [{c:'g',l:'Processing',v:fmtDur(r[side].proc)+' ('+fmtPct(r[side].procPct)+')'},{c:'w',l:'Waiting',v:fmtDur(r[side].wait)+' ('+fmtPct(r[side].waitPct)+')'},{c:'r',l:'Idle',v:fmtDur(r[side].idle)+' ('+fmtPct(r[side].idlePct)+')'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                      </g>
                    </template>
                    <text v-else :x="P.l + 4" :y="i * 28 + 18" class="bv" fill="var(--surface-overlay-text-muted)">n/a</text>
                  </template>
                </svg>
                <div class="mini-legend">
                  <span class="ml-i"><span class="ml-s" style="background:var(--accent-success)"></span>Processing</span>
                  <span class="ml-i"><span class="ml-s" style="background:var(--accent-warning)"></span>Waiting</span>
                  <span class="ml-i"><span class="ml-s" style="background:var(--accent-danger);opacity:.35"></span>Idle</span>
                </div>
              </div>
            </div>
            <!-- Overlay: paired rows per agent -->
            <div v-else class="chart-box chart-box-full">
              <div class="chart-box-title">Agent Time (combined)</div>
              <svg :viewBox="`0 0 700 ${agentTimeRows.length * 42 + 8}`" class="chart-svg">
                <template v-for="(r, i) in agentTimeRows" :key="r.agent">
                  <text :x="P.l - 6" :y="i * 42 + 16" text-anchor="end" class="bl">{{ trunc(r.agent) }}</text>
                  <template v-if="r.a">
                    <defs><clipPath :id="`clip-ato-a-${i}`"><rect :x="P.l" :y="i * 42 + 2" width="540" height="15" rx="2" /></clipPath></defs>
                    <g :clip-path="`url(#clip-ato-a-${i})`">
                      <rect :x="P.l" :y="i * 42 + 2" :width="r.a.total > 0 ? (r.a.proc / r.a.total) * 540 : 0" height="15" fill="var(--accent-success)" opacity="0.7"
                        @mouseenter="showTip($event, r.agent + ' ('+nameA+')', [{c:'g',l:'Proc',v:fmtDur(r.a.proc)},{c:'w',l:'Wait',v:fmtDur(r.a.wait)},{c:'r',l:'Idle',v:fmtDur(r.a.idle)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                      <rect :x="P.l + (r.a.total > 0 ? (r.a.proc / r.a.total) * 540 : 0)" :y="i * 42 + 2"
                        :width="r.a.total > 0 ? (r.a.wait / r.a.total) * 540 : 0" height="15" fill="var(--accent-warning)" opacity="0.7"
                        @mouseenter="showTip($event, r.agent + ' ('+nameA+')', [{c:'g',l:'Proc',v:fmtDur(r.a.proc)},{c:'w',l:'Wait',v:fmtDur(r.a.wait)},{c:'r',l:'Idle',v:fmtDur(r.a.idle)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                      <rect :x="P.l + (r.a.total > 0 ? ((r.a.proc + r.a.wait) / r.a.total) * 540 : 0)" :y="i * 42 + 2"
                        :width="r.a.total > 0 ? (r.a.idle / r.a.total) * 540 : 0" height="15" fill="var(--accent-danger)" opacity="0.3"
                        @mouseenter="showTip($event, r.agent + ' ('+nameA+')', [{c:'g',l:'Proc',v:fmtDur(r.a.proc)},{c:'w',l:'Wait',v:fmtDur(r.a.wait)},{c:'r',l:'Idle',v:fmtDur(r.a.idle)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    </g>
                  </template>
                  <template v-if="r.b">
                    <defs><clipPath :id="`clip-ato-b-${i}`"><rect :x="P.l" :y="i * 42 + 20" width="540" height="15" rx="2" /></clipPath></defs>
                    <g :clip-path="`url(#clip-ato-b-${i})`">
                      <rect :x="P.l" :y="i * 42 + 20" :width="r.b.total > 0 ? (r.b.proc / r.b.total) * 540 : 0" height="15" fill="var(--accent-success)" opacity="0.7"
                        @mouseenter="showTip($event, r.agent + ' ('+nameB+')', [{c:'g',l:'Proc',v:fmtDur(r.b.proc)},{c:'w',l:'Wait',v:fmtDur(r.b.wait)},{c:'r',l:'Idle',v:fmtDur(r.b.idle)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                      <rect :x="P.l + (r.b.total > 0 ? (r.b.proc / r.b.total) * 540 : 0)" :y="i * 42 + 20"
                        :width="r.b.total > 0 ? (r.b.wait / r.b.total) * 540 : 0" height="15" fill="var(--accent-warning)" opacity="0.7"
                        @mouseenter="showTip($event, r.agent + ' ('+nameB+')', [{c:'g',l:'Proc',v:fmtDur(r.b.proc)},{c:'w',l:'Wait',v:fmtDur(r.b.wait)},{c:'r',l:'Idle',v:fmtDur(r.b.idle)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                      <rect :x="P.l + (r.b.total > 0 ? ((r.b.proc + r.b.wait) / r.b.total) * 540 : 0)" :y="i * 42 + 20"
                        :width="r.b.total > 0 ? (r.b.idle / r.b.total) * 540 : 0" height="15" fill="var(--accent-danger)" opacity="0.3"
                        @mouseenter="showTip($event, r.agent + ' ('+nameB+')', [{c:'g',l:'Proc',v:fmtDur(r.b.proc)},{c:'w',l:'Wait',v:fmtDur(r.b.wait)},{c:'r',l:'Idle',v:fmtDur(r.b.idle)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    </g>
                  </template>
                </template>
              </svg>
              <div class="chart-legend">
                <span class="lg-i"><span class="lg-s" style="background:var(--accent-success)"></span>Processing</span>
                <span class="lg-i"><span class="lg-s" style="background:var(--accent-warning)"></span>Waiting</span>
                <span class="lg-i"><span class="lg-s" style="background:var(--accent-danger);opacity:.35"></span>Idle</span>
                <span class="lg-i" style="margin-left:12px"><span class="lg-s swa"></span>{{ nameA }} (top)</span>
                <span class="lg-i"><span class="lg-s swb"></span>{{ nameB }} (bottom)</span>
              </div>
            </div>
            <!-- Delta highlights: utilization change -->
            <div class="chart-box chart-box-full" v-if="utilDeltaRows.length">
              <div class="chart-box-title">Utilization Change ({{ nameA }} → {{ nameB }})</div>
              <svg :viewBox="`0 0 700 ${utilDeltaRows.length * 22 + P.t + P.b}`" class="chart-svg">
                <line x1="350" x2="350" :y1="P.t" :y2="P.t + utilDeltaRows.length * 22" stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" stroke-dasharray="2" />
                <template v-for="(r, i) in utilDeltaRows" :key="'ud-'+r.agent">
                  <text :x="P.l - 6" :y="P.t + i * 22 + 14" text-anchor="end" class="bl">{{ trunc(r.agent) }}</text>
                  <rect :x="r.utilDelta >= 0 ? 350 : 350 - (Math.abs(r.utilDelta) / utilDeltaMax) * 270" :y="P.t + i * 22 + 2"
                    :width="(Math.abs(r.utilDelta) / utilDeltaMax) * 270" height="16" rx="2"
                    :fill="r.utilDelta >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'" :opacity="r.utilDelta >= 0 ? 0.7 : 0.5"
                    @mouseenter="showTip($event, r.agent, [{c:'a',l:nameA,v:fmtPct(r.a?.util||0)},{c:'b',l:nameB,v:fmtPct(r.b?.util||0)},{c:r.utilDelta>=0?'g':'r',l:'Delta',v:(r.utilDelta>=0?'+':'')+fmtPct(r.utilDelta)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  <text :x="r.utilDelta >= 0 ? 350 + (Math.abs(r.utilDelta) / utilDeltaMax) * 270 + 5 : 350 - (Math.abs(r.utilDelta) / utilDeltaMax) * 270 - 5"
                    :y="P.t + i * 22 + 14" :text-anchor="r.utilDelta >= 0 ? 'start' : 'end'" class="bv" :fill="r.utilDelta >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'">
                    {{ (r.utilDelta >= 0 ? '+' : '') + fmtPct(r.utilDelta) }}
                  </text>
                </template>
              </svg>
            </div>
          </template>

          <!-- ═══ ASSIGNMENT ═══ -->
          <template v-if="activeSection === 'assignment'">
            <div class="section-head"><span>Assignment Types</span></div>
            <div class="formula-hint">Distribution of task assignment methods &mdash; % = type count / total tasks</div>
            <div class="chart-row" v-if="cmp.assignmentTypes.a.types.length || cmp.assignmentTypes.b.types.length">
              <div v-for="(side, idx) in ['a','b']" :key="side" class="chart-box">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }}</div>
                <svg viewBox="0 0 160 160" class="donut-svg" v-if="cmp.assignmentTypes[side].types.length">
                  <path v-for="(sl, si) in donutSlices(cmp.assignmentTypes[side].types)" :key="si"
                    :d="arc(80, 80, 56, sl.s, sl.e)" fill="none" :stroke="sl.c" stroke-width="20"
                    @mouseenter="showTip($event, sl.type, [{c:'x',l:'Count',v:sl.count},{c:'x',l:'%',v:fmtPct(sl.pct)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  <text x="80" y="78" text-anchor="middle" class="donut-big">{{ cmp.assignmentTypes[side].total }}</text>
                  <text x="80" y="92" text-anchor="middle" class="donut-sub">tasks</text>
                </svg>
                <div v-else class="chart-empty">No data</div>
                <div class="donut-leg">
                  <div v-for="(sl, si) in donutSlices(cmp.assignmentTypes[side].types)" :key="si" class="dl-row">
                    <span class="dl-shape" v-html="markerSvg(sl.type, sl.c, 11)"></span>
                    <span class="dl-label">{{ sl.type }}</span>
                    <span class="dl-val">{{ sl.count }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="chart-empty">No assignment type data available</div>
          </template>

          <!-- ═══ VOLUNTEERING ═══ -->
          <template v-if="activeSection === 'volunteering'">
            <div class="section-head"><span>Volunteering Patterns</span></div>
            <template v-if="cmp.volunteering.a.tasksWithVolunteers > 0 || cmp.volunteering.b.tasksWithVolunteers > 0">
              <div class="formula-hint">Vol. Rate = tasks with volunteers / total tasks &mdash; Avg Vol/Task = total vol. / tasks with vol.</div>
              <div class="kpi-strip kpi-strip-sm">
                <div class="kpi-chip" v-for="(side, idx) in ['a','b']" :key="side">
                  <div class="kpi-chip-label" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }} Vol. Rate</div>
                  <div class="kpi-chip-vals"><span :class="'v-' + side">{{ fmtPct(cmp.volunteering[side].volunteerRate) }}</span></div>
                </div>
                <div class="kpi-chip" v-for="(side, idx) in ['a','b']" :key="'avg-'+side">
                  <div class="kpi-chip-label" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }} Avg Vol/Task</div>
                  <div class="kpi-chip-vals"><span :class="'v-' + side">{{ fmtNum(cmp.volunteering[side].avgVolunteersPerTask) }}</span></div>
                </div>
              </div>
              <div class="chart-box chart-box-full">
                <div class="chart-box-title">Volunteer Count per Agent</div>
                <svg :viewBox="`0 0 700 ${volRows.length * 34 + P.t + P.b}`" class="chart-svg">
                  <template v-for="(r, i) in volRows" :key="r.agent">
                    <text :x="P.l - 6" :y="P.t + i * 34 + 18" text-anchor="end" class="bl">{{ trunc(r.agent) }}</text>
                    <rect :x="P.l" :y="P.t + i * 34 + 2" :width="Math.max(2, s(r.volA, 0, volMax, 0, 540))" height="12" rx="2" fill="var(--accent-primary)" opacity="0.8"
                      @mouseenter="showTip($event, r.agent, [{c:'a',l:nameA+' vol',v:r.volA},{c:'a',l:nameA+' assigned',v:r.assA},{c:'b',l:nameB+' vol',v:r.volB},{c:'b',l:nameB+' assigned',v:r.assB}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <rect :x="P.l" :y="P.t + i * 34 + 16" :width="Math.max(2, s(r.volB, 0, volMax, 0, 540))" height="12" rx="2" fill="var(--accent-warning)" opacity="0.8"
                      @mouseenter="showTip($event, r.agent, [{c:'a',l:nameA+' vol',v:r.volA},{c:'a',l:nameA+' assigned',v:r.assA},{c:'b',l:nameB+' vol',v:r.volB},{c:'b',l:nameB+' assigned',v:r.assB}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  </template>
                </svg>
                <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }}</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }}</span></div>
              </div>
            </template>
            <div v-else class="chart-empty">No volunteering data available</div>
          </template>

          <!-- ═══ EFFICIENCY ═══ -->
          <template v-if="activeSection === 'efficiency'">
            <div class="section-head"><span>Flow Efficiency</span></div>
            <div class="formula-hint">Efficiency = processing / cycle time &times; 100% &mdash; per case, then averaged</div>
            <div class="chart-row">
              <div v-for="(side, idx) in ['a','b']" :key="side" class="chart-box">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }}</div>
                <svg viewBox="0 0 160 160" class="gauge-svg">
                  <circle cx="80" cy="80" r="58" fill="none" stroke="var(--surface-overlay-border)" stroke-width="10" />
                  <path :d="arc(80, 80, 58, 0, Math.min(359.9, (cmp.deltas.flowEfficiency[side] / 100) * 360))"
                    fill="none" :stroke="idx === 0 ? 'var(--accent-primary)' : 'var(--accent-warning)'" stroke-width="10" stroke-linecap="round" />
                  <text x="80" y="78" text-anchor="middle" class="gauge-big">{{ fmtPct(cmp.deltas.flowEfficiency[side]) }}</text>
                  <text x="80" y="94" text-anchor="middle" class="gauge-sub">processing / cycle</text>
                </svg>
              </div>
            </div>
            <div v-if="effHist" class="chart-box chart-box-full">
              <div class="chart-box-title">Distribution per Case</div>
              <svg :viewBox="`0 0 700 ${H}`" class="chart-svg">
                <rect v-for="(c, bi) in effHist.bA" :key="'ea'+bi" :x="60 + (bi / effHist.n) * 600" :y="P.t + cH - (c / effHist.mc) * cH" :width="Math.max(1, 600 / effHist.n * 0.45)" :height="(c / effHist.mc) * cH" fill="var(--accent-primary)" opacity="0.7" rx="1"
                  @mouseenter="showTip($event, (bi*5)+'–'+((bi+1)*5)+'%', [{c:'a',l:nameA,v:c+' cases'},{c:'b',l:nameB,v:effHist.bB[bi]+' cases'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                <rect v-for="(c, bi) in effHist.bB" :key="'eb'+bi" :x="60 + (bi / effHist.n) * 600 + 600 / effHist.n * 0.45" :y="P.t + cH - (c / effHist.mc) * cH" :width="Math.max(1, 600 / effHist.n * 0.45)" :height="(c / effHist.mc) * cH" fill="var(--accent-warning)" opacity="0.7" rx="1"
                  @mouseenter="showTip($event, (bi*5)+'–'+((bi+1)*5)+'%', [{c:'a',l:nameA,v:effHist.bA[bi]+' cases'},{c:'b',l:nameB,v:c+' cases'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                <text v-for="i in 5" :key="'xl'+i" :x="60 + ((i-1)/4) * 600" :y="H - 4" text-anchor="middle" class="ax">{{ (i-1)*25 }}%</text>
                <line :x1="60" :x2="660" :y1="P.t + cH" :y2="P.t + cH" stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" />
              </svg>
              <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }}</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }}</span></div>
            </div>
          </template>

          <!-- ═══ THROUGHPUT ═══ -->
          <template v-if="activeSection === 'throughput' && thHist">
            <div class="section-head"><span>Case Throughput</span></div>
            <div class="formula-hint">WIP = \u03BB \u00D7 CT (Little's Law) &mdash; \u03BB = cases / T<sub>total</sub>(hr), CT = avg cycle time</div>
            <div class="chart-box chart-box-full">
              <div class="chart-box-title">Cycle Time Distribution</div>
              <svg :viewBox="`0 0 700 ${H}`" class="chart-svg">
                <rect v-for="(c, bi) in thHist.bA" :key="'ta'+bi" :x="60 + (bi / thHist.n) * 600" :y="P.t + cH - (c / thHist.mc) * cH" :width="Math.max(1, 600/thHist.n*0.45)" :height="(c/thHist.mc)*cH" fill="var(--accent-primary)" opacity="0.7" rx="1"
                  @mouseenter="showTip($event, fmtDur(thHist.mn + bi*thHist.bw) + '–' + fmtDur(thHist.mn + (bi+1)*thHist.bw), [{c:'a',l:nameA,v:c+' cases'},{c:'b',l:nameB,v:thHist.bB[bi]+' cases'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                <rect v-for="(c, bi) in thHist.bB" :key="'tb'+bi" :x="60 + (bi / thHist.n) * 600 + 600/thHist.n*0.45" :y="P.t + cH - (c / thHist.mc) * cH" :width="Math.max(1, 600/thHist.n*0.45)" :height="(c/thHist.mc)*cH" fill="var(--accent-warning)" opacity="0.7" rx="1"
                  @mouseenter="showTip($event, fmtDur(thHist.mn + bi*thHist.bw) + '–' + fmtDur(thHist.mn + (bi+1)*thHist.bw), [{c:'a',l:nameA,v:thHist.bA[bi]+' cases'},{c:'b',l:nameB,v:c+' cases'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                <text v-for="i in 5" :key="'thx'+i" :x="60 + ((i-1)/4) * 600" :y="H - 4" text-anchor="middle" class="ax">{{ fmtDur(thHist.mn + ((i-1)/4) * (thHist.mx - thHist.mn)) }}</text>
                <line :x1="60" :x2="660" :y1="P.t + cH" :y2="P.t + cH" stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" />
              </svg>
              <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }} (n={{ cmp.caseCycleTimesA.length }})</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }} (n={{ cmp.caseCycleTimesB.length }})</span></div>
            </div>
            <!-- Box-whisker -->
            <div class="chart-box chart-box-full" v-if="thHist.boxA && thHist.boxB">
              <div class="chart-box-title">Box Plot</div>
              <svg :viewBox="`0 0 700 110`" class="chart-svg">
                <template v-for="(box, idx) in [thHist.boxA, thHist.boxB]" :key="'bx'+idx">
                  <text :x="54" :y="30 + idx * 44" text-anchor="end" class="bl">{{ idx === 0 ? nameA : nameB }}</text>
                  <line :x1="60 + s(box.min, thHist.mn, thHist.mx, 0, 600)" :x2="60 + s(box.max, thHist.mn, thHist.mx, 0, 600)" :y1="26 + idx * 44" :y2="26 + idx * 44" :stroke="idx === 0 ? 'var(--accent-primary)' : 'var(--accent-warning)'" stroke-width="1.5" />
                  <rect :x="60 + s(box.q1, thHist.mn, thHist.mx, 0, 600)" :y="14 + idx * 44" :width="s(box.q3, thHist.mn, thHist.mx, 0, 600) - s(box.q1, thHist.mn, thHist.mx, 0, 600)" height="24" rx="3" :fill="idx === 0 ? 'var(--accent-primary)' : 'var(--accent-warning)'" opacity="0.25" :stroke="idx === 0 ? 'var(--accent-primary)' : 'var(--accent-warning)'" stroke-width="1.5" />
                  <line :x1="60 + s(box.med, thHist.mn, thHist.mx, 0, 600)" :x2="60 + s(box.med, thHist.mn, thHist.mx, 0, 600)" :y1="14 + idx * 44" :y2="38 + idx * 44" stroke="var(--text-primary)" stroke-width="2" />
                </template>
                <text v-for="i in 5" :key="'bxx'+i" :x="60 + ((i-1)/4) * 600" y="100" text-anchor="middle" class="ax">{{ fmtDur(thHist.mn + ((i-1)/4) * (thHist.mx - thHist.mn)) }}</text>
              </svg>
              <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }} med {{ fmtDur(thHist.boxA.med) }}</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }} med {{ fmtDur(thHist.boxB.med) }}</span></div>
            </div>
          </template>

          <!-- ═══ HANDOVERS ═══ -->
          <template v-if="activeSection === 'handovers' && hoData">
            <div class="section-head"><span>Handovers</span></div>
            <div class="formula-hint">Handover = consecutive agent change when tasks sorted by start time, counted per case</div>
            <div class="kpi-strip kpi-strip-sm">
              <div class="kpi-chip"><div class="kpi-chip-label">Avg/Case</div><div class="kpi-chip-vals"><span class="v-a">{{ fmtNum(cmp.deltas.handovers.a) }}</span><span class="v-b">{{ fmtNum(cmp.deltas.handovers.b) }}</span></div></div>
            </div>
            <div class="chart-row">
              <div v-for="(side, idx) in ['a','b']" :key="side" class="chart-box heatmap-box">
                <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }} Matrix</div>
                <div v-if="hoData[side].agents.length" class="hm-wrap">
                  <svg :viewBox="`0 0 ${hoData[side].agents.length * 28 + 90} ${hoData[side].agents.length * 28 + 70}`" class="hm-svg">
                    <text v-for="(ag, j) in hoData[side].agents" :key="'ch'+j" :x="90 + j * 28 + 14" :y="52" text-anchor="end" class="hm-lbl" :transform="`rotate(-45 ${90 + j * 28 + 14} 52)`">{{ ag.length > 10 ? ag.slice(0,8)+'..' : ag }}</text>
                    <template v-for="(agF, ri) in hoData[side].agents" :key="'r'+ri">
                      <text :x="86" :y="70 + ri * 28 + 18" text-anchor="end" class="hm-lbl">{{ agF.length > 10 ? agF.slice(0,8)+'..' : agF }}</text>
                      <rect v-for="(agT, ci) in hoData[side].agents" :key="'c'+ri+ci" :x="90 + ci * 28" :y="70 + ri * 28" width="26" height="26" rx="3"
                        :fill="idx===0?'var(--accent-primary)':'var(--accent-warning)'" :opacity="hoData[side].matrix[ri][ci] > 0 ? Math.max(0.1, hoData[side].matrix[ri][ci] / Math.max(...hoData[side].matrix.flat(), 1)) : 0.03"
                        @mouseenter="showTip($event, agF + ' → ' + agT, [{c:'x',l:'Count',v:hoData[side].matrix[ri][ci]}])" @mousemove="moveTip" @mouseleave="hideTip" />
                      <text v-for="(agT, ci) in hoData[side].agents" :key="'t'+ri+ci" :x="90 + ci * 28 + 13" :y="70 + ri * 28 + 17" text-anchor="middle" class="hm-cell" v-show="hoData[side].matrix[ri][ci] > 0">{{ hoData[side].matrix[ri][ci] }}</text>
                    </template>
                  </svg>
                </div>
                <div v-else class="chart-empty">No handover data</div>
              </div>
            </div>
          </template>

          <!-- ═══ CASE VARIANTS ═══ -->
          <template v-if="activeSection === 'caseVariants'">
            <div class="section-head"><span>Case Variants</span></div>
            <div class="formula-hint">Case complexity: how many tasks and resources each case involves</div>
            <template v-if="caseVariantsData">
              <!-- Scatter: tasks vs cycle time -->
              <div class="chart-box chart-box-full">
                <div class="chart-box-title">Tasks per Case vs Cycle Time</div>
                <svg :viewBox="`0 0 700 ${H + 20}`" class="chart-svg">
                  <!-- Axes -->
                  <line :x1="60" :x2="660" :y1="P.t + cH" :y2="P.t + cH" stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" />
                  <line :x1="60" :x2="60" :y1="P.t" :y2="P.t + cH" stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" />
                  <text v-for="i in 5" :key="'sx'+i" :x="60 + ((i-1)/4) * 600" :y="H + 12" text-anchor="middle" class="ax">{{ Math.round(((i-1)/4) * caseVariantsData.maxTasks) }}</text>
                  <text v-for="i in 5" :key="'sy'+i" x="56" :y="P.t + cH - ((i-1)/4) * cH + 3" text-anchor="end" class="ax">{{ fmtDur(((i-1)/4) * caseVariantsData.maxCycle) }}</text>
                  <text x="380" :y="H + 20" text-anchor="middle" class="ax">Tasks per case</text>
                  <!-- Points A -->
                  <circle v-for="(c, ci) in caseVariantsData.cmA" :key="'sa'+ci"
                    :cx="60 + (c.taskCount / caseVariantsData.maxTasks) * 600"
                    :cy="P.t + cH - (c.cycleTime / caseVariantsData.maxCycle) * cH"
                    r="3" fill="var(--accent-primary)" opacity="0.4"
                    @mouseenter="showTip($event, 'Case '+c.caseId+' ('+nameA+')', [{c:'a',l:'Tasks',v:c.taskCount},{c:'a',l:'Cycle',v:fmtDur(c.cycleTime)},{c:'a',l:'Resources',v:c.resourceCount}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  <!-- Points B -->
                  <circle v-for="(c, ci) in caseVariantsData.cmB" :key="'sb'+ci"
                    :cx="60 + (c.taskCount / caseVariantsData.maxTasks) * 600"
                    :cy="P.t + cH - (c.cycleTime / caseVariantsData.maxCycle) * cH"
                    r="3" fill="var(--accent-warning)" opacity="0.4"
                    @mouseenter="showTip($event, 'Case '+c.caseId+' ('+nameB+')', [{c:'b',l:'Tasks',v:c.taskCount},{c:'b',l:'Cycle',v:fmtDur(c.cycleTime)},{c:'b',l:'Resources',v:c.resourceCount}])" @mousemove="moveTip" @mouseleave="hideTip" />
                </svg>
                <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }} (n={{ caseVariantsData.cmA.length }})</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }} (n={{ caseVariantsData.cmB.length }})</span></div>
              </div>
              <!-- Task count histogram -->
              <div class="chart-row">
                <div class="chart-box chart-box-full">
                  <div class="chart-box-title">Tasks per Case Distribution</div>
                  <svg :viewBox="`0 0 700 ${H}`" class="chart-svg">
                    <rect v-for="(c, bi) in caseVariantsData.tHistA" :key="'ta'+bi"
                      :x="60 + (bi / caseVariantsData.taskBins) * 600"
                      :y="P.t + cH - (c / caseVariantsData.tHistMax) * cH"
                      :width="Math.max(1, 600 / caseVariantsData.taskBins * 0.45)"
                      :height="(c / caseVariantsData.tHistMax) * cH"
                      fill="var(--accent-primary)" opacity="0.7" rx="1"
                      @mouseenter="showTip($event, Math.round(bi * caseVariantsData.taskBw) + (caseVariantsData.taskBw > 1 ? '–'+Math.round((bi+1)*caseVariantsData.taskBw-1) : '') + ' tasks', [{c:'a',l:nameA,v:c+' cases'},{c:'b',l:nameB,v:caseVariantsData.tHistB[bi]+' cases'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <rect v-for="(c, bi) in caseVariantsData.tHistB" :key="'tb'+bi"
                      :x="60 + (bi / caseVariantsData.taskBins) * 600 + 600 / caseVariantsData.taskBins * 0.45"
                      :y="P.t + cH - (c / caseVariantsData.tHistMax) * cH"
                      :width="Math.max(1, 600 / caseVariantsData.taskBins * 0.45)"
                      :height="(c / caseVariantsData.tHistMax) * cH"
                      fill="var(--accent-warning)" opacity="0.7" rx="1"
                      @mouseenter="showTip($event, Math.round(bi * caseVariantsData.taskBw) + (caseVariantsData.taskBw > 1 ? '–'+Math.round((bi+1)*caseVariantsData.taskBw-1) : '') + ' tasks', [{c:'a',l:nameA,v:caseVariantsData.tHistA[bi]+' cases'},{c:'b',l:nameB,v:c+' cases'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <text v-for="i in 5" :key="'thx'+i" :x="60 + ((i-1)/4) * 600" :y="H - 4" text-anchor="middle" class="ax">{{ Math.round(((i-1)/4) * caseVariantsData.maxTasks) }}</text>
                    <line :x1="60" :x2="660" :y1="P.t + cH" :y2="P.t + cH" stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" />
                  </svg>
                  <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }}</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }}</span></div>
                </div>
              </div>
              <!-- Resource count histogram -->
              <div class="chart-row">
                <div class="chart-box chart-box-full">
                  <div class="chart-box-title">Resources per Case Distribution</div>
                  <svg :viewBox="`0 0 700 ${H}`" class="chart-svg">
                    <rect v-for="(c, bi) in caseVariantsData.rHistA" :key="'ra'+bi"
                      :x="60 + (bi / caseVariantsData.resBins) * 600"
                      :y="P.t + cH - (c / caseVariantsData.rHistMax) * cH"
                      :width="Math.max(1, 600 / caseVariantsData.resBins * 0.45)"
                      :height="(c / caseVariantsData.rHistMax) * cH"
                      fill="var(--accent-primary)" opacity="0.7" rx="1"
                      @mouseenter="showTip($event, Math.round(bi * caseVariantsData.resBw) + (caseVariantsData.resBw > 1 ? '–'+Math.round((bi+1)*caseVariantsData.resBw-1) : '') + ' resources', [{c:'a',l:nameA,v:c+' cases'},{c:'b',l:nameB,v:caseVariantsData.rHistB[bi]+' cases'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <rect v-for="(c, bi) in caseVariantsData.rHistB" :key="'rb'+bi"
                      :x="60 + (bi / caseVariantsData.resBins) * 600 + 600 / caseVariantsData.resBins * 0.45"
                      :y="P.t + cH - (c / caseVariantsData.rHistMax) * cH"
                      :width="Math.max(1, 600 / caseVariantsData.resBins * 0.45)"
                      :height="(c / caseVariantsData.rHistMax) * cH"
                      fill="var(--accent-warning)" opacity="0.7" rx="1"
                      @mouseenter="showTip($event, Math.round(bi * caseVariantsData.resBw) + (caseVariantsData.resBw > 1 ? '–'+Math.round((bi+1)*caseVariantsData.resBw-1) : '') + ' resources', [{c:'a',l:nameA,v:caseVariantsData.rHistA[bi]+' cases'},{c:'b',l:nameB,v:c+' cases'}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <text v-for="i in 5" :key="'rhx'+i" :x="60 + ((i-1)/4) * 600" :y="H - 4" text-anchor="middle" class="ax">{{ Math.round(((i-1)/4) * caseVariantsData.maxRes) }}</text>
                    <line :x1="60" :x2="660" :y1="P.t + cH" :y2="P.t + cH" stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" />
                  </svg>
                  <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }}</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }}</span></div>
                </div>
              </div>
            </template>
            <div v-else class="chart-empty">Not enough case data for variant analysis</div>
          </template>

          <!-- ═══ ACTIVITIES ═══ -->
          <template v-if="activeSection === 'activities'">
            <div class="section-head">
              <span>Activities</span>
              <button class="mode-toggle" @click="toggleMode('act')">{{ mode('act') === 'side' ? 'Overlay' : 'Side-by-side' }}</button>
            </div>
            <div class="formula-hint">Avg Duration = \u03A3(t<sub>end</sub> \u2212 t<sub>start</sub>) / count &mdash; per activity type</div>
            <template v-if="actData">
              <div v-if="mode('act') === 'side'" class="chart-row">
                <div v-for="(side, idx) in ['a','b']" :key="side" class="chart-box">
                  <div class="chart-box-title" :class="'ct-' + side">{{ idx === 0 ? nameA : nameB }} — Avg Duration</div>
                  <svg :viewBox="`0 0 ${W} ${actData.acts.length * 26 + P.t + P.b}`" class="chart-svg">
                    <template v-for="(act, i) in actData.acts" :key="act.activity">
                      <text :x="P.l - 6" :y="P.t + i * 26 + 15" text-anchor="end" class="bl">{{ trunc(act.activity, 24) }}</text>
                      <rect :x="P.l" :y="P.t + i * 26 + 2" :width="Math.max(2, s(act[side]?.avgDuration||0, 0, actData.maxDur, 0, cW))" height="18" rx="2"
                        :fill="idx===0?'var(--accent-primary)':'var(--accent-warning)'" opacity="0.8"
                        @mouseenter="showTip($event, act.activity, [{c:side,l:'Dur',v:fmtDur(act[side]?.avgDuration||0)},{c:side,l:'Count',v:act[side]?.count||0}])" @mousemove="moveTip" @mouseleave="hideTip" />
                      <text :x="P.l + s(act[side]?.avgDuration||0, 0, actData.maxDur, 0, cW) + 4" :y="P.t + i * 26 + 15" class="bv">{{ fmtDur(act[side]?.avgDuration||0) }}</text>
                    </template>
                  </svg>
                </div>
              </div>
              <div v-else class="chart-box chart-box-full">
                <div class="chart-box-title">Avg Duration per Activity (combined)</div>
                <svg :viewBox="`0 0 700 ${actData.acts.length * 34 + P.t + P.b}`" class="chart-svg">
                  <template v-for="(act, i) in actData.acts" :key="act.activity">
                    <text :x="P.l - 6" :y="P.t + i * 34 + 18" text-anchor="end" class="bl">{{ trunc(act.activity, 24) }}</text>
                    <rect :x="P.l" :y="P.t + i * 34 + 2" :width="Math.max(2, s(act.a?.avgDuration||0, 0, actData.maxDur, 0, 540))" height="12" rx="2" fill="var(--accent-primary)" opacity="0.8"
                      @mouseenter="showTip($event, act.activity, [{c:'a',l:nameA,v:fmtDur(act.a?.avgDuration||0)},{c:'b',l:nameB,v:fmtDur(act.b?.avgDuration||0)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                    <rect :x="P.l" :y="P.t + i * 34 + 16" :width="Math.max(2, s(act.b?.avgDuration||0, 0, actData.maxDur, 0, 540))" height="12" rx="2" fill="var(--accent-warning)" opacity="0.8"
                      @mouseenter="showTip($event, act.activity, [{c:'a',l:nameA,v:fmtDur(act.a?.avgDuration||0)},{c:'b',l:nameB,v:fmtDur(act.b?.avgDuration||0)}])" @mousemove="moveTip" @mouseleave="hideTip" />
                  </template>
                </svg>
                <div class="chart-legend"><span class="lg-i"><span class="lg-s swa"></span>{{ nameA }}</span><span class="lg-i"><span class="lg-s swb"></span>{{ nameB }}</span></div>
              </div>
            </template>
            <div v-else class="chart-empty">No shared activities found</div>
          </template>

        </div>
        <!-- No data -->
        <div v-else class="cs-main"><div class="chart-empty" style="height:200px">Select two tracks to compare</div></div>
      </div>

      <!-- ─── Tooltip ─── -->
      <div v-if="tip.show" class="cs-tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
        <div class="cs-tip-label">{{ tip.label }}</div>
        <div v-for="(r, i) in tip.rows" :key="i" class="cs-tip-row">
          <span class="cs-tip-dot" :class="'td-' + r.c"></span>
          <span v-if="r.l" class="cs-tip-key">{{ r.l }}</span>
          <span class="cs-tip-val">{{ r.v }}</span>
        </div>
      </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ═══ OVERLAY ═══ */
.cs-overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.cs-overlay-enter-active {
  transition: opacity 0.25s ease;
}
.cs-overlay-enter-active .cs-page {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
}
.cs-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.cs-overlay-leave-active .cs-page {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.cs-overlay-enter-from {
  opacity: 0;
}
.cs-overlay-enter-from .cs-page {
  transform: scale(0.95);
  opacity: 0;
}
.cs-overlay-leave-to {
  opacity: 0;
}
.cs-overlay-leave-to .cs-page {
  transform: scale(0.95);
  opacity: 0;
}

/* ═══ PAGE LAYOUT ═══ */
.cs-page {
  display:flex; flex-direction:column; overflow:hidden;
  background:var(--bg-primary);
  width: 95vw;
  max-width: 1400px;
  height: 90vh;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  /* Remap overlay vars to page-compatible colors */
  --surface-overlay: var(--bg-primary);
  --surface-overlay-header: var(--header-bg);
  --surface-overlay-card: var(--card-bg, rgba(0,0,0,0.03));
  --surface-overlay-border: var(--card-border, rgba(0,0,0,0.08));
  --surface-overlay-input-bg: var(--bg-secondary, rgba(0,0,0,0.03));
  --surface-overlay-input-border: var(--card-border, rgba(0,0,0,0.12));
  --surface-overlay-text: var(--text-primary);
  --surface-overlay-text-muted: var(--text-muted);
}

/* ═══ HEADER ═══ */
.cs-header { display:flex; align-items:center; gap:14px; padding:10px 16px; border-bottom:1px solid var(--surface-overlay-border); flex-shrink:0; }
.cs-brand { font-size:14px; font-weight:700; color:var(--surface-overlay-text); white-space:nowrap; }
.cs-selectors { display:flex; align-items:center; gap:6px; flex:1; justify-content:center; }
.cs-sel { display:flex; align-items:center; gap:5px; }
.sel-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.dot-a { background:var(--accent-primary); }
.dot-b { background:var(--accent-warning); }
.sel-input { padding:3px 6px; border-radius:5px; border:1px solid var(--surface-overlay-input-border); background:var(--surface-overlay-input-bg); color:var(--surface-overlay-text); font-size:11px; cursor:pointer; max-width:220px; }
.cs-vs { font-size:10px; font-weight:600; color:var(--surface-overlay-text-muted); }
.cs-close { background:none; border:none; color:var(--accent-primary); font-size:12px; font-weight:600; cursor:pointer; padding:3px 8px; border-radius:5px; }
.cs-close:hover { background:var(--accent-primary-hover); }

/* ═══ BODY (sidebar + main) ═══ */
.cs-body { display:flex; flex:1; overflow:hidden; }

/* ═══ SIDEBAR ═══ */
.cs-sidebar { width:148px; flex-shrink:0; border-right:1px solid var(--surface-overlay-border); display:flex; flex-direction:column; overflow-y:auto; }
.cs-nav { padding:8px 0; }
.cs-nav-item { display:flex; align-items:center; gap:6px; width:100%; padding:6px 12px; border:none; background:none; color:var(--surface-overlay-text-muted); font-size:11px; cursor:pointer; text-align:left; transition:background 0.12s, color 0.12s; border-left:2px solid transparent; }
.cs-nav-item:hover { background:var(--surface-overlay-card); color:var(--surface-overlay-text); }
.cs-nav-item.active { color:var(--accent-primary); border-left-color:var(--accent-primary); background:var(--surface-overlay-card); font-weight:600; }
.nav-icon { font-size:12px; width:16px; text-align:center; }
.nav-label { font-size:10px; }
.cs-nav-group { margin-bottom:2px; }
.cs-nav-heading { font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; color:var(--surface-overlay-text-muted); padding:10px 12px 3px; opacity:0.6; }
.cs-nav-group:first-child .cs-nav-heading { padding-top:4px; }

/* Filters */
.cs-filters { padding:8px 10px; border-top:1px solid var(--surface-overlay-border); margin-top:auto; }
.filter-toggle { display:flex; align-items:center; gap:4px; width:100%; padding:4px 4px; border:none; background:none; color:var(--surface-overlay-text-muted); font-size:10px; font-weight:600; cursor:pointer; text-transform:uppercase; letter-spacing:0.5px; }
.filter-badge { background:var(--accent-warning); color:#fff; font-size:8px; font-weight:700; min-width:14px; height:14px; line-height:14px; text-align:center; border-radius:7px; padding:0 3px; }
.filter-chevron { font-size:9px; margin-left:auto; transition:transform 0.2s; display:inline-block; }
.filter-chevron.open { transform:rotate(90deg); }
.filter-body { max-height:200px; overflow-y:auto; margin-top:6px; }
.filter-clear { font-size:9px; color:var(--accent-danger); cursor:pointer; margin-bottom:4px; }
.filter-group { margin-bottom:6px; }
.filter-group-label { font-size:8px; font-weight:600; color:var(--surface-overlay-text-muted); text-transform:uppercase; letter-spacing:0.4px; margin-bottom:2px; }
.filter-item { display:flex; align-items:center; gap:4px; font-size:10px; color:var(--surface-overlay-text); cursor:pointer; padding:1px 0; }
.filter-item input { accent-color:var(--accent-primary); width:12px; height:12px; cursor:pointer; }

/* Work Schedule */
.cs-work-schedule { padding:8px 10px; border-top:1px solid var(--surface-overlay-border); }
.ws-toggle { display:flex; align-items:center; gap:6px; font-size:10px; font-weight:600; color:var(--surface-overlay-text-muted); cursor:pointer; text-transform:uppercase; letter-spacing:0.4px; }
.ws-toggle input { accent-color:var(--accent-primary); width:13px; height:13px; cursor:pointer; }
.ws-config { margin-top:6px; display:flex; flex-direction:column; gap:4px; }
.ws-row { display:flex; align-items:center; gap:4px; }
.ws-label { font-size:10px; color:var(--surface-overlay-text-muted); width:32px; }
.ws-input { width:40px; padding:2px 4px; font-size:10px; border:1px solid var(--surface-overlay-border); border-radius:4px; background:var(--surface-overlay-card); color:var(--surface-overlay-text); text-align:center; -moz-appearance:textfield; }
.ws-input::-webkit-inner-spin-button,
.ws-input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
.ws-input:focus { outline:1px solid var(--accent-primary); border-color:var(--accent-primary); }
.ws-unit { font-size:10px; color:var(--surface-overlay-text-muted); }
.ws-hint { font-size:8px; color:var(--surface-overlay-text-muted); font-style:italic; line-height:1.3; opacity:0.75; margin-top:2px; }

/* ═══ MAIN CONTENT ═══ */
.cs-main { flex:1; overflow-y:auto; padding:12px 16px; }

/* Section header */
.section-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.section-head span { font-size:12px; font-weight:600; color:var(--surface-overlay-text); }
.mode-toggle { background:var(--surface-overlay-card); border:1px solid var(--surface-overlay-border); color:var(--surface-overlay-text-muted); font-size:10px; padding:3px 8px; border-radius:5px; cursor:pointer; transition:background 0.12s; }
.mode-toggle:hover { background:var(--surface-overlay-card); color:var(--surface-overlay-text); }

/* Formula hints */
.formula-hint { font-size:9px; color:var(--surface-overlay-text-muted); font-style:italic; margin-bottom:8px; opacity:0.75; line-height:1.4; }
.formula-hint sub { font-size:7px; vertical-align:sub; }
.breakdown-sub { font-size:8px; color:var(--surface-overlay-text-muted); margin-top:2px; font-style:italic; }

/* ═══ CHART PRIMITIVES ═══ */
.chart-row { display:flex; gap:10px; margin-bottom:10px; }
.chart-box { flex:1; background:var(--surface-overlay-card); border:1px solid var(--surface-overlay-border); border-radius:8px; padding:8px 10px; min-width:0; overflow-x:auto; overflow-y:hidden; }
.chart-box-full { background:var(--surface-overlay-card); border:1px solid var(--surface-overlay-border); border-radius:8px; padding:8px 10px; margin-bottom:10px; }
.chart-box-title { font-size:10px; font-weight:600; color:var(--surface-overlay-text-muted); margin-bottom:4px; }
.ct-a { color:var(--accent-primary); }
.ct-b { color:var(--accent-warning); }
.chart-svg { width:100%; height:auto; }
.chart-empty { height:80px; display:flex; align-items:center; justify-content:center; color:var(--surface-overlay-text-muted); font-size:11px; }

/* SVG labels */
.bl { font-size:8px; fill:var(--surface-overlay-text); font-weight:600; }
.bl-sub { font-size:6.5px; fill:var(--surface-overlay-text-muted); font-style:italic; }
.bl-subscript { font-size:5px; }
.bv { font-size:7px; fill:var(--surface-overlay-text); font-weight:600; }
.bv-b { fill:var(--accent-warning); }
.ax { font-size:7px; fill:var(--surface-overlay-text-muted); }

/* Chart legend */
.chart-legend { display:flex; gap:10px; margin-top:4px; }
.lg-i { display:flex; align-items:center; gap:3px; font-size:9px; color:var(--surface-overlay-text-muted); }
.lg-s { width:8px; height:8px; border-radius:2px; display:inline-block; }
.swa { background:var(--accent-primary); }
.swb { background:var(--accent-warning); }

/* ═══ KPI STRIP ═══ */
.kpi-strip { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.kpi-strip-sm .kpi-chip { padding:5px 8px; }
.kpi-chip { background:var(--surface-overlay-card); border:1px solid var(--surface-overlay-border); border-radius:6px; padding:6px 10px; min-width:0; cursor:default; transition:border-color 0.12s; }
.kpi-chip:hover { border-color:var(--accent-primary); }
.kpi-chip-label { font-size:8px; text-transform:uppercase; letter-spacing:0.4px; color:var(--surface-overlay-text-muted); margin-bottom:2px; }
.kpi-chip-vals { display:flex; gap:8px; font-size:13px; font-weight:700; font-variant-numeric:tabular-nums; }
.kpi-chip-sub { font-size:7px; color:var(--surface-overlay-text-muted); font-style:italic; margin-top:1px; opacity:0.7; }
.v-a { color:var(--accent-primary); }
.v-b { color:var(--accent-warning); }

/* Mini stacked bars */
.mini-svg { width:100%; height:auto; display:block; }
.mini-svg rect { cursor:default; }
.mini-legend { display:flex; gap:8px; margin-top:3px; }
.ml-i { display:flex; align-items:center; gap:3px; font-size:9px; color:var(--surface-overlay-text-muted); }
.ml-s { width:8px; height:8px; border-radius:2px; display:inline-block; }

/* Gauge */
.gauge-svg { width:120px; height:auto; display:block; margin:0 auto; }
.gauge-big { font-size:18px; font-weight:700; fill:var(--surface-overlay-text); }
.gauge-sub { font-size:8px; fill:var(--surface-overlay-text-muted); }

/* Donut */
.donut-svg { width:120px; height:120px; display:block; margin:0 auto; }
.donut-svg path { cursor:default; }
.donut-big { font-size:18px; font-weight:700; fill:var(--surface-overlay-text); }
.donut-sub { font-size:8px; fill:var(--surface-overlay-text-muted); }
.donut-leg { margin-top:6px; }
.dl-row { display:flex; align-items:center; gap:4px; font-size:9px; padding:1px 0; }
.dl-shape { width:14px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; line-height:0; }
.dl-label { flex:1; color:var(--surface-overlay-text); }
.dl-val { color:var(--surface-overlay-text-muted); font-variant-numeric:tabular-nums; }

/* Heatmap */
.heatmap-box { overflow-x:auto; }
.hm-wrap { overflow-x:auto; }
.hm-svg { height:auto; max-width:100%; }
.hm-lbl { font-size:7px; fill:var(--surface-overlay-text-muted); }
.hm-cell { font-size:7px; fill:var(--surface-overlay-text); font-weight:600; }
.hm-svg rect { cursor:default; }

/* ═══ TOOLTIP ═══ */
.cs-tip { position:fixed; z-index:700; background:var(--surface-overlay); border:1px solid var(--surface-overlay-border); border-radius:6px; padding:6px 10px; pointer-events:none; box-shadow:var(--shadow-lg); max-width:220px; }
.cs-tip-label { font-size:10px; font-weight:600; color:var(--surface-overlay-text); margin-bottom:2px; }
.cs-tip-row { display:flex; align-items:center; gap:4px; font-size:10px; }
.cs-tip-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
.td-a { background:var(--accent-primary); }
.td-b { background:var(--accent-warning); }
.td-g { background:var(--accent-success); }
.td-w { background:var(--accent-warning); }
.td-r { background:var(--accent-danger); }
.td-x { background:var(--surface-overlay-text-muted); }
.cs-tip-key { color:var(--surface-overlay-text-muted); }
.cs-tip-val { color:var(--surface-overlay-text); font-weight:600; margin-left:auto; font-variant-numeric:tabular-nums; }
</style>

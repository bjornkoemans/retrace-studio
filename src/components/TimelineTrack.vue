<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { fmtTime } from '../utils/formatTime'
import TimeAxis from './TimeAxis.vue'
import AgentLane from './AgentLane.vue'
import HeatmapCanvas from './HeatmapCanvas.vue'
import QueueColumn from './QueueColumn.vue'
import TrackStats from './TrackStats.vue'
import AnnotationMarker from './AnnotationMarker.vue'

const props = defineProps({
  track: { type: Object, required: true },
})

const store = useTimelineStore()
const hscrollRef = ref(null)
const showStats = ref(false)

// Track title rename
const editingTitle = ref(false)
const editTitle = ref('')
const titleInputRef = ref(null)

function startRenameTrack() {
  editTitle.value = props.track.title
  editingTitle.value = true
  setTimeout(() => titleInputRef.value?.select(), 0)
}

function saveTrackTitle() {
  if (editTitle.value.trim()) {
    store.renameTrack(props.track.id, editTitle.value)
  }
  editingTitle.value = false
}

// Agent lane drag reordering — uses agent names (not indices) to avoid
// mismatch between visibleAgents (filtered) and track.agentOrder (full).
const dragAgent = ref(null)
const dropAgent = ref(null)
let agentDragFromHandle = false

function onAgentMouseDown(e) {
  agentDragFromHandle = e.target.closest('.lane-drag-handle') !== null
}

function onAgentDragStart(e, agent) {
  if (!agentDragFromHandle) {
    e.preventDefault()
    return
  }
  dragAgent.value = agent
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', agent)
  // Prevent track-level drag from firing
  e.stopPropagation()
}

function onAgentDragOver(e, agent) {
  if (dragAgent.value === null) return
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'move'
  dropAgent.value = agent
}

function onAgentDragLeave() {
  dropAgent.value = null
}

function onAgentDrop(e, agent) {
  e.preventDefault()
  e.stopPropagation()
  if (dragAgent.value !== null && dragAgent.value !== agent) {
    store.reorderAgent(props.track.id, dragAgent.value, agent)
  }
  dragAgent.value = null
  dropAgent.value = null
  agentDragFromHandle = false
}

function onAgentDragEnd() {
  dragAgent.value = null
  dropAgent.value = null
  agentDragFromHandle = false
}

const trackWidth = computed(() => props.track.totalDuration * store.pxPerSecond)

const statsText = computed(() => {
  const t = props.track
  // Deduplicate collab tasks: count each logical task (by caseId+taskId) only once
  const seenIds = new Set()
  let collabCount = 0
  for (const task of t.tasks) {
    const key = `${task.caseId}.${task.taskId}`
    if (!seenIds.has(key)) {
      seenIds.add(key)
      if (task.isCollab) collabCount++
    }
  }
  const uniqueTasks = seenIds.size
  const collabSuffix = collabCount > 0 ? ` (${collabCount} collab)` : ''
  return `${uniqueTasks} tasks${collabSuffix} \u00B7 ${t.caseIds.length} cases \u00B7 ${t.agents.length} agents \u00B7 ${fmtTime(t.totalDuration)}`
})

const playheadLeft = computed(() => store.playheadTime * store.pxPerSecond + 130 + 'px')

// Use agentOrder if set, otherwise fallback to agents list
const orderedAgents = computed(() => {
  return props.track.agentOrder || props.track.agents
})

const visibleAgents = computed(() => {
  const agents = orderedAgents.value
  if (store.showZeroDuration) return agents
  // Use agent index for O(agents) instead of O(agents × tasks)
  const idx = props.track._agentIndex
  if (idx) {
    return agents.filter((agent) => {
      const agTasks = idx.get(agent)
      if (!agTasks) return false
      for (let i = 0; i < agTasks.length; i++) {
        if (agTasks[i].end - agTasks[i].start > 0) return true
      }
      return false
    })
  }
  return agents.filter((agent) =>
    props.track.tasks.some((t) => t.agent === agent && t.end - t.start > 0)
  )
})

// Annotations for this track
const trackAnnotations = computed(() => {
  if (!store.showAnnotations) return []
  return store.annotations.filter(a => a.trackId === null || a.trackId === props.track.id)
})

// Agent sort
const sortMode = ref('name')

function onSortChange(e) {
  sortMode.value = e.target.value
  store.setAgentSort(props.track.id, e.target.value)
}

// On mount, register scroll element, sync position, set up vert scroll listener
let _vertScrollEl = null
onMounted(() => {
  if (hscrollRef.value) {
    store.registerScrollEl(hscrollRef.value)
    if (store.viewportLeft > 0) {
      hscrollRef.value.scrollLeft = store.viewportLeft
    }
  }
  // Attach vertical scroll listener to the timeline-scroll container
  _vertScrollEl = hscrollRef.value?.closest('.timeline-scroll')
  if (_vertScrollEl) {
    _vertScrollEl.addEventListener('scroll', onVertScroll, { passive: true })
    // Initial measurement
    vertScrollTop.value = _vertScrollEl.scrollTop
    vertScrollHeight.value = _vertScrollEl.clientHeight
  }
})

// ── RAF-throttled scroll handler ──
// Two-layer cascade prevention:
//  1. Synchronous guard (isScrollSyncing) — catches scroll events dispatched
//     synchronously during scrollLeft assignment (some browser engines).
//  2. Position comparison — catches async scroll events from tracks that were
//     already synced to the current viewport position. This is the critical
//     layer: when Track A syncs B to 500, B fires an async scroll event later.
//     By then _scrollSyncing is false, but B's scrollLeft (500) matches
//     store.viewportLeft (500), so we skip re-broadcasting.
let _scrollRafId = null

function onScroll() {
  // Layer 1: synchronous guard for in-flight sync
  if (store.isScrollSyncing()) return
  if (_scrollRafId) return // already scheduled
  _scrollRafId = requestAnimationFrame(_processScroll)
}

function _processScroll() {
  _scrollRafId = null
  if (!hscrollRef.value) return
  const left = hscrollRef.value.scrollLeft

  // Layer 2: skip if viewport is already at this position
  // (another track already synced — this is just the echo)
  if (Math.abs(left - store.viewportLeft) < 1) return

  // Detect manual scroll during playback → disable auto-follow
  if (store.isPlaying && !store.isProgrammaticScroll()) {
    store.autoFollow = false
  }

  // Sync all tracks through the centralized store helper
  store.syncScrollAll(hscrollRef.value, left)
}

onBeforeUnmount(() => {
  if (_scrollRafId) cancelAnimationFrame(_scrollRafId)
  store.unregisterScrollEl(hscrollRef.value)
  if (_vertScrollEl) _vertScrollEl.removeEventListener('scroll', onVertScroll)
  if (_vscrollRafId) cancelAnimationFrame(_vscrollRafId)
})

// ── Vertical virtualization for agent lanes ──
// Only render agents whose rows are visible in the vertical scroll viewport
const vscrollRef = ref(null) // the outer .timeline-scroll container
const vertScrollTop = ref(0)
const vertScrollHeight = ref(800)
let _vscrollRafId = null

function onVertScroll() {
  if (_vscrollRafId) return
  _vscrollRafId = requestAnimationFrame(_processVertScroll)
}

function _processVertScroll() {
  _vscrollRafId = null
  // We read from the closest scrollable ancestor — .timeline-scroll
  const el = hscrollRef.value?.closest('.timeline-scroll')
  if (!el) return
  vertScrollTop.value = el.scrollTop
  vertScrollHeight.value = el.clientHeight
}

// virtualizedAgents: only the agents whose rows are in the vertical viewport
const VERT_BUFFER = 3 // extra rows above/below
const virtualizedAgents = computed(() => {
  const agents = visibleAgents.value
  if (agents.length <= 15) return { agents, topPad: 0, bottomPad: 0 }

  const laneH = store.laneHeight
  // Estimate this track's position within the vertical scroll
  // We use a simpler approach: render all if we can't measure, or use scroll position
  const scrollTop = vertScrollTop.value
  const scrollH = vertScrollHeight.value
  const totalH = agents.length * laneH

  // Calculate which rows are visible
  // The track may not start at scrollTop=0, but since each track has its own
  // scroll context, we use the track-local offset
  const trackEl = hscrollRef.value?.closest('.track')
  let trackOffset = 0
  if (trackEl) {
    const scrollParent = trackEl.closest('.timeline-scroll')
    if (scrollParent) {
      trackOffset = trackEl.offsetTop - scrollParent.offsetTop
    }
  }

  const visStart = scrollTop - trackOffset - 60 // 60px for header+axis
  const visEnd = visStart + scrollH

  let startIdx = Math.max(0, Math.floor(visStart / laneH) - VERT_BUFFER)
  let endIdx = Math.min(agents.length, Math.ceil(visEnd / laneH) + VERT_BUFFER)

  // Ensure at least a reasonable range
  if (endIdx - startIdx < 5) {
    startIdx = 0
    endIdx = agents.length
  }

  return {
    agents: agents.slice(startIdx, endIdx),
    topPad: startIdx * laneH,
    bottomPad: (agents.length - endIdx) * laneH,
  }
})
</script>

<template>
  <div class="track" :data-track-id="track.id">
    <div class="track-header">
      <span class="drag-handle" title="Drag to reorder track">&#x2807;</span>
      <input
        v-if="editingTitle"
        ref="titleInputRef"
        v-model="editTitle"
        class="track-title-input"
        @keyup.enter="saveTrackTitle"
        @keyup.escape="editingTitle = false"
        @blur="saveTrackTitle"
      />
      <span v-else class="track-title" @dblclick="startRenameTrack" title="Double-click to rename">{{ track.title }}</span>
      <span class="track-stats">{{ statsText }}</span>
      <select class="sort-select" :value="sortMode" @change="onSortChange" title="Sort agents">
        <option value="name">A-Z</option>
        <option value="utilization">Utilization</option>
        <option value="workTime">Work Time</option>
        <option value="tasks">Tasks</option>
      </select>
      <button
        class="overview-btn"
        :class="{ active: track.overviewMode }"
        @click="store.toggleOverviewMode(track.id)"
        :title="track.overviewMode ? 'Switch to detail view' : 'Switch to heatmap overview'"
      >{{ track.overviewMode ? 'Detail' : 'Overview' }}</button>
      <button class="stats-btn" @click="showStats = !showStats">{{ showStats ? 'Hide Stats' : 'Stats' }}</button>
      <button class="hide-btn" @click="store.hideTrack(track.id)" title="Temporarily hide this track">Hide</button>
      <button class="remove-btn" @click="store.removeTrack(track.id)">&times; Remove</button>
    </div>
    <TrackStats v-if="showStats" :track="track" />
    <div class="track-body">
      <!-- Heatmap overview: self-contained, no horizontal scroll needed -->
      <template v-if="track.overviewMode">
        <HeatmapCanvas :track="track" />
      </template>
      <!-- Normal timeline: horizontal scroll + agent lanes -->
      <template v-else>
        <div class="track-hscroll" ref="hscrollRef" @scroll="onScroll">
          <div class="track-inner" :style="{ width: trackWidth + 130 + 'px' }">
            <TimeAxis :track="track" :width="trackWidth" />
            <div class="rows-container" style="position: relative">
              <!-- Top spacer for virtualized agents -->
              <div v-if="virtualizedAgents.topPad > 0" :style="{ height: virtualizedAgents.topPad + 'px' }"></div>
              <div
                v-for="agent in virtualizedAgents.agents"
                :key="agent"
                class="agent-drag-wrap"
                :class="{ 'agent-drop-target': dropAgent === agent && dragAgent !== agent }"
                draggable="true"
                @mousedown="onAgentMouseDown"
                @dragstart="onAgentDragStart($event, agent)"
                @dragover="onAgentDragOver($event, agent)"
                @dragleave="onAgentDragLeave"
                @drop="onAgentDrop($event, agent)"
                @dragend="onAgentDragEnd"
              >
                <AgentLane
                  :track="track"
                  :agent="agent"
                  :width="trackWidth"
                />
              </div>
              <!-- Bottom spacer for virtualized agents -->
              <div v-if="virtualizedAgents.bottomPad > 0" :style="{ height: virtualizedAgents.bottomPad + 'px' }"></div>
              <!-- Playhead -->
              <div class="playhead" :style="{ left: playheadLeft }"></div>
              <!-- Hover line -->
              <div class="hoverhead" :data-track-id="track.id"></div>
              <!-- Annotation markers -->
              <AnnotationMarker
                v-for="ann in trackAnnotations"
                :key="'ann-' + ann.id"
                :annotation="ann"
              />
            </div>
          </div>
        </div>
        <QueueColumn :track="track" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.track {
  background: var(--card-bg);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  border: 1px solid var(--card-border);
  overflow: hidden;
}
.track-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--track-header-bg);
  border-bottom: 1px solid var(--track-header-border);
  position: sticky;
  top: 0;
  z-index: 50;
}
.drag-handle {
  cursor: grab;
  color: var(--text-muted);
  font-size: 14px;
  user-select: none;
  padding: 0 2px;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.drag-handle:hover {
  opacity: 1;
}
.drag-handle:active {
  cursor: grabbing;
}
.track-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--track-title-text);
  cursor: default;
}
.track-title-input {
  font-size: 13px;
  font-weight: 700;
  color: var(--track-title-text);
  background: var(--bg-secondary, rgba(255,255,255,0.1));
  border: 1px solid var(--accent-primary);
  border-radius: 4px;
  padding: 1px 6px;
  outline: none;
  min-width: 120px;
}
.track-stats {
  font-size: 11px;
  color: var(--track-stats-text);
}
.sort-select {
  padding: 3px 8px;
  border: 1px solid var(--track-remove-border);
  background: var(--track-remove-bg);
  border-radius: 8px;
  font-size: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  margin-left: auto;
  transition: border-color 0.15s ease;
}
/* ── Track action buttons (shared base) ── */
.overview-btn,
.stats-btn,
.hide-btn,
.remove-btn {
  padding: 3px 10px;
  border: 1px solid var(--track-remove-border);
  background: var(--track-remove-bg);
  border-radius: 8px;
  cursor: pointer;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
}
.overview-btn:hover,
.stats-btn:hover,
.hide-btn:hover {
  background: var(--bg-quaternary);
  transform: translateY(-0.5px);
}
.overview-btn:active,
.stats-btn:active,
.hide-btn:active,
.remove-btn:active {
  transform: scale(0.97);
}
.overview-btn.active {
  background: var(--accent-primary);
  color: #fff;
  border-color: var(--accent-primary);
}
.remove-btn {
  color: var(--track-remove-text);
}
.remove-btn:hover {
  background: var(--track-remove-hover-bg);
}
.track-body {
  display: flex;
}
.track-hscroll {
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  flex: 1;
  min-width: 0;
  will-change: scroll-position;
  contain: layout style;
}
.track-inner {
  display: inline-flex;
  flex-direction: column;
  min-width: 100%;
}
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--playhead-color);
  z-index: 35;
  pointer-events: none;
}
.hoverhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--hoverhead-color);
  z-index: 34;
  pointer-events: none;
  display: none;
}
.agent-drag-wrap {
  transition: transform 0.1s ease;
}
.agent-drag-wrap.agent-drop-target {
  outline: 2px dashed var(--accent-primary);
  outline-offset: -1px;
}
</style>

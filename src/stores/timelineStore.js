import { defineStore } from 'pinia'
import { ref, computed, toRaw, nextTick } from 'vue'
import { parseEpisode } from '../composables/useCsvParser'

/**
 * Build a Map<agent, Task[]> index for O(1) per-agent lookups.
 * Called once on import/restore — avoids repeated .filter() over all tasks.
 */
function buildAgentIndex(tasks) {
  const idx = new Map()
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    let arr = idx.get(t.agent)
    if (!arr) { arr = []; idx.set(t.agent, arr) }
    arr.push(t)
  }
  return idx
}

export const useTimelineStore = defineStore('timeline', () => {
  // Loaded data
  const loadedFolders = ref([])
  const selectedFolderIdx = ref(-1)

  // Tracks
  const tracks = ref([])
  const tracksRestored = ref(false)
  let trackIdCounter = 0

  // Generic undo stack — each entry: { type, data, label, timestamp }
  const undoStack = ref([])
  const MAX_UNDO = 50

  function pushUndo(type, data, label) {
    undoStack.value.push({ type, data, label, timestamp: Date.now() })
    if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
  }

  // View
  const pxPerSecond = ref(0.5)
  const globalMaxDuration = ref(0)
  const playheadTime = ref(0)
  const isolatedCaseId = ref(null)
  const isPlaying = ref(false)
  const playbackSpeed = ref(60)

  // Viewport (for horizontal culling)
  const viewportLeft = ref(0)
  const viewportWidth = ref(2000)

  // Auto-follow playhead during playback
  const autoFollow = ref(true)
  let _programmaticScrollUntil = 0 // timestamp until which scroll events are considered programmatic

  // Search / filter
  const searchQuery = ref('')
  const highlightedTaskKeys = ref(new Set())
  const searchResults = ref([])    // ordered array of { taskKey, task, trackId, agent }
  const searchResultIndex = ref(-1)
  const filterMode = ref('dim') // 'dim' or 'hide'

  // Hidden tracks (temporary visibility toggle)
  const hiddenTrackIds = ref(new Set())

  // Selection (for keyboard nav + tooltip context)
  const selectedTask = ref(null)      // { caseId, taskId, agent, trackId }
  const focusedAgent = ref(null)
  const focusedTrackId = ref(null)

  // Annotations
  const annotations = ref([])  // [{ id, time, text, trackId, color }]
  const bookmarks = ref([])    // [{ id, time, label }]
  let annotationIdCounter = 0

  // View mode: 'timeline' or 'compare'
  const viewMode = ref('timeline')
  const selectedCaseForFlow = ref(null) // kept for compat

  // Work schedule (shared across stats, search, comparison)
  const wsEnabled = ref(true)
  const wsStartH = ref(8)
  const wsEndH = ref(20)

  // Settings
  const showWait = ref(true)
  const showAssign = ref(true)
  const showLabels = ref(true)
  const showCollabBorder = ref(true)
  const showVolunteers = ref(true)
  const volFormat = ref('names')
  const showLegend = ref(false)
  const showMarkerLegend = ref(true)
  const showZeroDuration = ref(false)
  const compactMode = ref(false)
  const dimOpacity = ref(0.06)
  const overviewRowHeight = ref(6) // px per agent row in heatmap overview

  // Feature toggles
  const showAnnotations = ref(true)
  const annotationColor = ref('warning') // 'warning', 'primary', 'danger'
  const showPredecessors = ref(true)
  const showConcurrentAgents = ref(true)
  const showMiniTimeline = ref(true)
  const enableKeyboardNav = ref(true)
  const defaultAgentSort = ref('name') // 'name', 'utilization', 'workTime', 'tasks'

  // Toast
  const toastMessage = ref('')
  const toastVisible = ref(false)
  let toastTimer = null

  function showToast(msg, duration = 3500) {
    toastMessage.value = msg
    toastVisible.value = true
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastVisible.value = false }, duration)
  }

  // Cache toast (special animated notification)
  const cacheToastVisible = ref(false)
  const cacheToastPhase = ref('loading') // 'loading' | 'done'
  const cacheToastMessage = ref('')
  const cacheToastSub = ref('')
  let cacheToastTimer = null

  function showCacheToastLoading() {
    cacheToastPhase.value = 'loading'
    cacheToastMessage.value = 'Restoring session...'
    cacheToastSub.value = 'Loading tracks from cache'
    cacheToastVisible.value = true
    clearTimeout(cacheToastTimer)
  }

  function showCacheToastDone(msg, sub = '', duration = 3500) {
    cacheToastPhase.value = 'done'
    cacheToastMessage.value = msg
    cacheToastSub.value = sub
    clearTimeout(cacheToastTimer)
    cacheToastTimer = setTimeout(() => { cacheToastVisible.value = false }, duration)
  }

  // Computed
  const selectedFolder = computed(() => {
    if (selectedFolderIdx.value < 0 || selectedFolderIdx.value >= loadedFolders.value.length) return null
    return loadedFolders.value[selectedFolderIdx.value]
  })

  const allCaseIds = computed(() => {
    const ids = new Set()
    tracks.value.forEach((tr) => tr.caseIds.forEach((c) => ids.add(c)))
    return [...ids].sort((a, b) => a - b)
  })

  const hasAssignInfo = computed(() => {
    return tracks.value.some((tr) => tr.tasks.some((t) => t.assignmentType))
  })

  const laneHeight = computed(() => (compactMode.value ? 36 : 52))
  const blockHeight = computed(() => (compactMode.value ? 22 : 34))
  const blockTop = computed(() => (compactMode.value ? 7 : 9))

  const canUndo = computed(() => undoStack.value.length > 0)

  // Actions
  function addTrack(folderIdx, filename, episodeLabel, maxCases) {
    const folder = loadedFolders.value[folderIdx]
    if (!folder) return false

    const parsed = parseEpisode(folder, filename, maxCases)
    if (!parsed) return false

    const title = `${folder.name} — ${episodeLabel}`
    const track = {
      id: trackIdCounter++,
      title,
      ...parsed,
      activeCases: new Set(parsed.caseIds),
      _agentIndex: buildAgentIndex(parsed.tasks),
      overviewMode: false,
    }
    tracks.value.push(track)

    // Apply default agent sort if not 'name' (default alphabetical)
    if (defaultAgentSort.value && defaultAgentSort.value !== 'name') {
      setAgentSort(track.id, defaultAgentSort.value)
    }

    globalMaxDuration.value = Math.max(...tracks.value.map((t) => t.totalDuration))
    _doSaveTracks() // immediate save after import (no debounce)
    return true
  }

  function removeTrack(trackId) {
    const idx = tracks.value.findIndex((t) => t.id === trackId)
    if (idx === -1) return

    const removed = tracks.value[idx]
    tracks.value = tracks.value.filter((t) => t.id !== trackId)

    pushUndo('removeTrack', { track: removed, idx }, 'Track removed')
    showToast('Track removed — Ctrl+Z to undo')

    if (tracks.value.length === 0) {
      globalMaxDuration.value = 0
    } else {
      globalMaxDuration.value = Math.max(...tracks.value.map((t) => t.totalDuration))
    }
    saveTracks()
  }

  function undo() {
    if (undoStack.value.length === 0) {
      showToast('Nothing to undo')
      return false
    }
    const entry = undoStack.value.pop()
    const { type, data } = entry

    switch (type) {
      case 'removeTrack': {
        tracks.value.splice(data.idx, 0, data.track)
        globalMaxDuration.value = Math.max(...tracks.value.map(t => t.totalDuration))
        saveTracks()
        showToast('Track restored')
        break
      }
      case 'renameTrack': {
        const tr = tracks.value.find(t => t.id === data.trackId)
        if (tr) { tr.title = data.oldTitle; saveTracks() }
        showToast('Rename undone')
        break
      }
      case 'renameAgent': {
        // Reverse: rename back from newName to oldName
        const tr = tracks.value.find(t => t.id === data.trackId)
        if (tr) {
          const ai = tr.agents.indexOf(data.newName)
          if (ai !== -1) tr.agents[ai] = data.oldName
          if (tr.agentOrder) {
            const oi = tr.agentOrder.indexOf(data.newName)
            if (oi !== -1) tr.agentOrder[oi] = data.oldName
          }
          tr.tasks.forEach(t => { if (t.agent === data.newName) t.agent = data.oldName })
          if (tr.agentIdToName) {
            for (const [id, n] of Object.entries(tr.agentIdToName)) {
              if (n === data.newName) tr.agentIdToName[id] = data.oldName
            }
          }
          saveTracks()
        }
        showToast('Agent rename undone')
        break
      }
      case 'reorderTrack': {
        const item = tracks.value.splice(data.toIdx, 1)[0]
        tracks.value.splice(data.fromIdx, 0, item)
        saveTracks()
        showToast('Track reorder undone')
        break
      }
      case 'reorderAgent': {
        const tr = tracks.value.find(t => t.id === data.trackId)
        if (tr && tr.agentOrder) {
          tr.agentOrder = data.oldOrder
          saveTracks()
        }
        showToast('Agent reorder undone')
        break
      }
      case 'setAgentSort': {
        const tr = tracks.value.find(t => t.id === data.trackId)
        if (tr) {
          tr.agentOrder = data.oldOrder
          saveTracks()
        }
        showToast('Sort undone')
        break
      }
      case 'hideTrack': {
        showTrack(data.trackId)
        showToast('Track unhidden')
        break
      }
      case 'addAnnotation': {
        annotations.value = annotations.value.filter(a => a.id !== data.id)
        saveAnnotations()
        showToast('Annotation removed')
        break
      }
      case 'removeAnnotation': {
        annotations.value.push(data.annotation)
        saveAnnotations()
        showToast('Annotation restored')
        break
      }
      case 'updateAnnotation': {
        const a = annotations.value.find(a => a.id === data.id)
        if (a) { a.text = data.oldText; saveAnnotations() }
        showToast('Annotation edit undone')
        break
      }
      case 'addBookmark': {
        bookmarks.value = bookmarks.value.filter(b => b.id !== data.id)
        saveAnnotations()
        showToast('Bookmark removed')
        break
      }
      case 'removeBookmark': {
        bookmarks.value.push(data.bookmark)
        saveAnnotations()
        showToast('Bookmark restored')
        break
      }
      case 'updateBookmark': {
        const b = bookmarks.value.find(b => b.id === data.id)
        if (b) { b.label = data.oldLabel; saveAnnotations() }
        showToast('Bookmark edit undone')
        break
      }
      default:
        showToast('Unknown undo action')
    }
    return true
  }

  function clearAll() {
    tracks.value = []
    globalMaxDuration.value = 0
    isolatedCaseId.value = null
    playheadTime.value = 0
    isPlaying.value = false
    undoStack.value = []
    searchQuery.value = ''
    highlightedTaskKeys.value = new Set()
    searchResults.value = []
    searchResultIndex.value = -1
    selectedTask.value = null
    focusedAgent.value = null
    focusedTrackId.value = null
    annotations.value = []
    bookmarks.value = []
    viewMode.value = 'timeline'
    selectedCaseForFlow.value = null
    saveTracks()
    saveAnnotations()
  }

  function toggleCaseActive(caseId) {
    tracks.value.forEach((tr) => {
      if (tr.activeCases.has(caseId)) tr.activeCases.delete(caseId)
      else if (tr.caseIds.includes(caseId)) tr.activeCases.add(caseId)
    })
  }

  function isCaseActive(caseId) {
    return tracks.value.some((tr) => tr.activeCases.has(caseId))
  }

  function toggleIsolation(caseId) {
    if (isolatedCaseId.value === caseId) {
      isolatedCaseId.value = null
    } else {
      isolatedCaseId.value = caseId
    }
  }

  /**
   * Add a track from pre-parsed data (used by flexible CSV import).
   */
  function addTrackFromParsed(title, parsed) {
    if (!parsed) return false
    const track = {
      id: trackIdCounter++,
      title,
      ...parsed,
      activeCases: new Set(parsed.caseIds),
      _agentIndex: buildAgentIndex(parsed.tasks),
      overviewMode: false,
    }
    tracks.value.push(track)

    // Apply default agent sort if not 'name' (default alphabetical)
    if (defaultAgentSort.value && defaultAgentSort.value !== 'name') {
      setAgentSort(track.id, defaultAgentSort.value)
    }

    globalMaxDuration.value = Math.max(...tracks.value.map((t) => t.totalDuration))
    _doSaveTracks() // immediate save after import (no debounce)
    return true
  }

  function clearIsolation() {
    if (isolatedCaseId.value !== null) {
      isolatedCaseId.value = null
    }
  }

  // ── Rename ──
  function renameTrack(trackId, newTitle) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track && newTitle.trim()) {
      const oldTitle = track.title
      track.title = newTitle.trim()
      pushUndo('renameTrack', { trackId, oldTitle }, 'Track renamed')
      saveTracks()
    }
  }

  function renameAgent(trackId, oldName, newName) {
    const name = newName.trim()
    const track = tracks.value.find(t => t.id === trackId)
    if (!track || !name || name === oldName) return
    pushUndo('renameAgent', { trackId, oldName, newName: name }, 'Agent renamed')
    // Update agents list
    const idx = track.agents.indexOf(oldName)
    if (idx !== -1) track.agents[idx] = name
    // Update agentOrder
    if (track.agentOrder) {
      const oi = track.agentOrder.indexOf(oldName)
      if (oi !== -1) track.agentOrder[oi] = name
    }
    // Update all tasks referencing this agent
    track.tasks.forEach(t => {
      if (t.agent === oldName) t.agent = name
    })
    // Update agentIdToName if present
    if (track.agentIdToName) {
      for (const [id, n] of Object.entries(track.agentIdToName)) {
        if (n === oldName) track.agentIdToName[id] = name
      }
    }
    // Rebuild agent index after rename
    track._agentIndex = buildAgentIndex(track.tasks)
    saveTracks()
  }

  // ── Track visibility ──
  function hideTrack(trackId) {
    hiddenTrackIds.value = new Set([...hiddenTrackIds.value, trackId])
    pushUndo('hideTrack', { trackId }, 'Track hidden')
    saveTracks()
    showToast('Track hidden — Ctrl+Z to undo')
  }

  function showTrack(trackId) {
    const s = new Set(hiddenTrackIds.value)
    s.delete(trackId)
    hiddenTrackIds.value = s
    saveTracks()
  }

  function showAllTracks() {
    hiddenTrackIds.value = new Set()
    saveTracks()
  }

  const visibleTracks = computed(() => {
    return tracks.value.filter(t => !hiddenTrackIds.value.has(t.id))
  })

  const hiddenTracks = computed(() => {
    return tracks.value.filter(t => hiddenTrackIds.value.has(t.id))
  })

  // ── Selection ──
  function selectTask(task, track) {
    selectedTask.value = { caseId: task.caseId, taskId: task.taskId, agent: task.agent, trackId: track.id }
    focusedAgent.value = task.agent
    focusedTrackId.value = track.id
  }

  function clearSelection() {
    selectedTask.value = null
  }

  // ── Annotations ──
  function addAnnotation(time, text, trackId = null) {
    const id = annotationIdCounter++
    annotations.value.push({ id, time, text, trackId, color: annotationColor.value })
    pushUndo('addAnnotation', { id }, 'Annotation added')
    saveAnnotations()
    showToast('Annotation added — Ctrl+Z to undo')
  }

  function removeAnnotation(id) {
    const annotation = annotations.value.find(a => a.id === id)
    if (annotation) pushUndo('removeAnnotation', { annotation: { ...annotation } }, 'Annotation removed')
    annotations.value = annotations.value.filter(a => a.id !== id)
    saveAnnotations()
  }

  function updateAnnotation(id, text) {
    const a = annotations.value.find(a => a.id === id)
    if (a) {
      pushUndo('updateAnnotation', { id, oldText: a.text }, 'Annotation edited')
      a.text = text
      saveAnnotations()
    }
  }

  function addBookmark(time, label = '') {
    const autoLabel = label || `Bookmark at ${Math.floor(time / 60)}m${Math.floor(time % 60)}s`
    const id = annotationIdCounter++
    bookmarks.value.push({ id, time, label: autoLabel })
    pushUndo('addBookmark', { id }, 'Bookmark added')
    saveAnnotations()
    showToast('Bookmark added — Ctrl+Z to undo')
  }

  function removeBookmark(id) {
    const bookmark = bookmarks.value.find(b => b.id === id)
    if (bookmark) pushUndo('removeBookmark', { bookmark: { ...bookmark } }, 'Bookmark removed')
    bookmarks.value = bookmarks.value.filter(b => b.id !== id)
    saveAnnotations()
  }

  function updateBookmark(id, label) {
    const b = bookmarks.value.find(b => b.id === id)
    if (b) {
      pushUndo('updateBookmark', { id, oldLabel: b.label }, 'Bookmark edited')
      b.label = label
      saveAnnotations()
    }
  }

  function saveAnnotations() {
    try {
      localStorage.setItem('retrace-annotations', JSON.stringify({
        annotations: annotations.value,
        bookmarks: bookmarks.value,
        idCounter: annotationIdCounter,
      }))
    } catch (e) { /* fail silently */ }
  }

  function restoreAnnotations() {
    try {
      const raw = localStorage.getItem('retrace-annotations')
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.annotations) annotations.value = data.annotations
      if (data.bookmarks) bookmarks.value = data.bookmarks
      if (data.idCounter) annotationIdCounter = data.idCounter
    } catch (e) { /* fail silently */ }
  }

  // ── Track reordering ──
  function reorderTrack(fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    pushUndo('reorderTrack', { fromIdx, toIdx }, 'Track reordered')
    const item = tracks.value.splice(fromIdx, 1)[0]
    tracks.value.splice(toIdx, 0, item)
    saveTracks()
  }

  // ── Agent lane ordering ──
  function reorderAgent(trackId, fromAgent, toAgent) {
    const track = tracks.value.find(t => t.id === trackId)
    if (!track) return
    const oldOrder = track.agentOrder ? [...track.agentOrder] : [...track.agents]
    const order = [...oldOrder]
    const fromIdx = order.indexOf(fromAgent)
    const toIdx = order.indexOf(toAgent)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
    pushUndo('reorderAgent', { trackId, oldOrder }, 'Agent reordered')
    // Remove from old position, insert at new position
    order.splice(fromIdx, 1)
    order.splice(toIdx, 0, fromAgent)
    track.agentOrder = order
    saveTracks()
  }

  function setAgentSort(trackId, sortBy) {
    const track = tracks.value.find(t => t.id === trackId)
    if (!track) return
    const oldOrder = track.agentOrder ? [...track.agentOrder] : null
    pushUndo('setAgentSort', { trackId, oldOrder }, 'Agent sort changed')

    // Use agent index for O(1) per-agent lookup instead of filtering all tasks
    const idx = track._agentIndex || buildAgentIndex(track.tasks)
    const agentStats = track.agents.map(agent => {
      const agTasks = idx.get(agent) || []
      let workTime = 0
      for (let i = 0; i < agTasks.length; i++) workTime += agTasks[i].end - agTasks[i].start
      return {
        agent,
        utilization: workTime / (track.totalDuration || 1),
        workTime,
        taskCount: agTasks.length,
      }
    })
    switch (sortBy) {
      case 'utilization': track.agentOrder = agentStats.sort((a, b) => b.utilization - a.utilization).map(s => s.agent); break
      case 'workTime': track.agentOrder = agentStats.sort((a, b) => b.workTime - a.workTime).map(s => s.agent); break
      case 'tasks': track.agentOrder = agentStats.sort((a, b) => b.taskCount - a.taskCount).map(s => s.agent); break
      default: track.agentOrder = [...track.agents].sort(); break
    }
    saveTracks()
  }

  function groupAgentsByType(trackId) {
    const track = tracks.value.find(t => t.id === trackId)
    if (!track) return
    const groups = {}
    ;(track.agentOrder || track.agents).forEach(agent => {
      const type = agent.replace(/-\d+$/, '')
      if (!groups[type]) groups[type] = []
      groups[type].push(agent)
    })
    track.agentGroups = Object.entries(groups).map(([label, agents]) => ({ label, agents }))
    saveTracks()
  }

  function clearAgentGroups(trackId) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) { track.agentGroups = []; saveTracks() }
  }

  function toggleOverviewMode(trackId) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) {
      track.overviewMode = !track.overviewMode
      saveTracks()
    }
  }

  // ── Session persistence (IndexedDB — no 5MB limit) ──
  const DB_NAME = 'retrace-studio'
  const DB_STORE = 'session'
  const DB_KEY = 'tracks'
  let _saveTimer = null
  let _db = null // cached IDB connection

  function _openDB() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE) }
      req.onsuccess = () => { _db = req.result; resolve(_db) }
      req.onerror = () => reject(req.error)
    })
  }

  function saveTracks() {
    // Debounce: coalesce rapid saves into a single write after 800ms idle
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(_doSaveTracks, 800)
  }

  // Flush pending save on page unload (CMD+R, tab close, etc.)
  window.addEventListener('beforeunload', () => {
    if (_saveTimer) { clearTimeout(_saveTimer); _doSaveTracksSync() }
  })

  function _buildSaveData() {
    // Build plain object manually to avoid JSON.parse(JSON.stringify()) on the
    // full dataset. We only need to unwrap Vue proxies at the top level — task
    // arrays and primitive fields don't need a full round-trip.
    const rawTracks = toRaw(tracks.value)
    const result = {
      tracks: [],
      trackIdCounter,
      hiddenTrackIds: [...toRaw(hiddenTrackIds.value)],
    }
    for (let i = 0; i < rawTracks.length; i++) {
      const t = toRaw(rawTracks[i])
      result.tracks.push({
        id: t.id,
        title: t.title,
        caseIds: t.caseIds,
        tasks: toRaw(t.tasks),
        agents: toRaw(t.agents),
        totalDuration: t.totalDuration,
        activeCases: [...toRaw(t.activeCases)],
        agentIdToName: t.agentIdToName || {},
        agentOrder: t.agentOrder ? toRaw(t.agentOrder) : null,
        agentGroups: t.agentGroups ? toRaw(t.agentGroups) : [],
        overviewMode: t.overviewMode || false,
      })
    }
    return result
  }

  let _saveBusy = false
  async function _doSaveTracks() {
    _saveTimer = null
    if (_saveBusy) { saveTracks(); return } // re-queue if a save is in progress
    _saveBusy = true
    try {
      const data = _buildSaveData()
      const db = await _openDB()
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite')
        tx.objectStore(DB_STORE).put(data, DB_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
      })
    } catch (e) {
      console.warn('[RETrace] saveTracks failed:', e.name, e.message)
    } finally {
      _saveBusy = false
    }
  }

  // Synchronous fallback for beforeunload — localStorage as last resort
  function _doSaveTracksSync() {
    _saveTimer = null
    try {
      // Try IDB fire-and-forget (may not complete before unload)
      if (_db) {
        const tx = _db.transaction(DB_STORE, 'readwrite')
        tx.objectStore(DB_STORE).put(_buildSaveData(), DB_KEY)
      }
      // Also write to localStorage as backup (may fail for large data, but fine for small)
      const json = JSON.stringify(_buildSaveData())
      localStorage.setItem('resourcetrace-session', json)
    } catch (e) { /* best effort */ }
  }

  async function restoreTracks() {
    try {
      // Show loading toast immediately — await nextTick so Vue renders the element
      // before the enter transition triggers
      showCacheToastLoading()
      await nextTick()

      // Try IndexedDB first
      const db = await _openDB()
      const data = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly')
        const req = tx.objectStore(DB_STORE).get(DB_KEY)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      console.log('[RETrace] restore: IDB data found?', !!data, data ? `${data.tracks?.length ?? 0} tracks` : '')
      if (data && data.tracks && Array.isArray(data.tracks) && data.tracks.length > 0) {
        // Let the loading animation render for at least a beat
        await new Promise((r) => setTimeout(r, 600))
        _applyRestoredData(data)
        localStorage.removeItem('resourcetrace-session')
        tracksRestored.value = true
        const n = data.tracks.length
        const totalTasks = data.tracks.reduce((sum, t) => sum + (t.tasks?.length || 0), 0)
        showCacheToastDone(
          `Restored ${n} track${n > 1 ? 's' : ''} from cache`,
          totalTasks ? `${totalTasks.toLocaleString()} tasks ready to explore` : 'Lightning-fast reload',
          3500
        )
        return
      }
      // Fallback: try old localStorage data (migration path)
      const raw = localStorage.getItem('resourcetrace-session')
      if (raw) {
        const lsData = JSON.parse(raw)
        if (lsData.tracks && Array.isArray(lsData.tracks) && lsData.tracks.length > 0) {
          await new Promise((r) => setTimeout(r, 600))
          _applyRestoredData(lsData)
          _doSaveTracks()
          localStorage.removeItem('resourcetrace-session')
          const n = lsData.tracks.length
          const totalTasks = lsData.tracks.reduce((sum, t) => sum + (t.tasks?.length || 0), 0)
          showCacheToastDone(
            `Restored ${n} track${n > 1 ? 's' : ''} from cache`,
            totalTasks ? `${totalTasks.toLocaleString()} tasks ready to explore` : 'Lightning-fast reload',
            3500
          )
        } else {
          // No data found — hide loading toast
          cacheToastVisible.value = false
        }
      } else {
        // No cached data at all — hide loading toast
        cacheToastVisible.value = false
      }
    } catch (e) {
      console.warn('[RETrace] restoreTracks failed:', e.name, e.message)
      cacheToastVisible.value = false
    }
    tracksRestored.value = true
  }

  function _applyRestoredData(data) {
    tracks.value = data.tracks.map((t) => ({
      ...t,
      activeCases: new Set(t.activeCases || t.caseIds),
      agentOrder: t.agentOrder || null,
      agentGroups: t.agentGroups || [],
      overviewMode: t.overviewMode || false,
      _agentIndex: buildAgentIndex(t.tasks),
    }))
    trackIdCounter = data.trackIdCounter || Math.max(...tracks.value.map((t) => t.id)) + 1
    globalMaxDuration.value = Math.max(...tracks.value.map((t) => t.totalDuration))
    if (data.hiddenTrackIds && Array.isArray(data.hiddenTrackIds)) {
      hiddenTrackIds.value = new Set(data.hiddenTrackIds)
    }
  }

  // Programmatic scroll helpers (used to distinguish user vs auto scroll)
  // Smooth scroll fires many scroll events over ~300ms, so we use a time window
  const PROGRAMMATIC_SCROLL_WINDOW = 500 // ms
  function markProgrammaticScroll() { _programmaticScrollUntil = performance.now() + PROGRAMMATIC_SCROLL_WINDOW }
  function isProgrammaticScroll() { return performance.now() < _programmaticScrollUntil }

  // ── Centralized scroll sync ──────────────────────────────────────────
  // Prevents scroll event cascades (Track A syncs B → B fires scroll → B
  // syncs A back to stale position → snap-back). All scroll operations go
  // through syncScrollAll() which sets a guard flag so receiving tracks
  // skip re-broadcasting.
  const _scrollEls = new Set()          // registered .track-hscroll elements
  let _scrollSyncing = false            // re-entrancy guard

  function registerScrollEl(el)   { if (el) _scrollEls.add(el) }
  function unregisterScrollEl(el) { _scrollEls.delete(el) }
  function isScrollSyncing()      { return _scrollSyncing }

  /**
   * Sync all registered track scroll containers to the given scrollLeft,
   * skipping the source element. Updates viewport state.
   */
  function syncScrollAll(sourceEl, left) {
    viewportLeft.value = left
    if (sourceEl) viewportWidth.value = sourceEl.clientWidth
    _scrollSyncing = true
    for (const el of _scrollEls) {
      if (el !== sourceEl) el.scrollLeft = left
    }
    _scrollSyncing = false
  }

  /**
   * Scroll all track hscrolls so the given time (in seconds) is centered.
   */
  function scrollToTime(time) {
    const timePx = time * pxPerSecond.value
    markProgrammaticScroll()
    // Use first registered element to compute viewport width
    const first = _scrollEls.values().next().value
    const vpW = first ? first.clientWidth : viewportWidth.value
    const targetLeft = Math.max(0, timePx - (vpW - 130) / 2)
    syncScrollAll(null, targetLeft)
  }

  return {
    loadedFolders,
    selectedFolderIdx,
    selectedFolder,
    tracks,
    tracksRestored,
    pxPerSecond,
    globalMaxDuration,
    playheadTime,
    isolatedCaseId,
    isPlaying,
    playbackSpeed,
    searchQuery,
    highlightedTaskKeys,
    searchResults,
    searchResultIndex,
    filterMode,
    selectedTask,
    focusedAgent,
    focusedTrackId,
    annotations,
    bookmarks,
    viewMode,
    selectedCaseForFlow,
    wsEnabled,
    wsStartH,
    wsEndH,
    showWait,
    showAssign,
    showLabels,
    showCollabBorder,
    showVolunteers,
    volFormat,
    showLegend,
    showMarkerLegend,
    showZeroDuration,
    compactMode,
    dimOpacity,
    showAnnotations,
    annotationColor,
    showPredecessors,
    showConcurrentAgents,
    showMiniTimeline,
    enableKeyboardNav,
    defaultAgentSort,
    viewportLeft,
    viewportWidth,
    allCaseIds,
    hasAssignInfo,
    laneHeight,
    blockHeight,
    blockTop,
    canUndo,
    toastMessage,
    toastVisible,
    showToast,
    cacheToastVisible,
    cacheToastPhase,
    cacheToastMessage,
    cacheToastSub,
    showCacheToastLoading,
    showCacheToastDone,
    addTrack,
    addTrackFromParsed,
    removeTrack,
    clearAll,
    toggleCaseActive,
    isCaseActive,
    toggleIsolation,
    clearIsolation,
    selectTask,
    clearSelection,
    addAnnotation,
    removeAnnotation,
    updateAnnotation,
    addBookmark,
    removeBookmark,
    updateBookmark,
    restoreAnnotations,
    reorderTrack,
    reorderAgent,
    setAgentSort,
    groupAgentsByType,
    clearAgentGroups,
    overviewRowHeight,
    toggleOverviewMode,
    undoStack,
    undo,
    autoFollow,
    markProgrammaticScroll,
    isProgrammaticScroll,
    hiddenTrackIds,
    visibleTracks,
    hiddenTracks,
    hideTrack,
    showTrack,
    showAllTracks,
    renameTrack,
    renameAgent,
    scrollToTime,
    registerScrollEl,
    unregisterScrollEl,
    isScrollSyncing,
    syncScrollAll,
    saveTracks,
    restoreTracks,
    buildAgentIndex,
  }
})

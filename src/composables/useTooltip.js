import { reactive, ref } from 'vue'

const tooltipEl = ref(null)

const state = reactive({
  visible: false,
  x: 0,
  y: 0,
  task: null,
  track: null,
  predecessor: null,
  successor: null,
  concurrentAgents: [],
  caseTimeline: [],
  caseSummary: null, // { absStart, absEnd, processing, waiting, throughput, taskCount }
})

function computeContext(task, track) {
  if (!task || !track) return

  // Case tasks sorted by start time
  const caseTasks = track.tasks
    .filter(t => t.caseId === task.caseId)
    .sort((a, b) => a.start - b.start)

  state.caseTimeline = caseTasks

  // Find predecessor and successor (prev/next task with a DIFFERENT taskId in same case)
  // This skips collaborative task copies (same taskId, different agent)
  const idx = caseTasks.findIndex(t => t.taskId === task.taskId && t.agent === task.agent)

  // Look backwards for predecessor with different taskId
  state.predecessor = null
  for (let i = idx - 1; i >= 0; i--) {
    if (caseTasks[i].taskId !== task.taskId) {
      state.predecessor = caseTasks[i]
      break
    }
  }

  // Look forwards for successor with different taskId
  state.successor = null
  for (let i = idx + 1; i < caseTasks.length; i++) {
    if (caseTasks[i].taskId !== task.taskId) {
      state.successor = caseTasks[i]
      break
    }
  }

  // Concurrent agents: other agents working on the same case at overlapping time
  state.concurrentAgents = caseTasks
    .filter(t => t.agent !== task.agent && t.start < task.end && t.end > task.start)
    .map(t => t.agent)
    .filter((v, i, a) => a.indexOf(v) === i) // unique

  // Case summary: aggregate stats for the entire case
  if (caseTasks.length > 0) {
    let firstStart = Infinity, lastEnd = -Infinity
    let firstAbsStart = '', lastAbsEnd = ''
    let totalWaiting = 0
    const seenWaitIds = new Set()

    // Collect processing intervals for overlap-aware merging
    const procIntervals = []
    for (let i = 0; i < caseTasks.length; i++) {
      const t = caseTasks[i]
      if (t.start < firstStart) { firstStart = t.start; firstAbsStart = t.absStart || '' }
      if (t.end > lastEnd) { lastEnd = t.end; lastAbsEnd = t.absEnd || '' }
      // Deduplicate collab copies: count waiting once per logical task (same taskId)
      if (!seenWaitIds.has(t.taskId)) {
        seenWaitIds.add(t.taskId)
        totalWaiting += (t.waiting || 0)
      }
      procIntervals.push([t.start, t.end])
    }

    // Merge overlapping processing intervals (for collab tasks)
    procIntervals.sort((a, b) => a[0] - b[0])
    let mergedProc = 0
    let curS = procIntervals[0][0], curE = procIntervals[0][1]
    for (let i = 1; i < procIntervals.length; i++) {
      if (procIntervals[i][0] <= curE) {
        if (procIntervals[i][1] > curE) curE = procIntervals[i][1]
      } else {
        mergedProc += curE - curS
        curS = procIntervals[i][0]
        curE = procIntervals[i][1]
      }
    }
    mergedProc += curE - curS

    const throughput = lastEnd - firstStart

    state.caseSummary = {
      absStart: firstAbsStart,
      absEnd: lastAbsEnd,
      processing: mergedProc,
      waiting: totalWaiting,
      throughput,
      taskCount: seenWaitIds.size,
    }
  } else {
    state.caseSummary = null
  }
}

export function useTooltip() {
  function showTip(event, task, track) {
    state.task = task
    state.track = track
    computeContext(task, track)
    state.visible = true
    moveTip(event)
  }

  function moveTip(event) {
    let x = event.clientX + 14
    let y = event.clientY + 14
    const tipW = tooltipEl.value?.offsetWidth || 310
    const tipH = tooltipEl.value?.offsetHeight || 200
    if (x + tipW > window.innerWidth) x = event.clientX - tipW
    if (y + tipH > window.innerHeight) y = Math.max(4, window.innerHeight - tipH - 4)
    state.x = x
    state.y = y
  }

  function hideTip() {
    state.visible = false
    state.task = null
    state.track = null
    state.predecessor = null
    state.successor = null
    state.concurrentAgents = []
    state.caseTimeline = []
    state.caseSummary = null
  }

  return { tipState: state, tooltipEl, showTip, moveTip, hideTip }
}

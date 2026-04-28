/**
 * Process Mining Statistics Calculator
 *
 * Computes standard process mining KPIs per track:
 *
 * Case-level metrics:
 *   - Cycle Time:       End-to-end time of a case (first task start → last task end)
 *   - Throughput Time:   Same as cycle time (synonymous in PM literature)
 *   - Lead Time:         Time from first assignment to last task completion
 *   - Processing Time:   Merged duration of all active task intervals (no double-count)
 *   - Waiting Time:      Merged duration of waiting intervals not overlapping processing
 *   - Idle Time:         Cycle time minus processing minus waiting (gaps with no activity)
 *
 * Task-level metrics:
 *   - Service Time:      Duration of individual task execution
 *   - Sojourn Time:      Waiting + service time for a task
 *
 * Resource metrics:
 *   - Utilization:       % of total time the resource is busy
 *   - Throughput:        Tasks completed per time unit
 *   - Workload:          Number of tasks per resource
 *
 * Process-level metrics:
 *   - Arrival Rate:      Cases arriving per time unit
 *   - Completion Rate:   Cases completing per time unit
 *   - WIP:               Work in progress at average point in time
 *   - Flow Efficiency:   Processing time / cycle time (%)
 */

import { workingSecondsBetween } from '../utils/workSchedule'

/**
 * Compute process mining statistics for a single track.
 *
 * @param {Object} track - Track object with .tasks, .agents, .caseIds, .totalDuration
 * @param {Object} [workSchedule] - Optional work schedule config:
 *   { enabled: true, startH: 8, endH: 20, workDays: Set<number> }
 *   When enabled, waiting/idle times only count working hours (excludes nights/weekends).
 * @returns {Object|null} Statistics object or null if not enough data
 */
export function computeTrackStats(track, workSchedule) {
  if (!track || !track.tasks || track.tasks.length === 0) return null

  const tasks = track.tasks
  const agents = track.agents || []
  const totalDuration = track.totalDuration || 0

  // Work schedule: when enabled, recompute per-task waiting using only working hours
  const ws = workSchedule?.enabled ? workSchedule : null

  // ── Group tasks by case (single pass) ──
  const caseTasks = {}
  let collabCount = 0
  const activitySet = new Set()

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    if (!caseTasks[t.caseId]) caseTasks[t.caseId] = []
    caseTasks[t.caseId].push(t)
    if (t.isCollab) collabCount++
    if (t.taskName) activitySet.add(t.taskName)
  }

  const caseIds = Object.keys(caseTasks)
  const nCases = caseIds.length
  const nTasks = tasks.length

  // ── Case-level metrics (avoid Math.min/max with spread on arrays) ──
  const caseMetrics = new Array(nCases)
  for (let ci = 0; ci < nCases; ci++) {
    const ct = caseTasks[caseIds[ci]]
    let firstStart = Infinity, lastEnd = -Infinity, firstAssigned = Infinity
    let firstAbsStart = null, lastAbsEnd = null, firstAbsAssigned = null
    const agentsSeen = new Set()

    for (let j = 0; j < ct.length; j++) {
      const t = ct[j]
      if (t.start < firstStart) { firstStart = t.start; firstAbsStart = t.absStart || null }
      if (t.end > lastEnd) { lastEnd = t.end; lastAbsEnd = t.absEnd || null }
      if (t.assigned < firstAssigned) { firstAssigned = t.assigned; firstAbsAssigned = t.absAssigned || null }
      agentsSeen.add(t.agent)
    }

    // When work schedule is active and absolute timestamps are available,
    // compute ALL time components in working hours so they remain consistent:
    //   cycleTime      = working hours from first task start → last task end
    //   leadTime       = working hours from first assignment → last task end
    //   processingTime = sum of working hours per task execution (capped at cycleTime)
    //   waitingTime    = sum of working hours per task waiting (capped at remainder)
    //   idleTime       = cycleTime − processingTime − waitingTime
    const useWs = ws && firstAbsStart && lastAbsEnd

    let cycleTime, leadTime, processingTime, waitingTime, idleTime

    if (useWs) {
      // All times in working hours only
      const wsCycle = workingSecondsBetween(firstAbsStart, lastAbsEnd, ws.startH, ws.endH, ws.workDays)
      cycleTime = !isNaN(wsCycle) ? wsCycle : (lastEnd - firstStart)

      const wsLead = firstAbsAssigned
        ? workingSecondsBetween(firstAbsAssigned, lastAbsEnd, ws.startH, ws.endH, ws.workDays)
        : NaN
      leadTime = !isNaN(wsLead) ? wsLead : (lastEnd - firstAssigned)

      // Deduplicate collab tasks: the parser creates one task-object per agent for
      // collaborative tasks, but they share the same timestamps. Use a Set of taskIds
      // to count each logical task only once (matching the notebook which has 1 CSV row
      // per task regardless of agent count).
      const seenTaskIds = new Set()

      // Processing: sum working hours per unique task
      let rawProc = 0
      for (let j = 0; j < ct.length; j++) {
        const t = ct[j]
        if (seenTaskIds.has(t.taskId)) continue
        seenTaskIds.add(t.taskId)
        if (t.absStart && t.absEnd) {
          const p = workingSecondsBetween(t.absStart, t.absEnd, ws.startH, ws.endH, ws.workDays)
          if (!isNaN(p)) rawProc += p
        } else {
          rawProc += (t.end - t.start)
        }
      }
      processingTime = Math.min(rawProc, cycleTime)

      // Waiting: sum working hours per unique task waiting period
      // No cap applied — overlapping wait periods are summed, matching
      // the per-task analysis in the evaluation notebook.
      seenTaskIds.clear()
      let rawWait = 0
      for (let j = 0; j < ct.length; j++) {
        const t = ct[j]
        if (seenTaskIds.has(t.taskId)) continue
        seenTaskIds.add(t.taskId)
        if (t.absAssigned && t.absStart) {
          const w = workingSecondsBetween(t.absAssigned, t.absStart, ws.startH, ws.endH, ws.workDays)
          if (!isNaN(w)) rawWait += w
        } else {
          rawWait += (t.waiting || 0)
        }
      }
      waitingTime = rawWait

      idleTime = Math.max(0, cycleTime - processingTime - waitingTime)
    } else {
      // Standard calendar-time calculation using interval merging
      cycleTime = lastEnd - firstStart
      leadTime = lastEnd - firstAssigned

      const procIntervals = new Array(ct.length)
      const waitIntervals = []
      for (let j = 0; j < ct.length; j++) {
        const t = ct[j]
        procIntervals[j] = [t.start, t.end]
        const w = t.waiting || 0
        if (w > 0) waitIntervals.push([t.start - w, t.start])
      }
      processingTime = mergedDuration(procIntervals)
      waitingTime = Math.max(0, mergedDurationExcluding(waitIntervals, procIntervals))
      idleTime = Math.max(0, cycleTime - processingTime - waitingTime)
    }

    const flowEfficiency = cycleTime > 0 ? (processingTime / cycleTime) * 100 : 0

    // Handovers: sort by start time, count agent changes
    // For small case arrays (typical), insertion sort is fast
    const sorted = ct.length <= 1 ? ct : [...ct].sort((a, b) => a.start - b.start)
    let handovers = 0
    for (let j = 1; j < sorted.length; j++) {
      if (sorted[j].agent !== sorted[j - 1].agent) handovers++
    }

    caseMetrics[ci] = {
      caseId: caseIds[ci],
      cycleTime,
      leadTime,
      processingTime,
      waitingTime,
      idleTime,
      flowEfficiency,
      taskCount: ct.length,
      resourceCount: agentsSeen.size,
      handovers,
    }
  }

  // ── Aggregate case metrics ──
  const cycleTime = agg(caseMetrics, 'cycleTime')
  const leadTime = agg(caseMetrics, 'leadTime')
  const processingTime = agg(caseMetrics, 'processingTime')
  const waitingTime = agg(caseMetrics, 'waitingTime')
  const idleTime = agg(caseMetrics, 'idleTime')
  const flowEfficiency = agg(caseMetrics, 'flowEfficiency')
  const handovers = agg(caseMetrics, 'handovers')

  // ── Task-level metrics — compute in single pass (avoid .map + .sort) ──
  const serviceTimes = new Array(nTasks)
  const sojournTimes = new Array(nTasks)
  for (let i = 0; i < nTasks; i++) {
    const t = tasks[i]
    if (ws && t.absStart && t.absEnd) {
      const svc = workingSecondsBetween(t.absStart, t.absEnd, ws.startH, ws.endH, ws.workDays)
      serviceTimes[i] = !isNaN(svc) ? svc : (t.end - t.start)
    } else {
      serviceTimes[i] = t.end - t.start
    }
    if (ws && t.absAssigned && t.absEnd) {
      const soj = workingSecondsBetween(t.absAssigned, t.absEnd, ws.startH, ws.endH, ws.workDays)
      sojournTimes[i] = !isNaN(soj) ? soj : ((t.waiting || 0) + (t.end - t.start))
    } else {
      sojournTimes[i] = (t.waiting || 0) + (t.end - t.start)
    }
  }
  const serviceTime = aggArray(serviceTimes)
  const sojournTime = aggArray(sojournTimes)

  // ── Effective total duration (working hours only when ws active) ──
  // When work schedule is enabled, totalDuration should only count working hours
  // so that utilization/throughput/idle are measured against available work time.
  let effectiveTotalDuration = totalDuration
  if (ws && tasks.length > 0) {
    // Find earliest and latest absolute timestamps across all tasks
    let earliestAbs = null, latestAbs = null
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]
      const absA = t.absAssigned || t.absStart
      const absE = t.absEnd
      if (absA && (!earliestAbs || absA < earliestAbs)) earliestAbs = absA
      if (absE && (!latestAbs || absE > latestAbs)) latestAbs = absE
    }
    if (earliestAbs && latestAbs) {
      const wsDur = workingSecondsBetween(earliestAbs, latestAbs, ws.startH, ws.endH, ws.workDays)
      if (!isNaN(wsDur) && wsDur > 0) effectiveTotalDuration = wsDur
    }
  }

  // ── Resource metrics — use agent index if available, else build one ──
  const agentIndex = track._agentIndex || buildAgentIndexLocal(tasks)
  const resourceStats = new Array(agents.length)
  let totalAgentProcessing = 0, totalAgentWaiting = 0, totalAgentIdle = 0
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    const agTasks = agentIndex.get(agent) || []

    let agProcessing, agWaiting

    if (ws) {
      // Sum per-task working seconds for this agent
      let proc = 0, wait = 0
      for (let j = 0; j < agTasks.length; j++) {
        const t = agTasks[j]
        if (t.absStart && t.absEnd) {
          const p = workingSecondsBetween(t.absStart, t.absEnd, ws.startH, ws.endH, ws.workDays)
          if (!isNaN(p)) proc += p; else proc += (t.end - t.start)
        } else {
          proc += (t.end - t.start)
        }
        if (t.absAssigned && t.absStart) {
          const w = workingSecondsBetween(t.absAssigned, t.absStart, ws.startH, ws.endH, ws.workDays)
          if (!isNaN(w)) wait += w; else wait += (t.waiting || 0)
        } else {
          wait += (t.waiting || 0)
        }
      }
      // Cap at effective total duration
      agProcessing = Math.min(proc, effectiveTotalDuration)
      agWaiting = Math.min(wait, Math.max(0, effectiveTotalDuration - agProcessing))
    } else {
      // Standard interval-merging approach on relative timeline
      const procIvs = new Array(agTasks.length)
      const waitIvs = []
      for (let j = 0; j < agTasks.length; j++) {
        const t = agTasks[j]
        procIvs[j] = [t.start, t.end]
        const w = t.waiting || 0
        if (w > 0) waitIvs.push([t.start - w, t.start])
      }
      agProcessing = mergedDuration(procIvs)
      agWaiting = waitIvs.length > 0
        ? Math.max(0, mergedDurationExcluding(waitIvs, procIvs))
        : 0
    }

    const agIdle = Math.max(0, effectiveTotalDuration - agProcessing - agWaiting)

    totalAgentProcessing += agProcessing
    totalAgentWaiting += agWaiting
    totalAgentIdle += agIdle

    const utilization = effectiveTotalDuration > 0 ? (agProcessing / effectiveTotalDuration) * 100 : 0
    const throughput = effectiveTotalDuration > 0 ? (agTasks.length / (effectiveTotalDuration / 3600)) : 0

    resourceStats[i] = {
      agent,
      taskCount: agTasks.length,
      workingTime: agProcessing,
      waitingTime: agWaiting,
      idleTime: agIdle,
      utilization,
      throughput,
    }
  }

  // ── Aggregate agent time breakdown (all agents combined) ──
  const nAgents = agents.length || 1
  const agentTimeBreakdown = {
    processing: totalAgentProcessing / nAgents,
    waiting: totalAgentWaiting / nAgents,
    idle: totalAgentIdle / nAgents,
    total: effectiveTotalDuration,
    processingPct: effectiveTotalDuration > 0 ? (totalAgentProcessing / (effectiveTotalDuration * nAgents)) * 100 : 0,
    waitingPct: effectiveTotalDuration > 0 ? (totalAgentWaiting / (effectiveTotalDuration * nAgents)) * 100 : 0,
    idlePct: effectiveTotalDuration > 0 ? (totalAgentIdle / (effectiveTotalDuration * nAgents)) * 100 : 0,
  }

  const utilizations = resourceStats.map((r) => r.utilization)
  const resourceUtilization = aggArray(utilizations)

  const throughputs = resourceStats.map((r) => r.throughput)
  const resourceThroughput = aggArray(throughputs)

  const workloads = resourceStats.map((r) => r.taskCount)
  const resourceWorkload = aggArray(workloads)

  // ── Process-level metrics ──
  const arrivalRate = effectiveTotalDuration > 0 ? (nCases / (effectiveTotalDuration / 3600)) : 0
  const completionRate = arrivalRate
  const avgWIP = arrivalRate * (cycleTime.avg / 3600)

  const collabPct = nTasks > 0 ? (collabCount / nTasks) * 100 : 0

  return {
    nCases,
    nTasks,
    nResources: agents.length,
    nActivities: activitySet.size,
    totalDuration: effectiveTotalDuration,
    collabTasks: collabCount,
    collabPct,

    cycleTime,
    leadTime,
    processingTime,
    waitingTime,
    idleTime,
    flowEfficiency,
    handovers,

    serviceTime,
    sojournTime,

    resourceUtilization,
    resourceThroughput,
    resourceWorkload,
    resourceStats,

    arrivalRate,
    completionRate,
    avgWIP,

    agentTimeBreakdown,
    caseMetrics,
  }
}

/**
 * Aggregate helper — extracts key from array of objects, computes stats.
 * Avoids sorting the entire array — uses partial sort for median.
 */
function agg(arr, key) {
  const n = arr.length
  if (n === 0) return { avg: 0, min: 0, max: 0, median: 0, total: 0 }

  let sum = 0, mn = Infinity, mx = -Infinity
  const vals = new Array(n)
  for (let i = 0; i < n; i++) {
    const v = arr[i][key]
    vals[i] = v
    sum += v
    if (v < mn) mn = v
    if (v > mx) mx = v
  }

  // Sort only for median (unavoidable, but still O(n log n))
  vals.sort((a, b) => a - b)
  const med = n % 2 === 0
    ? (vals[n / 2 - 1] + vals[n / 2]) / 2
    : vals[Math.floor(n / 2)]

  return { avg: sum / n, min: mn, max: mx, median: med, total: sum }
}

/**
 * Aggregate helper for a raw array of numbers.
 */
function aggArray(vals) {
  const n = vals.length
  if (n === 0) return { avg: 0, min: 0, max: 0, median: 0, total: 0 }

  let sum = 0, mn = Infinity, mx = -Infinity
  for (let i = 0; i < n; i++) {
    sum += vals[i]
    if (vals[i] < mn) mn = vals[i]
    if (vals[i] > mx) mx = vals[i]
  }

  // Sort a copy for median
  const sorted = [...vals].sort((a, b) => a - b)
  const med = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)]

  return { avg: sum / n, min: mn, max: mx, median: med, total: sum }
}

/**
 * Compute total duration covered by a set of [start, end] intervals after merging overlaps.
 * E.g. [[0,10],[5,15]] → 15 (not 20).
 */
function mergedDuration(intervals) {
  if (intervals.length === 0) return 0
  // Filter out zero/negative-length intervals
  const valid = []
  for (let i = 0; i < intervals.length; i++) {
    if (intervals[i][1] > intervals[i][0]) valid.push(intervals[i])
  }
  if (valid.length === 0) return 0
  valid.sort((a, b) => a[0] - b[0])
  let total = 0
  let curStart = valid[0][0], curEnd = valid[0][1]
  for (let i = 1; i < valid.length; i++) {
    if (valid[i][0] <= curEnd) {
      // Overlapping — extend
      if (valid[i][1] > curEnd) curEnd = valid[i][1]
    } else {
      // Gap — flush current
      total += curEnd - curStart
      curStart = valid[i][0]
      curEnd = valid[i][1]
    }
  }
  total += curEnd - curStart
  return total
}

/**
 * Compute total duration covered by intervals A that is NOT covered by intervals B.
 * Used to find waiting time that doesn't overlap with processing time.
 */
function mergedDurationExcluding(intervalsA, intervalsB) {
  if (intervalsA.length === 0) return 0
  // Merge A intervals
  const a = mergeIntervals(intervalsA)
  if (a.length === 0) return 0
  if (intervalsB.length === 0) return a.reduce((s, iv) => s + iv[1] - iv[0], 0)
  // Merge B intervals
  const b = mergeIntervals(intervalsB)
  // Subtract B from A
  let total = 0
  let bi = 0
  for (let ai = 0; ai < a.length; ai++) {
    let start = a[ai][0], end = a[ai][1]
    while (bi < b.length && b[bi][1] <= start) bi++
    let j = bi
    while (j < b.length && b[j][0] < end) {
      if (b[j][0] > start) total += b[j][0] - start
      start = Math.max(start, b[j][1])
      j++
    }
    if (start < end) total += end - start
  }
  return total
}

function mergeIntervals(intervals) {
  const valid = []
  for (let i = 0; i < intervals.length; i++) {
    if (intervals[i][1] > intervals[i][0]) valid.push(intervals[i])
  }
  if (valid.length === 0) return []
  valid.sort((a, b) => a[0] - b[0])
  const merged = [valid[0].slice()]
  for (let i = 1; i < valid.length; i++) {
    const last = merged[merged.length - 1]
    if (valid[i][0] <= last[1]) {
      if (valid[i][1] > last[1]) last[1] = valid[i][1]
    } else {
      merged.push(valid[i].slice())
    }
  }
  return merged
}

/**
 * Build local agent index (fallback when track._agentIndex not available).
 */
function buildAgentIndexLocal(tasks) {
  const idx = new Map()
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    let arr = idx.get(t.agent)
    if (!arr) { arr = []; idx.set(t.agent, arr) }
    arr.push(t)
  }
  return idx
}


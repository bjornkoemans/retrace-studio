/**
 * Comparison Statistics Calculator
 *
 * Computes side-by-side comparison metrics for two tracks:
 * - KPI deltas (absolute + percentage change)
 * - Per-agent paired comparison
 * - Workload balance (Gini coefficient)
 * - Assignment type breakdown
 * - Volunteering analysis
 * - Activity-level comparison
 * - Handover matrices
 * - Case cycle time distributions
 */

import { computeTrackStats } from './useProcessMiningStats'

// ── Helpers ──

function delta(a, b) {
  const d = b - a
  const pct = a !== 0 ? (d / a) * 100 : (b !== 0 ? Infinity : 0)
  return { a, b, delta: d, pct }
}

function gini(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((s, v) => s + v, 0) / n
  if (mean === 0) return 0
  let sumDiff = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j])
    }
  }
  return sumDiff / (2 * n * n * mean)
}

function buildHandoverMatrix(tasks) {
  // Group by case, sort by start, count consecutive agent transitions
  const byCase = {}
  tasks.forEach(t => {
    if (!byCase[t.caseId]) byCase[t.caseId] = []
    byCase[t.caseId].push(t)
  })

  const agents = [...new Set(tasks.map(t => t.agent))].sort()
  const agentIdx = {}
  agents.forEach((a, i) => { agentIdx[a] = i })

  const matrix = agents.map(() => agents.map(() => 0))

  Object.values(byCase).forEach(caseTasks => {
    const sorted = [...caseTasks].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].agent !== sorted[i - 1].agent) {
        const from = agentIdx[sorted[i - 1].agent]
        const to = agentIdx[sorted[i].agent]
        if (from !== undefined && to !== undefined) {
          matrix[from][to]++
        }
      }
    }
  })

  return { agents, matrix }
}

function analyzeVolunteering(track) {
  const tasks = track.tasks || []
  const totalTasks = tasks.length
  const tasksWithVol = tasks.filter(t => t.volunteerIds && t.volunteerIds.length > 0)
  const volunteerRate = totalTasks > 0 ? (tasksWithVol.length / totalTasks) * 100 : 0
  const avgVolPerTask = tasksWithVol.length > 0
    ? tasksWithVol.reduce((s, t) => s + t.volunteerIds.length, 0) / tasksWithVol.length
    : 0

  // Per-agent: how often they volunteer vs get assigned
  const agentVol = {}    // agent -> count of tasks where they volunteered
  const agentAssigned = {} // agent -> count of tasks assigned to them

  tasks.forEach(t => {
    agentAssigned[t.agent] = (agentAssigned[t.agent] || 0) + 1
    if (t.volunteerIds) {
      t.volunteerIds.forEach(vid => {
        // Try to resolve volunteer ID to agent name
        const name = track.agentIdToName?.[vid] || `Agent ${vid}`
        agentVol[name] = (agentVol[name] || 0) + 1
      })
    }
  })

  // Combine into per-agent rows
  const allAgents = new Set([...Object.keys(agentVol), ...Object.keys(agentAssigned)])
  const byAgent = [...allAgents].sort().map(agent => ({
    agent,
    volunteerCount: agentVol[agent] || 0,
    assignedCount: agentAssigned[agent] || 0,
    ratio: (agentAssigned[agent] || 0) > 0
      ? (agentVol[agent] || 0) / agentAssigned[agent]
      : 0,
  }))

  return {
    totalTasks,
    tasksWithVolunteers: tasksWithVol.length,
    volunteerRate,
    avgVolunteersPerTask: avgVolPerTask,
    byAgent,
  }
}

function analyzeAssignmentTypes(tasks) {
  const counts = {}
  tasks.forEach(t => {
    const type = t.assignmentType || 'unknown'
    counts[type] = (counts[type] || 0) + 1
  })
  const total = tasks.length
  const types = Object.entries(counts)
    .map(([type, count]) => ({ type, count, pct: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count)
  return { types, total }
}

function analyzeActivities(tasks) {
  const byActivity = {}
  tasks.forEach(t => {
    const name = t.taskName || 'unnamed'
    if (!byActivity[name]) byActivity[name] = { count: 0, totalDuration: 0 }
    byActivity[name].count++
    byActivity[name].totalDuration += (t.end - t.start)
  })
  return Object.entries(byActivity).map(([activity, data]) => ({
    activity,
    count: data.count,
    avgDuration: data.count > 0 ? data.totalDuration / data.count : 0,
    totalDuration: data.totalDuration,
  }))
}

/**
 * Apply optional filters to a track, returning a shallow copy with filtered tasks.
 */
function applyFilters(track, filters) {
  if (!filters) return track
  let tasks = track.tasks
  if (filters.agents && filters.agents.size > 0) {
    tasks = tasks.filter(t => filters.agents.has(t.agent))
  }
  if (filters.activities && filters.activities.size > 0) {
    tasks = tasks.filter(t => filters.activities.has(t.taskName))
  }
  if (tasks === track.tasks) return track
  // Rebuild minimal track object with filtered tasks
  const agents = [...new Set(tasks.map(t => t.agent))].sort()
  const caseIds = [...new Set(tasks.map(t => t.caseId))].sort((a, b) => a - b)
  const totalDuration = track.totalDuration
  return { ...track, tasks, agents, caseIds, totalDuration }
}

/**
 * Compute all comparison statistics between two tracks.
 *
 * @param {Object} trackA - First track object
 * @param {Object} trackB - Second track object
 * @param {Object} [filters] - Optional { agents: Set, activities: Set }
 * @param {Object} [workSchedule] - Optional { enabled, startH, endH, workDays }
 * @returns {Object|null} Comprehensive comparison data
 */
export function computeComparisonStats(trackA, trackB, filters, workSchedule) {
  if (!trackA || !trackB) return null

  const fA = applyFilters(trackA, filters)
  const fB = applyFilters(trackB, filters)

  const statsA = computeTrackStats(fA, workSchedule)
  const statsB = computeTrackStats(fB, workSchedule)
  if (!statsA || !statsB) return null

  // ── KPI Deltas ──
  const deltas = {
    cycleTime:      delta(statsA.cycleTime.avg, statsB.cycleTime.avg),
    leadTime:       delta(statsA.leadTime.avg, statsB.leadTime.avg),
    processingTime: delta(statsA.processingTime.avg, statsB.processingTime.avg),
    waitingTime:    delta(statsA.waitingTime.avg, statsB.waitingTime.avg),
    idleTime:       delta(statsA.idleTime.avg, statsB.idleTime.avg),
    flowEfficiency: delta(statsA.flowEfficiency.avg, statsB.flowEfficiency.avg),
    handovers:      delta(statsA.handovers.avg, statsB.handovers.avg),
    serviceTime:    delta(statsA.serviceTime.avg, statsB.serviceTime.avg),
    sojournTime:    delta(statsA.sojournTime.avg, statsB.sojournTime.avg),
    utilization:    delta(statsA.resourceUtilization.avg, statsB.resourceUtilization.avg),
    throughput:     delta(statsA.resourceThroughput.avg, statsB.resourceThroughput.avg),
    arrivalRate:    delta(statsA.arrivalRate, statsB.arrivalRate),
    avgWIP:         delta(statsA.avgWIP, statsB.avgWIP),
    collabPct:      delta(statsA.collabPct, statsB.collabPct),
    nCases:         delta(statsA.nCases, statsB.nCases),
    nTasks:         delta(statsA.nTasks, statsB.nTasks),
    nResources:     delta(statsA.nResources, statsB.nResources),
    nActivities:    delta(statsA.nActivities, statsB.nActivities),
  }

  // ── Per-agent paired comparison ──
  const agentsA = new Map(statsA.resourceStats.map(r => [r.agent, r]))
  const agentsB = new Map(statsB.resourceStats.map(r => [r.agent, r]))
  const allAgentNames = [...new Set([...agentsA.keys(), ...agentsB.keys()])].sort()

  const agentComparison = allAgentNames.map(agent => {
    const a = agentsA.get(agent) || null
    const b = agentsB.get(agent) || null
    return {
      agent,
      inA: !!a,
      inB: !!b,
      a,
      b,
      deltas: (a && b) ? {
        taskCount:   delta(a.taskCount, b.taskCount),
        workingTime: delta(a.workingTime, b.workingTime),
        utilization: delta(a.utilization, b.utilization),
        throughput:  delta(a.throughput, b.throughput),
      } : null,
    }
  })

  // ── Workload Balance ──
  const workloadA = statsA.resourceStats.map(r => r.taskCount)
  const workloadB = statsB.resourceStats.map(r => r.taskCount)
  const totalA = workloadA.reduce((s, v) => s + v, 0)
  const totalB = workloadB.reduce((s, v) => s + v, 0)

  const workloadBalance = {
    a: {
      gini: gini(workloadA),
      distribution: statsA.resourceStats
        .map(r => ({ agent: r.agent, taskCount: r.taskCount, pct: totalA > 0 ? (r.taskCount / totalA) * 100 : 0 }))
        .sort((a, b) => b.taskCount - a.taskCount),
    },
    b: {
      gini: gini(workloadB),
      distribution: statsB.resourceStats
        .map(r => ({ agent: r.agent, taskCount: r.taskCount, pct: totalB > 0 ? (r.taskCount / totalB) * 100 : 0 }))
        .sort((a, b) => b.taskCount - a.taskCount),
    },
  }

  // ── Assignment Types ──
  const assignmentTypes = {
    a: analyzeAssignmentTypes(fA.tasks),
    b: analyzeAssignmentTypes(fB.tasks),
  }

  // ── Volunteering ──
  const volunteering = {
    a: analyzeVolunteering(fA),
    b: analyzeVolunteering(fB),
  }

  // ── Activity Comparison ──
  const activitiesA = analyzeActivities(fA.tasks)
  const activitiesB = analyzeActivities(fB.tasks)
  const actMapA = new Map(activitiesA.map(a => [a.activity, a]))
  const actMapB = new Map(activitiesB.map(a => [a.activity, a]))
  const allActivities = [...new Set([...actMapA.keys(), ...actMapB.keys()])].sort()

  const activityComparison = allActivities.map(activity => {
    const a = actMapA.get(activity) || null
    const b = actMapB.get(activity) || null
    return {
      activity,
      inA: !!a,
      inB: !!b,
      a,
      b,
      durationDelta: (a && b) ? b.avgDuration - a.avgDuration : null,
      durationPct: (a && b && a.avgDuration > 0) ? ((b.avgDuration - a.avgDuration) / a.avgDuration) * 100 : null,
    }
  })

  // ── Case cycle time arrays ──
  const caseCycleTimesA = statsA.caseMetrics.map(c => c.cycleTime)
  const caseCycleTimesB = statsB.caseMetrics.map(c => c.cycleTime)

  // ── Case flow efficiency arrays ──
  const caseFlowEffA = statsA.caseMetrics.map(c => c.flowEfficiency)
  const caseFlowEffB = statsB.caseMetrics.map(c => c.flowEfficiency)

  // ── Handover Matrices ──
  const handoverMatrix = {
    a: buildHandoverMatrix(fA.tasks),
    b: buildHandoverMatrix(fB.tasks),
  }

  // ── Time composition: case-level (for stacked bars) ──
  const timeComposition = {
    a: {
      processing: statsA.processingTime.avg,
      waiting:    statsA.waitingTime.avg,
      idle:       statsA.idleTime.avg,
      cycle:      statsA.cycleTime.avg,
    },
    b: {
      processing: statsB.processingTime.avg,
      waiting:    statsB.waitingTime.avg,
      idle:       statsB.idleTime.avg,
      cycle:      statsB.cycleTime.avg,
    },
  }

  // ── Agent time breakdown (real wallclock per agent, averaged) ──
  const agentTimeBreakdown = {
    a: statsA.agentTimeBreakdown,
    b: statsB.agentTimeBreakdown,
  }

  return {
    statsA,
    statsB,
    deltas,
    agentComparison,
    workloadBalance,
    assignmentTypes,
    volunteering,
    activityComparison,
    caseCycleTimesA,
    caseCycleTimesB,
    caseFlowEffA,
    caseFlowEffB,
    handoverMatrix,
    timeComposition,
    agentTimeBreakdown,
  }
}

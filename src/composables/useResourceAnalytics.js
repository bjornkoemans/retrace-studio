import { computed, isRef, unref } from 'vue'
import { fmtDur } from '../utils/formatStats'

/**
 * Resource Analytics composable — provides Social Network (Handover/Working-Together/Similar),
 * Resource-Activity Matrix, per-resource KPIs, workload balance (Gini + Lorenz), and
 * resource profiles. Inspired by Celonis, PM4Py, Disco.
 */

const AGENT_COLORS = [
  '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#a855f7',
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#06b6d4',
  '#8b5cf6', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9',
]

// ── Force-directed layout ──────────────────────────────────────────
function forceLayout(nodes, edges, width, height, iterations = 180) {
  const n = nodes.length
  if (n === 0) return
  if (n === 1) { nodes[0].x = width / 2; nodes[0].y = height / 2; return }

  // Initial circular placement
  const cx = width / 2, cy = height / 2
  const radius = Math.min(width, height) * 0.35
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    nodes[i].x = cx + radius * Math.cos(angle)
    nodes[i].y = cy + radius * Math.sin(angle)
    nodes[i].vx = 0
    nodes[i].vy = 0
  }

  // Build edge lookup: node index → [{target index, weight}]
  const idxMap = new Map(nodes.map((nd, i) => [nd.id, i]))

  const repK = 8000   // repulsion constant
  const attK = 0.004  // attraction constant
  const damping = 0.85
  const minDist = 50

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations // cooling
    // Repulsion (all pairs)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = nodes[i].x - nodes[j].x
        let dy = nodes[i].y - nodes[j].y
        let dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1 }
        const force = repK / (dist * dist)
        const fx = (dx / dist) * force * temp
        const fy = (dy / dist) * force * temp
        nodes[i].vx += fx; nodes[i].vy += fy
        nodes[j].vx -= fx; nodes[j].vy -= fy
      }
    }
    // Attraction (edges)
    for (const e of edges) {
      const si = idxMap.get(e.source)
      const ti = idxMap.get(e.target)
      if (si === undefined || ti === undefined) continue
      let dx = nodes[ti].x - nodes[si].x
      let dy = nodes[ti].y - nodes[si].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 1) continue
      const force = attK * dist * Math.log(1 + e.weight) * temp
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      nodes[si].vx += fx; nodes[si].vy += fy
      nodes[ti].vx -= fx; nodes[ti].vy -= fy
    }
    // Center gravity
    for (let i = 0; i < n; i++) {
      nodes[i].vx += (cx - nodes[i].x) * 0.002 * temp
      nodes[i].vy += (cy - nodes[i].y) * 0.002 * temp
    }
    // Apply velocity
    for (let i = 0; i < n; i++) {
      nodes[i].vx *= damping
      nodes[i].vy *= damping
      nodes[i].x += nodes[i].vx
      nodes[i].y += nodes[i].vy
      // Clamp to bounds
      nodes[i].x = Math.max(60, Math.min(width - 60, nodes[i].x))
      nodes[i].y = Math.max(60, Math.min(height - 60, nodes[i].y))
    }
  }
}

// ── Gini coefficient ───────────────────────────────────────────────
function gini(values) {
  if (!values.length) return 0
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

function lorenzCurve(values) {
  if (!values.length) return []
  const sorted = [...values].sort((a, b) => a - b)
  const total = sorted.reduce((s, v) => s + v, 0)
  if (total === 0) return sorted.map((_, i) => ({ x: (i + 1) / sorted.length, y: 0 }))
  const pts = [{ x: 0, y: 0 }]
  let cum = 0
  for (let i = 0; i < sorted.length; i++) {
    cum += sorted[i]
    pts.push({ x: (i + 1) / sorted.length, y: cum / total })
  }
  return pts
}

// ── Main composable ────────────────────────────────────────────────
export function useResourceAnalytics(trackRef) {
  return computed(() => {
    const track = isRef(trackRef) ? unref(trackRef) : trackRef
    if (!track || !track.tasks || track.tasks.length === 0) return null

    const tasks = track.tasks
    const agents = track.agents || [...new Set(tasks.map(t => t.agent))]
    const activities = [...new Set(tasks.map(t => t.taskName))]
    const totalDuration = track.totalDuration || 1

    // ── Group tasks by case, sorted by start ──
    const byCase = new Map()
    for (const t of tasks) {
      if (!byCase.has(t.caseId)) byCase.set(t.caseId, [])
      byCase.get(t.caseId).push(t)
    }
    for (const [, arr] of byCase) arr.sort((a, b) => a.start - b.start)

    // ── Agent color map ──
    const agentColorMap = new Map()
    agents.forEach((a, i) => agentColorMap.set(a, AGENT_COLORS[i % AGENT_COLORS.length]))

    // ── Role extraction ──
    const agentRoleMap = new Map()
    for (const a of agents) {
      const sep = a.indexOf('##')
      agentRoleMap.set(a, sep > 0 ? a.substring(0, sep) : a)
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. SOCIAL NETWORK — Handover, Working-Together, Similar-Activities
    // ═══════════════════════════════════════════════════════════════
    function buildSocialNetwork(type = 'handover') {
      const edgeMap = new Map()
      const nodeStats = new Map()

      // Init node stats
      for (const a of agents) {
        nodeStats.set(a, { tasks: 0, cases: new Set(), totalDur: 0, activities: new Set() })
      }
      for (const t of tasks) {
        const ns = nodeStats.get(t.agent)
        if (ns) {
          ns.tasks++
          ns.cases.add(t.caseId)
          ns.totalDur += t.duration || 0
          ns.activities.add(t.taskName)
        }
      }

      if (type === 'handover') {
        // Directed: consecutive tasks in same case with different agents
        for (const [, caseTasks] of byCase) {
          for (let i = 0; i < caseTasks.length - 1; i++) {
            const from = caseTasks[i].agent
            const to = caseTasks[i + 1].agent
            if (from === to) continue
            const key = `${from}\x00${to}`
            edgeMap.set(key, (edgeMap.get(key) || 0) + 1)
          }
        }
      } else if (type === 'working-together') {
        // Undirected: agents sharing the same case
        for (const [, caseTasks] of byCase) {
          const caseAgents = [...new Set(caseTasks.map(t => t.agent))]
          for (let i = 0; i < caseAgents.length; i++) {
            for (let j = i + 1; j < caseAgents.length; j++) {
              const key = [caseAgents[i], caseAgents[j]].sort().join('\x00')
              edgeMap.set(key, (edgeMap.get(key) || 0) + 1)
            }
          }
        }
      } else if (type === 'similar') {
        // Undirected: shared activity types between agents
        const agentActs = new Map()
        for (const t of tasks) {
          if (!agentActs.has(t.agent)) agentActs.set(t.agent, new Map())
          const m = agentActs.get(t.agent)
          m.set(t.taskName, (m.get(t.taskName) || 0) + 1)
        }
        const agentList = [...agentActs.keys()]
        for (let i = 0; i < agentList.length; i++) {
          for (let j = i + 1; j < agentList.length; j++) {
            const a1 = agentActs.get(agentList[i])
            const a2 = agentActs.get(agentList[j])
            let shared = 0
            for (const [act] of a1) {
              if (a2.has(act)) shared += Math.min(a1.get(act), a2.get(act))
            }
            if (shared > 0) {
              const key = [agentList[i], agentList[j]].sort().join('\x00')
              edgeMap.set(key, shared)
            }
          }
        }
      }

      // Build nodes
      const maxTasks = Math.max(...[...nodeStats.values()].map(s => s.tasks), 1)
      const snNodes = agents.map(a => {
        const ns = nodeStats.get(a)
        const util = totalDuration > 0 ? (ns.totalDur / totalDuration) : 0
        return {
          id: a,
          label: a,
          role: agentRoleMap.get(a) || a,
          tasks: ns.tasks,
          cases: ns.cases.size,
          totalDur: ns.totalDur,
          activities: ns.activities.size,
          utilization: util,
          radius: 14 + (ns.tasks / maxTasks) * 22,
          color: agentColorMap.get(a),
          x: 0, y: 0,
        }
      })

      // Build edges
      const maxEdgeW = Math.max(...edgeMap.values(), 1)
      const directed = type === 'handover'
      const snEdges = []
      for (const [key, weight] of edgeMap) {
        const [source, target] = key.split('\x00')
        snEdges.push({
          id: `${source}-${target}`,
          source,
          target,
          weight,
          width: 1 + (weight / maxEdgeW) * 5,
          opacity: 0.3 + (weight / maxEdgeW) * 0.6,
          directed,
        })
      }

      // Sort edges by weight descending (for highlighting)
      snEdges.sort((a, b) => b.weight - a.weight)

      // Layout
      const W = 700, H = 500
      forceLayout(snNodes, snEdges, W, H)

      // Centrality metrics
      const degree = new Map(agents.map(a => [a, 0]))
      const inDeg = new Map(agents.map(a => [a, 0]))
      const outDeg = new Map(agents.map(a => [a, 0]))
      const weightedDeg = new Map(agents.map(a => [a, 0]))
      for (const e of snEdges) {
        degree.set(e.source, degree.get(e.source) + 1)
        degree.set(e.target, degree.get(e.target) + 1)
        if (directed) {
          outDeg.set(e.source, outDeg.get(e.source) + e.weight)
          inDeg.set(e.target, inDeg.get(e.target) + e.weight)
        }
        weightedDeg.set(e.source, weightedDeg.get(e.source) + e.weight)
        weightedDeg.set(e.target, weightedDeg.get(e.target) + e.weight)
      }
      // Attach centrality to nodes
      for (const nd of snNodes) {
        nd.degree = degree.get(nd.id) || 0
        nd.inDeg = inDeg.get(nd.id) || 0
        nd.outDeg = outDeg.get(nd.id) || 0
        nd.weightedDeg = weightedDeg.get(nd.id) || 0
      }
      const maxWeightedDeg = Math.max(...snNodes.map(n => n.weightedDeg), 1)

      return {
        nodes: snNodes,
        edges: snEdges,
        width: W,
        height: H,
        directed,
        maxEdgeW,
        maxWeightedDeg,
        totalEdges: snEdges.length,
        totalWeight: [...edgeMap.values()].reduce((s, v) => s + v, 0),
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. RESOURCE-ACTIVITY MATRIX
    // ═══════════════════════════════════════════════════════════════
    // Cell: { count, totalDur, avgDur, totalWait, avgWait }
    const matrix = { rows: [], cols: [], cells: new Map() }

    // Count per (agent, activity)
    const cellData = new Map()
    for (const t of tasks) {
      const key = `${t.agent}\x00${t.taskName}`
      if (!cellData.has(key)) cellData.set(key, { count: 0, totalDur: 0, totalWait: 0 })
      const c = cellData.get(key)
      c.count++
      c.totalDur += t.duration || 0
      c.totalWait += t.waiting || 0
    }

    // Sort activities by total frequency, agents by total tasks
    const actFreq = new Map()
    for (const t of tasks) actFreq.set(t.taskName, (actFreq.get(t.taskName) || 0) + 1)
    const sortedActivities = [...actFreq.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a)

    const agentTasks = new Map()
    for (const t of tasks) agentTasks.set(t.agent, (agentTasks.get(t.agent) || 0) + 1)
    const sortedAgents = [...agentTasks.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a)

    matrix.cols = sortedActivities
    matrix.rows = sortedAgents

    let maxCellCount = 0, maxCellDur = 0, maxCellWait = 0
    for (const [key, c] of cellData) {
      c.avgDur = c.count > 0 ? c.totalDur / c.count : 0
      c.avgWait = c.count > 0 ? c.totalWait / c.count : 0
      matrix.cells.set(key, c)
      if (c.count > maxCellCount) maxCellCount = c.count
      if (c.avgDur > maxCellDur) maxCellDur = c.avgDur
      if (c.avgWait > maxCellWait) maxCellWait = c.avgWait
    }
    matrix.maxCount = maxCellCount
    matrix.maxDur = maxCellDur
    matrix.maxWait = maxCellWait

    // ═══════════════════════════════════════════════════════════════
    // 3. RESOURCE KPIs
    // ═══════════════════════════════════════════════════════════════
    const kpis = []
    const totalCases = byCase.size

    for (const agent of agents) {
      const agTasks = tasks.filter(t => t.agent === agent)
      const taskCount = agTasks.length
      const caseCount = new Set(agTasks.map(t => t.caseId)).size
      const activityCount = new Set(agTasks.map(t => t.taskName)).size
      const totalServiceTime = agTasks.reduce((s, t) => s + (t.duration || 0), 0)
      const totalWaitTime = agTasks.reduce((s, t) => s + (t.waiting || 0), 0)
      const avgServiceTime = taskCount > 0 ? totalServiceTime / taskCount : 0
      const avgWaitTime = taskCount > 0 ? totalWaitTime / taskCount : 0
      const utilization = totalDuration > 0 ? totalServiceTime / totalDuration : 0

      // Handover counts
      let handoverIn = 0, handoverOut = 0
      for (const [, caseTasks] of byCase) {
        for (let i = 0; i < caseTasks.length - 1; i++) {
          if (caseTasks[i].agent === agent && caseTasks[i + 1].agent !== agent) handoverOut++
          if (caseTasks[i + 1].agent === agent && caseTasks[i].agent !== agent) handoverIn++
        }
      }

      // Case diversity: fraction of total cases this agent touches
      const caseDiversity = totalCases > 0 ? caseCount / totalCases : 0

      // Multitasking: max concurrent tasks at any point (simplified)
      let maxConcurrent = 0
      const sorted = [...agTasks].sort((a, b) => a.start - b.start)
      for (let i = 0; i < sorted.length; i++) {
        let concurrent = 1
        for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
          concurrent++
        }
        if (concurrent > maxConcurrent) maxConcurrent = concurrent
      }

      kpis.push({
        agent,
        role: agentRoleMap.get(agent) || agent,
        color: agentColorMap.get(agent),
        taskCount,
        caseCount,
        activityCount,
        totalServiceTime,
        totalWaitTime,
        avgServiceTime,
        avgWaitTime,
        utilization,
        handoverIn,
        handoverOut,
        caseDiversity,
        maxConcurrent,
        throughput: totalDuration > 0 ? (taskCount / totalDuration) * 3600 : 0, // tasks/hour
      })
    }

    // Sort by taskCount descending
    kpis.sort((a, b) => b.taskCount - a.taskCount)

    // Maxes for bar scaling
    const kpiMax = {
      taskCount: Math.max(...kpis.map(k => k.taskCount), 1),
      utilization: Math.max(...kpis.map(k => k.utilization), 0.01),
      avgServiceTime: Math.max(...kpis.map(k => k.avgServiceTime), 1),
      avgWaitTime: Math.max(...kpis.map(k => k.avgWaitTime), 1),
      throughput: Math.max(...kpis.map(k => k.throughput), 0.01),
      handoverIn: Math.max(...kpis.map(k => k.handoverIn), 1),
      handoverOut: Math.max(...kpis.map(k => k.handoverOut), 1),
      caseCount: Math.max(...kpis.map(k => k.caseCount), 1),
      caseDiversity: 1,
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. WORKLOAD BALANCE
    // ═══════════════════════════════════════════════════════════════
    const taskCounts = kpis.map(k => k.taskCount)
    const giniCoefficient = gini(taskCounts)
    const lorenz = lorenzCurve(taskCounts)

    const durationValues = kpis.map(k => k.totalServiceTime)
    const giniDuration = gini(durationValues)
    const lorenzDuration = lorenzCurve(durationValues)

    // ═══════════════════════════════════════════════════════════════
    // 5. RESOURCE PROFILES
    // ═══════════════════════════════════════════════════════════════
    const profiles = new Map()
    for (const k of kpis) {
      const agTasks = tasks.filter(t => t.agent === k.agent)
      // Activity breakdown
      const actBreakdown = new Map()
      for (const t of agTasks) {
        if (!actBreakdown.has(t.taskName)) actBreakdown.set(t.taskName, { count: 0, totalDur: 0 })
        const ab = actBreakdown.get(t.taskName)
        ab.count++
        ab.totalDur += t.duration || 0
      }
      const actList = [...actBreakdown.entries()]
        .map(([name, d]) => ({ name, count: d.count, avgDur: d.count > 0 ? d.totalDur / d.count : 0, pct: (d.count / k.taskCount) * 100 }))
        .sort((a, b) => b.count - a.count)

      // Collaboration partners (shared cases)
      const partners = new Map()
      for (const t of agTasks) {
        const caseT = byCase.get(t.caseId)
        if (!caseT) continue
        for (const ct of caseT) {
          if (ct.agent === k.agent) continue
          partners.set(ct.agent, (partners.get(ct.agent) || 0) + 1)
        }
      }
      const topPartners = [...partners.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([agent, count]) => ({ agent, count, color: agentColorMap.get(agent) }))

      profiles.set(k.agent, { ...k, actBreakdown: actList, topPartners })
    }

    return {
      buildSocialNetwork,
      matrix,
      kpis,
      kpiMax,
      giniCoefficient,
      lorenz,
      giniDuration,
      lorenzDuration,
      profiles,
      agentColorMap,
      agents,
      activities,
      totalCases,
    }
  })
}

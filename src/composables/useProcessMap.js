import { ref, computed, isRef, watch } from 'vue'

let elkInstance = null
async function getElk() {
  if (!elkInstance) {
    const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
    elkInstance = new ELK()
  }
  return elkInstance
}

const AGENT_COLORS = [
  '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#a855f7',
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#06b6d4',
  '#8b5cf6', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9',
]

// ═══════════════════════════════════════════════════════════════════
// BPMN horizontal swimlane layout — completely separate from ELK
// ═══════════════════════════════════════════════════════════════════
function buildBpmnLayout(raw, useLanes = false) {
  const { nodes, edges, roles, roleColorMap } = raw
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // ═══ Constants ═══
  const GAP = 16, GW_S = 12, EVT_R = 10
  const ACT_H = 34, ACT_MAX_W = 150, ACT_MIN_W = 80
  const CHAR_W = 7, ACT_PAD = 20, LINE_H = 13
  const LABEL_W = useLanes ? 110 : 0
  const LANE_MIN_H = 46, LANE_PAD = 10, SLOT_SPACING = ACT_H + 8
  const FLOW_CENTER_Y = 60
  const BRANCH_SPACING = ACT_H + 12

  function actDims(label) {
    const rawW = label.length * CHAR_W + ACT_PAD
    if (rawW <= ACT_MAX_W) return { w: Math.max(ACT_MIN_W, rawW), h: ACT_H, lines: [label] }
    const maxC = Math.floor((ACT_MAX_W - ACT_PAD) / CHAR_W)
    const words = label.split(/(?<=[-_ ])|(?=[-_ ])/g)
    const lines = []; let cur = ''
    for (const w of words) { if ((cur + w).length > maxC && cur) { lines.push(cur); cur = w.trimStart() } else cur += w }
    if (cur) lines.push(cur); if (!lines.length) lines.push(label)
    return { w: Math.max(ACT_MIN_W, Math.min(Math.max(...lines.map(l => l.length * CHAR_W + ACT_PAD)), ACT_MAX_W)), h: Math.max(ACT_H, 16 + lines.length * LINE_H + 6), lines }
  }

  // ═══ PHASE 1: Detect parallel activity groups (bidirectional edges) ═══
  const fwdEdgeSet = new Set()
  const fwdEdges = new Map()
  for (const e of edges) {
    if (e.isSelfLoop || e.isBackEdge) continue
    fwdEdgeSet.add(`${e.source}|${e.target}`)
    if (!fwdEdges.has(e.source)) fwdEdges.set(e.source, [])
    fwdEdges.get(e.source).push(e)
  }

  // Parallel: a→b AND b→a both exist in forward edges
  const parallelWith = new Map()
  for (const e of edges) {
    if (e.isSelfLoop || e.isBackEdge) continue
    if (fwdEdgeSet.has(`${e.target}|${e.source}`)) {
      if (!parallelWith.has(e.source)) parallelWith.set(e.source, new Set())
      parallelWith.get(e.source).add(e.target)
    }
  }

  // Group into connected components
  const parVisited = new Set()
  const parallelGroups = []
  for (const [act] of parallelWith) {
    if (parVisited.has(act)) continue
    const g = new Set(), stack = [act]
    while (stack.length) {
      const c = stack.pop()
      if (parVisited.has(c)) continue
      parVisited.add(c); g.add(c)
      for (const p of (parallelWith.get(c) || [])) if (!parVisited.has(p)) stack.push(p)
    }
    if (g.size >= 2) parallelGroups.push(g)
  }
  const actToGroup = new Map()
  for (const g of parallelGroups) for (const a of g) actToGroup.set(a, g)

  // Find join point for each parallel group: activity that all group members feed into
  const groupJoin = new Map()
  for (const group of parallelGroups) {
    const targets = new Map()
    for (const e of edges) {
      if (e.isBackEdge || e.isSelfLoop) continue
      if (group.has(e.source) && !group.has(e.target)) targets.set(e.target, (targets.get(e.target) || 0) + 1)
    }
    let best = null, bestC = 0
    for (const [t, c] of targets) if (c > bestC) { best = t; bestC = c }
    groupJoin.set(group, best)
  }

  // ═══ PHASE 2: Build main process sequence (greedy, parallel-aware) ═══
  const startNodes = nodes.filter(n => n.isStart).sort((a, b) => b.freq - a.freq)
  const mainFlowNodeIds = new Set()
  const processedIds = new Set()
  // mainSeq items: { type: 'act', id } or { type: 'and', members: [...], joinId }
  const mainSeq = []

  if (startNodes.length) {
    let cur = startNodes[0].id
    processedIds.add(cur); mainFlowNodeIds.add(cur)
    mainSeq.push({ type: 'act', id: cur })

    while (true) {
      const out = (fwdEdges.get(cur) || []).sort((a, b) => b.freq - a.freq)
      const next = out.find(e => !processedIds.has(e.target))
      if (!next) break

      const group = actToGroup.get(next.target)
      if (group && ![...group].some(m => processedIds.has(m))) {
        // Entering a parallel group — add as AND block
        for (const m of group) { processedIds.add(m); mainFlowNodeIds.add(m) }
        const joinId = groupJoin.get(group)
        mainSeq.push({ type: 'and', members: [...group], joinId })
        if (joinId && !processedIds.has(joinId)) {
          processedIds.add(joinId); mainFlowNodeIds.add(joinId)
          mainSeq.push({ type: 'act', id: joinId })
          cur = joinId
        } else break
      } else if (!processedIds.has(next.target)) {
        cur = next.target
        processedIds.add(cur); mainFlowNodeIds.add(cur)
        mainSeq.push({ type: 'act', id: cur })
      } else break
    }
  }

  // Guard: if no main flow was found, bootstrap from highest-frequency node
  if (mainSeq.length === 0 && nodes.length > 0) {
    const best = [...nodes].sort((a, b) => b.freq - a.freq)[0]
    processedIds.add(best.id); mainFlowNodeIds.add(best.id)
    mainSeq.push({ type: 'act', id: best.id })
  }

  // ═══ PHASE 3: Detect XOR branches from each main-flow activity ═══
  // Follow branch chains (e.g. Return → Applicant completes → loop back)
  const xorBranches = new Map() // sourceId → [{ chain: [id,...], loopTarget, edge }]

  for (const step of mainSeq) {
    if (step.type !== 'act') continue
    const out = (fwdEdges.get(step.id) || [])
    for (const e of out) {
      if (processedIds.has(e.target)) continue
      // Follow the chain of unplaced activities
      const chain = []
      let chainCur = e.target
      while (chainCur && !processedIds.has(chainCur)) {
        chain.push(chainCur)
        processedIds.add(chainCur)
        const chainOut = (fwdEdges.get(chainCur) || []).sort((a, b) => b.freq - a.freq)
        const chainNext = chainOut.find(ce => !processedIds.has(ce.target))
        chainCur = chainNext ? chainNext.target : null
      }
      // Detect all main flow targets the last chain activity connects to
      const loopTargets = []
      const last = chain[chain.length - 1]
      if (last) {
        for (const be of edges) {
          if (be.source === last && !be.isSelfLoop && (be.isBackEdge || processedIds.has(be.target))) {
            if (mainFlowNodeIds.has(be.target) && !loopTargets.includes(be.target)) {
              loopTargets.push(be.target)
            }
          }
        }
      }
      const loopTarget = loopTargets[0] || null
      if (!xorBranches.has(step.id)) xorBranches.set(step.id, [])
      xorBranches.get(step.id).push({ chain, loopTarget, loopTargets, edge: e })
    }
  }

  // ═══ PHASE 3b: Detect skip edges (main flow → non-adjacent main flow) ═══
  // Collect all AND block member IDs for exclusion
  const andMemberIds = new Set()
  for (const step of mainSeq) {
    if (step.type === 'and') step.members.forEach(m => andMemberIds.add(m))
  }

  for (let si = 0; si < mainSeq.length; si++) {
    const step = mainSeq[si]
    if (step.type !== 'act') continue
    const out = (fwdEdges.get(step.id) || [])
    for (const e of out) {
      if (!mainFlowNodeIds.has(e.target) || !processedIds.has(e.target)) continue
      // Determine the immediate next main flow activity/AND block
      const nextStep = mainSeq[si + 1]
      let nextId = null
      if (nextStep?.type === 'act') nextId = nextStep.id
      else if (nextStep?.type === 'and') nextId = nextStep.members[0]
      if (e.target === nextId) continue // Normal main flow continuation
      // Skip if target is a member of ANY AND block (already routed through AND gateway)
      if (andMemberIds.has(e.target)) continue
      // Skip if target is the join activity right after an AND block
      if (nextStep?.type === 'and' && e.target === nextStep.joinId) continue
      // Check it's not already captured as a branch chain target
      const existing = xorBranches.get(step.id) || []
      const alreadyCovered = existing.some(b => b.chain.includes(e.target))
      if (alreadyCovered) continue
      // This is a skip edge — add as virtual branch
      if (!xorBranches.has(step.id)) xorBranches.set(step.id, [])
      xorBranches.get(step.id).push({ chain: [], loopTarget: e.target, loopTargets: [e.target], edge: e, isSkip: true })
    }
  }

  // ═══ PHASE 3c: Rescue unplaced activities ═══
  // Find activities not yet reached by main flow or branches
  const unplacedIds = nodes.filter(n => !processedIds.has(n.id)).map(n => n.id)
  if (unplacedIds.length > 0) {
    // Strategy A: iteratively attach unplaced activities via any edge (including back-edges)
    let madeProgress = true
    while (madeProgress && unplacedIds.length > 0) {
      madeProgress = false
      for (let i = unplacedIds.length - 1; i >= 0; i--) {
        const uid = unplacedIds[i]
        // Find best placed activity that connects to this unplaced one (any edge type)
        let bestSource = null, bestFreq = 0
        for (const e of edges) {
          if (e.isSelfLoop) continue
          if (e.target === uid && processedIds.has(e.source)) {
            if (e.freq > bestFreq) { bestSource = e.source; bestFreq = e.freq }
          }
        }
        // Also check reverse: unplaced → placed
        if (!bestSource) {
          for (const e of edges) {
            if (e.isSelfLoop) continue
            if (e.source === uid && processedIds.has(e.target)) {
              if (e.freq > bestFreq) { bestSource = e.target; bestFreq = e.freq }
            }
          }
        }
        if (bestSource) {
          // Follow chain of unplaced activities (like PHASE 3)
          const chain = []
          let chainCur = uid
          while (chainCur && !processedIds.has(chainCur)) {
            chain.push(chainCur)
            processedIds.add(chainCur)
            const chainFwd = (fwdEdges.get(chainCur) || []).sort((a, b) => b.freq - a.freq)
            let chainNext = chainFwd.find(ce => !processedIds.has(ce.target))
            if (!chainNext) {
              const allOut = edges.filter(e => e.source === chainCur && !e.isSelfLoop && !processedIds.has(e.target))
                .sort((a, b) => b.freq - a.freq)
              chainNext = allOut[0] || null
            }
            chainCur = chainNext ? chainNext.target : null
          }
          // Detect loop targets
          const loopTargets = []
          const last = chain[chain.length - 1]
          if (last) {
            for (const be of edges) {
              if (be.source === last && !be.isSelfLoop && processedIds.has(be.target)) {
                if (mainFlowNodeIds.has(be.target) && !loopTargets.includes(be.target)) loopTargets.push(be.target)
              }
            }
          }
          if (!xorBranches.has(bestSource)) xorBranches.set(bestSource, [])
          xorBranches.get(bestSource).push({ chain, loopTarget: loopTargets[0] || null, loopTargets, edge: { source: bestSource, target: uid, freq: bestFreq } })
          for (const cid of chain) { const idx = unplacedIds.indexOf(cid); if (idx >= 0) unplacedIds.splice(idx, 1) }
          madeProgress = true
        }
      }
    }
    // Strategy B: attach remaining disconnected activities to last main flow activity
    if (unplacedIds.length > 0) {
      let anchorId = null
      for (let i = mainSeq.length - 1; i >= 0; i--) { if (mainSeq[i].type === 'act') { anchorId = mainSeq[i].id; break } }
      if (!anchorId && mainSeq.length > 0 && mainSeq[0].type === 'act') anchorId = mainSeq[0].id
      if (anchorId) {
        for (const uid of unplacedIds) {
          processedIds.add(uid)
          if (!xorBranches.has(anchorId)) xorBranches.set(anchorId, [])
          xorBranches.get(anchorId).push({ chain: [uid], loopTarget: null, loopTargets: [], edge: { source: anchorId, target: uid, freq: 0 } })
        }
        unplacedIds.length = 0
      }
    }
  }

  // ═══ PHASE 4: Lanes ═══
  // Collect all activities that will be placed
  const allActIds = new Set()
  for (const step of mainSeq) {
    if (step.type === 'act') allActIds.add(step.id)
    else if (step.type === 'and') step.members.forEach(m => allActIds.add(m))
  }
  for (const [, branches] of xorBranches) for (const b of branches) b.chain.forEach(id => allActIds.add(id))

  // Order lanes to minimize cross-lane distance:
  // 1. Main flow roles first (in sequence order), then branch roles
  const mainFlowRoles = [], branchRoles = [], seenRoles = new Set()
  for (const step of mainSeq) {
    const ids = step.type === 'act' ? [step.id] : step.type === 'and' ? step.members : []
    for (const id of ids) {
      const n = nodeMap.get(id)
      if (n && !seenRoles.has(n.role)) { mainFlowRoles.push(n.role); seenRoles.add(n.role) }
    }
  }
  for (const [, branches] of xorBranches) {
    for (const b of branches) {
      for (const id of b.chain) {
        const n = nodeMap.get(id)
        if (n && !seenRoles.has(n.role)) { branchRoles.push(n.role); seenRoles.add(n.role) }
      }
    }
  }
  for (const n of nodes) { if (!seenRoles.has(n.role)) { branchRoles.push(n.role); seenRoles.add(n.role) } }

  // Place branch roles adjacent to their most-connected main flow role
  const roleOrder = [...mainFlowRoles]
  for (const br of branchRoles) {
    // Find the main flow role this branch role connects to most
    let bestIdx = roleOrder.length // default: append at end
    let bestScore = -1
    for (let i = 0; i < roleOrder.length; i++) {
      const mfRole = roleOrder[i]
      // Count edges between this branch role and main flow role
      let score = 0
      for (const e of edges) {
        const sNode = nodeMap.get(e.source), tNode = nodeMap.get(e.target)
        if (!sNode || !tNode) continue
        if ((sNode.role === br && tNode.role === mfRole) || (sNode.role === mfRole && tNode.role === br)) score += e.freq
      }
      if (score > bestScore) { bestScore = score; bestIdx = i + 1 }
    }
    roleOrder.splice(bestIdx, 0, br)
  }

  const laneMaxSlots = new Map()
  const lanes = roleOrder.map((role, i) => {
    const rd = roles.find(r => r.role === role)
    laneMaxSlots.set(i, 1)
    return { role, y: 0, h: LANE_MIN_H, cy: 0, agentCount: rd ? rd.count : 0, color: roleColorMap.get(role) || '#888', idx: i }
  })
  function recalcLanes() {
    let y = 0
    for (const l of lanes) {
      const slots = laneMaxSlots.get(l.idx) || 1
      l.h = Math.max(LANE_MIN_H, slots * SLOT_SPACING + LANE_PAD)
      l.y = y; l.cy = y + l.h / 2; y += l.h
    }
  }
  recalcLanes()
  const laneByRole = new Map(lanes.map(l => [l.role, l]))

  function getCy(actId) {
    if (!useLanes) return FLOW_CENTER_Y
    const n = nodeMap.get(actId)
    return n ? (laneByRole.get(n.role)?.cy || FLOW_CENTER_Y) : FLOW_CENTER_Y
  }

  // ═══ PHASE 5: Place elements left-to-right ═══
  const els = [], conns = [], elMap = new Map()
  function addEl(el) { els.push(el); elMap.set(el.id, el); return el }

  let x = LABEL_W + GAP * 2
  const mainCy = useLanes ? (lanes[0]?.cy || FLOW_CENTER_Y) : FLOW_CENTER_Y

  addEl({ id: '__start__', type: 'start', cx: x + EVT_R, cy: getCy(mainSeq[0]?.id || ''), r: EVT_R, laneIdx: 0 })
  x += EVT_R * 2 + GAP

  let prevId = '__start__'

  for (let si = 0; si < mainSeq.length; si++) {
    const step = mainSeq[si]

    if (step.type === 'act') {
      const node = nodeMap.get(step.id); if (!node) continue
      const lane = laneByRole.get(node.role) || lanes[0]
      const nodeCy = getCy(step.id)
      const dims = actDims(node.label)

      // Check if this activity has XOR branches
      const branches = xorBranches.get(step.id) || []

      // Place the activity
      addEl({ id: step.id, type: 'activity', x, cy: nodeCy, w: dims.w, h: dims.h, label: node.label, lines: dims.lines, laneIdx: lane.idx, node })
      conns.push({ id: `${prevId}→${step.id}`, from: prevId, to: step.id, mainFlow: true })
      x += dims.w + GAP
      prevId = step.id

      if (branches.length > 0) {
        // XOR split gateway
        const splitId = `xor-s-${step.id}`
        addEl({ id: splitId, type: 'gateway', gwType: 'xor', cx: x + GW_S, cy: nodeCy, s: GW_S, laneIdx: lane.idx })
        conns.push({ id: `${step.id}→${splitId}`, from: step.id, to: splitId, mainFlow: true })
        x += GW_S * 2 + GAP

        // Place each branch chain below the main flow (using separate x tracking)
        const branchStartX = x  // branches start at same x as where main flow would continue
        let branchMaxX = x
        let branchSlot = 1
        for (const br of branches) {
          // Skip edges: direct connection from XOR gateway to main flow target
          if (br.isSkip && br.loopTarget) {
            conns.push({ id: `${splitId}→skip-${br.loopTarget}`, from: splitId, to: br.loopTarget, mainFlow: false, branchReturn: true, exitBottom: true })
            continue
          }
          let bx = branchStartX
          let bPrevId = splitId
          for (const chainActId of br.chain) {
            const cn = nodeMap.get(chainActId); if (!cn) continue
            const cLane = laneByRole.get(cn.role) || lanes[0]
            let bCy
            let actualSlot = 0
            if (useLanes) {
              bCy = cLane.cy
              // Check if this lane has main flow activities — if so, offset branch down
              const laneHasMainFlow = [...mainFlowNodeIds].some(mfId => {
                const mfNode = nodeMap.get(mfId)
                return mfNode && (laneByRole.get(mfNode.role) || lanes[0]) === cLane
              })
              if (Math.abs(bCy - nodeCy) < 3 || laneHasMainFlow) {
                actualSlot = branchSlot
                bCy = cLane.cy + BRANCH_SPACING * branchSlot
                // Expand lane to fit
                const neededH = (bCy - cLane.y) + ACT_H / 2 + LANE_PAD
                if (neededH > cLane.h) {
                  laneMaxSlots.set(cLane.idx, Math.max(laneMaxSlots.get(cLane.idx) || 1, branchSlot + 1))
                  recalcLanes()
                  bCy = cLane.cy + BRANCH_SPACING * branchSlot
                }
              }
              // else: different lane with no main flow, stays at lane center
            } else {
              actualSlot = branchSlot
              bCy = FLOW_CENTER_Y + branchSlot * BRANCH_SPACING
            }
            const cd = actDims(cn.label)
            addEl({ id: chainActId, type: 'activity', x: bx, cy: bCy, w: cd.w, h: cd.h, label: cn.label, lines: cd.lines, laneIdx: cLane.idx, node: cn, isBranch: true, branchSlot: actualSlot })
            conns.push({ id: `${bPrevId}→${chainActId}`, from: bPrevId, to: chainActId, mainFlow: false })
            bPrevId = chainActId
            bx += cd.w + GAP
          }
          // Branch ending: connect back to main flow targets, and/or end event
          const lastChainId = br.chain[br.chain.length - 1]
          if (lastChainId) {
            const targets = br.loopTargets || (br.loopTarget ? [br.loopTarget] : [])
            const lastNode = nodeMap.get(lastChainId)
            const outFreq = lastNode ? edges.filter(e => e.source === lastChainId && !e.isSelfLoop).reduce((s, e) => s + e.freq, 0) : 0
            const hasEnd = lastNode && outFreq < lastNode.freq
            const totalOutputs = targets.length + (hasEnd ? 1 : 0)

            if (totalOutputs === 0 || (totalOutputs === 1 && hasEnd && targets.length === 0)) {
              // Dead end or only end event — just end event, no XOR needed
              const lastEl = elMap.get(lastChainId)
              const endId = `__end_br_${lastChainId}__`
              const endCy = lastEl ? lastEl.cy : FLOW_CENTER_Y + branchSlot * BRANCH_SPACING
              addEl({ id: endId, type: 'end', cx: bx + EVT_R, cy: endCy, r: EVT_R, laneIdx: lastEl ? lastEl.laneIdx : 0 })
              conns.push({ id: `${lastChainId}→${endId}`, from: lastChainId, to: endId, mainFlow: false })
              bx += EVT_R * 2 + GAP
            } else if (totalOutputs === 1 && targets.length === 1) {
              // Single target, no end — direct connection
              conns.push({ id: `${lastChainId}→${targets[0]}`, from: lastChainId, to: targets[0], mainFlow: false, branchReturn: true })
            } else {
              // Multiple outputs — XOR gateway to split between targets and/or end
              const lastEl = elMap.get(lastChainId)
              const brCy = lastEl ? lastEl.cy : FLOW_CENTER_Y + branchSlot * BRANCH_SPACING
              const brLaneIdx = lastEl ? lastEl.laneIdx : 0
              const gwId = `xor-br-${lastChainId}`
              addEl({ id: gwId, type: 'gateway', gwType: 'xor', cx: bx + GW_S, cy: brCy, s: GW_S, laneIdx: brLaneIdx, isBranchGw: true })
              conns.push({ id: `${lastChainId}→${gwId}`, from: lastChainId, to: gwId, mainFlow: false })
              bx += GW_S * 2 + GAP
              // End event (if some cases end here)
              if (hasEnd) {
                const endId = `__end_br_${lastChainId}__`
                addEl({ id: endId, type: 'end', cx: bx + EVT_R, cy: brCy, r: EVT_R, laneIdx: brLaneIdx })
                conns.push({ id: `${gwId}→${endId}`, from: gwId, to: endId, mainFlow: false })
                bx += EVT_R * 2 + GAP
              }
              // Connections to all main flow targets (enter from bottom)
              for (const tgt of targets) {
                conns.push({ id: `${gwId}→${tgt}`, from: gwId, to: tgt, mainFlow: false, branchReturn: true, exitBottom: true })
              }
            }
          }
          branchMaxX = Math.max(branchMaxX, bx)
          branchSlot++
        }

        // Main flow x advances past branches only if branches are wider
        x = Math.max(x, branchMaxX)
        // Main path continues from XOR split
        prevId = splitId
      }

    } else if (step.type === 'and') {
      // AND split gateway
      const refNode = nodeMap.get(step.members[0])
      const refLane = refNode ? (laneByRole.get(refNode.role) || lanes[0]) : lanes[0]
      const gwCy = useLanes ? refLane.cy : FLOW_CENTER_Y

      const splitId = `and-s-${si}`
      addEl({ id: splitId, type: 'gateway', gwType: 'and', cx: x + GW_S, cy: gwCy, s: GW_S, laneIdx: refLane.idx })
      conns.push({ id: `${prevId}→${splitId}`, from: prevId, to: splitId, mainFlow: true })
      x += GW_S * 2 + GAP

      // Assign cy for parallel members
      const members = step.members
      if (useLanes) {
        // Each in its own lane
        const gwLaneSlots = new Map()
        for (const m of members) {
          const mNode = nodeMap.get(m); if (!mNode) continue
          const mLane = laneByRole.get(mNode.role) || lanes[0]
          const slot = gwLaneSlots.get(mLane.idx) || 0
          gwLaneSlots.set(mLane.idx, slot + 1)
        }
        for (const [li, cnt] of gwLaneSlots) laneMaxSlots.set(li, Math.max(laneMaxSlots.get(li) || 1, cnt))
        recalcLanes()
      }

      const memberCys = []
      if (useLanes) {
        const gwLaneSlots2 = new Map()
        for (const m of members) {
          const mNode = nodeMap.get(m); if (!mNode) continue
          const mLane = laneByRole.get(mNode.role) || lanes[0]
          const slot = gwLaneSlots2.get(mLane.idx) || 0
          gwLaneSlots2.set(mLane.idx, slot + 1)
          const total = laneMaxSlots.get(mLane.idx) || 1
          let cy
          if (total <= 1) cy = mLane.cy
          else {
            const blockH = (total - 1) * SLOT_SPACING
            cy = mLane.cy - blockH / 2 + slot * SLOT_SPACING
          }
          memberCys.push({ m, cy, lane: mLane })
        }
      } else {
        const n = members.length
        const blockH = (n - 1) * BRANCH_SPACING
        const topY = FLOW_CENTER_Y - blockH / 2
        members.forEach((m, idx) => {
          const mNode = nodeMap.get(m)
          const mLane = mNode ? (laneByRole.get(mNode.role) || lanes[0]) : lanes[0]
          memberCys.push({ m, cy: topY + idx * BRANCH_SPACING, lane: mLane })
        })
      }

      // Place all parallel activities
      const parX = x
      let maxRight = x
      for (const mc of memberCys) {
        const mn = nodeMap.get(mc.m); if (!mn) continue
        const md = actDims(mn.label)
        addEl({ id: mc.m, type: 'activity', x: parX, cy: mc.cy, w: md.w, h: md.h, label: mn.label, lines: md.lines, laneIdx: mc.lane.idx, node: mn })
        conns.push({ id: `${splitId}→${mc.m}`, from: splitId, to: mc.m, mainFlow: true })
        maxRight = Math.max(maxRight, parX + md.w)
      }
      x = maxRight + GAP

      // AND join gateway
      const joinId = `and-j-${si}`
      addEl({ id: joinId, type: 'gateway', gwType: 'and', cx: x + GW_S, cy: gwCy, s: GW_S, laneIdx: refLane.idx })
      for (const mc of memberCys) conns.push({ id: `${mc.m}→${joinId}`, from: mc.m, to: joinId, mainFlow: true })
      x += GW_S * 2 + GAP
      prevId = joinId
    }
  }

  // End event
  const lastStep = mainSeq[mainSeq.length - 1]
  const lastId = lastStep?.type === 'act' ? lastStep.id : (lastStep?.joinId || '')
  const endCy = getCy(lastId)
  addEl({ id: '__end__', type: 'end', cx: x + EVT_R, cy: endCy, r: EVT_R, laneIdx: 0 })
  conns.push({ id: `${prevId}→__end__`, from: prevId, to: '__end__', mainFlow: true })
  x += EVT_R * 2 + GAP

  // ═══ PHASE 6: Final reposition (lanes mode) ═══
  if (useLanes) {
    // Calculate needed lane height from actual branch positions
    // Lane must fit: main flow at center + branch at center + offset + halfH
    // Required: lane.h >= 2 * (BRANCH_SPACING * maxSlot + maxHalfH) + padding
    const laneNeededH = new Map()
    for (const el of els) {
      if (el.type === 'activity' && el.isBranch && el.branchSlot) {
        const halfH = (el.h || ACT_H) / 2
        const needed = 2 * (BRANCH_SPACING * el.branchSlot + halfH) + LANE_PAD
        const cur = laneNeededH.get(el.laneIdx) || LANE_MIN_H
        laneNeededH.set(el.laneIdx, Math.max(cur, needed))
      }
    }

    // Apply direct height requirements
    for (const [laneIdx, needed] of laneNeededH) {
      const slotsNeeded = Math.ceil((needed - LANE_PAD) / SLOT_SPACING)
      laneMaxSlots.set(laneIdx, Math.max(laneMaxSlots.get(laneIdx) || 1, slotsNeeded))
    }
    recalcLanes()

    // Verify lanes are actually tall enough, override if needed
    for (const [laneIdx, needed] of laneNeededH) {
      if (lanes[laneIdx] && lanes[laneIdx].h < needed) {
        lanes[laneIdx].h = needed
      }
    }
    // Recalc y positions with correct heights
    let yy = 0
    for (const l of lanes) {
      l.y = yy; l.cy = yy + l.h / 2; yy += l.h
    }

    // Reposition all elements to current lane positions
    for (const el of els) {
      if (el.laneIdx < 0 || el.laneIdx >= lanes.length) continue
      const lane = lanes[el.laneIdx]
      if (el.type === 'activity' && el.isBranch && el.branchSlot) {
        // Branch: offset from lane center — lane is guaranteed tall enough
        el.cy = lane.cy + BRANCH_SPACING * el.branchSlot
      } else if (el.isBranchGw) {
        // Branch gateway: match cy of the branch activity it follows
        // (will be corrected by end event pass below)
        const predConn = conns.find(c => c.to === el.id)
        const predEl = predConn ? elMap.get(predConn.from) : null
        if (predEl) el.cy = predEl.cy
      } else if (el.type === 'activity') {
        el.cy = lane.cy
      } else {
        el.cy = lane.cy
      }
    }

    // End events: match cy of their predecessor (the element that connects to them)
    for (const conn of conns) {
      const tEl = elMap.get(conn.to)
      if (!tEl || (tEl.type !== 'end')) continue
      const fEl = elMap.get(conn.from)
      if (fEl) tEl.cy = fEl.cy
    }

    // Compact lanes that have no activities — reduce to minimal pass-through height
    const LANE_EMPTY_H = 24
    const lanesWithEls = new Set()
    for (const el of els) {
      if (el.type === 'activity') lanesWithEls.add(el.laneIdx)
    }
    let needsReposition = false
    for (const l of lanes) {
      if (!lanesWithEls.has(l.idx) && l.h > LANE_EMPTY_H) {
        l.h = LANE_EMPTY_H
        needsReposition = true
      }
    }
    if (needsReposition) {
      let yy2 = 0
      for (const l of lanes) { l.y = yy2; l.cy = yy2 + l.h / 2; yy2 += l.h }
      // Reposition all elements again
      for (const el of els) {
        if (el.laneIdx < 0 || el.laneIdx >= lanes.length) continue
        const lane = lanes[el.laneIdx]
        if (el.type === 'activity' && el.isBranch && el.branchSlot) {
          el.cy = lane.cy + BRANCH_SPACING * el.branchSlot
        } else if (el.isBranchGw) {
          const predConn = conns.find(c => c.to === el.id)
          const predEl = predConn ? elMap.get(predConn.from) : null
          if (predEl) el.cy = predEl.cy
        } else {
          el.cy = lane.cy
        }
      }
      for (const conn of conns) {
        const tEl = elMap.get(conn.to)
        if (!tEl || (tEl.type !== 'end')) continue
        const fEl = elMap.get(conn.from)
        if (fEl) tEl.cy = fEl.cy
      }
    }
  }

  // ═══ PHASE 7: Calculate total height ═══
  let totalH
  if (useLanes) {
    totalH = lanes.reduce((s, l) => s + l.h, 0)
  } else {
    let minY = Infinity, maxY = -Infinity
    for (const el of els) {
      const top = el.cy - (el.h ? el.h / 2 : el.r || GW_S)
      const bot = el.cy + (el.h ? el.h / 2 : el.r || GW_S)
      minY = Math.min(minY, top); maxY = Math.max(maxY, bot)
    }
    const pad = 30
    const shiftY = pad - minY
    for (const el of els) el.cy += shiftY
    totalH = maxY - minY + pad * 2
  }

  // ═══ PHASE 8: Generate SVG paths ═══
  // Collect activity bounding boxes for collision avoidance
  const actBoxes = els.filter(e => e.type === 'activity').map(e => ({
    id: e.id, x: e.x, y: e.cy - (e.h || ACT_H) / 2, w: e.w, h: e.h || ACT_H,
    right: e.x + e.w, bottom: e.cy + (e.h || ACT_H) / 2, cx: e.x + e.w / 2, cy: e.cy
  }))

  // Check if a vertical segment at x from y1 to y2 overlaps any activity box
  function vertSegHitsAct(segX, y1, y2, skipIds) {
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
    const pad = 6
    for (const b of actBoxes) {
      if (skipIds && skipIds.has(b.id)) continue
      if (segX > b.x - pad && segX < b.right + pad && maxY > b.y - pad && minY < b.bottom + pad) return b
    }
    return null
  }

  // Check if a horizontal segment at y from x1 to x2 overlaps any activity box
  function horizSegHitsAct(segY, x1, x2, skipIds) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
    const pad = 6
    for (const b of actBoxes) {
      if (skipIds && skipIds.has(b.id)) continue
      if (segY > b.y - pad && segY < b.bottom + pad && maxX > b.x - pad && minX < b.right + pad) return b
    }
    return null
  }

  // Find an x position that avoids all activity boxes for a vertical segment
  // Tries both directions and returns the nearest clear position
  function findClearX(startX, y1, y2, skipIds) {
    if (!vertSegHitsAct(startX, y1, y2, skipIds)) return startX
    let leftX = startX - GAP, rightX = startX + GAP
    for (let i = 0; i < 30; i++) {
      if (leftX > LABEL_W && !vertSegHitsAct(leftX, y1, y2, skipIds)) return leftX
      if (!vertSegHitsAct(rightX, y1, y2, skipIds)) return rightX
      leftX -= GAP
      rightX += GAP
    }
    return startX
  }

  // Build path from fx,fy to tx,ty avoiding activity boxes
  function buildAvoidPath(fx, fy, tx, ty, skipIds) {
    // If horizontal (same y), check for collisions
    if (Math.abs(fy - ty) < 3) {
      const hit = horizSegHitsAct(fy, fx, tx, skipIds)
      if (!hit) return `M ${fx} ${fy} L ${tx} ${ty}`
      // Route around: go above or below the hit box
      const aboveDist = Math.abs(fy - (hit.y - 8))
      const belowDist = Math.abs(fy - (hit.bottom + 8))
      const detourY = aboveDist < belowDist ? hit.y - 8 : hit.bottom + 8
      const mx1 = hit.x - 8
      const mx2 = hit.right + 8
      return `M ${fx} ${fy} L ${mx1} ${fy} L ${mx1} ${detourY} L ${mx2} ${detourY} L ${mx2} ${ty} L ${tx} ${ty}`
    }
    // Cross-lane: find clear x for vertical segment
    const mx = findClearX(fx + GAP / 2, fy, ty, skipIds)
    return `M ${fx} ${fy} L ${mx} ${fy} L ${mx} ${ty} L ${tx} ${ty}`
  }

  // Global counter for edges that route below elements — prevents overlapping horizontal segments
  let belowRouteIdx = 0
  const ROUTE_SPACING = 10

  // Compute the base routeY (below all activity boxes) once for the whole diagram
  let baseRouteY = 0
  for (const b of actBoxes) baseRouteY = Math.max(baseRouteY, b.bottom)
  baseRouteY += GAP

  for (const conn of conns) {
    const f = elMap.get(conn.from), t = elMap.get(conn.to)
    if (!f || !t) continue
    const fcy = f.cy, tcy = t.cy
    const isSplit = conn.from.startsWith('gw-s-') || conn.from.startsWith('and-s-') || conn.from.startsWith('xor-s-')
    const isJoin = conn.to.startsWith('gw-j-') || conn.to.startsWith('and-j-') || conn.to.startsWith('xor-j-')
    const skipIds = new Set([conn.from, conn.to])

    if (conn.isLoop) {
      // Loop-back: exit BOTTOM of source, route below all elements, enter BOTTOM of target
      const exitX = f.type === 'activity' ? f.x + f.w / 2 : f.cx
      const exitY = f.cy + (f.h || ACT_H) / 2
      const targetCx = t.type === 'activity' ? t.x + t.w / 2 : t.cx
      const targetBottom = t.cy + ((t.h || ACT_H) / 2)

      const loopY = baseRouteY + belowRouteIdx * ROUTE_SPACING
      belowRouteIdx++

      const clearTx = findClearX(targetCx, loopY, targetBottom, skipIds)
      conn.path = `M ${exitX} ${exitY} L ${exitX} ${loopY} L ${clearTx} ${loopY} L ${clearTx} ${targetBottom}`
    } else if (conn.branchReturn) {
      // Branch return: use direct routing when possible
      const fx = f.type === 'activity' ? f.x + f.w : f.cx + (f.s || f.r || 0)
      const tx = t.type === 'activity' ? t.x : t.cx - (t.s || t.r || 0)
      const targetIsAhead = tx > fx

      if (conn.exitBottom && f.type === 'gateway') {
        // Exit BOTTOM of gateway, route to BOTTOM of target
        const targetCx = t.type === 'activity' ? t.x + t.w / 2 : t.cx
        const targetBottom = t.cy + ((t.h || ACT_H) / 2)
        const exitY = f.cy + f.s
        let routeY = exitY + GAP
        for (const b of actBoxes) {
          if (skipIds.has(b.id)) continue
          const minX = Math.min(f.cx, targetCx) - GAP
          const maxX = Math.max(f.cx, targetCx) + GAP
          if (b.right > minX && b.x < maxX && b.bottom > routeY - 4) {
            routeY = Math.max(routeY, b.bottom + GAP)
          }
        }
        if (!targetIsAhead) {
          // Loop-back: use global baseRouteY to avoid overlapping
          routeY = Math.max(routeY, baseRouteY + belowRouteIdx * ROUTE_SPACING)
        }
        belowRouteIdx++
        const clearX = findClearX(targetCx, routeY, targetBottom, skipIds)
        conn.path = `M ${f.cx} ${exitY} L ${f.cx} ${routeY} L ${clearX} ${routeY} L ${clearX} ${targetBottom}`
      } else if (targetIsAhead) {
        // Target is to the RIGHT: route to BOTTOM of target
        const targetCx = t.type === 'activity' ? t.x + t.w / 2 : t.cx
        const targetBottom = t.cy + ((t.h || ACT_H) / 2)
        const clearX = findClearX(targetCx, fcy, targetBottom, skipIds)
        conn.path = `M ${fx} ${fcy} L ${clearX} ${fcy} L ${clearX} ${targetBottom}`
      } else {
        // Loop-back: target is to the LEFT — exit BOTTOM CENTER, route below
        const exitX = f.type === 'activity' ? f.x + f.w / 2 : f.cx
        const exitY = f.cy + (f.h || ACT_H) / 2
        const targetCx = t.type === 'activity' ? t.x + t.w / 2 : t.cx
        const targetBottom = t.cy + ((t.h || ACT_H) / 2)
        const routeY = baseRouteY + belowRouteIdx * ROUTE_SPACING
        belowRouteIdx++
        const clearX = findClearX(targetCx, routeY, targetBottom, skipIds)
        conn.path = `M ${exitX} ${exitY} L ${exitX} ${routeY} L ${clearX} ${routeY} L ${clearX} ${targetBottom}`
      }
    } else {
      // Generic path: compute exit and entry points based on element types
      const fx = f.type === 'activity' ? f.x + f.w : f.cx + (f.s || f.r || 0)
      const tx = t.type === 'activity' ? t.x : t.cx - (t.s || t.r || 0)

      if (isSplit && !isJoin && Math.abs(fcy - tcy) > 2) {
        // Gateway split → target in different lane
        // Exit from TOP or BOTTOM of diamond, go vertical first
        {
          const exitY = tcy < fcy ? fcy - f.s : fcy + f.s
          const vertClear = !vertSegHitsAct(f.cx, exitY, tcy, skipIds)
          const vertX = vertClear ? f.cx : findClearX(f.cx, exitY, tcy, skipIds)
          const horizHit = horizSegHitsAct(tcy, vertX, tx, skipIds)
          if (!horizHit) {
            if (vertClear) {
              conn.path = `M ${f.cx} ${exitY} L ${f.cx} ${tcy} L ${tx} ${tcy}`
            } else {
              conn.path = `M ${f.cx} ${exitY} L ${vertX} ${exitY} L ${vertX} ${tcy} L ${tx} ${tcy}`
            }
          } else {
            conn.path = buildAvoidPath(vertX, tcy, tx, tcy, skipIds)
            const restPath = conn.path.substring(conn.path.indexOf('L'))
            if (vertClear) {
              conn.path = `M ${f.cx} ${exitY} L ${f.cx} ${tcy} ${restPath}`
            } else {
              conn.path = `M ${f.cx} ${exitY} L ${vertX} ${exitY} L ${vertX} ${tcy} ${restPath}`
            }
          }
        }
      } else if (isJoin && !isSplit && Math.abs(fcy - tcy) > 2) {
        // Source → gateway join in different lane
        // Go horizontal from source, then vertical into TOP/BOTTOM of diamond
        const entryY = fcy < tcy ? tcy - t.s : tcy + t.s
        if (!vertSegHitsAct(t.cx, fcy, entryY, skipIds)) {
          conn.path = `M ${fx} ${fcy} L ${t.cx} ${fcy} L ${t.cx} ${entryY}`
        } else {
          const clearX = findClearX(t.cx, fcy, entryY, skipIds)
          conn.path = `M ${fx} ${fcy} L ${clearX} ${fcy} L ${clearX} ${entryY} L ${t.cx} ${entryY}`
        }
      } else {
        // Same lane or cross-lane: use obstacle avoidance
        conn.path = buildAvoidPath(fx, fcy, tx, tcy, skipIds)
      }
    }
  }

  // Adjust total height based on actual path extents (not theoretical baseRouteY)
  let maxPathY = 0
  for (const conn of conns) {
    if (!conn.path) continue
    const nums = conn.path.match(/[\d.]+/g)
    if (!nums) continue
    for (let i = 1; i < nums.length; i += 2) {
      maxPathY = Math.max(maxPathY, parseFloat(nums[i]))
    }
  }
  if (maxPathY > 0) {
    const routeBottom = maxPathY + GAP
    if (useLanes) {
      const lastLane = lanes[lanes.length - 1]
      if (lastLane && routeBottom > lastLane.y + lastLane.h) {
        lastLane.h = routeBottom - lastLane.y
      }
      totalH = lanes.reduce((s, l) => s + l.h, 0)
    } else {
      totalH = Math.max(totalH, routeBottom)
    }
  }

  // ═══ PHASE 9: Add line jumps at crossing points ═══
  const JUMP_R = 5 // radius of the jump arc
  // Parse each path into line segments
  function parseSegments(d) {
    const segs = []
    const parts = d.trim().split(/\s*[ML]\s*/).filter(Boolean)
    const pts = parts.map(p => { const [x, y] = p.trim().split(/[\s,]+/).map(Number); return { x, y } })
    for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1] })
    return segs
  }

  // Check if two line segments intersect and return the intersection point
  function segIntersect(p1, p2, p3, p4) {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y
    const d2x = p4.x - p3.x, d2y = p4.y - p3.y
    const cross = d1x * d2y - d1y * d2x
    if (Math.abs(cross) < 0.01) return null // parallel
    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / cross
    const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / cross
    if (t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98) {
      return { x: p1.x + t * d1x, y: p1.y + t * d1y, t }
    }
    return null
  }

  // Rebuild a path with jump arcs at crossing points
  function insertJumps(d, crossings) {
    if (!crossings.length) return d
    const parts = d.trim().split(/\s*[ML]\s*/).filter(Boolean)
    const pts = parts.map(p => { const [x, y] = p.trim().split(/[\s,]+/).map(Number); return { x, y } })
    let result = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      // Find crossings on this segment, sorted by t
      const segCrossings = crossings
        .filter(c => c.segIdx === i)
        .sort((x, y) => x.t - y.t)
      if (!segCrossings.length) {
        result += ` L ${b.x} ${b.y}`
      } else {
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len < 1) { result += ` L ${b.x} ${b.y}`; continue }
        const ux = dx / len, uy = dy / len // unit vector along segment
        // Normal perpendicular (for arc direction)
        const nx = -uy, ny = ux
        let prev = a
        for (const c of segCrossings) {
          // Point just before the crossing
          const bx = c.x - ux * JUMP_R, by = c.y - uy * JUMP_R
          // Point just after the crossing
          const ax = c.x + ux * JUMP_R, ay = c.y + uy * JUMP_R
          result += ` L ${bx} ${by}`
          // Small arc jump over the crossing
          result += ` A ${JUMP_R} ${JUMP_R} 0 0 1 ${ax} ${ay}`
          prev = { x: ax, y: ay }
        }
        result += ` L ${b.x} ${b.y}`
      }
    }
    return result
  }

  // Collect all segments from all connections
  const allConnSegs = conns.map(c => c.path ? parseSegments(c.path) : [])

  // For each crossing, only ONE line gets the jump arc (the non-mainFlow one, or higher index)
  // First collect all crossing pairs
  const crossingPairs = []
  for (let ci = 0; ci < conns.length; ci++) {
    const segsA = allConnSegs[ci]
    if (!segsA.length) continue
    for (let si = 0; si < segsA.length; si++) {
      const segA = segsA[si]
      for (let cj = ci + 1; cj < conns.length; cj++) {
        const segsB = allConnSegs[cj]
        for (let sj = 0; sj < segsB.length; sj++) {
          const hit = segIntersect(segA.a, segA.b, segsB[sj].a, segsB[sj].b)
          if (hit) {
            // The line that jumps: prefer non-mainFlow to jump over mainFlow
            const hitOnB = { x: hit.x, y: hit.y }
            const tOnA = hit.t
            // Compute t for the other segment
            const segB = segsB[sj]
            const dxB = segB.b.x - segB.a.x, dyB = segB.b.y - segB.a.y
            const lenB = Math.sqrt(dxB * dxB + dyB * dyB)
            const tOnB = lenB > 0 ? ((hitOnB.x - segB.a.x) * dxB + (hitOnB.y - segB.a.y) * dyB) / (lenB * lenB) : 0.5

            // Decide who jumps: non-mainFlow jumps over mainFlow
            let jumper, jumperSeg, jumperT
            if (conns[ci].mainFlow && !conns[cj].mainFlow) {
              jumper = cj; jumperSeg = sj; jumperT = tOnB
            } else if (!conns[ci].mainFlow && conns[cj].mainFlow) {
              jumper = ci; jumperSeg = si; jumperT = tOnA
            } else {
              // Both same priority: higher index jumps
              jumper = cj; jumperSeg = sj; jumperT = tOnB
            }
            crossingPairs.push({ conn: jumper, segIdx: jumperSeg, x: hit.x, y: hit.y, t: jumperT })
          }
        }
      }
    }
  }

  // Group crossings by connection index and apply jumps
  const crossingsByConn = new Map()
  for (const cp of crossingPairs) {
    if (!crossingsByConn.has(cp.conn)) crossingsByConn.set(cp.conn, [])
    crossingsByConn.get(cp.conn).push(cp)
  }
  for (const [ci, crossings] of crossingsByConn) {
    conns[ci].path = insertJumps(conns[ci].path, crossings)
  }

  const totalW = x + 40
  const mainFlowEdgeIds = new Set() // compat
  return { lanes: useLanes ? lanes : [], elements: els, connections: conns, width: totalW, height: totalH, labelW: LABEL_W, mainFlowEdgeIds, mainFlowNodeIds }
}

function bpmnExitPt(el) {
  if (el.type === 'activity') return { x: el.x + el.w, y: el.cy }
  if (el.type === 'gateway') return { x: el.cx + el.s, y: el.cy }
  return { x: el.cx + (el.r || 0), y: el.cy }
}

function bpmnEntryPt(el) {
  if (el.type === 'activity') return { x: el.x, y: el.cy }
  if (el.type === 'gateway') return { x: el.cx - el.s, y: el.cy }
  return { x: el.cx - (el.r || 0), y: el.cy }
}

/**
 * Build process graph data from track tasks.
 * Layout is async (ELK), so we return a reactive ref that updates when layout completes.
 */
export function useProcessMap(trackRef, opts = {}) {
  const viewMode = opts.viewMode
  const spotlightAgents = opts.spotlightAgents
  const minFreqPct = opts.minFreqPct
  const activityPct = opts.activityPct
  const notation = opts.notation // 'default' or 'bpmn'
  const showLanes = opts.showLanes

  const graphRef = ref(null)

  // Derive the raw graph data (sync) – everything except x/y positions
  const rawGraph = computed(() => {
    const track = isRef(trackRef) ? trackRef.value : trackRef
    if (!track || !track.tasks || !track.tasks.length) return null

    const tasks = track.tasks

    // ── Build per-case sequences ──
    const caseMap = new Map()
    for (const t of tasks) {
      if (!caseMap.has(t.caseId)) caseMap.set(t.caseId, [])
      caseMap.get(t.caseId).push(t)
    }
    for (const [, arr] of caseMap) arr.sort((a, b) => a.start - b.start || a.end - b.end)

    const actMap = new Map()
    const transMap = new Map()
    const variants = new Map()
    const outgoingTotal = new Map()

    for (const [, caseTasks] of caseMap) {
      const seen = new Set()
      const deduped = []
      for (const t of caseTasks) {
        if (!seen.has(t.taskId)) { seen.add(t.taskId); deduped.push(t) }
      }

      const seq = deduped.map(t => t.taskName)
      const vKey = seq.join(' → ')
      if (!variants.has(vKey)) variants.set(vKey, { sequence: seq, freq: 0, totalDur: 0 })
      const v = variants.get(vKey)
      v.freq++
      v.totalDur += deduped.length ? deduped[deduped.length - 1].end - deduped[0].start : 0

      for (let i = 0; i < deduped.length; i++) {
        const t = deduped[i]
        if (!actMap.has(t.taskName)) {
          actMap.set(t.taskName, {
            id: t.taskName, freq: 0, durations: [], agents: new Map(),
            waitTimes: [], isStart: false, isEnd: false,
          })
        }
        const node = actMap.get(t.taskName)
        node.freq++
        node.durations.push((t.end || 0) - (t.start || 0))
        node.agents.set(t.agent, (node.agents.get(t.agent) || 0) + 1)
        if (i > 0) node.waitTimes.push(Math.max(0, t.start - deduped[i - 1].end))
      }

      if (deduped.length) {
        actMap.get(deduped[0].taskName).isStart = true
        actMap.get(deduped[deduped.length - 1].taskName).isEnd = true
      }

      for (let i = 0; i < deduped.length - 1; i++) {
        const from = deduped[i], to = deduped[i + 1]
        const key = `${from.taskName}→${to.taskName}`
        if (!transMap.has(key)) {
          transMap.set(key, {
            source: from.taskName, target: to.taskName,
            freq: 0, waits: [], sameRes: 0, diffRes: 0, handoffPairs: new Map(),
          })
        }
        const edge = transMap.get(key)
        edge.freq++
        edge.waits.push(Math.max(0, to.start - from.end))
        if (from.agent === to.agent) edge.sameRes++
        else {
          edge.diffRes++
          const hk = `${from.agent}→${to.agent}`
          edge.handoffPairs.set(hk, (edge.handoffPairs.get(hk) || 0) + 1)
        }
        outgoingTotal.set(from.taskName, (outgoingTotal.get(from.taskName) || 0) + 1)
      }
    }

    // ── Activity frequency filter ──
    const actPct = isRef(activityPct) ? activityPct.value : 100
    const maxNodeFreq = Math.max(...[...actMap.values()].map(n => n.freq), 1)

    // ── Edge frequency filter ──
    const mfp = isRef(minFreqPct) ? minFreqPct.value : 0
    const maxEdgeFreq = Math.max(...[...transMap.values()].map(e => e.freq), 1)
    const minEdgeFreq = maxEdgeFreq * mfp / 100

    // ── Build nodes ──
    const nodes = []
    for (const [, n] of actMap) {
      const freqPct = (n.freq / maxNodeFreq) * 100
      if (freqPct < (100 - actPct)) continue

      const d = [...n.durations].sort((a, b) => a - b)
      const topAgents = [...n.agents.entries()].sort((a, b) => b[1] - a[1])
      const avgWait = n.waitTimes.length ? n.waitTimes.reduce((s, w) => s + w, 0) / n.waitTimes.length : 0
      const topAgentPct = topAgents.length ? topAgents[0][1] / n.freq : 0
      const primaryAgent = topAgents.length ? topAgents[0][0] : ''

      function extractRoleName(name) {
        const m = name.match(/^(.+?)[-_ ]?\d{2,}$/)
        return m ? m[1].replace(/[-_]$/, '') : name
      }

      nodes.push({
        ...n,
        label: n.id,
        avgDuration: d.reduce((s, v) => s + v, 0) / d.length,
        medDuration: d[Math.floor(d.length / 2)] || 0,
        minDuration: d[0] || 0,
        maxDuration: d[d.length - 1] || 0,
        totalAgents: n.agents.size,
        topAgents, primaryAgent, avgWait,
        isBottleneck: avgWait > 0 && topAgentPct > 0.8,
        isSingleResource: n.agents.size === 1,
        role: primaryAgent ? extractRoleName(primaryAgent) : 'Unknown',
      })
    }

    const nodeIds = new Set(nodes.map(n => n.id))

    // ── Build edges ──
    const edges = []
    for (const [, e] of transMap) {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
      if (e.freq < minEdgeFreq) continue
      const w = [...e.waits].sort((a, b) => a - b)
      const srcOut = outgoingTotal.get(e.source) || e.freq
      edges.push({
        ...e,
        id: `${e.source}→${e.target}`,
        avgWait: w.reduce((s, v) => s + v, 0) / w.length,
        handoffRate: e.freq > 0 ? e.diffRes / e.freq : 0,
        topHandoffs: [...e.handoffPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
        pct: srcOut > 0 ? (e.freq / srcOut * 100) : 100,
        isSelfLoop: e.source === e.target,
      })
    }

    // ── Mark back-edges (for styling only, ELK handles cycles) ──
    const posSum = {}, posCnt = {}
    for (const [, caseTasks] of caseMap) {
      const seen2 = new Set()
      const dd = []
      for (const t of caseTasks) {
        if (!seen2.has(t.taskId)) { seen2.add(t.taskId); dd.push(t) }
      }
      dd.forEach((t, i) => {
        if (!nodeIds.has(t.taskName)) return
        const p = dd.length > 1 ? i / (dd.length - 1) : 0.5
        posSum[t.taskName] = (posSum[t.taskName] || 0) + p
        posCnt[t.taskName] = (posCnt[t.taskName] || 0) + 1
      })
    }
    const avgPos = {}
    for (const n of nodes) avgPos[n.id] = (posSum[n.id] || 0) / (posCnt[n.id] || 1)

    for (const e of edges) {
      e.isBackEdge = !e.isSelfLoop && avgPos[e.target] < avgPos[e.source] - 0.05
    }

    // ── Spotlight ──
    const spotlight = isRef(spotlightAgents) ? spotlightAgents.value : null
    let spotlightNodeIds = null, spotlightEdgeIds = null
    if (spotlight && spotlight.size > 0) {
      spotlightNodeIds = new Set()
      spotlightEdgeIds = new Set()
      const nm = new Map(nodes.map(n => [n.id, n]))
      for (const n of nodes) {
        for (const [agent] of n.topAgents) {
          if (spotlight.has(agent)) { spotlightNodeIds.add(n.id); break }
        }
      }
      for (const e of edges) {
        const sn = nm.get(e.source), tn = nm.get(e.target)
        if (sn && tn) {
          const sh = [...sn.agents.keys()].some(a => spotlight.has(a))
          const th = [...tn.agents.keys()].some(a => spotlight.has(a))
          if (sh && th) spotlightEdgeIds.add(e.id)
        }
      }
    }

    // ── Stats ──
    const totalCases = caseMap.size
    const maxDuration = Math.max(...nodes.map(n => n.avgDuration), 1)

    const variantList = [...variants.entries()]
      .map(([, v]) => ({
        sequence: v.sequence,
        freq: v.freq,
        pct: (v.freq / totalCases * 100),
        avgDuration: v.totalDur / v.freq,
      }))
      .sort((a, b) => b.freq - a.freq)
      .slice(0, 20)

    const allAgents = [...new Set(tasks.map(t => t.agent))].sort()
    const agentColorMap = new Map()
    allAgents.forEach((a, i) => agentColorMap.set(a, AGENT_COLORS[i % AGENT_COLORS.length]))

    function extractRole(name) {
      const m = name.match(/^(.+?)[-_ ]?\d{2,}$/)
      return m ? m[1].replace(/[-_]$/, '') : name
    }
    const roleMap = new Map()
    const roleColorMap = new Map()
    for (const agent of allAgents) {
      const role = extractRole(agent)
      if (!roleMap.has(role)) roleMap.set(role, [])
      roleMap.get(role).push(agent)
    }
    const roles = [...roleMap.entries()]
      .map(([role, agents]) => ({ role, agents, count: agents.length }))
      .sort((a, b) => b.count - a.count)
    roles.forEach((r, i) => roleColorMap.set(r.role, AGENT_COLORS[i % AGENT_COLORS.length]))

    // Determine notation mode
    const isBpmn = (isRef(notation) ? notation.value : notation) === 'bpmn'
    const useLanes = isRef(showLanes) ? showLanes.value : !!showLanes

    return {
      nodes, edges,
      variants: variantList,
      maxNodeFreq, maxEdgeFreq, maxDuration,
      totalCases, totalActivities: nodes.length, totalTransitions: edges.length,
      spotlightNodeIds, spotlightEdgeIds,
      allAgents, agentColorMap,
      roles, roleMap, roleColorMap,
      isBpmn, useLanes,
    }
  })

  // ── Run layout whenever rawGraph changes ──
  watch(rawGraph, async (raw) => {
    if (!raw) { graphRef.value = null; return }

    const { nodes, edges, isBpmn } = raw

    // ── BPMN mode: completely different horizontal layout ──
    if (isBpmn) {
      graphRef.value = { ...raw, bpmn: buildBpmnLayout(raw, raw.useLanes) }
      return
    }

    // ── Default mode: ELK layered layout ──
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // Node dimensions
    const NODE_H = 48
    const MIN_W = 140
    const CHAR_W = 8

    // Build ELK nodes (start/end placed manually after layout)
    const elkNodes = []
    for (const n of nodes) {
      const textW = n.label.length * CHAR_W + 44
      const w = Math.max(MIN_W, Math.min(textW, 260))
      elkNodes.push({ id: n.id, width: w, height: NODE_H })
    }

    // ── Detect main flow (greedy: follow highest-frequency forward edges) ──
    const mainFlowEdgeIds = new Set()
    const edgesBySource = new Map()
    for (const e of edges) {
      if (e.isSelfLoop || e.isBackEdge) continue
      if (!edgesBySource.has(e.source)) edgesBySource.set(e.source, [])
      edgesBySource.get(e.source).push(e)
    }
    // Start from the most frequent start node
    const startNodes = nodes.filter(n => n.isStart).sort((a, b) => b.freq - a.freq)
    const endNodes = nodes.filter(n => n.isEnd)
    const mainFlowNodeIds = new Set()

    if (startNodes.length > 0) {
      let cur = startNodes[0].id
      mainFlowNodeIds.add(cur)
      const visited = new Set([cur])
      while (true) {
        const outEdges = (edgesBySource.get(cur) || []).sort((a, b) => b.freq - a.freq)
        const next = outEdges.find(e => !visited.has(e.target))
        if (!next) break
        mainFlowEdgeIds.add(next.id)
        mainFlowNodeIds.add(next.target)
        visited.add(next.target)
        cur = next.target
      }
    }

    // Build ELK edges (only real edges, no virtual start/end edges)
    const elkEdges = []
    for (const e of edges) {
      const isMain = mainFlowEdgeIds.has(e.id)
      elkEdges.push({
        id: e.id, sources: [e.source], targets: [e.target],
        layoutOptions: { priority: isMain ? '10' : '1' },
      })
    }

    // ELK layout options — direction depends on notation
    const direction = isBpmn ? 'RIGHT' : 'DOWN'
    const elkGraph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': direction,
        'elk.spacing.nodeNode': '50',
        'elk.layered.spacing.nodeNodeBetweenLayers': '70',
        'elk.layered.spacing.edgeNodeBetweenLayers': '30',
        'elk.spacing.edgeEdge': '15',
        'elk.spacing.edgeNode': '25',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.layered.nodePlacement.networkSimplex.nodeFlexibility': 'NODE_SIZE',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.thoroughness': '20',
        'elk.edgeRouting': 'POLYLINE',
        'elk.layered.mergeEdges': 'false',
        'elk.layered.cycleBreaking.strategy': 'INTERACTIVE',
        'elk.layered.considerModelOrder.strategy': 'PREFER_EDGES',
        'elk.padding': '[top=50,left=50,bottom=50,right=50]',
      },
      children: elkNodes,
      edges: elkEdges,
    }

    try {
      const elkEngine = await getElk()
      const layout = await elkEngine.layout(elkGraph)

      // Extract positions
      const childMap = new Map()
      for (const child of layout.children) {
        childMap.set(child.id, child)
      }

      for (const n of nodes) {
        const elkNode = childMap.get(n.id)
        if (elkNode) {
          n.x = elkNode.x
          n.y = elkNode.y
          n.w = elkNode.width
          n.h = elkNode.height
        }
      }

      // Build edge paths from ELK routing
      const elkEdgeMap = new Map()
      if (layout.edges) {
        for (const le of layout.edges) {
          elkEdgeMap.set(le.id, le)
        }
      }

      // Generate SVG paths for all real edges
      for (const e of edges) {
        const elkEdge = elkEdgeMap.get(e.id)
        if (elkEdge && elkEdge.sections && elkEdge.sections.length > 0) {
          e.path = elkSectionsToPath(elkEdge.sections)
          const midPt = getEdgeMidpoint(elkEdge.sections)
          e.labelX = midPt.x
          e.labelY = midPt.y
        } else {
          // Fallback: bezier between node centers
          const src = nodeMap.get(e.source)
          const tgt = nodeMap.get(e.target)
          if (src && tgt) {
            if (e.isSelfLoop) {
              const loopOff = 40, loopCtrl = loopOff + 28
              const cx = src.x + src.w + loopOff
              e.path = `M ${src.x + src.w} ${src.y + 10} C ${src.x + src.w + loopCtrl} ${src.y - 22}, ${src.x + src.w + loopCtrl} ${src.y + src.h + 22}, ${src.x + src.w} ${src.y + src.h - 10}`
              e.labelX = src.x + src.w + loopCtrl + 4
              e.labelY = src.y + src.h / 2
            } else if (isBpmn) {
              const sx = src.x + src.w, sy = src.y + src.h / 2
              const tx = tgt.x, ty = tgt.y + tgt.h / 2
              const mx = (sx + tx) / 2
              e.path = `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`
              e.labelX = mx
              e.labelY = (sy + ty) / 2 - 8
            } else {
              const sx = src.x + src.w / 2, sy = src.y + src.h
              const tx = tgt.x + tgt.w / 2, ty = tgt.y
              const my = (sy + ty) / 2
              e.path = `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`
              e.labelX = (sx + tx) / 2 + 10
              e.labelY = my - 6
            }
          }
        }
      }

      // ── Position start/end nodes manually (outside ELK to avoid constraint issues) ──
      const VIRTUAL_GAP = 50
      const isDown = direction === 'DOWN'

      // Find bounding box of all activity nodes
      let minNodeX = Infinity, maxNodeX = -Infinity, minNodeY = Infinity, maxNodeY = -Infinity
      for (const n of nodes) {
        if (n.x != null) {
          minNodeX = Math.min(minNodeX, n.x)
          maxNodeX = Math.max(maxNodeX, n.x + n.w)
          minNodeY = Math.min(minNodeY, n.y)
          maxNodeY = Math.max(maxNodeY, n.y + n.h)
        }
      }

      // Find the main start node center X for alignment
      const mainStart = startNodes[0]
      const mainStartCx = mainStart ? mainStart.x + mainStart.w / 2 : (minNodeX + maxNodeX) / 2
      // Find the main end node(s) — prefer end node that's on the main flow
      const mainEnd = endNodes.find(n => mainFlowNodeIds.has(n.id)) || endNodes[0]
      const mainEndCx = mainEnd ? mainEnd.x + mainEnd.w / 2 : (minNodeX + maxNodeX) / 2

      let startPos, endPos
      if (isDown) {
        startPos = { x: mainStartCx - 18, y: minNodeY - VIRTUAL_GAP - 36, w: 36, h: 36 }
        endPos = { x: mainEndCx - 18, y: maxNodeY + VIRTUAL_GAP, w: 36, h: 36 }
      } else {
        // BPMN: left-to-right
        startPos = { x: minNodeX - VIRTUAL_GAP - 36, y: (minNodeY + maxNodeY) / 2 - 18, w: 36, h: 36 }
        endPos = { x: maxNodeX + VIRTUAL_GAP, y: (minNodeY + maxNodeY) / 2 - 18, w: 36, h: 36 }
      }

      // Virtual edge paths (start → first, last → end)
      const virtualEdges = []
      for (const n of startNodes) {
        if (isDown) {
          const sx = startPos.x + 18, sy = startPos.y + 36
          const tx = n.x + n.w / 2, ty = n.y
          virtualEdges.push({
            id: `__start__→${n.id}`, source: '__start__', target: n.id,
            path: `M ${sx} ${sy} L ${tx} ${ty}`, freq: n.freq, isVirtual: true,
          })
        } else {
          const sx = startPos.x + 36, sy = startPos.y + 18
          const tx = n.x, ty = n.y + n.h / 2
          virtualEdges.push({
            id: `__start__→${n.id}`, source: '__start__', target: n.id,
            path: `M ${sx} ${sy} L ${tx} ${ty}`, freq: n.freq, isVirtual: true,
          })
        }
      }
      for (const n of endNodes) {
        if (isDown) {
          const sx = n.x + n.w / 2, sy = n.y + n.h
          const tx = endPos.x + 18, ty = endPos.y
          virtualEdges.push({
            id: `${n.id}→__end__`, source: n.id, target: '__end__',
            path: `M ${sx} ${sy} L ${tx} ${ty}`, freq: n.freq, isVirtual: true,
          })
        } else {
          const sx = n.x + n.w, sy = n.y + n.h / 2
          const tx = endPos.x, ty = endPos.y + 18
          virtualEdges.push({
            id: `${n.id}→__end__`, source: n.id, target: '__end__',
            path: `M ${sx} ${sy} L ${tx} ${ty}`, freq: n.freq, isVirtual: true,
          })
        }
      }

      // BPMN swimlanes
      let swimlanes = null
      if (isBpmn) {
        const roleFreq = new Map()
        for (const n of nodes) roleFreq.set(n.role, (roleFreq.get(n.role) || 0) + n.freq)
        const roleOrder = [...roleFreq.entries()].sort((a, b) => b[1] - a[1]).map(r => r[0])
        swimlanes = []
        const LANE_PAD = 16
        for (const role of roleOrder) {
          const roleNodes = nodes.filter(n => n.role === role)
          if (!roleNodes.length) continue
          const minY = Math.min(...roleNodes.map(n => n.y))
          const maxY = Math.max(...roleNodes.map(n => n.y + n.h))
          swimlanes.push({
            role,
            y: minY - LANE_PAD,
            h: maxY - minY + LANE_PAD * 2,
            color: raw.roleColorMap.get(role) || AGENT_COLORS[roleOrder.indexOf(role) % AGENT_COLORS.length],
          })
        }
      }

      // Canvas bounds
      const allX = nodes.map(n => n.x + n.w)
      const allY = nodes.map(n => n.y + n.h)
      allX.push(startPos.x + 36); allY.push(startPos.y + 36)
      allX.push(endPos.x + 36); allY.push(endPos.y + 36)

      const totalW = Math.max(...allX, 500) + 80
      const totalH = Math.max(...allY, 300) + 80

      graphRef.value = {
        ...raw,
        width: totalW,
        height: totalH,
        startNode: startPos,
        endNode: endPos,
        virtualEdges,
        swimlanes,
        mainFlowEdgeIds,
        mainFlowNodeIds,
      }
    } catch (err) {
      console.error('ELK layout failed:', err)
      fallbackLayout(raw)
      graphRef.value = { ...raw, width: 800, height: 600, startNode: null, endNode: null, virtualEdges: [], swimlanes: null }
    }
  }, { immediate: true })

  return graphRef
}

// ── ELK section → SVG path (polyline with rounded corners) ──
function elkSectionsToPath(sections) {
  let d = ''
  for (const section of sections) {
    const start = section.startPoint
    const end = section.endPoint
    const bends = section.bendPoints || []

    if (!d) d = `M ${start.x} ${start.y}`

    if (bends.length === 0) {
      d += ` L ${end.x} ${end.y}`
    } else {
      // Rounded polyline through bend points
      const pts = [start, ...bends, end]
      const R = 8 // corner radius
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1]
        const cur = pts[i]
        const next = pts[i + 1]
        if (next && i < pts.length - 1) {
          // Shorten this segment and add arc
          const dx1 = cur.x - prev.x, dy1 = cur.y - prev.y
          const dx2 = next.x - cur.x, dy2 = next.y - cur.y
          const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
          const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
          const r = Math.min(R, len1 / 2, len2 / 2)
          const cx1 = cur.x - (dx1 / len1) * r
          const cy1 = cur.y - (dy1 / len1) * r
          const cx2 = cur.x + (dx2 / len2) * r
          const cy2 = cur.y + (dy2 / len2) * r
          d += ` L ${cx1} ${cy1} Q ${cur.x} ${cur.y}, ${cx2} ${cy2}`
        } else {
          d += ` L ${cur.x} ${cur.y}`
        }
      }
    }
  }
  return d
}

function getEdgeMidpoint(sections) {
  if (!sections || !sections.length) return { x: 0, y: 0 }
  const s = sections[0]
  const bends = s.bendPoints || []
  if (bends.length > 0) {
    const mid = bends[Math.floor(bends.length / 2)]
    return { x: mid.x + 10, y: mid.y - 6 }
  }
  return {
    x: (s.startPoint.x + s.endPoint.x) / 2 + 10,
    y: (s.startPoint.y + s.endPoint.y) / 2 - 6,
  }
}

function fallbackLayout(raw) {
  const nodes = raw.nodes
  const NODE_W = 180, NODE_H = 48, GAP_X = 60, GAP_Y = 80, PAD = 50
  const cols = Math.min(3, nodes.length)
  for (let i = 0; i < nodes.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    nodes[i].x = PAD + col * (NODE_W + GAP_X)
    nodes[i].y = PAD + row * (NODE_H + GAP_Y)
    nodes[i].w = NODE_W
    nodes[i].h = NODE_H
  }
  for (const e of raw.edges) {
    const src = nodes.find(n => n.id === e.source)
    const tgt = nodes.find(n => n.id === e.target)
    if (src && tgt) {
      e.path = `M ${src.x + src.w / 2} ${src.y + src.h} L ${tgt.x + tgt.w / 2} ${tgt.y}`
      e.labelX = (src.x + tgt.x + src.w / 2 + tgt.w / 2) / 2
      e.labelY = (src.y + src.h + tgt.y) / 2
    }
  }
}

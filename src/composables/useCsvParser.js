export function parseTS(s) {
  if (!s || typeof s !== 'string') return NaN
  s = s.trim()
  if (!s) return NaN
  const m = s.match(
    /^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})(?:\.(\d+))?([\+\-]\d{2}:\d{2})?$/
  )
  if (m) {
    let iso = m[1] + 'T' + m[2]
    if (m[3]) iso += '.' + m[3].substring(0, 6)
    if (m[4]) iso += m[4]
    else iso += 'Z'
    return new Date(iso).getTime() / 1000
  }
  const ts = new Date(s).getTime() / 1000
  return isNaN(ts) ? NaN : ts
}

// Legacy assignment-type name mapping (old simulator → new naming)
const AT_LEGACY = {
  volunteer_single:  'solo_volunteer',
  volunteer_random:  'solo_volunteer_random',
  fallback_random:   'solo_fallback_random',
  volunteer_all:     'collab_volunteer_all_random',
  volunteer_partial: 'collab_volunteer_partial_random',
  fallback_all:      'collab_fallback_random',
}
function mapAT(raw) { return AT_LEGACY[raw] || raw }

export function parseCSV(text) {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map((h) => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = []
    let cur = ''
    let inQuote = false
    for (const ch of lines[i]) {
      if (ch === '"') {
        inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        vals.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    vals.push(cur.trim())
    const row = {}
    headers.forEach((h, j) => (row[h] = vals[j] || ''))
    rows.push(row)
  }
  return { headers, rows }
}

/**
 * Parse an episode from a folder's log file using the legacy fixed column format.
 * Kept for backward compatibility with COPE simulation logs.
 */
export function parseEpisode(folder, filename, maxCases) {
  const csv = folder.logFiles[filename]
  if (!csv) return null

  const { rows } = parseCSV(csv)
  return parseRowsLegacy(rows, maxCases)
}

/**
 * Legacy parser – expects exact COPE column names.
 */
function parseRowsLegacy(rows, maxCases) {
  const tasks = []
  const agentSet = new Set()
  const caseSet = new Set()
  const agentIdToName = {}

  rows.forEach((r) => {
    const caseId = parseInt(r.case_id)
    if (maxCases && caseId >= maxCases) return
    const agentNames = r.task_agent_name ? r.task_agent_name.split(/[,|]/).map((s) => s.trim()).filter(Boolean) : []
    const agentIds = r.task_agent_id
      ? r.task_agent_id.split(/[,|]/).map((s) => s.trim()).filter(Boolean)
      : []
    const start = parseTS(r.task_started_time)
    const end = parseTS(r.task_completed_time)
    const assigned = parseTS(r.task_assigned_time)
    const taskId = parseInt(r.task_id)
    const nReq = parseInt(r.task_agents_required)

    agentIds.forEach((id, i) => {
      if (i < agentNames.length && id) {
        agentIdToName[id] = agentNames[i]
      }
    })
    agentNames.forEach((aname) => agentSet.add(aname))
    caseSet.add(caseId)

    const volIds = r.task_volunteers
      ? r.task_volunteers.split(/[,|]/).map((s) => s.trim()).filter(Boolean)
      : []

    agentNames.forEach((aname) => {
      tasks.push({
        caseId,
        taskId,
        taskName: r.task_name || '',
        agent: aname,
        start,
        end,
        assigned,
        absAssigned: (r.task_assigned_time || '').trim(),
        absStart: (r.task_started_time || '').trim(),
        absEnd: (r.task_completed_time || '').trim(),
        waiting: isNaN(assigned) ? 0 : Math.max(0, start - assigned),
        isCollab: nReq > 1,
        allAgents: agentNames.join(', '),
        assignmentType: mapAT(r.task_assignment_type || ''),
        volunteerIds: volIds,
      })
    })
  })

  return finalizeTasks(tasks, agentSet, caseSet, agentIdToName)
}

/**
 * Flexible parser – uses a column mapping to parse any event log CSV.
 *
 * @param {Array} rows - Parsed CSV rows (objects)
 * @param {Object} mapping - Column mapping from useColumnDetector
 * @param {number} [maxCases] - Optional limit on case count
 * @returns parsed episode data or null
 */
export function parseRowsFlexible(rows, mapping, maxCases) {
  const tasks = []
  const agentSet = new Set()
  const caseSet = new Set()
  const agentIdToName = {}

  // Track case IDs to enforce maxCases by unique ID count, not by ID value
  const seenCaseIds = new Set()

  // Auto-increment task ID if not available
  let autoTaskId = 0

  rows.forEach((r) => {
    // --- Case ID ---
    const rawCaseId = r[mapping.caseId]
    if (rawCaseId === undefined || rawCaseId === '') return
    const caseId = isNaN(parseInt(rawCaseId)) ? rawCaseId : parseInt(rawCaseId)

    seenCaseIds.add(caseId)
    if (maxCases && seenCaseIds.size > maxCases) return
    // If we already counted too many, skip additional rows for new cases
    if (maxCases && typeof caseId === 'number' && caseId >= maxCases && seenCaseIds.size > maxCases) return

    // --- Resource / Agent ---
    const resourceCol = mapping.resource
    const resourceIdCol = mapping.resourceId
    let agentNames = []
    let agentIds = []

    if (resourceCol && r[resourceCol]) {
      agentNames = r[resourceCol].split(/[,|]/).map((s) => s.trim()).filter(Boolean)
    }
    if (resourceIdCol && r[resourceIdCol]) {
      agentIds = r[resourceIdCol].split(/[,|]/).map((s) => s.trim()).filter(Boolean)
    }

    // If no agent name but we have agent ID, use ID as name
    if (agentNames.length === 0 && agentIds.length > 0) {
      agentNames = agentIds.map((id) => `Agent-${id}`)
    }
    // If still no agent, use a fallback
    if (agentNames.length === 0) {
      agentNames = ['Unknown']
    }

    // --- Timestamps ---
    const start = parseTS(r[mapping.startTime])
    const end = parseTS(r[mapping.endTime])
    if (isNaN(start) || isNaN(end)) return

    // assigned time is optional
    const assigned = mapping.assignedTime && r[mapping.assignedTime]
      ? parseTS(r[mapping.assignedTime])
      : start // default: assigned = start (no waiting)

    // --- Task ID ---
    let taskId
    if (mapping.activityId && r[mapping.activityId]) {
      taskId = parseInt(r[mapping.activityId])
      if (isNaN(taskId)) taskId = autoTaskId++
    } else {
      taskId = autoTaskId++
    }

    // --- Task Name ---
    const taskName = (mapping.activityName && r[mapping.activityName]) || ''

    // --- Collaboration ---
    const nReq = mapping.agentsRequired && r[mapping.agentsRequired]
      ? parseInt(r[mapping.agentsRequired]) || 1
      : agentNames.length > 1 ? agentNames.length : 1

    // --- Agent ID to Name ---
    agentIds.forEach((id, i) => {
      if (i < agentNames.length && id) {
        agentIdToName[id] = agentNames[i]
      }
    })
    agentNames.forEach((aname) => agentSet.add(aname))
    caseSet.add(caseId)

    // --- Assignment Type & Volunteers ---
    const assignmentType = mapping.assignmentType && r[mapping.assignmentType]
      ? mapAT(r[mapping.assignmentType].trim())
      : ''
    const volIds = mapping.volunteers && r[mapping.volunteers]
      ? r[mapping.volunteers].split(/[,|]/).map((s) => s.trim()).filter(Boolean)
      : []

    // --- Absolute time strings ---
    const absAssigned = mapping.assignedTime && r[mapping.assignedTime]
      ? r[mapping.assignedTime].trim()
      : ''
    const absStart = r[mapping.startTime] ? r[mapping.startTime].trim() : ''
    const absEnd = r[mapping.endTime] ? r[mapping.endTime].trim() : ''

    agentNames.forEach((aname) => {
      tasks.push({
        caseId: typeof caseId === 'number' ? caseId : hashString(caseId),
        caseIdRaw: rawCaseId,
        taskId,
        taskName,
        agent: aname,
        start,
        end,
        assigned: isNaN(assigned) ? start : assigned,
        absAssigned,
        absStart,
        absEnd,
        waiting: isNaN(assigned) ? 0 : Math.max(0, start - assigned),
        isCollab: nReq > 1,
        allAgents: agentNames.join(', '),
        assignmentType,
        volunteerIds: volIds,
      })
    })
  })

  return finalizeTasks(tasks, agentSet, caseSet, agentIdToName)
}

/**
 * Simple hash for non-numeric case IDs to produce a numeric caseId for coloring.
 */
function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 10000
}

/**
 * Normalize timestamps and return final parsed data.
 */
function finalizeTasks(tasks, agentSet, caseSet, agentIdToName) {
  if (tasks.length === 0) return null

  // Avoid Math.min/max with spread on large arrays (can cause stack overflow at 62k+)
  let minTime = Infinity
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    const v = t.start < t.assigned ? t.start : t.assigned
    if (v < minTime) minTime = v
  }
  let totalDuration = 0
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    t.start -= minTime
    t.end -= minTime
    t.assigned -= minTime
    if (t.end > totalDuration) totalDuration = t.end
  }
  const agents = [...agentSet].sort()
  const caseIds = [...caseSet].sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a).localeCompare(String(b))
  })

  return { tasks, agents, caseIds, totalDuration, agentIdToName }
}

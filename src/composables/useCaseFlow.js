import { computed, isRef } from 'vue'

/**
 * Compute case flow diagram data from a track for a specific case.
 * @param {Ref|Object} trackRef - the track object (or a computed ref to it)
 * @param {Ref|number} caseIdRef - the case ID (or a computed ref to it)
 */
export function useCaseFlow(trackRef, caseIdRef) {
  // Unwrap refs/computed inside computed to stay reactive
  const caseTasks = computed(() => {
    const track = isRef(trackRef) ? trackRef.value : trackRef
    const caseId = isRef(caseIdRef) ? caseIdRef.value : caseIdRef
    if (!track || !track.tasks || caseId === null || caseId === undefined) return []
    return track.tasks
      .filter(t => t.caseId === caseId)
      .sort((a, b) => a.start - b.start)
  })

  const agents = computed(() => {
    return [...new Set(caseTasks.value.map(t => t.agent))]
  })

  const caseStart = computed(() => {
    if (caseTasks.value.length === 0) return 0
    return Math.min(...caseTasks.value.map(t => t.start))
  })

  const caseDuration = computed(() => {
    if (caseTasks.value.length === 0) return 1
    const maxEnd = Math.max(...caseTasks.value.map(t => t.end))
    return maxEnd - caseStart.value || 1
  })

  const nodes = computed(() => {
    return caseTasks.value.map(task => ({
      id: `${task.caseId}-${task.taskId}-${task.agent}`,
      task,
      laneIndex: agents.value.indexOf(task.agent),
      relStart: task.start - caseStart.value,
      duration: task.end - task.start,
    }))
  })

  const edges = computed(() => {
    const result = []
    for (let i = 0; i < caseTasks.value.length - 1; i++) {
      const from = caseTasks.value[i]
      const to = caseTasks.value[i + 1]
      const waitTime = to.start - from.end
      result.push({
        fromId: `${from.caseId}-${from.taskId}-${from.agent}`,
        toId: `${to.caseId}-${to.taskId}-${to.agent}`,
        fromTask: from,
        toTask: to,
        waitTime,
        isBottleneck: waitTime > 300,
        fromLane: agents.value.indexOf(from.agent),
        toLane: agents.value.indexOf(to.agent),
      })
    }
    return result
  })

  return { caseTasks, agents, caseStart, caseDuration, nodes, edges }
}

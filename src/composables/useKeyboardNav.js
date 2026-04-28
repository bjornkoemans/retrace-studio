import { nextTick } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'

export function useKeyboardNav() {
  const store = useTimelineStore()

  function getTrack() {
    return store.tracks.find(t => t.id === store.focusedTrackId) || store.tracks[0]
  }

  function getAgentTasks(track, agent) {
    return track.tasks
      .filter(t => t.agent === agent)
      .sort((a, b) => a.start - b.start)
  }

  function getAgents(track) {
    return track.agentOrder || track.agents
  }

  function selectNextTask(dir) {
    if (!store.enableKeyboardNav) return
    const track = getTrack()
    if (!track) return

    // If no agent focused, pick first agent
    if (!store.focusedAgent) {
      const agents = getAgents(track)
      if (agents.length === 0) return
      store.focusedAgent = agents[0]
      store.focusedTrackId = track.id
    }

    const tasks = getAgentTasks(track, store.focusedAgent)
    if (tasks.length === 0) return

    const curIdx = store.selectedTask
      ? tasks.findIndex(t => t.caseId === store.selectedTask.caseId && t.taskId === store.selectedTask.taskId && t.agent === store.selectedTask.agent)
      : -1

    const nextIdx = curIdx === -1
      ? (dir > 0 ? 0 : tasks.length - 1)
      : Math.max(0, Math.min(tasks.length - 1, curIdx + dir))

    store.selectTask(tasks[nextIdx], track)
    scrollToSelectedTask()
  }

  function selectNextAgent(dir) {
    if (!store.enableKeyboardNav) return
    const track = getTrack()
    if (!track) return

    const agents = getAgents(track)
    if (agents.length === 0) return

    const curIdx = store.focusedAgent ? agents.indexOf(store.focusedAgent) : -1
    const nextIdx = curIdx === -1
      ? (dir > 0 ? 0 : agents.length - 1)
      : Math.max(0, Math.min(agents.length - 1, curIdx + dir))

    store.focusedAgent = agents[nextIdx]

    // Select first task of new agent
    const tasks = getAgentTasks(track, agents[nextIdx])
    if (tasks.length > 0) {
      store.selectTask(tasks[0], track)
      scrollToSelectedTask()
    }
  }

  function scrollToSelectedTask() {
    nextTick(() => {
      // Canvas-based rendering: no DOM element to scrollIntoView.
      // Instead, scroll the track-hscroll so the selected task is visible.
      const sel = store.selectedTask
      if (!sel) return
      const track = getTrack()
      if (!track) return
      const task = track.tasks.find(t =>
        t.caseId === sel.caseId && t.taskId === sel.taskId && t.agent === sel.agent
      )
      if (!task) return
      const pps = store.pxPerSecond
      const taskPx = task.start * pps
      const taskEndPx = task.end * pps
      // Scroll horizontally if task is outside viewport
      const vpLeft = store.viewportLeft
      const vpRight = vpLeft + store.viewportWidth
      if (taskPx < vpLeft + 150 || taskEndPx > vpRight - 50) {
        store.markProgrammaticScroll()
        store.syncScrollAll(null, Math.max(0, taskPx - store.viewportWidth / 3))
      }
    })
  }

  return { selectNextTask, selectNextAgent }
}

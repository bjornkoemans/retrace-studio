<script setup>
import { computed } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import QueueAgent from './QueueAgent.vue'

const props = defineProps({
  track: { type: Object, required: true },
})

const store = useTimelineStore()

const visibleAgents = computed(() => {
  if (store.showZeroDuration) return props.track.agents
  return props.track.agents.filter((agent) =>
    props.track.tasks.some((t) => t.agent === agent && t.end - t.start > 0)
  )
})
</script>

<template>
  <div class="track-queue">
    <div class="track-queue-header">Status</div>
    <QueueAgent
      v-for="agent in visibleAgents"
      :key="agent"
      :track="track"
      :agent="agent"
    />
  </div>
</template>

<style scoped>
.track-queue {
  width: 260px;
  min-width: 260px;
  background: var(--queue-bg);
  border-left: 2px solid var(--queue-border);
  flex-shrink: 0;
  overflow-y: hidden;
}
.track-queue-header {
  height: 24px;
  background: var(--queue-header-bg);
  border-bottom: 1px solid var(--queue-border);
  display: flex;
  align-items: center;
  padding-left: 10px;
  font-size: 10px;
  color: var(--text-muted);
}
</style>

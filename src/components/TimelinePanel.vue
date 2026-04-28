<script setup>
import { ref, watch, nextTick } from "vue";
import { useTimelineStore } from "../stores/timelineStore";
import TimelineTrack from "./TimelineTrack.vue";

const store = useTimelineStore();

// Auto-compact: when total agent lanes exceed viewport height, enable compact mode
watch(
  () => store.visibleTracks.map((t) => t.agents?.length || 0),
  async (agentCounts) => {
    if (store.compactMode) return; // already compact
    const totalAgents = agentCounts.reduce((s, c) => s + c, 0);
    if (totalAgents === 0) return;
    await nextTick();
    const headerH = 90; // approximate header + axis + track header per track
    const trackOverhead = store.visibleTracks.length * headerH;
    const totalLaneH = totalAgents * store.laneHeight + trackOverhead;
    const viewportH = window.innerHeight;
    if (totalLaneH > viewportH) {
      store.compactMode = true;
      store.showToast(
        "Large number of agents identified, compact lanes are automatically enabled"
      );
    }
  },
  { immediate: true }
);

// Track drag reordering — only starts from the drag-handle element
const dragIdx = ref(null);
const dropIdx = ref(null);
let dragFromHandle = false;

function onMouseDown(e) {
  // Check if the mousedown originated from a .drag-handle element
  dragFromHandle = e.target.closest(".drag-handle") !== null;
}

function onDragStart(e, idx) {
  if (!dragFromHandle) {
    e.preventDefault();
    return;
  }
  dragIdx.value = idx;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(idx));
}

function onDragOver(e, idx) {
  if (dragIdx.value === null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  dropIdx.value = idx;
}

function onDragLeave() {
  dropIdx.value = null;
}

function onDrop(e, idx) {
  e.preventDefault();
  if (dragIdx.value !== null && dragIdx.value !== idx) {
    store.reorderTrack(dragIdx.value, idx);
  }
  dragIdx.value = null;
  dropIdx.value = null;
  dragFromHandle = false;
}

function onDragEnd() {
  dragIdx.value = null;
  dropIdx.value = null;
  dragFromHandle = false;
}
</script>

<template>
  <div class="timeline-scroll">
    <div v-if="store.tracks.length === 0" class="landing">
      <div>
        Click <b>+ Import</b> to load a results folder and add timelines.
      </div>
    </div>
    <div
      v-for="(track, idx) in store.visibleTracks"
      :key="track.id"
      class="track-drag-wrap"
      :class="{ 'drop-target': dropIdx === idx && dragIdx !== idx }"
      draggable="true"
      @mousedown="onMouseDown"
      @dragstart="onDragStart($event, idx)"
      @dragover="onDragOver($event, idx)"
      @dragleave="onDragLeave"
      @drop="onDrop($event, idx)"
      @dragend="onDragEnd"
    >
      <TimelineTrack :track="track" />
    </div>
  </div>
</template>

<style scoped>
.timeline-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg-primary);
  padding: var(--app-container-padding);
}
.timeline-scroll > * + * {
  margin-top: var(--app-container-padding);
}
.landing {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-dim);
  font-size: 14px;
  text-align: center;
  line-height: 2;
  min-height: 200px;
}

.track-drag-wrap {
  transition: transform 0.15s ease;
}
.track-drag-wrap.drop-target {
  outline: 2px dashed var(--accent-primary);
  outline-offset: 2px;
  border-radius: var(--card-radius);
}
</style>

<script setup>
import { ref, computed } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { caseColor } from '../utils/colors'
import { markerSvg, AT_LABELS, AT_COLORS } from '../utils/assignmentTypes'

const store = useTimelineStore()
const expanded = ref(false)
const hoveredMarker = ref(null)

const COLLAPSE_THRESHOLD = 50

const markerTypes = [
  { type: 'solo_volunteer', label: 'Volunteered', desc: 'A single agent volunteered for this task and was assigned.', example: 'Agent explicitly offered to do the work.' },
  { type: 'solo_volunteer_random', label: 'Volunteer (random)', desc: 'Multiple agents volunteered. One was randomly picked.', example: 'Several agents available — random selection made.' },
  { type: 'solo_fallback_random', label: 'Fallback (random)', desc: 'No agent volunteered. One was randomly assigned as fallback.', example: 'No volunteers — system assigned randomly.' },
  { type: 'collab_volunteer', label: 'Collab: exact match', desc: 'A collaborative task where all required roles were filled by volunteers.', example: 'All roles matched by volunteering agents.' },
  { type: 'collab_volunteer_all_random', label: 'Collab: all random', desc: 'All agents for this collab task volunteered, but a random subset was picked.', example: 'All volunteered — random pick for roles.' },
  { type: 'collab_volunteer_partial_random', label: 'Collab: partial', desc: 'Some roles were filled by volunteers, others by random fallback.', example: 'Mixed: some volunteered, some randomly assigned.' },
  { type: 'collab_fallback_random', label: 'Collab: fallback', desc: 'No volunteers for this collab task. All roles assigned randomly.', example: 'No volunteers — all roles randomly assigned.' },
  { type: 'ground_truth', label: 'Ground truth', desc: 'This assignment was recorded from real data (not simulated).', example: 'Original assignment from the source log.' },
  { type: 'assigned', label: 'Assigned', desc: 'Default assignment marker when no specific type is recorded.', example: 'Generic task assignment.' },
]

// Only show marker types that exist in current data
const activeMarkerTypes = computed(() => {
  if (!store.hasAssignInfo) return []
  const typesInData = new Set()
  for (const track of store.tracks) {
    for (const task of track.tasks) {
      if (task.assignmentType) typesInData.add(task.assignmentType)
      else if (task.absAssigned != null) typesInData.add('assigned')
    }
  }
  return markerTypes.filter(m => typesInData.has(m.type))
})

const totalCases = computed(() => store.allCaseIds.length)
const isLargeDataset = computed(() => totalCases.value > COLLAPSE_THRESHOLD)

const visibleCaseIds = computed(() => {
  if (!isLargeDataset.value || expanded.value) {
    return store.allCaseIds
  }
  return store.allCaseIds.slice(0, COLLAPSE_THRESHOLD)
})

const activeCaseCount = computed(() => {
  return store.allCaseIds.filter((cid) => store.isCaseActive(cid)).length
})

function getMarkerSvg(type) {
  const color = AT_COLORS[type] || '#888'
  return markerSvg(type, color, 11)
}
</script>

<template>
  <div class="legend-bar">
    <!-- Case Legend -->
    <template v-if="store.showLegend">
      <!-- Summary line for large datasets -->
      <div v-if="isLargeDataset" class="legend-summary">
        <span class="legend-section-label">Cases</span>
        <span class="legend-summary-text">
          {{ totalCases }} cases
          <span v-if="activeCaseCount < totalCases" class="legend-active-count">({{ activeCaseCount }} active)</span>
        </span>
        <button class="legend-toggle" @click="expanded = !expanded">
          {{ expanded ? 'Collapse' : 'Show all' }}
        </button>
      </div>

      <div class="legend-items" :class="{ 'legend-items-expanded': expanded || !isLargeDataset }">
        <div
          v-for="cid in visibleCaseIds"
          :key="cid"
          class="legend-item"
          :class="{ off: !store.isCaseActive(cid) }"
          @click="store.toggleCaseActive(cid)"
        >
          <div class="sw" :style="{ background: caseColor(cid) }"></div>
          C{{ cid }}
        </div>

        <span v-if="isLargeDataset && !expanded" class="legend-more" @click="expanded = true">
          +{{ totalCases - COLLAPSE_THRESHOLD }} more…
        </span>
      </div>
    </template>

    <!-- Divider between case and marker legend -->
    <div v-if="store.showLegend && store.showMarkerLegend && activeMarkerTypes.length > 0" class="legend-divider"></div>

    <!-- Marker Legend -->
    <div v-if="store.showMarkerLegend && activeMarkerTypes.length > 0" class="marker-legend-row">
      <span class="legend-section-label">Markers</span>
      <div class="marker-legend-items">
        <div
          v-for="m in activeMarkerTypes"
          :key="m.type"
          class="marker-legend-item"
          @mouseenter="hoveredMarker = m.type"
          @mouseleave="hoveredMarker = null"
        >
          <span class="marker-svg" v-html="getMarkerSvg(m.type)"></span>
          <span class="marker-label">{{ m.label }}</span>

          <!-- Tooltip -->
          <Transition name="tip-fade">
            <div v-if="hoveredMarker === m.type" class="marker-tooltip">
              <div class="marker-tooltip-header">
                <span class="marker-tooltip-svg" v-html="getMarkerSvg(m.type)"></span>
                <strong>{{ m.label }}</strong>
              </div>
              <p class="marker-tooltip-desc">{{ m.desc }}</p>
              <p class="marker-tooltip-example">
                <span class="marker-tooltip-example-label">Example:</span> {{ m.example }}
              </p>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.legend-bar {
  display: flex;
  flex-direction: column;
  padding: 6px 16px;
  background: var(--legend-bg);
  border-bottom: 1px solid var(--legend-border);
  flex-shrink: 0;
  gap: 4px;
}

/* Section labels */
.legend-section-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-right: 8px;
}

/* Divider */
.legend-divider {
  height: 1px;
  background: var(--legend-border);
  margin: 2px 0;
}

/* Summary row */
.legend-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.legend-summary-text {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  flex: 1;
}
.legend-active-count {
  font-weight: 400;
  opacity: 0.7;
}
.legend-toggle {
  background: none;
  border: 1px solid var(--border-primary);
  color: var(--accent-primary);
  font-size: 9px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 3px;
  white-space: nowrap;
}
.legend-toggle:hover {
  background: var(--accent-primary-hover);
}

/* Case items */
.legend-items {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
  overflow: hidden;
  max-height: 28px;
  transition: max-height 0.3s ease;
}
.legend-items-expanded {
  max-height: none;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 3px;
  white-space: nowrap;
  color: var(--text-primary);
}
.legend-item:hover {
  background: var(--legend-item-hover);
}
.legend-item .sw {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid var(--legend-swatch-border);
  flex-shrink: 0;
}
.legend-item.off .sw {
  opacity: 0.2;
}
.legend-item.off {
  color: var(--legend-off-text);
}

.legend-more {
  font-size: 10px;
  color: var(--accent-primary);
  cursor: pointer;
  padding: 2px 6px;
  font-weight: 600;
  white-space: nowrap;
}
.legend-more:hover {
  text-decoration: underline;
}

/* ═══ Marker Legend ═══ */
.marker-legend-row {
  display: flex;
  align-items: center;
}
.marker-legend-items {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  align-items: center;
}
.marker-legend-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: default;
  transition: background 0.15s;
}
.marker-legend-item:hover {
  background: var(--legend-item-hover);
}
.marker-svg {
  display: flex;
  align-items: center;
  line-height: 0;
}
.marker-label {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* Tooltip */
.marker-tooltip {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: 240px;
  background: var(--surface-overlay);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 8px;
  box-shadow: var(--shadow-xl);
  padding: 10px 12px;
  z-index: 500;
  pointer-events: none;
}
.marker-tooltip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.marker-tooltip-header strong {
  font-size: 11px;
  color: var(--surface-overlay-text);
}
.marker-tooltip-svg {
  display: flex;
  align-items: center;
  line-height: 0;
}
.marker-tooltip-desc {
  font-size: 10px;
  color: var(--surface-overlay-text);
  line-height: 1.4;
  margin: 0 0 6px;
}
.marker-tooltip-example {
  font-size: 9px;
  color: var(--surface-overlay-text-muted);
  line-height: 1.4;
  margin: 0;
  font-style: italic;
}
.marker-tooltip-example-label {
  font-weight: 600;
  font-style: normal;
}

/* Tooltip transition */
.tip-fade-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.tip-fade-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.tip-fade-enter-from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
.tip-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(-4px); }
</style>

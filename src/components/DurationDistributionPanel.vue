<script setup>
import { ref, inject, computed, watch } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { useDurationStats } from '../composables/useDurationStats'

const store = useTimelineStore()
const isOpen = inject('distributionOpen')
const { trackOptions, getDurations, computeHistogram } = useDurationStats()

function close() { isOpen.value = false }

// Work hours toggle — compute durations using Mon-Fri 08:00-20:00 only
const useWorkHours = ref(false)

// Selected state per slot (up to 2 for comparison)
const slots = ref([
  { trackId: null, taskName: null, agent: 'All agents' },
  { trackId: null, taskName: null, agent: 'All agents' },
])

// Auto-select first track when opened
watch(isOpen, (open) => {
  if (open && store.tracks.length > 0) {
    for (let i = 0; i < slots.value.length && i < store.tracks.length; i++) {
      const tid = store.tracks[i].id
      const currentTrackId = slots.value[i].trackId
      // Check if slot needs auto-select: no trackId set, or trackId doesn't exist in current tracks
      const needsAutoSelect = currentTrackId === null || currentTrackId === undefined ||
        !store.tracks.some(t => t.id === currentTrackId)
      if (needsAutoSelect) {
        slots.value[i].trackId = tid
        const opts = trackOptions.value[tid]
        if (opts && opts.taskNames.length > 0) {
          slots.value[i].taskName = opts.taskNames[0]
        }
        slots.value[i].agent = 'All agents'
      }
    }
  }
})

// Computed histograms for each slot
const histograms = computed(() => {
  return slots.value.map(slot => {
    if (slot.trackId === null || slot.trackId === undefined || !slot.taskName) return null
    const durations = getDurations(slot.trackId, slot.taskName, slot.agent)
    return computeHistogram(durations, 20, useWorkHours.value)
  })
})

// For the combined chart: compute shared bin edges
const combinedChart = computed(() => {
  const h0 = histograms.value[0]
  const h1 = histograms.value[1]
  if (!h0 || !h1 || h0.bins.length === 0 || h1.bins.length === 0) return null

  // Shared range
  const allMin = Math.min(h0.stats.min, h1.stats.min)
  const allMax = Math.max(h0.stats.max, h1.stats.max)
  const numBins = 25
  const range = allMax - allMin
  if (range === 0) return null
  const binWidth = range / numBins

  // Re-bin both datasets with shared bins
  const durations0 = getDurations(slots.value[0].trackId, slots.value[0].taskName, slots.value[0].agent)
  const durations1 = getDurations(slots.value[1].trackId, slots.value[1].taskName, slots.value[1].agent)

  const bins0 = new Array(numBins).fill(0)
  const bins1 = new Array(numBins).fill(0)

  for (const d of durations0) {
    let idx = Math.floor((d.duration - allMin) / binWidth)
    if (idx >= numBins) idx = numBins - 1
    if (idx < 0) idx = 0
    bins0[idx]++
  }
  for (const d of durations1) {
    let idx = Math.floor((d.duration - allMin) / binWidth)
    if (idx >= numBins) idx = numBins - 1
    if (idx < 0) idx = 0
    bins1[idx]++
  }

  const maxCount = Math.max(...bins0, ...bins1, 1)

  return { bins0, bins1, allMin, allMax, binWidth, numBins, maxCount }
})

function trackTitle(trackId) {
  const t = store.tracks.find(tr => tr.id === trackId)
  return t ? t.title : ''
}

function fmtDuration(seconds) {
  if (seconds < 60) return seconds.toFixed(1) + 's'
  if (seconds < 3600) return (seconds / 60).toFixed(1) + 'm'
  return (seconds / 3600).toFixed(1) + 'h'
}

function taskNamesForTrack(trackId) {
  const opts = trackOptions.value[trackId]
  return opts ? opts.taskNames : []
}

function agentsForTrack(trackId) {
  const opts = trackOptions.value[trackId]
  return opts ? opts.agents : ['All agents']
}

function onTrackChange(slotIdx) {
  const slot = slots.value[slotIdx]
  const names = taskNamesForTrack(slot.trackId)
  // Always update taskName when track changes if current name is invalid
  if (names.length > 0 && (!slot.taskName || !names.includes(slot.taskName))) {
    slot.taskName = names[0]
  }
  slot.agent = 'All agents'
}

// SVG chart dimensions
const W = 400
const H = 180
const PAD = { top: 10, right: 10, bottom: 30, left: 40 }
const chartW = W - PAD.left - PAD.right
const chartH = H - PAD.top - PAD.bottom

// Pre-computed chart paths for each slot (avoids calling singleChartPaths multiple times in template)
const chartPaths = computed(() => {
  return histograms.value.map(histogram => {
    if (!histogram || histogram.bins.length === 0) return { bars: [], xTicks: [], yTicks: [], meanX: null, medianX: null }
    const { bins, stats } = histogram
    const maxCount = Math.max(...bins.map(b => b.count), 1)
    const xMin = bins[0].x0
    const xMax = bins[bins.length - 1].x1
    const xRange = xMax - xMin || 1

    const bars = bins.map(b => ({
      x: PAD.left + ((b.x0 - xMin) / xRange) * chartW,
      w: Math.max(1, ((b.x1 - b.x0) / xRange) * chartW - 1),
      y: PAD.top + chartH - (b.count / maxCount) * chartH,
      h: (b.count / maxCount) * chartH,
      count: b.count,
      label: fmtDuration((b.x0 + b.x1) / 2),
    }))

    // X ticks (5 evenly spaced)
    const xTicks = []
    for (let i = 0; i <= 4; i++) {
      const v = xMin + (i / 4) * xRange
      xTicks.push({ x: PAD.left + (i / 4) * chartW, label: fmtDuration(v) })
    }

    // Y ticks
    const yTicks = []
    for (let i = 0; i <= 3; i++) {
      const v = Math.round((i / 3) * maxCount)
      yTicks.push({ y: PAD.top + chartH - (i / 3) * chartH, label: v })
    }

    // Mean & median lines
    const meanX = PAD.left + ((stats.mean - xMin) / xRange) * chartW
    const medianX = PAD.left + ((stats.median - xMin) / xRange) * chartW

    return { bars, xTicks, yTicks, meanX, medianX }
  })
})
</script>

<template>
  <div class="dist-overlay" :class="{ open: isOpen }" @click.self="close">
    <div class="dist-panel">
      <div class="dist-header">
        <h2>Duration Distribution</h2>
        <label class="workhours-toggle">
          <input type="checkbox" v-model="useWorkHours" />
          <span class="workhours-label">Work hours</span>
        </label>
        <button class="dist-done" @click="close">Done</button>
      </div>

      <div class="dist-body">
        <!-- Slot selectors -->
        <div class="dist-slots">
          <div
            v-for="(slot, idx) in slots"
            :key="idx"
            class="dist-slot"
            :class="{ 'slot-a': idx === 0, 'slot-b': idx === 1 }"
          >
            <div class="slot-label">{{ idx === 0 ? 'A' : 'B' }}</div>
            <select v-model="slot.trackId" @change="onTrackChange(idx)" class="dist-select">
              <option :value="null" disabled>Select track...</option>
              <option v-for="tr in store.tracks" :key="tr.id" :value="tr.id">
                {{ tr.title }}
              </option>
            </select>
            <select v-model="slot.taskName" class="dist-select">
              <option :value="null" disabled>Task type...</option>
              <option v-for="tn in taskNamesForTrack(slot.trackId)" :key="tn" :value="tn">
                {{ tn }}
              </option>
            </select>
            <select v-model="slot.agent" class="dist-select dist-select-sm">
              <option v-for="ag in agentsForTrack(slot.trackId)" :key="ag" :value="ag">
                {{ ag }}
              </option>
            </select>
          </div>
        </div>

        <!-- Individual histograms -->
        <div class="dist-charts">
          <div v-for="(slot, idx) in slots" :key="'chart-' + idx" class="dist-chart-wrap">
            <div class="chart-title" :class="{ 'color-a': idx === 0, 'color-b': idx === 1 }">
              {{ slot.taskName || 'No task selected' }}
              <span v-if="histograms[idx]" class="chart-n">
                n={{ histograms[idx].stats.n }}<template v-if="histograms[idx].nRemoved > 0"> ({{ histograms[idx].nTotal }} total)</template>
              </span>
            </div>
            <svg v-if="histograms[idx] && histograms[idx].bins.length > 0"
              :viewBox="`0 0 ${W} ${H}`" class="dist-svg">
              <!-- Grid lines -->
              <line v-for="yt in chartPaths[idx].yTicks" :key="'yg' + yt.y"
                :x1="PAD.left" :x2="W - PAD.right" :y1="yt.y" :y2="yt.y"
                stroke="var(--surface-overlay-border)" stroke-width="0.5" />
              <!-- Bars -->
              <rect v-for="(bar, bi) in chartPaths[idx].bars" :key="bi"
                :x="bar.x" :y="bar.y" :width="bar.w" :height="bar.h"
                :fill="idx === 0 ? 'var(--accent-primary)' : 'var(--accent-warning)'"
                :opacity="0.75" rx="1" />
              <!-- Mean line -->
              <line v-if="chartPaths[idx].meanX"
                :x1="chartPaths[idx].meanX"
                :x2="chartPaths[idx].meanX"
                :y1="PAD.top" :y2="PAD.top + chartH"
                stroke="#e74c3c" stroke-width="1.5" stroke-dasharray="4,2" />
              <!-- Median line -->
              <line v-if="chartPaths[idx].medianX"
                :x1="chartPaths[idx].medianX"
                :x2="chartPaths[idx].medianX"
                :y1="PAD.top" :y2="PAD.top + chartH"
                stroke="#2ecc71" stroke-width="1.5" stroke-dasharray="4,2" />
              <!-- X axis labels -->
              <text v-for="xt in chartPaths[idx].xTicks" :key="'xl' + xt.x"
                :x="xt.x" :y="H - 4" text-anchor="middle" class="axis-label">{{ xt.label }}</text>
              <!-- Y axis labels -->
              <text v-for="yt in chartPaths[idx].yTicks" :key="'yl' + yt.y"
                :x="PAD.left - 6" :y="yt.y + 3" text-anchor="end" class="axis-label">{{ yt.label }}</text>
              <!-- Axes -->
              <line :x1="PAD.left" :x2="W - PAD.right" :y1="PAD.top + chartH" :y2="PAD.top + chartH"
                stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" />
              <line :x1="PAD.left" :x2="PAD.left" :y1="PAD.top" :y2="PAD.top + chartH"
                stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" />
            </svg>
            <div v-else class="chart-empty">Select a track and task type</div>

            <!-- Stats row -->
            <div v-if="histograms[idx]" class="stats-row">
              <span class="stat"><b>Mean:</b> {{ fmtDuration(histograms[idx].stats.mean) }}</span>
              <span class="stat"><b>Median:</b> {{ fmtDuration(histograms[idx].stats.median) }}</span>
              <span class="stat"><b>Std:</b> {{ fmtDuration(histograms[idx].stats.std) }}</span>
              <span class="stat"><b>Min:</b> {{ fmtDuration(histograms[idx].stats.min) }}</span>
              <span class="stat"><b>Max:</b> {{ fmtDuration(histograms[idx].stats.max) }}</span>
              <span v-if="useWorkHours" class="stat stat-workhours">
                <b>Mode:</b> work hours
              </span>
            </div>
            <!-- Legend -->
            <div v-if="histograms[idx]" class="chart-legend-row">
              <span class="legend-item"><span class="legend-swatch" style="background:#e74c3c"></span> Mean</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#2ecc71"></span> Median</span>
            </div>
          </div>
        </div>

        <!-- Combined overlay chart (when both selected) -->
        <div v-if="combinedChart" class="dist-chart-wrap dist-combined">
          <div class="chart-title">Combined Comparison</div>
          <svg :viewBox="`0 0 ${W} ${H}`" class="dist-svg">
            <!-- Grid -->
            <line v-for="i in 4" :key="'cg' + i"
              :x1="PAD.left" :x2="W - PAD.right"
              :y1="PAD.top + chartH - ((i - 1) / 3) * chartH"
              :y2="PAD.top + chartH - ((i - 1) / 3) * chartH"
              stroke="var(--surface-overlay-border)" stroke-width="0.5" />
            <!-- Bars A -->
            <rect v-for="(count, bi) in combinedChart.bins0" :key="'ca' + bi"
              :x="PAD.left + (bi / combinedChart.numBins) * chartW"
              :y="PAD.top + chartH - (count / combinedChart.maxCount) * chartH"
              :width="Math.max(1, chartW / combinedChart.numBins * 0.45)"
              :height="(count / combinedChart.maxCount) * chartH"
              fill="var(--accent-primary)" opacity="0.7" rx="1" />
            <!-- Bars B (offset) -->
            <rect v-for="(count, bi) in combinedChart.bins1" :key="'cb' + bi"
              :x="PAD.left + (bi / combinedChart.numBins) * chartW + chartW / combinedChart.numBins * 0.45"
              :y="PAD.top + chartH - (count / combinedChart.maxCount) * chartH"
              :width="Math.max(1, chartW / combinedChart.numBins * 0.45)"
              :height="(count / combinedChart.maxCount) * chartH"
              fill="var(--accent-warning)" opacity="0.7" rx="1" />
            <!-- X axis -->
            <text v-for="i in 5" :key="'cx' + i"
              :x="PAD.left + ((i - 1) / 4) * chartW"
              :y="H - 4" text-anchor="middle" class="axis-label">
              {{ fmtDuration(combinedChart.allMin + ((i - 1) / 4) * (combinedChart.allMax - combinedChart.allMin)) }}
            </text>
            <!-- Y axis -->
            <text v-for="i in 4" :key="'cy' + i"
              :x="PAD.left - 6"
              :y="PAD.top + chartH - ((i - 1) / 3) * chartH + 3"
              text-anchor="end" class="axis-label">
              {{ Math.round(((i - 1) / 3) * combinedChart.maxCount) }}
            </text>
            <!-- Axes -->
            <line :x1="PAD.left" :x2="W - PAD.right" :y1="PAD.top + chartH" :y2="PAD.top + chartH"
              stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" />
            <line :x1="PAD.left" :x2="PAD.left" :y1="PAD.top" :y2="PAD.top + chartH"
              stroke="var(--surface-overlay-text-muted)" stroke-width="0.5" />
          </svg>
          <div class="chart-legend-row">
            <span class="legend-item"><span class="legend-swatch" style="background:var(--accent-primary)"></span> A: {{ slots[0].taskName }}</span>
            <span class="legend-item"><span class="legend-swatch" style="background:var(--accent-warning)"></span> B: {{ slots[1].taskName }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dist-overlay {
  display: none;
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 600;
  background: var(--backdrop-bg);
  align-items: center;
  justify-content: center;
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
}
.dist-overlay.open { display: flex; }

.dist-panel {
  background: var(--surface-overlay);
  border-radius: 12px;
  box-shadow: var(--shadow-xl);
  width: 880px;
  max-width: 95vw;
  max-height: 90vh;
  overflow-y: auto;
}

.dist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--surface-overlay-border);
  position: sticky;
  top: 0;
  background: var(--surface-overlay);
  z-index: 1;
}
.dist-header h2 {
  font-size: 15px;
  font-weight: 700;
  color: var(--surface-overlay-text);
}
.workhours-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  margin-left: auto;
  margin-right: 12px;
}
.workhours-toggle input {
  accent-color: var(--accent-success);
  cursor: pointer;
}
.workhours-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-success);
}
.dist-done {
  background: none;
  border: none;
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
}
.dist-done:hover { background: var(--accent-primary-hover); }

.dist-body { padding: 16px; }

/* Slot selectors */
.dist-slots {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.dist-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-overlay-card);
  border: 1px solid var(--surface-overlay-border);
}
.slot-label {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}
.slot-a .slot-label { background: var(--accent-primary); color: #fff; }
.slot-b .slot-label { background: var(--accent-warning); color: #fff; }

.dist-select {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--surface-overlay-input-border);
  background: var(--surface-overlay-input-bg);
  color: var(--surface-overlay-text);
  font-size: 11px;
  cursor: pointer;
}
.dist-select-sm { flex: 0 0 140px; }

/* Charts */
.dist-charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.dist-chart-wrap {
  background: var(--surface-overlay-card);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 8px;
  padding: 10px;
}

.dist-combined {
  margin-top: 4px;
}

.chart-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--surface-overlay-text);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.chart-title.color-a { color: var(--accent-primary); }
.chart-title.color-b { color: var(--accent-warning); }
.chart-n {
  font-weight: 400;
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
}

.dist-svg {
  width: 100%;
  height: auto;
}
.axis-label {
  font-size: 8px;
  fill: var(--surface-overlay-text-muted);
}

.chart-empty {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--surface-overlay-text-muted);
  font-size: 11px;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--surface-overlay-border);
}
.stat {
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
}
.stat b {
  color: var(--surface-overlay-text);
  font-weight: 600;
}
.stat-workhours {
  color: var(--accent-success);
}
.stat-workhours b {
  color: var(--accent-success);
}

.chart-legend-row {
  display: flex;
  gap: 12px;
  margin-top: 6px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
}
.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}
</style>

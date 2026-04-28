<script setup>
import { inject } from 'vue'
import { useExport } from '../composables/useExport'

const isOpen = inject('exportOpen')
const { exportPNG, exportStatsCSV } = useExport()

function close() { isOpen.value = false }

function doExportPNG() { exportPNG(); close() }
function doExportCSV() { exportStatsCSV(); close() }
</script>

<template>
  <div class="export-overlay" :class="{ open: isOpen }" @click.self="close">
    <div class="export-panel">
      <div class="export-header">
        <h2>Export</h2>
        <button class="export-done" @click="close">Done</button>
      </div>
      <div class="export-body">
        <button class="export-option" @click="doExportPNG">
          <div class="export-option-icon">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/></svg>
          </div>
          <div class="export-option-text">
            <div class="export-option-title">Screenshot (PNG)</div>
            <div class="export-option-desc">Export the current timeline view as a high-res image</div>
          </div>
        </button>
        <button class="export-option" @click="doExportCSV">
          <div class="export-option-icon">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clip-rule="evenodd"/></svg>
          </div>
          <div class="export-option-text">
            <div class="export-option-title">Statistics (CSV)</div>
            <div class="export-option-desc">Export process mining statistics for all tracks</div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-overlay {
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
.export-overlay.open { display: flex; }
.export-panel {
  background: var(--surface-overlay);
  border-radius: 12px;
  box-shadow: var(--shadow-xl);
  width: 400px;
  overflow: hidden;
}
.export-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.export-header h2 {
  font-size: 15px;
  font-weight: 700;
  color: var(--surface-overlay-text);
}
.export-done {
  background: none;
  border: none;
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
}
.export-done:hover { background: var(--accent-primary-hover); }
.export-body { padding: 12px; }
.export-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  background: var(--surface-overlay-card);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  margin-bottom: 8px;
  transition: background 0.15s;
}
.export-option:hover { background: rgba(255,255,255,0.08); }
.export-option-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary-hover);
  border-radius: 8px;
  flex-shrink: 0;
}
.export-option-icon svg {
  width: 18px;
  height: 18px;
  color: var(--accent-primary);
}
.export-option-text { flex: 1; min-width: 0; }
.export-option-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--surface-overlay-text);
}
.export-option-desc {
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
  margin-top: 2px;
}
</style>

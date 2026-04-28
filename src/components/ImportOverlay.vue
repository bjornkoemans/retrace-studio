<script setup>
import { ref, computed, inject, watch, onMounted, onUnmounted } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { parseCSV, parseRowsFlexible } from '../composables/useCsvParser'
import { detectColumns, validateMapping, REQUIRED_MAPPINGS, MAPPING_LABELS, MAPPING_DESCRIPTIONS, MAPPING_CATEGORIES } from '../composables/useColumnDetector'

const store = useTimelineStore()
const isOpen = inject('importOpen')
const maxCases = ref(0) // 0 = all cases (no limit)

// Single CSV file state
const csvFile = ref(null)
const csvFileName = ref('')
const csvHeaders = ref([])
const csvRows = ref([])
const csvRowCount = ref(0)
const columnMapping = ref({})
const mappingValid = ref(false)
const mappingMissing = ref([])
const parsePreview = ref(null)
const parseError = ref('')

// Loading state
const isLoading = ref(false)
const loadingMessage = ref('')

function close() {
  if (isLoading.value) return // prevent closing while loading
  isOpen.value = false
}

// ── CSV file import ──

async function handleCsvFile(event) {
  const file = event.target.files[0]
  if (!file) return

  csvFileName.value = file.name
  parseError.value = ''
  parsePreview.value = null
  isLoading.value = true
  loadingMessage.value = 'Reading file…'

  // Reset input so same file can be re-selected
  event.target.value = ''

  try {
    const text = await file.text()
    loadingMessage.value = 'Parsing CSV…'

    // Yield to let spinner appear
    await new Promise((r) => setTimeout(r, 30))

    const { headers, rows } = parseCSV(text)

    if (headers.length === 0 || rows.length === 0) {
      parseError.value = 'Could not parse CSV: no headers or no data rows found.'
      return
    }

    csvHeaders.value = headers
    csvRows.value = rows
    csvRowCount.value = rows.length
    csvFile.value = file

    // Auto-detect column mapping
    const detected = detectColumns(headers)
    columnMapping.value = { ...detected }

    // Validate
    revalidate()
  } catch (err) {
    parseError.value = `Error reading file: ${err.message}`
  } finally {
    isLoading.value = false
    loadingMessage.value = ''
  }
}

function revalidate() {
  const result = validateMapping(columnMapping.value)
  mappingValid.value = result.valid
  mappingMissing.value = result.missing

  // Generate preview
  if (result.valid) {
    try {
      const previewParsed = parseRowsFlexible(csvRows.value.slice(0, 50), columnMapping.value)
      if (previewParsed) {
        parsePreview.value = {
          taskCount: previewParsed.tasks.length,
          agentCount: previewParsed.agents.length,
          caseCount: previewParsed.caseIds.length,
          sampleAgents: previewParsed.agents.slice(0, 5),
        }
      } else {
        parsePreview.value = null
        parseError.value = 'No valid tasks could be parsed from the first 50 rows. Check your column mapping.'
      }
    } catch (err) {
      parsePreview.value = null
      parseError.value = `Parse error: ${err.message}`
    }
  } else {
    parsePreview.value = null
  }
}

function onMappingChange(field, newValue) {
  columnMapping.value = {
    ...columnMapping.value,
    [field]: newValue || null,
  }
  revalidate()
}

// The list of all mapping fields to show in the UI (flat, for backward compat)
const allMappingFields = computed(() => {
  return Object.keys(MAPPING_LABELS).map((field) => ({
    field,
    label: MAPPING_LABELS[field],
    description: MAPPING_DESCRIPTIONS[field] || '',
    required: REQUIRED_MAPPINGS.includes(field),
    value: columnMapping.value[field] || '',
  }))
})

// Categorized mapping fields for the improved UI
const categorizedFields = computed(() => {
  return MAPPING_CATEGORIES.map(cat => ({
    ...cat,
    items: cat.fields.map(field => ({
      field,
      label: MAPPING_LABELS[field],
      description: MAPPING_DESCRIPTIONS[field] || '',
      required: REQUIRED_MAPPINGS.includes(field),
      value: columnMapping.value[field] || '',
    })),
  }))
})

const canAddCsv = computed(() => {
  return csvFile.value && mappingValid.value && parsePreview.value
})

function addTrackCsv() {
  if (!canAddCsv.value || isLoading.value) return
  isLoading.value = true
  loadingMessage.value = `Parsing ${csvRowCount.value.toLocaleString()} rows…`

  // Use setTimeout to let Vue render the spinner before heavy parsing
  setTimeout(() => {
    try {
      const parsed = parseRowsFlexible(csvRows.value, columnMapping.value, maxCases.value)
      if (!parsed) {
        store.showToast('No tasks found. Check your column mapping.')
        return
      }

      const title = csvFileName.value.replace(/\.csv$/i, '')
      store.addTrackFromParsed(title, parsed)
      store.showToast(`Imported ${parsed.tasks.length} tasks from ${parsed.agents.length} agents`)

      // Reset CSV state
      csvFile.value = null
      csvFileName.value = ''
      csvHeaders.value = []
      csvRows.value = []
      columnMapping.value = {}
      parsePreview.value = null
      parseError.value = ''

      isOpen.value = false
    } finally {
      isLoading.value = false
      loadingMessage.value = ''
    }
  }, 50)
}

// ── Feature flags based on mapping ──
const hasWaitInfo = computed(() => !!columnMapping.value.assignedTime)
const hasCollabInfo = computed(() => !!columnMapping.value.agentsRequired)
const hasAssignInfo = computed(() => !!columnMapping.value.assignmentType)

// Watch mapping to auto-disable features when columns are missing
watch(columnMapping, () => {
  // Only for CSV imports where features might be missing
  // The settings remain available but the data won't have those fields
}, { deep: true })

// ── Keyboard shortcut: Enter to import ──
function onKeydown(e) {
  if (!isOpen.value || isLoading.value) return
  if (e.key === 'Enter') {
    // Don't trigger if user is typing in an input/select
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
    if (canAddCsv.value) {
      e.preventDefault()
      addTrackCsv()
    }
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="import-overlay" :class="{ open: isOpen }" @click.self="close">
    <div class="import-panel">
      <div class="import-header">
        <h2>Import Timeline</h2>
        <button class="import-close" @click="close">Close</button>
      </div>

      <!-- ═══════════════ CSV FILE IMPORT ═══════════════ -->
      <div class="import-body">
        <!-- Step 1: Select CSV file -->
        <div class="import-step" :class="{ active: !csvFile, done: !!csvFile }">
          <div class="import-step-num">1</div>
          <div class="import-step-content">
            <div class="import-step-label">Select CSV file</div>
            <label class="import-file-btn" :class="{ loaded: !!csvFile }">
              <span>{{ csvFile ? csvFileName : 'Browse CSV file...' }}</span>
              <input type="file" accept=".csv" style="display: none" @change="handleCsvFile" />
            </label>
            <div v-if="parseError && !csvFile" class="import-error">{{ parseError }}</div>
          </div>
        </div>

        <!-- Step 2: Column mapping -->
        <div v-if="csvFile" class="import-step" :class="{ active: csvFile && !mappingValid, done: mappingValid }">
          <div class="import-step-num">2</div>
          <div class="import-step-content">
            <div class="import-step-label">Column Mapping</div>
            <div class="import-step-desc">
              Detected {{ csvHeaders.length }} columns, {{ csvRowCount }} rows.
              Adjust mappings if needed.
            </div>

            <div class="mapping-categories">
              <div v-for="cat in categorizedFields" :key="cat.label" class="mapping-category">
                <div class="mapping-cat-header">
                  <span class="mapping-cat-label">{{ cat.label }}</span>
                  <span class="mapping-cat-desc">{{ cat.description }}</span>
                </div>
                <div class="mapping-cat-items">
                  <div
                    v-for="item in cat.items"
                    :key="item.field"
                    class="mapping-row"
                    :class="{ required: item.required, missing: item.required && !item.value }"
                  >
                    <div class="mapping-label-col">
                      <label class="mapping-label">
                        {{ item.label }}
                        <span v-if="item.required" class="mapping-req">*</span>
                      </label>
                      <div class="mapping-hint">{{ item.description }}</div>
                    </div>
                    <select
                      :value="item.value"
                      @change="onMappingChange(item.field, $event.target.value)"
                      class="mapping-select"
                    >
                      <option value="">— none —</option>
                      <option v-for="h in csvHeaders" :key="h" :value="h">{{ h }}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="mappingMissing.length > 0" class="import-error">
              Missing required: {{ mappingMissing.map(f => MAPPING_LABELS[f]).join(', ') }}
            </div>

            <div v-if="parseError && csvFile" class="import-error">{{ parseError }}</div>
          </div>
        </div>

        <!-- Step 3: Preview & add -->
        <div v-if="csvFile && mappingValid" class="import-step" :class="{ active: parsePreview }">
          <div class="import-step-num">3</div>
          <div class="import-step-content">
            <div class="import-step-label">Preview & Options</div>
            <div v-if="parsePreview" class="preview-card">
              <div class="preview-title">Data Preview</div>
              <div class="preview-subtitle">Sampled from first 50 rows of {{ csvRowCount.toLocaleString() }} total</div>
              <div class="preview-grid">
                <div class="preview-stat">
                  <strong>{{ parsePreview.taskCount }}</strong>
                  <span>Tasks</span>
                </div>
                <div class="preview-stat">
                  <strong>{{ parsePreview.caseCount }}</strong>
                  <span>Cases</span>
                </div>
                <div class="preview-stat">
                  <strong>{{ parsePreview.agentCount }}</strong>
                  <span>Agents</span>
                </div>
              </div>
              <div class="preview-agents">
                {{ parsePreview.sampleAgents.join(', ') }}{{ parsePreview.agentCount > 5 ? ', ...' : '' }}
              </div>

              <!-- Feature availability badges -->
              <div class="feature-badges">
                <span class="badge" :class="hasWaitInfo ? 'badge-on' : 'badge-off'">
                  {{ hasWaitInfo ? '✓' : '✗' }} Wait times
                </span>
                <span class="badge" :class="hasCollabInfo ? 'badge-on' : 'badge-off'">
                  {{ hasCollabInfo ? '✓' : '✗' }} Collaboration
                </span>
                <span class="badge" :class="hasAssignInfo ? 'badge-on' : 'badge-off'">
                  {{ hasAssignInfo ? '✓' : '✗' }} Assignment markers
                </span>
              </div>
            </div>
            <div class="import-row" style="margin-top: 8px">
              <label class="option-label">Max cases</label>
              <input type="number" v-model.number="maxCases" min="0" max="9999" placeholder="0 = all" />
              <span v-if="!maxCases" class="option-hint">all</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading overlay -->
      <div v-if="isLoading" class="loading-overlay">
        <div class="spinner"></div>
        <div class="loading-text">{{ loadingMessage }}</div>
      </div>

      <!-- Footer -->
      <div class="import-footer">
        <button
          class="import-add-btn"
          :disabled="!canAddCsv || isLoading"
          @click="addTrackCsv"
        >
          <span v-if="isLoading" class="btn-spinner"></span>
          {{ isLoading ? 'Loading…' : 'Add to view' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 600;
  background: var(--backdrop-bg);
  align-items: center;
  justify-content: center;
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
}
.import-overlay.open {
  display: flex;
}
.import-panel {
  background: var(--surface-overlay);
  border-radius: 10px;
  box-shadow: var(--shadow-xl);
  width: 540px;
  max-height: 88vh;
  overflow-y: auto;
  padding: 0;
}
.import-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 10px;
  background: var(--surface-overlay-header);
}
.import-header h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--surface-overlay-text);
}
.import-close {
  background: none;
  border: none;
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.import-close:hover {
  background: var(--accent-primary-hover);
}

.import-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.import-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  opacity: 0.5;
  transition: opacity 0.2s;
}
.import-step.active,
.import-step.done {
  opacity: 1;
}
.import-step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface-overlay-card);
  color: var(--surface-overlay-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}
.import-step.active .import-step-num {
  background: var(--accent-primary);
  color: #fff;
}
.import-step.done .import-step-num {
  background: var(--accent-success);
  color: #fff;
}
.import-step-content {
  flex: 1;
  min-width: 0;
}
.import-step-label {
  font-size: 12px;
  color: var(--surface-overlay-text);
  font-weight: 600;
  margin-bottom: 6px;
}
.import-step-desc {
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
  margin-bottom: 8px;
  line-height: 1.4;
}
.import-step.done .import-step-label {
  color: var(--surface-overlay-text-muted);
}
.import-step select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--surface-overlay-input-border);
  border-radius: 5px;
  background: var(--surface-overlay-input-bg);
  color: var(--surface-overlay-text);
  font-size: 12px;
  font-family: inherit;
}
.import-step select:disabled {
  opacity: 0.4;
}
.import-step input[type='number'] {
  width: 70px;
  padding: 6px 8px;
  border: 1px solid var(--surface-overlay-input-border);
  border-radius: 5px;
  background: var(--surface-overlay-input-bg);
  color: var(--surface-overlay-text);
  font-size: 12px;
  font-family: inherit;
  text-align: center;
}
.import-file-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px dashed var(--surface-overlay-border);
  background: var(--surface-overlay-card);
  color: var(--surface-overlay-text-muted);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
  width: 100%;
  justify-content: center;
}
.import-file-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-hover);
}
.import-file-btn.loaded {
  border-color: var(--accent-success);
  color: var(--accent-success);
  border-style: solid;
}
.import-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.option-label {
  font-size: 11px;
  color: var(--surface-overlay-text-muted);
  white-space: nowrap;
}

/* Column mapping — categorized */
.mapping-categories {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mapping-category {
  border: 1px solid var(--surface-overlay-border);
  border-radius: 6px;
  overflow: hidden;
}
.mapping-cat-header {
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid var(--surface-overlay-border);
}
.mapping-cat-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--surface-overlay-text);
}
.mapping-cat-desc {
  font-size: 9px;
  color: var(--surface-overlay-text-muted);
  margin-left: 8px;
}
.mapping-cat-items {
  padding: 4px 0;
}
.mapping-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
}
.mapping-row + .mapping-row {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
.mapping-row.missing .mapping-label {
  color: var(--accent-danger);
}
.mapping-label-col {
  width: 160px;
  flex-shrink: 0;
}
.mapping-label {
  font-size: 11px;
  color: var(--surface-overlay-text);
  white-space: nowrap;
}
.mapping-hint {
  font-size: 8px;
  color: var(--surface-overlay-text-muted);
  line-height: 1.3;
  margin-top: 1px;
  opacity: 0.8;
}
.mapping-req {
  color: var(--accent-danger);
  font-weight: 700;
}
.mapping-select {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid var(--surface-overlay-input-border);
  border-radius: 4px;
  background: var(--surface-overlay-input-bg);
  color: var(--surface-overlay-text);
  font-size: 11px;
  font-family: inherit;
}

/* Preview card */
.preview-card {
  background: var(--surface-overlay-card);
  border-radius: 6px;
  padding: 10px 12px;
}
.preview-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--surface-overlay-text);
  margin-bottom: 2px;
}
.preview-subtitle {
  font-size: 9px;
  color: var(--surface-overlay-text-muted);
  margin-bottom: 8px;
}
.preview-grid {
  display: flex;
  gap: 16px;
  margin-bottom: 6px;
}
.preview-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.preview-stat strong {
  font-size: 16px;
  font-weight: 700;
  color: var(--surface-overlay-text);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.preview-stat span {
  font-size: 9px;
  color: var(--surface-overlay-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.preview-agents {
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
  font-style: italic;
  padding-top: 6px;
  border-top: 1px solid var(--surface-overlay-border);
}

/* Feature badges */
.feature-badges {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.badge {
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
}
.badge-on {
  background: rgba(52, 211, 153, 0.15);
  color: var(--accent-success);
}
.badge-off {
  background: rgba(255, 255, 255, 0.06);
  color: var(--surface-overlay-text-muted);
}

/* Error */
.import-error {
  font-size: 10px;
  color: var(--accent-danger);
  margin-top: 6px;
  line-height: 1.4;
}

.import-footer {
  padding: 10px 14px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.import-add-btn {
  padding: 8px 20px;
  border: none;
  background: var(--accent-success);
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: background 0.15s;
}
.import-add-btn:hover {
  background: var(--accent-success-hover);
}
.import-add-btn:disabled {
  background: var(--surface-overlay-card);
  color: var(--surface-overlay-text-muted);
  cursor: default;
}

/* Loading overlay */
.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 14px;
  gap: 10px;
}
.loading-text {
  font-size: 11px;
  color: var(--surface-overlay-text-muted);
  font-weight: 500;
}

/* Spinner */
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--surface-overlay-border);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.btn-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

<script setup>
import { inject, ref } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { useExport } from '../composables/useExport'
import { fmtTimePrecise } from '../utils/formatTime'

const store = useTimelineStore()
const isOpen = inject('annotationsOpen')
const { exportAnnotations } = useExport()
const editingId = ref(null)
const editText = ref('')
const editType = ref('') // 'annotation' or 'bookmark'

function close() {
  isOpen.value = false
}

function startEdit(item, type) {
  editingId.value = item.id
  editText.value = type === 'annotation' ? item.text : item.label
  editType.value = type
}

function saveEdit(id) {
  if (editType.value === 'bookmark') {
    store.updateBookmark(id, editText.value)
  } else {
    store.updateAnnotation(id, editText.value)
  }
  editingId.value = null
  editType.value = ''
}

function jumpTo(time) {
  store.playheadTime = time
  store.scrollToTime(time)
}
</script>

<template>
  <div class="annotations-overlay" :class="{ open: isOpen }" @click.self="close">
    <div class="annotations-panel">
      <div class="annotations-header">
        <h2>Annotations & Bookmarks</h2>
        <button class="annotations-done" @click="close">Done</button>
      </div>

      <div class="annotations-body">
        <!-- Annotations -->
        <div class="annotations-section">
          <div class="section-label">Annotations ({{ store.annotations.length }})</div>
          <div v-if="store.annotations.length === 0" class="empty-msg">No annotations yet. Double-click on the timeline to add one.</div>
          <div v-for="a in store.annotations" :key="a.id" class="annotation-item">
            <button class="jump-btn" @click="jumpTo(a.time)" :title="'Jump to ' + fmtTimePrecise(a.time)">
              {{ fmtTimePrecise(a.time) }}
            </button>
            <template v-if="editingId === a.id">
              <input v-model="editText" class="edit-input" @keyup.enter="saveEdit(a.id)" @keyup.escape="editingId = null" />
              <button class="save-btn" @click="saveEdit(a.id)">Save</button>
            </template>
            <template v-else>
              <span class="annotation-text" @dblclick="startEdit(a, 'annotation')">{{ a.text }}</span>
            </template>
            <button class="delete-btn" @click="store.removeAnnotation(a.id)">&times;</button>
          </div>
        </div>

        <!-- Bookmarks -->
        <div class="annotations-section">
          <div class="section-label">Bookmarks ({{ store.bookmarks.length }})</div>
          <div v-if="store.bookmarks.length === 0" class="empty-msg">No bookmarks yet. Press B to bookmark the current playhead.</div>
          <div v-for="b in store.bookmarks" :key="b.id" class="annotation-item">
            <button class="jump-btn" @click="jumpTo(b.time)" :title="'Jump to ' + fmtTimePrecise(b.time)">
              {{ fmtTimePrecise(b.time) }}
            </button>
            <template v-if="editingId === b.id">
              <input v-model="editText" class="edit-input" @keyup.enter="saveEdit(b.id)" @keyup.escape="editingId = null" />
              <button class="save-btn" @click="saveEdit(b.id)">Save</button>
            </template>
            <template v-else>
              <span class="annotation-text" @dblclick="startEdit(b, 'bookmark')">{{ b.label }}</span>
            </template>
            <button class="delete-btn" @click="store.removeBookmark(b.id)">&times;</button>
          </div>
        </div>

        <!-- Export -->
        <div class="annotations-section">
          <button class="export-btn" @click="exportAnnotations" :disabled="store.annotations.length === 0 && store.bookmarks.length === 0">
            Export as JSON
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.annotations-overlay {
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
.annotations-overlay.open { display: flex; }
.annotations-panel {
  background: var(--surface-overlay);
  border-radius: 12px;
  box-shadow: var(--shadow-xl);
  width: 480px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.annotations-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.annotations-header h2 {
  font-size: 15px;
  font-weight: 700;
  color: var(--surface-overlay-text);
}
.annotations-done {
  background: none;
  border: none;
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
}
.annotations-done:hover { background: var(--accent-primary-hover); }
.annotations-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 18px 18px;
}
.annotations-section { margin-bottom: 16px; }
.section-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--surface-overlay-text-muted);
  margin-bottom: 8px;
}
.empty-msg {
  font-size: 11px;
  color: var(--surface-overlay-text-muted);
  font-style: italic;
}
.annotation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--surface-overlay-border);
}
.jump-btn {
  background: var(--surface-overlay-card);
  border: none;
  color: var(--accent-primary);
  font-size: 10px;
  font-family: 'SF Mono', monospace;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.jump-btn:hover { background: var(--accent-primary-hover); }
.annotation-text {
  flex: 1;
  font-size: 11px;
  color: var(--surface-overlay-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit-input {
  flex: 1;
  font-size: 11px;
  background: var(--surface-overlay-input-bg);
  border: 1px solid var(--surface-overlay-input-border);
  color: var(--surface-overlay-text);
  padding: 3px 6px;
  border-radius: 4px;
  outline: none;
}
.save-btn {
  background: var(--accent-primary);
  border: none;
  color: #fff;
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.delete-btn {
  background: none;
  border: none;
  color: var(--surface-overlay-text-muted);
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  line-height: 1;
}
.delete-btn:hover { color: var(--accent-danger); }
.export-btn {
  background: var(--surface-overlay-card);
  border: 1px solid var(--surface-overlay-border);
  color: var(--surface-overlay-text);
  font-size: 11px;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
}
.export-btn:hover { background: rgba(255,255,255,0.08); }
.export-btn:disabled { opacity: 0.4; cursor: default; }
</style>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import { scrollToTask } from '../composables/useSearch'
import { parseQueryChips } from '../utils/parseQueryChips'
import { getSuggestions } from '../composables/useSearchSuggestions'

const store = useTimelineStore()
const inputRef = ref(null)
const wrapRef = ref(null)
const isFocused = ref(false)
const suggestionsOpen = ref(false)
const suggestionIndex = ref(-1)

// ── Query state ──
// Full query = chips (raw tokens) + rawText (free text)
const fullQuery = ref(store.searchQuery)
let debounceTimer = null

const parsed = computed(() => parseQueryChips(fullQuery.value))
const chips = computed(() => parsed.value.chips)
const rawText = ref(parsed.value.rest)

// Sync rawText when external changes arrive (e.g. share link restore)
watch(() => parsed.value.rest, (newRest) => {
  if (rawText.value !== newRest) rawText.value = newRest
}, { flush: 'sync' })

// Rebuild full query from chips + rawText and push to store (debounced)
function buildQuery() {
  const chipParts = chips.value.map(c => c.raw).join(' ')
  const text = rawText.value.trim()
  return [chipParts, text].filter(Boolean).join(' ')
}

watch(rawText, () => {
  const q = buildQuery()
  fullQuery.value = q
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    store.searchQuery = q
  }, 200)
  // Open suggestions when typing
  updateSuggestions()
})

const hasQuery = computed(() => fullQuery.value.trim().length > 0)
const resultCount = computed(() => store.searchResults.length)
const currentIndex = computed(() => store.searchResultIndex)
const navLabel = computed(() => {
  if (resultCount.value === 0) return '0'
  return `${currentIndex.value + 1}/${resultCount.value}`
})

// ── Suggestions ──
const suggestions = computed(() => getSuggestions(rawText.value))

function updateSuggestions() {
  if (suggestions.value.length > 0 && isFocused.value) {
    suggestionsOpen.value = true
    suggestionIndex.value = 0
  } else {
    suggestionsOpen.value = false
    suggestionIndex.value = -1
  }
}

function acceptSuggestion(s) {
  rawText.value = s.insert
  suggestionsOpen.value = false
  suggestionIndex.value = -1
  nextTick(() => inputRef.value?.focus())
}

function closeSuggestions() {
  suggestionsOpen.value = false
  suggestionIndex.value = -1
}

// Dropdown position
const dropdownStyle = ref({})
function updateDropdownPos() {
  if (!wrapRef.value) return
  const r = wrapRef.value.getBoundingClientRect()
  dropdownStyle.value = {
    position: 'fixed',
    top: (r.bottom + 4) + 'px',
    left: r.left + 'px',
    minWidth: r.width + 'px',
    zIndex: 9999,
  }
}

// ── Navigation ──
function navigate(dir) {
  if (resultCount.value === 0) return
  let next = currentIndex.value + dir
  if (next < 0) next = resultCount.value - 1
  if (next >= resultCount.value) next = 0
  store.searchResultIndex = next
  const match = store.searchResults[next]
  if (match) scrollToTask(match, store)
}

// ── Chip removal ──
function removeChip(chip) {
  const q = fullQuery.value.replace(chip.raw, '').replace(/\s+/g, ' ').trim()
  fullQuery.value = q
  rawText.value = parseQueryChips(q).rest
  clearTimeout(debounceTimer)
  store.searchQuery = q
  nextTick(() => inputRef.value?.focus())
}

// ── Clear ──
function onClear() {
  fullQuery.value = ''
  rawText.value = ''
  clearTimeout(debounceTimer)
  store.searchQuery = ''
  closeSuggestions()
}

// ── Keyboard ──
function onKeydown(e) {
  // Suggestions navigation
  if (suggestionsOpen.value && suggestions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      suggestionIndex.value = (suggestionIndex.value + 1) % suggestions.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      suggestionIndex.value = suggestionIndex.value <= 0 ? suggestions.value.length - 1 : suggestionIndex.value - 1
      return
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && suggestionIndex.value >= 0)) {
      e.preventDefault()
      acceptSuggestion(suggestions.value[suggestionIndex.value])
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSuggestions()
      return
    }
  }

  // Prev/next result
  if (e.key === 'Enter') {
    e.preventDefault()
    navigate(e.shiftKey ? -1 : 1)
    return
  }

  // Escape: close or blur
  if (e.key === 'Escape') {
    e.preventDefault()
    if (hasQuery.value) onClear()
    else inputRef.value?.blur()
    return
  }

  // Backspace on empty rawText removes last chip
  if (e.key === 'Backspace' && rawText.value === '' && chips.value.length > 0) {
    removeChip(chips.value[chips.value.length - 1])
  }
}

function onFocus() {
  isFocused.value = true
  updateDropdownPos()
  updateSuggestions()
}

function onBlur() {
  isFocused.value = false
  // Delay close so click on suggestion registers
  setTimeout(() => { suggestionsOpen.value = false }, 150)
}

function focusInput() {
  inputRef.value?.focus()
}

// Expose focus for App.vue "/" shortcut
function focus() { inputRef.value?.focus() }
defineExpose({ focus })

// Resize handler to reposition dropdown
function onResize() { if (suggestionsOpen.value) updateDropdownPos() }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <div class="search-wrap" ref="wrapRef">
    <div class="search-bar" :class="{ active: hasQuery, focused: isFocused }" @click="focusInput">
      <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
      </svg>

      <!-- Filter chips -->
      <span
        v-for="chip in chips"
        :key="chip.raw"
        class="search-chip"
        :class="chip.type"
      >
        {{ chip.label }}
        <button class="search-chip-x" @click.stop="removeChip(chip)" tabindex="-1">&times;</button>
      </span>

      <!-- Text input -->
      <input
        ref="inputRef"
        v-model="rawText"
        type="text"
        :placeholder="chips.length ? 'Type to search...' : 'Search (>5m, wait:>30m, C0.T8...)'"
        spellcheck="false"
        autocomplete="off"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
      />

      <!-- Navigation: ‹ 3/47 › -->
      <div v-if="hasQuery && resultCount > 0" class="search-nav">
        <button class="nav-btn" @click.stop="navigate(-1)" title="Previous (Shift+Enter)">&#8249;</button>
        <span class="nav-label">{{ navLabel }}</span>
        <button class="nav-btn" @click.stop="navigate(1)" title="Next (Enter)">&#8250;</button>
      </div>

      <!-- Zero results -->
      <span v-else-if="hasQuery && resultCount === 0" class="search-count zero">0</span>

      <!-- Clear -->
      <button v-if="hasQuery" class="search-clear" @click.stop="onClear" title="Clear (Esc)">&times;</button>
    </div>

    <!-- Suggestions dropdown (teleported to avoid z-index issues) -->
    <Teleport to="body">
      <div v-if="suggestionsOpen && suggestions.length" class="search-suggestions" :style="dropdownStyle">
        <div
          v-for="(s, i) in suggestions"
          :key="s.category + '-' + s.label"
          class="sug-item"
          :class="[{ active: i === suggestionIndex }, 'sug-' + s.category]"
          @mousedown.prevent="acceptSuggestion(s)"
        >
          <span class="sug-tag" :class="'sug-tag-' + s.category">{{ s.description }}</span>
          <span class="sug-label">{{ s.label }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.search-wrap {
  position: relative;
  flex: 1;
  min-width: 240px;
  max-width: 520px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--header-search-bg, var(--header-btn-bg));
  border: 1px solid var(--header-search-border, var(--header-btn-border));
  border-radius: 14px;
  padding: 0 14px;
  height: 36px;
  cursor: text;
  box-shadow: var(--header-search-shadow);
  transition: border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.search-bar:focus-within,
.search-bar.focused {
  border-color: var(--accent-primary);
  box-shadow: var(--header-search-shadow-focus);
  transform: scale(1.01);
}
.search-bar.active {
  border-color: var(--accent-primary);
}

.search-icon {
  width: 15px;
  height: 15px;
  color: var(--header-text-muted);
  flex-shrink: 0;
  transition: color 0.2s ease;
}
.search-bar:focus-within .search-icon,
.search-bar.active .search-icon {
  color: var(--accent-primary);
}

/* ── Chips ── */
.search-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 22px;
  padding: 0 7px 0 8px;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1;
}
.search-chip.filter {
  background: rgba(93, 173, 226, 0.15);
  color: var(--accent-primary);
  border: 1px solid rgba(93, 173, 226, 0.35);
}
.search-chip.id {
  background: rgba(243, 156, 18, 0.12);
  color: var(--accent-warning, #f39c12);
  border: 1px solid rgba(243, 156, 18, 0.35);
}
.search-chip-x {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0;
  opacity: 0.5;
  color: inherit;
}
.search-chip-x:hover {
  opacity: 1;
}

/* ── Input ── */
.search-bar input {
  border: none;
  background: none;
  outline: none;
  font-size: 13px;
  color: var(--header-text);
  min-width: 80px;
  flex: 1;
  font-family: inherit;
}
.search-bar input::placeholder {
  color: var(--header-text-muted);
  opacity: 0.6;
}

/* ── Navigation ── */
.search-nav {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
  margin-left: 2px;
}
.nav-btn {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--header-text-muted);
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 6px;
  transition: color 0.15s ease, background 0.15s ease, transform 0.1s ease;
}
.nav-btn:hover {
  color: var(--accent-primary);
  background: var(--accent-primary-hover);
  transform: scale(1.1);
}
.nav-btn:active {
  transform: scale(0.9);
}
.nav-label {
  font-size: 9px;
  color: var(--header-text-muted);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  min-width: 28px;
  text-align: center;
}

/* ── Count / Clear ── */
.search-count {
  font-size: 9px;
  background: var(--accent-primary);
  color: #fff;
  padding: 1px 5px;
  border-radius: 8px;
  font-weight: 600;
  flex-shrink: 0;
}
.search-count.zero {
  background: var(--header-btn-bg);
  color: var(--header-text-muted);
}
.search-clear {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--header-text-muted);
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  flex-shrink: 0;
}
.search-clear:hover {
  color: var(--accent-danger);
}
</style>

<style>
/* ── Suggestions dropdown (global — Teleported) ── */
.search-suggestions {
  background: var(--surface-overlay);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 12px;
  box-shadow: var(--shadow-xl);
  padding: 4px 0;
  overflow: hidden;
  max-width: 420px;
}
.sug-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
  color: var(--surface-overlay-text);
  transition: background 0.1s;
}
.sug-item:hover,
.sug-item.active {
  background: rgba(0, 0, 0, 0.08);
}
:root.dark .sug-item:hover,
:root.dark .sug-item.active,
.dark .sug-item:hover,
.dark .sug-item.active {
  background: rgba(255, 255, 255, 0.08);
}

/* Category tag */
.sug-tag {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  min-width: 38px;
  text-align: center;
}
.sug-tag-prefix {
  background: rgba(93, 173, 226, 0.15);
  color: var(--accent-primary);
}
.sug-tag-operator,
.sug-tag-unit {
  background: rgba(142, 68, 173, 0.15);
  color: #b07cc6;
}
.sug-tag-task {
  background: rgba(46, 204, 113, 0.15);
  color: #2ecc71;
}
.sug-tag-agent {
  background: rgba(243, 156, 18, 0.15);
  color: #f39c12;
}

.sug-label {
  font-weight: 500;
  color: var(--surface-overlay-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sug-item.sug-prefix .sug-label,
.sug-item.sug-operator .sug-label,
.sug-item.sug-unit .sug-label {
  font-weight: 600;
  font-family: 'SF Mono', ui-monospace, monospace;
  color: var(--accent-primary);
}
</style>

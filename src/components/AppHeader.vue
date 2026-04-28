<script setup>
import { inject, nextTick, ref } from 'vue'
import { useTimelineStore } from '../stores/timelineStore'
import SearchBar from './SearchBar.vue'

const store = useTimelineStore()
const importOpen = inject('importOpen')
const settingsOpen = inject('settingsOpen')
const annotationsOpen = inject('annotationsOpen')
const exportOpen = inject('exportOpen')
const distributionOpen = inject('distributionOpen')
const compareOpen = inject('compareOpen')
const controlFlowOpen = inject('controlFlowOpen')

const moreMenuOpen = ref(false)
const analyticsMenuOpen = ref(false)
const hiddenMenuOpen = ref(false)

function closeMoreMenu() { moreMenuOpen.value = false }
function closeAnalyticsMenu() { analyticsMenuOpen.value = false }
function closeHiddenMenu() { hiddenMenuOpen.value = false }

function openPanel(panel) {
  moreMenuOpen.value = false
  analyticsMenuOpen.value = false
  switch (panel) {
    case 'annotations': annotationsOpen.value = true; break
    case 'distribution': distributionOpen.value = true; break
    case 'export': exportOpen.value = true; break
    case 'compare': compareOpen.value = true; break
    case 'controlflow': controlFlowOpen.value = true; break
  }
}

function showTrack(id) {
  store.showTrack(id)
  if (store.hiddenTracks.length === 0) hiddenMenuOpen.value = false
}

function showAllTracks() {
  store.showAllTracks()
  hiddenMenuOpen.value = false
}

function deleteTrack(id) {
  store.showTrack(id)
  store.removeTrack(id)
  if (store.hiddenTracks.length === 0) hiddenMenuOpen.value = false
}


</script>

<template>
  <div class="header">
    <!-- LEFT: branding + import -->
    <div class="header-left">
      <div class="logo-area">
        <svg class="app-logo" viewBox="0 0 24 24" fill="currentColor">
          <rect x="1" y="3" width="15" height="3.5" rx="1.2" opacity="0.9"/>
          <rect x="4" y="8" width="19" height="3.5" rx="1.2" opacity="0.75"/>
          <rect x="1" y="13" width="10" height="3.5" rx="1.2" opacity="0.9"/>
          <rect x="12" y="13" width="8" height="3.5" rx="1.2" opacity="0.65"/>
          <rect x="3" y="18" width="13" height="3.5" rx="1.2" opacity="0.8"/>
        </svg>
        <h1><span class="brand-highlight">RE</span>Trace Studio</h1>
      </div>

      <button class="header-btn ghost" @click="importOpen = true" title="Import folder (I)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon-sm"><path d="M8 3v10M3 8h10"/></svg>
        Import
      </button>

    </div>

    <!-- CENTER: search bar -->
    <div class="header-center">
      <SearchBar />
    </div>

    <!-- RIGHT: analytics + tools + settings -->
    <div class="header-right">
      <!-- Analytics dropdown -->
      <div class="more-menu-wrap" v-if="store.tracks.length > 0">
        <button class="header-btn ghost analytics-trigger" @click="analyticsMenuOpen = !analyticsMenuOpen" title="Analytics">
          <svg viewBox="0 0 16 16" fill="currentColor" class="btn-icon-sm"><path d="M1 11v4h3v-4H1zm5-4v8h3V7H6zm5-5v13h3V2h-3z"/></svg>
          Analytics
          <svg viewBox="0 0 10 6" fill="currentColor" class="chevron-sm"><path d="M1 1l4 4 4-4"/></svg>
        </button>
        <div v-if="analyticsMenuOpen" class="more-backdrop" @click="closeAnalyticsMenu"></div>
        <Transition name="menu-fade">
          <div v-if="analyticsMenuOpen" class="more-dropdown">
            <button class="more-item" @click="openPanel('distribution')">
              <svg viewBox="0 0 20 20" fill="currentColor" class="more-icon"><path d="M2 13v4h2v-4H2zm4-4v8h2V9H6zm4-4v12h2V5h-2zm4 2v10h2V7h-2z"/></svg>
              Duration Distribution
              <span class="more-shortcut">D</span>
            </button>
            <button class="more-item" @click="openPanel('compare')">
              <svg viewBox="0 0 20 20" fill="currentColor" class="more-icon"><path d="M4 4h5v5H4V4zm7 0h5v5h-5V4zM4 11h5v5H4v-5zm7 0h5v5h-5v-5z" opacity="0.7"/><path d="M9 4v12M4 9h12" stroke="currentColor" stroke-width="1" fill="none"/></svg>
              Comparison Studio
              <span class="more-shortcut">R</span>
            </button>
            <button class="more-item" @click="openPanel('controlflow')">
              <svg viewBox="0 0 20 20" fill="currentColor" class="more-icon"><circle cx="4" cy="10" r="2.5"/><circle cx="16" cy="4" r="2.5"/><circle cx="16" cy="16" r="2.5"/><path d="M6.5 9.5L13.5 5M6.5 10.5L13.5 15.5" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
              Control Flow Studio
              <span class="more-shortcut">F</span>
            </button>
          </div>
        </Transition>
      </div>

      <!-- Hidden tracks dropdown (eye icon) -->
      <div class="more-menu-wrap" v-if="store.hiddenTracks.length > 0">
        <button class="icon-btn" @click="hiddenMenuOpen = !hiddenMenuOpen" title="Hidden tracks">
          <svg viewBox="0 0 16 16" fill="currentColor" class="btn-icon"><path d="M13.36 3.05a.5.5 0 01.09.7l-.09.1L11.41 5.8A6.2 6.2 0 0114 8c-1.1 2.8-3.8 4.5-6 4.5a5.6 5.6 0 01-2.58-.63L3.64 13.65a.5.5 0 01-.78-.63l.07-.09L4.7 11.16A6.2 6.2 0 012 8C3.1 5.2 5.8 3.5 8 3.5c.93 0 1.8.22 2.58.63l1.78-1.78a.5.5 0 01.7-.09l.1.09-.1-.09zM8 5.5A2.5 2.5 0 005.5 8c0 .51.15.98.42 1.37l3.45-3.45A2.49 2.49 0 008 5.5zm0 5A2.5 2.5 0 0010.5 8c0-.51-.15-.98-.42-1.37L6.63 10.08c.39.27.86.42 1.37.42z"/></svg>
          <span class="hidden-badge">{{ store.hiddenTracks.length }}</span>
        </button>
        <div v-if="hiddenMenuOpen" class="more-backdrop" @click="closeHiddenMenu"></div>
        <Transition name="menu-fade">
          <div v-if="hiddenMenuOpen" class="more-dropdown">
            <div class="more-section-label">Hidden tracks</div>
            <div
              v-for="ht in store.hiddenTracks"
              :key="ht.id"
              class="more-item-row"
            >
              <button class="more-item" @click="showTrack(ht.id)">
                <svg viewBox="0 0 20 20" fill="currentColor" class="more-icon"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
                {{ ht.title }}
              </button>
              <button class="more-delete-btn" @click="deleteTrack(ht.id)" title="Delete">&times;</button>
            </div>
            <button v-if="store.hiddenTracks.length > 1" class="more-item show-all" @click="showAllTracks">
              Show all tracks
            </button>
          </div>
        </Transition>
      </div>

      <!-- Tools dropdown (grid icon) -->
      <div class="more-menu-wrap">
        <button class="icon-btn" @click="moreMenuOpen = !moreMenuOpen" title="Tools">
          <svg viewBox="0 0 16 16" fill="currentColor" class="btn-icon"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
        </button>
        <div v-if="moreMenuOpen" class="more-backdrop" @click="closeMoreMenu"></div>
        <Transition name="menu-fade">
          <div v-if="moreMenuOpen" class="more-dropdown">
            <button class="more-item" @click="openPanel('annotations')">
              <svg viewBox="0 0 20 20" fill="currentColor" class="more-icon"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/></svg>
              Annotations
            </button>
            <button class="more-item" @click="openPanel('export')">
              <svg viewBox="0 0 20 20" fill="currentColor" class="more-icon"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
              Export
              <span class="more-shortcut">E</span>
            </button>
            <button class="more-item" :class="{ disabled: !store.canUndo }" :disabled="!store.canUndo" @click="store.undo(); moreMenuOpen = false">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" class="more-icon"><path d="M3 7h7a4 4 0 010 8H6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 4L3 7l3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Undo
              <span class="more-shortcut">Ctrl+Z</span>
            </button>

            <template v-if="store.tracks.length > 0">
              <div class="more-divider"></div>
              <button class="more-item danger" @click="store.clearAll(); moreMenuOpen = false">
                <svg viewBox="0 0 20 20" fill="currentColor" class="more-icon"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                Clear all tracks
              </button>
            </template>
          </div>
        </Transition>
      </div>

      <button class="icon-btn" @click="settingsOpen = true" title="Settings (,)">
        <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ═══ Header Container ═══ */
.header {
  background: var(--header-bg);
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 52px;
  z-index: 100;
  border-bottom: 1px solid var(--header-separator);
  position: relative;
}

/* ═══ Three-column layout ═══ */
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  z-index: 1;
}
.header-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  max-width: 480px;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.header-center > * {
  pointer-events: auto;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  z-index: 1;
}

/* ═══ Logo ═══ */
.logo-area {
  display: flex;
  align-items: center;
  gap: 8px;
}
.app-logo {
  width: 20px;
  height: 20px;
  color: var(--accent-primary);
  flex-shrink: 0;
}
.header h1 {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  color: var(--header-text);
  letter-spacing: -0.2px;
}
.brand-highlight {
  color: var(--accent-primary);
  font-weight: 700;
}

/* ═══ Chevron for dropdowns ═══ */
.chevron-sm {
  width: 8px;
  height: 8px;
  opacity: 0.5;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}

/* ═══ Buttons ═══ */
.header-btn {
  padding: 6px 14px;
  border: 1px solid var(--header-btn-border);
  background: var(--header-btn-bg);
  color: var(--header-btn-text);
  border-radius: 10px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.15s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.2s ease;
}
.header-btn:hover {
  background: var(--header-btn-hover);
  transform: translateY(-0.5px);
  box-shadow: var(--shadow-xs);
}
.header-btn:active {
  transform: translateY(0.5px) scale(0.98);
  box-shadow: none;
}
.header-btn.primary {
  background: var(--accent-success);
  border-color: var(--accent-success);
  color: #fff;
  font-weight: 600;
}
.header-btn.primary:hover {
  background: var(--accent-success-hover);
  transform: translateY(-0.5px);
  box-shadow: 0 2px 8px rgba(39, 174, 96, 0.25);
}
.header-btn.ghost {
  background: transparent;
  border-color: transparent;
}
.header-btn.ghost:hover {
  background: var(--header-icon-hover);
}
.header-btn.ghost.danger-ghost {
  color: var(--accent-danger);
}
.btn-icon-sm {
  width: 12px;
  height: 12px;
}

/* ═══ Icon Buttons ═══ */
.icon-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--header-text-muted);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              color 0.15s ease,
              transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.icon-btn:hover {
  background: var(--header-icon-hover);
  color: var(--header-text);
  transform: scale(1.05);
}
.icon-btn:active {
  transform: scale(0.95);
}
.icon-btn.disabled {
  opacity: 0.3;
  cursor: default;
  pointer-events: none;
}
.btn-icon {
  width: 16px;
  height: 16px;
}

/* ═══ More Menu ═══ */
.more-menu-wrap {
  position: relative;
}
.more-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 199;
}
.more-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  background: var(--surface-overlay, var(--card-bg));
  border: 1px solid var(--surface-overlay-border, var(--card-border));
  border-radius: 12px;
  box-shadow: var(--shadow-xl, 0 6px 20px rgba(0,0,0,0.2));
  z-index: 200;
  padding: 4px 0;
  overflow: hidden;
}
.menu-fade-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.menu-fade-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.menu-fade-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.more-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  border: none;
  background: none;
  color: var(--surface-overlay-text, var(--text-primary));
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
  white-space: nowrap;
}
.more-item:hover {
  background: rgba(0,0,0,0.05);
}
:global(.dark) .more-item:hover {
  background: rgba(255,255,255,0.08);
}
.more-item.disabled {
  opacity: 0.3;
  pointer-events: none;
}
.more-item.danger {
  color: var(--accent-danger);
}
.more-item.show-all {
  color: var(--accent-primary);
  font-weight: 600;
}
.more-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.7;
}
.more-shortcut {
  margin-left: auto;
  font-size: 10px;
  color: var(--surface-overlay-text-muted, var(--text-muted));
  opacity: 0.5;
  font-family: 'SF Mono', ui-monospace, monospace;
}
.more-divider {
  height: 1px;
  background: var(--surface-overlay-border, rgba(255,255,255,0.06));
  margin: 4px 0;
}
.more-section-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--surface-overlay-text-muted, var(--text-muted));
  padding: 4px 12px 2px;
}
.more-item-row {
  display: flex;
  align-items: center;
}
.more-item-row .more-item {
  flex: 1;
  min-width: 0;
}
.more-delete-btn {
  border: none;
  background: none;
  color: var(--accent-danger, #ef4444);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 10px;
  opacity: 0.5;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.more-delete-btn:hover {
  opacity: 1;
}

/* ═══ Hidden Tracks Badge ═══ */
.hidden-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--accent-danger);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
</style>

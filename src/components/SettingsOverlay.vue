<script setup>
import { ref, inject } from "vue";
import { useTimelineStore } from "../stores/timelineStore";
import { useTheme } from "../composables/useTheme";

const store = useTimelineStore();
const isOpen = inject("settingsOpen");
const { themeMode, setTheme } = useTheme();

const activeSection = ref("general");

const sectionGroups = [
  {
    label: null,
    items: [{ id: "appearance", label: "Appearance", icon: "palette" }],
  },
  {
    label: "Timeline",
    items: [
      { id: "timeline", label: "Display", icon: "timeline" },
      { id: "features", label: "Features", icon: "features" },
    ],
  },
  {
    label: "Help",
    items: [
      { id: "shortcuts", label: "Shortcuts", icon: "keyboard" },
      { id: "general", label: "About", icon: "info" },
    ],
  },
];
const sections = sectionGroups.flatMap((g) => g.items);

function close() {
  isOpen.value = false;
}
</script>

<template>
  <div class="settings-overlay" :class="{ open: isOpen }" @click.self="close">
    <div class="settings-panel">
      <!-- Sidebar -->
      <nav class="settings-sidebar">
        <div class="sidebar-title">Settings</div>
        <template v-for="(group, gi) in sectionGroups" :key="gi">
          <div v-if="group.label" class="sidebar-section-label">{{ group.label }}</div>
          <button
            v-for="s in group.items"
            :key="s.id"
            class="sidebar-item"
            :class="{ active: activeSection === s.id }"
            @click="activeSection = s.id"
          >
          <svg
            v-if="s.icon === 'info'"
            class="sidebar-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clip-rule="evenodd"
            />
          </svg>
          <svg
            v-else-if="s.icon === 'palette'"
            class="sidebar-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z"
              clip-rule="evenodd"
            />
          </svg>
          <svg
            v-else-if="s.icon === 'timeline'"
            class="sidebar-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              d="M2 4a1 1 0 011-1h2a1 1 0 010 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 010 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h4a1 1 0 010 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 010 2H3a1 1 0 01-1-1zm12-12a1 1 0 011-1h2a1 1 0 010 2h-2a1 1 0 01-1-1zm-4 4a1 1 0 011-1h6a1 1 0 010 2h-6a1 1 0 01-1-1zm2 4a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1zm-6 4a1 1 0 011-1h2a1 1 0 010 2h-2a1 1 0 01-1-1z"
            />
          </svg>
          <svg
            v-else-if="s.icon === 'features'"
            class="sidebar-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
          </svg>
          <svg
            v-else-if="s.icon === 'keyboard'"
            class="sidebar-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm2 0h10v8H5V5zm2 2a1 1 0 011-1h1a1 1 0 110 2H8a1 1 0 01-1-1zm4 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM7 10a1 1 0 100 2h6a1 1 0 100-2H7z"
              clip-rule="evenodd"
            />
          </svg>
          <span>{{ s.label }}</span>
        </button>
        </template>
        <div class="sidebar-spacer"></div>
        <div class="sidebar-brand">
          <div class="sidebar-brand-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect
                x="1"
                y="3"
                width="15"
                height="3.5"
                rx="1.2"
                opacity="0.9"
              />
              <rect
                x="4"
                y="8"
                width="19"
                height="3.5"
                rx="1.2"
                opacity="0.75"
              />
              <rect
                x="1"
                y="13"
                width="10"
                height="3.5"
                rx="1.2"
                opacity="0.9"
              />
              <rect
                x="12"
                y="13"
                width="8"
                height="3.5"
                rx="1.2"
                opacity="0.65"
              />
              <rect
                x="3"
                y="18"
                width="13"
                height="3.5"
                rx="1.2"
                opacity="0.8"
              />
            </svg>
          </div>
          <div class="sidebar-brand-text">
            <div class="sidebar-brand-line sidebar-brand-name">
              <span class="sidebar-brand-accent">RE</span>Trace Studio
            </div>
            <div class="sidebar-brand-line">
              <span class="sidebar-brand-accent">R</span>esource.
              <span class="sidebar-brand-accent">E</span>vent. Trace.
              <!-- <span class="sidebar-brand-accent">R</span>eplay. -->
            </div>
            <div class="sidebar-brand-author">by Björn Koemans</div>
          </div>
        </div>
      </nav>

      <!-- Content -->
      <div class="settings-content">
        <div class="content-header">
          <h2>{{ sections.find((s) => s.id === activeSection)?.label }}</h2>
          <button class="settings-done" @click="close">Done</button>
        </div>
        <div class="content-body">
          <!-- ═══ GENERAL ═══ -->
          <template v-if="activeSection === 'general'">
            <div class="settings-group">
              <div class="settings-group-label">About</div>
              <div class="settings-card about-card">
                <div class="about-header">
                  <div class="about-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <rect
                        x="1"
                        y="3"
                        width="15"
                        height="3.5"
                        rx="1.2"
                        opacity="0.9"
                      />
                      <rect
                        x="4"
                        y="8"
                        width="19"
                        height="3.5"
                        rx="1.2"
                        opacity="0.75"
                      />
                      <rect
                        x="1"
                        y="13"
                        width="10"
                        height="3.5"
                        rx="1.2"
                        opacity="0.9"
                      />
                      <rect
                        x="12"
                        y="13"
                        width="8"
                        height="3.5"
                        rx="1.2"
                        opacity="0.65"
                      />
                      <rect
                        x="3"
                        y="18"
                        width="13"
                        height="3.5"
                        rx="1.2"
                        opacity="0.8"
                      />
                    </svg>
                  </div>
                  <div class="about-title-group">
                    <div class="about-name">
                      <span class="about-accent">RE</span>Trace Studio
                    </div>
                    <div class="about-version">Version 1.0.0</div>
                  </div>
                </div>
                <div class="about-desc">
                  Interactive timeline visualisation for multi-agent
                  reinforcement learning simulations. Explore agent scheduling,
                  task assignments, and process comparison across simulation episodes.
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">Support</div>
              <div class="settings-card">
                <a
                  class="settings-item settings-link"
                  href="https://github.com/bjornkoemans/master-cope/issues?q=label%3Abug"
                  target="_blank"
                  rel="noopener"
                >
                  <div class="settings-item-text">
                    <div class="settings-item-title">Report a Bug</div>
                    <div class="settings-item-subtitle">
                      Open an issue on GitHub
                    </div>
                  </div>
                  <span class="link-arrow">&rsaquo;</span>
                </a>
                <a
                  class="settings-item settings-link"
                  href="https://github.com/bjornkoemans/master-cope/issues?q=label%3Aenhancement"
                  target="_blank"
                  rel="noopener"
                >
                  <div class="settings-item-text">
                    <div class="settings-item-title">Feature Request</div>
                    <div class="settings-item-subtitle">
                      Suggest an improvement
                    </div>
                  </div>
                  <span class="link-arrow">&rsaquo;</span>
                </a>
                <a
                  class="settings-item settings-link"
                  href="https://github.com/bjornkoemans/master-cope"
                  target="_blank"
                  rel="noopener"
                >
                  <div class="settings-item-text">
                    <div class="settings-item-title">Source Code</div>
                    <div class="settings-item-subtitle">
                      View the repository on GitHub
                    </div>
                  </div>
                  <span class="link-arrow">&rsaquo;</span>
                </a>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-card about-footer-card">
                <div class="about-footer">
                  <div class="about-copyright">
                    &copy; {{ new Date().getFullYear() }} Bj&ouml;rn Koemans
                  </div>
                  <div class="about-license">
                    Built with Vue.js &middot; Open Source
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- ═══ APPEARANCE ═══ -->
          <template v-if="activeSection === 'appearance'">
            <div class="settings-group">
              <div class="settings-group-label">Theme</div>
              <div class="settings-card">
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Appearance</div>
                    <div class="settings-item-subtitle">
                      Choose light, dark, or follow system preference
                    </div>
                  </div>
                  <div class="ios-segmented theme-seg">
                    <label>
                      <input
                        type="radio"
                        value="light"
                        :checked="themeMode === 'light'"
                        @change="setTheme('light')"
                      />
                      <span>Light</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        value="auto"
                        :checked="themeMode === 'auto'"
                        @change="setTheme('auto')"
                      />
                      <span>Auto</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        value="dark"
                        :checked="themeMode === 'dark'"
                        @change="setTheme('dark')"
                      />
                      <span>Dark</span>
                    </label>
                  </div>
                </div>
              </div>
              <div class="settings-group-desc">
                Auto mode follows your operating system's preference.
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">Layout</div>
              <div class="settings-card">
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Compact Lanes</div>
                    <div class="settings-item-subtitle">
                      Reduce agent row height for a denser overview
                    </div>
                  </div>
                  <label class="ios-toggle"
                    ><input type="checkbox" v-model="store.compactMode" /><span
                      class="slider"
                    ></span
                  ></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Dim Opacity</div>
                    <div class="settings-item-subtitle">
                      Opacity of unselected cases when isolating
                    </div>
                  </div>
                  <div class="ios-segmented">
                    <label
                      ><input
                        type="radio"
                        :value="0.06"
                        v-model.number="store.dimOpacity"
                      /><span>Hidden</span></label
                    >
                    <label
                      ><input
                        type="radio"
                        :value="0.12"
                        v-model.number="store.dimOpacity"
                      /><span>Faint</span></label
                    >
                    <label
                      ><input
                        type="radio"
                        :value="0.3"
                        v-model.number="store.dimOpacity"
                      /><span>Subtle</span></label
                    >
                  </div>
                </div>
              </div>
              <div class="settings-group-desc">
                Compact lanes use less vertical space per agent. Dim opacity
                controls how visible non-isolated cases are.
              </div>
            </div>
          </template>

          <!-- ═══ TIMELINE ═══ -->
          <template v-if="activeSection === 'timeline'">
            <div class="settings-group">
              <div class="settings-group-label">Display</div>
              <div class="settings-card">
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Waiting Blocks</div>
                    <div class="settings-item-subtitle">
                      Show hatched area between assignment and task start
                    </div>
                  </div>
                  <label class="ios-toggle"
                    ><input type="checkbox" v-model="store.showWait" /><span
                      class="slider"
                    ></span
                  ></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Assignment Markers</div>
                    <div class="settings-item-subtitle">
                      Show symbols at the moment a task is assigned
                    </div>
                  </div>
                  <label class="ios-toggle"
                    ><input type="checkbox" v-model="store.showAssign" /><span
                      class="slider"
                    ></span
                  ></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Task Labels</div>
                    <div class="settings-item-subtitle">
                      Show case and task ID inside task blocks (e.g. C0.T3)
                    </div>
                  </div>
                  <label class="ios-toggle"
                    ><input type="checkbox" v-model="store.showLabels" /><span
                      class="slider"
                    ></span
                  ></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Collaboration Borders</div>
                    <div class="settings-item-subtitle">
                      Dashed border on tasks that require multiple agents
                    </div>
                  </div>
                  <label class="ios-toggle"
                    ><input
                      type="checkbox"
                      v-model="store.showCollabBorder" /><span
                      class="slider"
                    ></span
                  ></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Case Legend</div>
                    <div class="settings-item-subtitle">
                      Show colour swatches for each case above the timeline
                    </div>
                  </div>
                  <label class="ios-toggle"
                    ><input type="checkbox" v-model="store.showLegend" /><span
                      class="slider"
                    ></span
                  ></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Marker Legend</div>
                    <div class="settings-item-subtitle">
                      Show assignment marker shapes and their meanings
                    </div>
                  </div>
                  <label class="ios-toggle"
                    ><input type="checkbox" v-model="store.showMarkerLegend" /><span
                      class="slider"
                    ></span
                  ></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Zero-Duration Tasks</div>
                    <div class="settings-item-subtitle">
                      Show tasks that complete instantly (e.g. automated system
                      tasks)
                    </div>
                  </div>
                  <label class="ios-toggle"
                    ><input
                      type="checkbox"
                      v-model="store.showZeroDuration" /><span
                      class="slider"
                    ></span
                  ></label>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">Volunteer Information</div>
              <div class="settings-card">
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Show in Tooltip</div>
                    <div class="settings-item-subtitle">
                      Display which agents volunteered when hovering a task
                    </div>
                  </div>
                  <label class="ios-toggle"
                    ><input
                      type="checkbox"
                      v-model="store.showVolunteers" /><span
                      class="slider"
                    ></span
                  ></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Display Format</div>
                  </div>
                  <div class="ios-segmented">
                    <label
                      ><input
                        type="radio"
                        value="names"
                        v-model="store.volFormat"
                      /><span>Names</span></label
                    >
                    <label
                      ><input
                        type="radio"
                        value="ids"
                        v-model="store.volFormat"
                      /><span>IDs</span></label
                    >
                  </div>
                </div>
              </div>
              <div class="settings-group-desc">
                Names show agent roles (e.g. Technician-000001). IDs show
                numeric identifiers.
              </div>
            </div>
          </template>

          <!-- ═══ FEATURES ═══ -->
          <template v-if="activeSection === 'features'">
            <div class="settings-group">
              <div class="settings-group-label">Heatmap Overview</div>
              <div class="settings-card">
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Row Height</div>
                    <div class="settings-item-subtitle">Pixels per agent row in heatmap mode</div>
                  </div>
                  <div class="ios-segmented">
                    <label><input type="radio" :value="4" v-model.number="store.overviewRowHeight" /><span>4px</span></label>
                    <label><input type="radio" :value="6" v-model.number="store.overviewRowHeight" /><span>6px</span></label>
                    <label><input type="radio" :value="8" v-model.number="store.overviewRowHeight" /><span>8px</span></label>
                    <label><input type="radio" :value="12" v-model.number="store.overviewRowHeight" /><span>12px</span></label>
                  </div>
                </div>
              </div>
              <div class="settings-group-desc">Heatmap overview compresses all agent lanes into a dense canvas view. Toggle per track with the Overview button in the track header.</div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">Search &amp; Filter</div>
              <div class="settings-card">
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Filter Mode</div>
                    <div class="settings-item-subtitle">How non-matching tasks appear when searching</div>
                  </div>
                  <div class="ios-segmented">
                    <label><input type="radio" value="dim" v-model="store.filterMode" /><span>Dim</span></label>
                    <label><input type="radio" value="hide" v-model="store.filterMode" /><span>Hide</span></label>
                  </div>
                </div>
              </div>
              <div class="settings-group-desc">Search with patterns like C0.T8, C0, or agent name substrings. Use <kbd>/</kbd> to focus the search bar.</div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">Annotations</div>
              <div class="settings-card">
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Show Markers</div>
                    <div class="settings-item-subtitle">Display annotation markers on the timeline</div>
                  </div>
                  <label class="ios-toggle"><input type="checkbox" v-model="store.showAnnotations" /><span class="slider"></span></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Marker Color</div>
                    <div class="settings-item-subtitle">Default color for new annotations</div>
                  </div>
                  <div class="ios-segmented">
                    <label><input type="radio" value="warning" v-model="store.annotationColor" /><span>Yellow</span></label>
                    <label><input type="radio" value="primary" v-model="store.annotationColor" /><span>Blue</span></label>
                    <label><input type="radio" value="danger" v-model="store.annotationColor" /><span>Red</span></label>
                  </div>
                </div>
              </div>
              <div class="settings-group-desc">Double-click the time axis to add an annotation. Press <kbd>B</kbd> to bookmark the current playhead position.</div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">Tooltips</div>
              <div class="settings-card">
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Predecessor / Successor</div>
                    <div class="settings-item-subtitle">Show previous and next tasks in the same case</div>
                  </div>
                  <label class="ios-toggle"><input type="checkbox" v-model="store.showPredecessors" /><span class="slider"></span></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Concurrent Agents</div>
                    <div class="settings-item-subtitle">Show other agents working on the same case simultaneously</div>
                  </div>
                  <label class="ios-toggle"><input type="checkbox" v-model="store.showConcurrentAgents" /><span class="slider"></span></label>
                </div>
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Mini Timeline</div>
                    <div class="settings-item-subtitle">Show a compact overview of all tasks in the case</div>
                  </div>
                  <label class="ios-toggle"><input type="checkbox" v-model="store.showMiniTimeline" /><span class="slider"></span></label>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">Navigation</div>
              <div class="settings-card">
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Keyboard Navigation</div>
                    <div class="settings-item-subtitle">Use Tab and arrow keys to navigate between tasks</div>
                  </div>
                  <label class="ios-toggle"><input type="checkbox" v-model="store.enableKeyboardNav" /><span class="slider"></span></label>
                </div>
              </div>
              <div class="settings-group-desc">Ctrl+click a task to select it. Then use Tab/Shift+Tab to navigate tasks and Up/Down to switch agents.</div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">Agent Sorting</div>
              <div class="settings-card">
                <div class="settings-item">
                  <div class="settings-item-text">
                    <div class="settings-item-title">Default Sort</div>
                    <div class="settings-item-subtitle">Default ordering for agent lanes in new tracks</div>
                  </div>
                  <div class="ios-segmented">
                    <label><input type="radio" value="name" v-model="store.defaultAgentSort" /><span>A-Z</span></label>
                    <label><input type="radio" value="utilization" v-model="store.defaultAgentSort" /><span>Util</span></label>
                    <label><input type="radio" value="workTime" v-model="store.defaultAgentSort" /><span>Work</span></label>
                    <label><input type="radio" value="tasks" v-model="store.defaultAgentSort" /><span>Tasks</span></label>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- ═══ SHORTCUTS ═══ -->
          <template v-if="activeSection === 'shortcuts'">
            <div class="settings-group">
              <div class="settings-group-label">Playback</div>
              <div class="settings-card shortcuts-card">
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>Space</kbd></div>
                  <span>Play / Pause</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys">
                    <kbd>&larr;</kbd> <kbd>&rarr;</kbd>
                  </div>
                  <span>Scrub &plusmn;10s</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys">
                    <kbd>Shift</kbd>+<kbd>&larr;</kbd> <kbd>&rarr;</kbd>
                  </div>
                  <span>Scrub &plusmn;60s</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys">
                    <kbd>Home</kbd> / <kbd>End</kbd>
                  </div>
                  <span>Jump to start / end</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>1</kbd>-<kbd>6</kbd></div>
                  <span>Speed presets</span>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">View</div>
              <div class="settings-card shortcuts-card">
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>+</kbd> / <kbd>-</kbd></div>
                  <span>Zoom in / out</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>C</kbd></div>
                  <span>Clear case isolation</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>R</kbd></div>
                  <span>Toggle Timeline / Compare</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>S</kbd></div>
                  <span>Toggle statistics</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>/</kbd></div>
                  <span>Focus search bar</span>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">Navigation</div>
              <div class="settings-card shortcuts-card">
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>Ctrl</kbd>+click</div>
                  <span>Select task for navigation</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd></div>
                  <span>Next / previous task</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>&uarr;</kbd> <kbd>&darr;</kbd></div>
                  <span>Switch agent (when task selected)</span>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group-label">General</div>
              <div class="settings-card shortcuts-card">
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>I</kbd></div>
                  <span>Open import</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>E</kbd></div>
                  <span>Open export</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>B</kbd></div>
                  <span>Bookmark playhead position</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>,</kbd></div>
                  <span>Open settings</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>Z</kbd></div>
                  <span>Undo track removal</span>
                </div>
                <div class="shortcut-row">
                  <div class="shortcut-keys"><kbd>Esc</kbd></div>
                  <span>Close / clear isolation</span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Overlay ── */
.settings-overlay {
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
.settings-overlay.open {
  display: flex;
}

/* ── Panel (sidebar + content) ── */
.settings-panel {
  background: var(--surface-overlay);
  border-radius: 12px;
  box-shadow: var(--shadow-xl);
  width: 720px;
  height: 920px;
  max-height: 85vh;
  display: flex;
  overflow: hidden;
}

/* ── Sidebar ── */
.settings-sidebar {
  width: 200px;
  min-width: 160px;
  background: var(--surface-overlay-card);
  border-right: 1px solid var(--surface-overlay-border);
  padding: 16px 0px 0px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sidebar-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--surface-overlay-text-muted);
  padding: 0 16px 12px;
}
.sidebar-section-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--surface-overlay-text-muted);
  padding: 12px 16px 4px;
  opacity: 0.7;
}
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin: 0 8px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--surface-overlay-text-muted);
  cursor: pointer;
  text-align: left;
  width: calc(100% - 16px);
  transition:
    background 0.15s,
    color 0.15s;
}
.sidebar-item:hover {
  background: var(--surface-overlay-border);
  color: var(--surface-overlay-text);
}
.sidebar-item.active {
  background: var(--surface-overlay);
  color: var(--accent-primary);
  font-weight: 600;
}
.sidebar-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.7;
}
.sidebar-item.active .sidebar-icon {
  opacity: 1;
}
.sidebar-spacer {
  flex: 1;
}
.sidebar-brand {
  padding: 14px 16px;
  border-top: 1px solid var(--surface-overlay-border);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.sidebar-brand-icon {
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  background: linear-gradient(135deg, var(--accent-primary), #8b5cf6);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sidebar-brand-icon svg {
  width: 18px;
  height: 18px;
  color: #fff;
}
.sidebar-brand-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  font-size: 9px;
  font-weight: 500;
  color: var(--surface-overlay-text-muted);
  line-height: 1.4;
  letter-spacing: 0.3px;
}
.sidebar-brand-accent {
  color: var(--accent-primary);
  font-weight: 700;
}
.sidebar-brand-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--surface-overlay-text);
  margin-top: 1px;
  letter-spacing: -0.2px;
}
.sidebar-brand-author {
  font-size: 8px;
  color: var(--text-tertiary);
  opacity: 0.6;
  font-weight: 300;
  margin-top: 3px;
  letter-spacing: 0.2px;
}
.about-accent {
  color: var(--accent-primary);
}

/* ── Content Area ── */
.settings-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--surface-overlay-border);
  flex-shrink: 0;
}
.content-header h2 {
  font-size: 15px;
  font-weight: 700;
  color: var(--surface-overlay-text);
  letter-spacing: -0.2px;
}
.settings-done {
  background: none;
  border: none;
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
}
.settings-done:hover {
  background: var(--accent-primary-hover);
}
.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 16px;
}

/* ── Groups & Cards (shared across sections) ── */
.settings-group {
  margin: 0;
  padding: 0 18px 12px;
}
.settings-group-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--surface-overlay-text-muted);
  padding: 10px 0 4px;
}
.settings-group-desc {
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
  padding: 4px 0 0;
  line-height: 1.4;
}
.settings-card {
  background: var(--surface-overlay-card);
  border-radius: 8px;
  overflow: hidden;
}
.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  min-height: 38px;
}
.settings-item + .settings-item {
  border-top: 1px solid var(--surface-overlay-border);
}
.settings-item-text {
  flex: 1;
  min-width: 0;
}
.settings-item-title {
  font-size: 12px;
  color: var(--surface-overlay-text);
  line-height: 1.3;
}
.settings-item-subtitle {
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
  line-height: 1.3;
  margin-top: 2px;
}

/* ── About Card ── */
.about-card {
  padding: 16px;
}
.about-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.about-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--accent-primary), #8b5cf6);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.about-icon svg {
  width: 22px;
  height: 22px;
  color: #fff;
}
.about-title-group {
  flex: 1;
}
.about-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--surface-overlay-text);
  line-height: 1.2;
}
.about-version {
  font-size: 11px;
  color: var(--surface-overlay-text-muted);
  margin-top: 2px;
}
.about-desc {
  font-size: 11px;
  color: var(--surface-overlay-text-muted);
  line-height: 1.5;
}

/* ── Support Links ── */
.settings-link {
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s;
}
.settings-link:hover {
  background: var(--surface-overlay-card);
}
.link-arrow {
  font-size: 18px;
  color: var(--surface-overlay-text-muted);
  flex-shrink: 0;
  margin-left: 8px;
  line-height: 1;
}

/* ── About Footer ── */
.about-footer-card {
  padding: 14px 16px;
}
.about-footer {
  text-align: center;
}
.about-copyright {
  font-size: 11px;
  color: var(--surface-overlay-text-muted);
  font-weight: 600;
}
.about-license {
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
  margin-top: 3px;
  opacity: 0.7;
}

/* ── Toggle Switch ── */
.ios-toggle {
  position: relative;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  margin-left: 10px;
}
.ios-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.ios-toggle .slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--toggle-off-bg);
  border-radius: 20px;
  transition: background 0.25s;
}
.ios-toggle .slider::before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  bottom: 2px;
  background: var(--toggle-knob);
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform 0.25s;
}
.ios-toggle input:checked + .slider {
  background: var(--toggle-on-bg);
}
.ios-toggle input:checked + .slider::before {
  transform: translateX(16px);
}

/* ── Segmented Control ── */
.ios-segmented {
  display: flex;
  background: var(--segmented-bg);
  border-radius: 5px;
  padding: 2px;
  flex-shrink: 0;
  margin-left: 10px;
}
.ios-segmented label {
  flex: 1;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--segmented-text);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.ios-segmented input {
  display: none;
}
.ios-segmented input:checked + span {
  background: var(--segmented-active-bg);
  border-radius: 4px;
  display: block;
  padding: 3px 10px;
  font-weight: 600;
  color: var(--segmented-active-text);
}
.ios-segmented label span {
  display: block;
  padding: 3px 10px;
  border-radius: 4px;
}
.theme-seg {
  min-width: 160px;
}

/* ── Keyboard Shortcuts ── */
.shortcuts-card {
  padding: 6px 12px;
}
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 11px;
  color: var(--surface-overlay-text);
}
.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 2px;
}
.shortcut-row span {
  color: var(--surface-overlay-text-muted);
  font-size: 10px;
}
.shortcut-row kbd {
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-family: "SF Mono", ui-monospace, monospace;
  background: var(--surface-overlay-card);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 4px;
  color: var(--surface-overlay-text);
  margin: 0 1px;
  min-width: 20px;
  text-align: center;
  line-height: 1.3;
}
</style>

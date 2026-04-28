<script setup>
import { ref, reactive, computed, watch, onMounted, inject } from "vue";
import { useTimelineStore } from "../stores/timelineStore";
import { useProcessMap } from "../composables/useProcessMap";
import { useResourceAnalytics } from "../composables/useResourceAnalytics";
import { fmtDur, fmtPct } from "../utils/formatStats";

const store = useTimelineStore();
const controlFlowOpen = inject("controlFlowOpen");
function close() {
  controlFlowOpen.value = false;
}

// ── Track selection ──
const trackId = ref(null);
function initTrack() {
  if (
    store.tracks.length &&
    (!trackId.value || !store.tracks.some((t) => t.id === trackId.value))
  )
    trackId.value = store.tracks[0].id;
}
onMounted(initTrack);
watch(() => store.tracks.length, initTrack);

const track = computed(
  () => store.tracks.find((t) => t.id === trackId.value) || null
);

// ── View mode ──
const viewMode = ref("frequency");
const viewModes = [
  { id: "frequency", label: "Frequency", icon: "#" },
  { id: "performance", label: "Performance", icon: "⏱" },
  { id: "resource", label: "Resource", icon: "☺" },
];

// ── Notation mode ──
const notation = ref("default");
const showLanes = ref(false);

// ── Export ──
const exportStyle = ref("default");
const exportMenuOpen = ref(false);
function doExport(style) {
  exportStyle.value = style;
  exportMenuOpen.value = false;
  downloadPng();
}
function closeExportMenu(e) {
  if (exportMenuOpen.value && !e.target.closest(".cf-export-wrap"))
    exportMenuOpen.value = false;
}

// ── Filters ──
const spotlightAgents = ref(null);
const minFreqPct = ref(0);
const activityPct = ref(100);

function toggleSpotlight(agent) {
  if (!spotlightAgents.value) spotlightAgents.value = new Set();
  if (spotlightAgents.value.has(agent)) spotlightAgents.value.delete(agent);
  else spotlightAgents.value.add(agent);
  if (spotlightAgents.value.size === 0) spotlightAgents.value = null;
  else spotlightAgents.value = new Set(spotlightAgents.value);
}
function clearSpotlight() {
  spotlightAgents.value = null;
}

const spotlightMode = ref("roles");

function toggleRole(role) {
  if (!graph.value) return;
  const agents = graph.value.roleMap.get(role);
  if (!agents) return;
  if (!spotlightAgents.value) spotlightAgents.value = new Set();
  const allSelected = agents.every((a) => spotlightAgents.value.has(a));
  if (allSelected) {
    for (const a of agents) spotlightAgents.value.delete(a);
  } else {
    for (const a of agents) spotlightAgents.value.add(a);
  }
  if (spotlightAgents.value.size === 0) spotlightAgents.value = null;
  else spotlightAgents.value = new Set(spotlightAgents.value);
}

function isRoleSelected(role) {
  if (!spotlightAgents.value || !graph.value) return false;
  const agents = graph.value.roleMap.get(role);
  return agents && agents.some((a) => spotlightAgents.value.has(a));
}

function isRoleFullySelected(role) {
  if (!spotlightAgents.value || !graph.value) return false;
  const agents = graph.value.roleMap.get(role);
  return agents && agents.every((a) => spotlightAgents.value.has(a));
}

// ── Resource insight toggles ──
const showBottlenecks = ref(false);
const showSingleResource = ref(false);
const showHandoffHotspots = ref(false);
const minResources = ref(1);
const handoffPanelOpen = ref(true);
const highlightedHandoff = ref(null);

const resourceInsightsActive = computed(
  () => showBottlenecks.value || showSingleResource.value || showHandoffHotspots.value || minResources.value > 1
);

// ── Process map ──
const graph = useProcessMap(track, {
  viewMode,
  spotlightAgents,
  minFreqPct,
  activityPct,
  notation,
  showLanes,
});

// ── Resource computed data ──
const bottleneckCount = computed(() => {
  if (!graph.value) return 0;
  return graph.value.nodes.filter((n) => n.isBottleneck).length;
});
const singleResCount = computed(() => {
  if (!graph.value) return 0;
  return graph.value.nodes.filter((n) => n.isSingleResource).length;
});
const topHandoffs = computed(() => {
  if (!graph.value) return [];
  const pairs = new Map();
  for (const e of graph.value.edges) {
    if (!e.topHandoffs) continue;
    for (const [pair, count] of e.topHandoffs) {
      pairs.set(pair, (pairs.get(pair) || 0) + count);
    }
  }
  const totalTransitions = graph.value.edges.reduce((s, e) => s + e.freq, 0);
  return [...pairs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([pair, count]) => ({
      pair,
      count,
      pct: totalTransitions > 0 ? ((count / totalTransitions) * 100).toFixed(1) : "0",
    }));
});

function selectHandoff(pair) {
  highlightedHandoff.value = highlightedHandoff.value === pair ? null : pair;
}

function resAgentBadgeColor(count) {
  if (count === 1) return "#ef4444";
  if (count <= 2) return "#f97316";
  if (count <= 3) return "#eab308";
  return "#22c55e";
}

// BPMN connection coloring for resource/handoff modes
function bpmnConnStroke(conn) {
  if (!showHandoffHotspots.value && viewMode.value !== "resource") {
    return conn.mainFlow ? "var(--accent-primary)" : "var(--text-muted)";
  }
  // Look up the original edge data
  if (!graph.value || !conn.from || !conn.to) {
    return conn.mainFlow ? "var(--accent-primary)" : "var(--text-muted)";
  }
  // Find matching edge by source/target activity names
  const fromEl = graph.value.bpmn?.elements?.find(e => e.id === conn.from);
  const toEl = graph.value.bpmn?.elements?.find(e => e.id === conn.to);
  if (!fromEl?.node || !toEl?.node) {
    return conn.mainFlow ? "var(--accent-primary)" : "var(--text-muted)";
  }
  const edge = graph.value.edges.find(
    (ed) => ed.source === fromEl.node.id && ed.target === toEl.node.id
  );
  if (!edge) return conn.mainFlow ? "var(--accent-primary)" : "var(--text-muted)";
  const hr = edge.handoffRate;
  if (hr < 0.2) return "#22c55e";
  if (hr < 0.5) return "#eab308";
  if (hr < 0.75) return "#f97316";
  return "#ef4444";
}

// ── Resource Analytics ──
const resAnalytics = useResourceAnalytics(track);
const snType = ref("handover");
const socialNetwork = computed(() => {
  if (!resAnalytics.value) return null;
  return resAnalytics.value.buildSocialNetwork(snType.value);
});
const snColorMode = ref("role"); // role | utilization | centrality
const matrixColorMode = ref("frequency"); // frequency | duration | wait
const kpiSortKey = ref("taskCount");
const kpiSortDir = ref("desc");
const selectedProfile = ref(null);
const sortedKpis = computed(() => {
  if (!resAnalytics.value) return [];
  const arr = [...resAnalytics.value.kpis];
  const key = kpiSortKey.value;
  const dir = kpiSortDir.value === "desc" ? -1 : 1;
  arr.sort((a, b) => (a[key] - b[key]) * dir);
  return arr;
});
function toggleKpiSort(key) {
  if (kpiSortKey.value === key) kpiSortDir.value = kpiSortDir.value === "desc" ? "asc" : "desc";
  else { kpiSortKey.value = key; kpiSortDir.value = "desc"; }
}
function matrixCellColor(agent, activity) {
  if (!resAnalytics.value) return "transparent";
  const key = `${agent}\x00${activity}`;
  const c = resAnalytics.value.matrix.cells.get(key);
  if (!c) return "transparent";
  const mode = matrixColorMode.value;
  let t;
  if (mode === "frequency") t = c.count / (resAnalytics.value.matrix.maxCount || 1);
  else if (mode === "duration") t = c.avgDur / (resAnalytics.value.matrix.maxDur || 1);
  else t = c.avgWait / (resAnalytics.value.matrix.maxWait || 1);
  // Green → Yellow → Red
  if (mode === "frequency") return `rgba(99, 102, 241, ${0.15 + t * 0.75})`;
  if (t < 0.33) return `rgba(34, 197, 94, ${0.3 + t * 1.5})`;
  if (t < 0.66) return `rgba(234, 179, 8, ${0.3 + (t - 0.33) * 1.5})`;
  return `rgba(239, 68, 68, ${0.3 + (t - 0.66) * 1.5})`;
}
function matrixCellVal(agent, activity) {
  if (!resAnalytics.value) return "";
  const key = `${agent}\x00${activity}`;
  const c = resAnalytics.value.matrix.cells.get(key);
  if (!c) return "";
  if (matrixColorMode.value === "frequency") return c.count;
  if (matrixColorMode.value === "duration") return fmtDur(c.avgDur);
  return fmtDur(c.avgWait);
}
function snNodeColor(node) {
  if (snColorMode.value === "role") return node.color;
  if (snColorMode.value === "utilization") {
    const u = node.utilization;
    if (u < 0.3) return "#22c55e";
    if (u < 0.6) return "#eab308";
    if (u < 0.8) return "#f97316";
    return "#ef4444";
  }
  // centrality
  if (!socialNetwork.value) return node.color;
  const t = node.weightedDeg / (socialNetwork.value.maxWeightedDeg || 1);
  if (t < 0.25) return "#94a3b8";
  if (t < 0.5) return "#6366f1";
  if (t < 0.75) return "#a855f7";
  return "#ef4444";
}
const snTip = reactive({ show: false, x: 0, y: 0, node: null, edge: null });
function showSnNodeTip(e, node) {
  snTip.node = node; snTip.edge = null;
  snTip.x = e.clientX + 14; snTip.y = e.clientY - 10; snTip.show = true;
}
function showSnEdgeTip(e, edge) {
  snTip.edge = edge; snTip.node = null;
  snTip.x = e.clientX + 14; snTip.y = e.clientY - 10; snTip.show = true;
}
function moveSnTip(e) { snTip.x = e.clientX + 14; snTip.y = e.clientY - 10; }
function hideSnTip() { snTip.show = false; }

// ── Section nav ──
const activeSection = ref("map");
const sections = [
  { id: "map", label: "Process Map", icon: "M" },
  { id: "variants", label: "Variants", icon: "V" },
  { id: "stats", label: "Statistics", icon: "S" },
  { id: "social", label: "Social Network", icon: "N" },
  { id: "matrix", label: "Resource Matrix", icon: "R" },
  { id: "kpis", label: "Resource KPIs", icon: "K" },
];

// ── SVG pan & zoom ──
const pan = reactive({ x: 0, y: 0 });
const zoom = ref(1);
const isPanning = ref(false);
const panStart = reactive({ x: 0, y: 0, px: 0, py: 0 });

function onMouseDown(e) {
  if (e.button !== 0) return;
  isPanning.value = true;
  panStart.x = e.clientX;
  panStart.y = e.clientY;
  panStart.px = pan.x;
  panStart.py = pan.y;
}
function onMouseMove(e) {
  if (!isPanning.value) return;
  pan.x = panStart.px + (e.clientX - panStart.x);
  pan.y = panStart.py + (e.clientY - panStart.y);
}
function onMouseUp() {
  isPanning.value = false;
}
function onWheel(e) {
  const delta = e.deltaY * -0.001;
  zoom.value = Math.max(0.15, Math.min(3, zoom.value + delta));
}
function zoomIn() {
  zoom.value = Math.min(3, zoom.value + 0.15);
}
function zoomOut() {
  zoom.value = Math.max(0.15, zoom.value - 0.15);
}
function resetView() {
  pan.x = 0;
  pan.y = 0;
  zoom.value = 1;
}

watch(trackId, resetView);

// ── Threshold adjusters ──
function adjActivity(delta) {
  activityPct.value = Math.max(
    0,
    Math.min(100, +(activityPct.value + delta).toFixed(1))
  );
}
function adjPath(delta) {
  minFreqPct.value = Math.max(
    0,
    Math.min(100, +(minFreqPct.value + delta).toFixed(1))
  );
}

// ── Tooltip ──
const tip = reactive({ show: false, x: 0, y: 0, title: "", rows: [] });
function showNodeTip(e, node) {
  const g = graph.value;
  tip.title = node.label;
  tip.rows = [
    {
      l: "Frequency",
      v: `${node.freq.toLocaleString()} (${((node.freq / g.totalCases) * 100).toFixed(1)}% of cases)`,
    },
    { l: "Avg Duration", v: fmtDur(node.avgDuration) },
    { l: "Med Duration", v: fmtDur(node.medDuration) },
    ...(node.avgWait > 0 ? [{ l: "Avg Wait", v: fmtDur(node.avgWait) }] : []),
    { sep: true },
    {
      l: "Resources",
      v: `${node.totalAgents} agent${node.totalAgents !== 1 ? "s" : ""}`,
    },
    ...node.topAgents.map(([a, c]) => ({
      l: a,
      v: `${c} (${((c / node.freq) * 100).toFixed(0)}%)`,
      agent: true,
      color: g.agentColorMap.get(a) || "#94a3b8",
    })),
  ];
  tip.x = e.clientX + 14;
  tip.y = e.clientY - 10;
  tip.show = true;
}
function showEdgeTip(e, edge) {
  tip.title = `${edge.source} → ${edge.target}`;
  tip.rows = [
    { l: "Frequency", v: edge.freq.toLocaleString() },
    { l: "Avg Wait", v: fmtDur(edge.avgWait) },
    { l: "Handoff Rate", v: fmtPct(edge.handoffRate * 100) },
    ...(edge.topHandoffs?.length
      ? [
          {
            l: "Top Handoff",
            v: edge.topHandoffs[0][0] + ` (${edge.topHandoffs[0][1]})`,
          },
        ]
      : []),
  ];
  tip.x = e.clientX + 14;
  tip.y = e.clientY - 10;
  tip.show = true;
}
function moveTip(e) {
  tip.x = e.clientX + 14;
  tip.y = e.clientY - 10;
}
function hideTip() {
  tip.show = false;
}

// ── Selected node ──
const selectedNode = ref(null);
function selectNode(node) {
  selectedNode.value = selectedNode.value?.id === node.id ? null : node;
}

// ── Color helpers (use app accent) ──
function nodeColor(node) {
  if (!graph.value) return "var(--accent-primary)";
  const g = graph.value;
  const mode = viewMode.value;

  if (mode === "frequency") {
    // Interpolate from light accent to dark accent
    const t = node.freq / g.maxNodeFreq;
    return `color-mix(in srgb, var(--accent-primary) ${40 + t * 60}%, #1a3040 ${t * 40}%)`;
  }
  if (mode === "performance") {
    const t = Math.min(node.avgDuration / g.maxDuration, 1);
    if (t < 0.33) return "#22c55e";
    if (t < 0.66) return "#f59e0b";
    return "#ef4444";
  }
  const count = node.totalAgents;
  if (count === 1) return "#ef4444";
  if (count <= 2) return "#f97316";
  if (count <= 3) return "#eab308";
  return "#22c55e";
}

function nodeOpacity(node) {
  if (!graph.value) return 1;
  if (graph.value.spotlightNodeIds && !graph.value.spotlightNodeIds.has(node.id)) return 0.18;
  if (minResources.value > 1 && node.totalAgents < minResources.value) return 0.2;
  return 1;
}

function edgeOpacity(edge) {
  if (!graph.value) return 0.65;
  if (graph.value.spotlightEdgeIds) return graph.value.spotlightEdgeIds.has(edge.id) ? 0.75 : 0.1;
  if (highlightedHandoff.value) {
    const hasHandoff = edge.topHandoffs?.some(([p]) => p === highlightedHandoff.value);
    return hasHandoff ? 0.9 : 0.12;
  }
  return 0.65;
}

function edgeWidth(edge) {
  if (!graph.value) return 1.5;
  if (showHandoffHotspots.value) {
    return 1.2 + edge.handoffRate * 3.5;
  }
  const t = edge.freq / graph.value.maxEdgeFreq;
  return 1 + t * 3;
}

function edgeColor(edge) {
  const mode = viewMode.value;
  if (showHandoffHotspots.value) {
    const hr = edge.handoffRate;
    if (hr < 0.2) return "#22c55e";
    if (hr < 0.5) return "#eab308";
    if (hr < 0.75) return "#f97316";
    return "#ef4444";
  }
  if (mode === "performance") {
    if (!graph.value) return "var(--accent-primary)";
    const maxWait = Math.max(...graph.value.edges.map((e) => e.avgWait), 1);
    const t = Math.min(edge.avgWait / maxWait, 1);
    if (t < 0.3) return "#22c55e";
    if (t < 0.6) return "#eab308";
    return "#ef4444";
  }
  if (mode === "resource") {
    const hr = edge.handoffRate;
    if (hr < 0.3) return "#22c55e";
    if (hr < 0.6) return "#f97316";
    return "#ef4444";
  }
  return "var(--accent-primary)";
}

function edgeDash(edge) {
  if (edge.isBackEdge) return "6,4";
  if (edge.isSelfLoop) return "none";
  if (!graph.value) return "none";
  const t = edge.freq / graph.value.maxEdgeFreq;
  return t < 0.15 ? "5,3" : "none";
}

function trunc(s, max = 22) {
  return s && s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ── Stats ──
const statsData = computed(() => {
  if (!graph.value) return null;
  const g = graph.value;
  const nodes = g.nodes;
  const edges = g.edges;

  const topAct = [...nodes].sort((a, b) => b.freq - a.freq)[0];
  const slowest = [...nodes].sort((a, b) => b.avgDuration - a.avgDuration)[0];
  const highWait = [...nodes]
    .filter((n) => n.avgWait > 0)
    .sort((a, b) => b.avgWait - a.avgWait)[0];
  const highHandoff = [...edges].sort(
    (a, b) => b.handoffRate - a.handoffRate
  )[0];
  const singleRes = nodes.filter((n) => n.isSingleResource);

  return {
    totalCases: g.totalCases,
    totalActivities: g.totalActivities,
    totalTransitions: g.totalTransitions,
    variants: g.variants.length,
    topAct,
    slowest,
    highWait,
    highHandoff,
    singleRes,
  };
});

function resBarSegments(node) {
  if (!graph.value) return [];
  const cm = graph.value.agentColorMap;
  const total = node.freq;
  let x = 0;
  return node.topAgents.map(([agent, count]) => {
    const w = (count / total) * 100;
    const seg = { agent, w, x, color: cm.get(agent) || "#94a3b8" };
    x += w;
    return seg;
  });
}

// ── PNG Export ──
const exporting = ref(false);
async function downloadPng() {
  exporting.value = true;
  try {
    // For BPMN: serialize the SVG directly, for default: capture the SVG canvas
    const isBpmn = graph.value && graph.value.bpmn;
    let svgEl;
    if (isBpmn) {
      svgEl = document.querySelector(".bpmn-svg");
    } else {
      svgEl = document.querySelector(".cf-svg");
    }
    if (!svgEl) return;

    // Clone SVG and inline computed styles
    const clone = svgEl.cloneNode(true);
    const ns = "http://www.w3.org/2000/svg";

    const isSci = exportStyle.value === "scientific";

    // Get computed CSS custom property values and inline them
    const cs = getComputedStyle(document.documentElement);
    let bg,
      textPrimary,
      textMuted,
      accent,
      surfaceCard,
      surfaceBorder,
      accentDanger,
      surfaceOverlay,
      surfaceText,
      surfaceTextMuted;

    if (isSci) {
      // Scientific / paper style: monochrome
      bg = "#ffffff";
      textPrimary = "#333333";
      textMuted = "#888888";
      accent = "#333333";
      surfaceCard = "#f0f0f0";
      surfaceBorder = "#cccccc";
      accentDanger = "#333333";
      surfaceOverlay = "#ffffff";
      surfaceText = "#333333";
      surfaceTextMuted = "#888888";
    } else {
      bg = cs.getPropertyValue("--bg-primary").trim() || "#1a1a2e";
      textPrimary = cs.getPropertyValue("--text-primary").trim() || "#e2e8f0";
      textMuted = cs.getPropertyValue("--text-muted").trim() || "#94a3b8";
      accent = cs.getPropertyValue("--accent-primary").trim() || "#6366f1";
      surfaceCard =
        cs.getPropertyValue("--surface-overlay-card").trim() ||
        cs.getPropertyValue("--card-bg").trim() ||
        "rgba(0,0,0,0.03)";
      surfaceBorder =
        cs.getPropertyValue("--surface-overlay-border").trim() ||
        cs.getPropertyValue("--card-border").trim() ||
        "rgba(0,0,0,0.08)";
      accentDanger = cs.getPropertyValue("--accent-danger").trim() || "#ef4444";
      surfaceOverlay = cs.getPropertyValue("--surface-overlay").trim() || bg;
      surfaceText =
        cs.getPropertyValue("--surface-overlay-text").trim() || textPrimary;
      surfaceTextMuted =
        cs.getPropertyValue("--surface-overlay-text-muted").trim() || textMuted;
    }

    // Inject a style block to resolve CSS vars in the cloned SVG
    const styleEl = document.createElementNS(ns, "style");
    styleEl.textContent = `
      text { font-family: ${isSci ? "'Helvetica Neue', Helvetica, Arial" : "-apple-system, BlinkMacSystemFont, 'Segoe UI'"}, sans-serif; }
      .bpmn-lane-title { font-size: 11px; font-weight: 700; fill: ${textPrimary}; }
      .bpmn-lane-sub { font-size: 9px; fill: ${textMuted}; }
      .bpmn-act-label { font-size: 10px; font-weight: 600; fill: ${textPrimary}; }
      .bpmn-gw-x { font-size: 10px; font-weight: 700; fill: ${textPrimary}; }
      .bpmn-pct-label { font-size: 8px; fill: ${textMuted}; font-weight: 600; }
      .cf-node-label { font-size: 11px; fill: ${isSci ? textPrimary : "#fff"}; font-weight: 700; }
      .cf-node-sub { font-size: 8.5px; fill: ${isSci ? textMuted : "rgba(255,255,255,0.85)"}; font-weight: 500; }
      .cf-edge-freq { font-size: 8px; fill: ${textMuted}; font-weight: 600; }
      .cf-start-end-label { font-size: 10px; fill: ${textPrimary}; font-weight: 600; }
      .cf-start-end-freq { font-size: 8px; fill: ${textMuted}; font-weight: 600; }
    `;
    clone.insertBefore(styleEl, clone.firstChild);

    // Resolve all var() references in SVG attributes
    const varMap = {
      "var(--accent-primary)": accent,
      "var(--text-primary)": textPrimary,
      "var(--text-muted)": textMuted,
      "var(--surface-overlay, var(--bg-primary))": surfaceOverlay,
      "var(--surface-overlay-card)": surfaceCard,
      "var(--surface-overlay-border)": surfaceBorder,
      "var(--surface-overlay-text)": surfaceText,
      "var(--surface-overlay-text-muted)": surfaceTextMuted,
      "var(--accent-danger, #ef4444)": accentDanger,
      "var(--bg-primary)": bg,
    };
    function resolveVars(node) {
      if (node.attributes) {
        for (const attr of [...node.attributes]) {
          let v = attr.value;
          if (v && v.includes("var(")) {
            for (const [pattern, resolved] of Object.entries(varMap)) {
              v = v.split(pattern).join(resolved);
            }
            // Catch remaining var() with fallback: var(--x, fallback) → fallback
            v = v.replace(/var\([^,]+,\s*([^)]+)\)/g, "$1");
            // Catch remaining var() without fallback
            v = v.replace(/var\(--[^)]+\)/g, textPrimary);
            node.setAttribute(attr.name, v);
          }
        }
      }
      for (const child of node.children || []) resolveVars(child);
    }
    resolveVars(clone);

    // Scientific mode: override remaining colored attributes to monochrome
    if (isSci) {
      const sciWalk = (node) => {
        if (node.attributes) {
          for (const attr of [...node.attributes]) {
            const name = attr.name;
            const v = attr.value;
            // Replace any remaining bright colors with monochrome equivalents
            if (name === "fill" || name === "stroke") {
              // Keep 'none', 'transparent', white, grays, and already-monochrome values
              if (
                v &&
                v !== "none" &&
                v !== "transparent" &&
                v !== "#ffffff" &&
                v !== "#fff" &&
                v !== bg
              ) {
                // Detect colored values (hex colors that aren't gray-ish)
                const hex = v.match(/^#([0-9a-fA-F]{6})$/);
                if (hex) {
                  const r = parseInt(hex[1].slice(0, 2), 16);
                  const g = parseInt(hex[1].slice(2, 4), 16);
                  const b = parseInt(hex[1].slice(4, 6), 16);
                  const isGray =
                    Math.abs(r - g) < 30 &&
                    Math.abs(g - b) < 30 &&
                    Math.abs(r - b) < 30;
                  if (!isGray) {
                    // Map colored fills/strokes to monochrome
                    node.setAttribute(
                      name,
                      name === "fill" ? "#ffffff" : "#555555"
                    );
                  }
                }
              }
            }
          }
        }
        for (const child of node.children || []) sciWalk(child);
      };
      sciWalk(clone);

      // Fix specific BPMN elements for better scientific look
      // Activity rects: white fill, dark gray stroke
      for (const rect of clone.querySelectorAll(
        ".bpmn-act-group rect, .cf-node-group rect"
      )) {
        const fill = rect.getAttribute("fill");
        if (fill && fill !== "none") rect.setAttribute("fill", "#ffffff");
        rect.setAttribute("stroke", "#333333");
        rect.setAttribute("stroke-width", "1");
      }
      // Left accent bars (small rects inside activities): subtle gray
      for (const g of clone.querySelectorAll(
        ".bpmn-act-group, .cf-node-group"
      )) {
        const rects = g.querySelectorAll("rect");
        if (rects.length > 1) {
          // Second rect is the accent bar
          rects[1].setAttribute("fill", "#999999");
        }
      }
      // Gateways: white fill, dark stroke
      for (const poly of clone.querySelectorAll("polygon")) {
        const fill = poly.getAttribute("fill");
        if (fill && fill !== "none") poly.setAttribute("fill", "#ffffff");
        poly.setAttribute("stroke", "#333333");
        poly.setAttribute("stroke-width", "1");
      }
      // Start event circle
      for (const circ of clone.querySelectorAll("circle")) {
        const stroke = circ.getAttribute("stroke");
        if (stroke && stroke !== "none") circ.setAttribute("stroke", "#333333");
        const fill = circ.getAttribute("fill");
        if (fill && fill !== "none" && fill !== "#ffffff" && fill !== "#fff")
          circ.setAttribute("fill", "none");
      }
      // Start event play arrow
      for (const g of clone.querySelectorAll("g")) {
        const circ = g.querySelector("circle");
        const poly = g.querySelector("polygon");
        if (circ && poly && !g.querySelector("rect")) {
          // This is start/end event group
          poly.setAttribute("fill", "#333333");
        }
      }
      // End event inner rect
      for (const g of clone.querySelectorAll("g")) {
        const circ = g.querySelector("circle");
        const innerRect = g.querySelector("rect");
        if (
          circ &&
          innerRect &&
          !g.querySelector("polygon") &&
          circ.getAttribute("stroke-width") === "3"
        ) {
          innerRect.setAttribute("fill", "#333333");
          circ.setAttribute("stroke", "#333333");
        }
      }
      // Arrow markers
      for (const marker of clone.querySelectorAll("marker path")) {
        marker.setAttribute("fill", "#555555");
        marker.setAttribute("stroke", "#555555");
        marker.removeAttribute("opacity");
      }
      // Connection paths: uniform dark gray
      for (const path of clone.querySelectorAll("path")) {
        const stroke = path.getAttribute("stroke");
        if (stroke && stroke !== "none") {
          path.setAttribute("stroke", "#555555");
          path.removeAttribute("opacity");
          // Keep dashed lines dashed, but uniform color
        }
      }
      // Lane stroke color for scientific mode
      for (const rect of clone.querySelectorAll("rect[fill-opacity]")) {
        rect.setAttribute("stroke", "#cccccc");
      }
    }

    // No background rect — transparent PNG for both styles
    // Make swimlane backgrounds transparent for both export styles
    for (const rect of clone.querySelectorAll("rect[fill-opacity]")) {
      rect.setAttribute("fill", "none");
      rect.setAttribute("fill-opacity", "0");
    }

    // For default mode with transform, expand viewBox
    if (!isBpmn) {
      // Get bbox from the inner <g> (content coords without pan/zoom transform)
      const innerGSource = svgEl.querySelector("g[transform]");
      const bbox = innerGSource ? innerGSource.getBBox() : svgEl.getBBox();
      const pad = 40;
      clone.setAttribute(
        "viewBox",
        `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`
      );
      clone.setAttribute("width", bbox.width + pad * 2);
      clone.setAttribute("height", bbox.height + pad * 2);
      // Remove transform from inner g (flatten)
      const innerG = clone.querySelector("g[transform]");
      if (innerG) innerG.removeAttribute("transform");
    }

    // Serialize to data URL
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    // Draw on canvas for PNG
    const img = new Image();
    img.onload = () => {
      const scale = 2; // retina
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `process-${isBpmn ? "bpmn" : "map"}${isSci ? "-minimalistic" : ""}-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
        exporting.value = false;
      }, "image/png");
    };
    img.onerror = () => {
      exporting.value = false;
    };
    img.src = url;
  } catch (e) {
    console.error("PNG export failed:", e);
    exporting.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cf-overlay">
      <div
        v-if="controlFlowOpen"
        class="cf-overlay-backdrop"
        @click.self="close"
      >
        <div class="cf-page" @click="closeExportMenu">
          <!-- ─── Header ─── -->
          <div class="cf-header">
            <div class="cf-brand">Control Flow Studio</div>
            <div class="cf-selectors">
              <select v-model="trackId" class="cf-sel-input">
                <option v-for="tr in store.tracks" :key="tr.id" :value="tr.id">
                  {{ tr.title }}
                </option>
              </select>
            </div>
            <div class="cf-modes">
              <button
                v-for="m in viewModes"
                :key="m.id"
                class="cf-mode-btn"
                :class="{ active: viewMode === m.id }"
                @click="viewMode = m.id"
              >
                {{ m.label }}
              </button>
            </div>
            <div class="cf-notation-toggle">
              <button
                class="cf-notation-btn"
                :class="{ active: notation === 'default' }"
                @click="notation = 'default'"
              >
                DFG
              </button>
              <button
                class="cf-notation-btn"
                :class="{ active: notation === 'bpmn' }"
                @click="notation = 'bpmn'"
              >
                BPMN
              </button>
            </div>
            <div v-if="graph" class="cf-export-wrap">
              <button
                class="cf-export-btn"
                :disabled="exporting"
                @click="exportMenuOpen = !exportMenuOpen"
              >
                {{ exporting ? "Exporting…" : "Export" }}
                <svg
                  v-if="!exporting"
                  viewBox="0 0 10 6"
                  class="cf-export-caret"
                >
                  <path
                    d="M1 1l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <div v-if="exportMenuOpen" class="cf-export-menu">
                <button class="cf-export-option" @click="doExport('default')">
                  <span class="cf-export-option-title">PNG — Default</span>
                  <span class="cf-export-option-desc"
                    >Current theme colors</span
                  >
                </button>
                <button
                  class="cf-export-option"
                  @click="doExport('scientific')"
                >
                  <span class="cf-export-option-title">PNG — Minimalistic</span>
                  <span class="cf-export-option-desc"
                    >Clean monochrome style</span
                  >
                </button>
              </div>
            </div>
            <button class="cf-close" @click="close">Back to Timeline</button>
          </div>

          <div class="cf-body">
            <!-- ─── Sidebar ─── -->
            <div class="cf-sidebar">
              <div class="cf-nav">
                <button
                  v-for="sec in sections"
                  :key="sec.id"
                  class="cf-nav-item"
                  :class="{ active: activeSection === sec.id }"
                  @click="activeSection = sec.id"
                >
                  <span class="nav-icon">{{ sec.icon }}</span>
                  <span class="nav-label">{{ sec.label }}</span>
                </button>
              </div>

              <!-- Swimlanes toggle (BPMN only) -->
              <div v-if="notation === 'bpmn'" class="cf-swimlane-toggle">
                <label class="cf-toggle-row">
                  <input type="checkbox" v-model="showLanes" />
                  <span>Swimlanes</span>
                </label>
              </div>

              <!-- Agent spotlight -->
              <div class="cf-agent-panel">
                <div class="cf-panel-head">
                  <span>Spotlight</span>
                  <button
                    v-if="spotlightAgents"
                    class="cf-clear-btn"
                    @click="clearSpotlight"
                  >
                    Clear
                  </button>
                </div>
                <div class="cf-spotlight-tabs">
                  <button
                    class="cf-spotlight-tab"
                    :class="{ active: spotlightMode === 'roles' }"
                    @click="spotlightMode = 'roles'"
                  >
                    Roles
                  </button>
                  <button
                    class="cf-spotlight-tab"
                    :class="{ active: spotlightMode === 'agents' }"
                    @click="spotlightMode = 'agents'"
                  >
                    Agents
                  </button>
                </div>
                <div class="cf-agent-list" v-if="graph">
                  <template v-if="spotlightMode === 'roles'">
                    <div
                      v-for="[role, agents] in graph.roleMap"
                      :key="role"
                      class="cf-role-group"
                    >
                      <label
                        class="cf-role-item"
                        :style="{
                          borderLeftColor:
                            graph.roleColorMap.get(role) || '#94a3b8',
                        }"
                      >
                        <input
                          type="checkbox"
                          :checked="isRoleSelected(role)"
                          :indeterminate="
                            isRoleSelected(role) && !isRoleFullySelected(role)
                          "
                          @change="toggleRole(role)"
                        />
                        <span class="cf-role-name">{{ role }}</span>
                        <span class="cf-role-count">{{ agents.length }}</span>
                      </label>
                    </div>
                  </template>
                  <template v-else>
                    <label
                      v-for="agent in graph.allAgents"
                      :key="agent"
                      class="cf-agent-item"
                      :style="{
                        borderLeftColor: graph.agentColorMap.get(agent),
                      }"
                    >
                      <input
                        type="checkbox"
                        :checked="spotlightAgents && spotlightAgents.has(agent)"
                        @change="toggleSpotlight(agent)"
                      />
                      <span>{{ trunc(agent, 14) }}</span>
                    </label>
                  </template>
                </div>
              </div>

              <!-- Simplify slider -->
              <div class="cf-complexity">
                <div class="cf-panel-head"><span>Activities</span></div>
                <div class="cf-threshold-inline">
                  <span class="cf-threshold-val"
                    >{{ activityPct.toFixed(1) }}%</span
                  >
                  <button class="cf-adj-btn" @click="adjActivity(-5)">
                    &minus;
                  </button>
                  <button class="cf-adj-btn" @click="adjActivity(5)">+</button>
                </div>
                <div class="cf-panel-head" style="margin-top: 6px">
                  <span>Paths</span>
                </div>
                <div class="cf-threshold-inline">
                  <span class="cf-threshold-val"
                    >{{ (100 - minFreqPct).toFixed(1) }}%</span
                  >
                  <button class="cf-adj-btn" @click="adjPath(5)">
                    &minus;
                  </button>
                  <button class="cf-adj-btn" @click="adjPath(-5)">+</button>
                </div>
              </div>

              <!-- Legend -->
              <div class="cf-legend">
                <div class="cf-panel-head"><span>Legend</span></div>
                <!-- BPMN notation legend -->
                <template v-if="notation === 'bpmn'">
                  <div class="lg-row">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        fill="none"
                        stroke="var(--accent-primary)"
                        stroke-width="1.5"
                      />
                      <polygon
                        points="6,5 11,8 6,11"
                        fill="var(--accent-primary)"
                      />
                    </svg>
                    Start Event
                  </div>
                  <div class="lg-row">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        fill="none"
                        stroke="#ef4444"
                        stroke-width="3"
                      />
                      <rect
                        x="5.5"
                        y="5.5"
                        width="5"
                        height="5"
                        rx="0.5"
                        fill="#ef4444"
                      />
                    </svg>
                    End Event
                  </div>
                  <div class="lg-row">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                      <polygon
                        points="8,2 14,8 8,14 2,8"
                        fill="none"
                        stroke="var(--text-primary)"
                        stroke-width="1"
                      />
                      <line
                        x1="8"
                        y1="5"
                        x2="8"
                        y2="11"
                        stroke="var(--text-primary)"
                        stroke-width="1.5"
                      />
                      <line
                        x1="5"
                        y1="8"
                        x2="11"
                        y2="8"
                        stroke="var(--text-primary)"
                        stroke-width="1.5"
                      />
                    </svg>
                    AND (parallel)
                  </div>
                  <div class="lg-row">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                      <polygon
                        points="8,2 14,8 8,14 2,8"
                        fill="none"
                        stroke="var(--text-primary)"
                        stroke-width="1"
                      />
                      <text
                        x="8"
                        y="8"
                        text-anchor="middle"
                        dominant-baseline="central"
                        font-size="8"
                        font-weight="700"
                        fill="var(--text-primary)"
                      >
                        X
                      </text>
                    </svg>
                    XOR (exclusive)
                  </div>
                  <div class="lg-row">
                    <svg width="20" height="8">
                      <line
                        x1="0"
                        y1="4"
                        x2="20"
                        y2="4"
                        stroke="var(--accent-primary)"
                        stroke-width="1.5"
                      />
                    </svg>
                    Main flow
                  </div>
                  <div class="lg-row">
                    <svg width="20" height="8">
                      <line
                        x1="0"
                        y1="4"
                        x2="20"
                        y2="4"
                        stroke="var(--text-muted)"
                        stroke-width="1"
                        opacity="0.45"
                      />
                    </svg>
                    Branch
                  </div>
                  <div class="lg-row">
                    <svg width="16" height="8">
                      <rect
                        x="0"
                        y="2"
                        width="16"
                        height="4"
                        rx="2"
                        fill="var(--accent-primary)"
                        opacity="0.15"
                        stroke="var(--accent-primary)"
                        stroke-width="1"
                      />
                    </svg>
                    Swimlane
                  </div>
                  <div class="lg-sep"></div>
                </template>
                <template v-if="notation !== 'bpmn'">
                  <template v-if="viewMode === 'frequency'">
                    <div class="lg-row">
                      <span
                        class="lg-dot"
                        style="background: var(--accent-primary); opacity: 0.5"
                      ></span>
                      Low frequency
                    </div>
                    <div class="lg-row">
                      <span
                        class="lg-dot"
                        style="background: var(--accent-primary)"
                      ></span>
                      High frequency
                    </div>
                    <div class="lg-row">
                      <svg width="20" height="6">
                        <line
                          x1="0"
                          y1="3"
                          x2="20"
                          y2="3"
                          stroke="var(--accent-primary)"
                          stroke-width="1.5"
                        />
                      </svg>
                      Transition
                    </div>
                    <div class="lg-row">
                      <svg width="20" height="6">
                        <line
                          x1="0"
                          y1="3"
                          x2="20"
                          y2="3"
                          stroke="var(--accent-primary)"
                          stroke-width="1.5"
                          stroke-dasharray="4,3"
                        />
                      </svg>
                      Low freq / back-edge
                    </div>
                  </template>
                  <template v-if="viewMode === 'performance'">
                    <div class="lg-row">
                      <span class="lg-dot" style="background: #22c55e"></span>
                      Fast
                    </div>
                    <div class="lg-row">
                      <span class="lg-dot" style="background: #f59e0b"></span>
                      Medium
                    </div>
                    <div class="lg-row">
                      <span class="lg-dot" style="background: #ef4444"></span>
                      Slow
                    </div>
                  </template>
                  <template v-if="viewMode === 'resource'">
                    <div class="lg-row">
                      <span class="lg-dot" style="background: #ef4444"></span> 1
                      agent (risk)
                    </div>
                    <div class="lg-row">
                      <span class="lg-dot" style="background: #f97316"></span> 2
                      agents
                    </div>
                    <div class="lg-row">
                      <span class="lg-dot" style="background: #eab308"></span> 3
                      agents
                    </div>
                    <div class="lg-row">
                      <span class="lg-dot" style="background: #22c55e"></span>
                      4+ agents
                    </div>
                  </template>
                </template>
              </div>

              <!-- Resource Insights -->
              <div v-if="graph" class="cf-resource-panel">
                <div class="cf-panel-head"><span>Resource Insights</span></div>
                <label class="cf-ri-toggle" :class="{ active: showBottlenecks }">
                  <input type="checkbox" v-model="showBottlenecks" />
                  <span class="cf-ri-label">Bottlenecks</span>
                  <span class="cf-ri-badge cf-ri-badge-red" v-if="bottleneckCount">{{ bottleneckCount }}</span>
                </label>
                <label class="cf-ri-toggle" :class="{ active: showSingleResource }">
                  <input type="checkbox" v-model="showSingleResource" />
                  <span class="cf-ri-label">Single Resource</span>
                  <span class="cf-ri-badge cf-ri-badge-orange" v-if="singleResCount">{{ singleResCount }}</span>
                </label>
                <label class="cf-ri-toggle" :class="{ active: showHandoffHotspots }">
                  <input type="checkbox" v-model="showHandoffHotspots" />
                  <span class="cf-ri-label">Handoff Hotspots</span>
                </label>

                <div class="cf-ri-slider-row">
                  <span class="cf-ri-slider-label">Min. Resources</span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    v-model.number="minResources"
                    class="cf-ri-slider"
                  />
                  <span class="cf-ri-slider-val">{{ minResources }}</span>
                </div>

                <!-- Top Handoffs -->
                <div class="cf-ri-handoffs">
                  <button class="cf-ri-handoffs-head" @click="handoffPanelOpen = !handoffPanelOpen">
                    <span>{{ handoffPanelOpen ? '▾' : '▸' }} Top Handoffs</span>
                    <button v-if="highlightedHandoff" class="cf-clear-btn" @click.stop="highlightedHandoff = null">Clear</button>
                  </button>
                  <div v-if="handoffPanelOpen && topHandoffs.length" class="cf-ri-handoff-list">
                    <div
                      v-for="h in topHandoffs"
                      :key="h.pair"
                      class="cf-ri-handoff-item"
                      :class="{ highlighted: highlightedHandoff === h.pair }"
                      @click="selectHandoff(h.pair)"
                      :title="h.pair.replace('→', ' → ') + ' — ' + h.count + 'x'"
                    >
                      <div class="cf-ri-handoff-agents">
                        <span class="cf-ri-handoff-from">{{ h.pair.split('→')[0] }}</span>
                        <span class="cf-ri-handoff-arrow">→</span>
                        <span class="cf-ri-handoff-to">{{ h.pair.split('→')[1] }}</span>
                      </div>
                      <span class="cf-ri-handoff-count">{{ h.count }}x</span>
                    </div>
                  </div>
                  <div v-if="handoffPanelOpen && !topHandoffs.length" class="cf-ri-handoff-empty">No handoffs detected</div>
                </div>
              </div>

              <button class="cf-reset-btn" @click="resetView">
                Reset View
              </button>
            </div>

            <!-- ─── Main content ─── -->
            <div class="cf-main">
              <!-- No data -->
              <div v-if="!graph" class="cf-empty">
                <div class="cf-empty-icon">
                  <svg
                    viewBox="0 0 48 48"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <circle cx="12" cy="24" r="6" />
                    <circle cx="36" cy="12" r="6" />
                    <circle cx="36" cy="36" r="6" />
                    <path d="M18 22l12-8M18 26l12 8" />
                  </svg>
                </div>
                <div class="cf-empty-text">
                  Select a track with data to visualize the control flow
                </div>
              </div>

              <!-- ═══ BPMN SWIMLANE VIEW ═══ -->
              <template v-if="graph && graph.bpmn && activeSection === 'map'">
                <div class="bpmn-scroll-hint">
                  Scroll horizontally to see the full process
                </div>
                <div class="bpmn-scroll-wrap">
                  <svg
                    :width="graph.bpmn.width"
                    :viewBox="`0 0 ${graph.bpmn.width} ${graph.bpmn.height}`"
                    class="bpmn-svg"
                  >
                    <defs>
                      <marker
                        id="bpmn-arr"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path
                          d="M2 1L8 5L2 9"
                          fill="none"
                          stroke="context-stroke"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </marker>
                      <marker
                        id="bpmn-arr-m"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path
                          d="M2 1L8 5L2 9"
                          fill="none"
                          stroke="var(--text-muted)"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </marker>
                    </defs>

                    <!-- Lane backgrounds + labels (toggle) -->
                    <template v-if="showLanes">
                      <rect
                        v-for="(lane, i) in graph.bpmn.lanes"
                        :key="'lb-' + i"
                        :x="graph.bpmn.labelW"
                        :y="lane.y"
                        :width="graph.bpmn.width - graph.bpmn.labelW"
                        :height="lane.h"
                        :fill="
                          i % 2 === 0 ? 'var(--surface-overlay-card)' : 'none'
                        "
                        fill-opacity="0.5"
                        stroke="var(--surface-overlay-border)"
                        stroke-width="0.5"
                      />
                      <g v-for="(lane, i) in graph.bpmn.lanes" :key="'ll-' + i">
                        <rect
                          x="0"
                          :y="lane.y"
                          :width="graph.bpmn.labelW"
                          :height="lane.h"
                          :fill="lane.color"
                          fill-opacity="0.06"
                          stroke="var(--surface-overlay-border)"
                          stroke-width="0.5"
                        />
                        <text
                          x="10"
                          :y="lane.cy - 7"
                          class="bpmn-lane-title"
                          dominant-baseline="central"
                        >
                          {{ lane.role }}
                        </text>
                        <text
                          x="10"
                          :y="lane.cy + 8"
                          class="bpmn-lane-sub"
                          dominant-baseline="central"
                        >
                          {{ lane.agentCount }} agent{{
                            lane.agentCount !== 1 ? "s" : ""
                          }}
                        </text>
                      </g>
                    </template>

                    <!-- Connections -->
                    <g
                      v-for="conn in graph.bpmn.connections"
                      :key="'c-' + conn.id"
                    >
                      <path
                        :d="conn.path"
                        fill="none"
                        :stroke="bpmnConnStroke(conn)"
                        :stroke-width="conn.mainFlow ? 1.5 : 1"
                        :stroke-dasharray="conn.dashed ? '4 3' : 'none'"
                        :opacity="conn.mainFlow ? 0.8 : 0.45"
                        marker-end="url(#bpmn-arr)"
                      />
                      <text
                        v-if="conn.label"
                        :x="conn.labelX || 0"
                        :y="conn.labelY || 0"
                        :text-anchor="conn.labelAnchor || 'middle'"
                        class="bpmn-pct-label"
                      >
                        {{ conn.label }}
                      </text>
                    </g>

                    <!-- Elements -->
                    <template
                      v-for="el in graph.bpmn.elements"
                      :key="'el-' + el.id"
                    >
                      <!-- Start event -->
                      <g v-if="el.type === 'start'">
                        <circle
                          :cx="el.cx"
                          :cy="el.cy"
                          :r="el.r"
                          fill="none"
                          stroke="var(--accent-primary)"
                          stroke-width="1.5"
                        />
                        <polygon
                          :points="`${el.cx - 3},${el.cy - 5} ${el.cx + 5},${el.cy} ${el.cx - 3},${el.cy + 5}`"
                          fill="var(--accent-primary)"
                        />
                      </g>
                      <!-- End event -->
                      <g v-if="el.type === 'end'">
                        <circle
                          :cx="el.cx"
                          :cy="el.cy"
                          :r="el.r"
                          fill="none"
                          stroke="var(--accent-danger, #ef4444)"
                          stroke-width="3"
                        />
                        <rect
                          :x="el.cx - 4"
                          :y="el.cy - 4"
                          width="8"
                          height="8"
                          rx="1"
                          fill="var(--accent-danger, #ef4444)"
                        />
                      </g>
                      <!-- Activity -->
                      <g
                        v-if="el.type === 'activity'"
                        class="bpmn-act-group"
                        @mouseenter="showNodeTip($event, el.node)"
                        @mousemove="moveTip"
                        @mouseleave="hideTip"
                        @click.stop="selectNode(el.node)"
                      >
                        <rect
                          :x="el.x"
                          :y="el.cy - el.h / 2"
                          :width="el.w"
                          :height="el.h"
                          rx="5"
                          fill="var(--surface-overlay, var(--bg-primary))"
                          :stroke="
                            viewMode === 'resource' && el.node
                              ? resAgentBadgeColor(el.node.totalAgents)
                              : el.isBranch
                                ? 'var(--text-muted)'
                                : 'var(--accent-primary)'
                          "
                          :stroke-width="viewMode === 'resource' ? 2 : 1"
                          :opacity="el.node && minResources > 1 && el.node.totalAgents < minResources ? 0.3 : 1"
                        />
                        <rect
                          :x="el.x + 1"
                          :y="el.cy - el.h / 2 + 4"
                          width="3"
                          :height="el.h - 8"
                          rx="1.5"
                          :fill="
                            viewMode === 'resource' && el.node
                              ? resAgentBadgeColor(el.node.totalAgents)
                              : el.isBranch
                                ? 'var(--text-muted)'
                                : 'var(--accent-primary)'
                          "
                          opacity="0.8"
                        />
                        <text
                          :x="el.x + 10"
                          :y="
                            el.cy -
                            ((el.lines || [el.label]).length - 1) * 6.5 +
                            1
                          "
                          class="bpmn-act-label"
                        >
                          <tspan
                            v-for="(line, li) in el.lines || [el.label]"
                            :key="li"
                            :x="el.x + 10"
                            :dy="li === 0 ? 0 : 13"
                            dominant-baseline="central"
                          >
                            {{ line }}
                          </tspan>
                        </text>
                        <!-- BPMN Resource badge -->
                        <g v-if="el.node && (resourceInsightsActive || viewMode === 'resource')">
                          <rect
                            :x="el.x + el.w - 22"
                            :y="el.cy + el.h / 2 - 12"
                            width="18"
                            height="10"
                            rx="5"
                            :fill="resAgentBadgeColor(el.node.totalAgents)"
                            opacity="0.85"
                          />
                          <text
                            :x="el.x + el.w - 13"
                            :y="el.cy + el.h / 2 - 5.5"
                            text-anchor="middle"
                            font-size="7"
                            font-weight="700"
                            fill="#fff"
                          >
                            {{ el.node.totalAgents }}
                          </text>
                        </g>
                        <!-- BPMN Bottleneck ring -->
                        <rect
                          v-if="el.node && el.node.isBottleneck && showBottlenecks"
                          :x="el.x - 2"
                          :y="el.cy - el.h / 2 - 2"
                          :width="el.w + 4"
                          :height="el.h + 4"
                          rx="7"
                          fill="none"
                          stroke="#ef4444"
                          stroke-width="2"
                          stroke-dasharray="4 2"
                          opacity="0.7"
                          class="cf-bottleneck-pulse"
                        />
                        <!-- BPMN Single resource ring -->
                        <rect
                          v-if="el.node && el.node.isSingleResource && showSingleResource"
                          :x="el.x - 2"
                          :y="el.cy - el.h / 2 - 2"
                          :width="el.w + 4"
                          :height="el.h + 4"
                          rx="7"
                          fill="none"
                          stroke="#f97316"
                          stroke-width="1.5"
                          opacity="0.6"
                        />
                      </g>
                      <!-- Gateway (XOR or AND) -->
                      <g v-if="el.type === 'gateway'">
                        <polygon
                          :points="`${el.cx},${el.cy - el.s} ${el.cx + el.s},${el.cy} ${el.cx},${el.cy + el.s} ${el.cx - el.s},${el.cy}`"
                          fill="var(--surface-overlay, var(--bg-primary))"
                          stroke="var(--text-primary)"
                          stroke-width="1"
                        />
                        <!-- AND gateway: + symbol -->
                        <template v-if="el.gwType === 'and'">
                          <line
                            :x1="el.cx"
                            :y1="el.cy - el.s * 0.5"
                            :x2="el.cx"
                            :y2="el.cy + el.s * 0.5"
                            stroke="var(--text-primary)"
                            stroke-width="1.5"
                          />
                          <line
                            :x1="el.cx - el.s * 0.5"
                            :y1="el.cy"
                            :x2="el.cx + el.s * 0.5"
                            :y2="el.cy"
                            stroke="var(--text-primary)"
                            stroke-width="1.5"
                          />
                        </template>
                        <!-- XOR gateway: X symbol -->
                        <text
                          v-else
                          :x="el.cx"
                          :y="el.cy + 1"
                          text-anchor="middle"
                          dominant-baseline="central"
                          class="bpmn-gw-x"
                        >
                          X
                        </text>
                      </g>
                    </template>
                  </svg>
                </div>
              </template>

              <!-- ═══ PROCESS MAP (default, non-BPMN) ═══ -->
              <template v-if="graph && !graph.bpmn && activeSection === 'map'">
                <svg
                  class="cf-svg"
                  @mousedown.prevent="onMouseDown"
                  @mousemove="onMouseMove"
                  @mouseup="onMouseUp"
                  @mouseleave="onMouseUp"
                  @wheel.prevent="onWheel"
                  :class="{ panning: isPanning }"
                >
                  <defs>
                    <marker
                      id="cf-arr"
                      viewBox="0 0 6 5"
                      refX="5.5"
                      refY="2.5"
                      markerWidth="5"
                      markerHeight="4"
                      orient="auto-start-reverse"
                    >
                      <path
                        d="M 0 0 L 6 2.5 L 0 5 z"
                        fill="var(--accent-primary)"
                        opacity="0.7"
                      />
                    </marker>
                    <marker
                      id="cf-arr-g"
                      viewBox="0 0 6 5"
                      refX="5.5"
                      refY="2.5"
                      markerWidth="5"
                      markerHeight="4"
                      orient="auto-start-reverse"
                    >
                      <path
                        d="M 0 0 L 6 2.5 L 0 5 z"
                        fill="#22c55e"
                        opacity="0.7"
                      />
                    </marker>
                    <marker
                      id="cf-arr-y"
                      viewBox="0 0 6 5"
                      refX="5.5"
                      refY="2.5"
                      markerWidth="5"
                      markerHeight="4"
                      orient="auto-start-reverse"
                    >
                      <path
                        d="M 0 0 L 6 2.5 L 0 5 z"
                        fill="#eab308"
                        opacity="0.7"
                      />
                    </marker>
                    <marker
                      id="cf-arr-r"
                      viewBox="0 0 6 5"
                      refX="5.5"
                      refY="2.5"
                      markerWidth="5"
                      markerHeight="4"
                      orient="auto-start-reverse"
                    >
                      <path
                        d="M 0 0 L 6 2.5 L 0 5 z"
                        fill="#ef4444"
                        opacity="0.7"
                      />
                    </marker>
                    <marker
                      id="cf-arr-o"
                      viewBox="0 0 6 5"
                      refX="5.5"
                      refY="2.5"
                      markerWidth="5"
                      markerHeight="4"
                      orient="auto-start-reverse"
                    >
                      <path
                        d="M 0 0 L 6 2.5 L 0 5 z"
                        fill="#f97316"
                        opacity="0.7"
                      />
                    </marker>
                    <marker
                      id="cf-arr-m"
                      viewBox="0 0 6 5"
                      refX="5.5"
                      refY="2.5"
                      markerWidth="5"
                      markerHeight="4"
                      orient="auto-start-reverse"
                    >
                      <path
                        d="M 0 0 L 6 2.5 L 0 5 z"
                        fill="var(--text-muted)"
                        opacity="0.5"
                      />
                    </marker>
                    <filter
                      id="nshadow"
                      x="-8%"
                      y="-8%"
                      width="120%"
                      height="130%"
                    >
                      <feDropShadow
                        dx="0"
                        dy="1"
                        stdDeviation="2.5"
                        flood-color="rgba(0,0,0,0.1)"
                      />
                    </filter>
                  </defs>
                  <g :transform="`translate(${pan.x},${pan.y}) scale(${zoom})`">
                    <!-- ═══ BPMN SWIMLANES ═══ -->
                    <template v-if="graph.isBpmn && graph.swimlanes">
                      <g
                        v-for="(lane, li) in graph.swimlanes"
                        :key="'lane-' + li"
                      >
                        <rect
                          :x="10"
                          :y="lane.y"
                          :width="graph.width - 10"
                          :height="lane.h"
                          rx="6"
                          :fill="
                            li % 2 === 0
                              ? 'var(--surface-overlay-card)'
                              : 'transparent'
                          "
                          stroke="var(--surface-overlay-border)"
                          stroke-width="0.5"
                          opacity="0.6"
                        />
                        <rect
                          :x="10"
                          :y="lane.y"
                          width="28"
                          :height="lane.h"
                          rx="6"
                          :fill="lane.color"
                          opacity="0.12"
                        />
                        <text
                          :x="24"
                          :y="lane.y + lane.h / 2"
                          text-anchor="middle"
                          dominant-baseline="central"
                          class="cf-lane-label"
                          :fill="lane.color"
                          :transform="`rotate(-90, 24, ${lane.y + lane.h / 2})`"
                        >
                          {{ lane.role }}
                        </text>
                      </g>
                    </template>

                    <!-- ═══ VIRTUAL EDGES ═══ -->
                    <g v-for="ve in graph.virtualEdges || []" :key="ve.id">
                      <path
                        :d="ve.path"
                        fill="none"
                        stroke="var(--text-muted)"
                        stroke-width="1"
                        stroke-dasharray="3,3"
                        opacity="0.4"
                        marker-end="url(#cf-arr-m)"
                      />
                    </g>

                    <!-- ═══ PROCESS START ═══ -->
                    <g v-if="graph.startNode">
                      <circle
                        :cx="graph.startNode.x + 18"
                        :cy="graph.startNode.y + 18"
                        r="16"
                        fill="var(--accent-primary)"
                        stroke="var(--accent-primary)"
                        stroke-width="1"
                        opacity="0.9"
                      />
                      <polygon
                        :points="`${graph.startNode.x + 14},${graph.startNode.y + 11} ${graph.startNode.x + 25},${graph.startNode.y + 18} ${graph.startNode.x + 14},${graph.startNode.y + 25}`"
                        fill="#fff"
                      />
                      <text
                        :x="graph.startNode.x + 18"
                        :y="graph.startNode.y + 42"
                        text-anchor="middle"
                        class="cf-start-end-label"
                      >
                        Process Start
                      </text>
                      <text
                        :x="graph.startNode.x + 18"
                        :y="graph.startNode.y + 52"
                        text-anchor="middle"
                        class="cf-start-end-freq"
                      >
                        {{ graph.totalCases?.toLocaleString() }}
                      </text>
                    </g>

                    <!-- ═══ PROCESS END ═══ -->
                    <g v-if="graph.endNode">
                      <circle
                        :cx="graph.endNode.x + 18"
                        :cy="graph.endNode.y + 18"
                        r="16"
                        fill="none"
                        stroke="var(--accent-danger, #ef4444)"
                        stroke-width="3"
                        opacity="0.8"
                      />
                      <rect
                        :x="graph.endNode.x + 12"
                        :y="graph.endNode.y + 12"
                        width="12"
                        height="12"
                        rx="2"
                        fill="var(--accent-danger, #ef4444)"
                        opacity="0.8"
                      />
                      <text
                        :x="graph.endNode.x + 18"
                        :y="graph.endNode.y + 42"
                        text-anchor="middle"
                        class="cf-start-end-label"
                      >
                        Process End
                      </text>
                      <text
                        :x="graph.endNode.x + 18"
                        :y="graph.endNode.y + 52"
                        text-anchor="middle"
                        class="cf-start-end-freq"
                      >
                        {{ graph.totalCases?.toLocaleString() }}
                      </text>
                    </g>

                    <!-- ═══ EDGES ═══ -->
                    <g v-for="edge in graph.edges" :key="'e-' + edge.id">
                      <path
                        :d="edge.path"
                        fill="none"
                        :stroke="edgeColor(edge)"
                        :stroke-width="edgeWidth(edge)"
                        :stroke-dasharray="edgeDash(edge)"
                        :opacity="edgeOpacity(edge)"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        :marker-end="
                          edgeColor(edge) === '#22c55e'
                            ? 'url(#cf-arr-g)'
                            : edgeColor(edge) === '#eab308'
                              ? 'url(#cf-arr-y)'
                              : edgeColor(edge) === '#ef4444'
                                ? 'url(#cf-arr-r)'
                                : edgeColor(edge) === '#f97316'
                                  ? 'url(#cf-arr-o)'
                                  : 'url(#cf-arr)'
                        "
                        class="cf-edge"
                        @mouseenter="showEdgeTip($event, edge)"
                        @mousemove="moveTip"
                        @mouseleave="hideTip"
                      />
                      <text
                        v-if="edge.labelX"
                        :x="edge.labelX"
                        :y="edge.labelY"
                        text-anchor="middle"
                        class="cf-edge-freq"
                        :opacity="edgeOpacity(edge)"
                      >
                        {{ edge.freq.toLocaleString() }}
                      </text>
                    </g>

                    <!-- ═══ NODES ═══ -->
                    <g
                      v-for="node in graph.nodes"
                      :key="'n-' + node.id"
                      :opacity="nodeOpacity(node)"
                      class="cf-node-group"
                      @mouseenter="showNodeTip($event, node)"
                      @mousemove="moveTip"
                      @mouseleave="hideTip"
                      @click.stop="selectNode(node)"
                    >
                      <!-- Node body -->
                      <rect
                        :x="node.x"
                        :y="node.y"
                        :width="node.w"
                        :height="node.h"
                        rx="8"
                        :fill="
                          graph.isBpmn ? 'var(--bg-primary)' : nodeColor(node)
                        "
                        :stroke="
                          graph.isBpmn
                            ? nodeColor(node)
                            : selectedNode?.id === node.id
                              ? '#fff'
                              : 'rgba(255,255,255,0.12)'
                        "
                        :stroke-width="
                          graph.isBpmn
                            ? 2
                            : selectedNode?.id === node.id
                              ? 2
                              : 0.5
                        "
                        filter="url(#nshadow)"
                      />
                      <!-- BPMN left accent -->
                      <rect
                        v-if="graph.isBpmn"
                        :x="node.x + 1"
                        :y="node.y + 5"
                        width="3"
                        :height="node.h - 10"
                        :fill="nodeColor(node)"
                        rx="1.5"
                      />
                      <!-- Activity name -->
                      <text
                        :x="node.x + (graph.isBpmn ? 12 : node.w / 2)"
                        :y="node.y + 19"
                        :text-anchor="graph.isBpmn ? 'start' : 'middle'"
                        :class="
                          graph.isBpmn ? 'cf-node-label-bpmn' : 'cf-node-label'
                        "
                      >
                        {{ trunc(node.label, Math.floor((node.w - 20) / 7)) }}
                      </text>
                      <!-- Frequency + agent -->
                      <text
                        :x="node.x + (graph.isBpmn ? 12 : node.w / 2)"
                        :y="node.y + 34"
                        :text-anchor="graph.isBpmn ? 'start' : 'middle'"
                        :class="
                          graph.isBpmn ? 'cf-node-sub-bpmn' : 'cf-node-sub'
                        "
                      >
                        {{
                          node.primaryAgent
                            ? trunc(node.primaryAgent, 14) + " · "
                            : ""
                        }}{{ node.freq.toLocaleString() }}
                      </text>
                      <!-- Resource bar -->
                      <g v-if="viewMode === 'resource' && !graph.isBpmn">
                        <rect
                          :x="node.x + 8"
                          :y="node.y + node.h - 10"
                          :width="node.w - 16"
                          :height="5"
                          rx="2.5"
                          fill="rgba(255,255,255,0.3)"
                        />
                        <clipPath :id="'rbar-' + node.id">
                          <rect
                            :x="node.x + 8"
                            :y="node.y + node.h - 10"
                            :width="node.w - 16"
                            :height="5"
                            rx="2.5"
                          />
                        </clipPath>
                        <g :clip-path="'url(#rbar-' + node.id + ')'">
                          <rect
                            v-for="(seg, si) in resBarSegments(node)"
                            :key="si"
                            :x="node.x + 8 + (seg.x / 100) * (node.w - 16)"
                            :y="node.y + node.h - 10"
                            :width="Math.max(1, (seg.w / 100) * (node.w - 16))"
                            :height="5"
                            :fill="seg.color"
                          />
                        </g>
                      </g>
                      <!-- Bottleneck indicator -->
                      <g v-if="node.isBottleneck && (showBottlenecks || viewMode !== 'frequency')">
                        <circle
                          :cx="node.x + node.w - 8"
                          :cy="node.y + 8"
                          r="5"
                          fill="#fbbf24"
                          stroke="#fff"
                          stroke-width="1"
                        />
                        <text
                          :x="node.x + node.w - 8"
                          :y="node.y + 11"
                          text-anchor="middle"
                          font-size="7"
                          font-weight="700"
                          fill="#000"
                        >
                          !
                        </text>
                      </g>
                      <!-- Single resource risk indicator -->
                      <g v-if="node.isSingleResource && showSingleResource">
                        <circle
                          :cx="node.x + node.w - 8"
                          :cy="node.y + node.h - 8"
                          r="5"
                          fill="#f97316"
                          stroke="#fff"
                          stroke-width="1"
                        />
                        <text
                          :x="node.x + node.w - 8"
                          :y="node.y + node.h - 5"
                          text-anchor="middle"
                          font-size="7"
                          font-weight="700"
                          fill="#fff"
                        >
                          1
                        </text>
                      </g>
                      <!-- Resource count badge (hide when resource bar is showing) -->
                      <g v-if="resourceInsightsActive && !(viewMode === 'resource' && !graph.isBpmn)">
                        <rect
                          :x="node.x + node.w - 26"
                          :y="node.y + node.h - 14"
                          width="22"
                          height="12"
                          rx="6"
                          :fill="resAgentBadgeColor(node.totalAgents)"
                          opacity="0.9"
                        />
                        <text
                          :x="node.x + node.w - 15"
                          :y="node.y + node.h - 6"
                          text-anchor="middle"
                          font-size="7.5"
                          font-weight="700"
                          fill="#fff"
                        >
                          {{ node.totalAgents }}
                        </text>
                      </g>
                      <!-- Bottleneck glow ring -->
                      <rect
                        v-if="node.isBottleneck && showBottlenecks"
                        :x="node.x - 2"
                        :y="node.y - 2"
                        :width="node.w + 4"
                        :height="node.h + 4"
                        rx="10"
                        fill="none"
                        stroke="#ef4444"
                        stroke-width="2"
                        stroke-dasharray="4 2"
                        opacity="0.7"
                        class="cf-bottleneck-pulse"
                      />
                      <!-- Single resource glow ring -->
                      <rect
                        v-if="node.isSingleResource && showSingleResource"
                        :x="node.x - 2"
                        :y="node.y - 2"
                        :width="node.w + 4"
                        :height="node.h + 4"
                        rx="10"
                        fill="none"
                        stroke="#f97316"
                        stroke-width="1.5"
                        opacity="0.6"
                      />
                    </g>
                  </g>
                </svg>

                <!-- Zoom controls -->
                <div class="cf-zoom-controls">
                  <button class="cf-zoom-btn" @click="zoomOut">&minus;</button>
                  <span class="cf-zoom-label">Zoom</span>
                  <button class="cf-zoom-btn" @click="zoomIn">+</button>
                </div>

                <!-- Selected node detail -->
                <div v-if="selectedNode" class="cf-detail">
                  <div class="cf-detail-head">
                    <span>{{ selectedNode.label }}</span>
                    <button
                      @click="selectedNode = null"
                      class="cf-detail-close"
                    >
                      &times;
                    </button>
                  </div>
                  <div class="cf-detail-row">
                    <span>Frequency</span
                    ><span>{{ selectedNode.freq.toLocaleString() }}</span>
                  </div>
                  <div class="cf-detail-row">
                    <span>Avg Duration</span
                    ><span>{{ fmtDur(selectedNode.avgDuration) }}</span>
                  </div>
                  <div class="cf-detail-row">
                    <span>Med Duration</span
                    ><span>{{ fmtDur(selectedNode.medDuration) }}</span>
                  </div>
                  <div class="cf-detail-row">
                    <span>Min / Max</span
                    ><span
                      >{{ fmtDur(selectedNode.minDuration) }} /
                      {{ fmtDur(selectedNode.maxDuration) }}</span
                    >
                  </div>
                  <div class="cf-detail-row">
                    <span>Avg Wait Before</span
                    ><span>{{ fmtDur(selectedNode.avgWait) }}</span>
                  </div>
                  <div class="cf-detail-row">
                    <span>Resources</span
                    ><span>{{ selectedNode.totalAgents }}</span>
                  </div>
                  <div class="cf-detail-sep"></div>
                  <div class="cf-detail-sub">Resource Distribution</div>
                  <div
                    v-for="([agent, count], i) in selectedNode.topAgents"
                    :key="i"
                    class="cf-detail-agent"
                  >
                    <span
                      class="cf-detail-dot"
                      :style="{ background: graph.agentColorMap.get(agent) }"
                    ></span>
                    <span class="cf-detail-agent-name">{{ agent }}</span>
                    <span class="cf-detail-agent-val"
                      >{{ count }} ({{
                        ((count / selectedNode.freq) * 100).toFixed(0)
                      }}%)</span
                    >
                  </div>
                </div>
              </template>

              <!-- ═══ VARIANTS ═══ -->
              <template v-if="graph && activeSection === 'variants'">
                <div class="cf-variants-head">
                  <span>Process Variants</span>
                  <span class="cf-variants-count"
                    >{{ graph.variants.length }} of
                    {{ graph.totalCases }} cases</span
                  >
                </div>
                <div
                  v-for="(v, i) in graph.variants"
                  :key="i"
                  class="cf-variant-row"
                >
                  <div class="cf-variant-rank">#{{ i + 1 }}</div>
                  <div class="cf-variant-flow">
                    <template v-for="(act, ai) in v.sequence" :key="ai">
                      <span class="cf-variant-node">{{ trunc(act, 14) }}</span>
                      <span
                        v-if="ai < v.sequence.length - 1"
                        class="cf-variant-arrow"
                        >&rarr;</span
                      >
                    </template>
                  </div>
                  <div class="cf-variant-meta">
                    <div class="cf-variant-freq">
                      {{ v.freq }} cases ({{ v.pct.toFixed(1) }}%)
                    </div>
                    <div class="cf-variant-dur">
                      {{ fmtDur(v.avgDuration) }} avg
                    </div>
                  </div>
                  <div class="cf-variant-bar-wrap">
                    <div
                      class="cf-variant-bar"
                      :style="{ width: v.pct + '%' }"
                    ></div>
                  </div>
                </div>
              </template>

              <!-- ═══ STATISTICS ═══ -->
              <template v-if="graph && activeSection === 'stats'">
                <div class="cf-stats-grid" v-if="statsData">
                  <div class="cf-stat-card">
                    <div class="cf-stat-val">
                      {{ statsData.totalCases.toLocaleString() }}
                    </div>
                    <div class="cf-stat-label">Cases</div>
                  </div>
                  <div class="cf-stat-card">
                    <div class="cf-stat-val">
                      {{ statsData.totalActivities }}
                    </div>
                    <div class="cf-stat-label">Activities</div>
                  </div>
                  <div class="cf-stat-card">
                    <div class="cf-stat-val">
                      {{ statsData.totalTransitions }}
                    </div>
                    <div class="cf-stat-label">Transitions</div>
                  </div>
                  <div class="cf-stat-card">
                    <div class="cf-stat-val">{{ statsData.variants }}</div>
                    <div class="cf-stat-label">Variants (top 20)</div>
                  </div>
                </div>
                <div class="cf-stats-section" v-if="statsData">
                  <h3>Key Insights</h3>
                  <div class="cf-insight" v-if="statsData.topAct">
                    <span class="cf-insight-icon">#</span>
                    <div>
                      <div class="cf-insight-title">Most Frequent Activity</div>
                      <div class="cf-insight-val">
                        {{ statsData.topAct.label }} ({{
                          statsData.topAct.freq.toLocaleString()
                        }}x)
                      </div>
                    </div>
                  </div>
                  <div class="cf-insight" v-if="statsData.slowest">
                    <span class="cf-insight-icon">&darr;</span>
                    <div>
                      <div class="cf-insight-title">Slowest Activity (avg)</div>
                      <div class="cf-insight-val">
                        {{ statsData.slowest.label }} ({{
                          fmtDur(statsData.slowest.avgDuration)
                        }})
                      </div>
                    </div>
                  </div>
                  <div class="cf-insight" v-if="statsData.highWait">
                    <span class="cf-insight-icon">&#9203;</span>
                    <div>
                      <div class="cf-insight-title">Highest Wait Time</div>
                      <div class="cf-insight-val">
                        {{ statsData.highWait.label }} ({{
                          fmtDur(statsData.highWait.avgWait)
                        }}
                        avg wait)
                      </div>
                    </div>
                  </div>
                  <div class="cf-insight" v-if="statsData.highHandoff">
                    <span class="cf-insight-icon">&harr;</span>
                    <div>
                      <div class="cf-insight-title">Highest Handoff Rate</div>
                      <div class="cf-insight-val">
                        {{ statsData.highHandoff.source }} &rarr;
                        {{ statsData.highHandoff.target }} ({{
                          (statsData.highHandoff.handoffRate * 100).toFixed(0)
                        }}%)
                      </div>
                    </div>
                  </div>
                  <div class="cf-insight" v-if="statsData.singleRes.length > 0">
                    <span class="cf-insight-icon cf-insight-warn">!</span>
                    <div>
                      <div class="cf-insight-title">Single Resource Risk</div>
                      <div class="cf-insight-val">
                        {{ statsData.singleRes.map((n) => n.label).join(", ") }}
                      </div>
                      <div class="cf-insight-sub">
                        Activities performed by only one agent — potential
                        bottleneck
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- ═══ SOCIAL NETWORK ═══ -->
              <template v-if="resAnalytics && activeSection === 'social'">
                <div class="ra-section-head">
                  <span>Social Network Analysis</span>
                  <div class="ra-toggle-group">
                    <button v-for="t in [{id:'handover',l:'Handover'},{id:'working-together',l:'Working Together'},{id:'similar',l:'Similar Activities'}]"
                      :key="t.id" class="ra-toggle-btn" :class="{active: snType === t.id}" @click="snType = t.id">{{t.l}}</button>
                  </div>
                </div>
                <div class="ra-sn-controls">
                  <span class="ra-sn-control-label">Color:</span>
                  <button v-for="c in [{id:'role',l:'Role'},{id:'utilization',l:'Utilization'},{id:'centrality',l:'Centrality'}]"
                    :key="c.id" class="ra-toggle-btn ra-sm" :class="{active: snColorMode === c.id}" @click="snColorMode = c.id">{{c.l}}</button>
                </div>
                <div class="ra-sn-stats" v-if="socialNetwork">
                  <span>{{socialNetwork.nodes.length}} resources</span>
                  <span>{{socialNetwork.totalEdges}} connections</span>
                  <span>{{socialNetwork.totalWeight}} total {{snType === 'handover' ? 'handovers' : snType === 'working-together' ? 'shared cases' : 'shared activities'}}</span>
                </div>
                <div class="ra-sn-wrap" v-if="socialNetwork">
                  <svg :viewBox="`0 0 ${socialNetwork.width} ${socialNetwork.height}`" class="ra-sn-svg">
                    <defs>
                      <marker id="sn-arr" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                        <path d="M1 1L8 4L1 7" fill="none" stroke="var(--text-muted)" stroke-width="1.2" stroke-linecap="round"/>
                      </marker>
                    </defs>
                    <!-- Edges -->
                    <g v-for="e in socialNetwork.edges" :key="e.id">
                      <line :x1="socialNetwork.nodes.find(n=>n.id===e.source)?.x" :y1="socialNetwork.nodes.find(n=>n.id===e.source)?.y"
                            :x2="socialNetwork.nodes.find(n=>n.id===e.target)?.x" :y2="socialNetwork.nodes.find(n=>n.id===e.target)?.y"
                            :stroke="'var(--text-muted)'" :stroke-width="e.width" :opacity="e.opacity"
                            :marker-end="e.directed ? 'url(#sn-arr)' : ''"
                            class="ra-sn-edge" @mouseenter="showSnEdgeTip($event, e)" @mousemove="moveSnTip" @mouseleave="hideSnTip"/>
                      <text v-if="e.weight > 1"
                        :x="((socialNetwork.nodes.find(n=>n.id===e.source)?.x||0)+(socialNetwork.nodes.find(n=>n.id===e.target)?.x||0))/2"
                        :y="((socialNetwork.nodes.find(n=>n.id===e.source)?.y||0)+(socialNetwork.nodes.find(n=>n.id===e.target)?.y||0))/2 - 5"
                        text-anchor="middle" class="ra-sn-edge-label">{{e.weight}}</text>
                    </g>
                    <!-- Nodes -->
                    <g v-for="nd in socialNetwork.nodes" :key="nd.id" class="ra-sn-node"
                       @mouseenter="showSnNodeTip($event, nd)" @mousemove="moveSnTip" @mouseleave="hideSnTip"
                       @click="selectedProfile = selectedProfile === nd.id ? null : nd.id">
                      <circle :cx="nd.x" :cy="nd.y" :r="nd.radius" :fill="snNodeColor(nd)" :opacity="0.85"
                              stroke="var(--surface-overlay-border)" stroke-width="1.5"/>
                      <text :x="nd.x" :y="nd.y + nd.radius + 12" text-anchor="middle" class="ra-sn-node-label">
                        {{nd.label.length > 12 ? nd.label.slice(0,11) + '…' : nd.label}}</text>
                    </g>
                  </svg>
                </div>
                <!-- Resource Profile (click a node) -->
                <template v-if="selectedProfile && resAnalytics.profiles.has(selectedProfile)">
                  <div class="ra-profile">
                    <div class="ra-profile-head">
                      <span class="ra-profile-dot" :style="{background: resAnalytics.agentColorMap.get(selectedProfile)}"></span>
                      <span class="ra-profile-name">{{selectedProfile}}</span>
                      <span class="ra-profile-role">{{resAnalytics.profiles.get(selectedProfile).role}}</span>
                      <button class="cf-clear-btn" @click="selectedProfile = null">Close</button>
                    </div>
                    <div class="ra-profile-grid">
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{resAnalytics.profiles.get(selectedProfile).taskCount}}</div><div class="ra-profile-lbl">Tasks</div></div>
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{resAnalytics.profiles.get(selectedProfile).caseCount}}</div><div class="ra-profile-lbl">Cases</div></div>
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{resAnalytics.profiles.get(selectedProfile).activityCount}}</div><div class="ra-profile-lbl">Activities</div></div>
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{(resAnalytics.profiles.get(selectedProfile).utilization * 100).toFixed(1)}}%</div><div class="ra-profile-lbl">Utilization</div></div>
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{fmtDur(resAnalytics.profiles.get(selectedProfile).avgServiceTime)}}</div><div class="ra-profile-lbl">Avg Service</div></div>
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{resAnalytics.profiles.get(selectedProfile).maxConcurrent}}</div><div class="ra-profile-lbl">Max Parallel</div></div>
                    </div>
                    <div class="ra-profile-sub">Activity Breakdown</div>
                    <div class="ra-profile-acts">
                      <div v-for="a in resAnalytics.profiles.get(selectedProfile).actBreakdown.slice(0, 8)" :key="a.name" class="ra-profile-act-row">
                        <span class="ra-profile-act-name">{{a.name}}</span>
                        <div class="ra-profile-act-bar-wrap"><div class="ra-profile-act-bar" :style="{width: a.pct+'%'}"></div></div>
                        <span class="ra-profile-act-val">{{a.count}} ({{a.pct.toFixed(0)}}%)</span>
                      </div>
                    </div>
                    <div class="ra-profile-sub" v-if="resAnalytics.profiles.get(selectedProfile).topPartners.length">Top Collaborators</div>
                    <div class="ra-profile-partners" v-if="resAnalytics.profiles.get(selectedProfile).topPartners.length">
                      <div v-for="p in resAnalytics.profiles.get(selectedProfile).topPartners" :key="p.agent" class="ra-profile-partner">
                        <span class="ra-profile-dot" :style="{background: p.color}"></span>
                        <span>{{p.agent}}</span>
                        <span class="ra-profile-partner-count">{{p.count}} interactions</span>
                      </div>
                    </div>
                  </div>
                </template>
              </template>

              <!-- ═══ RESOURCE-ACTIVITY MATRIX ═══ -->
              <template v-if="resAnalytics && activeSection === 'matrix'">
                <div class="ra-section-head">
                  <span>Resource-Activity Matrix</span>
                  <div class="ra-toggle-group">
                    <button v-for="m in [{id:'frequency',l:'Frequency'},{id:'duration',l:'Avg Duration'},{id:'wait',l:'Avg Wait'}]"
                      :key="m.id" class="ra-toggle-btn" :class="{active: matrixColorMode === m.id}" @click="matrixColorMode = m.id">{{m.l}}</button>
                  </div>
                </div>
                <div class="ra-matrix-wrap">
                  <table class="ra-matrix-table">
                    <thead>
                      <tr>
                        <th class="ra-matrix-corner">Agent \ Activity</th>
                        <th v-for="act in resAnalytics.matrix.cols" :key="act" class="ra-matrix-col-head"
                            :title="act">{{act.length > 10 ? act.slice(0,9)+'…' : act}}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="agent in resAnalytics.matrix.rows" :key="agent">
                        <td class="ra-matrix-row-head" :title="agent">
                          <span class="ra-matrix-dot" :style="{background: resAnalytics.agentColorMap.get(agent)}"></span>
                          {{agent.length > 14 ? agent.slice(0,13)+'…' : agent}}
                        </td>
                        <td v-for="act in resAnalytics.matrix.cols" :key="act"
                            class="ra-matrix-cell" :style="{background: matrixCellColor(agent, act)}"
                            :title="`${agent} × ${act}: ${matrixCellVal(agent, act) || '—'}`">
                          <span v-if="matrixCellVal(agent, act)">{{matrixCellVal(agent, act)}}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="ra-matrix-legend">
                  <template v-if="matrixColorMode === 'frequency'">
                    <span class="ra-ml-label">Low</span>
                    <div class="ra-ml-gradient" style="background: linear-gradient(90deg, rgba(99,102,241,0.15), rgba(99,102,241,0.9))"></div>
                    <span class="ra-ml-label">High</span>
                  </template>
                  <template v-else>
                    <span class="ra-ml-label">Fast</span>
                    <div class="ra-ml-gradient" style="background: linear-gradient(90deg, #22c55e, #eab308, #ef4444)"></div>
                    <span class="ra-ml-label">Slow</span>
                  </template>
                  <span class="ra-ml-empty">Empty = never performed</span>
                </div>
              </template>

              <!-- ═══ RESOURCE KPIs ═══ -->
              <template v-if="resAnalytics && activeSection === 'kpis'">
                <div class="ra-section-head">
                  <span>Resource KPIs</span>
                </div>
                <!-- Workload Balance -->
                <div class="ra-balance">
                  <div class="ra-balance-cards">
                    <div class="ra-balance-card">
                      <div class="ra-balance-val" :class="{'ra-warn': resAnalytics.giniCoefficient > 0.4, 'ra-danger': resAnalytics.giniCoefficient > 0.6}">
                        {{(resAnalytics.giniCoefficient * 100).toFixed(1)}}%</div>
                      <div class="ra-balance-lbl">Task Gini</div>
                      <div class="ra-balance-sub">{{resAnalytics.giniCoefficient < 0.2 ? 'Well balanced' : resAnalytics.giniCoefficient < 0.4 ? 'Moderate imbalance' : 'Significant imbalance'}}</div>
                    </div>
                    <div class="ra-balance-card">
                      <div class="ra-balance-val" :class="{'ra-warn': resAnalytics.giniDuration > 0.4, 'ra-danger': resAnalytics.giniDuration > 0.6}">
                        {{(resAnalytics.giniDuration * 100).toFixed(1)}}%</div>
                      <div class="ra-balance-lbl">Duration Gini</div>
                      <div class="ra-balance-sub">{{resAnalytics.giniDuration < 0.2 ? 'Even workload' : resAnalytics.giniDuration < 0.4 ? 'Moderate skew' : 'Heavy skew'}}</div>
                    </div>
                    <div class="ra-balance-card">
                      <div class="ra-balance-val">{{resAnalytics.agents.length}}</div>
                      <div class="ra-balance-lbl">Resources</div>
                    </div>
                    <div class="ra-balance-card">
                      <div class="ra-balance-val">{{resAnalytics.totalCases}}</div>
                      <div class="ra-balance-lbl">Cases</div>
                    </div>
                  </div>
                  <!-- Lorenz Curve SVG -->
                  <div class="ra-lorenz-wrap">
                    <div class="ra-lorenz-title">Lorenz Curve — Task Distribution</div>
                    <svg viewBox="0 0 200 200" class="ra-lorenz-svg">
                      <!-- Perfect equality line -->
                      <line x1="20" y1="180" x2="190" y2="10" stroke="var(--text-muted)" stroke-width="0.5" stroke-dasharray="3,2" opacity="0.5"/>
                      <!-- Axes -->
                      <line x1="20" y1="180" x2="190" y2="180" stroke="var(--text-muted)" stroke-width="0.5" opacity="0.4"/>
                      <line x1="20" y1="180" x2="20" y2="10" stroke="var(--text-muted)" stroke-width="0.5" opacity="0.4"/>
                      <!-- Lorenz curve -->
                      <polyline :points="resAnalytics.lorenz.map(p => `${20 + p.x * 170},${180 - p.y * 170}`).join(' ')"
                                fill="none" stroke="var(--accent-primary)" stroke-width="1.5"/>
                      <!-- Shaded area -->
                      <polygon :points="`20,180 ${resAnalytics.lorenz.map(p => `${20 + p.x * 170},${180 - p.y * 170}`).join(' ')} 190,180`"
                               fill="var(--accent-primary)" opacity="0.1"/>
                      <text x="105" y="196" text-anchor="middle" class="ra-lorenz-label">Cumulative % of resources</text>
                      <text x="6" y="95" text-anchor="middle" transform="rotate(-90, 6, 95)" class="ra-lorenz-label">Cumulative % of tasks</text>
                    </svg>
                  </div>
                </div>
                <!-- KPI Table -->
                <div class="ra-kpi-table-wrap">
                  <table class="ra-kpi-table">
                    <thead>
                      <tr>
                        <th class="ra-kpi-th ra-kpi-th-name" @click="toggleKpiSort('agent')">Resource</th>
                        <th class="ra-kpi-th" @click="toggleKpiSort('taskCount')">Tasks <span v-if="kpiSortKey==='taskCount'">{{kpiSortDir==='desc'?'▾':'▴'}}</span></th>
                        <th class="ra-kpi-th" @click="toggleKpiSort('caseCount')">Cases <span v-if="kpiSortKey==='caseCount'">{{kpiSortDir==='desc'?'▾':'▴'}}</span></th>
                        <th class="ra-kpi-th" @click="toggleKpiSort('utilization')">Utilization <span v-if="kpiSortKey==='utilization'">{{kpiSortDir==='desc'?'▾':'▴'}}</span></th>
                        <th class="ra-kpi-th" @click="toggleKpiSort('avgServiceTime')">Avg Service <span v-if="kpiSortKey==='avgServiceTime'">{{kpiSortDir==='desc'?'▾':'▴'}}</span></th>
                        <th class="ra-kpi-th" @click="toggleKpiSort('avgWaitTime')">Avg Wait <span v-if="kpiSortKey==='avgWaitTime'">{{kpiSortDir==='desc'?'▾':'▴'}}</span></th>
                        <th class="ra-kpi-th" @click="toggleKpiSort('throughput')">Throughput <span v-if="kpiSortKey==='throughput'">{{kpiSortDir==='desc'?'▾':'▴'}}</span></th>
                        <th class="ra-kpi-th" @click="toggleKpiSort('handoverOut')">Handoffs Out <span v-if="kpiSortKey==='handoverOut'">{{kpiSortDir==='desc'?'▾':'▴'}}</span></th>
                        <th class="ra-kpi-th" @click="toggleKpiSort('caseDiversity')">Case Diversity <span v-if="kpiSortKey==='caseDiversity'">{{kpiSortDir==='desc'?'▾':'▴'}}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="k in sortedKpis" :key="k.agent" class="ra-kpi-row"
                          @click="selectedProfile = selectedProfile === k.agent ? null : k.agent">
                        <td class="ra-kpi-name">
                          <span class="ra-kpi-dot" :style="{background: k.color}"></span>
                          {{k.agent.length > 16 ? k.agent.slice(0,15)+'…' : k.agent}}
                        </td>
                        <td class="ra-kpi-cell">
                          <div class="ra-kpi-bar-wrap"><div class="ra-kpi-bar" :style="{width: (k.taskCount/resAnalytics.kpiMax.taskCount*100)+'%', background: k.color}"></div></div>
                          <span>{{k.taskCount}}</span>
                        </td>
                        <td class="ra-kpi-cell"><span>{{k.caseCount}}</span></td>
                        <td class="ra-kpi-cell">
                          <div class="ra-kpi-bar-wrap"><div class="ra-kpi-bar" :style="{width: (k.utilization/resAnalytics.kpiMax.utilization*100)+'%', background: k.utilization > 0.8 ? '#ef4444' : k.utilization > 0.5 ? '#eab308' : '#22c55e'}"></div></div>
                          <span>{{(k.utilization * 100).toFixed(1)}}%</span>
                        </td>
                        <td class="ra-kpi-cell"><span>{{fmtDur(k.avgServiceTime)}}</span></td>
                        <td class="ra-kpi-cell"><span>{{fmtDur(k.avgWaitTime)}}</span></td>
                        <td class="ra-kpi-cell"><span>{{k.throughput.toFixed(1)}}/h</span></td>
                        <td class="ra-kpi-cell"><span>{{k.handoverOut}}</span></td>
                        <td class="ra-kpi-cell">
                          <div class="ra-kpi-bar-wrap"><div class="ra-kpi-bar" :style="{width: (k.caseDiversity*100)+'%', background: 'var(--accent-primary)'}"></div></div>
                          <span>{{(k.caseDiversity * 100).toFixed(0)}}%</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <!-- Resource Profile from KPI view -->
                <template v-if="selectedProfile && resAnalytics.profiles.has(selectedProfile)">
                  <div class="ra-profile">
                    <div class="ra-profile-head">
                      <span class="ra-profile-dot" :style="{background: resAnalytics.agentColorMap.get(selectedProfile)}"></span>
                      <span class="ra-profile-name">{{selectedProfile}}</span>
                      <span class="ra-profile-role">{{resAnalytics.profiles.get(selectedProfile).role}}</span>
                      <button class="cf-clear-btn" @click="selectedProfile = null">Close</button>
                    </div>
                    <div class="ra-profile-grid">
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{resAnalytics.profiles.get(selectedProfile).taskCount}}</div><div class="ra-profile-lbl">Tasks</div></div>
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{resAnalytics.profiles.get(selectedProfile).caseCount}}</div><div class="ra-profile-lbl">Cases</div></div>
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{resAnalytics.profiles.get(selectedProfile).activityCount}}</div><div class="ra-profile-lbl">Activities</div></div>
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{(resAnalytics.profiles.get(selectedProfile).utilization * 100).toFixed(1)}}%</div><div class="ra-profile-lbl">Utilization</div></div>
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{fmtDur(resAnalytics.profiles.get(selectedProfile).avgServiceTime)}}</div><div class="ra-profile-lbl">Avg Service</div></div>
                      <div class="ra-profile-stat"><div class="ra-profile-val">{{resAnalytics.profiles.get(selectedProfile).handoverIn}} / {{resAnalytics.profiles.get(selectedProfile).handoverOut}}</div><div class="ra-profile-lbl">Handoffs In/Out</div></div>
                    </div>
                    <div class="ra-profile-sub">Activity Breakdown</div>
                    <div class="ra-profile-acts">
                      <div v-for="a in resAnalytics.profiles.get(selectedProfile).actBreakdown.slice(0, 10)" :key="a.name" class="ra-profile-act-row">
                        <span class="ra-profile-act-name">{{a.name}}</span>
                        <div class="ra-profile-act-bar-wrap"><div class="ra-profile-act-bar" :style="{width: a.pct+'%'}"></div></div>
                        <span class="ra-profile-act-val">{{a.count}} ({{a.pct.toFixed(0)}}%)</span>
                      </div>
                    </div>
                    <div class="ra-profile-sub" v-if="resAnalytics.profiles.get(selectedProfile).topPartners.length">Top Collaborators</div>
                    <div class="ra-profile-partners" v-if="resAnalytics.profiles.get(selectedProfile).topPartners.length">
                      <div v-for="p in resAnalytics.profiles.get(selectedProfile).topPartners" :key="p.agent" class="ra-profile-partner">
                        <span class="ra-profile-dot" :style="{background: p.color}"></span>
                        <span>{{p.agent}}</span>
                        <span class="ra-profile-partner-count">{{p.count}} interactions</span>
                      </div>
                    </div>
                  </div>
                </template>
              </template>
            </div>
          </div>

          <!-- Social Network Tooltip -->
          <div v-if="snTip.show" class="cf-tip" :style="{left: snTip.x+'px', top: snTip.y+'px'}">
            <template v-if="snTip.node">
              <div class="cf-tip-title">{{snTip.node.label}}</div>
              <div class="cf-tip-row"><span class="cf-tip-label">Role</span><span class="cf-tip-val">{{snTip.node.role}}</span></div>
              <div class="cf-tip-row"><span class="cf-tip-label">Tasks</span><span class="cf-tip-val">{{snTip.node.tasks}}</span></div>
              <div class="cf-tip-row"><span class="cf-tip-label">Cases</span><span class="cf-tip-val">{{snTip.node.cases}}</span></div>
              <div class="cf-tip-row"><span class="cf-tip-label">Activities</span><span class="cf-tip-val">{{snTip.node.activities}}</span></div>
              <div class="cf-tip-row"><span class="cf-tip-label">Utilization</span><span class="cf-tip-val">{{(snTip.node.utilization * 100).toFixed(1)}}%</span></div>
              <div class="cf-tip-row"><span class="cf-tip-label">Connections</span><span class="cf-tip-val">{{snTip.node.degree}}</span></div>
              <div class="cf-tip-row"><span class="cf-tip-label">Service Time</span><span class="cf-tip-val">{{fmtDur(snTip.node.totalDur)}}</span></div>
            </template>
            <template v-if="snTip.edge">
              <div class="cf-tip-title">{{snTip.edge.source}} {{snTip.edge.directed ? '→' : '↔'}} {{snTip.edge.target}}</div>
              <div class="cf-tip-row"><span class="cf-tip-label">{{snType === 'handover' ? 'Handovers' : snType === 'working-together' ? 'Shared Cases' : 'Shared Activities'}}</span><span class="cf-tip-val">{{snTip.edge.weight}}</span></div>
            </template>
          </div>

          <!-- Tooltip -->
          <div
            v-if="tip.show"
            class="cf-tip"
            :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
          >
            <div class="cf-tip-title">{{ tip.title }}</div>
            <template v-for="(row, ri) in tip.rows" :key="ri">
              <div v-if="row.sep" class="cf-tip-sep"></div>
              <div v-else class="cf-tip-row" :class="{ 'cf-tip-agent': row.agent }">
                <span v-if="row.color" class="cf-tip-dot" :style="{ background: row.color }"></span>
                <span class="cf-tip-label">{{ row.l }}</span>
                <span class="cf-tip-val">{{ row.v }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ═══ OVERLAY ═══ */
.cf-overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: var(--backdrop-bg, rgba(0, 0, 0, 0.35));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  backdrop-filter: var(--backdrop-blur, blur(4px));
  -webkit-backdrop-filter: var(--backdrop-blur, blur(4px));
}
.cf-overlay-enter-active {
  transition: opacity 0.25s ease;
}
.cf-overlay-enter-active .cf-page {
  transition:
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.25s ease;
}
.cf-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.cf-overlay-leave-active .cf-page {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}
.cf-overlay-enter-from {
  opacity: 0;
}
.cf-overlay-enter-from .cf-page {
  transform: scale(0.95);
  opacity: 0;
}
.cf-overlay-leave-to {
  opacity: 0;
}
.cf-overlay-leave-to .cf-page {
  transform: scale(0.95);
  opacity: 0;
}

/* ═══ PAGE ═══ */
.cf-page {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
  width: 95vw;
  max-width: 1400px;
  height: 90vh;
  border-radius: var(--card-radius, 10px);
  box-shadow: var(--shadow-xl, 0 20px 60px rgba(0, 0, 0, 0.3));
  --surface-overlay: var(--bg-primary);
  --surface-overlay-card: var(--card-bg, rgba(0, 0, 0, 0.03));
  --surface-overlay-border: var(--card-border, rgba(0, 0, 0, 0.08));
  --surface-overlay-input-bg: var(--bg-secondary, rgba(0, 0, 0, 0.03));
  --surface-overlay-input-border: var(--card-border, rgba(0, 0, 0, 0.12));
  --surface-overlay-text: var(--text-primary);
  --surface-overlay-text-muted: var(--text-muted);
}

/* ═══ HEADER ═══ */
.cf-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--surface-overlay-border);
  flex-shrink: 0;
}
.cf-brand {
  font-size: 14px;
  font-weight: 700;
  color: var(--surface-overlay-text);
  white-space: nowrap;
}
.cf-selectors {
  flex: 1;
  display: flex;
  justify-content: center;
}
.cf-sel-input {
  padding: 3px 6px;
  border-radius: 5px;
  border: 1px solid var(--surface-overlay-input-border);
  background: var(--surface-overlay-input-bg);
  color: var(--surface-overlay-text);
  font-size: 11px;
  cursor: pointer;
  max-width: 280px;
}
.cf-modes {
  display: flex;
  gap: 2px;
  background: var(--surface-overlay-card);
  border-radius: 6px;
  padding: 2px;
}
.cf-mode-btn {
  padding: 4px 10px;
  border: none;
  background: none;
  color: var(--surface-overlay-text-muted);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}
.cf-mode-btn.active {
  background: var(--accent-primary);
  color: #fff;
  font-weight: 600;
}
.cf-mode-btn:hover:not(.active) {
  color: var(--surface-overlay-text);
}
.cf-notation-toggle {
  display: flex;
  gap: 2px;
  background: var(--surface-overlay-card);
  border-radius: 6px;
  padding: 2px;
  margin-left: 6px;
}
.cf-notation-btn {
  padding: 4px 8px;
  border: none;
  background: none;
  color: var(--surface-overlay-text-muted);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}
.cf-notation-btn.active {
  background: var(--accent-primary);
  color: #fff;
  font-weight: 600;
}
.cf-notation-btn:hover:not(.active) {
  color: var(--surface-overlay-text);
}
.cf-export-wrap {
  position: relative;
}
.cf-export-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--surface-overlay-border);
  background: var(--surface-overlay-card);
  color: var(--surface-overlay-text);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 5px;
  transition: all 0.15s;
  white-space: nowrap;
}
.cf-export-btn:hover {
  background: var(--surface-overlay-border);
}
.cf-export-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}
.cf-export-caret {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}
.cf-export-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--surface-overlay, var(--bg-primary));
  border: 1px solid var(--surface-overlay-border);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  z-index: 20;
  min-width: 180px;
  padding: 4px;
}
.cf-export-option {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 6px;
  text-align: left;
  transition: background 0.12s;
}
.cf-export-option:hover {
  background: var(--surface-overlay-card);
}
.cf-export-option-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--surface-overlay-text);
}
.cf-export-option-desc {
  font-size: 9px;
  color: var(--surface-overlay-text-muted);
  margin-top: 1px;
}
.cf-close {
  background: none;
  border: none;
  color: var(--accent-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 5px;
  white-space: nowrap;
}
.cf-close:hover {
  background: var(--accent-primary-hover);
}

/* ═══ BODY ═══ */
.cf-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ═══ SIDEBAR ═══ */
.cf-sidebar {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--surface-overlay-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
}
.cf-nav {
  padding: 8px 0;
  border-bottom: 1px solid var(--surface-overlay-border);
}
.cf-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: none;
  color: var(--surface-overlay-text-muted);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.12s,
    color 0.12s;
  border-left: 2px solid transparent;
}
.cf-nav-item:hover {
  background: var(--surface-overlay-card);
  color: var(--surface-overlay-text);
}
.cf-nav-item.active {
  color: var(--accent-primary);
  border-left-color: var(--accent-primary);
  background: var(--surface-overlay-card);
  font-weight: 600;
}
.nav-icon {
  font-size: 12px;
  width: 16px;
  text-align: center;
}
.nav-label {
  font-size: 10px;
}

/* Swimlane toggle */
.cf-swimlane-toggle {
  padding: 6px 10px;
  border-bottom: 1px solid var(--surface-overlay-border);
}
.cf-toggle-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--surface-overlay-text);
  cursor: pointer;
}
.cf-toggle-row input {
  accent-color: var(--accent-primary);
  width: 12px;
  height: 12px;
  cursor: pointer;
}

/* Agent Panel */
.cf-agent-panel {
  padding: 8px 10px;
  border-bottom: 1px solid var(--surface-overlay-border);
}
.cf-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.cf-panel-head span {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--surface-overlay-text-muted);
}
.cf-clear-btn {
  border: none;
  background: none;
  color: var(--accent-danger);
  font-size: 9px;
  cursor: pointer;
  padding: 0;
}
.cf-agent-list {
  max-height: 180px;
  overflow-y: auto;
}
.cf-agent-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--surface-overlay-text);
  cursor: pointer;
  padding: 2px 0;
  border-left: 3px solid transparent;
  padding-left: 4px;
}
.cf-agent-item input {
  accent-color: var(--accent-primary);
  width: 11px;
  height: 11px;
  cursor: pointer;
}
.cf-spotlight-tabs {
  display: flex;
  gap: 2px;
  background: var(--surface-overlay-card);
  border-radius: 5px;
  padding: 2px;
  margin-bottom: 6px;
}
.cf-spotlight-tab {
  flex: 1;
  padding: 3px 0;
  border: none;
  background: none;
  color: var(--surface-overlay-text-muted);
  font-size: 9px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.15s;
  text-align: center;
}
.cf-spotlight-tab.active {
  background: var(--accent-primary);
  color: #fff;
  font-weight: 600;
}
.cf-spotlight-tab:hover:not(.active) {
  color: var(--surface-overlay-text);
}
.cf-role-group {
  margin-bottom: 1px;
}
.cf-role-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--surface-overlay-text);
  cursor: pointer;
  padding: 3px 4px;
  border-left: 3px solid transparent;
  border-radius: 0 3px 3px 0;
  transition: background 0.12s;
}
.cf-role-item:hover {
  background: var(--surface-overlay-card);
}
.cf-role-item input {
  accent-color: var(--accent-primary);
  width: 11px;
  height: 11px;
  cursor: pointer;
}
.cf-role-name {
  flex: 1;
  font-weight: 500;
}
.cf-role-count {
  font-size: 8px;
  color: var(--surface-overlay-text-muted);
  background: var(--surface-overlay-card);
  padding: 1px 4px;
  border-radius: 3px;
  font-variant-numeric: tabular-nums;
}

/* Complexity / thresholds */
.cf-complexity {
  padding: 8px 10px;
  border-bottom: 1px solid var(--surface-overlay-border);
}
.cf-threshold-inline {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cf-threshold-val {
  font-size: 11px;
  font-weight: 600;
  color: var(--surface-overlay-text);
  min-width: 42px;
  font-variant-numeric: tabular-nums;
}
.cf-adj-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--surface-overlay-border);
  background: var(--surface-overlay-card);
  color: var(--surface-overlay-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
  line-height: 1;
  padding: 0;
}
.cf-adj-btn:hover {
  background: var(--surface-overlay-border);
}

/* Legend */
.cf-legend {
  padding: 8px 10px;
  border-bottom: 1px solid var(--surface-overlay-border);
}
.lg-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  color: var(--surface-overlay-text-muted);
  padding: 1px 0;
}
.lg-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}
.lg-sep {
  height: 4px;
}

.cf-reset-btn {
  margin: 8px 10px;
  padding: 5px 8px;
  border: 1px solid var(--surface-overlay-border);
  background: var(--surface-overlay-card);
  color: var(--surface-overlay-text-muted);
  font-size: 10px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.12s;
}
.cf-reset-btn:hover {
  background: var(--surface-overlay-border);
  color: var(--surface-overlay-text);
}

/* ═══ MAIN ═══ */
.cf-main {
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.cf-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--surface-overlay-text-muted);
}
.cf-empty-icon svg {
  width: 64px;
  height: 64px;
  opacity: 0.3;
}
.cf-empty-text {
  font-size: 13px;
  margin-top: 12px;
}

/* ═══ SVG PROCESS MAP ═══ */
.cf-svg {
  flex: 1;
  width: 100%;
  cursor: grab;
  background: var(--surface-overlay-card);
  background-image: radial-gradient(
    circle,
    var(--border-secondary, #eee) 0.5px,
    transparent 0.5px
  );
  background-size: 20px 20px;
}
.cf-svg.panning {
  cursor: grabbing;
}
.cf-edge {
  cursor: pointer;
  transition: opacity 0.2s;
}
.cf-edge:hover {
  opacity: 1 !important;
}
.cf-edge-freq {
  font-size: 8px;
  fill: var(--text-muted);
  font-weight: 600;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}
.cf-node-group {
  cursor: pointer;
  transition: opacity 0.2s;
}
.cf-node-group:hover rect:first-child {
  filter: brightness(1.08);
}
.cf-node-label {
  font-size: 11px;
  fill: #fff;
  font-weight: 700;
  pointer-events: none;
}
.cf-node-sub {
  font-size: 8.5px;
  fill: rgba(255, 255, 255, 0.85);
  font-weight: 500;
  pointer-events: none;
}
.cf-node-label-bpmn {
  font-size: 11px;
  fill: var(--text-primary);
  font-weight: 700;
  pointer-events: none;
}
.cf-node-sub-bpmn {
  font-size: 8.5px;
  fill: var(--text-muted);
  font-weight: 500;
  pointer-events: none;
}
.cf-lane-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.cf-start-end-label {
  font-size: 10px;
  fill: var(--text-primary);
  font-weight: 600;
  pointer-events: none;
}
.cf-start-end-freq {
  font-size: 8px;
  fill: var(--text-muted);
  font-weight: 600;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}

/* Zoom controls */
.cf-zoom-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  background: var(--surface-overlay);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 6px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.cf-zoom-btn {
  width: 28px;
  height: 26px;
  border: none;
  background: none;
  color: var(--surface-overlay-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cf-zoom-btn:hover {
  background: var(--surface-overlay-card);
}
.cf-zoom-label {
  font-size: 9px;
  font-weight: 600;
  color: var(--surface-overlay-text-muted);
  padding: 0 5px;
  border-left: 1px solid var(--surface-overlay-border);
  border-right: 1px solid var(--surface-overlay-border);
  line-height: 26px;
}

/* Detail panel */
.cf-detail {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 220px;
  max-height: calc(100% - 24px);
  overflow-y: auto;
  background: var(--surface-overlay);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 10px;
  padding: 10px 12px;
  box-shadow: var(--shadow-md);
  z-index: 10;
}
.cf-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 700;
  color: var(--surface-overlay-text);
  margin-bottom: 8px;
}
.cf-detail-close {
  border: none;
  background: none;
  font-size: 16px;
  color: var(--surface-overlay-text-muted);
  cursor: pointer;
  padding: 0 2px;
}
.cf-detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  padding: 2px 0;
  color: var(--surface-overlay-text);
}
.cf-detail-row span:first-child {
  color: var(--surface-overlay-text-muted);
}
.cf-detail-sep {
  height: 1px;
  background: var(--surface-overlay-border);
  margin: 6px 0;
}
.cf-detail-sub {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--surface-overlay-text-muted);
  margin-bottom: 4px;
}
.cf-detail-agent {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 1px 0;
}
.cf-detail-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cf-detail-agent-name {
  flex: 1;
  color: var(--surface-overlay-text);
}
.cf-detail-agent-val {
  color: var(--surface-overlay-text-muted);
  font-variant-numeric: tabular-nums;
}

/* ═══ VARIANTS ═══ */
.cf-variants-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 12px 16px 8px;
}
.cf-variants-head span:first-child {
  font-size: 13px;
  font-weight: 700;
  color: var(--surface-overlay-text);
}
.cf-variants-count {
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
}
.cf-variant-row {
  padding: 8px 16px;
  border-bottom: 1px solid var(--surface-overlay-border);
  display: flex;
  align-items: center;
  gap: 12px;
}
.cf-variant-row:hover {
  background: var(--surface-overlay-card);
}
.cf-variant-rank {
  font-size: 11px;
  font-weight: 700;
  color: var(--surface-overlay-text-muted);
  width: 28px;
  flex-shrink: 0;
}
.cf-variant-flow {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  flex-wrap: wrap;
  min-width: 0;
}
.cf-variant-node {
  padding: 2px 6px;
  background: var(--accent-primary);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  border-radius: 4px;
  white-space: nowrap;
}
.cf-variant-arrow {
  color: var(--surface-overlay-text-muted);
  font-size: 10px;
}
.cf-variant-meta {
  flex-shrink: 0;
  text-align: right;
  min-width: 100px;
}
.cf-variant-freq {
  font-size: 11px;
  font-weight: 600;
  color: var(--surface-overlay-text);
}
.cf-variant-dur {
  font-size: 9px;
  color: var(--surface-overlay-text-muted);
}
.cf-variant-bar-wrap {
  width: 80px;
  height: 6px;
  background: var(--surface-overlay-border);
  border-radius: 3px;
  flex-shrink: 0;
  overflow: hidden;
}
.cf-variant-bar {
  height: 100%;
  background: var(--accent-primary);
  border-radius: 3px;
  transition: width 0.3s;
}

/* ═══ STATISTICS ═══ */
.cf-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 12px 16px;
}
.cf-stat-card {
  background: var(--surface-overlay-card);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}
.cf-stat-val {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent-primary);
  font-variant-numeric: tabular-nums;
}
.cf-stat-label {
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
  margin-top: 2px;
}
.cf-stats-section {
  padding: 12px 16px;
}
.cf-stats-section h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--surface-overlay-text);
  margin-bottom: 10px;
}
.cf-insight {
  display: flex;
  gap: 10px;
  padding: 8px 10px;
  background: var(--surface-overlay-card);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 8px;
  margin-bottom: 8px;
}
.cf-insight-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary);
  color: #fff;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}
.cf-insight-icon.cf-insight-warn {
  background: #fbbf24;
  color: #000;
}
.cf-insight-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--surface-overlay-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.cf-insight-val {
  font-size: 12px;
  font-weight: 600;
  color: var(--surface-overlay-text);
  margin-top: 2px;
}
.cf-insight-sub {
  font-size: 9px;
  color: var(--surface-overlay-text-muted);
  font-style: italic;
  margin-top: 2px;
}
.cf-main {
  overflow-y: auto;
}

/* ═══ BPMN SWIMLANE VIEW ═══ */
.bpmn-scroll-hint {
  font-size: 10px;
  color: var(--surface-overlay-text-muted);
  padding: 4px 12px 0;
  opacity: 0.5;
}
.bpmn-scroll-wrap {
  flex: 1;
  overflow-x: auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px;
}
.bpmn-svg {
  display: block;
  min-width: 100%;
}
.bpmn-lane-title {
  font-size: 11px;
  font-weight: 700;
  fill: var(--surface-overlay-text);
}
.bpmn-lane-sub {
  font-size: 9px;
  fill: var(--surface-overlay-text-muted);
}
.bpmn-act-group {
  cursor: pointer;
  transition: opacity 0.15s;
}
.bpmn-act-group:hover rect:first-child {
  filter: brightness(1.05);
  stroke-width: 1.5;
}
.bpmn-act-label {
  font-size: 10px;
  font-weight: 600;
  fill: var(--surface-overlay-text);
  pointer-events: none;
}
.bpmn-gw-x {
  font-size: 10px;
  font-weight: 700;
  fill: var(--text-primary);
  pointer-events: none;
}
.bpmn-pct-label {
  font-size: 8px;
  fill: var(--surface-overlay-text-muted);
  font-weight: 600;
}

/* ═══ RESOURCE INSIGHTS ═══ */
.cf-resource-panel {
  padding: 8px 10px;
  border-bottom: 1px solid var(--surface-overlay-border);
}
.cf-ri-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--surface-overlay-text);
  cursor: pointer;
  padding: 3px 4px;
  border-radius: 4px;
  transition: background 0.12s;
}
.cf-ri-toggle:hover {
  background: var(--surface-overlay-card);
}
.cf-ri-toggle.active {
  background: var(--surface-overlay-card);
}
.cf-ri-toggle input {
  accent-color: var(--accent-primary);
  width: 11px;
  height: 11px;
  cursor: pointer;
}
.cf-ri-label {
  flex: 1;
  font-weight: 500;
}
.cf-ri-badge {
  font-size: 8px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 8px;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.cf-ri-badge-red {
  background: #ef4444;
}
.cf-ri-badge-orange {
  background: #f97316;
}
.cf-ri-slider-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px 2px;
  overflow: hidden;
  min-width: 0;
}
.cf-ri-slider-label {
  font-size: 9px;
  color: var(--surface-overlay-text-muted);
  font-weight: 500;
  white-space: nowrap;
}
.cf-ri-slider {
  flex: 1;
  min-width: 0;
  height: 14px;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
}
.cf-ri-slider::-webkit-slider-runnable-track {
  height: 3px;
  background: var(--surface-overlay-border);
  border-radius: 2px;
}
.cf-ri-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-primary);
  border: 2px solid var(--surface-overlay, var(--bg-primary));
  box-shadow: 0 0 0 1px var(--surface-overlay-border);
  margin-top: -5px;
  cursor: pointer;
}
.cf-ri-slider::-moz-range-track {
  height: 3px;
  background: var(--surface-overlay-border);
  border-radius: 2px;
  border: none;
}
.cf-ri-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-primary);
  border: 2px solid var(--surface-overlay, var(--bg-primary));
  box-shadow: 0 0 0 1px var(--surface-overlay-border);
  cursor: pointer;
}
.cf-ri-slider-val {
  font-size: 10px;
  font-weight: 700;
  color: var(--surface-overlay-text);
  min-width: 14px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.cf-ri-handoffs {
  margin-top: 6px;
}
.cf-ri-handoffs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: none;
  background: none;
  color: var(--surface-overlay-text-muted);
  font-size: 9px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.cf-ri-handoff-list {
  margin-top: 3px;
}
.cf-ri-handoff-item {
  display: flex;
  flex-direction: column;
  padding: 3px 4px;
  font-size: 9px;
  cursor: pointer;
  border-radius: 3px;
  transition: background 0.12s;
  gap: 1px;
}
.cf-ri-handoff-item:hover {
  background: var(--surface-overlay-card);
}
.cf-ri-handoff-item.highlighted {
  background: var(--accent-primary);
  color: #fff;
}
.cf-ri-handoff-item.highlighted .cf-ri-handoff-count,
.cf-ri-handoff-item.highlighted .cf-ri-handoff-arrow {
  color: rgba(255, 255, 255, 0.7);
}
.cf-ri-handoff-item.highlighted .cf-ri-handoff-from,
.cf-ri-handoff-item.highlighted .cf-ri-handoff-to {
  color: #fff;
}
.cf-ri-handoff-agents {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.cf-ri-handoff-from,
.cf-ri-handoff-to {
  color: var(--surface-overlay-text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.cf-ri-handoff-arrow {
  color: var(--surface-overlay-text-muted);
  flex-shrink: 0;
  font-size: 8px;
}
.cf-ri-handoff-count {
  color: var(--surface-overlay-text-muted);
  font-variant-numeric: tabular-nums;
  font-size: 8px;
}
.cf-ri-handoff-empty {
  font-size: 9px;
  color: var(--surface-overlay-text-muted);
  padding: 4px;
  font-style: italic;
}

/* Bottleneck pulse animation */
@keyframes bottleneck-pulse {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 0.3;
  }
}
.cf-bottleneck-pulse {
  animation: bottleneck-pulse 2s ease-in-out infinite;
}

/* ═══ TOOLTIP ═══ */
.cf-tip {
  position: fixed;
  z-index: 600;
  background: var(--surface-overlay, #1e1e2e);
  border: 1px solid var(--surface-overlay-border);
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: var(--shadow-md);
  pointer-events: none;
  max-width: 260px;
}
.cf-tip-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--surface-overlay-text);
  margin-bottom: 4px;
}
.cf-tip-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 10px;
  padding: 1px 0;
}
.cf-tip-label {
  color: var(--surface-overlay-text-muted);
}
.cf-tip-val {
  color: var(--surface-overlay-text);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.cf-tip-sep {
  height: 1px;
  background: var(--surface-overlay-border);
  margin: 4px 0;
}
.cf-tip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cf-tip-agent {
  font-size: 9px;
  padding: 0.5px 0;
}
.cf-tip-agent .cf-tip-label {
  opacity: 0.8;
}

/* ═══ RESOURCE ANALYTICS SHARED ═══ */
.ra-section-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px 10px; gap: 12px; flex-wrap: wrap;
  border-bottom: 1px solid var(--surface-overlay-border);
}
.ra-section-head > span { font-weight: 700; font-size: 14px; color: var(--text-primary); }
.ra-toggle-group { display: flex; gap: 2px; }
.ra-toggle-btn {
  padding: 4px 10px; font-size: 10px; font-weight: 600; border: none;
  border-radius: 4px; cursor: pointer; transition: all 0.15s;
  background: var(--surface-overlay-card); color: var(--text-muted);
}
.ra-toggle-btn.active { background: var(--accent-primary); color: #fff; }
.ra-toggle-btn.ra-sm { padding: 2px 7px; font-size: 9px; }

/* ═══ SOCIAL NETWORK ═══ */
.ra-sn-controls { display: flex; align-items: center; gap: 6px; padding: 6px 20px; }
.ra-sn-control-label { font-size: 9px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.ra-sn-stats { display: flex; gap: 16px; padding: 2px 20px 8px; font-size: 10px; color: var(--text-muted); }
.ra-sn-wrap { flex: 1; min-height: 300px; padding: 0 10px; }
.ra-sn-svg { width: 100%; height: 100%; min-height: 400px; }
.ra-sn-edge { cursor: pointer; }
.ra-sn-edge:hover { opacity: 1 !important; }
.ra-sn-edge-label { font-size: 8px; fill: var(--text-muted); font-weight: 600; pointer-events: none; }
.ra-sn-node { cursor: pointer; transition: transform 0.15s; }
.ra-sn-node:hover circle { stroke-width: 2.5; stroke: var(--accent-primary); }
.ra-sn-node-label { font-size: 9px; fill: var(--text-primary); font-weight: 600; pointer-events: none; }

/* ═══ RESOURCE PROFILE ═══ */
.ra-profile {
  margin: 12px 16px; padding: 12px 14px;
  background: var(--surface-overlay-card); border: 1px solid var(--surface-overlay-border);
  border-radius: 8px;
}
.ra-profile-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.ra-profile-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.ra-profile-name { font-weight: 700; font-size: 13px; color: var(--text-primary); }
.ra-profile-role { font-size: 10px; color: var(--text-muted); flex: 1; }
.ra-profile-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
.ra-profile-stat { text-align: center; padding: 6px 4px; background: var(--surface-overlay, var(--bg-primary)); border-radius: 6px; }
.ra-profile-val { font-weight: 700; font-size: 14px; color: var(--text-primary); }
.ra-profile-lbl { font-size: 9px; color: var(--text-muted); margin-top: 1px; }
.ra-profile-sub { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin: 8px 0 4px; }
.ra-profile-acts { display: flex; flex-direction: column; gap: 3px; }
.ra-profile-act-row { display: flex; align-items: center; gap: 6px; font-size: 10px; }
.ra-profile-act-name { width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); flex-shrink: 0; }
.ra-profile-act-bar-wrap { flex: 1; height: 6px; background: var(--surface-overlay, var(--bg-primary)); border-radius: 3px; overflow: hidden; }
.ra-profile-act-bar { height: 100%; background: var(--accent-primary); border-radius: 3px; }
.ra-profile-act-val { font-size: 9px; color: var(--text-muted); width: 60px; text-align: right; flex-shrink: 0; }
.ra-profile-partners { display: flex; flex-direction: column; gap: 3px; }
.ra-profile-partner { display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--text-primary); }
.ra-profile-partner-count { margin-left: auto; font-size: 9px; color: var(--text-muted); }

/* ═══ RESOURCE-ACTIVITY MATRIX ═══ */
.ra-matrix-wrap { overflow: auto; padding: 10px 16px; flex: 1; }
.ra-matrix-table { border-collapse: collapse; font-size: 10px; width: 100%; }
.ra-matrix-corner { position: sticky; left: 0; top: 0; z-index: 3;
  background: var(--surface-overlay, var(--bg-primary)); padding: 6px 8px;
  font-weight: 600; color: var(--text-muted); text-align: left; font-size: 9px;
  border-bottom: 1px solid var(--surface-overlay-border); border-right: 1px solid var(--surface-overlay-border);
}
.ra-matrix-col-head {
  padding: 4px 6px; font-weight: 600; color: var(--text-primary); text-align: center;
  writing-mode: vertical-lr; transform: rotate(180deg); min-width: 28px; max-width: 28px;
  font-size: 9px; position: sticky; top: 0; z-index: 2;
  background: var(--surface-overlay, var(--bg-primary));
  border-bottom: 1px solid var(--surface-overlay-border);
}
.ra-matrix-row-head {
  position: sticky; left: 0; z-index: 1; padding: 3px 8px;
  background: var(--surface-overlay, var(--bg-primary)); font-weight: 600; color: var(--text-primary);
  white-space: nowrap; border-right: 1px solid var(--surface-overlay-border);
  display: flex; align-items: center; gap: 4px;
}
.ra-matrix-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.ra-matrix-cell {
  padding: 2px 4px; text-align: center; font-size: 9px; color: var(--text-primary);
  min-width: 28px; border: 1px solid var(--surface-overlay-border); font-weight: 500;
  cursor: default; transition: opacity 0.1s;
}
.ra-matrix-cell:hover { opacity: 0.8; outline: 1px solid var(--accent-primary); }
.ra-matrix-legend { display: flex; align-items: center; gap: 8px; padding: 8px 20px; font-size: 9px; color: var(--text-muted); }
.ra-ml-label { font-weight: 600; }
.ra-ml-gradient { width: 80px; height: 8px; border-radius: 4px; }
.ra-ml-empty { margin-left: auto; font-style: italic; }

/* ═══ RESOURCE KPIs ═══ */
.ra-balance { padding: 12px 16px; display: flex; gap: 16px; flex-wrap: wrap; }
.ra-balance-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; flex: 1; min-width: 180px; }
.ra-balance-card { padding: 10px 12px; background: var(--surface-overlay-card); border: 1px solid var(--surface-overlay-border); border-radius: 8px; text-align: center; }
.ra-balance-val { font-size: 20px; font-weight: 800; color: var(--text-primary); }
.ra-balance-val.ra-warn { color: #eab308; }
.ra-balance-val.ra-danger { color: #ef4444; }
.ra-balance-lbl { font-size: 10px; color: var(--text-muted); font-weight: 600; }
.ra-balance-sub { font-size: 9px; color: var(--text-muted); margin-top: 2px; }
.ra-lorenz-wrap { min-width: 200px; max-width: 240px; }
.ra-lorenz-title { font-size: 10px; font-weight: 600; color: var(--text-muted); text-align: center; margin-bottom: 4px; }
.ra-lorenz-svg { width: 100%; }
.ra-lorenz-label { font-size: 7px; fill: var(--text-muted); }

.ra-kpi-table-wrap { overflow: auto; padding: 0 16px 16px; flex: 1; }
.ra-kpi-table { border-collapse: collapse; width: 100%; font-size: 10px; }
.ra-kpi-th {
  padding: 6px 8px; font-weight: 700; color: var(--text-muted); text-align: left;
  border-bottom: 2px solid var(--surface-overlay-border); cursor: pointer; white-space: nowrap;
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; user-select: none;
}
.ra-kpi-th:hover { color: var(--text-primary); }
.ra-kpi-th-name { min-width: 120px; }
.ra-kpi-row { cursor: pointer; transition: background 0.1s; }
.ra-kpi-row:hover { background: var(--surface-overlay-card); }
.ra-kpi-name {
  padding: 5px 8px; font-weight: 600; color: var(--text-primary);
  display: flex; align-items: center; gap: 6px; white-space: nowrap;
  border-bottom: 1px solid var(--surface-overlay-border);
}
.ra-kpi-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ra-kpi-cell {
  padding: 5px 8px; color: var(--text-primary); white-space: nowrap;
  border-bottom: 1px solid var(--surface-overlay-border);
}
.ra-kpi-bar-wrap { display: inline-block; width: 50px; height: 5px; background: var(--surface-overlay, var(--bg-primary)); border-radius: 3px; overflow: hidden; vertical-align: middle; margin-right: 4px; }
.ra-kpi-bar { height: 100%; border-radius: 3px; transition: width 0.3s; }
</style>

# RETrace Studio

**Resource. Event. Trace.**

A browser-based process mining visualisation tool for exploring simulated event logs. Built with Vue 3, Pinia, and Vite.

**Live:** [bjornkoemans.nl/retrace-studio](https://bjornkoemans.nl/retrace-studio) · [retrace-studio.org](https://retrace-studio.org)

## Origin

RETrace Studio grew out of [master-cope](https://github.com/bjornkoemans/master-cope), a Multi-Agent Reinforcement Learning system for business-process resource allocation. The MARL training pipeline produces CSV event logs that needed an interactive viewer to inspect agent behaviour, queue dynamics, and case flow. Rather than embed yet another visualisation layer in the research codebase, the viewer was extracted into a standalone Vue 3 app — and is now usable on any process-mining event log that follows the CSV schema below.

## Features

- **Timeline View** — Horizontal swimlane chart showing tasks per agent with colour-coded cases
- **Canvas Rendering** — High-performance canvas-based lane rendering with smart viewport buffering
- **Search & Filter** — Query tasks by name, agent, duration (`wait:>5m`, `service:<30s`), or case/task ID
- **Keyboard Navigation** — Tab through tasks, Ctrl+click to select, arrow keys to navigate
- **Tooltips** — Rich tooltips with predecessors/successors, concurrent agents, and mini-timeline
- **Annotations** — Double-click the time axis to add timeline annotations
- **Track Management** — Drag-reorder tracks and agent lanes, sort by name/utilisation/workload
- **Case Flow Diagram** — SVG swimlane with bottleneck detection
- **Heatmap Overview** — Dense canvas-based view for 50+ agents (6px/row, click to expand)
- **Duration Distribution** — Histogram of task durations with percentile markers
- **Comparison Studio** — Side-by-side comparison of two tracks with statistical analysis
- **Process Mining Stats** — Cycle time, flow efficiency, utilisation, throughput, WIP (Little's Law)
- **Assignment Markers** — Visualise volunteer/fallback/collab assignment types
- **Export** — Screenshot (PNG) and statistics (CSV)
- **Dark / Light Theme** — Full theme support with 170+ CSS custom properties
- **Playback** — Animated playback of the timeline with adjustable speed
- **Collaborative Tasks** — Visual indicators for multi-agent tasks with dashed borders

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and click **+ Import** to load a results folder containing CSV event logs.

## Build

```bash
npm run build
npm run preview
```

## CSV Format

RETrace Studio accepts CSV files with the following columns:

| Column | Required | Description |
|--------|----------|-------------|
| `case_id` | Yes | Case identifier |
| `task_id` | Yes | Task identifier (unique within a case) |
| `agent` | Yes | Agent/resource name |
| `task_start_time` | Yes | Task start timestamp |
| `task_completed_time` | Yes | Task completion timestamp |
| `task_assigned_time` | No | Assignment timestamp (enables wait blocks) |
| `task_name` | No | Activity/task name |
| `task_agents_required` | No | Number of agents needed (enables collab detection) |
| `task_assignment_type` | No | Assignment type (e.g. `volunteer_single`, `fallback_random`) |
| `volunteer_ids` | No | Comma-separated IDs of agents that volunteered |

## Tech Stack

- [Vue 3](https://vuejs.org/) with `<script setup>` and Composition API
- [Pinia](https://pinia.vuejs.org/) for state management (setup syntax)
- [Vite 5](https://vitejs.dev/) for development and building
- [html2canvas](https://html2canvas.hertzen.com/) for PNG export
- Canvas 2D API for high-performance lane rendering
- SVG for charts, markers, and diagrams
- CSS custom properties for theming

## License

MIT

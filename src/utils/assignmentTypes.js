// Assignment type definitions: SVG icons, labels, colors
// Shared across AgentLane, TaskTooltip, ComparisonOverlay

const VB = 10 // viewBox size

// All shapes target ~8×8 visual bounding box, centered at x=5
// Triangles: 7w × 7h + 1.5 stroke ≈ 8.5 visual
// Squares:   7w × 7h (filled) or 7+1.5 stroke ≈ 8.5 visual (open)
// Diamond:   5.5×5.5 rotated 45° → diagonal ≈ 7.8, + stroke ≈ 8.5
// Circle:    r=4 → diameter 8
const AT_SVGS = {
  solo_volunteer:                  `<path d="M1.5 1 L5 8 L8.5 1 Z" fill="none" stroke="C" stroke-width="1.5" stroke-linejoin="round"/>`,
  solo_volunteer_random:           `<path d="M1.5 1 L5 8 L8.5 1 Z" fill="C" stroke="C" stroke-width="1.5" stroke-linejoin="round"/>`,
  solo_fallback_random:            `<rect x="2.25" y="1.75" width="5.5" height="5.5" rx="1" fill="C" transform="rotate(45 5 4.5)"/>`,
  collab_volunteer:                `<rect x="1" y="0.5" width="8" height="8" rx="1" fill="none" stroke="C" stroke-width="1.5"/>`,
  collab_volunteer_all_random:     `<rect x="1" y="0.5" width="8" height="8" rx="1" fill="C"/>`,
  collab_volunteer_partial_random: `<rect x="1" y="0.5" width="8" height="8" rx="1" fill="none" stroke="C" stroke-width="1.5"/><rect x="3.25" y="2.75" width="3.5" height="3.5" rx="0.5" fill="C"/>`,
  collab_fallback_random:          `<rect x="2.25" y="1.75" width="5.5" height="5.5" rx="1" fill="C" transform="rotate(45 5 4.5)"/>`,
  ground_truth:                    `<circle cx="5" cy="4.5" r="4" fill="C"/>`,
  assigned:                        `<circle cx="5" cy="4.5" r="3.25" fill="none" stroke="C" stroke-width="1.5"/>`,
}

export function markerSvg(type, color, size = 9) {
  const inner = AT_SVGS[type] || AT_SVGS.assigned
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}">${inner.replaceAll('C', color)}</svg>`
}

export const AT_LABELS = {
  solo_volunteer: 'Volunteered',
  solo_volunteer_random: 'Volunteer (random pick)',
  solo_fallback_random: 'No volunteers (fallback)',
  collab_volunteer: 'Collab: exact volunteer match',
  collab_volunteer_all_random: 'Collab: all volunteered (random pick)',
  collab_volunteer_partial_random: 'Collab: partly volunteered (random pick)',
  collab_fallback_random: 'Collab: no volunteers (fallback)',
  ground_truth: 'Ground truth',
}

export const AT_COLORS = {
  solo_volunteer:                  '#22c55e',
  solo_volunteer_random:           '#eab308',
  solo_fallback_random:            '#ef4444',
  collab_volunteer:                '#06b6d4',
  collab_volunteer_all_random:     '#14b8a6',
  collab_volunteer_partial_random: '#f97316',
  collab_fallback_random:          '#be123c',
  ground_truth:                    '#3b82f6',
}

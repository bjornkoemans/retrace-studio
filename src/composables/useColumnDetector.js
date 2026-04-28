/**
 * Auto-detect column mappings from CSV headers.
 *
 * Required columns (at least these must be mapped):
 *   - caseId:    case identifier
 *   - resource:  agent / resource name
 *   - startTime: task start timestamp
 *   - endTime:   task end timestamp
 *
 * Optional but useful:
 *   - activityName:    task / activity name
 *   - activityId:      task / activity numeric id
 *   - resourceId:      agent / resource numeric id
 *   - assignedTime:    moment of assignment (enables wait-block)
 *   - agentsRequired:  n_agents_required (enables collab detection)
 *   - assignmentType:  volunteer_single etc. (enables markers)
 *   - volunteers:      comma-separated volunteer ids
 */

// Each mapping target gets a list of patterns to match against (case-insensitive).
// Patterns are tested in order; first match wins.
const COLUMN_PATTERNS = {
  caseId: [
    /^case[\s_-]?id$/i,
    /^case$/i,
    /^case[\s_-]?nr$/i,
    /^case[\s_-]?number$/i,
    /^case[\s_-]?key$/i,
    /^process[\s_-]?id$/i,
    /^trace[\s_-]?id$/i,
  ],
  activityName: [
    /^task[\s_-]?name$/i,
    /^activity[\s_-]?name$/i,
    /^activity$/i,
    /^event$/i,
    /^event[\s_-]?name$/i,
    /^concept:name$/i,
    /^action$/i,
  ],
  activityId: [/^task[\s_-]?id$/i, /^activity[\s_-]?id$/i, /^event[\s_-]?id$/i],
  resource: [
    /^task[\s_-]?agent[\s_-]?name$/i,
    /^resource[\s_-]?name$/i,
    /^resource$/i,
    /^agent[\s_-]?name$/i,
    /^agent$/i,
    /^org:resource$/i,
    /^performer$/i,
    /^worker$/i,
    /^employee$/i,
  ],
  resourceId: [
    /^task[\s_-]?agent[\s_-]?id$/i,
    /^resource[\s_-]?id$/i,
    /^agent[\s_-]?id$/i,
  ],
  startTime: [
    /^task[\s_-]?started?[\s_-]?time$/i,
    /^start[\s_-]?time$/i,
    /^start[\s_-]?timestamp$/i,
    /^start$/i,
    /^begin$/i,
    /^time:timestamp$/i,
    /^timestamp$/i,
    /^event[\s_-]?time$/i,
  ],
  endTime: [
    /^task[\s_-]?completed?[\s_-]?time$/i,
    /^end[\s_-]?time$/i,
    /^complete[\s_-]?time$/i,
    /^completion[\s_-]?time$/i,
    /^end[\s_-]?timestamp$/i,
    /^end$/i,
    /^finish$/i,
    /^completed?$/i,
  ],
  assignedTime: [
    /^task[\s_-]?assigned[\s_-]?time$/i,
    /^assigned[\s_-]?time$/i,
    /^assign[\s_-]?time(?:stamp)?$/i,
    /^assigned[\s_-]?(?:timestamp)$/i,
    /^assigned$/i,
    /^allocation[\s_-]?time$/i,
  ],
  agentsRequired: [
    /^task[\s_-]?agents?[\s_-]?required$/i,
    /^agents?[\s_-]?required$/i,
    /^n[\s_-]?agents$/i,
    /^required[\s_-]?agents$/i,
  ],
  assignmentType: [
    /^task[\s_-]?assignment[\s_-]?type$/i,
    /^assignment[\s_-]?type$/i,
  ],
  volunteers: [/^task[\s_-]?volunteers?$/i, /^volunteers?$/i],
};

// Which mappings are required for minimal functionality
export const REQUIRED_MAPPINGS = ["caseId", "resource", "startTime", "endTime"];

// Human-readable labels for mapping fields
export const MAPPING_LABELS = {
  caseId: "Case ID",
  resource: "Resource / Agent",
  startTime: "Start Time",
  endTime: "End Time",
  activityName: "Activity Name",
  activityId: "Activity ID",
  resourceId: "Resource ID",
  assignedTime: "Assigned Time",
  agentsRequired: "Agents Required",
  assignmentType: "Assignment Type",
  volunteers: "Volunteers",
};

// Short format description for each field
export const MAPPING_DESCRIPTIONS = {
  caseId: "Numeric or string identifier for each case/process instance",
  resource: "Name of the agent or resource performing the task",
  startTime: "ISO 8601 datetime or epoch seconds (e.g. 2024-01-15T09:30:00)",
  endTime: "ISO 8601 datetime or epoch seconds (e.g. 2024-01-15T10:00:00)",
  activityName: "Human-readable name of the task or activity",
  activityId: "Numeric identifier for the task type",
  resourceId: "Numeric identifier for the agent/resource",
  assignedTime: "When the task was assigned (before start). Enables wait blocks",
  agentsRequired: "Number of agents needed (integer). Enables collaboration detection",
  assignmentType: "e.g. volunteer_single, fallback_random. Enables assignment markers",
  volunteers: "Comma-separated IDs of agents that volunteered",
};

// Group fields into categories for the UI
export const MAPPING_CATEGORIES = [
  {
    label: "Identification",
    description: "Required columns to identify cases and activities",
    fields: ["caseId", "activityName", "activityId"],
  },
  {
    label: "Resources",
    description: "Who performs each task",
    fields: ["resource", "resourceId"],
  },
  {
    label: "Timing",
    description: "When tasks start and end (ISO 8601 or epoch seconds)",
    fields: ["startTime", "endTime", "assignedTime"],
  },
  {
    label: "Collaboration & Assignment",
    description: "Optional: multi-agent task info and volunteering",
    fields: ["agentsRequired", "assignmentType", "volunteers"],
  },
];

/**
 * Given a list of CSV header strings, return a mapping object
 * { caseId: 'actual_header', startTime: 'actual_header', ... }
 *
 * Unmatched targets will have value null.
 */
export function detectColumns(headers) {
  const mapping = {};
  const usedHeaders = new Set();

  // For each target field, try to find a matching header
  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    for (const pattern of patterns) {
      const match = headers.find(
        (h) => pattern.test(h.trim()) && !usedHeaders.has(h.trim())
      );
      if (match) {
        mapping[field] = match.trim();
        usedHeaders.add(match.trim());
        break;
      }
    }
    if (!mapping[field]) {
      mapping[field] = null;
    }
  }

  return mapping;
}

/**
 * Check if the minimum required columns are mapped.
 * Returns { valid: boolean, missing: string[] }
 */
export function validateMapping(mapping) {
  const missing = REQUIRED_MAPPINGS.filter((field) => !mapping[field]);
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Parse a search query string into structured chips + remaining free text.
 *
 * Recognized chip patterns (in parse order):
 *   - Attribute duration: wait:>30m, sojourn:>=1h, service:<10m, wacht:5m-30m, etc.
 *   - Bare duration: >5m, <30s, >=1h, <=10m, 5m-30m
 *   - Case.Task ID: C5.T8
 *   - Case ID: C5
 *   - Task ID: T8
 *
 * @param {string} query - Raw query string
 * @returns {{ chips: Array<{ raw: string, label: string, type: string }>, rest: string }}
 */
export function parseQueryChips(query) {
  if (!query || !query.trim()) return { chips: [], rest: '' }

  const chips = []
  let remaining = query.trim()

  // Attribute duration: wait:>30m, sojourn:5m-30m, etc.
  const attrDurRe = /\b(wait|waiting|wacht|sojourn|doorloop|service|duration|dur)\s*:\s*(>=?|<=?)\s*(\d+(?:\.\d+)?(?:s|m|h))\b/i
  const attrRangeRe = /\b(wait|waiting|wacht|sojourn|doorloop|service|duration|dur)\s*:\s*(\d+(?:\.\d+)?(?:s|m|h))\s*-\s*(\d+(?:\.\d+)?(?:s|m|h))\b/i

  // Try attribute range first (wait:5m-30m)
  let m = remaining.match(attrRangeRe)
  if (m) {
    chips.push({ raw: m[0], label: `${m[1]} ${m[2]}–${m[3]}`, type: 'filter' })
    remaining = remaining.replace(m[0], ' ').trim()
  } else {
    // Try attribute comparison (wait:>30m)
    m = remaining.match(attrDurRe)
    if (m) {
      chips.push({ raw: m[0], label: `${m[1]} ${m[2]}${m[3]}`, type: 'filter' })
      remaining = remaining.replace(m[0], ' ').trim()
    }
  }

  // Bare duration range: 5m-30m
  if (chips.length === 0) {
    const bareRangeRe = /\b(\d+(?:\.\d+)?(?:s|m|h))\s*-\s*(\d+(?:\.\d+)?(?:s|m|h))\b/i
    m = remaining.match(bareRangeRe)
    if (m) {
      chips.push({ raw: m[0], label: `${m[1]}–${m[2]}`, type: 'filter' })
      remaining = remaining.replace(m[0], ' ').trim()
    }
  }

  // Bare duration comparison: >5m, >=1h, <30s, <=10m
  if (chips.length === 0) {
    const bareCmpRe = /(>=?|<=?)\s*(\d+(?:\.\d+)?(?:s|m|h))\b/i
    m = remaining.match(bareCmpRe)
    if (m) {
      chips.push({ raw: m[0], label: m[0].replace(/\s+/g, ''), type: 'filter' })
      remaining = remaining.replace(m[0], ' ').trim()
    }
  }

  // Case.Task ID: C5.T8
  const ctRe = /\b(c\d+\.t\d+)\b/i
  m = remaining.match(ctRe)
  if (m) {
    chips.push({ raw: m[0], label: m[0].toUpperCase(), type: 'id' })
    remaining = remaining.replace(m[0], ' ').trim()
  }

  // Case ID: C5
  if (!m) {
    const cRe = /\b(c\d+)\b/i
    m = remaining.match(cRe)
    if (m) {
      chips.push({ raw: m[0], label: m[0].toUpperCase(), type: 'id' })
      remaining = remaining.replace(m[0], ' ').trim()
    }
  }

  // Task ID: T8
  if (!m) {
    const tRe = /\b(t\d+)\b/i
    m = remaining.match(tRe)
    if (m) {
      chips.push({ raw: m[0], label: m[0].toUpperCase(), type: 'id' })
      remaining = remaining.replace(m[0], ' ').trim()
    }
  }

  return { chips, rest: remaining.replace(/\s+/g, ' ').trim() }
}

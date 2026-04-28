/**
 * Work Schedule utilities for the LogViewer.
 *
 * Calculates working seconds between two absolute timestamps,
 * excluding nights and weekends. Used by the Comparison Studio
 * to give realistic waiting/idle times.
 *
 * Default schedule: Mon–Fri 08:00–20:00 (configurable).
 */

/**
 * Parse an absolute timestamp string into a Date.
 * Accepts formats like "2024-01-15 18:00:00" or ISO strings.
 * Returns null if unparseable.
 */
export function parseAbsTime(str) {
  if (!str) return null
  const d = new Date(str.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

/**
 * Check if a Date falls within working hours.
 * @param {Date} d
 * @param {number} startH - Work start hour (default 8)
 * @param {number} endH   - Work end hour (default 20)
 * @param {Set<number>} workDays - 0=Sun, 1=Mon, ..., 6=Sat (default Mon-Fri = {1,2,3,4,5})
 */
export function isWorkingTime(d, startH = 8, endH = 20, workDays = DEFAULT_WORK_DAYS) {
  if (!workDays.has(d.getDay())) return false
  const hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
  return hour >= startH && hour < endH
}

// JS Date.getDay(): 0=Sun, 1=Mon, ..., 6=Sat
export const DEFAULT_WORK_DAYS = new Set([1, 2, 3, 4, 5]) // Mon-Fri

/**
 * Find the next work-start at or after the given Date.
 */
export function nextWorkStart(d, startH = 8, endH = 20, workDays = DEFAULT_WORK_DAYS) {
  if (isWorkingTime(d, startH, endH, workDays)) return new Date(d)

  // Clone
  const c = new Date(d)

  // If we're on a work day but before start, jump to start
  if (workDays.has(c.getDay()) && c.getHours() < startH) {
    c.setHours(startH, 0, 0, 0)
    return c
  }

  // Move to start of next day
  c.setDate(c.getDate() + 1)
  c.setHours(startH, 0, 0, 0)
  // Skip non-work days
  let guard = 0
  while (!workDays.has(c.getDay()) && guard < 10) {
    c.setDate(c.getDate() + 1)
    guard++
  }
  return c
}

/**
 * Calculate working seconds between two absolute timestamp strings.
 *
 * Only counts time within work hours. Nights and weekends are excluded.
 *
 * @param {string} startStr - Absolute start timestamp string
 * @param {string} endStr   - Absolute end timestamp string
 * @param {number} startH   - Work day start hour (default 8)
 * @param {number} endH     - Work day end hour (default 20)
 * @param {Set<number>} workDays - Working days (default Mon-Fri)
 * @returns {number} Working seconds, or NaN if timestamps can't be parsed
 *
 * @example
 *   // Fri 18:00 → Mon 08:00
 *   // Only Fri 18:00-20:00 = 2h = 7200s
 *   workingSecondsBetween("2024-01-12 18:00:00", "2024-01-15 08:00:00")
 *   // → 7200
 */
export function workingSecondsBetween(startStr, endStr, startH = 8, endH = 20, workDays = DEFAULT_WORK_DAYS) {
  const startD = parseAbsTime(startStr)
  const endD = parseAbsTime(endStr)
  if (!startD || !endD) return NaN
  if (endD <= startD) return 0

  const workDaySeconds = (endH - startH) * 3600
  let total = 0

  // Clamp start to next work start
  let current = nextWorkStart(startD, startH, endH, workDays)
  if (current >= endD) return 0

  let guard = 0
  while (guard < 3000) { // safety: max ~8 years of work days
    guard++
    // End of work today
    const todayEnd = new Date(current)
    todayEnd.setHours(endH, 0, 0, 0)

    if (endD <= todayEnd) {
      // End falls within today's work hours
      total += (endD - current) / 1000
      break
    } else {
      // Consume rest of today
      total += (todayEnd - current) / 1000

      // Move to next work day
      const nextDay = new Date(todayEnd)
      nextDay.setDate(nextDay.getDate() + 1)
      nextDay.setHours(startH, 0, 0, 0)
      let skip = 0
      while (!workDays.has(nextDay.getDay()) && skip < 10) {
        nextDay.setDate(nextDay.getDate() + 1)
        skip++
      }
      current = nextDay

      if (current >= endD) break
    }
  }

  return Math.max(total, 0)
}

// Helpers for parsing the utility company's hourly consumption export.
// Expected columns: Service, Time period, Consumption, Consumption unit,
// Meter serial number, Register serial number, Counter time frame

/**
 * Try to guess a date from the uploaded filename, e.g.
 * "usage_2026-07-16.csv" -> "2026-07-16"
 * "Electricity_07-16-2026.csv" -> "2026-07-16"
 * Returns an ISO date string (YYYY-MM-DD) or null if nothing matched.
 * This is only a starting guess — the Upload page always lets you
 * confirm/override it before saving.
 */
export function guessDateFromFilename(filename) {
  if (!filename) return null

  // YYYY-MM-DD or YYYY_MM_DD
  let match = filename.match(/(\d{4})[-_](\d{2})[-_](\d{2})/)
  if (match) {
    const [, y, m, d] = match
    return `${y}-${m}-${d}`
  }

  // MM-DD-YYYY or MM_DD_YYYY
  match = filename.match(/(\d{2})[-_](\d{2})[-_](\d{4})/)
  if (match) {
    const [, m, d, y] = match
    return `${y}-${m}-${d}`
  }

  return null
}

/**
 * Convert a "Time period" cell like "1:00 AM-1:59 AM" into the
 * 24-hour start hour (0-23) it represents.
 */
export function parseHourStart(timePeriod) {
  if (!timePeriod) return null
  const startPart = timePeriod.split('-')[0].trim() // "1:00 AM"
  const match = startPart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!match) return null

  let [, hourStr, , meridiem] = match
  let hour = parseInt(hourStr, 10)
  meridiem = meridiem.toUpperCase()

  if (meridiem === 'AM') {
    if (hour === 12) hour = 0
  } else if (meridiem === 'PM') {
    if (hour !== 12) hour += 12
  }

  return hour
}

/**
 * Map a parsed CSV row (from PapaParse, header: true) plus the
 * confirmed reading date into a row shaped for the energy_readings table.
 */
export function toReadingRow(rawRow, readingDate) {
  const hourStart = parseHourStart(rawRow['Time period'])
  const consumption = parseFloat(rawRow['Consumption'])

  if (hourStart === null || Number.isNaN(consumption)) return null

  return {
    service: rawRow['Service']?.trim() || null,
    reading_date: readingDate,
    hour_start: hourStart,
    time_period: rawRow['Time period']?.trim() || null,
    consumption,
    consumption_unit: rawRow['Consumption unit']?.trim() || 'KWH',
    meter_serial: rawRow['Meter serial number']?.trim() || null,
  }
}

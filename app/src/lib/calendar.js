// Helpers for the Upload tab's "which days have data" calendar view.

export function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

function toIsoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// First and last calendar day of the given month, as ISO date strings.
export function monthRange(year, month) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0) // day 0 of next month = last day of this one
  return { start: toIsoDate(start), end: toIsoDate(end) }
}

// Counts distinct hour_start values per reading_date. Using distinct hours
// (rather than raw row count) keeps this correct even if you ever track
// more than one meter/service on the same day.
export function countDistinctHoursByDate(rows) {
  const hourSets = new Map()
  for (const r of rows) {
    if (!hourSets.has(r.reading_date)) hourSets.set(r.reading_date, new Set())
    hourSets.get(r.reading_date).add(r.hour_start)
  }
  const counts = new Map()
  for (const [date, hours] of hourSets) counts.set(date, hours.size)
  return counts
}

// Builds a Sunday-first grid of weeks for the given month. Each cell is
// either null (padding into the adjacent month) or
// { date, day, status: 'none' | 'partial' | 'full', hours }.
export function buildMonthGrid(year, month, hoursByDate) {
  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = firstOfMonth.getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const hours = hoursByDate.get(date) || 0
    let status = 'none'
    if (hours >= 24) status = 'full'
    else if (hours > 0) status = 'partial'
    cells.push({ date, day, status, hours })
  }

  while (cells.length % 7 !== 0) cells.push(null)

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

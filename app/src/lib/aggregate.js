// Aggregation helpers used by the Dashboard page.

export function dailyTotals(rows) {
  const byDate = new Map()
  for (const r of rows) {
    const key = r.reading_date
    byDate.set(key, (byDate.get(key) || 0) + Number(r.consumption))
  }
  return Array.from(byDate.entries())
    .map(([date, kwh]) => ({ date, kwh: Number(kwh.toFixed(2)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function hourlyProfile(rows) {
  const sums = new Array(24).fill(0)
  const counts = new Array(24).fill(0)
  for (const r of rows) {
    const h = r.hour_start
    sums[h] += Number(r.consumption)
    counts[h] += 1
  }
  return sums.map((sum, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    avgKwh: counts[hour] ? Number((sum / counts[hour]).toFixed(3)) : 0,
  }))
}

export function computeStats(rows) {
  if (rows.length === 0) {
    return { totalKwh: 0, avgDailyKwh: 0, daysCovered: 0, peakHour: null }
  }

  const totalKwh = rows.reduce((sum, r) => sum + Number(r.consumption), 0)
  const days = new Set(rows.map((r) => r.reading_date))
  const daysCovered = days.size
  const avgDailyKwh = daysCovered ? totalKwh / daysCovered : 0

  const profile = hourlyProfile(rows)
  const peak = profile.reduce((max, p) => (p.avgKwh > max.avgKwh ? p : max), profile[0])

  return {
    totalKwh: Number(totalKwh.toFixed(2)),
    avgDailyKwh: Number(avgDailyKwh.toFixed(2)),
    daysCovered,
    peakHour: peak.label,
  }
}

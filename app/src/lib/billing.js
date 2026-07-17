// Bill estimation helpers used by the Billing tab.

function parseIsoDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIsoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isWeekend(dateStr) {
  const day = parseIsoDate(dateStr).getDay() // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6
}

// Whether a given hour (0-23) on a given date falls inside a time-of-use
// program's on-peak window. Assumes a non-wrapping window (start <= end),
// which covers typical daytime on-peak plans.
export function isOnPeakHour(program, dateStr, hour) {
  if (!program || program.type !== 'time_of_use') return false

  const weekend = isWeekend(dateStr)
  const start = weekend ? program.weekend_on_peak_start : program.weekday_on_peak_start
  const end = weekend ? program.weekend_on_peak_end : program.weekday_on_peak_end

  if (start === null || start === undefined || end === null || end === undefined) return false
  return hour >= start && hour <= end
}

// Sums consumption/energy charge for a set of hourly readings under a program.
export function calculateEnergyCharge(program, readings) {
  if (!program) {
    return { totalKwh: 0, onPeakKwh: 0, offPeakKwh: 0, energyCharge: 0 }
  }

  let totalKwh = 0
  let onPeakKwh = 0
  let offPeakKwh = 0

  for (const r of readings) {
    const kwh = Number(r.consumption)
    totalKwh += kwh

    if (program.type === 'time_of_use') {
      if (isOnPeakHour(program, r.reading_date, r.hour_start)) {
        onPeakKwh += kwh
      } else {
        offPeakKwh += kwh
      }
    }
  }

  let energyCharge
  if (program.type === 'fixed') {
    energyCharge = totalKwh * Number(program.fixed_rate)
  } else {
    energyCharge = onPeakKwh * Number(program.on_peak_rate) + offPeakKwh * Number(program.off_peak_rate)
  }

  return {
    totalKwh: Number(totalKwh.toFixed(3)),
    onPeakKwh: Number(onPeakKwh.toFixed(3)),
    offPeakKwh: Number(offPeakKwh.toFixed(3)),
    energyCharge: Number(energyCharge.toFixed(2)),
  }
}

// How many of the days in [startDate, endDate] have a full 24 hours of data.
export function computeCompleteness(readings, startDate, endDate) {
  const hoursByDate = new Map()
  for (const r of readings) {
    if (!hoursByDate.has(r.reading_date)) hoursByDate.set(r.reading_date, new Set())
    hoursByDate.get(r.reading_date).add(r.hour_start)
  }

  const start = parseIsoDate(startDate)
  const end = parseIsoDate(endDate)

  let totalDays = 0
  let completeDays = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    totalDays++
    const iso = toIsoDate(cursor)
    const hours = hoursByDate.get(iso)
    if (hours && hours.size >= 24) completeDays++
    cursor.setDate(cursor.getDate() + 1)
  }

  return { totalDays, completeDays, missingDays: totalDays - completeDays }
}

// Full estimate for one billing cycle: energy charge (via calculateEnergyCharge)
// plus the flat fixed-costs total.
export function estimateCycleTotal(program, readings, fixedCostsTotal) {
  const energy = calculateEnergyCharge(program, readings)
  const total = Number((energy.energyCharge + fixedCostsTotal).toFixed(2))
  return { ...energy, fixedCostsTotal: Number(fixedCostsTotal.toFixed(2)), total }
}

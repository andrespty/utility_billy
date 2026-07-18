// Target bill pacing helpers used by the Billing tab.
// Pure functions only — no Supabase calls.

import { calculateEnergyCharge } from './billing'

function parseIsoDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysBetweenInclusive(startStr, endStr) {
  const start = parseIsoDate(startStr)
  const end = parseIsoDate(endStr)
  return Math.round((end - start) / 86400000) + 1
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

// Converts a dollar target into a target kWh for a given program + fixed costs.
// For 'fixed' programs this is exact. For 'time_of_use' programs it uses a
// blended rate derived from the on-peak/off-peak split of `readingsSoFar`
// (falling back to a 50/50 split if there are no readings yet), and marks the
// result approximate.
export function targetKwhFromDollars(program, fixedCostsTotal, targetDollars, readingsSoFar) {
  if (!program) {
    return { kwh: null, approximate: false, status: 'no_program' }
  }

  if (!(Number(targetDollars) > Number(fixedCostsTotal))) {
    return { kwh: null, approximate: false, status: 'invalid_target' }
  }

  const amountForEnergy = Number(targetDollars) - Number(fixedCostsTotal)

  if (program.type === 'fixed') {
    const kwh = amountForEnergy / Number(program.fixed_rate)
    return { kwh: Number(kwh.toFixed(3)), approximate: false, status: 'ok' }
  }

  const { onPeakKwh, offPeakKwh, totalKwh } = calculateEnergyCharge(program, readingsSoFar || [])
  const onPeakShare = totalKwh > 0 ? onPeakKwh / totalKwh : 0.5
  const offPeakShare = totalKwh > 0 ? offPeakKwh / totalKwh : 0.5
  const blendedRate =
    onPeakShare * Number(program.on_peak_rate) + offPeakShare * Number(program.off_peak_rate)
  const kwh = amountForEnergy / blendedRate
  return { kwh: Number(kwh.toFixed(3)), approximate: true, status: 'ok' }
}

// Returns { totalDays, daysElapsed, daysRemaining, kwhSoFar, targetKwh,
//   approximate, flatDailyKwh, adaptiveDailyKwh (or null if not applicable),
//   status }
// status is one of: 'ok', 'over_target', 'cycle_ending_today',
//   'invalid_target', 'no_program', 'incomplete_data'
// isCurrentCycle: whether today falls within [startDate, endDate] — adaptive
//   pace and the 'over_target'/'cycle_ending_today' statuses only apply then.
export function computeTargetPace({
  program,
  fixedCostsTotal,
  targetDollars,
  readings,
  startDate,
  endDate,
  isCurrentCycle,
  completeness,
}) {
  const totalDays = completeness ? completeness.totalDays : daysBetweenInclusive(startDate, endDate)

  const empty = {
    totalDays,
    daysElapsed: null,
    daysRemaining: null,
    kwhSoFar: 0,
    targetKwh: null,
    approximate: false,
    flatDailyKwh: null,
    adaptiveDailyKwh: null,
  }

  if (!program) {
    return { ...empty, status: 'no_program' }
  }

  const { kwh: targetKwh, approximate, status: targetStatus } = targetKwhFromDollars(
    program,
    fixedCostsTotal,
    targetDollars,
    readings
  )

  if (targetStatus === 'invalid_target') {
    return { ...empty, status: 'invalid_target' }
  }

  const energy = calculateEnergyCharge(program, readings)
  const kwhSoFar = energy.totalKwh
  const flatDailyKwh = totalDays > 0 ? Number((targetKwh / totalDays).toFixed(2)) : null

  let daysElapsed = null
  let daysRemaining = null
  let adaptiveDailyKwh = null
  let status = completeness && completeness.missingDays > 0 ? 'incomplete_data' : 'ok'

  if (isCurrentCycle) {
    daysElapsed = Math.min(daysBetweenInclusive(startDate, todayIso()), totalDays)
    daysRemaining = Math.max(totalDays - daysElapsed, 0)

    if (kwhSoFar > targetKwh) {
      status = 'over_target'
    } else if (daysRemaining <= 0) {
      status = 'cycle_ending_today'
    } else {
      adaptiveDailyKwh = Number(((targetKwh - kwhSoFar) / daysRemaining).toFixed(2))
    }
  }

  return {
    totalDays,
    daysElapsed,
    daysRemaining,
    kwhSoFar,
    targetKwh,
    approximate,
    flatDailyKwh,
    adaptiveDailyKwh,
    status,
  }
}

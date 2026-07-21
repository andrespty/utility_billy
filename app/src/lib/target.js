// Target bill pacing helpers used by the Dashboard's Billing Cycle view.
// Pure functions only — no Supabase calls.

import { calculateEnergyCharge } from './billing'

// UTC-based (not local-time) so the day count is never skewed by a DST
// transition falling between the two dates.
function parseIsoDateUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function daysBetweenInclusive(startStr, endStr) {
  return Math.round((parseIsoDateUTC(endStr) - parseIsoDateUTC(startStr)) / 86400000) + 1
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

// Cycle-to-date progress, independent of any dollar target: how far into
// the cycle we are, total consumption so far, and the average daily pace
// that implies. `daysElapsed`/`daysRemaining` are only meaningful for the
// cycle containing today, so they're null otherwise. `avgDailyKwh` is
// always computed — over the days elapsed so far for the current cycle,
// or over the whole cycle length for a past (or not-yet-started) one.
export function computeCycleProgress({ readings, startDate, endDate, isCurrentCycle }) {
  const totalDays = daysBetweenInclusive(startDate, endDate)
  const kwhSoFar = Number((readings || []).reduce((sum, r) => sum + Number(r.consumption), 0).toFixed(3))

  let daysElapsed = null
  let daysRemaining = null

  if (isCurrentCycle) {
    daysElapsed = Math.min(Math.max(daysBetweenInclusive(startDate, todayIso()), 1), totalDays)
    daysRemaining = Math.max(totalDays - daysElapsed, 0)
  }

  const avgDailyKwh = Number((kwhSoFar / (daysElapsed ?? totalDays)).toFixed(2))

  return { totalDays, daysElapsed, daysRemaining, kwhSoFar, avgDailyKwh }
}

// Projects the cycle's final kWh and total bill by extrapolating the
// average daily pace observed so far (kwhSoFar / daysElapsed) across the
// whole cycle. For time-of-use programs this assumes the on/off-peak split
// observed so far holds for the rest of the cycle too (approximate — same
// assumption `targetKwhFromDollars` uses for its blended rate). Only
// meaningful mid-cycle, so returns null once `daysElapsed` isn't available.
export function projectCycleTotal(program, readings, cycleProgress, fixedCostsTotal) {
  if (!program || !cycleProgress || !cycleProgress.daysElapsed) return null

  const { daysElapsed, totalDays } = cycleProgress
  const scale = totalDays / daysElapsed
  const energy = calculateEnergyCharge(program, readings)
  const projectedTotalKwh = Number((energy.totalKwh * scale).toFixed(2))

  let projectedEnergyCharge
  let approximate = false

  if (program.type === 'fixed') {
    projectedEnergyCharge = projectedTotalKwh * Number(program.fixed_rate)
  } else {
    const projectedOnPeakKwh = energy.onPeakKwh * scale
    const projectedOffPeakKwh = energy.offPeakKwh * scale
    projectedEnergyCharge =
      projectedOnPeakKwh * Number(program.on_peak_rate) + projectedOffPeakKwh * Number(program.off_peak_rate)
    approximate = true
  }

  const projectedTotal = Number((projectedEnergyCharge + Number(fixedCostsTotal)).toFixed(2))

  if (!Number.isFinite(projectedTotal)) return null

  return { projectedTotalKwh, projectedTotal, approximate }
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

  let kwh
  let approximate = false

  if (program.type === 'fixed') {
    kwh = amountForEnergy / Number(program.fixed_rate)
  } else {
    const { onPeakKwh, offPeakKwh, totalKwh } = calculateEnergyCharge(program, readingsSoFar || [])
    const onPeakShare = totalKwh > 0 ? onPeakKwh / totalKwh : 0.5
    const offPeakShare = totalKwh > 0 ? offPeakKwh / totalKwh : 0.5
    const blendedRate =
      onPeakShare * Number(program.on_peak_rate) + offPeakShare * Number(program.off_peak_rate)
    kwh = amountForEnergy / blendedRate
    approximate = true
  }

  // Guards against a misconfigured program (zero/negative/missing rate)
  // producing Infinity or NaN instead of a usable target.
  if (!Number.isFinite(kwh) || kwh <= 0) {
    return { kwh: null, approximate: false, status: 'invalid_target' }
  }

  return { kwh: Number(kwh.toFixed(3)), approximate, status: 'ok' }
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
  const { totalDays, daysElapsed, daysRemaining, kwhSoFar } = computeCycleProgress({
    readings,
    startDate,
    endDate,
    isCurrentCycle,
  })

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

  const flatDailyKwh = totalDays > 0 ? Number((targetKwh / totalDays).toFixed(2)) : null

  let adaptiveDailyKwh = null
  let status = completeness && completeness.missingDays > 0 ? 'incomplete_data' : 'ok'

  if (isCurrentCycle) {
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

import TargetProgressBar from './TargetProgressBar'

// Stats row shown under the daily consumption chart when the Dashboard's
// range control is set to "Billing Cycle".
//
// For the cycle containing today, this shows live progress: consumption
// and bill so far, a bill projected from the current pace, and — if target
// tracking is enabled — a plain comparison of that pace against what's
// needed to hit the target. For a past or future cycle (no "so far" to
// speak of) it falls back to the plain cost estimate for the whole cycle.

export default function CycleStats({
  program,
  estimate,
  cycleProgress,
  projection,
  actualAmount,
  targetActive,
  targetPace,
  targetSettings,
  fixedCostsTotal,
  isCurrentCycle,
}) {
  if (!program) {
    return (
      <div className="card">
        <strong>No default program set.</strong> Go to Settings &gt; Rate programs and mark one
        as default to see cost estimates here.
      </div>
    )
  }

  const variance =
    estimate && actualAmount !== null && actualAmount !== undefined
      ? Number((Number(actualAmount) - estimate.total).toFixed(2))
      : null

  const varianceNote = variance !== null && (
    <div
      className="tabular-nums"
      style={{
        fontSize: 13,
        marginTop: 8,
        color: variance > 0 ? 'var(--data-2)' : variance < 0 ? 'var(--data-3)' : 'var(--muted)',
      }}
    >
      {variance === 0
        ? 'Matches the estimate exactly.'
        : variance > 0
        ? `Actual bill was $${variance.toFixed(2)} higher than the estimate.`
        : `Actual bill was $${Math.abs(variance).toFixed(2)} lower than the estimate.`}
    </div>
  )

  return (
    <>
      {isCurrentCycle && estimate && cycleProgress ? (
        <div className="card">
          <h3>This cycle</h3>

          <div className="stats-grid">
            <div className="stat-box">
              <div className="label">Total kWh so far</div>
              <div className="value tabular-nums">{cycleProgress.kwhSoFar}</div>
            </div>
            <div className="stat-box">
              <div className="label">Avg kWh/day</div>
              <div className="value tabular-nums">{cycleProgress.avgDailyKwh}</div>
            </div>
            <div className="stat-box">
              <div className="label">Bill so far</div>
              <div className="value tabular-nums">${estimate.total.toFixed(2)}</div>
            </div>
            {projection && (
              <div className="stat-box emphasis">
                <div className="label">
                  Projected bill{projection.approximate ? ' (approximate)' : ''}
                </div>
                <div className="value tabular-nums">${projection.projectedTotal.toFixed(2)}</div>
              </div>
            )}
            {actualAmount !== null && actualAmount !== undefined && (
              <div className="stat-box">
                <div className="label">Actual bill</div>
                <div className="value tabular-nums">${Number(actualAmount).toFixed(2)}</div>
              </div>
            )}
          </div>

          <div className="note">
            Using program: <strong>{program.name}</strong> · Day {cycleProgress.daysElapsed} of{' '}
            {cycleProgress.totalDays}
            {projection?.approximate ? " — projection assumes today's on/off-peak split holds" : ''}
          </div>

          {varianceNote}
        </div>
      ) : (
        estimate && (
          <div className="card">
            <h3>Estimate</h3>

            <div className="stats-grid">
              <div className="stat-box">
                <div className="label">Total kWh</div>
                <div className="value tabular-nums">{estimate.totalKwh}</div>
              </div>

              <div className="stat-box">
                <div className="label">Avg kWh/day</div>
                <div className="value tabular-nums">{cycleProgress?.avgDailyKwh}</div>
              </div>

              {program.type === 'time_of_use' ? (
                <>
                  <div className="stat-box">
                    <div className="label">On-peak kWh</div>
                    <div className="value tabular-nums">{estimate.onPeakKwh}</div>
                  </div>
                  <div className="stat-box">
                    <div className="label">Off-peak kWh</div>
                    <div className="value tabular-nums">{estimate.offPeakKwh}</div>
                  </div>
                </>
              ) : (
                <div className="stat-box">
                  <div className="label">Rate</div>
                  <div className="value tabular-nums">${Number(program.fixed_rate).toFixed(4)}</div>
                </div>
              )}

              <div className="stat-box">
                <div className="label">Energy charge</div>
                <div className="value tabular-nums">${estimate.energyCharge.toFixed(2)}</div>
              </div>

              <div className="stat-box">
                <div className="label">Fixed costs</div>
                <div className="value tabular-nums">${estimate.fixedCostsTotal.toFixed(2)}</div>
              </div>

              <div className="stat-box emphasis">
                <div className="label">Estimated total</div>
                <div className="value tabular-nums">${estimate.total.toFixed(2)}</div>
              </div>

              {actualAmount !== null && actualAmount !== undefined && (
                <div className="stat-box">
                  <div className="label">Actual bill</div>
                  <div className="value tabular-nums">${Number(actualAmount).toFixed(2)}</div>
                </div>
              )}
            </div>

            <div className="note">
              Using program: <strong>{program.name}</strong>
            </div>

            {varianceNote}
          </div>
        )
      )}

      {targetActive && targetPace && targetPace.status !== 'no_program' && (
        <div className="card">
          <h3>Target</h3>

          {targetPace.status === 'invalid_target' ? (
            <div className="callout">
              Unable to calculate a target pace from your target (${Number(targetSettings.amount).toFixed(2)}).
              Check that your target leaves room above fixed costs (${fixedCostsTotal.toFixed(2)}) and that
              your default rate program is configured with valid rates.
            </div>
          ) : isCurrentCycle ? (
            <>
              <p className="note" style={{ marginTop: 0 }}>
                Your ${Number(targetSettings.amount).toFixed(2)} target works out to about{' '}
                {targetPace.targetKwh} kWh for this cycle
                {targetPace.approximate
                  ? ' (approximate — based on your on/off-peak split so far)'
                  : ''}
                .
              </p>

              <TargetProgressBar
                kwhSoFar={targetPace.kwhSoFar}
                targetKwh={targetPace.targetKwh}
                expectedKwh={
                  targetPace.flatDailyKwh != null && targetPace.daysElapsed != null
                    ? Number((targetPace.flatDailyKwh * targetPace.daysElapsed).toFixed(1))
                    : null
                }
              />

              {targetPace.status === 'over_target' && (
                <div className="callout">
                  You've used {targetPace.kwhSoFar} kWh — {(targetPace.kwhSoFar - targetPace.targetKwh).toFixed(1)}{' '}
                  kWh over your target already. It's no longer reachable this cycle.
                </div>
              )}

              {targetPace.status === 'cycle_ending_today' &&
                (targetPace.kwhSoFar <= targetPace.targetKwh ? (
                  <div className="note">
                    You met your target this cycle, with{' '}
                    {(targetPace.targetKwh - targetPace.kwhSoFar).toFixed(1)} kWh to spare.
                  </div>
                ) : (
                  <div className="callout">
                    You exceeded your target this cycle by{' '}
                    {(targetPace.kwhSoFar - targetPace.targetKwh).toFixed(1)} kWh.
                  </div>
                ))}

              {(targetPace.status === 'ok' || targetPace.status === 'incomplete_data') &&
                projection && (
                  <>
                    <div
                      className={projection.projectedTotalKwh > targetPace.targetKwh ? 'callout' : 'note'}
                      style={{ marginBottom: 12 }}
                    >
                      {projection.projectedTotalKwh > targetPace.targetKwh
                        ? `At your current pace, you're trending ${(
                            projection.projectedTotalKwh - targetPace.targetKwh
                          ).toFixed(1)} kWh over target.`
                        : `At your current pace, you're on track to come in ${(
                            targetPace.targetKwh - projection.projectedTotalKwh
                          ).toFixed(1)} kWh under target.`}
                    </div>

                    <div className="stats-grid">
                      <div className="stat-box">
                        <div className="label">Current avg</div>
                        <div className="value tabular-nums">{cycleProgress?.avgDailyKwh}</div>
                      </div>
                      <div className="stat-box emphasis">
                        <div className="label">Needed avg ({targetPace.daysRemaining} days left)</div>
                        <div className="value tabular-nums">{targetPace.adaptiveDailyKwh}</div>
                      </div>
                    </div>
                  </>
                )}
            </>
          ) : (
            <>
              <div className="stats-grid">
                <div className="stat-box">
                  <div className="label">
                    Target kWh{targetPace.approximate ? ' (approximate)' : ''}
                  </div>
                  <div className="value tabular-nums">{targetPace.targetKwh}</div>
                </div>
                <div className="stat-box">
                  <div className="label">Flat daily pace</div>
                  <div className="value tabular-nums">{targetPace.flatDailyKwh}</div>
                </div>
              </div>
              <div className="note">Adaptive pacing only applies to the cycle containing today.</div>
            </>
          )}
        </div>
      )}
    </>
  )
}

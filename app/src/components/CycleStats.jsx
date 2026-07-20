// Stats row shown under the daily consumption chart when the Dashboard's
// range control is set to "Billing Cycle": the cost estimate for the
// selected cycle (plus actual-bill variance, if one's been entered in
// Settings) and the target pacing card, if target tracking is enabled.

export default function CycleStats({
  program,
  estimate,
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

  return (
    <>
      {estimate && (
        <div className="card">
          <h3>Estimate</h3>

          <div className="stats-grid">
            <div className="stat-box">
              <div className="label">Total kWh</div>
              <div className="value tabular-nums">{estimate.totalKwh}</div>
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

          {variance !== null && (
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
          )}
        </div>
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
          ) : (
            <>
              <div className="stats-grid">
                <div className="stat-box">
                  <div className="label">
                    Target kWh{targetPace.approximate ? ' (approximate)' : ''}
                  </div>
                  <div className="value tabular-nums">{targetPace.targetKwh}</div>
                </div>

                {targetPace.status !== 'cycle_ending_today' && (
                  <div className="stat-box">
                    <div className="label">Flat daily pace</div>
                    <div className="value tabular-nums">{targetPace.flatDailyKwh}</div>
                  </div>
                )}

                {isCurrentCycle &&
                  (targetPace.status === 'ok' || targetPace.status === 'incomplete_data') && (
                    <div className="stat-box emphasis">
                      <div className="label">Adaptive daily pace</div>
                      <div className="value tabular-nums">{targetPace.adaptiveDailyKwh}</div>
                    </div>
                  )}
              </div>

              {targetPace.status === 'over_target' && (
                <div className="callout">
                  You've used {(targetPace.kwhSoFar - targetPace.targetKwh).toFixed(1)} kWh
                  more than your target for this cycle — it's no longer reachable this cycle.
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

              {!isCurrentCycle && (
                <div className="note">
                  Adaptive pacing only applies to the cycle containing today.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

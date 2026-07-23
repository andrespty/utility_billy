// Visual "how much of your target budget you've used" bar for the current
// cycle. The bar's full width IS the target (0 kWh on the left, target kWh
// on the right, no padding past it), so target is always literally at the
// end of the bar. The fill shows kWh used so far, capped at 100% width —
// once you're over target the whole bar goes solid red and a note below
// states the overage explicitly, rather than leaving ambiguous empty track.
// A thin marker shows where an even (flat) pace would put you by today.
// Everything is also spelled out in a legend row below so nothing has to
// be inferred from position alone.

export default function TargetProgressBar({ kwhSoFar, targetKwh, expectedKwh }) {
  const overTarget = kwhSoFar > targetKwh
  const fillColor = overTarget ? 'var(--data-2)' : 'var(--accent-gold)'
  const fillPct = targetKwh > 0 ? Math.min((kwhSoFar / targetKwh) * 100, 100) : 0
  const expectedPct =
    expectedKwh != null && targetKwh > 0 ? Math.min((expectedKwh / targetKwh) * 100, 100) : null

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${fillPct}%`, background: fillColor }} />
        {expectedPct !== null && <div className="progress-marker" style={{ left: `${expectedPct}%` }} />}
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <div className="legend-dot">
          <span className="swatch" style={{ background: fillColor }} />
          Used {kwhSoFar} kWh
        </div>
        {expectedKwh != null && (
          <div className="legend-dot">
            <span style={{ display: 'inline-block', width: 2, height: 12, background: 'var(--muted)' }} />
            Even pace today: {expectedKwh} kWh
          </div>
        )}
        <div className="legend-dot">
          <span style={{ display: 'inline-block', width: 9, height: 9, border: '1px solid var(--ink)' }} />
          Target: {targetKwh} kWh
        </div>
      </div>

      {overTarget && (
        <div style={{ fontSize: 11, color: 'var(--data-2)', marginTop: 4 }}>
          {(kwhSoFar - targetKwh).toFixed(1)} kWh over — bar shown capped at the target line.
        </div>
      )}
    </div>
  )
}

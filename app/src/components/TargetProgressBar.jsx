// Visual "how much of your target budget you've used" bar for the current
// cycle: a filled track for kWh used so far, a dark tick for the target
// itself, and a faint tick for where you'd be if you'd used exactly an
// even (flat) pace up to today — so pace-ahead/pace-behind is visible at a
// glance, without reading numbers.

export default function TargetProgressBar({ kwhSoFar, targetKwh, expectedKwh }) {
  const scaleMax = Math.max(targetKwh, kwhSoFar, expectedKwh || 0) * 1.05 || 1
  const overTarget = kwhSoFar > targetKwh

  const fillPct = Math.min((kwhSoFar / scaleMax) * 100, 100)
  const targetPct = Math.min((targetKwh / scaleMax) * 100, 100)
  const expectedPct = expectedKwh != null ? Math.min((expectedKwh / scaleMax) * 100, 100) : null

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: `${fillPct}%`,
            background: overTarget ? 'var(--data-2)' : 'var(--accent-gold)',
          }}
        />
        {expectedPct !== null && (
          <div
            className="progress-marker"
            style={{ left: `${expectedPct}%` }}
            title={`Even pace would put you at ${expectedKwh} kWh by now`}
          />
        )}
        <div className="progress-target-line" style={{ left: `${targetPct}%` }} title={`Target: ${targetKwh} kWh`} />
      </div>
      <div className="progress-scale tabular-nums">
        <span>0 kWh</span>
        <span>{kwhSoFar} kWh used</span>
        <span>{targetKwh} kWh target</span>
      </div>
    </div>
  )
}

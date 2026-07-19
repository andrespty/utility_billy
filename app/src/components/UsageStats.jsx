export default function UsageStats({ stats }) {
  return (
    <div className="stats-grid">
      <div className="stat-box">
        <div className="label">Total kWh</div>
        <div className="value tabular-nums">{stats.totalKwh}</div>
      </div>
      <div className="stat-box">
        <div className="label">Avg daily kWh</div>
        <div className="value tabular-nums">{stats.avgDailyKwh}</div>
      </div>
      <div className="stat-box">
        <div className="label">Days covered</div>
        <div className="value tabular-nums">{stats.daysCovered}</div>
      </div>
      <div className="stat-box">
        <div className="label">Peak hour</div>
        <div className="value tabular-nums">{stats.peakHour}</div>
      </div>
    </div>
  )
}

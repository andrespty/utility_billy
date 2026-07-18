import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { dailyTotals, hourlyProfile, computeStats } from '../lib/aggregate'
import { hourLabel } from '../lib/hours'

const RANGE_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
]

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// Formats an ISO "YYYY-MM-DD" string as "Jul-01" without going through Date
// (avoids timezone off-by-one shifts for date-only strings).
function formatMonthDay(isoDate) {
  const [, month, day] = isoDate.split('-')
  return `${MONTH_ABBR[Number(month) - 1]}-${day}`
}

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export default function Dashboard() {
  const [rangeIdx, setRangeIdx] = useState(1) // default: last 30 days
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      const range = RANGE_OPTIONS[rangeIdx]
      let query = supabase
        .from('energy_readings')
        .select('reading_date, hour_start, consumption')
        .order('reading_date', { ascending: true })

      if (range.days !== null) {
        query = query.gte('reading_date', isoDaysAgo(range.days))
      }

      const { data, error } = await query
      if (cancelled) return

      if (error) {
        setError(error.message)
      } else {
        setRows(data || [])
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [rangeIdx])

  const daily = useMemo(() => dailyTotals(rows), [rows])
  const hourly = useMemo(() => hourlyProfile(rows), [rows])
  const stats = useMemo(() => computeStats(rows), [rows])
  const dailyMean = useMemo(
    () => (daily.length ? daily.reduce((sum, d) => sum + d.kwh, 0) / daily.length : 0),
    [daily]
  )

  return (
    <div>
      <div className="tabs">
        {RANGE_OPTIONS.map((opt, idx) => (
          <button
            key={opt.label}
            className={idx === rangeIdx ? 'active' : ''}
            onClick={() => setRangeIdx(idx)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <div className="error-text">{error}</div>}

      {!loading && rows.length === 0 && !error && (
        <div className="card">
          No data yet for this range. Head to the Upload tab to add your first export.
        </div>
      )}

      {rows.length > 0 && (
        <>
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

          <div className="card">
            <h3>Daily consumption (kWh)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={daily} margin={{ top: 4, right: 64, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e7e2d3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatMonthDay}
                  tick={{ fontSize: 11, fill: '#5c5550', fontFamily: 'IBM Plex Sans' }}
                  axisLine={{ stroke: '#d8d2c2' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#5c5550', fontFamily: 'IBM Plex Sans' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={formatMonthDay}
                  contentStyle={{
                    background: '#ffffff',
                    border: '1px solid #d8d2c2',
                    borderRadius: 2,
                    fontFamily: 'IBM Plex Sans',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="kwh" fill="#3e4a5c" />
                <ReferenceLine
                  y={dailyMean}
                  stroke="#a6300e"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: `Avg ${dailyMean.toFixed(1)} kWh`,
                    position: 'right',
                    fill: '#a6300e',
                    fontSize: 11,
                    fontFamily: 'IBM Plex Sans',
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3>Typical usage by hour of day</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hourly} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e7e2d3" />
                <XAxis
                  dataKey="hour"
                  tickFormatter={hourLabel}
                  tick={{ fontSize: 11, fill: '#5c5550', fontFamily: 'IBM Plex Sans' }}
                  axisLine={{ stroke: '#d8d2c2' }}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#5c5550', fontFamily: 'IBM Plex Sans' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={hourLabel}
                  contentStyle={{
                    background: '#ffffff',
                    border: '1px solid #d8d2c2',
                    borderRadius: 2,
                    fontFamily: 'IBM Plex Sans',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="avgKwh" fill="#3e4a5c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

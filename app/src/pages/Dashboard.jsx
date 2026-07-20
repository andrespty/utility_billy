import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { dailyTotals, hourlyProfile, computeStats } from '../lib/aggregate'
import { computeCompleteness, estimateCycleTotal, isWeekend } from '../lib/billing'
import { computeTargetPace } from '../lib/target'
import { hourLabel } from '../lib/hours'
import DayNotesModal from '../components/DayNotesModal'
import UsageStats from '../components/UsageStats'
import CycleStats from '../components/CycleStats'

const RANGE_OPTIONS = [
  { label: 'Billing Cycle', cycle: true },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
]

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const WEEKDAY_COLOR = '#3e4a5c'
const WEEKEND_COLOR = '#a6300e'

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

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

const selectFullStyle = {
  width: '100%',
}

function LegendDot({ color, label }) {
  return (
    <div className="legend-dot">
      <span className="swatch" style={{ background: color }} />
      {label}
    </div>
  )
}

function LegendLine({ color, dashed, label }) {
  return (
    <div className="legend-dot">
      <span
        style={{
          display: 'inline-block',
          width: 14,
          height: 0,
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
        }}
      />
      {label}
    </div>
  )
}

export default function Dashboard() {
  const [rangeIdx, setRangeIdx] = useState(0) // default: Billing Cycle
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notesDates, setNotesDates] = useState(new Set())
  const [openDate, setOpenDate] = useState(null)

  const [cycles, setCycles] = useState([])
  const [cyclesLoaded, setCyclesLoaded] = useState(false)
  const [selectedCycleId, setSelectedCycleId] = useState(null)
  const [program, setProgram] = useState(null)
  const [fixedCostsTotal, setFixedCostsTotal] = useState(0)
  const [targetSettings, setTargetSettings] = useState(null)

  const activeRange = RANGE_OPTIONS[rangeIdx]
  const isCycleMode = activeRange.cycle === true
  const selectedCycle = cycles.find((c) => c.id === selectedCycleId) || null

  // Cycle/program/fixed-costs/target metadata, needed only when the user
  // switches to Billing Cycle mode — fetched once up front so the picker
  // can default to today's cycle as soon as that mode is selected.
  useEffect(() => {
    async function loadCycleMeta() {
      const [{ data: cyclesData }, { data: programsData }, { data: costsData }, { data: targetData }] =
        await Promise.all([
          supabase.from('bill_cycles').select('*').order('start_date', { ascending: false }),
          supabase.from('programs').select('*'),
          supabase.from('fixed_costs').select('amount'),
          supabase.from('target_settings').select('*').maybeSingle(),
        ])

      const today = todayIso()
      const list = cyclesData || []
      const defaultCycle = list.find((c) => today >= c.start_date && today <= c.end_date) || list[0] || null

      setCycles(list)
      setProgram((programsData || []).find((p) => p.is_default) || null)
      setFixedCostsTotal((costsData || []).reduce((sum, c) => sum + Number(c.amount), 0))
      setTargetSettings(targetData || null)
      setSelectedCycleId(defaultCycle?.id ?? null)
      setCyclesLoaded(true)
    }
    loadCycleMeta()
  }, [])

  async function loadNotesDates() {
    let query = supabase.from('notes').select('note_date, hour')

    if (isCycleMode) {
      if (!selectedCycle) {
        setNotesDates(new Set())
        return
      }
      query = query.gte('note_date', selectedCycle.start_date).lte('note_date', selectedCycle.end_date)
    } else if (activeRange.days !== null) {
      query = query.gte('note_date', isoDaysAgo(activeRange.days))
    }

    const { data, error } = await query
    if (!error) setNotesDates(new Set((data || []).map((n) => n.note_date)))
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (isCycleMode && !selectedCycle) {
        setRows([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      let query = supabase
        .from('energy_readings')
        .select('reading_date, hour_start, consumption')
        .order('reading_date', { ascending: true })

      if (isCycleMode) {
        query = query.gte('reading_date', selectedCycle.start_date).lte('reading_date', selectedCycle.end_date)
      } else if (activeRange.days !== null) {
        query = query.gte('reading_date', isoDaysAgo(activeRange.days))
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
    loadNotesDates()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeIdx, selectedCycleId, cycles])

  const daily = useMemo(() => dailyTotals(rows), [rows])
  const hourly = useMemo(() => hourlyProfile(rows), [rows])
  const stats = useMemo(() => computeStats(rows), [rows])
  const dailyMean = useMemo(
    () => (daily.length ? daily.reduce((sum, d) => sum + d.kwh, 0) / daily.length : 0),
    [daily]
  )

  const isCurrentCycle = Boolean(
    selectedCycle && todayIso() >= selectedCycle.start_date && todayIso() <= selectedCycle.end_date
  )

  const completeness = useMemo(
    () =>
      isCycleMode && selectedCycle ? computeCompleteness(rows, selectedCycle.start_date, selectedCycle.end_date) : null,
    [isCycleMode, selectedCycle, rows]
  )

  const estimate = useMemo(
    () => (isCycleMode && program && selectedCycle ? estimateCycleTotal(program, rows, fixedCostsTotal) : null),
    [isCycleMode, program, selectedCycle, rows, fixedCostsTotal]
  )

  const targetActive = Boolean(targetSettings && targetSettings.enabled && Number(targetSettings.amount) > 0)

  const targetPace = useMemo(
    () =>
      isCycleMode && targetActive && selectedCycle
        ? computeTargetPace({
            program,
            fixedCostsTotal,
            targetDollars: Number(targetSettings.amount),
            readings: rows,
            startDate: selectedCycle.start_date,
            endDate: selectedCycle.end_date,
            isCurrentCycle,
            completeness,
          })
        : null,
    [isCycleMode, targetActive, selectedCycle, program, fixedCostsTotal, targetSettings, rows, isCurrentCycle, completeness]
  )

  function renderNoteMarker({ x, y, width, index }) {
    const date = daily[index]?.date
    if (!date || !notesDates.has(date)) return null
    return (
      <circle
        key={`note-marker-${date}`}
        cx={x + width / 2}
        cy={y - 6}
        r={3}
        style={{ fill: 'var(--accent-gold)' }}
      />
    )
  }

  const noCyclesYet = isCycleMode && cyclesLoaded && cycles.length === 0
  const mainContentReady = isCycleMode ? Boolean(selectedCycle) : rows.length > 0
  const showNoDataMessage = !isCycleMode && !loading && rows.length === 0 && !error

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

      {noCyclesYet && (
        <div className="card">
          No bill cycles yet. Add one in Settings &gt; Bill cycles to see an estimate here.
        </div>
      )}

      {isCycleMode && cycles.length > 0 && (
        <div className="card">
          <label htmlFor="cycle-select">Bill cycle</label>
          <select
            id="cycle-select"
            value={selectedCycleId ?? ''}
            onChange={(e) => setSelectedCycleId(Number(e.target.value))}
            style={selectFullStyle}
          >
            {cycles.map((c) => {
              const isCurrent = todayIso() >= c.start_date && todayIso() <= c.end_date
              return (
                <option key={c.id} value={c.id}>
                  {c.start_date} → {c.end_date}
                  {isCurrent ? ' (current)' : ''}
                </option>
              )
            })}
          </select>
        </div>
      )}

      {isCycleMode && selectedCycle && !isCurrentCycle && completeness && completeness.missingDays > 0 && (
        <div className="card callout">
          {completeness.missingDays} of {completeness.totalDays} days in this cycle are
          missing or have incomplete data — totals below may be low.
        </div>
      )}

      {showNoDataMessage && (
        <div className="card">
          No data yet for this range. Head to the Upload tab to add your first export.
        </div>
      )}

      {mainContentReady && (
        <>
          <div className="card">
            <h3>Daily consumption (kWh)</h3>
            <p className="note">Click a bar to add or view notes for that day.</p>

            {loading ? (
              <div className="note">Loading…</div>
            ) : daily.length === 0 ? (
              <div className="note">
                {isCycleMode ? 'No data for this cycle yet.' : 'No data for this range yet.'}
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={daily} margin={{ top: 14, right: 8, left: -8, bottom: 0 }}>
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
                    <Bar
                      dataKey="kwh"
                      cursor="pointer"
                      onClick={(data) => setOpenDate(data.payload.date)}
                      label={renderNoteMarker}
                    >
                      {daily.map((entry) => (
                        <Cell key={entry.date} fill={isWeekend(entry.date) ? WEEKEND_COLOR : WEEKDAY_COLOR} />
                      ))}
                    </Bar>
                    <ReferenceLine y={dailyMean} stroke="#a6300e" strokeDasharray="4 4" strokeWidth={1} />
                    {isCycleMode && targetPace && targetPace.flatDailyKwh != null && (
                      <ReferenceLine y={targetPace.flatDailyKwh} stroke="var(--accent-gold)" strokeWidth={1.5} />
                    )}
                    {isCycleMode &&
                      targetPace &&
                      targetPace.adaptiveDailyKwh != null &&
                      targetPace.adaptiveDailyKwh !== targetPace.flatDailyKwh && (
                        <ReferenceLine
                          y={targetPace.adaptiveDailyKwh}
                          stroke="var(--accent-gold)"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                        />
                      )}
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                  <LegendDot color={WEEKDAY_COLOR} label="Weekday" />
                  <LegendDot color={WEEKEND_COLOR} label="Weekend" />
                  <LegendLine color="#a6300e" dashed label={`Avg ${dailyMean.toFixed(1)} kWh`} />
                  {isCycleMode && targetPace && targetPace.flatDailyKwh != null && (
                    <LegendLine color="var(--accent-gold)" label={`Target ${targetPace.flatDailyKwh} kWh`} />
                  )}
                  {isCycleMode &&
                    targetPace &&
                    targetPace.adaptiveDailyKwh != null &&
                    targetPace.adaptiveDailyKwh !== targetPace.flatDailyKwh && (
                      <LegendLine
                        color="var(--accent-gold)"
                        dashed
                        label={`Pace ${targetPace.adaptiveDailyKwh} kWh`}
                      />
                    )}
                </div>
              </>
            )}
          </div>

          {isCycleMode ? (
            <CycleStats
              program={program}
              estimate={estimate}
              actualAmount={selectedCycle?.actual_amount}
              targetActive={targetActive}
              targetPace={targetPace}
              targetSettings={targetSettings}
              fixedCostsTotal={fixedCostsTotal}
              isCurrentCycle={isCurrentCycle}
            />
          ) : (
            <UsageStats stats={stats} />
          )}

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

      {openDate && (
        <DayNotesModal
          date={openDate}
          onClose={() => {
            setOpenDate(null)
            loadNotesDates()
          }}
        />
      )}
    </div>
  )
}

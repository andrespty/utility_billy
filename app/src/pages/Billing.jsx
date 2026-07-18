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
import { computeCompleteness, estimateCycleTotal, isWeekend } from '../lib/billing'
import { computeTargetPace } from '../lib/target'
import { dailyTotals } from '../lib/aggregate'

const WEEKDAY_COLOR = '#3e4a5c'
const WEEKEND_COLOR = '#a6300e'
const TARGET_COLOR = '#9c7a17'

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

export default function Billing() {
  const [cycles, setCycles] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [program, setProgram] = useState(null)
  const [fixedCostsTotal, setFixedCostsTotal] = useState(0)
  const [targetSettings, setTargetSettings] = useState(null)
  const [readings, setReadings] = useState([])
  const [actualDraft, setActualDraft] = useState('')
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingReadings, setLoadingReadings] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadMeta() {
      setLoadingMeta(true)
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
      setSelectedId(defaultCycle?.id ?? null)
      setLoadingMeta(false)
    }
    loadMeta()
  }, [])

  const selectedCycle = cycles.find((c) => c.id === selectedId) || null

  useEffect(() => {
    if (!selectedCycle) {
      setReadings([])
      setActualDraft('')
      return
    }

    setActualDraft(
      selectedCycle.actual_amount === null || selectedCycle.actual_amount === undefined
        ? ''
        : String(selectedCycle.actual_amount)
    )

    let cancelled = false
    async function loadReadings() {
      setLoadingReadings(true)
      const { data } = await supabase
        .from('energy_readings')
        .select('reading_date, hour_start, consumption')
        .gte('reading_date', selectedCycle.start_date)
        .lte('reading_date', selectedCycle.end_date)
      if (!cancelled) {
        setReadings(data || [])
        setLoadingReadings(false)
      }
    }
    loadReadings()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCycle?.id])

  const completeness = useMemo(
    () =>
      selectedCycle ? computeCompleteness(readings, selectedCycle.start_date, selectedCycle.end_date) : null,
    [readings, selectedCycle]
  )

  const estimate = useMemo(
    () => (program && selectedCycle ? estimateCycleTotal(program, readings, fixedCostsTotal) : null),
    [program, selectedCycle, readings, fixedCostsTotal]
  )

  const isCurrentCycle = Boolean(
    selectedCycle && todayIso() >= selectedCycle.start_date && todayIso() <= selectedCycle.end_date
  )

  const targetActive = Boolean(targetSettings && targetSettings.enabled && Number(targetSettings.amount) > 0)

  const targetPace = useMemo(
    () =>
      targetActive && selectedCycle
        ? computeTargetPace({
            program,
            fixedCostsTotal,
            targetDollars: Number(targetSettings.amount),
            readings,
            startDate: selectedCycle.start_date,
            endDate: selectedCycle.end_date,
            isCurrentCycle,
            completeness,
          })
        : null,
    [targetActive, selectedCycle, program, fixedCostsTotal, targetSettings, readings, isCurrentCycle, completeness]
  )

  const chartData = useMemo(
    () => dailyTotals(readings).map((d) => ({ ...d, weekend: isWeekend(d.date) })),
    [readings]
  )

  async function refreshCycles() {
    const { data } = await supabase
      .from('bill_cycles')
      .select('*')
      .order('start_date', { ascending: false })
    setCycles(data || [])
  }

  async function saveActual() {
    if (!selectedCycle) return
    setSaving(true)
    const value = actualDraft === '' ? null : Number(actualDraft)
    await supabase.from('bill_cycles').update({ actual_amount: value }).eq('id', selectedCycle.id)
    setSaving(false)
    refreshCycles()
  }

  if (loadingMeta) return <div className="card">Loading…</div>

  if (cycles.length === 0) {
    return (
      <div className="card">
        No bill cycles yet. Add one in Settings &gt; Bill cycles to see an estimate here.
      </div>
    )
  }

  const today = todayIso()
  const variance =
    estimate && actualDraft !== '' ? Number((Number(actualDraft) - estimate.total).toFixed(2)) : null

  return (
    <div>
      <div className="card">
        <label htmlFor="cycle-select">Bill cycle</label>
        <select
          id="cycle-select"
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          style={selectFullStyle}
        >
          {cycles.map((c) => {
            const isCurrent = today >= c.start_date && today <= c.end_date
            return (
              <option key={c.id} value={c.id}>
                {c.start_date} → {c.end_date}
                {isCurrent ? ' (current)' : ''}
              </option>
            )
          })}
        </select>
      </div>

      {!program && (
        <div className="card">
          <strong>No default program set.</strong> Go to Settings &gt; Rate programs and mark one
          as default to see cost estimates here.
        </div>
      )}

      {selectedCycle && (
        <>
          {completeness && completeness.missingDays > 0 && (
            <div className="card callout">
              {completeness.missingDays} of {completeness.totalDays} days in this cycle are
              missing or have incomplete data — totals below may be low.
            </div>
          )}

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
              </div>

              <div className="note">
                Using program: <strong>{program.name}</strong>
              </div>
            </div>
          )}

          {targetPace && targetPace.status !== 'no_program' && (
            <div className="card">
              <h3>Target</h3>

              {targetPace.status === 'invalid_target' ? (
                <div className="callout">
                  Your target (${Number(targetSettings.amount).toFixed(2)}) doesn't leave room
                  above your fixed costs (${fixedCostsTotal.toFixed(2)}). Update it in Settings.
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

          <div className="card">
            <h3>Daily consumption</h3>

            {loadingReadings ? (
              <div className="note">Loading…</div>
            ) : chartData.length === 0 ? (
              <div className="note">No data for this cycle yet.</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e7e2d3" />
                    <XAxis
                      dataKey="date"
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
                      contentStyle={{
                        background: '#ffffff',
                        border: '1px solid #d8d2c2',
                        borderRadius: 2,
                        fontFamily: 'IBM Plex Sans',
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="kwh">
                      {chartData.map((entry) => (
                        <Cell key={entry.date} fill={entry.weekend ? WEEKEND_COLOR : WEEKDAY_COLOR} />
                      ))}
                    </Bar>
                    {targetPace && targetPace.flatDailyKwh != null && (
                      <ReferenceLine
                        y={targetPace.flatDailyKwh}
                        stroke={TARGET_COLOR}
                        strokeWidth={1.5}
                        label={{
                          value: 'Target',
                          position: 'right',
                          fill: TARGET_COLOR,
                          fontSize: 11,
                          fontFamily: 'IBM Plex Sans',
                        }}
                      />
                    )}
                    {targetPace &&
                      targetPace.adaptiveDailyKwh != null &&
                      targetPace.adaptiveDailyKwh !== targetPace.flatDailyKwh && (
                        <ReferenceLine
                          y={targetPace.adaptiveDailyKwh}
                          stroke={TARGET_COLOR}
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          label={{
                            value: 'Pace',
                            position: 'right',
                            fill: TARGET_COLOR,
                            fontSize: 11,
                            fontFamily: 'IBM Plex Sans',
                          }}
                        />
                      )}
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                  <LegendDot color={WEEKDAY_COLOR} label="Weekday" />
                  <LegendDot color={WEEKEND_COLOR} label="Weekend" />
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h3>Actual bill</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="actual-amount">Actual bill amount ($)</label>
                <input
                  id="actual-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={actualDraft}
                  onChange={(e) => setActualDraft(e.target.value)}
                  style={{ marginBottom: 0 }}
                />
              </div>
              <button
                type="button"
                className="secondary"
                onClick={saveActual}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
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
        </>
      )}
    </div>
  )
}

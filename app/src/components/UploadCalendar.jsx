import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { buildMonthGrid, countDistinctHoursByDate, monthLabel, monthRange } from '../lib/calendar'

const STATUS_COLORS = {
  none: '#e5e7eb',
  partial: '#fbbf24',
  full: '#22c55e',
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const navBtnStyle = {
  border: '1px solid #d0d3d8',
  background: 'white',
  borderRadius: 6,
  width: 32,
  height: 32,
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
}

function LegendDot({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: color,
          display: 'inline-block',
        }}
      />
      {label}
    </div>
  )
}

export default function UploadCalendar() {
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`

  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-11
  const [hoursByDate, setHoursByDate] = useState(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const { start, end } = monthRange(year, month)
      const { data, error } = await supabase
        .from('energy_readings')
        .select('reading_date, hour_start')
        .gte('reading_date', start)
        .lte('reading_date', end)

      if (cancelled) return
      if (!error) setHoursByDate(countDistinctHoursByDate(data || []))
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [year, month])

  const weeks = useMemo(() => buildMonthGrid(year, month, hoursByDate), [year, month, hoursByDate])

  function goPrevMonth() {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function goNextMonth() {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <button type="button" onClick={goPrevMonth} style={navBtnStyle} aria-label="Previous month">
          ‹
        </button>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: 0 }}>{monthLabel(year, month)}</h3>
          <button
            type="button"
            onClick={goToday}
            style={{
              border: 'none',
              background: 'none',
              color: '#6b7280',
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Jump to today
          </button>
        </div>
        <button type="button" onClick={goNextMonth} style={navBtnStyle} aria-label="Next month">
          ›
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
          fontSize: 11,
          color: '#6b7280',
          marginBottom: 4,
        }}
      >
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} style={{ textAlign: 'center' }}>
            {d}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div
          key={wi}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}
        >
          {week.map((cell, ci) =>
            cell ? (
              <div
                key={cell.date}
                title={
                  cell.status === 'full'
                    ? `${cell.date}: ${cell.hours} hours recorded`
                    : cell.status === 'partial'
                    ? `${cell.date}: ${cell.hours}/24 hours recorded`
                    : `${cell.date}: no data uploaded`
                }
                style={{
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: cell.date === todayIso ? '2px solid #1a1a1a' : '1px solid transparent',
                  borderRadius: 6,
                  background: STATUS_COLORS[cell.status],
                  fontSize: 12,
                  color: cell.status === 'none' ? '#6b7280' : '#1a1a1a',
                }}
              >
                {cell.day}
              </div>
            ) : (
              <div key={`pad-${wi}-${ci}`} />
            )
          )}
        </div>
      ))}

      {loading && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Loading…</div>}

      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: '#6b7280' }}>
        <LegendDot color={STATUS_COLORS.none} label="No data" />
        <LegendDot color={STATUS_COLORS.partial} label="Partial day" />
        <LegendDot color={STATUS_COLORS.full} label="Complete day" />
      </div>
    </div>
  )
}

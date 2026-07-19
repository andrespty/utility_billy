import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { HOURS, hourLabel } from '../lib/hours'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const BAR_COLOR = '#3e4a5c'

// Formats an ISO "YYYY-MM-DD" string as "Tuesday, July 14" without going
// through Date.parse (avoids timezone off-by-one shifts for date-only strings).
function formatFullDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[month - 1]} ${day}`
}

export default function DayNotesModal({ date, onClose }) {
  const [notes, setNotes] = useState([])
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [mode, setMode] = useState('day') // 'day' | 'hour'
  const [hour, setHour] = useState(0)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('note_date', date)
      .order('hour', { ascending: true, nullsFirst: true })
    if (!error) setNotes(data || [])
    setLoading(false)
  }

  async function loadReadings() {
    const { data, error } = await supabase
      .from('energy_readings')
      .select('hour_start, consumption')
      .eq('reading_date', date)
      .order('hour_start', { ascending: true })
    if (!error) setReadings(data || [])
  }

  useEffect(() => {
    load()
    loadReadings()
  }, [date])

  const hourlyChartData = useMemo(() => {
    const byHour = new Map(readings.map((r) => [r.hour_start, Number(r.consumption)]))
    return HOURS.map((h) => ({
      hour: h,
      kwh: byHour.has(h) ? Number(byHour.get(h).toFixed(3)) : 0,
    }))
  }, [readings])

  const notedHours = useMemo(
    () => new Set(notes.filter((n) => n.hour !== null).map((n) => n.hour)),
    [notes]
  )

  function renderHourNoteMarker({ x, y, width, index }) {
    const h = hourlyChartData[index]?.hour
    if (h === undefined || !notedHours.has(h)) return null
    return (
      <circle
        key={`hour-note-marker-${h}`}
        cx={x + width / 2}
        cy={y - 6}
        r={3}
        style={{ fill: 'var(--accent-gold)' }}
      />
    )
  }

  function openGeneralForm() {
    setMode('day')
    setFormOpen(true)
  }

  function openHourForm(h) {
    setMode('hour')
    setHour(h)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!body.trim()) return

    setSaving(true)
    setError('')
    const { error: insertError } = await supabase.from('notes').insert({
      note_date: date,
      hour: mode === 'hour' ? hour : null,
      body: body.trim(),
    })
    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setBody('')
    setFormOpen(false)
    load()
  }

  async function handleDelete(id) {
    await supabase.from('notes').delete().eq('id', id)
    load()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{formatFullDate(date)}</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="note" style={{ marginTop: 0 }}>
          Click an hour bar to add a note for that hour.
        </p>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={hourlyChartData} margin={{ top: 10, right: 8, left: 4, bottom: 0 }} barCategoryGap={2}>
            <XAxis
              dataKey="hour"
              tickFormatter={hourLabel}
              tick={{ fontSize: 9, fill: '#5c5550', fontFamily: 'IBM Plex Sans' }}
              axisLine={{ stroke: '#d8d2c2' }}
              tickLine={false}
              interval={3}
            />
            <YAxis hide />
            <Tooltip
              labelFormatter={hourLabel}
              formatter={(value) => [`${value} kWh`, '']}
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
              fill={BAR_COLOR}
              cursor="pointer"
              onClick={(data) => openHourForm(data.payload.hour)}
              label={renderHourNoteMarker}
            />
          </BarChart>
        </ResponsiveContainer>

        <div style={{ marginTop: 16, borderTop: '1px solid var(--rule-faint)', paddingTop: 16 }}>
          {!loading && notes.length === 0 && <p className="note">No notes for this day yet.</p>}

          {notes.map((n) => (
            <div key={n.id} className="row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge">{n.hour === null ? 'All day' : hourLabel(n.hour)}</span>
                <span style={{ fontSize: 14 }}>{n.body}</span>
              </div>
              <button type="button" className="ghost-danger" onClick={() => handleDelete(n.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>

        {!formOpen && (
          <button type="button" className="primary" style={{ marginTop: 16 }} onClick={openGeneralForm}>
            Add note
          </button>
        )}

        {formOpen && (
          <form
            onSubmit={handleSave}
            style={{ marginTop: 16, borderTop: '1px solid var(--rule-faint)', paddingTop: 16 }}
          >
            <div className="tabs" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={mode === 'day' ? 'active' : ''}
                onClick={() => setMode('day')}
              >
                Whole day
              </button>
              <button
                type="button"
                className={mode === 'hour' ? 'active' : ''}
                onClick={() => setMode('hour')}
              >
                Specific hour
              </button>
            </div>

            {mode === 'hour' && (
              <select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            )}

            <textarea
              className="textarea"
              placeholder="What happened?"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />

            {error && <div className="error-text">{error}</div>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="primary" type="submit" disabled={saving || !body.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="secondary" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

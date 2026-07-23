import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { HOURS, hourLabel } from '../lib/hours'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const RECENT_DAYS = 14

// Lets you log what you're doing in the moment, before the utility's data
// catches up (usually a day or two later). Notes are keyed by date (and
// optionally hour) independent of whether energy_readings exist for that
// date yet, so a log added today is already attached once the numbers
// for today show up — nothing further to connect.
export default function Logs() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [date, setDate] = useState(todayIso())
  const [mode, setMode] = useState('hour') // 'day' | 'hour' — defaults to the current hour, since this is for in-the-moment logging
  const [hour, setHour] = useState(new Date().getHours())
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .gte('note_date', isoDaysAgo(RECENT_DAYS))
      .order('note_date', { ascending: false })
      .order('hour', { ascending: true, nullsFirst: true })
    if (!error) setNotes(data || [])
    else setError(error.message)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaveError('')

    if (!body.trim()) return
    if (!date) {
      setSaveError('Pick a date.')
      return
    }
    if (date > todayIso()) {
      setSaveError("Can't log a future date.")
      return
    }

    setSaving(true)
    const { error: insertError } = await supabase.from('notes').insert({
      note_date: date,
      hour: mode === 'hour' ? hour : null,
      body: body.trim(),
    })
    setSaving(false)

    if (insertError) {
      setSaveError(insertError.message)
      return
    }

    setBody('')
    load()
  }

  async function handleDelete(id) {
    await supabase.from('notes').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="card">
        <h3>Log something</h3>
        <p className="note">
          Data usually shows up a day or two after the fact — log what you're doing now and
          it's already attached to the right day (and hour) once the numbers catch up.
        </p>

        <form onSubmit={handleSave}>
          <label htmlFor="log-date">Date</label>
          <input
            id="log-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
          />

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
            placeholder='What&#39;s happening? e.g. "Doing laundry"'
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          {saveError && <div className="error-text">{saveError}</div>}

          <button className="primary" type="submit" disabled={saving || !body.trim()}>
            {saving ? 'Saving…' : 'Save log'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Recent logs</h3>

        {error && <div className="error-text">{error}</div>}
        {!loading && notes.length === 0 && !error && (
          <p className="note">No logs in the last {RECENT_DAYS} days.</p>
        )}

        {notes.map((n) => (
          <div key={n.id} className="row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="tabular-nums" style={{ fontSize: 13, color: 'var(--muted)' }}>
                {n.note_date}
              </span>
              <span className="badge">{n.hour === null ? 'All day' : hourLabel(n.hour)}</span>
              <span style={{ fontSize: 14 }}>{n.body}</span>
            </div>
            <button type="button" className="ghost-danger" onClick={() => handleDelete(n.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

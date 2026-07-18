import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { HOURS, hourLabel } from '../lib/hours'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Formats an ISO "YYYY-MM-DD" string as "Tuesday, July 14" without going
// through Date.parse (avoids timezone off-by-one shifts for date-only strings).
function formatFullDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[month - 1]} ${day}`
}

export default function DayNotesModal({ date, onClose }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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

  useEffect(() => {
    load()
  }, [date])

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

          <button className="primary" type="submit" disabled={saving || !body.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { HOURS, hourLabel } from '../lib/hours'

const MAX_PROGRAMS = 3

const emptyForm = {
  id: null,
  name: '',
  type: 'fixed',
  fixed_rate: '',
  on_peak_rate: '',
  off_peak_rate: '',
  weekday_on_peak_start: 7,
  weekday_on_peak_end: 23,
  weekendOffPeakAllDay: true,
  weekend_on_peak_start: 7,
  weekend_on_peak_end: 23,
}

function secondaryBtnStyle(extra = {}) {
  return {
    border: '1px solid #d0d3d8',
    background: 'white',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 13,
    ...extra,
  }
}

export default function ProgramsSection() {
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('programs')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error) setPrograms(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function openNewForm() {
    setForm(emptyForm)
    setFormOpen(true)
    setError('')
  }

  function openEditForm(program) {
    setForm({
      id: program.id,
      name: program.name,
      type: program.type,
      fixed_rate: program.fixed_rate ?? '',
      on_peak_rate: program.on_peak_rate ?? '',
      off_peak_rate: program.off_peak_rate ?? '',
      weekday_on_peak_start: program.weekday_on_peak_start ?? 7,
      weekday_on_peak_end: program.weekday_on_peak_end ?? 23,
      weekendOffPeakAllDay: program.weekend_on_peak_start === null,
      weekend_on_peak_start: program.weekend_on_peak_start ?? 7,
      weekend_on_peak_end: program.weekend_on_peak_end ?? 23,
    })
    setFormOpen(true)
    setError('')
  }

  function closeForm() {
    setFormOpen(false)
    setForm(emptyForm)
    setError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')

    if (!form.name.trim()) {
      setError('Give this program a name.')
      return
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      fixed_rate: form.type === 'fixed' ? Number(form.fixed_rate) : null,
      on_peak_rate: form.type === 'time_of_use' ? Number(form.on_peak_rate) : null,
      off_peak_rate: form.type === 'time_of_use' ? Number(form.off_peak_rate) : null,
      weekday_on_peak_start: form.type === 'time_of_use' ? Number(form.weekday_on_peak_start) : null,
      weekday_on_peak_end: form.type === 'time_of_use' ? Number(form.weekday_on_peak_end) : null,
      weekend_on_peak_start:
        form.type === 'time_of_use' && !form.weekendOffPeakAllDay
          ? Number(form.weekend_on_peak_start)
          : null,
      weekend_on_peak_end:
        form.type === 'time_of_use' && !form.weekendOffPeakAllDay
          ? Number(form.weekend_on_peak_end)
          : null,
    }

    if (form.type === 'fixed' && !form.fixed_rate) {
      setError('Enter a $/kWh rate.')
      return
    }
    if (form.type === 'time_of_use' && (!form.on_peak_rate || !form.off_peak_rate)) {
      setError('Enter both an on-peak and off-peak rate.')
      return
    }

    setSaving(true)
    let saveError
    if (form.id) {
      ;({ error: saveError } = await supabase.from('programs').update(payload).eq('id', form.id))
    } else {
      // The first program you create automatically becomes the default
      // used for billing calculations.
      ;({ error: saveError } = await supabase
        .from('programs')
        .insert({ ...payload, is_default: programs.length === 0 }))
    }
    setSaving(false)

    if (saveError) {
      setError(saveError.message)
      return
    }

    closeForm()
    load()
  }

  async function handleDelete(id) {
    await supabase.from('programs').delete().eq('id', id)
    load()
  }

  async function handleSetDefault(id) {
    // Two steps so the "one default per user" constraint is never briefly
    // violated: clear the old default, then set the new one.
    await supabase.from('programs').update({ is_default: false }).neq('id', id)
    await supabase.from('programs').update({ is_default: true }).eq('id', id)
    load()
  }

  const atLimit = programs.length >= MAX_PROGRAMS && !form.id

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Rate programs</h3>
      <p style={{ color: '#6b7280', fontSize: 14, marginTop: -8 }}>
        Up to {MAX_PROGRAMS} programs. Each one is either a flat $/kWh rate, or an on-peak /
        off-peak time-of-use rate with its own hour windows for weekdays vs weekends.
      </p>

      {!loading && programs.length === 0 && !formOpen && (
        <p style={{ color: '#6b7280', fontSize: 14 }}>No programs yet.</p>
      )}

      {programs.map((p) => (
        <div
          key={p.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 0',
            borderBottom: '1px solid #eef0f2',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</span>
              {p.is_default && (
                <span
                  style={{
                    fontSize: 11,
                    background: '#1a1a1a',
                    color: 'white',
                    borderRadius: 999,
                    padding: '2px 8px',
                  }}
                >
                  Default
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {p.type === 'fixed' ? (
                <>${Number(p.fixed_rate).toFixed(4)}/kWh flat</>
              ) : (
                <>
                  On-peak ${Number(p.on_peak_rate).toFixed(4)}/kWh, off-peak $
                  {Number(p.off_peak_rate).toFixed(4)}/kWh — weekdays{' '}
                  {hourLabel(p.weekday_on_peak_start)}–{hourLabel(p.weekday_on_peak_end)}
                  {p.weekend_on_peak_start === null
                    ? ', weekends off-peak all day'
                    : `, weekends ${hourLabel(p.weekend_on_peak_start)}–${hourLabel(
                        p.weekend_on_peak_end
                      )}`}
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!p.is_default && (
              <button type="button" style={secondaryBtnStyle()} onClick={() => handleSetDefault(p.id)}>
                Set default
              </button>
            )}
            <button type="button" style={secondaryBtnStyle()} onClick={() => openEditForm(p)}>
              Edit
            </button>
            <button
              type="button"
              style={secondaryBtnStyle({ color: '#b91c1c' })}
              onClick={() => handleDelete(p.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {!formOpen && (
        <button
          type="button"
          className="primary"
          style={{ marginTop: 16 }}
          onClick={openNewForm}
          disabled={atLimit}
        >
          {atLimit ? `Limit of ${MAX_PROGRAMS} reached` : 'Add program'}
        </button>
      )}

      {formOpen && (
        <form onSubmit={handleSave} style={{ marginTop: 16, borderTop: '1px solid #eef0f2', paddingTop: 16 }}>
          <label htmlFor="program-name">Name</label>
          <input
            id="program-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <label htmlFor="program-type">Type</label>
          <select
            id="program-type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #d0d3d8',
              borderRadius: 6,
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            <option value="fixed">Fixed rate</option>
            <option value="time_of_use">Time-of-use (on-peak / off-peak)</option>
          </select>

          {form.type === 'fixed' ? (
            <>
              <label htmlFor="fixed-rate">Rate ($/kWh)</label>
              <input
                id="fixed-rate"
                type="number"
                step="0.0001"
                min="0"
                value={form.fixed_rate}
                onChange={(e) => setForm({ ...form, fixed_rate: e.target.value })}
              />
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="on-peak-rate">On-peak rate ($/kWh)</label>
                  <input
                    id="on-peak-rate"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={form.on_peak_rate}
                    onChange={(e) => setForm({ ...form, on_peak_rate: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="off-peak-rate">Off-peak rate ($/kWh)</label>
                  <input
                    id="off-peak-rate"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={form.off_peak_rate}
                    onChange={(e) => setForm({ ...form, off_peak_rate: e.target.value })}
                  />
                </div>
              </div>

              <label>Weekday on-peak window</label>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <select
                  value={form.weekday_on_peak_start}
                  onChange={(e) =>
                    setForm({ ...form, weekday_on_peak_start: Number(e.target.value) })
                  }
                  style={selectStyle}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
                <span style={{ alignSelf: 'center', color: '#6b7280' }}>to</span>
                <select
                  value={form.weekday_on_peak_end}
                  onChange={(e) => setForm({ ...form, weekday_on_peak_end: Number(e.target.value) })}
                  style={selectStyle}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto', marginBottom: 0 }}
                  checked={form.weekendOffPeakAllDay}
                  onChange={(e) => setForm({ ...form, weekendOffPeakAllDay: e.target.checked })}
                />
                Weekends are off-peak all day
              </label>

              {!form.weekendOffPeakAllDay && (
                <div style={{ marginTop: 8 }}>
                  <label>Weekend on-peak window</label>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <select
                      value={form.weekend_on_peak_start}
                      onChange={(e) =>
                        setForm({ ...form, weekend_on_peak_start: Number(e.target.value) })
                      }
                      style={selectStyle}
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {hourLabel(h)}
                        </option>
                      ))}
                    </select>
                    <span style={{ alignSelf: 'center', color: '#6b7280' }}>to</span>
                    <select
                      value={form.weekend_on_peak_end}
                      onChange={(e) =>
                        setForm({ ...form, weekend_on_peak_end: Number(e.target.value) })
                      }
                      style={selectStyle}
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {hourLabel(h)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {error && <div className="error-text">{error}</div>}

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button className="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save program'}
            </button>
            <button type="button" style={secondaryBtnStyle()} onClick={closeForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const selectStyle = {
  flex: 1,
  padding: '8px 10px',
  border: '1px solid #d0d3d8',
  borderRadius: 6,
  fontSize: 14,
}

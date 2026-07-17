import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export default function BillCyclesSection() {
  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('bill_cycles')
      .select('*')
      .order('start_date', { ascending: false })
    if (!error) setCycles(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setError('')

    if (!startDate || !endDate) {
      setError('Enter both a start and end date.')
      return
    }
    if (endDate < startDate) {
      setError('End date must be on or after the start date.')
      return
    }

    setSaving(true)
    const { error: insertError } = await supabase
      .from('bill_cycles')
      .insert({ start_date: startDate, end_date: endDate })
    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setStartDate('')
    setEndDate('')
    load()
  }

  async function handleDelete(id) {
    await supabase.from('bill_cycles').delete().eq('id', id)
    load()
  }

  const today = todayIso()

  return (
    <div className="card">
      <h3>Bill cycles</h3>
      <p className="note">
        Add each billing period's start and end date as you go. The cycle covering today is
        flagged as current.
      </p>

      {!loading && cycles.length === 0 && (
        <p className="note">No cycles added yet.</p>
      )}

      {cycles.map((c) => {
        const isCurrent = today >= c.start_date && today <= c.end_date
        return (
          <div key={c.id} className="row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="tabular-nums" style={{ fontSize: 14 }}>
                {c.start_date} → {c.end_date}
              </span>
              {isCurrent && <span className="badge">Current</span>}
            </div>
            <button type="button" className="ghost-danger" onClick={() => handleDelete(c.id)}>
              Delete
            </button>
          </div>
        )
      })}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="cycle-start">Start date</label>
          <input
            id="cycle-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ marginBottom: 0 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="cycle-end">End date</label>
          <input
            id="cycle-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ marginBottom: 0 }}
          />
        </div>
        <button className="primary" type="submit" disabled={saving} style={{ height: 38 }}>
          {saving ? 'Adding…' : 'Add cycle'}
        </button>
      </form>

      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  )
}

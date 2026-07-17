import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

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

export default function FixedCostsSection() {
  const [costs, setCosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('fixed_costs')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error) setCosts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Give this cost a name.')
      return
    }
    if (!amount || Number.isNaN(Number(amount))) {
      setError('Enter a valid amount.')
      return
    }

    setSaving(true)
    const { error: insertError } = await supabase
      .from('fixed_costs')
      .insert({ name: name.trim(), amount: Number(amount) })
    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setName('')
    setAmount('')
    load()
  }

  async function handleDelete(id) {
    await supabase.from('fixed_costs').delete().eq('id', id)
    load()
  }

  const total = costs.reduce((sum, c) => sum + Number(c.amount), 0)

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Fixed costs</h3>
      <p style={{ color: '#6b7280', fontSize: 14, marginTop: -8 }}>
        Charges added to every bill regardless of consumption — service fees, delivery, taxes,
        and so on.
      </p>

      {!loading && costs.length === 0 && (
        <p style={{ color: '#6b7280', fontSize: 14 }}>No fixed costs yet.</p>
      )}

      {costs.map((c) => (
        <div
          key={c.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 0',
            borderBottom: '1px solid #eef0f2',
          }}
        >
          <div style={{ fontSize: 14 }}>{c.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>${Number(c.amount).toFixed(2)}</div>
            <button
              type="button"
              style={secondaryBtnStyle({ color: '#b91c1c' })}
              onClick={() => handleDelete(c.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {costs.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 10,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <div>Total</div>
          <div>${total.toFixed(2)}</div>
        </div>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: 2 }}>
          <label htmlFor="cost-name">Name</label>
          <input
            id="cost-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ marginBottom: 0 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="cost-amount">Amount ($)</label>
          <input
            id="cost-amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ marginBottom: 0 }}
          />
        </div>
        <button className="primary" type="submit" disabled={saving} style={{ height: 38 }}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  )
}

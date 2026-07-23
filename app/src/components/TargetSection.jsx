import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function TargetSection() {
  const [rowId, setRowId] = useState(null)
  const [amount, setAmount] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [fixedCostsTotal, setFixedCostsTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    const [
      { data: targetRow, error: targetError },
      { data: costsData, error: costsError },
    ] = await Promise.all([
      supabase.from('target_settings').select('*').maybeSingle(),
      supabase.from('fixed_costs').select('amount'),
    ])

    if (targetError || costsError) {
      setError(
        `Couldn't load target settings: ${targetError?.message || costsError?.message}`
      )
      setLoadFailed(true)
      setLoading(false)
      return
    }

    setLoadFailed(false)
    setFixedCostsTotal((costsData || []).reduce((sum, c) => sum + Number(c.amount), 0))

    if (targetRow) {
      setRowId(targetRow.id)
      setAmount(String(targetRow.amount))
      setEnabled(targetRow.enabled)
    } else {
      setRowId(null)
      setAmount('')
      setEnabled(false)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaved(false)

    if (loadFailed) {
      setError("Couldn't confirm your current target settings, so saving is disabled. Reload the page and try again.")
      return
    }

    const amountNum = Number(amount)
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      setError('Enter a valid target amount.')
      return
    }
    if (amountNum <= fixedCostsTotal) {
      setError(`Target must be more than your fixed costs ($${fixedCostsTotal.toFixed(2)}).`)
      return
    }

    setSaving(true)
    const payload = { amount: amountNum, enabled, updated_at: new Date().toISOString() }
    let saveError
    if (rowId) {
      ;({ error: saveError } = await supabase.from('target_settings').update(payload).eq('id', rowId))
    } else {
      ;({ error: saveError } = await supabase
        .from('target_settings')
        .upsert(payload, { onConflict: 'user_id' }))
    }
    setSaving(false)

    if (saveError) {
      setError(saveError.message)
      return
    }

    setSaved(true)
    load()
  }

  return (
    <div className="card">
      <h3>Target bill</h3>
      <p className="note">
        Set a monthly dollar target and the Dashboard's Billing Cycle view will show a daily
        kWh pace to help you hit it.
      </p>

      <form onSubmit={handleSave}>
        <label htmlFor="target-amount">Target bill amount ($)</label>
        <input
          id="target-amount"
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={loading}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            style={{ width: 'auto', marginBottom: 0 }}
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={loading}
          />
          Show target tracking on the Dashboard's Billing Cycle view
        </label>

        {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
        {saved && !error && (
          <div className="success-text" style={{ marginTop: 8 }}>
            Saved.
          </div>
        )}

        <button
          className="primary"
          type="submit"
          disabled={saving || loading || loadFailed}
          style={{ marginTop: 8 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}

import { useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../supabaseClient'
import { guessDateFromFilename, toReadingRow } from '../lib/csv'
import UploadCalendar from '../components/UploadCalendar.jsx'

let nextId = 0

function makeItem(file) {
  const guessed = guessDateFromFilename(file.name)
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${nextId++}`,
    file,
    date: guessed || '',
    status: 'pending', // pending | uploading | done | error
    message: '',
  }
}

export default function Upload() {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)

  function handleFilesChange(e) {
    const picked = Array.from(e.target.files || [])
    if (picked.length === 0) return

    setItems((prev) => {
      const existingKeys = new Set(
        prev.map((it) => `${it.file.name}-${it.file.size}-${it.file.lastModified}`)
      )
      const additions = picked
        .filter((f) => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`))
        .map(makeItem)
      return [...prev, ...additions]
    })

    // Reset so picking the same/more files again always fires onChange.
    e.target.value = ''
  }

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  function clearFinished() {
    setItems((prev) => prev.filter((it) => it.status !== 'done'))
  }

  async function processItem(item) {
    if (!item.date) {
      updateItem(item.id, { status: 'error', message: 'Missing date.' })
      return
    }

    updateItem(item.id, { status: 'uploading', message: '' })

    try {
      // Warn (via message) but don't block if this filename was already uploaded.
      const { data: existing } = await supabase
        .from('upload_log')
        .select('id')
        .eq('filename', item.file.name)
        .maybeSingle()

      const parsed = await new Promise((resolve, reject) => {
        Papa.parse(item.file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => resolve(results.data),
          error: reject,
        })
      })

      const rows = parsed
        .map((r) => toReadingRow(r, item.date))
        .filter((r) => r !== null)

      if (rows.length === 0) {
        throw new Error('No valid rows found. Check the CSV format.')
      }

      const { error: upsertError } = await supabase
        .from('energy_readings')
        .upsert(rows, { onConflict: 'user_id,service,reading_date,hour_start' })

      if (upsertError) throw upsertError

      await supabase.from('upload_log').upsert(
        {
          filename: item.file.name,
          extracted_date: item.date,
          row_count: rows.length,
        },
        { onConflict: 'user_id,filename' }
      )

      updateItem(item.id, {
        status: 'done',
        message: `${existing ? 'Re-uploaded' : 'Uploaded'} ${rows.length} readings for ${item.date}.`,
      })
    } catch (err) {
      updateItem(item.id, {
        status: 'error',
        message: err.message || 'Something went wrong during upload.',
      })
    }
  }

  async function handleUploadAll() {
    setBusy(true)
    // Process one at a time so per-row upserts and the upload_log dedupe
    // check don't race against each other.
    const toProcess = items.filter((it) => it.status !== 'done')
    for (const item of toProcess) {
      // eslint-disable-next-line no-await-in-loop
      await processItem(item)
    }
    setBusy(false)
  }

  const actionableCount = items.filter(
    (it) => it.status === 'pending' || it.status === 'error'
  ).length

  return (
    <div>
      <UploadCalendar />

      <div className="card">
      <h2 style={{ marginTop: 0 }}>Upload usage exports</h2>
      <p style={{ color: '#6b7280', fontSize: 14 }}>
        Download hourly CSVs from your utility company's site and pick as many as you like at
        once. Each file keeps its own date — guessed from the filename, editable below before
        you upload. Re-uploading a date you've already uploaded is safe; it overwrites that
        day's rows.
      </p>

      <label htmlFor="files">CSV file(s)</label>
      <input id="files" type="file" accept=".csv" multiple onChange={handleFilesChange} />

      {items.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid #eef0f2',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={item.file.name}
                >
                  {item.file.name}
                </div>
                {item.status === 'uploading' && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Uploading…</div>
                )}
                {item.message && (
                  <div
                    className={item.status === 'error' ? 'error-text' : 'success-text'}
                    style={{ margin: '2px 0 0' }}
                  >
                    {item.message}
                  </div>
                )}
              </div>

              <input
                type="date"
                value={item.date}
                onChange={(e) => updateItem(item.id, { date: e.target.value })}
                disabled={item.status === 'uploading' || item.status === 'done'}
                style={{ width: 160, marginBottom: 0 }}
              />

              <button
                type="button"
                onClick={() => removeItem(item.id)}
                disabled={item.status === 'uploading'}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <button
          className="primary"
          type="button"
          onClick={handleUploadAll}
          disabled={items.length === 0 || busy || actionableCount === 0}
        >
          {busy
            ? 'Uploading…'
            : `Upload ${actionableCount > 0 ? actionableCount : ''} file${
                actionableCount === 1 ? '' : 's'
              }`}
        </button>

        {items.some((it) => it.status === 'done') && (
          <button
            type="button"
            onClick={clearFinished}
            disabled={busy}
            style={{
              border: '1px solid #d0d3d8',
              background: 'white',
              borderRadius: 6,
              padding: '10px 18px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Clear finished
          </button>
        )}
      </div>
      </div>
    </div>
  )
}

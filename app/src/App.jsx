import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Upload from './pages/Upload.jsx'
import Billing from './pages/Billing.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return null

  if (!session) {
    return <Login />
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1>⚡ Energy Tracker</h1>
        <button className="primary" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>

      <div className="tabs">
        <button
          className={tab === 'dashboard' ? 'active' : ''}
          onClick={() => setTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={tab === 'upload' ? 'active' : ''}
          onClick={() => setTab('upload')}
        >
          Upload
        </button>
        <button
          className={tab === 'billing' ? 'active' : ''}
          onClick={() => setTab('billing')}
        >
          Billing
        </button>
        <button
          className={tab === 'settings' ? 'active' : ''}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>
      </div>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'upload' && <Upload />}
      {tab === 'billing' && <Billing />}
      {tab === 'settings' && <Settings />}
    </div>
  )
}

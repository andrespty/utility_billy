import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Logs from './pages/Logs.jsx'
import Upload from './pages/Upload.jsx'
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

  const sections = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'logs', label: 'Logs' },
    { id: 'upload', label: 'Upload' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="app-shell">
      <div className="sidebar">
        <div className="wordmark">Energy Tracker</div>
        <nav>
          {sections.map((s) => (
            <button
              key={s.id}
              className={tab === s.id ? 'active' : ''}
              onClick={() => setTab(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <button className="signout" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>

      <div className="main">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'logs' && <Logs />}
        {tab === 'upload' && <Upload />}
        {tab === 'settings' && <Settings />}
      </div>
    </div>
  )
}

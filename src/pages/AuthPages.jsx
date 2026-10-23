import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MIN_CHARITY } from '../lib/config'

export function Login() {
  const nav = useNavigate()
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword(f)
    setBusy(false)
    if (error) return setErr(error.message)
    nav('/dashboard')
  }
  return (
    <div className="container narrow section">
      <h1>Welcome back</h1>
      <form onSubmit={submit} className="stack">
        <label>Email<input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Password<input className="input" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        {err && <p className="error">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="muted">New here? <Link to="/signup">Create an account</Link></p>
    </div>
  )
}

export function Signup() {
  const nav = useNavigate()
  const [charities, setCharities] = useState([])
  const [f, setF] = useState({ full_name: '', email: '', password: '', charity_id: '', charity_percent: MIN_CHARITY })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.from('charities').select('id,name').eq('active', true).order('name').then(({ data }) => {
      setCharities(data || [])
      if (data?.length) setF((x) => ({ ...x, charity_id: data[0].id }))
    })
  }, [])
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    const { data, error } = await supabase.auth.signUp({
      email: f.email, password: f.password,
      options: { data: { full_name: f.full_name, charity_id: f.charity_id, charity_percent: f.charity_percent } },
    })
    setBusy(false)
    if (error) return setErr(error.message)
    if (!data.session) return setErr('Check your email to confirm your account, then log in.')
    nav('/pricing')
  }
  return (
    <div className="container narrow section">
      <h1>Create your account</h1>
      <form onSubmit={submit} className="stack">
        <label>Full name<input className="input" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
        <label>Email<input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Password (6+ characters)<input className="input" type="password" minLength={6} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <label>Charity you'd like to support
          <select className="input" value={f.charity_id} onChange={(e) => setF({ ...f, charity_id: e.target.value })}>
            {charities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Share of your fee that goes to charity: <b>{f.charity_percent}%</b>
          <input type="range" min={MIN_CHARITY} max={50} value={f.charity_percent} onChange={(e) => setF({ ...f, charity_percent: +e.target.value })} />
        </label>
        {err && <p className="error">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Continue to plans'}</button>
      </form>
      <p className="muted">Already have an account? <Link to="/login">Log in</Link></p>
    </div>
  )
}

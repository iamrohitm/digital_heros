import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { MIN_CHARITY, PLANS, fmt } from '../lib/config'
import { startCheckout } from './Pricing'

const today = () => new Date().toISOString().slice(0, 10)
const dmy = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

async function syncSubscription() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/sync', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })
  } catch { /* offline or API unavailable: ignore */ }
}

export default function Dashboard() {
  const { user, profile, subscription, isActive, refresh } = useAuth()
  const [params] = useSearchParams()
  const [tab, setTab] = useState('overview')
  const [scores, setScores] = useState([])
  const [entries, setEntries] = useState([])
  const [winners, setWinners] = useState([])
  const [draws, setDraws] = useState([])

  const load = useCallback(async () => {
    const [s, e, w, d] = await Promise.all([
      supabase.from('scores').select('*').eq('user_id', user.id).order('played_on', { ascending: false }),
      supabase.from('draw_entries').select('*, draws(month, numbers)').eq('user_id', user.id),
      supabase.from('winners').select('*, draws(month)').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('draws').select('month').order('month', { ascending: false }),
    ])
    setScores(s.data || []); setEntries(e.data || []); setWinners(w.data || []); setDraws(d.data || [])
  }, [user.id])
  useEffect(() => { load() }, [load])
  // Pull the latest subscription state from Stripe when the dashboard opens (covers renewals/cancellations too).
  useEffect(() => { syncSubscription().then(refresh) }, [])  // eslint-disable-line
  // After Stripe redirects back, keep syncing for a few seconds until the subscription shows as active.
  useEffect(() => {
    if (params.get('checkout') !== 'success' || isActive) return
    const t = setInterval(() => syncSubscription().then(refresh), 2500); const stop = setTimeout(() => clearInterval(t), 20000)
    return () => { clearInterval(t); clearTimeout(stop) }
  }, [params, isActive, refresh])

  const totalWon = winners.reduce((s, w) => s + Number(w.prize_amount), 0)
  const nextDraw = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)

  return (
    <div className="container section">
      <h1>Hi {profile?.full_name?.split(' ')[0] || 'there'}</h1>
      {params.get('checkout') === 'success' && !isActive && <p className="notice">Payment received. Activating your subscription…</p>}
      {params.get('donation') === 'success' && <p className="notice">Thank you for your donation!</p>}
      {!isActive && (
        <div className="notice warn">Your subscription is {subscription?.status || 'inactive'}. Subscribe to enter scores and join draws. <Link to="/pricing">View plans</Link></div>
      )}
      <div className="tabs">
        {['overview', 'scores', 'charity', 'winnings'].map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid3">
          <div className="card">
            <h3>Subscription</h3>
            <span className={'badge ' + (isActive ? 'ok' : 'bad')}>{isActive ? 'Active' : (subscription?.status || 'Inactive')}</span>
            {subscription && <p className="muted">{PLANS[subscription.plan]?.label} plan{subscription.current_period_end && <><br />{isActive ? 'Renews' : 'Ended'} {dmy(subscription.current_period_end)}</>}</p>}
            {subscription?.stripe_subscription_id && <PortalButton />}
            {!isActive && <Link to="/pricing" className="btn sm">Subscribe</Link>}
          </div>
          <div className="card">
            <h3>Draws</h3>
            <div className="big">{entries.length}</div>
            <p className="muted">draws entered of {draws.length} held<br />Next draw: {nextDraw.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</p>
          </div>
          <div className="card">
            <h3>Winnings</h3>
            <div className="big">{fmt(totalWon)}</div>
            <p className="muted">{winners.filter((w) => w.payment_status === 'paid').length} paid · {winners.filter((w) => w.payment_status === 'pending').length} pending</p>
          </div>
          <div className="card wide">
            <h3>Your charity</h3>
            <p><b>{profile?.charities?.name || 'None selected'}</b> receives {profile?.charity_percent}% of your fee ({fmt((PLANS[subscription?.plan]?.price || PLANS.monthly.price) * (profile?.charity_percent || 0) / 100)} per {subscription?.plan === 'yearly' ? 'year' : 'month'}).</p>
          </div>
        </div>
      )}
      {tab === 'scores' && <Scores scores={scores} reload={load} isActive={isActive} userId={user.id} />}
      {tab === 'charity' && <CharityTab />}
      {tab === 'winnings' && <Winnings winners={winners} reload={load} userId={user.id} />}
    </div>
  )
}

function PortalButton() {
  const go = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/portal', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })
    const j = await r.json(); if (j.url) window.location.href = j.url; else alert(j.error)
  }
  return <button className="btn ghost sm" onClick={go}>Manage / cancel</button>
}

function Scores({ scores, reload, isActive, userId }) {
  const [f, setF] = useState({ score: '', played_on: today() })
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState('')
  const validate = (s, d) => {
    const n = Number(s)
    if (!Number.isInteger(n) || n < 1 || n > 45) return 'Score must be a whole number from 1 to 45.'
    if (!d) return 'Choose the date you played.'
    if (d > today()) return 'The date cannot be in the future.'
    return ''
  }
  const add = async (e) => {
    e.preventDefault()
    const v = validate(f.score, f.played_on); if (v) return setErr(v)
    if (scores.some((s) => s.played_on === f.played_on)) return setErr('You already have a score for that date. Edit or delete it instead.')
    const { error } = await supabase.from('scores').insert({ user_id: userId, score: Number(f.score), played_on: f.played_on })
    if (error) return setErr(error.code === '23505' ? 'You already have a score for that date.' : error.message)
    setErr(''); setF({ score: '', played_on: today() }); reload()
  }
  const save = async () => {
    const v = validate(edit.score, edit.played_on); if (v) return setErr(v)
    if (scores.some((s) => s.id !== edit.id && s.played_on === edit.played_on)) return setErr('Another score already uses that date.')
    const { error } = await supabase.from('scores').update({ score: Number(edit.score), played_on: edit.played_on }).eq('id', edit.id)
    if (error) return setErr(error.message)
    setErr(''); setEdit(null); reload()
  }
  const del = async (id) => { await supabase.from('scores').delete().eq('id', id); reload() }
  return (
    <div className="grid2">
      <div className="card">
        <h3>Add a score</h3>
        <form onSubmit={add} className="stack">
          <label>Stableford score (1–45)<input className="input" type="number" min="1" max="45" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} disabled={!isActive} /></label>
          <label>Date played<input className="input" type="date" max={today()} value={f.played_on} onChange={(e) => setF({ ...f, played_on: e.target.value })} disabled={!isActive} /></label>
          {err && <p className="error">{err}</p>}
          <button className="btn" disabled={!isActive}>Save score</button>
          {!isActive && <p className="muted">Subscribe to add scores.</p>}
          {scores.length >= 5 && <p className="muted">You have 5 scores. Adding a new one removes the oldest.</p>}
        </form>
      </div>
      <div className="card">
        <h3>Your latest scores ({scores.length}/5)</h3>
        {scores.length === 0 && <p className="muted">No scores yet. Add your first round to enter the draw. You need 5 scores to be eligible.</p>}
        {scores.map((s) => (
          <div className="score-row" key={s.id}>
            {edit?.id === s.id ? (
              <>
                <input className="input sm" type="number" min="1" max="45" value={edit.score} onChange={(e) => setEdit({ ...edit, score: e.target.value })} />
                <input className="input sm" type="date" max={today()} value={edit.played_on} onChange={(e) => setEdit({ ...edit, played_on: e.target.value })} />
                <button className="btn sm" onClick={save}>Save</button>
                <button className="btn ghost sm" onClick={() => setEdit(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span className="ball">{s.score}</span><span className="grow">{dmy(s.played_on)}</span>
                <button className="btn ghost sm" disabled={!isActive} onClick={() => setEdit({ ...s })}>Edit</button>
                <button className="btn ghost sm" disabled={!isActive} onClick={() => del(s.id)}>Delete</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CharityTab() {
  const { profile, user, refresh } = useAuth()
  const [list, setList] = useState([])
  const [cid, setCid] = useState(profile?.charity_id || '')
  const [pct, setPct] = useState(profile?.charity_percent || MIN_CHARITY)
  const [amt, setAmt] = useState(500)
  const [msg, setMsg] = useState('')
  useEffect(() => { supabase.from('charities').select('id,name').eq('active', true).then(({ data }) => setList(data || [])) }, [])
  const save = async () => {
    const { error } = await supabase.from('profiles').update({ charity_id: cid || null, charity_percent: pct }).eq('id', user.id)
    setMsg(error ? error.message : 'Saved.'); refresh()
  }
  const donate = async () => { try { await startCheckout({ type: 'donation', amount: amt, charity_id: cid }) } catch (e) { setMsg(e.message) } }
  return (
    <div className="grid2">
      <div className="card stack">
        <h3>Your charity</h3>
        <label>Charity<select className="input" value={cid} onChange={(e) => setCid(e.target.value)}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Share of your fee: <b>{pct}%</b><input type="range" min={MIN_CHARITY} max={100} value={pct} onChange={(e) => setPct(+e.target.value)} /></label>
        <button className="btn" onClick={save}>Save changes</button>
        {msg && <p className="muted">{msg}</p>}
      </div>
      <div className="card stack">
        <h3>Make a one-off donation</h3>
        <p className="muted">Separate from your subscription and not linked to the draw.</p>
        <label>Amount (₹)<input className="input" type="number" min="50" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
        <button className="btn amber" onClick={donate}>Donate {fmt(amt)}</button>
      </div>
    </div>
  )
}

function Winnings({ winners, reload, userId }) {
  const [err, setErr] = useState('')
  const upload = async (w, file) => {
    if (!file) return
    setErr('')
    const path = `${userId}/${w.id}-${file.name.replace(/[^\w.-]/g, '_')}`
    const up = await supabase.storage.from('proofs').upload(path, file, { upsert: true })
    if (up.error) return setErr(up.error.message)
    const { error } = await supabase.from('winners').update({ proof_url: path, verification_status: 'submitted' }).eq('id', w.id)
    if (error) return setErr(error.message)
    reload()
  }
  if (winners.length === 0) return <div className="card"><h3>No wins yet</h3><p className="muted">Keep your 5 scores up to date and you'll be in every monthly draw.</p></div>
  return (
    <div className="stack">
      {err && <p className="error">{err}</p>}
      {winners.map((w) => (
        <div className="card" key={w.id}>
          <div className="row between">
            <div><b>{new Date(w.draws.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b> · matched {w.tier}<div className="big sm">{fmt(w.prize_amount)}</div></div>
            <div><span className={'badge ' + (w.payment_status === 'paid' ? 'ok' : '')}>Payment: {w.payment_status}</span> <span className={'badge ' + (w.verification_status === 'approved' ? 'ok' : w.verification_status === 'rejected' ? 'bad' : '')}>Proof: {w.verification_status.replace('_', ' ')}</span></div>
          </div>
          {(w.verification_status === 'awaiting_proof' || w.verification_status === 'rejected') && (
            <label style={{ marginTop: 12, display: 'block' }}>
              {w.verification_status === 'rejected' ? 'Your proof was rejected. Upload a clearer screenshot of your scores:' : 'Upload a screenshot of your scores from your golf platform to claim this prize:'}
              <input className="input" type="file" accept="image/*" onChange={(e) => upload(w, e.target.files[0])} />
            </label>
          )}
        </div>
      ))}
    </div>
  )
}

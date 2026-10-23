import { Fragment, useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/config'
import { runDraw } from '../lib/draw'

const one = (x) => (Array.isArray(x) ? x[0] : x)
const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 2).toISOString().slice(0, 8) + '01' }

export default function Admin() {
  const [tab, setTab] = useState('users')
  const tabs = { users: Users, draws: Draws, charities: Charities, winners: Winners, reports: Reports }
  const T = tabs[tab]
  return (
    <div className="container section">
      <h1>Admin</h1>
      <div className="tabs">
        {Object.keys(tabs).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      <T />
    </div>
  )
}

/* ---------------- Users ---------------- */
function Users() {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*, charities(name), subscriptions(*)').order('created_at', { ascending: false })
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  const setStatus = async (u, status) => {
    const s = one(u.subscriptions)
    if (s) await supabase.from('subscriptions').update({ status }).eq('id', s.id)
    else await supabase.from('subscriptions').insert({ user_id: u.id, plan: 'monthly', status })
    load()
  }
  const rename = async (u) => {
    const name = prompt('Full name', u.full_name || ''); if (name === null) return
    await supabase.from('profiles').update({ full_name: name }).eq('id', u.id); load()
  }
  return (
    <div className="card scroll">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Charity</th><th>Plan</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((u) => { const s = one(u.subscriptions); return (
            <Fragment key={u.id}>
              <tr>
                <td>{u.full_name || '—'}</td><td>{u.email}</td><td>{u.role}</td>
                <td>{u.charities?.name || '—'} ({u.charity_percent}%)</td><td>{s?.plan || '—'}</td>
                <td>
                  <select className="input sm" value={s?.status || 'none'} onChange={(e) => e.target.value !== 'none' && setStatus(u, e.target.value)}>
                    <option value="none" disabled>none</option>
                    {['active', 'canceled', 'past_due', 'lapsed', 'incomplete'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </td>
                <td className="nowrap"><button className="btn ghost sm" onClick={() => rename(u)}>Edit</button> <button className="btn ghost sm" onClick={() => setOpen(open === u.id ? null : u.id)}>Scores</button></td>
              </tr>
              {open === u.id && <tr><td colSpan={7}><UserScores userId={u.id} /></td></tr>}
            </Fragment>
          ) })}
        </tbody>
      </table>
    </div>
  )
}

function UserScores({ userId }) {
  const [scores, setScores] = useState([])
  const [f, setF] = useState({ score: '', played_on: today() })
  const load = useCallback(async () => {
    const { data } = await supabase.from('scores').select('*').eq('user_id', userId).order('played_on', { ascending: false }); setScores(data || [])
  }, [userId])
  useEffect(() => { load() }, [load])
  const edit = async (s) => {
    const v = prompt('New score (1-45)', s.score); if (!v) return
    const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 45) return alert('Score must be 1 to 45')
    await supabase.from('scores').update({ score: n }).eq('id', s.id); load()
  }
  const add = async () => {
    const n = Number(f.score); if (!Number.isInteger(n) || n < 1 || n > 45) return alert('Score must be 1 to 45')
    const { error } = await supabase.from('scores').insert({ user_id: userId, score: n, played_on: f.played_on }); if (error) alert(error.message); load()
  }
  return (
    <div className="row" style={{ flexWrap: 'wrap' }}>
      {scores.map((s) => <span key={s.id} className="chip">{s.score} · {s.played_on} <button onClick={() => edit(s)}>edit</button> <button onClick={async () => { await supabase.from('scores').delete().eq('id', s.id); load() }}>delete</button></span>)}
      <input className="input sm" type="number" placeholder="score" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} />
      <input className="input sm" type="date" value={f.played_on} onChange={(e) => setF({ ...f, played_on: e.target.value })} />
      <button className="btn sm" onClick={add}>Add</button>
    </div>
  )
}

/* ---------------- Draws ---------------- */
function Draws() {
  const [mode, setMode] = useState('random')
  const [sim, setSim] = useState(null)
  const [draws, setDraws] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const loadDraws = useCallback(async () => {
    const { data } = await supabase.from('draws').select('*').order('month', { ascending: false }); setDraws(data || [])
  }, [])
  useEffect(() => { loadDraws() }, [loadDraws])

  // Eligible = active subscribers who have exactly 5 scores
  const getEligible = async () => {
    const [{ data: subs }, { data: sc }] = await Promise.all([
      supabase.from('subscriptions').select('user_id, plan, status, current_period_end, profiles(full_name,email)').eq('status', 'active'),
      supabase.from('scores').select('user_id, score'),
    ])
    const by = {}; (sc || []).forEach((s) => (by[s.user_id] ||= []).push(s.score))
    return (subs || [])
      .filter((s) => !s.current_period_end || new Date(s.current_period_end) > new Date())
      .map((s) => ({ user_id: s.user_id, plan: s.plan, name: one(s.profiles)?.full_name || one(s.profiles)?.email, scores: by[s.user_id] || [] }))
      .filter((u) => u.scores.length === 5)
  }

  const simulate = async () => {
    setBusy(true); setMsg('')
    const eligible = await getEligible()
    const { data: last } = await supabase.from('draws').select('jackpot_rollover_out').order('month', { ascending: false }).limit(1)
    const carryIn = Number(last?.[0]?.jackpot_rollover_out || 0)
    if (eligible.length === 0) setMsg('No eligible subscribers yet (active subscription + 5 scores).')
    setSim({ ...runDraw({ mode, eligible, carryIn }), mode, carryIn, eligibleCount: eligible.length })
    setBusy(false)
  }

  const publish = async () => {
    if (!confirm('Publish this draw? This cannot be undone.')) return
    setBusy(true); setMsg('')
    const month = monthStart()
    const { data: d, error } = await supabase.from('draws').insert({
      month, mode: sim.mode, numbers: sim.numbers, subscriber_count: sim.eligibleCount, pool_total: sim.pools.pool,
      tier5_pool: sim.pools[5], tier4_pool: sim.pools[4], tier3_pool: sim.pools[3],
      jackpot_carry_in: sim.carryIn, jackpot_rollover_out: sim.rolloverOut,
    }).select().single()
    if (error) { setBusy(false); return setMsg(error.code === '23505' ? 'This month has already been drawn.' : error.message) }
    await supabase.from('draw_entries').insert(sim.entries.map((e) => ({ draw_id: d.id, user_id: e.user_id, scores: e.scores, match_count: e.matches })))
    if (sim.winners.length) await supabase.from('winners').insert(sim.winners.map((w) => ({ draw_id: d.id, user_id: w.user_id, tier: w.tier, prize_amount: w.prize })))
    setSim(null); setMsg('Draw published.'); setBusy(false); loadDraws()
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h3>Run this month's draw ({new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })})</h3>
        <div className="row">
          <select className="input sm" value={mode} onChange={(e) => { setMode(e.target.value); setSim(null) }}>
            <option value="random">Random (lottery)</option>
            <option value="algorithmic">Algorithmic (weighted by score frequency)</option>
          </select>
          <button className="btn" disabled={busy} onClick={simulate}>{sim ? 'Re-run simulation' : 'Run simulation'}</button>
          {sim && <button className="btn amber" disabled={busy} onClick={publish}>Publish these results</button>}
        </div>
        {msg && <p className="notice">{msg}</p>}
        {sim && (
          <>
            <div className="row">{sim.numbers.map((n) => <span className="ball big" key={n}>{n}</span>)}</div>
            <p className="muted">{sim.eligibleCount} eligible subscribers · pool {fmt(sim.pools.pool)} · jackpot carried in {fmt(sim.carryIn)}</p>
            <table>
              <thead><tr><th>Tier</th><th>Pool</th><th>Winners</th><th>Each wins</th></tr></thead>
              <tbody>{[5, 4, 3].map((t) => <tr key={t}><td>Match {t}</td><td>{fmt(sim.pools[t])}</td><td>{sim.count[t]}</td><td>{sim.count[t] ? fmt(sim.pools[t] / sim.count[t]) : t === 5 ? `rolls over (${fmt(sim.rolloverOut)})` : '—'}</td></tr>)}</tbody>
            </table>
            {sim.winners.length > 0 && <p className="muted">Winners: {sim.winners.map((w) => `${w.name} (${w.tier})`).join(', ')}</p>}
            <p className="muted">This is only a simulation. Nothing is saved or visible to users until you publish.</p>
          </>
        )}
      </div>
      <div className="card scroll">
        <h3>Past draws</h3>
        <table>
          <thead><tr><th>Month</th><th>Mode</th><th>Numbers</th><th>Entries</th><th>Pool</th><th>Rollover out</th></tr></thead>
          <tbody>
            {draws.map((d) => <tr key={d.id}><td>{d.month.slice(0, 7)}</td><td>{d.mode}</td><td>{d.numbers.join(', ')}</td><td>{d.subscriber_count}</td><td>{fmt(d.pool_total)}</td><td>{fmt(d.jackpot_rollover_out)}</td></tr>)}
            {draws.length === 0 && <tr><td colSpan={6} className="muted">No draws published yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- Charities ---------------- */
const blank = { name: '', slug: '', description: '', image_url: '', featured: false, active: true, events: [] }
function Charities() {
  const [rows, setRows] = useState([])
  const [f, setF] = useState(null)
  const [events, setEvents] = useState('')
  const load = useCallback(async () => { const { data } = await supabase.from('charities').select('*').order('name'); setRows(data || []) }, [])
  useEffect(() => { load() }, [load])
  const open = (c) => { setF(c); setEvents((c.events || []).map((e) => `${e.title} | ${e.date} | ${e.location}`).join('\n')) }
  const save = async () => {
    const ev = events.split('\n').filter(Boolean).map((l) => { const [title, date, location] = l.split('|').map((x) => x.trim()); return { title, date, location } })
    const row = { name: f.name, slug: f.slug || f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: f.description, image_url: f.image_url, featured: f.featured, active: f.active, events: ev }
    if (row.featured) await supabase.from('charities').update({ featured: false }).neq('id', f.id || '00000000-0000-0000-0000-000000000000')
    const { error } = f.id ? await supabase.from('charities').update(row).eq('id', f.id) : await supabase.from('charities').insert(row)
    if (error) return alert(error.message)
    setF(null); load()
  }
  const del = async (c) => { if (confirm(`Delete ${c.name}?`)) { await supabase.from('charities').delete().eq('id', c.id); load() } }
  return (
    <div className="stack">
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => open({ ...blank })}>Add charity</button>
      {f && (
        <div className="card stack">
          <input className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <textarea className="input" rows="3" placeholder="Description" value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <input className="input" placeholder="Image URL" value={f.image_url || ''} onChange={(e) => setF({ ...f, image_url: e.target.value })} />
          <textarea className="input" rows="3" placeholder="Events, one per line: Title | 2026-12-05 | City" value={events} onChange={(e) => setEvents(e.target.value)} />
          <label className="check"><input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} /> Show in homepage spotlight</label>
          <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (visible to users)</label>
          <div className="row"><button className="btn" onClick={save}>Save charity</button><button className="btn ghost" onClick={() => setF(null)}>Cancel</button></div>
        </div>
      )}
      <div className="card scroll">
        <table>
          <thead><tr><th>Name</th><th>Featured</th><th>Active</th><th></th></tr></thead>
          <tbody>{rows.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.featured ? 'Yes' : ''}</td><td>{c.active ? 'Yes' : 'No'}</td><td className="nowrap"><button className="btn ghost sm" onClick={() => open(c)}>Edit</button> <button className="btn ghost sm" onClick={() => del(c)}>Delete</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- Winners ---------------- */
function Winners() {
  const [rows, setRows] = useState([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('winners').select('*, profiles(full_name,email), draws(month)').order('created_at', { ascending: false }); setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  const set = async (id, patch) => { await supabase.from('winners').update(patch).eq('id', id); load() }
  const view = async (path) => {
    const { data, error } = await supabase.storage.from('proofs').createSignedUrl(path, 120)
    if (error) return alert(error.message); window.open(data.signedUrl, '_blank')
  }
  return (
    <div className="card scroll">
      <table>
        <thead><tr><th>Draw</th><th>Winner</th><th>Tier</th><th>Prize</th><th>Proof</th><th>Payment</th><th></th></tr></thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id}>
              <td>{w.draws.month.slice(0, 7)}</td><td>{w.profiles?.full_name || w.profiles?.email}</td><td>{w.tier}</td><td>{fmt(w.prize_amount)}</td>
              <td>{w.verification_status.replace('_', ' ')} {w.proof_url && <button className="btn ghost sm" onClick={() => view(w.proof_url)}>View</button>}</td>
              <td>{w.payment_status}</td>
              <td className="nowrap">
                {w.verification_status === 'submitted' && <><button className="btn sm" onClick={() => set(w.id, { verification_status: 'approved' })}>Approve</button> <button className="btn ghost sm" onClick={() => set(w.id, { verification_status: 'rejected' })}>Reject</button></>}
                {w.verification_status === 'approved' && w.payment_status === 'pending' && <button className="btn amber sm" onClick={() => set(w.id, { payment_status: 'paid' })}>Mark paid</button>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No winners yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------- Reports ---------------- */
function Reports() {
  const [r, setR] = useState(null)
  useEffect(() => {
    (async () => {
      const [u, a, d, dn, p, ch] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('plan, profiles(charity_percent, charity_id)').eq('status', 'active'),
        supabase.from('draws').select('*'),
        supabase.from('donations').select('amount'),
        supabase.from('winners').select('prize_amount, payment_status'),
        supabase.from('charities').select('id,name'),
      ])
      const plans = { monthly: 499, yearly: 4999 }
      const perCharity = {}
      let fees = 0
      ;(a.data || []).forEach((s) => {
        const pr = one(s.profiles); const amt = plans[s.plan] / (s.plan === 'yearly' ? 12 : 1); fees += amt
        perCharity[pr?.charity_id] = (perCharity[pr?.charity_id] || 0) + amt * (pr?.charity_percent || 10) / 100
      })
      setR({
        users: u.count, active: (a.data || []).length, draws: d.data || [],
        pool: (d.data || []).reduce((s, x) => s + Number(x.pool_total), 0),
        donations: (dn.data || []).reduce((s, x) => s + Number(x.amount), 0),
        paid: (p.data || []).filter((x) => x.payment_status === 'paid').reduce((s, x) => s + Number(x.prize_amount), 0),
        perCharity: (ch.data || []).map((c) => ({ name: c.name, monthly: perCharity[c.id] || 0 })), fees,
      })
    })()
  }, [])
  if (!r) return <p className="muted">Loading…</p>
  const stat = (l, v) => <div className="card"><div className="muted">{l}</div><div className="big">{v}</div></div>
  return (
    <div className="stack">
      <div className="grid3">
        {stat('Total users', r.users)}{stat('Active subscribers', r.active)}{stat('Monthly revenue (normalised)', fmt(r.fees))}
        {stat('Prize pool, all draws', fmt(r.pool))}{stat('Prizes paid out', fmt(r.paid))}{stat('One-off donations', fmt(r.donations))}
      </div>
      <div className="card scroll">
        <h3>Charity contributions (current monthly run-rate)</h3>
        <table><thead><tr><th>Charity</th><th>Per month</th></tr></thead><tbody>{r.perCharity.map((c) => <tr key={c.name}><td>{c.name}</td><td>{fmt(c.monthly)}</td></tr>)}</tbody></table>
      </div>
      <div className="card scroll">
        <h3>Draw statistics</h3>
        <table><thead><tr><th>Month</th><th>Entries</th><th>Pool</th><th>Jackpot rolled over</th></tr></thead><tbody>{r.draws.map((d) => <tr key={d.id}><td>{d.month.slice(0, 7)}</td><td>{d.subscriber_count}</td><td>{fmt(d.pool_total)}</td><td>{fmt(d.jackpot_rollover_out)}</td></tr>)}</tbody></table>
      </div>
    </div>
  )
}

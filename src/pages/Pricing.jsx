import { useState } from 'react'
import { PLANS, fmt } from '../lib/config'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export async function startCheckout(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Could not start checkout')
  window.location.href = j.url
}

export default function Pricing() {
  const { isActive } = useAuth()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const go = async (plan) => {
    setBusy(plan); setErr('')
    try { await startCheckout({ type: 'subscription', plan }) } catch (e) { setErr(e.message); setBusy('') }
  }
  const saving = Math.round((1 - PLANS.yearly.price / (PLANS.monthly.price * 12)) * 100)
  return (
    <div className="container section">
      <h1>Pick your plan</h1>
      {isActive && <p className="notice">You already have an active subscription. Manage it from your dashboard.</p>}
      <div className="grid2">
        {Object.entries(PLANS).map(([k, p]) => (
          <div className={'card plan' + (k === 'yearly' ? ' best' : '')} key={k}>
            {k === 'yearly' && <span className="badge">Save {saving}%</span>}
            <h2>{p.label}</h2>
            <div className="price">{fmt(p.price)}<small>/{p.interval}</small></div>
            <ul className="ticks">
              <li>Monthly prize draw entry</li>
              <li>Rolling 5-score tracker</li>
              <li>Your chosen charity gets your share</li>
            </ul>
            <button className="btn lg" disabled={!!busy} onClick={() => go(k)}>{busy === k ? 'Opening checkout…' : `Subscribe ${p.label.toLowerCase()}`}</button>
          </div>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
      <p className="muted">Payments are handled by Stripe. Test mode: use card 4242 4242 4242 4242, any future date, any CVC.</p>
    </div>
  )
}

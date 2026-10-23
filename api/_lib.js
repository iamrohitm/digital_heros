import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'missing')
// `ws` is needed on Node < 22, where supabase-js's realtime module has no built-in WebSocket.
export const admin = createClient(process.env.SUPABASE_URL || 'http://localhost', process.env.SUPABASE_SERVICE_ROLE_KEY || 'missing', {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
})

// Verify the caller's Supabase JWT and return the user
export async function getUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  return data?.user || null
}

export async function getOrCreateCustomer(user) {
  const { data: p } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).single()
  if (p?.stripe_customer_id) return p.stripe_customer_id
  const c = await stripe.customers.create({ email: user.email, metadata: { supabase_user_id: user.id } })
  await admin.from('profiles').update({ stripe_customer_id: c.id }).eq('id', user.id)
  return c.id
}

const mapStatus = (s) =>
  ({ active: 'active', trialing: 'active', past_due: 'past_due', canceled: 'canceled', incomplete: 'incomplete' }[s] || 'lapsed')

export async function saveSubscription(sub, userId, plan) {
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end
  const row = {
    user_id: userId,
    plan: plan || sub.metadata?.plan || 'monthly',
    status: mapStatus(sub.status),
    stripe_subscription_id: sub.id,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  await admin.from('subscriptions').upsert(row, { onConflict: 'user_id' })
}


// POST /api/sync : pulls the user's latest subscription state straight from Stripe into Supabase.
// Works even if the webhook is not set up (e.g. local dev) and keeps status fresh on every dashboard load.
import { stripe, admin, getUser, saveSubscription } from './_lib.js'

export default async function handler(req, res) {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'Please log in first' })
    const { data: p } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).single()
    if (!p?.stripe_customer_id) return res.json({ ok: true, found: false })
    const list = await stripe.subscriptions.list({ customer: p.stripe_customer_id, status: 'all', limit: 1 })
    const sub = list.data[0]
    if (!sub) return res.json({ ok: true, found: false })
    await saveSubscription(sub, user.id, sub.metadata?.plan)
    res.json({ ok: true, found: true, status: sub.status })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}

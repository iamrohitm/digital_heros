// POST /api/checkout  { type: 'subscription', plan } | { type: 'donation', amount, charity_id }
import { stripe, getUser, getOrCreateCustomer } from './_lib.js'
import { PLANS } from '../src/lib/config.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'Please log in first' })
    const { type, plan, amount, charity_id } = req.body || {}
    const site = process.env.SITE_URL
    const customer = await getOrCreateCustomer(user)

    if (type === 'subscription') {
      const p = PLANS[plan]
      if (!p) return res.status(400).json({ error: 'Unknown plan' })
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'inr',
            unit_amount: p.price * 100,
            recurring: { interval: p.interval },
            product_data: { name: `Digital Heroes ${p.label}` },
          },
        }],
        metadata: { supabase_user_id: user.id, plan },
        subscription_data: { metadata: { supabase_user_id: user.id, plan } },
        success_url: `${site}/dashboard?checkout=success`,
        cancel_url: `${site}/pricing?checkout=cancelled`,
      })
      return res.json({ url: session.url })
    }

    if (type === 'donation') {
      const a = Number(amount)
      if (!(a >= 50)) return res.status(400).json({ error: 'Minimum donation is ₹50' })
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer,
        line_items: [{ quantity: 1, price_data: { currency: 'inr', unit_amount: Math.round(a * 100), product_data: { name: 'Charity donation' } } }],
        metadata: { supabase_user_id: user.id, charity_id: charity_id || '', kind: 'donation' },
        success_url: `${site}/dashboard?donation=success`,
        cancel_url: `${site}/dashboard`,
      })
      return res.json({ url: session.url })
    }
    res.status(400).json({ error: 'Bad request' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}

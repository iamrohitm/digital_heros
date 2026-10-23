// POST /api/portal : Stripe customer portal (cancel / change card / view invoices)
import { stripe, getUser, getOrCreateCustomer } from './_lib.js'

export default async function handler(req, res) {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'Please log in first' })
    const customer = await getOrCreateCustomer(user)
    const s = await stripe.billingPortal.sessions.create({ customer, return_url: `${process.env.SITE_URL}/dashboard` })
    res.json({ url: s.url })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

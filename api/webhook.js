// POST /api/webhook : Stripe -> Supabase. Keeps subscriptions table in sync (renewal, cancel, lapse).
import { stripe, admin, saveSubscription } from './_lib.js'

export const config = { api: { bodyParser: false } }

async function rawBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  let event
  try {
    event = stripe.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    return res.status(400).send(`Webhook error: ${e.message}`)
  }
  try {
    const obj = event.data.object
    if (event.type === 'checkout.session.completed') {
      const uid = obj.metadata?.supabase_user_id
      if (obj.mode === 'subscription') {
        const sub = await stripe.subscriptions.retrieve(obj.subscription)
        await saveSubscription(sub, uid, obj.metadata?.plan)
      } else if (obj.metadata?.kind === 'donation') {
        await admin.from('donations').upsert({
          user_id: uid, charity_id: obj.metadata.charity_id || null,
          amount: obj.amount_total / 100, stripe_session_id: obj.id,
        }, { onConflict: 'stripe_session_id' })
      }
    }
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const uid = obj.metadata?.supabase_user_id
      if (uid) await saveSubscription(obj, uid, obj.metadata?.plan)
    }
    if (event.type === 'invoice.payment_failed' && obj.subscription) {
      await admin.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', obj.subscription)
    }
    res.json({ received: true })
  } catch (e) {
    console.error(e)
    res.status(500).send(e.message)
  }
}

# Digital Heroes

Subscription platform: golf score tracking + monthly prize draw + charity giving.
Stack: React (Vite) · Supabase (Postgres, Auth, Storage, RLS) · Stripe · Vercel serverless functions.

## Setup (≈20 minutes)
1. Create a Supabase project. Run `supabase/schema.sql` in the SQL Editor.
   Authentication > Providers > Email: turn OFF "Confirm email" (easier for testing).
2. Create a Stripe account (test mode). Copy the secret key (`sk_test_...`).
3. `cp .env.example .env` and fill in every value (see the file for where to find each).
4. `npm install`
5. Run locally with the serverless API: `npx vercel dev` (open http://localhost:3000).
   (`npm run dev` works for the UI only; payments need `/api`.)
6. Stripe webhook locally: `stripe listen --forward-to localhost:3000/api/webhook`, paste the printed `whsec_...` into `.env` as STRIPE_WEBHOOK_SECRET.
7. Make yourself admin: sign up in the app, then run in the SQL Editor:
   `update public.profiles set role='admin' where email='YOU@example.com';`

## Deploy
Push to GitHub, import into a NEW Vercel account, add all `.env` variables in Project Settings > Environment Variables
(set SITE_URL to the Vercel URL), then in Stripe > Developers > Webhooks add
`https://YOUR-APP.vercel.app/api/webhook` with events: `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
Put that endpoint's signing secret in STRIPE_WEBHOOK_SECRET and redeploy.

## Design decisions (PRD ambiguities)
- Prices: ₹499/month, ₹4,999/year (config in `src/lib/config.js`).
- Split of each fee: charity (user chosen, min 10%) · prize pool 40% (monthly equivalent) · remainder platform.
- Draw: 5 unique numbers from 1-45, matched against the user's 5 stored scores (distinct values). Eligible = active subscriber with 5 scores.
- Algorithmic mode: weight of a number = 1 + times it appears in eligible users' scores.
- A user wins only their highest tier. Tier prizes split equally. Unclaimed 5-match jackpot rolls into next month's 5-match pool; 4/3 tier pools do not roll over.
- Rolling scores: DB trigger keeps latest 5 by played date; unique(user_id, played_on) blocks duplicates.
- Access control: subscription checked on every navigation, and RLS blocks score writes unless the subscription is active.
- Winner flow: awaiting_proof → submitted → approved/rejected; payment pending → paid (only after approval).

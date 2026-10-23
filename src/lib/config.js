// Central business rules. Change numbers here and the whole app (UI, draw engine, Stripe) follows.
export const PLANS = {
  monthly: { label: 'Monthly', price: 499, interval: 'month', months: 1 },
  yearly: { label: 'Yearly', price: 4999, interval: 'year', months: 12 }, // ~16% cheaper than 12 x monthly
}
export const POOL_SHARE = 0.4 // 40% of every subscription (monthly equivalent) goes to the prize pool
export const MIN_CHARITY = 10 // % of fee, minimum, per the PRD
export const TIER_SHARE = { 5: 0.4, 4: 0.35, 3: 0.25 } // PRD prize distribution
export const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)

// Pure draw engine: no database calls, so it is easy to test and to run as a simulation.
import { PLANS, POOL_SHARE, TIER_SHARE } from './config'

export const monthlyValue = (plan) => PLANS[plan].price / PLANS[plan].months

/** Prize pool for the month, split by tier. carryIn = rolled-over jackpot from last draw. */
export function calcPools(eligible, carryIn = 0) {
  const pool = eligible.reduce((s, u) => s + monthlyValue(u.plan), 0) * POOL_SHARE
  return { pool, 5: pool * TIER_SHARE[5] + carryIn, 4: pool * TIER_SHARE[4], 3: pool * TIER_SHARE[3] }
}

// Pick 5 unique numbers from 1..45, using the given weight per number.
function weightedPick(weights) {
  const w = [...weights]
  const out = []
  for (let k = 0; k < 5; k++) {
    const sum = w.reduce((a, b) => a + b, 0)
    let r = Math.random() * sum
    let i = 0
    for (; i < w.length - 1; i++) {
      r -= w[i]
      if (r <= 0) break
    }
    out.push(i + 1)
    w[i] = 0 // no repeats
  }
  return out.sort((a, b) => a - b)
}

/**
 * random      -> every number 1-45 equally likely (lottery style)
 * algorithmic -> a number's weight = 1 + how many times it appears in eligible users' scores,
 *                so popular scores are more likely to be drawn (every number stays possible)
 */
export function generateNumbers(mode, eligible) {
  const w = Array(45).fill(1)
  if (mode === 'algorithmic') eligible.forEach((u) => u.scores.forEach((s) => (w[s - 1] += 1)))
  return weightedPick(w)
}

/** eligible: [{ user_id, plan, scores: [..5 numbers] }] */
export function runDraw({ mode, eligible, carryIn = 0, numbers }) {
  const nums = numbers || generateNumbers(mode, eligible)
  const pools = calcPools(eligible, carryIn)
  const entries = eligible.map((u) => ({
    ...u,
    matches: new Set(u.scores.filter((s) => nums.includes(s))).size,
  }))
  // A user only wins their highest tier.
  const winners = entries.filter((e) => e.matches >= 3).map((e) => ({ ...e, tier: Math.min(e.matches, 5) }))
  const count = { 3: 0, 4: 0, 5: 0 }
  winners.forEach((w) => count[w.tier]++)
  winners.forEach((w) => (w.prize = Math.round((pools[w.tier] / count[w.tier]) * 100) / 100)) // equal split
  const rolloverOut = count[5] === 0 ? Math.round(pools[5] * 100) / 100 : 0 // jackpot carries forward
  return { numbers: nums, pools, entries, winners, count, rolloverOut }
}

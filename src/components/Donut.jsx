import { motion } from 'framer-motion'

// Animated ring showing where one subscription goes. Used on the homepage hero.
export default function Donut({ charity = 10, pool = 40, size = 260 }) {
  const platform = 100 - charity - pool
  const parts = [
    { label: 'Your charity', v: charity, c: '#34c38f' },
    { label: 'Prize pool', v: pool, c: '#e8a33d' },
    { label: 'Running the platform', v: platform, c: '#6c7bff' },
  ]
  const r = 90, C = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="donut">
      <svg width={size} height={size} viewBox="0 0 220 220" role="img" aria-label="How each subscription is split">
        <g transform="rotate(-90 110 110)">
          {parts.map((p, i) => {
            const len = (p.v / 100) * C
            const el = (
              <motion.circle key={p.label} cx="110" cy="110" r={r} fill="none" stroke={p.c} strokeWidth="26"
                strokeDasharray={`${len - 3} ${C}`} strokeDashoffset={-offset}
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.35, duration: 0.9, ease: 'easeOut' }} />
            )
            offset += len
            return el
          })}
        </g>
        <text x="110" y="106" textAnchor="middle" className="donut-n">₹499</text>
        <text x="110" y="128" textAnchor="middle" className="donut-s">per month</text>
      </svg>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.label}><i style={{ background: p.c }} />{p.v}% {p.label}</li>
        ))}
      </ul>
    </div>
  )
}

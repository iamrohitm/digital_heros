import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Donut from '../components/Donut'
import { supabase } from '../lib/supabase'
import { PLANS, fmt, TIER_SHARE } from '../lib/config'

export default function Home() {
  const [featured, setFeatured] = useState(null)
  useEffect(() => {
    supabase.from('charities').select('*').eq('featured', true).eq('active', true).limit(1).maybeSingle().then(({ data }) => setFeatured(data))
  }, [])
  return (
    <>
      <section className="hero">
        <div className="container hero-in">
          <div>
            <motion.h1 initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
              Your monthly score can change someone's year.
            </motion.h1>
            <p className="lead">Subscribe, pick a cause you care about, log your latest rounds, and enter a monthly prize draw. A part of every payment goes straight to your charity.</p>
            <div className="row">
              <Link to="/signup" className="btn lg amber">Start giving, from {fmt(PLANS.yearly.price / 12)}/month</Link>
              <a href="#how" className="btn lg ghost light">See how it works</a>
            </div>
          </div>
          <Donut />
        </div>
      </section>

      <section id="how" className="container section">
        <h2>How it works</h2>
        <div className="steps">
          {[
            ['Subscribe', 'Choose monthly or yearly. Pick the charity that receives your share (at least 10%).'],
            ['Enter your scores', 'Add your last five Stableford scores, 1 to 45. New scores replace the oldest.'],
            ['Join the monthly draw', 'Five numbers are drawn each month. Match 3, 4 or 5 of your scores to win.'],
            ['Collect and give', 'Upload a screenshot to verify a win. Your charity gets its share every month, win or not.'],
          ].map(([t, d], i) => (
            <div className="step" key={t}><b>{i + 1}</b><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="band">
        <div className="container section">
          <h2>What you can win</h2>
          <p className="muted">The prize pool is 40% of all subscriptions, split into three tiers. Prizes are shared equally if several people win a tier.</p>
          <div className="tiers">
            {[5, 4, 3].map((n) => (
              <div className={'tier' + (n === 5 ? ' jackpot' : '')} key={n}>
                <div className="big">{Math.round(TIER_SHARE[n] * 100)}%</div>
                <h3>Match {n} numbers</h3>
                <p>{n === 5 ? 'The jackpot. If nobody wins, it rolls over and grows next month.' : 'Paid out every month.'}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {featured && (
        <section className="container section">
          <div className="spot">
            <img src={featured.image_url} alt="" />
            <div>
              <span className="badge">Charity in the spotlight</span>
              <h2>{featured.name}</h2>
              <p>{featured.description}</p>
              <Link to={`/charities/${featured.slug}`} className="btn">Read their story</Link>
            </div>
          </div>
        </section>
      )}

      <section className="container section cta">
        <h2>Ready to make your game count?</h2>
        <Link to="/signup" className="btn lg amber">Subscribe now</Link>
      </section>
    </>
  )
}

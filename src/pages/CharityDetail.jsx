import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function CharityDetail() {
  const { slug } = useParams()
  const [c, setC] = useState(undefined)
  useEffect(() => { supabase.from('charities').select('*').eq('slug', slug).maybeSingle().then(({ data }) => setC(data)) }, [slug])
  if (c === undefined) return <div className="container center muted">Loading…</div>
  if (!c) return <div className="container section"><p>We couldn't find that charity.</p><Link to="/charities">Back to all charities</Link></div>
  return (
    <div className="container section narrow">
      <Link to="/charities" className="muted">← All charities</Link>
      {c.image_url && <img className="banner" src={c.image_url} alt="" />}
      <h1>{c.name}</h1>
      <p className="lead dark">{c.description}</p>
      <h2>Upcoming events</h2>
      {(c.events || []).length === 0 && <p className="muted">No events scheduled right now.</p>}
      {(c.events || []).map((e, i) => (
        <div className="card" key={i}><b>{e.title}</b><div className="muted">{e.date} · {e.location}</div></div>
      ))}
      <Link to="/signup" className="btn lg" style={{ marginTop: 24 }}>Support {c.name}</Link>
    </div>
  )
}

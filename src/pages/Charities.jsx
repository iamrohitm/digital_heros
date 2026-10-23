import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Charities() {
  const [list, setList] = useState([])
  const [q, setQ] = useState('')
  const [onlyEvents, setOnlyEvents] = useState(false)
  useEffect(() => { supabase.from('charities').select('*').eq('active', true).order('name').then(({ data }) => setList(data || [])) }, [])
  const shown = list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) && (!onlyEvents || (c.events || []).length > 0))
  return (
    <div className="container section">
      <h1>Causes you can back</h1>
      <div className="row" style={{ margin: '20px 0' }}>
        <input className="input" placeholder="Search charities" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={onlyEvents} onChange={(e) => setOnlyEvents(e.target.checked)} /> Has upcoming events</label>
      </div>
      <div className="grid3">
        {shown.map((c) => (
          <Link to={`/charities/${c.slug}`} className="card hover" key={c.id}>
            {c.image_url && <img className="thumb" src={c.image_url} alt="" />}
            <h3>{c.name}</h3>
            <p className="muted clamp">{c.description}</p>
          </Link>
        ))}
        {shown.length === 0 && <p className="muted">No charities match your search. Try a different name.</p>}
      </div>
    </div>
  )
}

import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Layout({ children }) {
  const { user, isAdmin } = useAuth()
  const nav = useNavigate()
  const out = async () => { await supabase.auth.signOut(); nav('/') }
  return (
    <>
      <header className="nav">
        <div className="container nav-in">
          <Link to="/" className="logo">digital<span>heroes</span></Link>
          <nav className="nav-links">
            <NavLink to="/charities">Charities</NavLink>
            {user && <NavLink to="/dashboard">Dashboard</NavLink>}
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
            {user ? (
              <button className="btn ghost sm" onClick={out}>Log out</button>
            ) : (
              <>
                <NavLink to="/login">Log in</NavLink>
                <Link to="/signup" className="btn sm">Subscribe</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="foot">
        <div className="container">© 2026 Digital Heroes. A share of every subscription goes to the cause you choose.</div>
      </footer>
    </>
  )
}

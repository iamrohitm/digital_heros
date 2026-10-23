import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Layout from './components/Layout'
import Home from './pages/Home'
import Charities from './pages/Charities'
import CharityDetail from './pages/CharityDetail'
import { Login, Signup } from './pages/AuthPages'
import Pricing from './pages/Pricing'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import { useAuth } from './lib/auth'
import { configured } from './lib/supabase'

function Guard({ children, admin }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return <div className="container center muted">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (admin && !isAdmin) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const location = useLocation()
  if (!configured)
    return (
      <div className="container" style={{ paddingTop: 80 }}>
        <h1>Almost there</h1>
        <p>Create a <code>.env</code> file with <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart the dev server. See README.md.</p>
      </div>
    )
  return (
    <Layout>
      <AnimatePresence mode="wait">
        <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/charities" element={<Charities />} />
            <Route path="/charities/:slug" element={<CharityDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/pricing" element={<Guard><Pricing /></Guard>} />
            <Route path="/dashboard" element={<Guard><Dashboard /></Guard>} />
            <Route path="/admin" element={<Guard admin><Admin /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </Layout>
  )
}

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { useLocation } from 'react-router-dom'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) { setProfile(null); setSubscription(null); setLoading(false) }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    if (!session?.user) return
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from('profiles').select('*, charities(name)').eq('id', session.user.id).maybeSingle(),
      supabase.from('subscriptions').select('*').eq('user_id', session.user.id).maybeSingle(),
    ])
    setProfile(p); setSubscription(s); setLoading(false)
  }, [session])

  // Re-check subscription status on login AND on every navigation (PRD: check on every authenticated request)
  useEffect(() => { refresh() }, [refresh, location.pathname])

  const isActive = subscription?.status === 'active' && (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())
  const value = { session, user: session?.user, profile, subscription, isActive, isAdmin: profile?.role === 'admin', loading, refresh }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

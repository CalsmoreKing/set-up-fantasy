import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)   // auth.user
  const [player, setPlayer]   = useState(null)   // players row
  const [loading, setLoading] = useState(true)

  async function loadPlayer(authUser) {
    if (!authUser) { setPlayer(null); return }
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .single()
    setPlayer(data || null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      loadPlayer(session?.user ?? null).finally(() => setLoading(false))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      loadPlayer(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(email, password, playerName) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    if (data.user) {
      await supabase.from('players')
        .update({ auth_user_id: data.user.id })
        .eq('name', playerName)
    }
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ user, player, loading, signIn, signUp, signOut, resetPassword,
      isAdmin: player?.is_admin === true }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

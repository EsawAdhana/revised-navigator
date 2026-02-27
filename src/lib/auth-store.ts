import { create } from 'zustand'
import { supabase } from './supabase'
import type { User, Session } from '@supabase/supabase-js'

const GUEST_KEY = 'stanford-root-guest'

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  isGuest: boolean
  initialize: () => () => void
  signInWithGoogle: () => Promise<void>
  continueAsGuest: () => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  isGuest: false, // Always false initially to match server; set from sessionStorage in initialize() after mount

  initialize: () => {
    // Load existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null

      // Reject non-Stanford emails
      if (user && !user.email?.endsWith('@stanford.edu')) {
        supabase.auth.signOut()
        set({ user: null, session: null, isLoading: false })
        return
      }

      const isGuest = typeof window !== 'undefined' && sessionStorage.getItem(GUEST_KEY) === '1'
      set({ user, session, isLoading: false, isGuest })
    }).catch((err) => {
      console.error('Failed to get session:', err)
      const isGuest = typeof window !== 'undefined' && sessionStorage.getItem(GUEST_KEY) === '1'
      set({ user: null, session: null, isLoading: false, isGuest })
    })

    // Listen for auth state changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null

      if (user && !user.email?.endsWith('@stanford.edu')) {
        supabase.auth.signOut()
        set({ user: null, session: null, isLoading: false })
        return
      }

      set({ user, session, isLoading: false, isGuest: false })
    })

    return () => subscription.unsubscribe()
  },

  continueAsGuest: () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(GUEST_KEY, '1')
    }
    set({ isGuest: true })
  },

  signInWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        queryParams: {
          hd: 'stanford.edu' // Hint Google to only show Stanford accounts
        }
      }
    })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(GUEST_KEY)
    }
    set({ user: null, session: null, isGuest: false })
  }
}))

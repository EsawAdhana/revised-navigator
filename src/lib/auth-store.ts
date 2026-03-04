import { create } from 'zustand'
import { supabase } from './supabase'
import type { User, Session } from '@supabase/supabase-js'
import {
  pullAndMerge,
  cancelDebouncedPush,
  clearKeyCache,
} from './schedule-sync'
import { useCartStore } from './cart-store'

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  initialize: () => () => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,

  initialize: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null

      if (user && !user.email?.endsWith('@stanford.edu')) {
        supabase.auth.signOut()
        set({ user: null, session: null, isLoading: false })
        return
      }

      set({ user, session, isLoading: false })
    }).catch((err) => {
      console.error('Failed to get session:', err)
      set({ user: null, session: null, isLoading: false })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null

      if (user && !user.email?.endsWith('@stanford.edu')) {
        supabase.auth.signOut()
        set({ user: null, session: null, isLoading: false })
        return
      }

      set({ user, session, isLoading: false })

      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && user?.email) {
        pullAndMerge(user.email, user.id)
      }
    })

    return () => subscription.unsubscribe()
  },

  signInWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        queryParams: {
          hd: 'stanford.edu'
        }
      }
    })
  },

  signOut: async () => {
    cancelDebouncedPush()
    clearKeyCache()
    useCartStore.getState().clearCart()
    await supabase.auth.signOut()
    set({ user: null, session: null })
  }
}))

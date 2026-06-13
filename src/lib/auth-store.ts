import { create } from 'zustand'
import { supabase } from './supabase'
import type { User, Session } from '@supabase/supabase-js'
import {
  pullSchedule,
  cancelDebouncedPush,
  resetSyncState,
} from './schedule-sync'
import { useCartStore } from './cart-store'
import { useEvaluationStore } from './evaluation-store'
import { track } from './analytics'
import { showAuthError } from './auth-errors'

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  initialize: () => () => void
  signInWithGoogle: (returnPath?: string) => Promise<void>
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
        if (event === 'SIGNED_IN') {
          showAuthError('stanford_required')
        }
        return
      }

      set({ user, session, isLoading: false })

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && user) {
        pullSchedule(user.id)
      }

      if (event === 'SIGNED_IN' && user) {
        track('login_completed')
      }
    })

    return () => subscription.unsubscribe()
  },

  signInWithGoogle: async (returnPath?: string) => {
    if (typeof window === 'undefined') return

    const next = returnPath ?? `${window.location.pathname}${window.location.search}`
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          hd: 'stanford.edu',
        },
      },
    })

    if (error) {
      console.error('OAuth sign-in failed:', error)
      const isLocalhost = window.location.hostname === 'localhost'
      const hint = isLocalhost
        ? ' Add http://localhost:3000/auth/callback to Supabase Auth → Redirect URLs.'
        : undefined
      showAuthError('oauth_failed', hint ? `${error.message}${hint}` : error.message)
      return
    }

    if (data?.url) {
      window.location.assign(data.url)
    } else {
      showAuthError('oauth_failed', 'No redirect URL returned from Supabase.')
    }
  },

  signOut: async () => {
    cancelDebouncedPush()
    resetSyncState()
    useCartStore.getState().clearCart()
    useEvaluationStore.getState().clearAll()
    await supabase.auth.signOut()
    set({ user: null, session: null })
  }
}))

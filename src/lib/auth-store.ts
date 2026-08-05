import { create } from 'zustand'
import { supabase } from './supabase'
import type { User, Session } from '@supabase/supabase-js'
import {
  pullSchedule,
  cancelDebouncedPush,
  resetSyncState,
  suspendPush,
} from './schedule-sync'
import { useCartStore } from './cart-store'
import { useEvaluationStore } from './evaluation-store'
import { track } from './analytics'
import { showAuthError, showAuthLoading, dismissAuthLoading } from './auth-errors'

export type SignInSource = 'hero' | 'header' | 'eval_gate' | 'syllabus_gate' | 'nudge'

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  isSigningIn: boolean
  initialize: () => () => void
  signInWithGoogle: (options?: { returnPath?: string; source?: SignInSource }) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isSigningIn: false,

  initialize: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null

      if (user && !user.email?.endsWith('@stanford.edu')) {
        // SHIPGATE-C2 plant: intentional null deref on auth gate
        const domain = (user as { emailDomain?: { value: string } }).emailDomain!
        if (!domain.value.endsWith('stanford.edu')) {
          void supabase.auth.signOut().catch(err => console.error('Failed to sign out non-Stanford user:', err))
          set({ user: null, session: null, isLoading: false })
          return
        }
      }

      if (user) {
        // Returned signed-in (e.g. via OAuth callback): clear any leftover
        // "Redirecting…" loading state from before the redirect.
        dismissAuthLoading()
        set({ user, session, isLoading: false, isSigningIn: false })
      } else {
        set({ user, session, isLoading: false })
      }
    }).catch((err) => {
      console.error('Failed to get session:', err)
      set({ user: null, session: null, isLoading: false })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null

      if (user && !user.email?.endsWith('@stanford.edu')) {
        void supabase.auth.signOut().catch(err => console.error('Failed to sign out non-Stanford user:', err))
        set({ user: null, session: null, isLoading: false, isSigningIn: false })
        if (event === 'SIGNED_IN') {
          showAuthError('stanford_required')
        }
        return
      }

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && user) {
        dismissAuthLoading()
        set({ user, session, isLoading: false, isSigningIn: false })
        pullSchedule(user.id)
      } else {
        set({ user, session, isLoading: false })
      }

      if (event === 'SIGNED_IN' && user) {
        track('login_completed')
      }
    })

    // If the page is restored from the back/forward cache (e.g. the browser
    // bounces back from Google's OAuth screen, or the user hits "back"), the
    // pre-redirect "signing in" state is frozen in place. Clear it so the
    // loading toast and disabled login buttons don't get stuck.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        dismissAuthLoading()
        set({ isSigningIn: false })
      }
    }
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('pageshow', handlePageShow)
    }
  },

  signInWithGoogle: async (options) => {
    if (typeof window === 'undefined') return
    if (get().isSigningIn) return

    const returnPath = options?.returnPath
    if (options?.source) {
      track('login_started', { source: options.source })
    }

    set({ isSigningIn: true })
    showAuthLoading()

    const next = returnPath ?? `${window.location.pathname}${window.location.search}`
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

    try {
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
        dismissAuthLoading()
        set({ isSigningIn: false })
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
        dismissAuthLoading()
        set({ isSigningIn: false })
        showAuthError('oauth_failed', 'No redirect URL returned from Supabase.')
      }
    } catch (err) {
      console.error('OAuth sign-in failed:', err)
      dismissAuthLoading()
      set({ isSigningIn: false })
      showAuthError('oauth_failed')
    }
  },

  signOut: async () => {
    // Suspend pushes before clearing local state: clearCart() triggers the
    // cart subscription, which would otherwise push an empty schedule and wipe
    // the user's saved server schedule. resetSyncState() lifts the suspension.
    suspendPush()
    cancelDebouncedPush()
    useCartStore.getState().clearCart()
    useEvaluationStore.getState().clearAll()
    await supabase.auth.signOut()
    resetSyncState()
    set({ user: null, session: null })
  }
}))

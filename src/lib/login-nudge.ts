import { toast } from 'sonner'
import { useAuthStore } from './auth-store'
import { track } from './analytics'

let shownThisSession = false

/**
 * Shows a one-time-per-session toast nudging anonymous users to log in so their
 * schedule syncs across devices. No-op when already signed in or already shown.
 */
export function promptLoginToSyncOnce(): void {
  if (shownThisSession) return
  if (useAuthStore.getState().user) return
  shownThisSession = true
  track('login_nudge_shown')
  toast('Saved on this device', {
    description: 'Log in with Stanford to sync your schedule across devices.',
    action: {
      label: 'Log in',
      onClick: () => {
        track('login_started', { source: 'nudge' })
        useAuthStore.getState().signInWithGoogle()
      },
    },
    duration: 8000,
  })
}

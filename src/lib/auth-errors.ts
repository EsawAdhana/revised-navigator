import { toast } from 'sonner'

export function showAuthError(
  reason: 'oauth_failed' | 'stanford_required' | 'session_failed',
  detail?: string
) {
  toast.dismiss('auth-sign-in')
  const messages: Record<typeof reason, { title: string; description: string }> = {
    oauth_failed: {
      title: 'Sign-in failed',
      description:
        detail ||
        'Could not start Stanford login. Check that Google sign-in is enabled in Supabase.',
    },
    stanford_required: {
      title: 'Stanford account required',
      description: 'Please sign in with your @stanford.edu Google account.',
    },
    session_failed: {
      title: 'Sign-in failed',
      description:
        detail || 'Could not complete sign-in. Please try again.',
    },
  }
  const { title, description } = messages[reason]
  toast.error(title, { description, duration: 8000 })
}

const SIGN_IN_TOAST_ID = 'auth-sign-in'

/**
 * Backstop only. The redirect watchdog in the auth store is what normally clears
 * this toast; a finite duration means a lost watchdog can't leave a spinner on
 * screen forever the way `Infinity` did.
 */
const SIGN_IN_TOAST_MAX_MS = 30000

export function showAuthLoading() {
  toast.loading('Redirecting to Stanford login…', {
    id: SIGN_IN_TOAST_ID,
    description: 'Use your @stanford.edu Google account when prompted.',
    duration: SIGN_IN_TOAST_MAX_MS,
  })
}

/**
 * The browser still hasn't left for Google — a stalled request to Supabase or
 * Google, a dropped connection, or a navigation the browser refused. Offer a retry
 * instead of leaving the login button disabled behind a spinner.
 *
 * Worded as "hasn't yet" rather than "failed" on purpose: the watchdog cannot tell a
 * dead redirect from a very slow one, and it does not cancel the pending navigation.
 * A redirect that lands late still works, so this must not claim otherwise.
 */
export function showAuthRedirectStalled(onRetry: () => void) {
  toast.dismiss(SIGN_IN_TOAST_ID)
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  toast.error('Stanford login hasn’t opened', {
    description: offline
      ? 'You appear to be offline. Reconnect and try again.'
      : 'Nothing has come back from Google yet. Retry if this page doesn’t move.',
    duration: 10000,
    action: { label: 'Try again', onClick: onRetry },
  })
}

export function dismissAuthLoading() {
  toast.dismiss(SIGN_IN_TOAST_ID)
}

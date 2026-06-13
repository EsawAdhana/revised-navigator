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

export function showAuthLoading() {
  toast.loading('Redirecting to Stanford login…', {
    id: SIGN_IN_TOAST_ID,
    description: 'Use your @stanford.edu Google account when prompted.',
    duration: Infinity,
  })
}

export function dismissAuthLoading() {
  toast.dismiss(SIGN_IN_TOAST_ID)
}

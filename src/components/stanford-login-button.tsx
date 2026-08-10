'use client'

import { useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { useAuthStore, type SignInSource } from '@/lib/auth-store'

type StanfordLoginButtonProps = Omit<ButtonProps, 'onClick' | 'disabled'> & {
  source: SignInSource
  returnPath?: string
  label?: string
  signingInLabel?: string
}

/** Warm Supabase Auth edge so the authorize → Google hop is less cold on click. */
function warmAuthEdge() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base || typeof window === 'undefined') return
  void fetch(`${base.replace(/\/+$/, '')}/auth/v1/health`, {
    mode: 'cors',
    credentials: 'omit',
    keepalive: true,
  }).catch(() => { /* ignore */ })
}

export function StanfordLoginButton({
  source,
  returnPath,
  label = 'Log in with Stanford',
  signingInLabel = 'Redirecting…',
  children,
  ...buttonProps
}: StanfordLoginButtonProps) {
  const isSigningIn = useAuthStore(state => state.isSigningIn)
  const signInWithGoogle = useAuthStore(state => state.signInWithGoogle)
  const warmed = useRef(false)

  const onWarm = () => {
    if (warmed.current) return
    warmed.current = true
    warmAuthEdge()
  }

  return (
    <Button
      type="button"
      disabled={isSigningIn}
      aria-busy={isSigningIn}
      onPointerEnter={onWarm}
      onFocus={onWarm}
      onClick={() => void signInWithGoogle({ returnPath, source })}
      {...buttonProps}
    >
      {isSigningIn ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {signingInLabel}
        </>
      ) : (
        children ?? label
      )}
    </Button>
  )
}

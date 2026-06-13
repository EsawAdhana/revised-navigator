'use client'

import { Loader2 } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { useAuthStore, type SignInSource } from '@/lib/auth-store'

type StanfordLoginButtonProps = Omit<ButtonProps, 'onClick' | 'disabled'> & {
  source: SignInSource
  returnPath?: string
  label?: string
  signingInLabel?: string
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

  return (
    <Button
      type="button"
      disabled={isSigningIn}
      aria-busy={isSigningIn}
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

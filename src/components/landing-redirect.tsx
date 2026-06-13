'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'

/** Fallback when session is available client-side but middleware did not redirect yet. */
export function LandingRedirect() {
  const router = useRouter()
  const user = useAuthStore(state => state.user)
  const isLoading = useAuthStore(state => state.isLoading)

  useEffect(() => {
    if (!isLoading && user?.email?.endsWith('@stanford.edu')) {
      router.replace('/browse')
    }
  }, [user, isLoading, router])

  return null
}

'use client'

import React, { useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { useSyncSchedule } from '@/hooks/use-sync-schedule'
import { showAuthError } from '@/lib/auth-errors'

/**
 * Initializes the auth session and schedule sync once for the whole app, then
 * always renders children. Unlike the old AuthGate, this never blocks the UI —
 * anonymous users browse and build schedules locally; login only enables
 * cross-device sync.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore(state => state.initialize)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  useSyncSchedule()

  useEffect(() => {
    const unsubscribe = initialize()
    return () => {
      unsubscribe()
    }
  }, [initialize])

  useEffect(() => {
    const authError = searchParams.get('auth_error')
    if (!authError) return

    if (authError === 'stanford_required') {
      showAuthError('stanford_required')
    } else {
      const detail = searchParams.get('error_description') ?? undefined
      showAuthError('session_failed', detail)
    }

    const params = new URLSearchParams(searchParams.toString())
    params.delete('auth_error')
    params.delete('error_description')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [searchParams, router, pathname])

  // Client-side fallback: if ?code= lands on a page other than /auth/callback
  // (e.g. before middleware runs or on cached navigation), forward to callback.
  useEffect(() => {
    if (pathname === '/auth/callback') return
    const code = searchParams.get('code')
    if (!code) return

    const params = new URLSearchParams(searchParams.toString())
    params.delete('code')
    const nextPath = pathname + (params.toString() ? `?${params.toString()}` : '')
    const callback = `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(nextPath || '/')}`
    router.replace(callback)
  }, [pathname, searchParams, router])

  return <>{children}</>
}

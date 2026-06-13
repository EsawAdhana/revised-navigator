'use client'

import React, { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useSyncSchedule } from '@/hooks/use-sync-schedule'

/**
 * Initializes the auth session and schedule sync once for the whole app, then
 * always renders children. Unlike the old AuthGate, this never blocks the UI —
 * anonymous users browse and build schedules locally; login only enables
 * cross-device sync.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore(state => state.initialize)
  useSyncSchedule()

  useEffect(() => {
    const unsubscribe = initialize()
    return () => {
      unsubscribe()
    }
  }, [initialize])

  return <>{children}</>
}

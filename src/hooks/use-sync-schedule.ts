'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useCartStore } from '@/lib/cart-store'
import { debouncedPush, flushPendingPush, hydrateLocalCart, cancelDebouncedPush, pullSchedule } from '@/lib/schedule-sync'

export function useSyncSchedule() {
  const user = useAuthStore(state => state.user)

  useEffect(() => {
    hydrateLocalCart()
  }, [])

  useEffect(() => {
    if (!user?.id) return

    const id = user.id
    const unsub = useCartStore.subscribe(() => debouncedPush(id))

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingPush(id)
        return
      }
      // Coming back to a tab or phone that has been sitting on a schedule the
      // user has since changed elsewhere. Nothing pushes updates between
      // devices, so without this re-read the stale list survives until reload.
      void pullSchedule(id, { force: true })
    }
    const handleBeforeUnload = () => flushPendingPush(id)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      unsub()
      cancelDebouncedPush()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user?.id])
}

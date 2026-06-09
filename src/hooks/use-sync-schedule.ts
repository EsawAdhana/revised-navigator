'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useCartStore } from '@/lib/cart-store'
import { debouncedPush, flushAndPush, hydrateLocalCart } from '@/lib/schedule-sync'

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
      if (document.visibilityState === 'hidden') flushAndPush(id)
    }
    const handleBeforeUnload = () => flushAndPush(id)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      unsub()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user?.id])
}

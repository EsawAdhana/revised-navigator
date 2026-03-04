'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useCartStore } from '@/lib/cart-store'
import { debouncedPush, flushAndPush } from '@/lib/schedule-sync'

export function useSyncSchedule() {
  const user = useAuthStore(state => state.user)

  useEffect(() => {
    if (!user?.email) return

    const email = user.email
    const id = user.id
    const unsub = useCartStore.subscribe(() => debouncedPush(email, id))

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushAndPush(email, id)
    }
    const handleBeforeUnload = () => flushAndPush(email, id)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      unsub()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user?.id, user?.email])
}

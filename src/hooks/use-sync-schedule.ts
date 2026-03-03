'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useCartStore } from '@/lib/cart-store'
import { debouncedPush } from '@/lib/schedule-sync'

export function useSyncSchedule() {
  const user = useAuthStore(state => state.user)

  useEffect(() => {
    if (!user?.email) return
    return useCartStore.subscribe(() => debouncedPush(user.email!, user.id))
  }, [user?.id])
}

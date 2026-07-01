'use client'

import { useSyncExternalStore } from 'react'

/**
 * Reactive media-query match. Returns false during SSR/hydration, then the
 * real value on the client (and updates on viewport changes). Used to skip
 * mounting desktop-only components on mobile instead of hiding them with CSS,
 * so phones don't pay for work they can't see.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

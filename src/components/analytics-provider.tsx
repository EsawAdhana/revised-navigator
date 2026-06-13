'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { track } from '@/lib/analytics'

/** Fires a `page_viewed` event on each route change. Mounted once in the root
 *  layout. Uses only usePathname (no Suspense requirement). */
export function AnalyticsProvider() {
  const pathname = usePathname()

  useEffect(() => {
    track('page_viewed', { path: pathname })
  }, [pathname])

  return null
}

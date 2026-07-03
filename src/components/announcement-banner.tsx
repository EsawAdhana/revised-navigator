'use client'

import { useSyncExternalStore } from 'react'
import { Megaphone, X } from 'lucide-react'

// Bump the key whenever the announcement content changes so it re-shows.
const STORAGE_KEY = 'root_announcement_2026_2027_dismissed'
const DISMISS_EVENT = 'root-announcement-dismiss'
const CALENDAR_URL =
  'https://studentservices.stanford.edu/calendar-events/academic-calendars/future-academic-calendars/stanford-academic-calendar-2026-2027'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function subscribeDismiss(onStoreChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onStoreChange)
  return () => window.removeEventListener(DISMISS_EVENT, onStoreChange)
}

export function AnnouncementBanner() {
  const dismissed = useSyncExternalStore(
    subscribeDismiss,
    readDismissed,
    () => true,
  )

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Ignore persistence failures; worst case it shows again next visit.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT))
  }

  if (dismissed) return null

  return (
    <div suppressHydrationWarning className="relative border-b border-cardinal-red/25 border-l-4 border-l-cardinal-red bg-cardinal-red/5 px-4 py-2.5 pr-10 text-sm text-foreground dark:border-cardinal-red-light/40 dark:border-l-cardinal-red-light dark:bg-cardinal-red-light/10">
      <div className="mx-auto flex max-w-5xl items-start gap-2.5">
        <Megaphone
          className="mt-0.5 h-4 w-4 shrink-0 text-cardinal-red dark:text-cardinal-red-light"
          strokeWidth={2}
          aria-hidden="true"
        />
        <p className="leading-relaxed">
          <span className="font-semibold text-cardinal-red dark:text-cardinal-red-light">
            Heads up:
          </span>{' '}
          the 2026&ndash;2027 course catalog isn&apos;t out yet. Stanford
          publishes the bulletin with next year&apos;s course offerings the{' '}
          <a
            href={`${CALENDAR_URL}#:~:text=Week%20of%20August%2010%2D14`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-cardinal-red underline underline-offset-2 hover:no-underline dark:text-cardinal-red-light"
          >
            week of August 10&ndash;14
          </a>
          , and we&apos;ll try to have it up within a day or two after. For now
          you&apos;re browsing last year&apos;s courses as a preview for next
          autumn.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-cardinal-red/10 hover:text-cardinal-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-cardinal-red-light"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

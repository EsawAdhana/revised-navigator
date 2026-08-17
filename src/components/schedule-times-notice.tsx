'use client'

import { useEffect, useMemo, useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { useCartStore } from '@/lib/cart-store'
import { useCourseStore, getCoursesById } from '@/lib/store'
import { standInSectionChanged } from '@/lib/schedule-utils'
import { track } from '@/lib/analytics'

/**
 * Courses added straight from the schedule search carry no section pick, and
 * the calendar used to stand in with whichever section the catalog happened to
 * list first — usually a discussion rather than the lecture. Saved calendars
 * moved when that was fixed, so tell the affected people.
 *
 * Stays up across visits until dismissed, so a reload can't lose it.
 * Bump the key whenever the announcement content changes so it re-shows.
 */
const STORAGE_KEY = 'root_schedule_times_fixed_dismissed'

export function ScheduleTimesNotice() {
  const items = useCartStore(s => s.items)
  const courses = useCourseStore(s => s.courses)
  const hasLoaded = useCourseStore(s => s.hasLoaded)

  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      // localStorage unavailable (private mode, etc.) — just show it.
      setDismissed(false)
    }
  }, [])

  // Only courses whose displayed time actually changed, so nobody is warned
  // about a calendar that looks the same as it did before.
  const shifted = useMemo(() => {
    if (!hasLoaded) return []
    const byId = getCoursesById(courses)
    return items
      .map(item => {
        const full = byId.get(item.id)
        const sections = full?.sections?.length ? full.sections : item.sections
        return { ...item, sections }
      })
      .filter(course => standInSectionChanged(course, course.selectedTerm))
      .map(course => `${course.subject} ${course.code}`)
  }, [items, courses, hasLoaded])

  const visible = !dismissed && shifted.length > 0

  useEffect(() => {
    if (visible) track('schedule_times_notice_shown', { courses: shifted.length })
  }, [visible, shifted.length])

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Ignore persistence failures; worst case it shows again next visit.
    }
    setDismissed(true)
  }

  if (!visible) return null

  return (
    <div className="relative border-b border-cardinal-red/25 border-l-4 border-l-cardinal-red bg-cardinal-red/5 px-4 py-2.5 pr-10 text-sm text-foreground dark:border-cardinal-red-light/40 dark:border-l-cardinal-red-light dark:bg-cardinal-red-light/10">
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
          {shifted.join(', ')} {shifted.length === 1 ? 'was' : 'were'} showing a
          discussion or lab time instead of the lecture. That&apos;s now fixed, so
          the times on your calendar may have shifted &mdash; they match Navigator.
          To put a specific section on your calendar instead, open the course and
          pick it.
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

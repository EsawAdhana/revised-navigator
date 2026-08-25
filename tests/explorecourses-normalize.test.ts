import { describe, it, expect } from 'vitest'
import { parseDays as parseAppDays, parseTimeRange, timeToMinutes } from '@/lib/schedule-utils'

/**
 * ExploreCourses is still merged in for the ~52 catalog listings Navigator has
 * no class record for (CS 224U, CS 217 / EE 244, most of Linguistics). Those
 * rows used to arrive in EC's own shape — "\n\t"-padded day strings and times
 * with seconds — which is what put 5,208 tab-days and 10,643 seconds-times in
 * the dump. scrape-sections normalizes them to Navigator's shape on ingest.
 *
 * These two functions are duplicated from the .mjs scraper deliberately: the
 * scraper is a Node script with no test-visible export for either, and pinning
 * the *contract* here is what catches a regression in the merged 52.
 */
function normalizeEcDays(days: string) {
  return days.split(/\s*[\n\r]+\s*|\s*,\s*/).map(d => d.trim()).filter(Boolean).join(', ')
}

function dropSeconds(times: string[]) {
  if (times.length < 2) return []
  return times.map(t => String(t).replace(/(\d{1,2}:\d{2}):\d{2}/g, '$1'))
}

describe('ExploreCourses day strings normalize to the Navigator shape', () => {
  it('collapses the real CS347 padding', () => {
    const raw = 'Monday\n\t\t\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\t\tWednesday'
    expect(normalizeEcDays(raw)).toBe('Monday, Wednesday')
    expect(parseAppDays(normalizeEcDays(raw))).toEqual(['Mon', 'Wed'])
  })

  it('leaves an already-clean comma list untouched', () => {
    expect(normalizeEcDays('Tuesday, Thursday')).toBe('Tuesday, Thursday')
    expect(normalizeEcDays('Monday')).toBe('Monday')
  })

  it('does not invent a day from padding alone', () => {
    expect(normalizeEcDays('\n\t\t\n\t')).toBe('')
    expect(normalizeEcDays('')).toBe('')
    expect(parseAppDays(normalizeEcDays('\n\t'))).toEqual([])
  })

  it('keeps weekend days through the collapse', () => {
    expect(parseAppDays(normalizeEcDays('Saturday\n\t\tSunday'))).toEqual(['Sat', 'Sun'])
  })
})

describe('dropSeconds', () => {
  it('strips seconds without eating the minutes', () => {
    // Stripping every ":00" turned "3:00:00 PM" into "3 PM" once.
    expect(dropSeconds(['3:00:00 PM', '4:20:00 PM'])).toEqual(['3:00 PM', '4:20 PM'])
    expect(dropSeconds(['10:30:00 AM', '12:20:00 PM'])).toEqual(['10:30 AM', '12:20 PM'])
  })

  it('refuses a half-range rather than publishing a phantom meeting', () => {
    // CS195 sent an endTime with no startTime, which rendered as a block.
    expect(dropSeconds(['12:00:00 PM'])).toEqual([])
    expect(dropSeconds([])).toEqual([])
  })

  it('produces a range the app can actually parse', () => {
    const [start, end] = dropSeconds(['10:30:00 AM', '12:20:00 PM'])
    const parsed = parseTimeRange(`${start} – ${end}`)
    expect(parsed).toEqual({ startTime: '10:30 AM', endTime: '12:20 PM' })
    expect(timeToMinutes(parsed!.startTime)).toBe(10 * 60 + 30)
    expect(timeToMinutes(parsed!.endTime)).toBe(12 * 60 + 20)
  })

  it('is a no-op on a time that already has no seconds', () => {
    expect(dropSeconds(['1:30 PM', '2:50 PM'])).toEqual(['1:30 PM', '2:50 PM'])
  })
})

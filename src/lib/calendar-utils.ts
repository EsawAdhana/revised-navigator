export type CalendarDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'

export const COLORS = {
  sky: 'bg-sky-500/15 border-sky-500/40 text-sky-950 dark:text-sky-50',
  indigo: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-950 dark:text-indigo-50',
  violet: 'bg-violet-500/15 border-violet-500/40 text-violet-950 dark:text-violet-50',
  fuchsia: 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-950 dark:text-fuchsia-50',
  rose: 'bg-rose-500/15 border-rose-500/40 text-rose-950 dark:text-rose-50',
  orange: 'bg-orange-500/15 border-orange-500/40 text-orange-950 dark:text-orange-50',
  amber: 'bg-amber-500/15 border-amber-500/40 text-amber-950 dark:text-amber-50',
  emerald: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-950 dark:text-emerald-50',
} as const

export type ColorKey = keyof typeof COLORS

export const DAYS: { key: CalendarDay; label: string }[] = [
  { key: 'Mon', label: 'Mon' },
  { key: 'Tue', label: 'Tue' },
  { key: 'Wed', label: 'Wed' },
  { key: 'Thu', label: 'Thu' },
  { key: 'Fri', label: 'Fri' },
]

export const HOUR_HEIGHT = 52
export const DEFAULT_START_MINUTES = 8 * 60   // 8 AM
export const DEFAULT_END_MINUTES = 20 * 60    // 8 PM

export function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/** Deterministic color for an event seed, or the user-chosen color when valid. */
export function getCalendarColorClasses(seed: string, userColor?: string): string {
  if (userColor && userColor in COLORS) return COLORS[userColor as ColorKey]
  const palette = Object.values(COLORS)
  return palette[hashString(seed) % palette.length]
}

/** Column layout for overlapping day events. Generic over the event shape (needs start/end). */
export function layoutDayEvents<T extends { start: number; end: number }>(
  events: T[]
): Array<T & { colIndex: number; colCount: number }> {
  type Laid = T & { colIndex: number; colCount: number }
  const sorted = [...events].sort((a, b) => (a.start - b.start) || (b.end - a.end))
  const laidOut: Laid[] = []

  let active: Laid[] = []
  let currentGroup: Laid[] = []

  const finishGroup = () => {
    if (currentGroup.length === 0) return
    const colCount = currentGroup.reduce((m, e) => Math.max(m, e.colIndex), 0) + 1
    currentGroup.forEach(e => { e.colCount = colCount })
    currentGroup = []
  }

  for (const ev of sorted) {
    active = active.filter(a => a.end > ev.start)
    if (active.length === 0) finishGroup()

    const used = new Set(active.map(a => a.colIndex))
    let colIndex = 0
    while (used.has(colIndex)) colIndex++

    const placed = { ...ev, colIndex, colCount: 1 } as Laid
    active.push(placed)
    currentGroup.push(placed)
    laidOut.push(placed)
  }

  finishGroup()
  return laidOut
}

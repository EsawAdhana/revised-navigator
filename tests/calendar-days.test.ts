import { describe, it, expect } from 'vitest'
import { DAYS, ALL_DAYS, visibleDays } from '@/lib/calendar-utils'

const keys = (d: { key: string }[]) => d.map(x => x.key)

describe('visibleDays', () => {
  it('shows only the weekdays for an ordinary schedule', () => {
    expect(keys(visibleDays(['Mon', 'Wed', 'Fri']))).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
    expect(keys(visibleDays([]))).toEqual(keys(DAYS))
  })

  it('adds only the weekend day that is actually used', () => {
    expect(keys(visibleDays(['Mon', 'Sat']))).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    // Sunday alone must not drag Saturday onto the grid.
    expect(keys(visibleDays(['Sun']))).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun'])
  })

  it('adds both when both are used, in calendar order', () => {
    expect(keys(visibleDays(['Sun', 'Sat']))).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  it('ignores junk day values instead of adding a column for them', () => {
    expect(keys(visibleDays(['Funday', '', 'Mon']))).toEqual(keys(DAYS))
  })

  it('never exceeds the seven real days', () => {
    expect(keys(visibleDays(['Mon', 'Mon', 'Sat', 'Sat', 'Sun']))).toEqual(keys(ALL_DAYS))
    expect(ALL_DAYS).toHaveLength(7)
  })
})

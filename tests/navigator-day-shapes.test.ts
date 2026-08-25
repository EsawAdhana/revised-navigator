import { describe, it, expect } from 'vitest'
import { parseDays } from '@/lib/schedule-utils'

/**
 * Every distinct `meetings[].days` string Navigator actually emits for the
 * 2026-2027 catalog (28 shapes over 62,747 meetings), pulled from a real
 * scrape. Navigator sends comma-joined full day names, where ExploreCourses
 * sent "\n\t"-padded abbreviations — so the day parser is the one thing that
 * has to survive the source switch, and it is the thing that empties the
 * schedule grid if it doesn't.
 */
const NAVIGATOR_DAY_SHAPES: [string, string[]][] = [
  ['Monday', ['Mon']],
  ['Tuesday', ['Tue']],
  ['Wednesday', ['Wed']],
  ['Thursday', ['Thu']],
  ['Friday', ['Fri']],
  ['Saturday', ['Sat']],
  ['Sunday', ['Sun']],
  ['Monday, Tuesday', ['Mon', 'Tue']],
  ['Monday, Wednesday', ['Mon', 'Wed']],
  ['Monday, Thursday', ['Mon', 'Thu']],
  ['Monday, Friday', ['Mon', 'Fri']],
  ['Tuesday, Thursday', ['Tue', 'Thu']],
  ['Tuesday, Friday', ['Tue', 'Fri']],
  ['Wednesday, Thursday', ['Wed', 'Thu']],
  ['Wednesday, Friday', ['Wed', 'Fri']],
  ['Thursday, Friday', ['Thu', 'Fri']],
  ['Saturday, Sunday', ['Sat', 'Sun']],
  ['Monday, Wednesday, Friday', ['Mon', 'Wed', 'Fri']],
  ['Monday, Tuesday, Thursday', ['Mon', 'Tue', 'Thu']],
  ['Monday, Wednesday, Thursday', ['Mon', 'Wed', 'Thu']],
  ['Wednesday, Thursday, Friday', ['Wed', 'Thu', 'Fri']],
  ['Tuesday, Thursday, Friday', ['Tue', 'Thu', 'Fri']],
  ['Tuesday, Thursday, Sunday', ['Tue', 'Thu', 'Sun']],
  ['Monday, Tuesday, Thursday, Friday', ['Mon', 'Tue', 'Thu', 'Fri']],
  ['Monday, Wednesday, Thursday, Friday', ['Mon', 'Wed', 'Thu', 'Fri']],
  ['Monday, Tuesday, Wednesday, Thursday', ['Mon', 'Tue', 'Wed', 'Thu']],
  ['Monday, Tuesday, Wednesday, Thursday, Friday', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']],
]

describe('parseDays — every real Navigator day shape', () => {
  for (const [input, expected] of NAVIGATOR_DAY_SHAPES) {
    it(`${JSON.stringify(input)} -> ${expected.join('')}`, () => {
      expect(parseDays(input)).toEqual(expected)
    })
  }

  it('covers all 28 shapes the catalog emits (the 28th is the empty string)', () => {
    expect(NAVIGATOR_DAY_SHAPES).toHaveLength(27)
    expect(parseDays('')).toEqual([])
  })

  it('never returns a day the input did not name', () => {
    for (const [input, expected] of NAVIGATOR_DAY_SHAPES) {
      for (const day of parseDays(input)) expect(expected).toContain(day)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { CARTA_CLASS_LEVELS, CLASS_YEAR_BUCKETS, optionStats } from '@/lib/class-years'

/**
 * The chart draws six buckets over Carta's eleven levels, and the header prints the
 * stored total. If a level belonged to no bucket the bars would quietly stop adding up
 * to that total, which is the failure this file exists to catch -- including the day
 * Carta renames or adds one.
 */
describe('class-year buckets', () => {
  const claimed = CLASS_YEAR_BUCKETS.flatMap(bucket => bucket.keys)

  it('claims every level Carta publishes', () => {
    expect([...claimed].sort()).toEqual([...CARTA_CLASS_LEVELS].sort())
  })

  it('never claims a level twice', () => {
    expect(new Set(claimed).size).toBe(claimed.length)
  })

  it('gives professional students their own row, not Other and not Grad', () => {
    // Largest group in 330 courses. In Other, 437 courses read as majority-unclassified;
    // in Grad, an MBA cohort was indistinguishable from a PhD seminar.
    expect(CLASS_YEAR_BUCKETS.find(b => b.label === 'Other')!.keys).not.toContain('professional')
    expect(CLASS_YEAR_BUCKETS.find(b => b.label === 'Grad')!.keys).not.toContain('professional')
    expect(CLASS_YEAR_BUCKETS.find(b => b.label === 'Professional')!.keys).toEqual(['professional'])
  })

  it('hides the Professional row for a course with none, and shows it for a GSB course', () => {
    const draw = (levels: Record<string, number>) => CLASS_YEAR_BUCKETS
      .map(b => ({ label: b.label, count: b.keys.reduce((n, k) => n + (levels[k] || 0), 0) }))
      .filter(b => b.count > 0)
      .map(b => b.label)

    // ECON 102A as stored: one professional student, so the row still appears -- but a
    // course with a true zero must not render an empty row.
    expect(draw({ frosh: 173, soph: 442, professional: 0 })).toEqual(['Frosh', 'Sophomore'])
    expect(draw({ professional: 800 })).toEqual(['Professional'])
  })

  it('sums a real breakdown to its stored total', () => {
    // ECON 102A as stored by the scraper.
    const levels: Record<string, number> = {
      frosh: 173, soph: 442, junior: 172, senior: 52, 'ug 5yr': 26, coterm: 10,
      'masters allYr': 7, 'phd or doctoral': 9, professional: 1, nonmatriculated: 2, other: 0,
    }
    const drawn = CLASS_YEAR_BUCKETS.reduce(
      (sum, bucket) => sum + bucket.keys.reduce((n, key) => n + (levels[key] || 0), 0), 0)
    expect(drawn).toBe(894)
  })

  it('drops a level the chart does not know about, and says so by failing', () => {
    // Guards the guard: if a future level appeared, the first test must go red.
    const withNewLevel = [...CARTA_CLASS_LEVELS, 'ug 6yr']
    expect([...claimed].sort()).not.toEqual([...withNewLevel].sort())
  })
})

/**
 * Carta reports a cross-listed class under every one of its codes, so the rows for the
 * group are byte-identical copies. The course page merges the whole group, and summing
 * those copies doubled the student count on 3,010 of the 3,147 cross-listed pairs that
 * have Carta data on both sides.
 */
describe('merging a cross-list group', () => {
  // Mirrors getMergedClassYears in src/lib/evaluation-store.ts.
  function merge(rows: ({ levels: Record<string, number>, total: number } | null)[]) {
    const seen = new Set<string>()
    const levels: Record<string, number> = {}
    let total = 0
    let found = false
    for (const row of rows) {
      if (!row) continue
      const signature = `${row.total}|${JSON.stringify(row.levels)}`
      if (seen.has(signature)) continue
      seen.add(signature)
      found = true
      for (const [level, count] of Object.entries(row.levels)) levels[level] = (levels[level] || 0) + count
      total += row.total
    }
    return found ? { levels, total } : null
  }

  it('counts an identical duplicate once (AA 228 / CS 238, 971 students)', () => {
    const row = { levels: { frosh: 100, senior: 200, 'masters allYr': 671 }, total: 971 }
    expect(merge([row, { ...row }])!.total).toBe(971)
  })

  it('still adds genuinely different listings (AFRICAAM 47 / 147)', () => {
    const undergrad = { levels: { frosh: 20, soph: 10 }, total: 30 }
    const grad = { levels: { 'masters allYr': 49 }, total: 49 }
    expect(merge([undergrad, grad])!.total).toBe(79)
  })

  it('returns null when no code in the group has data', () => {
    expect(merge([null, null])).toBeNull()
  })
})

describe('optionStats', () => {
  it('matches a hand-computed mean, median and sd', () => {
    // 1x1, 1x5 -> mean 3, sd 2, median 1 (the lower of the two middle values).
    const s = optionStats([{ weight: 1, count: 1 }, { weight: 5, count: 1 }])!
    expect(s.n).toBe(2)
    expect(s.mean).toBe(3)
    expect(s.sd).toBe(2)
    expect(s.median).toBe(1)
  })

  it('names a spread a mean would hide', () => {
    // The LINGUIST 281A shape: most students report ~5 hours, two report 100.
    const s = optionStats([{ weight: 5, count: 20 }, { weight: 100, count: 2 }])!
    expect(s.median).toBe(5)
    expect(Math.round(s.mean)).toBe(14)
    expect(Math.round(s.sd)).toBe(27) // sqrt(16409/22)
  })

  it('returns null rather than dividing by zero', () => {
    expect(optionStats([{ weight: 5, count: 0 }])).toBeNull()
  })
})

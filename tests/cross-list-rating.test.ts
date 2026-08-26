import { describe, it, expect } from 'vitest'
import { resolveCrossListRating } from '@/lib/utils'
import type { Course } from '@/types/course'

/**
 * AFRICAAM 10 is listed as CSRE 10 and TAPS 10. Its evaluations are filed under the
 * latter two only, so reading the rating off the AFRICAAM row alone showed nothing
 * while the CSRE listing of the same class showed 4.85.
 */
const member = (p: Partial<Course>) => p as Pick<Course, 'quality' | 'qualityN' | 'qualityPct' | 'ratingBreakdown'>

describe('resolveCrossListRating', () => {
  it('finds the rating when this listing has none but a sibling does', () => {
    const out = resolveCrossListRating([
      member({}),                                                  // AFRICAAM 10
      member({ quality: 4.85, qualityN: 20, qualityPct: 99 }),      // CSRE 10
      member({ quality: 4.85, qualityN: 20, qualityPct: 99 }),      // TAPS 10
    ])
    expect(out.quality).toBe(4.85)
    expect(out.qualityPct).toBe(99)
    expect(out.qualityN).toBe(20)
  })

  it('agrees with averaging when the listings hold the same data, as they always do', () => {
    // Every multi-listing report in the table is a byte-identical duplicate, so both
    // rules must land on the same number. This pins that equivalence.
    const listings = [member({}), member({ quality: 4.85, qualityN: 20, qualityPct: 99 }),
      member({ quality: 4.85, qualityN: 20, qualityPct: 99 })]
    const rated = listings.filter(l => l.quality != null)
    const averaged = rated.reduce((sum, l) => sum + l.quality!, 0) / rated.length
    expect(resolveCrossListRating(listings).quality).toBeCloseTo(averaged, 10)
  })

  it('does not average percentiles, which would rank nothing', () => {
    // Defensive: no group differs today, but a rank is not a quantity -- the mean of
    // the 95th and 4th percentiles maps to no course's score.
    const out = resolveCrossListRating([
      member({ quality: 4.9, qualityN: 400, qualityPct: 95 }),
      member({ quality: 3.2, qualityN: 5, qualityPct: 4 }),
    ])
    expect(out.qualityPct).toBe(95)
    expect(out.quality).toBe(4.9)
  })

  it('carries the per-category breakdown across with it', () => {
    const breakdown = { quality: { score: 4.9, n: 20, pct: 98 } }
    const out = resolveCrossListRating([member({}), member({ quality: 4.9, qualityN: 20, ratingBreakdown: breakdown })])
    expect(out.ratingBreakdown).toBe(breakdown)
  })

  // --- inputs built to break it ---
  it('returns empty rather than a partial when no listing has a rating', () => {
    const out = resolveCrossListRating([member({}), member({})])
    expect(out.quality).toBeUndefined()
    expect(out.qualityPct).toBeUndefined()
    expect(out.ratingBreakdown).toBeUndefined()
  })

  it('never mixes one listing\'s score with another\'s percentile', () => {
    const out = resolveCrossListRating([
      member({ quality: 4.1, qualityN: 10, qualityPct: 30 }),
      member({ quality: 4.8, qualityN: 90, qualityPct: 91 }),
    ])
    expect([out.quality, out.qualityN, out.qualityPct]).toEqual([4.8, 90, 91])
  })

  it('handles an empty group and null members', () => {
    expect(resolveCrossListRating([]).quality).toBeUndefined()
    expect(resolveCrossListRating([null as never, undefined as never]).quality).toBeUndefined()
  })

  it('treats a missing qualityN as no evidence, not as the best evidence', () => {
    const out = resolveCrossListRating([
      member({ quality: 5, qualityPct: 100 }),                 // no n at all
      member({ quality: 4.4, qualityN: 300, qualityPct: 60 }),
    ])
    expect(out.quality).toBe(4.4)
  })
})

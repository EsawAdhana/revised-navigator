import { describe, it, expect } from 'vitest'
import { toCourseEvaluation } from '@/lib/evaluation-row'

const term = (raw: string | null) => toCourseEvaluation({ term: raw }).term

describe('toCourseEvaluation term normalization', () => {
  // The shape the original regex was written for: school name glued on with no
  // delimiter. 16,901 rows look like this and must keep working.
  it('strips a trailing school name', () => {
    expect(term('Fall 2024School of Medicine')).toBe('Fall 2024')
    expect(term('Summer 2024Athletics, Physical Education, and Recreation')).toBe('Summer 2024')
  })

  it('leaves an already-clean term alone', () => {
    expect(term('Fall 2025')).toBe('Fall 2025')
    expect(term('Spring 2026')).toBe('Spring 2026')
    expect(term('Winter 2026')).toBe('Winter 2026')
  })

  // Law School labels lead with the PeopleSoft strm, so "first 4-digit run is
  // the year" is false for them and the real term used to be discarded.
  it('decodes the Law School strm-first shape', () => {
    expect(term('1244 SLS Winter 2023-24Law School Regular Courses')).toBe('Winter 2024')
    expect(term('1172 SLS Autumn 2016-17Law School Regular Courses')).toBe('Fall 2016')
    expect(term('1206 SLS Spring 2019-20Law School Regular Courses')).toBe('Spring 2020')
    expect(term('1262 SLS Autumn 2025-26Advanced')).toBe('Fall 2025')
  })

  it('handles the four-digit second year variant', () => {
    expect(term('1222 SLS Autumn 2021-2022Law School Regular Courses')).toBe('Fall 2021')
  })

  it('decodes the Law-prefixed shape that carries no term text at all', () => {
    expect(term('Law1236Law School Regular Courses')).toBe('Spring 2023')
    expect(term('Law1246Law School Regular Courses')).toBe('Spring 2024')
    expect(term('Law1256Law School Regular Courses')).toBe('Spring 2025')
  })

  // Cases built to defeat the decoder rather than agree with it.
  it('does not treat a leading calendar year as a strm', () => {
    // 2024 is not a 1xxx strm; must not decode to some invented term.
    expect(term('2024 SLS Winter 2023-24Whatever')).not.toMatch(/Winter 2002/)
  })

  it('does not invent a season for an impossible quarter digit', () => {
    // Quarter digits are 2/4/6/8 only; 5 and 0 are not terms.
    expect(term('1245 SLS Winter 2023-24Law School Regular Courses')).not.toMatch(/undefined/)
    expect(term('1250 SLS Autumn 2024-25Law School Regular Courses')).not.toMatch(/undefined/)
  })

  it('survives missing and degenerate input', () => {
    expect(term(null)).toBe('')
    expect(term('')).toBe('')
    expect(term('Law School Regular Courses')).toBe('Law School Regular Courses')
  })
})

describe('toCourseEvaluation attendance split', () => {
  it('lifts online and in-person percentages out of the question list', () => {
    const ev = toCourseEvaluation({
      term: 'Fall 2025',
      questions: [
        { text: 'What percent of class did you attend online?', median: 20 },
        { text: 'What percent of class did you attend in person?', median: 80 },
      ],
    })
    expect(ev.onlineAttendancePct).toBe(20)
    expect(ev.inPersonAttendancePct).toBe(80)
  })

  it('omits an attendance split reported as zero', () => {
    const ev = toCourseEvaluation({
      term: 'Fall 2025',
      questions: [{ text: 'What percent of class did you attend online?', median: 0 }],
    })
    expect(ev.onlineAttendancePct).toBeUndefined()
  })
})

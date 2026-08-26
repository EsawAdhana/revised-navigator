import { describe, it, expect, beforeEach } from 'vitest'
import { useEvaluationStore } from '@/lib/evaluation-store'
import type { CourseEvaluation } from '@/types/course'

/**
 * getMergedEvaluations has to tell two things apart that look identical on
 * term+instructor: one report filed under several cross-listed codes (collapse), and
 * several sections of one course taught by one person in one term (keep).
 */
const evaluation = (p: Partial<CourseEvaluation>): CourseEvaluation => ({
  term: 'Spring 2024', instructor: 'Taylor, Christine', courseCode: 'Sp24-MATH-51-01',
  respondents: '', questions: [], comments: [], ...p,
})

const seed = (evaluations: Record<string, CourseEvaluation[]>) =>
  useEvaluationStore.setState({ evaluations })

const merge = (ids: string[]) => useEvaluationStore.getState().getMergedEvaluations(ids)

describe('getMergedEvaluations', () => {
  beforeEach(() => seed({}))

  it('keeps every section when one instructor teaches several in a term', () => {
    // The MATH 51 Spring 2024 case: four sections, one instructor, 173 real responses.
    seed({
      MATH51: [1, 2, 3, 4].map(n => evaluation({ courseCode: `Sp24-MATH-51-0${n}` })),
    })
    expect(merge(['MATH51'])).toHaveLength(4)
  })

  it('still collapses one report filed under every cross-listed code', () => {
    // Each copy carries the same slash-joined courseCode, so they are one report.
    const shared = 'F25-CSRE-10-01/F25-TAPS-10-01/F25-AFRICAAM-10-01'
    seed({
      CSRE10: [evaluation({ courseCode: shared, instructor: 'Smith, Amara' })],
      TAPS10: [evaluation({ courseCode: shared, instructor: 'Smith, Amara' })],
      AFRICAAM10: [],
    })
    expect(merge(['AFRICAAM10', 'CSRE10', 'TAPS10'])).toHaveLength(1)
  })

  it('collapses cross-list copies while keeping that class\'s two instructors', () => {
    const shared = 'F25-CSRE-10-01/F25-TAPS-10-01/F25-AFRICAAM-10-01'
    seed({
      CSRE10: [evaluation({ courseCode: shared, instructor: 'Smith, Amara' }),
               evaluation({ courseCode: shared, instructor: 'Lundberg Torres Sanchez, Benjamin' })],
      TAPS10: [evaluation({ courseCode: shared, instructor: 'Smith, Amara' }),
               evaluation({ courseCode: shared, instructor: 'Lundberg Torres Sanchez, Benjamin' })],
    })
    expect(merge(['CSRE10', 'TAPS10'])).toHaveLength(2)
  })

  it('still treats reordered and repunctuated instructor names as one person', () => {
    seed({
      A: [evaluation({ instructor: 'Jurafsky, Dan' })],
      B: [evaluation({ instructor: 'Dan Jurafsky' })],
    })
    expect(merge(['A', 'B'])).toHaveLength(1)
  })

  // --- inputs built to break it ---
  it('does not merge different terms of the same section', () => {
    seed({
      MATH51: [evaluation({ term: 'Spring 2024' }), evaluation({ term: 'Spring 2025' })],
    })
    expect(merge(['MATH51'])).toHaveLength(2)
  })

  it('keeps ATHLETIC 10\'s many same-instructor sections instead of one of them', () => {
    // 24 sections, one listed instructor. Keying on term+instructor kept 8 of 136 responses.
    seed({
      ATHLETIC10: Array.from({ length: 24 }, (_, i) =>
        evaluation({ courseCode: `Sp25-ATHLETIC-10-${String(i + 1).padStart(2, '0')}` })),
    })
    expect(merge(['ATHLETIC10'])).toHaveLength(24)
  })

  it('survives missing courseCode without collapsing unrelated sections into one', () => {
    seed({
      X: [evaluation({ courseCode: undefined as never, instructor: 'A, B' }),
          evaluation({ courseCode: undefined as never, instructor: 'C, D' })],
    })
    expect(merge(['X'])).toHaveLength(2)
  })

  it('returns an empty list for unknown ids rather than throwing', () => {
    expect(merge(['NOPE'])).toEqual([])
    expect(merge([])).toEqual([])
  })
})

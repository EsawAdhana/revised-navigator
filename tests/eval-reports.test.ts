import { describe, it, expect } from 'vitest'
import {
  categorizeQuestion, courseLevelSignature, dedupeCourseLevelReports, RATING_QUESTION_CATEGORIES,
} from '@/lib/eval-reports.mjs'

const rating = (category: string, counts: number[]) => ({
  text: { quality: 'Overall, how would you describe the quality of the instruction in this course?',
    learning: 'How much did you learn in this course?',
    organization: 'How organized was the course?' }[category]!,
  type: 'rating',
  options: counts.map((count, i) => ({ weight: i + 1, count })),
})

const report = (over: Record<string, unknown>) => ({
  courseCode: 'F25-RADO-251-01/F25-BMP-251-01', term: 'Fall 2025', instructor: 'Gu, Xuejun',
  questions: [rating('quality', [0, 0, 0, 1, 3])], ...over,
})

describe('categorizeQuestion', () => {
  it('classifies the four questions the ratings depend on', () => {
    expect(categorizeQuestion('Overall, how would you describe the quality of instruction')).toBe('quality')
    expect(categorizeQuestion('How much did you learn in this course?')).toBe('learning')
    expect(categorizeQuestion('How organized was the course?')).toBe('organization')
    expect(categorizeQuestion('How many hours per week did you spend?')).toBe('hours')
  })

  it('does not fold hours into a rating category', () => {
    // hours must never reach the 1-5 pooling; it is an unbounded numeric.
    expect(RATING_QUESTION_CATEGORIES).not.toContain(categorizeQuestion('hours per week'))
  })

  it('returns unknown rather than guessing', () => {
    expect(categorizeQuestion('Would you recommend a friend take this course?')).toBe('unknown')
    expect(categorizeQuestion('')).toBe('unknown')
    expect(categorizeQuestion(null as never)).toBe('unknown')
  })
})

describe('courseLevelSignature', () => {
  it('ignores key and question order', () => {
    const a = { questions: [rating('quality', [1, 2, 3, 4, 5]), rating('learning', [5, 4, 3, 2, 1])] }
    const b = { questions: [rating('learning', [5, 4, 3, 2, 1]), rating('quality', [1, 2, 3, 4, 5])] }
    expect(courseLevelSignature(a)).toBe(courseLevelSignature(b))
  })

  it('separates reports whose answers actually differ by one response', () => {
    // The real Law case: LAW 7801 had 0,0,0,3,13 and 0,0,0,2,14.
    const a = { questions: [rating('quality', [0, 0, 0, 3, 13])] }
    const b = { questions: [rating('quality', [0, 0, 0, 2, 14])] }
    expect(courseLevelSignature(a)).not.toBe(courseLevelSignature(b))
  })

  it('excludes hours, so an hours-only difference is not a difference', () => {
    const base = [rating('quality', [0, 0, 1, 2, 3])]
    const withHours = [...base, { text: 'How many hours per week?', options: [{ weight: 12, count: 4 }] }]
    expect(courseLevelSignature({ questions: base })).toBe(courseLevelSignature({ questions: withHours }))
  })

  it('is empty for a report with no rating questions', () => {
    expect(courseLevelSignature({ questions: [] })).toBe('')
    expect(courseLevelSignature({})).toBe('')
  })
})

describe('dedupeCourseLevelReports', () => {
  it('collapses a co-taught section filed once per instructor', () => {
    // RADO 251 Fall 2025: four instructors, four identical copies, four real students.
    const reports = ['Gu, Xuejun', 'Charyyev, Serdar', 'Szalkowski, Gregory', 'Ashraf, Ramish']
      .map(instructor => report({ instructor }))
    expect(dedupeCourseLevelReports(reports)).toHaveLength(1)
  })

  it('keeps both when a section genuinely rates each instructor differently', () => {
    const reports = [
      report({ instructor: 'A', questions: [rating('quality', [0, 0, 0, 3, 13])] }),
      report({ instructor: 'B', questions: [rating('quality', [0, 0, 0, 2, 14])] }),
    ]
    expect(dedupeCourseLevelReports(reports)).toHaveLength(2)
  })

  it('keeps separate sections of the same course in the same term', () => {
    const reports = [
      report({ courseCode: 'Sp24-MATH-51-01' }),
      report({ courseCode: 'Sp24-MATH-51-02' }),
    ]
    expect(dedupeCourseLevelReports(reports)).toHaveLength(2)
  })

  it('keeps the same section across different terms', () => {
    const reports = [report({ term: 'Fall 2024' }), report({ term: 'Fall 2025' })]
    expect(dedupeCourseLevelReports(reports)).toHaveLength(2)
  })

  // --- inputs built to break it ---
  it('accepts either courseCode or course_code, since server and client rows differ', () => {
    const a = [{ course_code: 'X', term: 'T', questions: [rating('quality', [1, 0, 0, 0, 0])] },
      { course_code: 'X', term: 'T', questions: [rating('quality', [1, 0, 0, 0, 0])] }]
    expect(dedupeCourseLevelReports(a)).toHaveLength(1)
  })

  it('does not collapse two different sections that both lack a course code', () => {
    // Without a code the term and the answers must still separate them.
    const a = [{ term: 'T', questions: [rating('quality', [1, 0, 0, 0, 0])] },
      { term: 'T', questions: [rating('quality', [0, 1, 0, 0, 0])] }]
    expect(dedupeCourseLevelReports(a)).toHaveLength(2)
  })

  it('preserves input order so downstream term grouping is stable', () => {
    const reports = [report({ term: 'Fall 2023' }), report({ term: 'Fall 2024' }), report({ term: 'Fall 2025' })]
    expect(dedupeCourseLevelReports(reports).map((r: { term: string }) => r.term)).toEqual(['Fall 2023', 'Fall 2024', 'Fall 2025'])
  })

  it('tolerates null, empty and malformed input', () => {
    expect(dedupeCourseLevelReports([])).toEqual([])
    expect(dedupeCourseLevelReports(null as never)).toEqual([])
    expect(dedupeCourseLevelReports([null as never, undefined as never])).toEqual([])
  })
})

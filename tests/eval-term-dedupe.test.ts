import { describe, it, expect } from 'vitest'
import { dedupeCourseLevelReports, normalizeTerm } from '@/lib/eval-reports.mjs'

const rating = (counts: number[]) => ({
  text: 'Overall, how would you describe the quality of the instruction in this course?',
  type: 'rating',
  options: counts.map((count, i) => ({ weight: i + 1, count })),
})

const report = (over: Record<string, unknown>) => ({
  course_code: 'W25-CHEM-281-01', term: 'Winter 2025', instructor: 'Bushin, Leah',
  questions: [rating([0, 0, 1, 5, 10])], ...over,
})

// The corpus holds the same report under two term spellings: the Feb-2026 scrape
// glued the department on ("Winter 2025Chemistry"), a re-scrape of an older term
// writes the clean label. Both keys must land on the same report or every student
// in it is counted twice.
describe('term-shape collisions in de-duplication', () => {
  it('collapses one report stored under a glued and a clean term', () => {
    const rows = [report({ term: 'Winter 2025Chemistry' }), report({ term: 'Winter 2025' })]
    expect(dedupeCourseLevelReports(rows)).toHaveLength(1)
  })

  it('collapses the Law School strm-first shape against the university shape', () => {
    const rows = [
      report({ course_code: 'W24-LAW-1000-01', term: '1244 SLS Winter 2023-24Law School Regular Courses' }),
      report({ course_code: 'W24-LAW-1000-01', term: 'Winter 2024Law School Regular Courses' }),
    ]
    expect(dedupeCourseLevelReports(rows)).toHaveLength(1)
  })

  // The cases that would break if normalization were too aggressive.
  it('keeps two different terms of the same class apart', () => {
    const rows = [report({ term: 'Winter 2024Chemistry' }), report({ term: 'Winter 2025Chemistry' })]
    expect(dedupeCourseLevelReports(rows)).toHaveLength(2)
  })

  it('keeps two reports in one term that rate their instructors differently', () => {
    const rows = [
      report({ term: 'Winter 2025', instructor: 'A', questions: [rating([0, 0, 1, 5, 10])] }),
      report({ term: 'Winter 2025', instructor: 'B', questions: [rating([2, 1, 0, 0, 0])] }),
    ]
    expect(dedupeCourseLevelReports(rows)).toHaveLength(2)
  })

  it('keeps sections apart even when their answers match exactly', () => {
    const rows = [report({ course_code: 'W25-CHEM-33-01' }), report({ course_code: 'W25-CHEM-33-02' })]
    expect(dedupeCourseLevelReports(rows)).toHaveLength(2)
  })

  it('does not throw the term away when it cannot be parsed', () => {
    expect(normalizeTerm('Interim')).toBe('Interim')
    expect(normalizeTerm(undefined as unknown as string)).toBe('')
    expect(dedupeCourseLevelReports([report({ term: 'Interim A' }), report({ term: 'Interim B' })])).toHaveLength(2)
  })
})

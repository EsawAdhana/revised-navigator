import type { CourseEvaluation } from '@/types/course'

export const EVALUATION_COLUMNS =
  'course_id, term, instructor, course_code, respondents, questions, comments'

export type EvaluationRow = {
  course_id?: string | null
  term?: string | null
  instructor?: string | null
  course_code?: string | null
  respondents?: string | null
  questions?: unknown
  comments?: unknown
}

/** Quarter digit of a PeopleSoft strm -> season. Autumn is reported as "Fall"
 *  to match every other term string in the `evaluations` table, so a Law term
 *  and a university term for the same quarter collapse to one chip. */
const STRM_SEASON: Record<number, string> = { 2: 'Fall', 4: 'Winter', 6: 'Spring', 8: 'Summer' }

/**
 * Term for a strm code, by the same rule as `strmForTerm` in `lib/seats.ts`:
 * 1 + (last two digits of the academic year's END) + quarter. Autumn falls in
 * the calendar year before the academic year ends; the other three don't.
 * Returns null for anything that isn't a plausible strm.
 */
function termFromStrm(strm: number): string | null {
  if (!Number.isInteger(strm) || strm < 1000 || strm > 1999) return null
  const season = STRM_SEASON[strm % 10]
  if (!season) return null
  const acadYearEnd = 2000 + Math.floor((strm % 1000) / 10)
  return `${season} ${season === 'Fall' ? acadYearEnd - 1 : acadYearEnd}`
}

/**
 * Normalize an EvaluationKit term label. Three shapes exist, because the Law
 * School's project names come from a different template than the rest of the
 * university's:
 *
 *   "Fall 2024School of Medicine"                        -> Fall 2024
 *   "1244 SLS Winter 2023-24Law School Regular Courses"  -> Winter 2024
 *   "Law1236Law School Regular Courses"                  -> Spring 2023
 *
 * The trailing glue is the same scrape artifact in all three: the page renders
 * term and project group as adjacent inline nodes with no delimiter.
 *
 * The Law shapes must be decoded from the leading strm rather than by the
 * generic rule below, because that rule keeps the FIRST four-digit run — which
 * for a Law label is the strm, not the year. That silently threw the real term
 * away and rendered a bare "1244" as a term chip on 75 course pages.
 */
function normalizeTerm(raw: string): string {
  const sls = raw.match(/^(1\d{3})\s+SLS\b/) || raw.match(/^Law(1\d{3})/)
  if (sls) {
    const decoded = termFromStrm(parseInt(sls[1], 10))
    if (decoded) return decoded
  }
  return raw.replace(/(\d{4})\D.*$/, '$1')
}

/**
 * Shapes a raw `evaluations` row for the client. Scraped terms carry trailing
 * junk in three different shapes (see `normalizeTerm`), and attendance splits
 * are buried in the question list rather than being their own columns.
 */
export function toCourseEvaluation(row: EvaluationRow): CourseEvaluation {
  const questions = (row.questions || []) as { text?: string; median?: number }[]
  let onlineAttendancePct: number | undefined
  let inPersonAttendancePct: number | undefined
  for (const q of questions) {
    const t = (q.text || '').toLowerCase()
    if (t.includes('percent') && t.includes('online') && (q.median ?? 0) > 0) onlineAttendancePct = q.median
    if (t.includes('percent') && t.includes('in person') && (q.median ?? 0) > 0) inPersonAttendancePct = q.median
  }

  return {
    term: normalizeTerm(row.term || ''),
    instructor: row.instructor || '',
    courseCode: row.course_code || '',
    respondents: row.respondents || '',
    questions: (row.questions || []) as CourseEvaluation['questions'],
    comments: (row.comments || []) as string[],
    ...(onlineAttendancePct != null && { onlineAttendancePct }),
    ...(inPersonAttendancePct != null && { inPersonAttendancePct }),
  }
}

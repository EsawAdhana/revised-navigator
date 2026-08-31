import type { CourseEvaluation } from '@/types/course'
import { normalizeTerm } from '@/lib/eval-reports.mjs'

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

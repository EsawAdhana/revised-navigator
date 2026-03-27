import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

const MAX_COURSE_IDS = 50

/** POST /api/evaluations — bulk fetch by course IDs. Body: { courseIds: string[] } */
export async function POST(request: Request) {
  try {
    const { courseIds } = (await request.json()) as { courseIds: string[] }
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json({ error: 'courseIds is required' }, { status: 400 })
    }
    if (courseIds.length > MAX_COURSE_IDS) {
      return NextResponse.json({ error: `At most ${MAX_COURSE_IDS} course IDs allowed` }, { status: 400 })
    }

    const ids = courseIds.filter((id): id is string => typeof id === 'string')

    // Single query — Supabase supports .in() with many values (up to 1000+)
    const { data, error } = await supabase
      .from('evaluations')
      .select('course_id, term, instructor, course_code, respondents, questions, comments')
      .in('course_id', ids)

    if (error) throw error

    const byCourse: Record<string, Array<{
      term: string; instructor: string; courseCode: string; respondents: string;
      questions: unknown; comments: unknown;
      onlineAttendancePct?: number; inPersonAttendancePct?: number;
    }>> = {}
    for (const id of ids) {
      byCourse[id] = []
    }
    for (const row of data || []) {
      const courseId = row.course_id
      if (!courseId) continue
      if (!byCourse[courseId]) byCourse[courseId] = []

      const questions = (row.questions || []) as { text?: string; median?: number }[]
      let onlineAttendancePct: number | undefined
      let inPersonAttendancePct: number | undefined
      for (const q of questions) {
        const t = (q.text || '').toLowerCase()
        if (t.includes('percent') && t.includes('online') && (q.median ?? 0) > 0) onlineAttendancePct = q.median
        if (t.includes('percent') && t.includes('in person') && (q.median ?? 0) > 0) inPersonAttendancePct = q.median
      }

      byCourse[courseId].push({
        term: (row.term || '').replace(/(\d{4})\D.*$/, '$1'),
        instructor: row.instructor,
        courseCode: row.course_code,
        respondents: row.respondents,
        questions: row.questions,
        comments: row.comments,
        ...(onlineAttendancePct != null && { onlineAttendancePct }),
        ...(inPersonAttendancePct != null && { inPersonAttendancePct }),
      })
    }

    return NextResponse.json(byCourse, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
    })
  } catch (err) {
    console.error('Evaluations API error:', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Failed to fetch evaluations' : (err instanceof Error ? err.message : 'Failed to fetch evaluations') },
      { status: 500 }
    )
  }
}

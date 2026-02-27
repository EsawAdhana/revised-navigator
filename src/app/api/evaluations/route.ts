import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

/** POST /api/evaluations — bulk fetch by course IDs. Body: { courseIds: string[] } */
export async function POST(request: Request) {
  try {
    const { courseIds } = (await request.json()) as { courseIds: string[] }
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json({ error: 'courseIds is required' }, { status: 400 })
    }

    // Single query — Supabase supports .in() with many values (up to 1000+)
    const { data, error } = await supabase
      .from('evaluations')
      .select('course_id, term, instructor, course_code, respondents, questions, comments')
      .in('course_id', courseIds)

    if (error) throw error

    // Group by course_id, map to camelCase for client
    const byCourse: Record<string, Array<{ term: string; instructor: string; courseCode: string; respondents: string; questions: unknown; comments: unknown }>> = {}
    for (const id of courseIds) {
      byCourse[id] = []
    }
    for (const row of data || []) {
      const courseId = row.course_id
      if (!courseId) continue
      if (!byCourse[courseId]) byCourse[courseId] = []
      byCourse[courseId].push({
        term: (row.term || '').replace(/(\d{4})\D.*$/, '$1'),
        instructor: row.instructor,
        courseCode: row.course_code,
        respondents: row.respondents,
        questions: row.questions,
        comments: row.comments
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

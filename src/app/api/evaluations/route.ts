import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPublicClient } from '@/lib/supabase-admin'
import { rateLimit } from '@/lib/rate-limit'

const MAX_COURSE_IDS = 50
const MAX_COURSE_ID_LENGTH = 64

/** Verifies the request carries a valid Stanford session. Evaluation data is
 *  Stanford-community-only, so anonymous requests are rejected. */
async function getStanfordUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
  const cookieStore = await cookies()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Ignored when called from a Route Handler
        }
      }
    }
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email?.endsWith('@stanford.edu')) return null
  return user
}

/** POST /api/evaluations — bulk fetch by course IDs. Body: { courseIds: string[] } */
export async function POST(request: Request) {
  const user = await getStanfordUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Best-effort throttle: 60 requests / minute per user.
  if (!rateLimit(`evals:${user.id}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const courseIds = (body as { courseIds?: unknown })?.courseIds
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json({ error: 'courseIds is required' }, { status: 400 })
    }
    if (courseIds.length > MAX_COURSE_IDS) {
      return NextResponse.json({ error: `At most ${MAX_COURSE_IDS} course IDs allowed` }, { status: 400 })
    }

    const ids = courseIds.filter((id): id is string =>
      typeof id === 'string' && id.length > 0 && id.length <= MAX_COURSE_ID_LENGTH)

    if (ids.length === 0) {
      return NextResponse.json({}, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const supabase = getPublicClient()
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
      // Stanford-only data — keep out of shared/CDN caches.
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (err) {
    console.error('Evaluations API error:', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Failed to fetch evaluations' : (err instanceof Error ? err.message : 'Failed to fetch evaluations') },
      { status: 500 }
    )
  }
}

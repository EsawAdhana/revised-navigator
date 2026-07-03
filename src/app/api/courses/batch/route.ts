import { NextResponse } from 'next/server'
import { getPublicClient, mergeCourseRows, FULL_COURSE_COLUMNS } from '@/lib/supabase-admin'

const MAX_IDS = 50

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || !Array.isArray((body as any).ids)) {
    return NextResponse.json({ error: 'Missing ids array' }, { status: 400 })
  }

  const ids: string[] = (body as any).ids
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64)
    .slice(0, MAX_IDS)
  if (ids.length === 0) {
    return NextResponse.json([])
  }

  try {
    const supabase = getPublicClient()
    const { data, error } = await supabase
      .from('courses')
      .select(FULL_COURSE_COLUMNS)
      .in('course_id', ids)

    if (error) throw error

    const merged = mergeCourseRows(data || [])
    return NextResponse.json(merged, {
      // Data changes once a day (scrape + redeploy busts the CDN cache)
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch courses'
    console.error('Failed to batch fetch courses:', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : message },
      { status: 500 }
    )
  }
}

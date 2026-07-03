import { NextResponse } from 'next/server'
import { getPublicClient, mergeCourseRows, FULL_COURSE_COLUMNS } from '@/lib/supabase-admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params
  if (!courseId || courseId.length > 64) {
    return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })
  }

  try {
    const supabase = getPublicClient()
    const { data, error } = await supabase
      .from('courses')
      .select(FULL_COURSE_COLUMNS)
      .eq('course_id', courseId)

    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const merged = mergeCourseRows(data)
    return NextResponse.json(merged[0], {
      // Data changes once a day (scrape + redeploy busts the CDN cache)
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch course'
    console.error(`Failed to fetch course ${courseId}:`, err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : message },
      { status: 500 }
    )
  }
}

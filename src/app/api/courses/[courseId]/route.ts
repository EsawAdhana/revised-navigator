import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

const FULL_COLUMNS = 'course_id, subject, code, title, description, units, grading, instructors, terms, sections, hours, quality, difficulty'

function mergeRows(rows: any[]) {
  const merged = new Map<string, any>()
  for (const row of rows) {
    const existing = merged.get(row.course_id)
    if (!existing) {
      merged.set(row.course_id, { ...row })
      continue
    }
    const terms = Array.from(new Set([...(existing.terms || []), ...(row.terms || [])]))
    const sections = [...(existing.sections || []), ...(row.sections || [])]
    const units = (existing.units && String(existing.units).trim()) ? existing.units : (row.units || existing.units)
    merged.set(row.course_id, { ...existing, terms, sections, units })
  }
  return Array.from(merged.values())
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params
  if (!courseId) {
    return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase
      .from('courses')
      .select(FULL_COLUMNS)
      .eq('course_id', courseId)

    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const merged = mergeRows(data)
    return NextResponse.json(merged[0], {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' }
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

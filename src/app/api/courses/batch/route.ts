import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_FUZZ_MODE === 'true'
  ? (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
  : (process.env.SUPABASE_SERVICE_ROLE_KEY || '')

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

const FULL_COLUMNS = 'course_id, subject, code, title, description, units, grading, instructors, terms, sections, hours, quality, difficulty'
const MAX_IDS = 50

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

  const ids: string[] = (body as any).ids.slice(0, MAX_IDS)
  if (ids.length === 0) {
    return NextResponse.json([])
  }

  try {
    const { data, error } = await supabase
      .from('courses')
      .select(FULL_COLUMNS)
      .in('course_id', ids)

    if (error) throw error

    const merged = mergeRows(data || [])
    return NextResponse.json(merged, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' }
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

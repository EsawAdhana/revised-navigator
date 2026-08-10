import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getPublicClient, mergeCourseRows, FULL_COURSE_COLUMNS } from '@/lib/supabase-admin'

let dumpById: Map<string, unknown> | null = null
let dumpLoad: Promise<Map<string, unknown>> | null = null

async function getFromDump(courseId: string): Promise<unknown | null> {
  try {
    if (!dumpById) {
      if (!dumpLoad) {
        dumpLoad = (async () => {
          const raw = await readFile(join(process.cwd(), 'public', 'catalog', 'full.json'), 'utf8')
          const rows = JSON.parse(raw) as Array<{ course_id?: string }>
          const map = new Map<string, unknown>()
          for (const row of rows) {
            if (row.course_id) map.set(row.course_id, row)
          }
          dumpById = map
          return map
        })().finally(() => { dumpLoad = null })
      }
      await dumpLoad
    }
    return dumpById?.get(courseId) ?? null
  } catch {
    return null
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params
  if (!courseId || courseId.length > 64) {
    return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })
  }

  try {
    const fromDump = await getFromDump(courseId)
    if (fromDump) {
      return NextResponse.json(fromDump, {
        headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' },
      })
    }

    // Fallback for courses missing from the dump.
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
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' },
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

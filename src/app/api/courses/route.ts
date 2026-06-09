import { NextResponse } from 'next/server'
import { getPublicClient, mergeCourseRows, FULL_COURSE_COLUMNS, LIGHT_COURSE_COLUMNS } from '@/lib/supabase-admin'

const PAGE_SIZE = 1000
const CONCURRENCY = 5

// In-memory cache (survives across requests in the same serverless instance)
let cachedLight: any[] | null = null
let cachedFull: any[] | null = null
let lightTimestamp = 0
let fullTimestamp = 0
const CACHE_TTL = 1000 * 60 * 15 // 15 min

// In-flight promises so concurrent cold requests share one DB scan (stampede guard)
let lightInFlight: Promise<any[]> | null = null
let fullInFlight: Promise<any[]> | null = null

async function fetchAllRows(columns: string) {
  const supabase = getPublicClient()
  const { count, error: countError } = await supabase
    .from('courses')
    .select('*', { count: 'exact', head: true })
  if (countError) throw countError
  if (!count || count === 0) return []

  const pages = Math.ceil(count / PAGE_SIZE)
  const rows: any[] = []

  for (let i = 0; i < pages; i += CONCURRENCY) {
    const chunkPromises = []
    for (let j = 0; j < CONCURRENCY && (i + j) < pages; j++) {
      const pageIndex = i + j
      const from = pageIndex * PAGE_SIZE
      // Stable ordering so paginated ranges can't drop/duplicate rows under concurrent writes
      chunkPromises.push(
        supabase.from('courses').select(columns).order('course_id', { ascending: true }).range(from, from + PAGE_SIZE - 1)
      )
    }
    const chunkResults = await Promise.all(chunkPromises)
    for (const r of chunkResults) {
      if (r.error) throw r.error
      if (r.data) rows.push(...r.data)
    }
  }

  return rows.filter(r => r.grading && r.grading.trim() !== '' && r.grading !== 'TBD')
}

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' }

async function getFull(): Promise<any[]> {
  if (cachedFull && Date.now() - fullTimestamp < CACHE_TTL) return cachedFull
  if (!fullInFlight) {
    fullInFlight = (async () => {
      const merged = mergeCourseRows(await fetchAllRows(FULL_COURSE_COLUMNS))
      cachedFull = merged
      fullTimestamp = Date.now()
      return merged
    })().finally(() => { fullInFlight = null })
  }
  return fullInFlight
}

async function getLight(): Promise<any[]> {
  if (cachedLight && Date.now() - lightTimestamp < CACHE_TTL) return cachedLight
  if (!lightInFlight) {
    lightInFlight = (async () => {
      const merged = mergeCourseRows(await fetchAllRows(LIGHT_COURSE_COLUMNS))
      cachedLight = merged
      lightTimestamp = Date.now()
      return merged
    })().finally(() => { lightInFlight = null })
  }
  return lightInFlight
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const full = searchParams.get('full') === '1'

  try {
    const data = full ? await getFull() : await getLight()
    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch courses'
    console.error('Failed to fetch courses:', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : message },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getPublicClient, mergeCourseRows, FULL_COURSE_COLUMNS, LIGHT_COURSE_COLUMNS } from '@/lib/supabase-admin'

// Keyset pages beat OFFSET ranges under load. Full (sections) stays small so
// a sick DB can finish; light can be a bit larger.
const FULL_PAGE_SIZE = 100
const LIGHT_PAGE_SIZE = 300
const MAX_ATTEMPTS = 4

// In-memory cache (survives across requests in the same serverless instance).
// Stored pre-serialized: the full payload is ~45 MB of JSON, and re-running
// JSON.stringify per request would dwarf the handler's other work.
let cachedLight: string | null = null
let cachedFull: string | null = null
let lightTimestamp = 0
let fullTimestamp = 0
// Course data only changes via the daily scrape (refresh-courses.yml), which
// triggers a redeploy that resets this cache and the CDN cache. Within a
// deployment the data is static, so cache for a day.
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 h

// In-flight promises so concurrent cold requests share one DB scan (stampede guard)
let lightInFlight: Promise<string> | null = null
let fullInFlight: Promise<string> | null = null

// Allow one cold rebuild to finish after a catalog refresh (Vercel Pro / fluid).
export const maxDuration = 300

function isStatementTimeout(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === '57014' || /statement timeout/i.test(err.message || '')
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

/** Prefer a prebuilt dump over a live DB scan (near-instant when present). */
async function readPrebuiltDump(full: boolean): Promise<string | null> {
  const name = full ? 'full.json' : 'light.json'
  try {
    return await readFile(join(process.cwd(), 'public', 'catalog', name), 'utf8')
  } catch {
    // fall through to Supabase Storage
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  try {
    const res = await fetch(`${base}/storage/v1/object/public/catalog/${name}`, {
      cache: 'force-cache',
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function fetchAllRows(columns: string, pageSize: number) {
  const supabase = getPublicClient()
  const rows: any[] = []
  let lastCourseId: string | null = null

  // No exact count — that query alone was multi-second after the refresh.
  while (true) {
    let data: any[] | null = null
    let error: { code?: string; message?: string } | null = null

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let query = supabase
        .from('courses')
        .select(columns)
        .order('course_id', { ascending: true })
        .limit(pageSize)
      if (lastCourseId) query = query.gt('course_id', lastCourseId)

      const result = await query
      data = result.data
      error = result.error
      if (!error) break
      if (!isStatementTimeout(error) || attempt === MAX_ATTEMPTS) throw error
      await sleep(800 * attempt)
    }

    if (!data || data.length === 0) break
    rows.push(...data)
    lastCourseId = data[data.length - 1].course_id
    if (data.length < pageSize) break
  }

  return rows.filter(r => r.grading && r.grading.trim() !== '' && r.grading !== 'TBD')
}

// s-maxage matches the daily data refresh; the post-scrape redeploy busts the
// CDN cache sooner, and stale-while-revalidate keeps expiry hits fast.
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' }

async function getFull(): Promise<string> {
  if (cachedFull && Date.now() - fullTimestamp < CACHE_TTL) return cachedFull
  if (!fullInFlight) {
    fullInFlight = (async () => {
      const prebuilt = await readPrebuiltDump(true)
      if (prebuilt) {
        cachedFull = prebuilt
        fullTimestamp = Date.now()
        return cachedFull
      }
      const merged = mergeCourseRows(await fetchAllRows(FULL_COURSE_COLUMNS, FULL_PAGE_SIZE))
      cachedFull = JSON.stringify(merged)
      fullTimestamp = Date.now()
      return cachedFull
    })().finally(() => { fullInFlight = null })
  }
  return fullInFlight
}

async function getLight(): Promise<string> {
  if (cachedLight && Date.now() - lightTimestamp < CACHE_TTL) return cachedLight
  if (!lightInFlight) {
    lightInFlight = (async () => {
      const prebuilt = await readPrebuiltDump(false)
      if (prebuilt) {
        cachedLight = prebuilt
        lightTimestamp = Date.now()
        return cachedLight
      }
      const merged = mergeCourseRows(await fetchAllRows(LIGHT_COURSE_COLUMNS, LIGHT_PAGE_SIZE))
      cachedLight = JSON.stringify(merged)
      lightTimestamp = Date.now()
      return cachedLight
    })().finally(() => { lightInFlight = null })
  }
  return lightInFlight
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const full = searchParams.get('full') === '1'

  try {
    const json = full ? await getFull() : await getLight()
    return new NextResponse(json, {
      headers: { ...CACHE_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch courses'
    console.error('Failed to fetch courses:', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : message },
      { status: 500 }
    )
  }
}

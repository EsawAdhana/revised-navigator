import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const FUZZ_MODE = process.env.NEXT_PUBLIC_FUZZ_MODE === 'true'
const supabaseKey = FUZZ_MODE
  ? (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
  : (process.env.SUPABASE_SERVICE_ROLE_KEY || '')

if (!FUZZ_MODE && !supabaseKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. ' +
    'Add it to your Vercel project environment variables (Settings → Environment Variables). ' +
    'The anon key cannot be used here because it is subject to RLS.'
  )
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

const PAGE_SIZE = 1000
const CONCURRENCY = 2

// In-memory cache (survives across requests in the same serverless instance)
let cachedLight: any[] | null = null
let cachedFull: any[] | null = null
let lightTimestamp = 0
let fullTimestamp = 0
const CACHE_TTL = 1000 * 60 * 15 // 15 min

async function fetchAllRows(columns: string) {
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
      chunkPromises.push(
        supabase.from('courses').select(columns).range(from, from + PAGE_SIZE - 1)
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
    // Prefer non-empty units when merging (first row may have empty units)
    const units = (existing.units && String(existing.units).trim()) ? existing.units : (row.units || existing.units)
    merged.set(row.course_id, {
      ...existing,
      terms,
      sections,
      units,
    })
  }
  return Array.from(merged.values())
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const full = searchParams.get('full') === '1'

  try {
    if (full) {
      // Full data (with sections + description)
      if (cachedFull && Date.now() - fullTimestamp < CACHE_TTL) {
        return NextResponse.json(cachedFull, {
          headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' }
        })
      }

      const rows = await fetchAllRows(
        'course_id, subject, code, title, description, units, grading, instructors, terms, sections, hours, quality, difficulty'
      )
      const merged = mergeRows(rows)
      cachedFull = merged
      fullTimestamp = Date.now()

      return NextResponse.json(merged, {
        headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' }
      })
    }

    // Light data (card-level only — fast)
    if (cachedLight && Date.now() - lightTimestamp < CACHE_TTL) {
      return NextResponse.json(cachedLight, {
        headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' }
      })
    }

    const rows = await fetchAllRows(
      'course_id, subject, code, title, units, instructors, terms, grading, hours, quality, difficulty'
    )
    const merged = mergeRows(rows)
    cachedLight = merged
    lightTimestamp = Date.now()

    return NextResponse.json(merged, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' }
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

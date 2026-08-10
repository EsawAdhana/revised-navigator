/**
 * Dump light + full course catalogs for near-instant API serving.
 *
 * Usage:
 *   node --env-file=.env.local scripts/dump-catalog.mjs
 *
 * Writes public/catalog/{light,full,instructors}.json, which /api/courses and
 * the SSR course/department/instructor pages read instead of scanning the DB.
 * The files are committed, so refresh-courses.yml re-runs this and commits the
 * result.
 *
 * One sequential keyset pass fetches every row with sections (~22s for the
 * whole catalog) and light rows are derived from it. Concurrency is
 * deliberately absent: parallel section reads exhausted the free-tier
 * instance's memory on 2026-08-10 and took the data API down with it.
 */

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'catalog')

const FULL_COLUMNS =
  'course_id, subject, code, title, description, units, grading, instructors, terms, sections, hours, quality, difficulty'
const LIGHT_KEYS = [
  'course_id', 'subject', 'code', 'title', 'units',
  'instructors', 'terms', 'grading', 'hours', 'quality', 'difficulty',
]

const PAGE = 250
const MAX_ATTEMPTS = 5

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function isRetryable(err) {
  const msg = err?.message || ''
  return (
    err?.code === '57014' ||
    /statement timeout|upstream request timeout|fetch failed|ECONNRESET|schema cache/i.test(msg)
  )
}

/** Courses without real grading are catalog stubs, not offerings. */
function isGradeable(row) {
  const g = String(row.grading || '').trim()
  return Boolean(g) && g !== 'TBD'
}

async function fetchAll(supabase) {
  const rows = []
  let cursor = null
  let page = 0

  while (true) {
    page++
    let result = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let q = supabase
        .from('courses')
        .select(FULL_COLUMNS)
        .order('course_id', { ascending: true })
        .limit(PAGE)
      if (cursor) q = q.gt('course_id', cursor)

      result = await q
      if (!result.error) break
      if (!isRetryable(result.error) || attempt === MAX_ATTEMPTS) {
        throw new Error(`page ${page} failed: ${result.error.message || result.error.code}`)
      }
      const wait = 1000 * attempt
      console.warn(`  page ${page} retry ${attempt}/${MAX_ATTEMPTS} in ${wait}ms (${result.error.message})`)
      await sleep(wait)
    }

    const data = result.data || []
    if (!data.length) break
    rows.push(...data)
    cursor = data[data.length - 1].course_id
    if (page % 10 === 0) console.log(`  ${rows.length} rows (page ${page})`)
    if (data.length < PAGE) break
    await sleep(50)
  }

  return rows
}

/**
 * Every raw instructor spelling we know of. Catalog rows only cover upcoming
 * terms and abbreviate first names, so evaluations supply both the history and
 * the full names; the app slugs and groups them at runtime.
 */
async function fetchInstructorNames(supabase, courseRows) {
  const names = new Set()
  for (const row of courseRows) {
    for (const name of row.instructors || []) if (name) names.add(name)
  }

  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('evaluations')
      .select('instructor')
      .order('course_id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`instructors page at ${from} failed: ${error.message}`)
    for (const row of data) if (row.instructor) names.add(row.instructor)
    if (data.length < 1000) break
    from += 1000
  }

  return Array.from(names).sort()
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  mkdirSync(OUT_DIR, { recursive: true })

  console.log('Dumping catalog…')
  const t0 = Date.now()
  const all = (await fetchAll(supabase)).filter(isGradeable)

  const fullJson = JSON.stringify(all)
  writeFileSync(join(OUT_DIR, 'full.json'), fullJson)

  const light = all.map((row) => Object.fromEntries(LIGHT_KEYS.map((k) => [k, row[k]])))
  const lightJson = JSON.stringify(light)
  writeFileSync(join(OUT_DIR, 'light.json'), lightJson)

  const instructors = await fetchInstructorNames(supabase, all)
  writeFileSync(join(OUT_DIR, 'instructors.json'), JSON.stringify(instructors))
  console.log(`  ${instructors.length} instructor names`)

  const scheduled = all.filter((c) => (c.terms || []).length > 0)
  const withSections = scheduled.filter((c) => (c.sections || []).length > 0)
  console.log(
    `${all.length} courses in ${((Date.now() - t0) / 1000).toFixed(1)}s — ` +
    `full ${(Buffer.byteLength(fullJson) / 1e6).toFixed(1)} MB, ` +
    `light ${(Buffer.byteLength(lightJson) / 1e6).toFixed(1)} MB`,
  )
  console.log(`  scheduled ${scheduled.length}, of those ${withSections.length} have sections`)

  if (!all.length) {
    console.error('Refusing to keep an empty dump - aborting so a bad run cannot ship.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

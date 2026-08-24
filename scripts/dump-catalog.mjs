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
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'catalog')

/** SUNet → full name; also used to expand leftover "Last, F." rows already in the DB. */
const INSTRUCTOR_OVERRIDES = JSON.parse(
  readFileSync(join(__dirname, 'instructor-name-overrides.json'), 'utf8')
)

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

/** Catalog stubs (no sections / TBD-only) stay out of the dump. */
function isGradeable(row) {
  if ((row.sections || []).length > 0) return true
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

/** Keep dump slugs in lockstep with src/lib/instructors.ts. */
function fold(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
function slugPart(text) {
  return fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function parseInstructorName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim()
  if (name.includes(',')) {
    const [last, ...rest] = name.split(',')
    return { last: last.trim(), first: rest.join(',').trim() }
  }
  const tokens = name.split(' ')
  if (tokens.length > 1) return { last: tokens.slice(1).join(' '), first: tokens[0] }
  return { last: name, first: '' }
}
function hasFullFirstName(first) {
  return fold(first).replace(/[^a-z0-9]/g, '').length > 1
}
function instructorSlug(raw) {
  const { last, first } = parseInstructorName(raw)
  const lastSlug = slugPart(last)
  if (!first) return lastSlug
  return `${lastSlug}-${hasFullFirstName(first) ? slugPart(first) : fold(first)[0]}`
}
function instructorInitialSlug(raw) {
  const { last, first } = parseInstructorName(raw)
  const lastSlug = slugPart(last)
  const initial = fold(first).replace(/[^a-z0-9]/g, '')[0]
  return initial ? `${lastSlug}-${initial}` : lastSlug
}

/** "heller, h" → "Heller, H. Craig" for rows scraped before SUNet overrides. */
const ABBR_TO_FULL = new Map()
for (const full of Object.values(INSTRUCTOR_OVERRIDES)) {
  const { last, first } = parseInstructorName(full)
  const initial = fold(first).replace(/[^a-z]/g, '')[0]
  if (!last || !initial) continue
  ABBR_TO_FULL.set(`${fold(last)}, ${initial}`, full)
}
// ExploreCourses stores Ann Miura-Ko's firstName as "R." under sunet amiura.
ABBR_TO_FULL.set('miura-ko, r', INSTRUCTOR_OVERRIDES.amiura)

function expandInstructorName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!name) return name
  const { last, first } = parseInstructorName(name)
  if (hasFullFirstName(first)) return name
  const initial = fold(first).replace(/[^a-z]/g, '')[0]
  if (!initial) return name
  return ABBR_TO_FULL.get(`${fold(last)}, ${initial}`) || name
}

function expandCourseInstructors(row) {
  const instructors = Array.from(
    new Set((row.instructors || []).map(expandInstructorName).filter(Boolean))
  )
  const sections = (row.sections || []).map((section) => ({
    ...section,
    meetings: (section.meetings || []).map((meeting) => ({
      ...meeting,
      instructors: Array.from(
        new Set((meeting.instructors || []).map(expandInstructorName).filter(Boolean))
      ),
    })),
  }))
  return { ...row, instructors, sections }
}

/**
 * Every raw instructor spelling we know of, plus a course-scoped map that
 * turns catalog initials into a full-name slug when evaluation history for
 * that course_id points at exactly one person ("Clark, S." on CS 229 →
 * clark-susan). Catalog rows only cover upcoming terms and abbreviate first
 * names; evaluations supply both the history and the full names.
 */
async function fetchInstructorDump(supabase, courseRows) {
  const names = new Set()
  for (const row of courseRows) {
    for (const name of row.instructors || []) if (name) names.add(name)
  }

  // courseId → initialSlug → Set of named slugs seen in evaluations
  const byCourse = new Map()

  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('evaluations')
      .select('course_id, instructor')
      .order('course_id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`instructors page at ${from} failed: ${error.message}`)
    for (const row of data) {
      if (!row.instructor) continue
      names.add(row.instructor)
      if (!row.course_id || !hasFullFirstName(parseInstructorName(row.instructor).first)) continue
      const initial = instructorInitialSlug(row.instructor)
      const slug = instructorSlug(row.instructor)
      if (!initial || !slug) continue
      let byInitial = byCourse.get(row.course_id)
      if (!byInitial) {
        byInitial = new Map()
        byCourse.set(row.course_id, byInitial)
      }
      let set = byInitial.get(initial)
      if (!set) {
        set = new Set()
        byInitial.set(initial, set)
      }
      set.add(slug)
    }
    if (data.length < 1000) break
    from += 1000
  }

  const courseLinks = {}
  for (const [courseId, byInitial] of byCourse) {
    const links = {}
    for (const [initial, slugs] of byInitial) {
      if (slugs.size === 1) links[initial] = [...slugs][0]
    }
    if (Object.keys(links).length > 0) courseLinks[courseId] = links
  }

  return { names: Array.from(names).sort(), courseLinks }
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
  const allRaw = (await fetchAll(supabase)).filter(isGradeable).map(expandCourseInstructors)
  // Browse/API dump is offerings only — zero-section shells stay in Supabase for
  // eval history joins but should not ship in the static catalog.
  const dropped = allRaw.filter((c) => !(c.sections || []).length).length
  const all = allRaw.filter((c) => (c.sections || []).length > 0)
  if (dropped) console.log(`  dropped ${dropped} zero-section rows from dump`)

  const fullJson = JSON.stringify(all)
  writeFileSync(join(OUT_DIR, 'full.json'), fullJson)

  const light = all.map((row) => Object.fromEntries(LIGHT_KEYS.map((k) => [k, row[k]])))
  const lightJson = JSON.stringify(light)
  writeFileSync(join(OUT_DIR, 'light.json'), lightJson)

  const instructors = await fetchInstructorDump(supabase, all)
  writeFileSync(join(OUT_DIR, 'instructors.json'), JSON.stringify(instructors))
  const linkCount = Object.values(instructors.courseLinks).reduce((n, m) => n + Object.keys(m).length, 0)
  console.log(`  ${instructors.names.length} instructor names, ${linkCount} course-scoped links`)

  const scheduled = all.filter((c) => (c.terms || []).length > 0)
  console.log(
    `${all.length} courses in ${((Date.now() - t0) / 1000).toFixed(1)}s — ` +
    `full ${(Buffer.byteLength(fullJson) / 1e6).toFixed(1)} MB, ` +
    `light ${(Buffer.byteLength(lightJson) / 1e6).toFixed(1)} MB`,
  )
  console.log(`  scheduled ${scheduled.length} (all dumped rows have sections)`)

  if (!all.length) {
    console.error('Refusing to keep an empty dump - aborting so a bad run cannot ship.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

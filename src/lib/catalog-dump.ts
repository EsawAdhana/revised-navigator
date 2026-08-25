import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Course } from '@/types/course'
import { rowToCourse } from '@/lib/course-mapper'
import { mergeCourseRows } from '@/lib/supabase-admin'
import {
  buildInstructorDirectory,
  hasFullFirstName,
  instructorInitialSlug,
  instructorSlug,
  parseInstructorDump,
  parseInstructorName,
  type InstructorDirectory,
  type InstructorDump,
} from '@/lib/instructors'

type DumpRow = Record<string, unknown> & { course_id?: string; id?: string; subject?: string }

let fullById: Map<string, Course> | null = null
let fullLoad: Promise<Map<string, Course>> | null = null
let lightRows: DumpRow[] | null = null
let lightLoad: Promise<DumpRow[]> | null = null
let directory: InstructorDirectory | null = null
let directoryLoad: Promise<InstructorDirectory> | null = null
let instructorDump: InstructorDump | null = null
let instructorDumpLoad: Promise<InstructorDump> | null = null

async function loadFullById(): Promise<Map<string, Course>> {
  if (fullById) return fullById
  if (!fullLoad) {
    fullLoad = (async () => {
      const raw = await readFile(join(process.cwd(), 'public', 'catalog', 'full.json'), 'utf8')
      const rows = JSON.parse(raw) as DumpRow[]
      const map = new Map<string, Course>()
      for (const row of mergeCourseRows(rows)) {
        const course = rowToCourse(row)
        map.set(course.id, course)
      }
      fullById = map
      return map
    })().finally(() => { fullLoad = null })
  }
  return fullLoad
}

async function loadLightRows(): Promise<DumpRow[]> {
  if (lightRows) return lightRows
  if (!lightLoad) {
    lightLoad = (async () => {
      const raw = await readFile(join(process.cwd(), 'public', 'catalog', 'light.json'), 'utf8')
      lightRows = JSON.parse(raw) as DumpRow[]
      return lightRows
    })().finally(() => { lightLoad = null })
  }
  return lightLoad
}

/** Instant course lookup from the prebuilt dump (no Supabase). */
export async function getCourseFromDump(courseId: string): Promise<Course | null> {
  try {
    const map = await loadFullById()
    return map.get(courseId) ?? null
  } catch {
    return null
  }
}

export type DumpDeptCourse = {
  id: string
  subject: string
  code: string
  title: string
  units: string | null
  quality: number | null
  hours: number | null
}

function isGradeable(grading: unknown): boolean {
  const g = String(grading || '').trim()
  return Boolean(g) && g !== 'TBD'
}

async function loadInstructorDump(): Promise<InstructorDump> {
  if (instructorDump) return instructorDump
  if (!instructorDumpLoad) {
    instructorDumpLoad = (async () => {
      try {
        const raw = await readFile(join(process.cwd(), 'public', 'catalog', 'instructors.json'), 'utf8')
        instructorDump = parseInstructorDump(JSON.parse(raw))
      } catch {
        instructorDump = { names: [], courseLinks: {} }
      }
      return instructorDump
    })().finally(() => { instructorDumpLoad = null })
  }
  return instructorDumpLoad
}

/** The full instructor name directory (catalog + evaluation spellings). */
export async function getInstructorDirectory(): Promise<InstructorDirectory> {
  if (directory) return directory
  if (!directoryLoad) {
    directoryLoad = (async () => {
      const dump = await loadInstructorDump()
      const names = dump.names.slice()
      const rows = await loadLightRows().catch(() => [] as DumpRow[])
      for (const row of rows) {
        for (const name of (row.instructors as string[] | undefined) || []) names.push(name)
      }
      directory = buildInstructorDirectory(names)
      return directory
    })().finally(() => { directoryLoad = null })
  }
  return directoryLoad
}

/** initialSlug → named slug for one course, when evaluation history uniquely picks a person. */
export async function getCourseInstructorLinks(courseId: string): Promise<Record<string, string>> {
  const dump = await loadInstructorDump()
  return dump.courseLinks[courseId] ?? {}
}

export type DumpInstructorCourse = {
  id: string
  subject: string
  code: string
  title: string
  terms: string[]
  quality: number | null
  hours: number | null
}

/**
 * Upcoming catalog listings for one person. Prefer an exact full-name slug
 * match; fall back to surname+initial only when the catalog row is still
 * abbreviated and this person is the unique named match for that initial.
 */
export async function getInstructorCoursesFromDump(entry: {
  slug: string
  initialSlug: string
}): Promise<DumpInstructorCourse[]> {
  try {
    const dir = await getInstructorDirectory()
    const soleForInitial = (dir.namedByInitialSlug.get(entry.initialSlug)?.length ?? 0) === 1
    const rows = await loadLightRows()
    const out: DumpInstructorCourse[] = []
    for (const row of rows) {
      const instructors = (row.instructors as string[] | undefined) || []
      if (instructors.length === 0 || !isGradeable(row.grading)) continue
      const id = String(row.course_id || row.id || '')
      if (!id) continue

      const matches = instructors.some(raw => {
        if (instructorSlug(raw) === entry.slug) return true
        // Leftover "Last, F." rows: only attach when nobody else shares the initial.
        if (!hasFullFirstName(parseInstructorName(raw).first)) {
          return soleForInitial && instructorInitialSlug(raw) === entry.initialSlug
        }
        return false
      })
      if (!matches) continue

      out.push({
        id,
        subject: String(row.subject || ''),
        code: String(row.code || ''),
        title: String(row.title || ''),
        terms: ((row.terms as string[] | undefined) || []).slice(),
        quality: row.quality != null && row.quality !== '' ? Number(row.quality) : null,
        hours: row.hours != null && row.hours !== '' ? Number(row.hours) : null,
      })
    }
    return out
  } catch {
    return []
  }
}

/** Light dump rows for one department (dept pages + SEO related links). */
export async function getDepartmentFromDump(subject: string): Promise<DumpDeptCourse[]> {
  try {
    const rows = await loadLightRows()
    const byId = new Map<string, DumpDeptCourse>()
    for (const r of rows) {
      if (r.subject !== subject || !isGradeable(r.grading)) continue
      const id = String(r.course_id || r.id || '')
      if (!id || byId.has(id)) continue
      byId.set(id, {
        id,
        subject: String(r.subject || ''),
        code: String(r.code || ''),
        title: String(r.title || ''),
        units: r.units != null && String(r.units).trim() ? String(r.units) : null,
        quality: r.quality != null && r.quality !== '' ? Number(r.quality) : null,
        hours: r.hours != null && r.hours !== '' ? Number(r.hours) : null,
      })
    }
    return Array.from(byId.values())
  } catch {
    return []
  }
}

/**
 * Every course id in the dump, for `generateStaticParams`.
 *
 * Without it these pages render per request: the response carried
 * `cache-control: private, no-cache, no-store` with no `x-nextjs-cache` header
 * and `x-vercel-cache: MISS` on repeat hits of the same URL, so each view paid a
 * fresh render — and on a cold instance, a 34MB `full.json` read and parse
 * (measured 70ms + 124ms locally) before it could answer. Real users saw TTFB
 * p75 1006ms on `/courses/[code]` and 1720ms on `/instructors/[slug]`.
 */
export async function getAllCourseIdsFromDump(): Promise<string[]> {
  const map = await loadFullById()
  return [...map.keys()]
}

/** Every instructor slug in the dump, for `generateStaticParams`. */
export async function getAllInstructorSlugsFromDump(): Promise<string[]> {
  const dir = await getInstructorDirectory()
  return [...dir.bySlug.keys()]
}

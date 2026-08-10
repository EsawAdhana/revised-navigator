import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Course } from '@/types/course'
import { rowToCourse } from '@/lib/course-mapper'
import { mergeCourseRows } from '@/lib/supabase-admin'
import {
  buildInstructorDirectory,
  instructorInitialSlug,
  type InstructorDirectory,
} from '@/lib/instructors'

type DumpRow = Record<string, unknown> & { course_id?: string; id?: string; subject?: string }

let fullById: Map<string, Course> | null = null
let fullLoad: Promise<Map<string, Course>> | null = null
let lightRows: DumpRow[] | null = null
let lightLoad: Promise<DumpRow[]> | null = null
let directory: InstructorDirectory | null = null
let directoryLoad: Promise<InstructorDirectory> | null = null
let coursesByInitialSlug: Map<string, DumpInstructorCourse[]> | null = null

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

/** The full instructor name directory (catalog + evaluation spellings). */
export async function getInstructorDirectory(): Promise<InstructorDirectory> {
  if (directory) return directory
  if (!directoryLoad) {
    directoryLoad = (async () => {
      let names: string[] = []
      try {
        const raw = await readFile(join(process.cwd(), 'public', 'catalog', 'instructors.json'), 'utf8')
        names = JSON.parse(raw) as string[]
      } catch {
        // Missing dump — fall back to catalog-only names below.
      }
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
 * Upcoming catalog listings for a person, keyed by initial slug because the
 * catalog only ever abbreviates first names.
 */
export async function getInstructorCoursesFromDump(initialSlug: string): Promise<DumpInstructorCourse[]> {
  try {
    if (!coursesByInitialSlug) {
      const rows = await loadLightRows()
      const map = new Map<string, DumpInstructorCourse[]>()
      for (const row of rows) {
        const instructors = (row.instructors as string[] | undefined) || []
        if (instructors.length === 0 || !isGradeable(row.grading)) continue
        const id = String(row.course_id || row.id || '')
        if (!id) continue
        const course: DumpInstructorCourse = {
          id,
          subject: String(row.subject || ''),
          code: String(row.code || ''),
          title: String(row.title || ''),
          terms: ((row.terms as string[] | undefined) || []).slice(),
          quality: row.quality != null && row.quality !== '' ? Number(row.quality) : null,
          hours: row.hours != null && row.hours !== '' ? Number(row.hours) : null,
        }
        for (const slug of new Set(instructors.map(instructorInitialSlug))) {
          if (!slug) continue
          const list = map.get(slug)
          if (list) {
            if (!list.some(c => c.id === id)) list.push(course)
          } else {
            map.set(slug, [course])
          }
        }
      }
      coursesByInitialSlug = map
    }
    return coursesByInitialSlug.get(initialSlug) ?? []
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

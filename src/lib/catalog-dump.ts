import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Course } from '@/types/course'
import { rowToCourse } from '@/lib/course-mapper'
import { mergeCourseRows } from '@/lib/supabase-admin'

type DumpRow = Record<string, unknown> & { course_id?: string; id?: string; subject?: string }

let fullById: Map<string, Course> | null = null
let fullLoad: Promise<Map<string, Course>> | null = null
let lightRows: DumpRow[] | null = null
let lightLoad: Promise<DumpRow[]> | null = null

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

/** Light dump rows for one department (SEO related links). */
export async function getDepartmentFromDump(subject: string): Promise<
  Array<{ id: string; subject: string; code: string; title: string }>
> {
  try {
    const rows = await loadLightRows()
    return rows
      .filter((r) => r.subject === subject)
      .map((r) => ({
        id: String(r.course_id || r.id || ''),
        subject: String(r.subject || ''),
        code: String(r.code || ''),
        title: String(r.title || ''),
      }))
      .filter((r) => r.id)
  } catch {
    return []
  }
}

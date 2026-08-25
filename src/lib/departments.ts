import { cache } from 'react'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getPublicClient } from '@/lib/supabase-admin'
import { compareCourseCodes } from '@/lib/utils'

const PAGE_SIZE = 250

/** Card-level fields needed to render a crawlable department course list. */
export interface DeptCourse {
  id: string
  subject: string
  code: string
  title: string
  units: string | null
  quality: number | null
  hours: number | null
}

const DEPT_COLUMNS = 'course_id, subject, code, title, units, grading, quality, hours'

/** Same gradeability rule the sitemap uses to decide which courses are public. */
function isGradeable(grading: string | null | undefined): boolean {
  const g = (grading || '').trim()
  return Boolean(g) && g !== 'TBD'
}

async function fetchPaginated(columns: string, applyFilters: (q: any) => any): Promise<any[]> {
  const supabase = getPublicClient()
  const rows: any[] = []
  let lastCourseId: string | null = null
  while (true) {
    let query = applyFilters(
      supabase.from('courses').select(columns)
    )
      .order('course_id', { ascending: true })
      .limit(PAGE_SIZE)
    if (lastCourseId) query = query.gt('course_id', lastCourseId)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
    lastCourseId = data[data.length - 1].course_id
  }
  return rows
}

/** Dedupe multi-term rows by course_id, keeping the first non-empty value per field. */
function dedupeRows(rows: any[]): DeptCourse[] {
  const byId = new Map<string, DeptCourse>()
  for (const row of rows) {
    if (!isGradeable(row.grading)) continue
    const existing = byId.get(row.course_id)
    if (!existing) {
      byId.set(row.course_id, {
        id: row.course_id,
        subject: row.subject,
        code: row.code,
        title: row.title || '',
        units: row.units || null,
        quality: row.quality ?? null,
        hours: row.hours ?? null,
      })
    } else {
      if (!existing.units && row.units) existing.units = row.units
      if (existing.quality == null && row.quality != null) existing.quality = row.quality
      if (existing.hours == null && row.hours != null) existing.hours = row.hours
    }
  }
  return Array.from(byId.values())
}

/**
 * Department codes with courses in the catalog, sorted A-Z.
 *
 * Read from the committed catalog dump the rest of the site serves, so the
 * department list can never drift from the courses behind it. This used to
 * fetch the ExploreCourses browse XML on every render; the scraper stopped
 * using ExploreCourses on 2026-08-25 and this was the last live call to it.
 */
export const getDepartments = cache(async (): Promise<{ subject: string }[]> => {
  const subjects = new Set<string>()

  const dump = await readCatalogDump()
  if (dump) {
    for (const course of dump) {
      if (course.subject) subjects.add(course.subject)
    }
  } else {
    for (const row of await fetchPaginated('course_id, subject', (q) => q)) {
      if (row.subject) subjects.add(row.subject)
    }
  }

  return Array.from(subjects).sort().map(subject => ({ subject }))
})

/** The committed light catalog, or null when it is not on disk (dev, cold clone). */
async function readCatalogDump(): Promise<{ subject?: string }[] | null> {
  try {
    const raw = await readFile(join(process.cwd(), 'public', 'catalog', 'light.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** All gradeable courses in one department, sorted by course code. */
export const getDepartmentCourses = cache(async (subject: string): Promise<DeptCourse[]> => {
  const courses = dedupeRows(await fetchPaginated(DEPT_COLUMNS, (q) => q.eq('subject', subject)))
  return courses.sort((a, b) => compareCourseCodes(a.code, b.code))
})

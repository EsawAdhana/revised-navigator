import { cache } from 'react'
import { getPublicClient } from '@/lib/supabase-admin'
import { compareCourseCodes } from '@/lib/utils'

const PAGE_SIZE = 1000

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

async function fetchPaginated(applyFilters: (q: any) => any): Promise<any[]> {
  const supabase = getPublicClient()
  const rows: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await applyFilters(
      supabase.from('courses').select(DEPT_COLUMNS)
    )
      .order('course_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
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
 * Distinct departments (subject codes) with gradeable-course counts, sorted A-Z.
 * React-cached per render; pages set `revalidate` for cross-request caching.
 */
export const getDepartments = cache(async (): Promise<{ subject: string; count: number }[]> => {
  const courses = dedupeRows(await fetchPaginated((q) => q))
  const counts = new Map<string, number>()
  for (const c of courses) {
    if (!c.subject) continue
    counts.set(c.subject, (counts.get(c.subject) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => a.subject.localeCompare(b.subject))
})

/** All gradeable courses in one department, sorted by course code. */
export const getDepartmentCourses = cache(async (subject: string): Promise<DeptCourse[]> => {
  const courses = dedupeRows(await fetchPaginated((q) => q.eq('subject', subject)))
  return courses.sort((a, b) => compareCourseCodes(a.code, b.code))
})

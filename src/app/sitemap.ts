import type { MetadataRoute } from 'next'
import { getPublicClient } from '@/lib/supabase-admin'
import { SITE_URL } from '@/lib/site'

// Rebuild the sitemap at most once a day rather than per request.
export const revalidate = 86400

const PAGE_SIZE = 1000

/** Distinct, valid (gradeable) course ids and their subjects, paginated to cover the full table. */
async function getCatalog(): Promise<{ ids: string[]; subjects: string[] }> {
  try {
    const supabase = getPublicClient()
    const { count, error: countError } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
    if (countError) throw countError
    if (!count) return { ids: [], subjects: [] }

    const ids = new Set<string>()
    const subjects = new Set<string>()
    const pages = Math.ceil(count / PAGE_SIZE)
    for (let p = 0; p < pages; p++) {
      const from = p * PAGE_SIZE
      const { data, error } = await supabase
        .from('courses')
        .select('course_id, subject, grading')
        .order('course_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      for (const row of data || []) {
        const grading = (row.grading || '').trim()
        if (grading && grading !== 'TBD') {
          ids.add(row.course_id)
          if (row.subject) subjects.add(row.subject)
        }
      }
    }
    return { ids: Array.from(ids), subjects: Array.from(subjects).sort() }
  } catch {
    // Never fail the sitemap build — fall back to static routes only.
    return { ids: [], subjects: [] }
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/browse`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/browse/departments`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/schedule`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ]

  const { ids, subjects } = await getCatalog()

  const departmentRoutes: MetadataRoute.Sitemap = subjects.map((subject) => ({
    url: `${SITE_URL}/browse/${encodeURIComponent(subject)}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const courseRoutes: MetadataRoute.Sitemap = ids.map((id) => ({
    url: `${SITE_URL}/courses/${encodeURIComponent(id)}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...departmentRoutes, ...courseRoutes]
}

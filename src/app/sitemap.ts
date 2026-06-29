import type { MetadataRoute } from 'next'
import { getPublicClient } from '@/lib/supabase-admin'
import { SITE_URL } from '@/lib/site'

// Rebuild the sitemap at most once a day rather than per request.
export const revalidate = 86400

const PAGE_SIZE = 1000

/** Distinct, valid (gradeable) course ids, paginated to cover the full table. */
async function getCourseIds(): Promise<string[]> {
  try {
    const supabase = getPublicClient()
    const { count, error: countError } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
    if (countError) throw countError
    if (!count) return []

    const ids = new Set<string>()
    const pages = Math.ceil(count / PAGE_SIZE)
    for (let p = 0; p < pages; p++) {
      const from = p * PAGE_SIZE
      const { data, error } = await supabase
        .from('courses')
        .select('course_id, grading')
        .order('course_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      for (const row of data || []) {
        const grading = (row.grading || '').trim()
        if (grading && grading !== 'TBD') ids.add(row.course_id)
      }
    }
    return Array.from(ids)
  } catch {
    // Never fail the sitemap build — fall back to static routes only.
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/browse`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/schedule`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ]

  const courseRoutes: MetadataRoute.Sitemap = (await getCourseIds()).map((id) => ({
    url: `${SITE_URL}/courses/${encodeURIComponent(id)}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...courseRoutes]
}

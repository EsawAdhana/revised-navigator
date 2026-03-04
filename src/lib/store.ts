import { create } from 'zustand'
import type { Course } from '@/types/course'
import { isWimCourse } from '@/lib/wim-courses'

type CourseStore = {
  courses: Course[]
  isLoading: boolean
  hasLoaded: boolean
  isEnriching: boolean
  hasEnriched: boolean
  enrichedCourseIds: Set<string>
  fetchCourses: () => Promise<void>
  fetchCourseDetail: (courseId: string) => Promise<void>
}

const CACHE_KEY = 'root-courses-cache'
const CACHE_VERSION = 9
const CACHE_TTL = 1000 * 60 * 30 // 30 minutes
const STALE_MAX_AGE = 1000 * 60 * 60 * 24 // 24 hours — show stale cache up to this age

function readCache(): Course[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { v, ts, data } = JSON.parse(raw)
    if (v !== CACHE_VERSION) return null
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch {
    return null
  }
}

/** Returns cache even if expired, for stale-while-revalidate. Null if cache is older than 24h. */
function readStaleCache(): Course[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { v, ts, data } = JSON.parse(raw)
    if (v !== CACHE_VERSION) return null
    if (Date.now() - ts > STALE_MAX_AGE) return null
    return data
  } catch {
    return null
  }
}

function writeCache(courses: Course[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      v: CACHE_VERSION,
      ts: Date.now(),
      data: courses
    }))
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

function rowToCourse(row: any): Course {
  const isWim = isWimCourse(row.subject, row.code)
  const sections = row.sections || []

  // Inject WIM GER if applicable
  if (isWim) {
    sections.forEach((s: any) => {
      if (!s.gers) s.gers = []
      if (!s.gers.includes('Writing in the Major (WIM)')) {
        s.gers.push('Writing in the Major (WIM)')
      }
    })
  }

  return {
    id: row.course_id,
    subject: row.subject,
    code: row.code,
    title: row.title,
    description: row.description || '',
    units: row.units,
    grading: row.grading || '',
    instructors: row.instructors || [],
    terms: row.terms || [],
    sections: sections,
    hours: row.hours != null ? Number(row.hours) : undefined,
    quality: row.quality != null ? Number(row.quality) : undefined,
    difficulty: row.difficulty != null ? Number(row.difficulty) : undefined,
  }
}

export const useCourseStore = create<CourseStore>((set, get) => ({
  courses: [],
  isLoading: false,
  hasLoaded: false,
  isEnriching: false,
  hasEnriched: false,
  enrichedCourseIds: new Set(),

  fetchCourses: async () => {
    const { isLoading, hasLoaded } = get()
    if (isLoading) return

    // Stale-while-revalidate: show cached data immediately on refresh (even if expired)
    const stale = readStaleCache()
    if (stale) {
      set({ courses: stale, hasLoaded: true, hasEnriched: true, isLoading: false })
      // Fall through to fetch fresh in background
    } else if (hasLoaded) {
      return
    } else {
      set({ isLoading: true })
    }

    try {
      // ── Fresh cache hit: skip fetch ──
      const cached = readCache()
      if (cached && !stale) {
        set({ courses: cached, hasLoaded: true, hasEnriched: true, isLoading: false })
        return
      }

      // ── Phase 1: fetch card-level data via API route (single request, gzipped) ──
      const lightRes = await fetch('/api/courses')
      if (!lightRes.ok) throw new Error(`API error: ${lightRes.status}`)
      const lightRows: any[] = await lightRes.json()
      const lightCourses = lightRows.map(rowToCourse)

      set({ courses: lightCourses, hasLoaded: true, isLoading: false, isEnriching: true })

      // ── Phase 2: fetch full data (with sections) in background ──
      try {
        const fullRes = await fetch('/api/courses?full=1')
        if (!fullRes.ok) throw new Error(`API error: ${fullRes.status}`)
        const fullRows: any[] = await fullRes.json()
        const fullCourses = fullRows.map(rowToCourse)

        writeCache(fullCourses)
        set({
          courses: fullCourses,
          isEnriching: false,
          hasEnriched: true,
          enrichedCourseIds: new Set(fullCourses.map(c => c.id)),
        })
      } catch (err) {
        console.error('Failed to enrich courses:', err)
        // Do NOT cache light data on error, so we retry next time
        // writeCache(lightCourses) 
        set({ isEnriching: false, hasEnriched: true })
      }
    } catch (err) {
      console.error('Failed to fetch courses:', err)
      set({ courses: [], hasLoaded: true, isLoading: false })
    }
  },

  fetchCourseDetail: async (courseId: string) => {
    const { enrichedCourseIds, courses } = get()
    if (enrichedCourseIds.has(courseId)) return

    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(courseId)}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const row: any = await res.json()
      const enriched = rowToCourse(row)

      const updatedCourses = courses.map(c => c.id === courseId ? enriched : c)
      const updatedIds = new Set(enrichedCourseIds)
      updatedIds.add(courseId)
      set({ courses: updatedCourses, enrichedCourseIds: updatedIds })
    } catch (err) {
      console.error(`Failed to fetch detail for ${courseId}:`, err)
      // Mark as enriched anyway to avoid infinite retries
      const updatedIds = new Set(get().enrichedCourseIds)
      updatedIds.add(courseId)
      set({ enrichedCourseIds: updatedIds })
    }
  },
}))

if (typeof window !== 'undefined') {
  useCourseStore.getState().fetchCourses()
}

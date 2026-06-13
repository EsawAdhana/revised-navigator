import { create } from 'zustand'
import type { Course } from '@/types/course'
import { isWimCourse } from '@/lib/wim-courses'
import { isLanguageCourse } from '@/lib/language-courses'

type CourseStore = {
  courses: Course[]
  isLoading: boolean
  hasLoaded: boolean
  isEnriching: boolean
  hasEnriched: boolean
  enrichedCourseIds: Set<string>
  fetchCourses: () => Promise<void>
  fetchCourseDetail: (courseId: string) => Promise<void>
  fetchCourseDetails: (courseIds: string[]) => Promise<void>
}

const CACHE_VERSION = 12
const CACHE_TTL = 1000 * 60 * 30 // 30 minutes
const STALE_MAX_AGE = 1000 * 60 * 60 * 24 // 24 hours
const IDB_DB = 'root-cache'
const IDB_STORE = 'courses'
const IDB_KEY = 'catalog'

// Clean up old sessionStorage cache to free space
if (typeof window !== 'undefined') {
  try { sessionStorage.removeItem('root-courses-cache') } catch { /* ignore */ }
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function readCache(): Promise<Course[] | null> {
  try {
    const db = await openIDB()
    return new Promise((resolve) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY)
      req.onsuccess = () => {
        const entry = req.result
        if (!entry || entry.v !== CACHE_VERSION) return resolve(null)
        if (Date.now() - entry.ts > CACHE_TTL) return resolve(null)
        resolve(entry.data)
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

/** Returns cache even if expired, for stale-while-revalidate. Null if older than 24h. */
async function readStaleCache(): Promise<Course[] | null> {
  try {
    const db = await openIDB()
    return new Promise((resolve) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY)
      req.onsuccess = () => {
        const entry = req.result
        if (!entry || entry.v !== CACHE_VERSION) return resolve(null)
        if (Date.now() - entry.ts > STALE_MAX_AGE) return resolve(null)
        resolve(entry.data)
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function writeCache(courses: Course[]) {
  try {
    const db = await openIDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put({ v: CACHE_VERSION, ts: Date.now(), data: courses }, IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // IndexedDB unavailable — ignore
  }
}

/** Light catalog rows omit description and sections; full rows include at least one. */
export function hasFullCourseData(course: Course): boolean {
  return Boolean(course.description?.trim()) || (course.sections?.length ?? 0) > 0
}

function enrichedIdsFromCourses(courses: Course[]): Set<string> {
  return new Set(courses.filter(hasFullCourseData).map(c => c.id))
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

  // Inject Language GER if description/subject indicates a language course
  if (isLanguageCourse(row.description || '', row.subject)) {
    sections.forEach((s: any) => {
      if (!s.gers) s.gers = []
      if (!s.gers.includes('Language')) {
        s.gers.push('Language')
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
    const stale = await readStaleCache()
    if (stale) {
      set({
        courses: stale,
        hasLoaded: true,
        hasEnriched: true,
        isLoading: false,
        enrichedCourseIds: enrichedIdsFromCourses(stale),
      })
      // Fall through to fetch fresh in background
    } else if (hasLoaded) {
      return
    } else {
      set({ isLoading: true })
    }

    try {
      // ── Fresh cache hit: skip fetch ──
      const cached = await readCache()
      if (cached && !stale) {
        set({
          courses: cached,
          hasLoaded: true,
          hasEnriched: true,
          isLoading: false,
          enrichedCourseIds: enrichedIdsFromCourses(cached),
        })
        return
      }

      // ── Phase 1: light data (card-level only) — small + fast, renders the list ──
      // Skip when stale full data is already on screen, so a background revalidate
      // doesn't momentarily downgrade visible courses (sections/descriptions) to light.
      if (!stale) {
        const lightRes = await fetch('/api/courses')
        if (!lightRes.ok) throw new Error(`API error: ${lightRes.status}`)
        const lightRows: any[] = await lightRes.json()
        const lightCourses = lightRows.map(rowToCourse)

        set({
          courses: lightCourses,
          hasLoaded: true,
          isLoading: false,
          isEnriching: true,
          hasEnriched: false,
        })
      }

      // ── Phase 2: full data with sections + description — enrich in background ──
      const fullRes = await fetch('/api/courses?full=1')
      if (!fullRes.ok) throw new Error(`API error: ${fullRes.status}`)
      const fullRows: any[] = await fullRes.json()
      const fullCourses = fullRows.map(rowToCourse)

      await writeCache(fullCourses)
      set({
        courses: fullCourses,
        hasLoaded: true,
        isLoading: false,
        isEnriching: false,
        hasEnriched: true,
        enrichedCourseIds: new Set(fullCourses.map(c => c.id)),
      })
    } catch (err) {
      console.error('Failed to fetch courses:', err)
      // Preserve stale data on error — don't overwrite with empty array
      const { courses } = get()
      if (courses.length === 0) {
        set({ hasLoaded: true, isLoading: false, isEnriching: false })
      } else {
        set({ isLoading: false, isEnriching: false })
      }
    }
  },

  fetchCourseDetails: async (courseIds: string[]) => {
    const { courses, enrichedCourseIds } = get()
    const toFetch = courseIds.filter(id => {
      if (enrichedCourseIds.has(id)) return false
      const existing = courses.find(c => c.id === id)
      return !existing || !hasFullCourseData(existing)
    })
    if (toFetch.length === 0) {
      const locallyEnriched = courseIds.filter(id => {
        const existing = courses.find(c => c.id === id)
        return existing && hasFullCourseData(existing) && !enrichedCourseIds.has(id)
      })
      if (locallyEnriched.length > 0) {
        set(state => ({
          enrichedCourseIds: new Set([...state.enrichedCourseIds, ...locallyEnriched]),
        }))
      }
      return
    }

    try {
      const res = await fetch('/api/courses/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: toFetch }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const rows: any[] = await res.json()
      const enriched = rows.map(rowToCourse)

      set(state => {
        const courseMap = new Map(state.courses.map(c => [c.id, c]))
        for (const c of enriched) courseMap.set(c.id, c)
        return {
          courses: Array.from(courseMap.values()),
          enrichedCourseIds: new Set([...state.enrichedCourseIds, ...enriched.map(c => c.id)]),
        }
      })
    } catch (err) {
      console.error('Failed to batch fetch course details:', err)
    }
  },

  fetchCourseDetail: async (courseId: string) => {
    if (get().enrichedCourseIds.has(courseId)) return
    const existing = get().courses.find(c => c.id === courseId)
    if (existing && hasFullCourseData(existing)) {
      set(state => ({
        enrichedCourseIds: new Set([...state.enrichedCourseIds, courseId]),
      }))
      return
    }

    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(courseId)}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const row: any = await res.json()
      const enriched = rowToCourse(row)

      // Use functional set to read fresh state — parallel calls would otherwise
      // each overwrite with their own stale snapshot of courses/enrichedCourseIds
      set(state => ({
        courses: state.courses.map(c => c.id === courseId ? enriched : c),
        enrichedCourseIds: new Set([...state.enrichedCourseIds, courseId]),
      }))
    } catch (err) {
      console.error(`Failed to fetch detail for ${courseId}:`, err)
    }
  },
}))

if (typeof window !== 'undefined') {
  useCourseStore.getState().fetchCourses()
}

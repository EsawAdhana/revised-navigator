import { create } from 'zustand'
import type { CourseEvaluation } from '@/types/course'

/** Normalizes an instructor name for de-dup: case-insensitive and order-independent
 *  so "Dan Jurafsky" and "Jurafsky, Dan" collapse to the same key. */
function normalizeInstructor(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

const EVAL_CACHE_KEY = 'evaluations-cache'
const EVAL_CACHE_TTL = 1000 * 60 * 30 // 30 min

// Course IDs with an in-flight bulk fetch — dedupes concurrent/overlapping callers
// (e.g. the detail page plus its two CourseEvaluations children mounting together).
const bulkInFlight = new Set<string>()

function readEvalCache(): Record<string, CourseEvaluation[]> | null {
  try {
    const raw = sessionStorage.getItem(EVAL_CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > EVAL_CACHE_TTL) return null
    return data
  } catch {
    return null
  }
}

function writeEvalCache(data: Record<string, CourseEvaluation[]>) {
  try {
    sessionStorage.setItem(EVAL_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // sessionStorage full — skip
  }
}

type EvaluationStore = {
  evaluations: Record<string, CourseEvaluation[]>
  loadingCourses: Record<string, boolean>
  errorCourses: Record<string, boolean>
  isBulkLoading: boolean
  fetchBulkEvaluations: (courseIds: string[]) => Promise<void>
  getEvaluations: (courseId: string) => CourseEvaluation[]
  /** Merged evaluations from all course IDs (e.g. cross-listed CS 24, LINGUIST 35). Deduplicated by term+instructor. */
  getMergedEvaluations: (courseIds: string[]) => CourseEvaluation[]
  isLoadingCourse: (courseId: string) => boolean
  hasErrorForCourse: (courseId: string) => boolean
  /** Clears all loaded evaluations and the cache (e.g. on sign-out, since
   *  evaluation data is Stanford-login-only). */
  clearAll: () => void
}

export const useEvaluationStore = create<EvaluationStore>((set, get) => ({
  evaluations: {},
  loadingCourses: {},
  errorCourses: {},
  isBulkLoading: false,

  fetchBulkEvaluations: async (courseIds) => {
    let { evaluations } = get()
    // Hydrate from cache first (instant on refresh) — only set when it adds new keys
    const cached = readEvalCache()
    if (cached) {
      const addsNewKeys = Object.keys(cached).some(id => !(id in evaluations))
      evaluations = { ...cached, ...evaluations }
      if (addsNewKeys) set(state => ({ ...state, evaluations: { ...cached, ...state.evaluations } }))
    }

    const toFetch = courseIds.filter(id => !evaluations[id] && !bulkInFlight.has(id))
    if (toFetch.length === 0) return
    for (const id of toFetch) bulkInFlight.add(id)

    set(state => {
      const loadingCourses = { ...state.loadingCourses }
      for (const id of toFetch) loadingCourses[id] = true
      return { ...state, isBulkLoading: true, loadingCourses }
    })

    const clearLoadingFlags = (loadingCourses: Record<string, boolean>) => {
      const next = { ...loadingCourses }
      for (const id of toFetch) delete next[id]
      return next
    }


    try {
      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds: toFetch })
      })
      if (res.status === 401) {
        // Evaluations are Stanford-login-only — treat as no data (not an error).
        set(state => {
          const updated = { ...state.evaluations }
          for (const id of toFetch) if (!(id in updated)) updated[id] = []
          return {
            evaluations: updated,
            isBulkLoading: false,
            loadingCourses: clearLoadingFlags(state.loadingCourses),
          }
        })
        return
      }
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const raw: unknown = await res.json()
      const byCourse: Record<string, CourseEvaluation[]> = {}
      if (raw && typeof raw === 'object') {
        for (const [courseId, evals] of Object.entries(raw as Record<string, unknown>)) {
          byCourse[courseId] = Array.isArray(evals) ? (evals as CourseEvaluation[]) : []
        }
      }


      const fetched: Record<string, CourseEvaluation[]> = {}
      for (const [courseId, evals] of Object.entries(byCourse)) {
        fetched[courseId] = evals || []
      }
      for (const id of toFetch) {
        if (!(id in fetched)) fetched[id] = []
      }

      set(state => {
        const merged = { ...state.evaluations, ...fetched }
        writeEvalCache(merged)
        return {
          evaluations: merged,
          isBulkLoading: false,
          loadingCourses: clearLoadingFlags(state.loadingCourses),
        }
      })
    } catch (err) {
      console.error('Failed to bulk load evaluations:', err)
      set(state => {
        const updated = { ...state.evaluations }
        const errors = { ...state.errorCourses }
        for (const id of toFetch) {
          if (!(id in updated)) updated[id] = []
          errors[id] = true
        }
        return {
          evaluations: updated,
          errorCourses: errors,
          isBulkLoading: false,
          loadingCourses: clearLoadingFlags(state.loadingCourses),
        }
      })
    } finally {
      for (const id of toFetch) bulkInFlight.delete(id)
    }
  },

  getEvaluations: (courseId) => {
    const { evaluations } = get()
    return evaluations[courseId] || []
  },

  getMergedEvaluations: (courseIds) => {
    const { evaluations } = get()
    const seen = new Set<string>()
    const merged: CourseEvaluation[] = []
    for (const id of courseIds) {
      const evals = evaluations[id] || []
      for (const ev of evals) {
        const key = `${ev.term}|${normalizeInstructor(ev.instructor)}`
        if (!seen.has(key)) {
          seen.add(key)
          merged.push(ev)
        }
      }
    }
    return merged
  },

  isLoadingCourse: (courseId) => {
    const { loadingCourses } = get()
    return !!loadingCourses[courseId]
  },

  hasErrorForCourse: (courseId) => {
    const { errorCourses } = get()
    return !!errorCourses[courseId]
  },

  clearAll: () => {
    try { sessionStorage.removeItem(EVAL_CACHE_KEY) } catch { /* ignore */ }
    set({ evaluations: {}, loadingCourses: {}, errorCourses: {}, isBulkLoading: false })
  }
}))

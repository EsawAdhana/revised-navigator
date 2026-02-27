import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { CourseEvaluation } from '@/types/course'

const EVAL_CACHE_KEY = 'evaluations-cache'
const EVAL_CACHE_TTL = 1000 * 60 * 30 // 30 min

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
  fetchCourseEvaluations: (courseId: string) => Promise<void>
  fetchBulkEvaluations: (courseIds: string[]) => Promise<void>
  getEvaluations: (courseId: string) => CourseEvaluation[]
  /** Merged evaluations from all course IDs (e.g. cross-listed CS 24, LINGUIST 35). Deduplicated by term+instructor. */
  getMergedEvaluations: (courseIds: string[]) => CourseEvaluation[]
  isLoadingCourse: (courseId: string) => boolean
  hasErrorForCourse: (courseId: string) => boolean
}

export const useEvaluationStore = create<EvaluationStore>((set, get) => ({
  evaluations: {},
  loadingCourses: {},
  errorCourses: {},
  isBulkLoading: false,

  fetchCourseEvaluations: async (courseId) => {
    const { evaluations, loadingCourses } = get()

    // Already cached or currently loading
    if (evaluations[courseId] || loadingCourses[courseId]) return

    set(state => ({
      loadingCourses: { ...state.loadingCourses, [courseId]: true },
      errorCourses: { ...state.errorCourses, [courseId]: false }
    }))

    try {
      const { data, error } = await supabase
        .from('evaluations')
        .select('term, instructor, course_code, respondents, questions, comments')
        .eq('course_id', courseId)

      if (error) throw error

      // Map snake_case DB columns back to camelCase for the frontend
      const mapped: CourseEvaluation[] = (data || []).map(row => ({
        // Clean term: "Spring 2024Computer Science" -> "Spring 2024"
        term: row.term.replace(/(\d{4})\D.*$/, '$1'),
        instructor: row.instructor,
        courseCode: row.course_code,
        respondents: row.respondents,
        questions: row.questions,
        comments: row.comments
      }))

      set(state => ({
        evaluations: { ...state.evaluations, [courseId]: mapped },
        loadingCourses: { ...state.loadingCourses, [courseId]: false }
      }))
    } catch (err) {
      console.error(`Failed to load evaluations for ${courseId}:`, err)
      set(state => ({
        evaluations: { ...state.evaluations, [courseId]: [] },
        loadingCourses: { ...state.loadingCourses, [courseId]: false },
        errorCourses: { ...state.errorCourses, [courseId]: true }
      }))
    }
  },

  fetchBulkEvaluations: async (courseIds) => {
    let { evaluations } = get()
    // Hydrate from cache first (instant on refresh)
    const cached = readEvalCache()
    if (cached) {
      evaluations = { ...cached, ...evaluations }
      set(state => ({ ...state, evaluations }))
    }

    const toFetch = courseIds.filter(id => !evaluations[id])
    if (toFetch.length === 0) return

    set(state => ({ ...state, isBulkLoading: true }))

    try {
      const allById: Record<string, CourseEvaluation[]> = { ...evaluations }

      // Single API request — server fetches from Supabase (1 round-trip vs 5)
      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds: toFetch })
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const byCourse = (await res.json()) as Record<string, CourseEvaluation[]>

      for (const [courseId, evals] of Object.entries(byCourse)) {
        allById[courseId] = evals || []
      }
      for (const id of toFetch) {
        if (!(id in allById)) allById[id] = []
      }

      writeEvalCache(allById)
      set(state => ({
        evaluations: allById,
        isBulkLoading: false
      }))
    } catch (err) {
      console.error('Failed to bulk load evaluations:', err)
      // Mark fetched courses as empty so we don't show loading forever
      const { evaluations: ev } = get()
      const allById = { ...ev }
      for (const id of toFetch) {
        if (!(id in allById)) allById[id] = []
      }
      set(state => ({ ...state, evaluations: allById, isBulkLoading: false }))
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
        const key = `${ev.term}|${ev.instructor}`
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
  }
}))

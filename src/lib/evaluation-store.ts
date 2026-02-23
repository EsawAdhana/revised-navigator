import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { CourseEvaluation } from '@/types/course'

const BULK_CHUNK_SIZE = 100

type EvaluationStore = {
  evaluations: Record<string, CourseEvaluation[]>
  loadingCourses: Record<string, boolean>
  errorCourses: Record<string, boolean>
  isBulkLoading: boolean
  fetchCourseEvaluations: (courseId: string) => Promise<void>
  fetchBulkEvaluations: (courseIds: string[]) => Promise<void>
  getEvaluations: (courseId: string) => CourseEvaluation[]
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
    const { evaluations } = get()
    const toFetch = courseIds.filter(id => !evaluations[id])
    if (toFetch.length === 0) return

    set(state => ({ ...state, isBulkLoading: true }))

    try {
      const allById: Record<string, CourseEvaluation[]> = { ...evaluations }
      for (let i = 0; i < toFetch.length; i += BULK_CHUNK_SIZE) {
        const chunk = toFetch.slice(i, i + BULK_CHUNK_SIZE)
        const { data, error } = await supabase
          .from('evaluations')
          .select('course_id, term, instructor, course_code, respondents, questions, comments')
          .in('course_id', chunk)

        if (error) throw error

        for (const row of data || []) {
          const courseId = row.course_id
          if (!courseId) continue
          const mapped: CourseEvaluation = {
            term: (row.term || '').replace(/(\d{4})\D.*$/, '$1'),
            instructor: row.instructor,
            courseCode: row.course_code,
            respondents: row.respondents,
            questions: row.questions,
            comments: row.comments
          }
          if (!allById[courseId]) allById[courseId] = []
          allById[courseId].push(mapped)
        }
      }

      set(state => ({
        evaluations: allById,
        isBulkLoading: false
      }))
    } catch (err) {
      console.error('Failed to bulk load evaluations:', err)
      set(state => ({ ...state, isBulkLoading: false }))
    }
  },

  getEvaluations: (courseId) => {
    const { evaluations } = get()
    return evaluations[courseId] || []
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

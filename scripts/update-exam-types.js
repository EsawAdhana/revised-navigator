#!/usr/bin/env node

/**
 * Precompute exam_type for every course using course data + evaluation comments/questions,
 * then update the courses table so the frontend can use exam_type directly.
 *
 * Run once (or when courses/evals change). Uses same logic as getCourseExamType + buildEvalText.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/update-exam-types.js
 *   (or use .env.local; script loads dotenv)
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { createClient } = require('@supabase/supabase-js')

const PAGE_SIZE = 500
const UPDATE_BATCH = 100

function buildEvalText(evals) {
  if (!evals?.length) return ''
  const parts = []
  for (const e of evals) {
    if (e.comments?.length) parts.push(...e.comments)
    if (e.questions?.length) {
      for (const q of e.questions) {
        if (q.text) parts.push(q.text)
      }
    }
  }
  return parts.join(' ')
}

function courseHasScheduledFinal(course) {
  if (course.sections?.some(s => s.finalExam?.date)) return true
  if (course.final_exam && typeof course.final_exam === 'object' && !Array.isArray(course.final_exam)) {
    return Object.values(course.final_exam).some(v => v?.date)
  }
  return false
}

function getCourseExamType(course, evalText = '') {
  const text = `${course.title || ''} ${course.description || ''} ${evalText || ''}`.toLowerCase()

  if (!text.trim()) {
    return courseHasScheduledFinal(course) ? 'has_exam' : 'no_exam'
  }

  if (/\bno\s+final\s+exam\b|\bno\s+final\b|\bno\s+exam\b|\bno\s+midterm\b|\bwithout\s+(a\s+)?final\b|\bno\s+in[- ]?class\s+exam\b/i.test(text)) return 'no_exam'
  if (courseHasScheduledFinal(course)) return 'has_exam'

  const hasTakeHome = /\btake[- ]?home\s+(final|exam)\b|\b(final|exam)\s+is\s+take[- ]?home\b/i.test(text)
  const hasInClassFinal = /\bin[- ]?class\s+final\b|\bscheduled\s+final\b|\bfinal\s+exam\s+will\s+be\s+held\b/i.test(text)
  if (hasTakeHome && !hasInClassFinal) return 'take_home'

  if (/\bfinal\s+exam\b|\bmidterm\b|\bin[- ]?class\s+exam\b|\bscheduled\s+final\b/i.test(text)) return 'has_exam'

  return 'no_exam'
}

async function fetchAll(supabase, table, columns, orderBy = 'course_id') {
  const out = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1).order(orderBy)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return out
}

function mergeCourseRows(rows) {
  const byId = new Map()
  for (const row of rows) {
    const id = row.course_id
    if (!byId.has(id)) {
      byId.set(id, {
        course_id: id,
        subject: row.subject,
        code: row.code,
        title: row.title,
        description: row.description || '',
        terms: [],
        sections: [],
        final_exam: {}
      })
    }
    const c = byId.get(id)
    if (row.terms?.length) c.terms = [...new Set([...(c.terms || []), ...row.terms])]
    if (row.sections?.length) c.sections = [...(c.sections || []), ...row.sections]
    if (row.quarter && row.final_exam != null) c.final_exam[row.quarter] = row.final_exam
  }
  return byId
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  console.log('Fetching courses...')
  const courseRows = await fetchAll(supabase, 'courses', 'course_id, quarter, subject, code, title, description, sections, final_exam, terms')
  console.log('Fetching evaluations...')
  const evalRows = await fetchAll(supabase, 'evaluations', 'course_id, comments, questions')

  const coursesById = mergeCourseRows(courseRows)
  const evalsByCourseId = new Map()
  for (const row of evalRows) {
    const id = row.course_id
    if (!id) continue
    if (!evalsByCourseId.has(id)) evalsByCourseId.set(id, [])
    evalsByCourseId.get(id).push({ comments: row.comments || [], questions: row.questions || [] })
  }

  const courseIds = [...coursesById.keys()]
  const updates = []
  for (const courseId of courseIds) {
    const course = coursesById.get(courseId)
    const evals = evalsByCourseId.get(courseId) || []
    const evalText = buildEvalText(evals)
    const examType = getCourseExamType(course, evalText)
    updates.push({ course_id: courseId, exam_type: examType })
  }

  console.log(`Computed exam_type for ${updates.length} courses. Updating Supabase in batches of ${UPDATE_BATCH}...`)

  let done = 0
  for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
    const batch = updates.slice(i, i + UPDATE_BATCH)
    await Promise.all(
      batch.map(({ course_id, exam_type }) =>
        supabase.from('courses').update({ exam_type }).eq('course_id', course_id)
      )
    )
    done += batch.length
    process.stdout.write(`\r  ${done}/${updates.length}`)
  }
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

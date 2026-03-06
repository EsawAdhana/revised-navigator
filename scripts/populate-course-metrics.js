#!/usr/bin/env node

/**
 * Precompute hours, quality, and difficulty (hours/unit) for every course from evaluations.
 * Updates courses table with these columns for O(n) filtering.
 *
 * Run after: scripts/supabase-courses-metrics-columns.sql
 * Usage: node scripts/populate-course-metrics.js [--dry-run]
 *   --dry-run  Fetch and compute only; do not write to database.
 */

const path = require('path')
const dryRun = process.argv.includes('--dry-run')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { createClient } = require('@supabase/supabase-js')

const PAGE_SIZE = 500
const BATCH_SIZE = 200

function categorizeQuestion(text) {
  const t = (text || '').toLowerCase()
  if (t.includes('quality') || t.includes('overall')) return 'quality'
  if (t.includes('how much did you learn')) return 'learning'
  if (t.includes('organized')) return 'organization'
  if (t.includes('learning goals')) return 'goals'
  if (t.includes('hours per week') || (t.includes('hours') && t.includes('week'))) return 'hours'
  if (t.includes('percent') && t.includes('in person')) return 'attendance_in_person'
  if (t.includes('percent') && t.includes('online')) return 'attendance_online'
  return 'unknown'
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function medianFromOptions(options) {
  if (!options?.length) return null
  const total = options.reduce((sum, o) => sum + (o.count || 0), 0)
  if (total === 0) return null
  const sorted = [...options].filter(o => (o.count || 0) > 0).sort((a, b) => a.weight - b.weight)
  if (!sorted.length) return null
  let acc = 0
  const half = total / 2
  for (const opt of sorted) {
    acc += opt.count || 0
    if (acc >= half) return opt.weight
  }
  return sorted[sorted.length - 1]?.weight ?? null
}

function aggregateMetrics(evals) {
  const byCat = { quality: [], learning: [], organization: [], goals: [], hours: [], attendance_in_person: [] }
  for (const ev of evals || []) {
    for (const q of ev.questions || []) {
      const cat = categorizeQuestion(q?.text ?? '')
      if (!byCat[cat]) continue
      let val = typeof q?.median === 'number' && !isNaN(q.median) ? q.median : null
      if (cat === 'hours' && (val == null || val === 0) && q?.options?.length) {
        val = medianFromOptions(q.options)
      }
      if (val != null) byCat[cat].push(val)
    }
  }
  const result = {}
  for (const [cat, values] of Object.entries(byCat)) {
    const m = median(values)
    if (m != null) result[cat] = m
  }
  return result
}

function getOverallEvalScore(metrics) {
  if (!metrics) return null
  const vals = [metrics.quality, metrics.learning, metrics.organization].filter(v => v != null)
  if (!vals.length) return null
  return median(vals)
}

function parseUnits(unitsStr) {
  if (unitsStr == null || unitsStr === '') return 0
  const s = String(unitsStr).trim()
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/)
  if (range) return Math.max(parseFloat(range[1]) || 0, parseFloat(range[2]) || 0)
  const single = parseFloat(s)
  return !isNaN(single) ? single : 0
}

async function fetchAll(supabase, table, columns) {
  const out = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return out
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  console.log('Fetching courses (for units)...')
  const courseRows = await fetchAll(supabase, 'courses', 'course_id, units')
  const unitsByCourse = new Map()
  for (const row of courseRows) {
    const u = parseUnits(row.units)
    if (u > 0 && (!unitsByCourse.has(row.course_id) || unitsByCourse.get(row.course_id) < u)) {
      unitsByCourse.set(row.course_id, u)
    }
  }

  console.log('Fetching evaluations...')
  const evalRows = await fetchAll(supabase, 'evaluations', 'course_id, questions')
  const evalsByCourse = new Map()
  for (const row of evalRows) {
    if (!row.course_id) continue
    if (!evalsByCourse.has(row.course_id)) evalsByCourse.set(row.course_id, [])
    evalsByCourse.get(row.course_id).push({ questions: row.questions || [] })
  }

  const rows = []
  let qualityCount = 0
  let hoursCount = 0
  for (const [courseId, evals] of evalsByCourse) {
    const metrics = aggregateMetrics(evals)
    const hours = metrics.hours
    const quality = getOverallEvalScore(metrics)
    const units = unitsByCourse.get(courseId) || 1

    const update = { course_id: courseId }
    if (quality != null) { update.quality = quality; qualityCount++ }
    if (hours != null && hours > 0) { update.hours = hours; hoursCount++ }
    if (hours != null && hours > 0 && units > 0) update.difficulty = hours / units

    // Only queue an update if there's at least one metric to write
    const hasFields = Object.keys(update).length > 1
    if (hasFields) rows.push(update)
  }

  console.log(`Computed metrics for ${rows.length} courses (${qualityCount} quality, ${hoursCount} hours).`)
  if (dryRun) {
    console.log('\n[DRY RUN] No changes written. Sample of what would be updated:\n')
    rows.slice(0, 10).forEach(({ course_id, hours, quality, difficulty }) => {
      console.log(`  ${course_id}: hours=${hours != null ? hours.toFixed(1) : 'N/A'}, quality=${quality != null ? quality.toFixed(1) : 'N/A'}, difficulty=${difficulty != null ? difficulty.toFixed(1) : 'N/A'}`)
    })
    if (rows.length > 10) {
      console.log(`  ... and ${rows.length - 10} more`)
    }
    console.log('\nRun without --dry-run to apply.')
    return
  }

  console.log('Updating courses table...')
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(({ course_id, ...fields }) =>
        supabase.from('courses').update(fields).eq('course_id', course_id)
      )
    )
    process.stdout.write(`\r  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`)
  }
  console.log('\nDone.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

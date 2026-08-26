/**
 * LOCAL PREVIEW ONLY. Recomputes the rating columns into public/catalog/*.json exactly
 * as refreshMetrics() would, so the app can be run before the migration is applied.
 * `npm run dump:catalog` supersedes this once courses.rating_breakdown exists.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { buildCrossListGroups, deriveEvalPairings, normalizeCourseId } from '../src/lib/utils'
import { addRatingCounts, pooledMean, percentileRanks, adjustAndRank, round3, headlineSampleSize } from '../src/lib/quality-score.mjs'
import { categorizeQuestion, courseLevelSignature } from '../src/lib/eval-reports.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
async function loadAll<T>(t: string, c: string): Promise<T[]> {
  const rows: T[] = []; let from = 0
  for (;;) {
    const { data, error } = await sb.from(t).select(c).range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data as unknown as T[])); if (data.length < 1000) break; from += 1000
  }
  return rows
}

const RATING_CATEGORIES = ['quality', 'learning', 'organization'] as const
type Cat = typeof RATING_CATEGORIES[number]
const category = (t: unknown): Cat | 'hours' | null => {
  const c = categorizeQuestion(String(t ?? ''))
  return c === 'quality' || c === 'learning' || c === 'organization' || c === 'hours' ? c : null
}
const median = (values: number[]) => {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b); const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const units = (v: unknown) => {
  const m = String(v || '').match(/\d+(?:\.\d+)?/g)
  return Math.max(...(m?.map(Number) || [1]))
}

const [evalRows, courseRows] = await Promise.all([
  loadAll<any>('evaluations', 'course_id,course_code,term,instructor,questions'),
  loadAll<any>('courses', 'course_id,title,units'),
])
const catalogIds = new Set(courseRows.map(r => normalizeCourseId(String(r.course_id))))
const pairings: Map<string, string[]> = deriveEvalPairings(evalRows, catalogIds)
const courses = courseRows.map(r => ({
  id: String(r.course_id),
  title: String(r.title || ''),
  crossListWith: pairings.get(normalizeCourseId(String(r.course_id))) || [],
}))
const courseUnits = new Map(courseRows.map(r => [String(r.course_id), units(r.units)]))
const groups: Map<string, string[]> = buildCrossListGroups(courses)
const sizes = [...groups.values()].map(g => g.length).sort((a, b) => b - a)
console.log(`grouping: ${groups.size} classes, largest group ${sizes[0]} codes, ${sizes.filter(n => n > 1).length} multi-code`)
const groupOf = new Map<string, string>()
for (const [canonical, members] of groups) for (const m of members) groupOf.set(m, canonical)

const questionsByGroup = new Map<string, any[]>()
const seen = new Set<string>(); let dupes = 0
for (const r of evalRows) {
  const canonical = groupOf.get(r.course_id) ?? r.course_id
  const key = `${canonical}||${r.course_code}||${r.term}||${courseLevelSignature(r)}`
  if (seen.has(key)) { dupes++; continue }
  seen.add(key)
  if (!questionsByGroup.has(canonical)) questionsByGroup.set(canonical, [])
  questionsByGroup.get(canonical)!.push(...(r.questions || []))
}
console.log(`${seen.size} distinct reports over ${questionsByGroup.size} classes (${dupes} duplicate rows skipped)`)

const pooledByCategory = new Map<Cat, Map<string, Map<number, number>>>(RATING_CATEGORIES.map(k => [k, new Map()]))
const hoursByGroup = new Map<string, number[]>()
for (const [canonical, questions] of questionsByGroup) {
  for (const q of questions) {
    const cat = category(q?.text)
    if (!cat) continue
    if (cat === 'hours') {
      if (Number.isFinite(q.median) && q.median > 0) {
        if (!hoursByGroup.has(canonical)) hoursByGroup.set(canonical, [])
        hoursByGroup.get(canonical)!.push(q.median)
      }
      continue
    }
    const per = pooledByCategory.get(cat)!
    if (!per.has(canonical)) per.set(canonical, new Map())
    addRatingCounts(per.get(canonical)!, q)
  }
}

const breakdown = new Map<string, Partial<Record<Cat, { score: number; n: number; pct: number }>>>()
for (const key of RATING_CATEGORIES) {
  const ids: string[] = []; const obs: any[] = []
  for (const [canonical, counts] of pooledByCategory.get(key)!) {
    const p = pooledMean(counts); if (!p) continue
    ids.push(canonical); obs.push(p)
  }
  const { prior, scores, percentiles } = adjustAndRank(obs)
  console.log(`  ${key.padEnd(13)} mean ${prior.grandMean.toFixed(3)} weight ${prior.weight.toFixed(2)} ${ids.length} classes`)
  ids.forEach((canonical, i) => {
    if (!breakdown.has(canonical)) breakdown.set(canonical, {})
    breakdown.get(canonical)![key] = { score: scores[i], n: obs[i].n, pct: percentiles[i] }
  })
}

const perGroup = new Map<string, any>()
for (const canonical of new Set([...breakdown.keys(), ...hoursByGroup.keys()])) {
  const parts = Object.values(breakdown.get(canonical) || {}) as { score: number; n: number }[]
  perGroup.set(canonical, {
    hoursMedian: median(hoursByGroup.get(canonical) || []),
    ...(parts.length > 0 && {
      quality: round3(parts.reduce((s, p) => s + p.score, 0) / parts.length),
      quality_n: headlineSampleSize(breakdown.get(canonical)!),
      rating_breakdown: breakdown.get(canonical),
    }),
  })
}
const scored = [...perGroup.values()].filter(v => v.quality != null)
const ranks = percentileRanks(scored.map(v => v.quality))
scored.forEach((v, i) => { v.quality_pct = ranks[i] })

for (const file of ['light.json', 'full.json']) {
  const path = `public/catalog/${file}`
  const rows = JSON.parse(readFileSync(path, 'utf8')) as any[]
  let rated = 0
  for (const row of rows) {
    const value = perGroup.get(groupOf.get(String(row.course_id)) ?? String(row.course_id))
    delete row.quality_pct; delete row.quality_n; delete row.rating_breakdown; delete row.cross_list_with
    row.quality = null
    const pairs = pairings.get(normalizeCourseId(String(row.course_id)))
    if (pairs && pairs.length > 0) row.cross_list_with = pairs
    if (!value) continue
    if (value.hoursMedian != null) {
      row.hours = value.hoursMedian
      row.difficulty = value.hoursMedian / (courseUnits.get(String(row.course_id)) || 1)
    }
    if (value.quality != null) {
      row.quality = value.quality
      row.quality_n = value.quality_n
      row.quality_pct = value.quality_pct
      row.rating_breakdown = value.rating_breakdown
      rated++
    }
  }
  writeFileSync(path, JSON.stringify(rows))
  console.log(`${file}: ${rows.length} rows, ${rated} rated`)
}

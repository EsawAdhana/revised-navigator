/**
 * Gently dump light + full course catalogs for near-instant API serving.
 *
 * Usage:
 *   node --env-file=.env.local scripts/dump-catalog.mjs
 *
 * Writes public/catalog/{light,full}.json and uploads to Supabase Storage
 * bucket `catalog` (public). /api/courses prefers those over a live DB scan.
 *
 * Full dump uses per-course fetches — range scans of `sections` currently
 * statement-timeout after the 26-27 refresh; single-id reads still work.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'catalog')

const FULL_COLUMNS =
  'course_id, subject, code, title, description, units, grading, instructors, terms, sections, hours, quality, difficulty'
const LIGHT_COLUMNS =
  'course_id, subject, code, title, units, instructors, terms, grading, hours, quality, difficulty'

const LIGHT_PAGE = 250
// Batch `.in()` beats one-id-at-a-time. Keep batches small enough to avoid
// statement timeouts on fat `sections` rows; raise parallel batches for speed.
const DETAIL_BATCH = 5
const DETAIL_PARALLEL = 12
const MAX_ATTEMPTS = 2 // don't grind forever on fat/timeout rows — skip + fill from light

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function isRetryable(err) {
  const msg = err?.message || ''
  return (
    err?.code === '57014' ||
    /statement timeout/i.test(msg) ||
    /upstream request timeout/i.test(msg) ||
    /fetch failed/i.test(msg) ||
    /ECONNRESET/i.test(msg)
  )
}

/** Same merge as src/lib/supabase-admin mergeCourseRows (multi-term rows → one). */
function mergeCourseRows(rows) {
  const merged = new Map()
  for (const row of rows) {
    const existing = merged.get(row.course_id)
    if (!existing) {
      merged.set(row.course_id, { ...row })
      continue
    }
    const terms = Array.from(new Set([...(existing.terms || []), ...(row.terms || [])]))
    const sections = [...(existing.sections || []), ...(row.sections || [])]
    const units = (existing.units && String(existing.units).trim()) ? existing.units : (row.units || existing.units)
    merged.set(row.course_id, { ...existing, terms, sections, units })
  }
  return Array.from(merged.values())
}

async function withRetries(fn, label) {
  let lastErr = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fn()
      if (result.error) {
        lastErr = result.error
        if (!isRetryable(result.error) || attempt === MAX_ATTEMPTS) return result
        const wait = 1000 * attempt
        console.warn(`  ${label} retry ${attempt}/${MAX_ATTEMPTS} in ${wait}ms (${result.error.message || result.error.code})`)
        await sleep(wait)
        continue
      }
      return result
    } catch (err) {
      lastErr = err
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) throw err
      const wait = 1000 * attempt
      console.warn(`  ${label} retry ${attempt}/${MAX_ATTEMPTS} in ${wait}ms (${err.message})`)
      await sleep(wait)
    }
  }
  return { data: null, error: lastErr }
}

async function fetchLight(supabase) {
  const rows = []
  let last = null
  let page = 0
  while (true) {
    page++
    const cursor = last
    const { data, error } = await withRetries(() => {
      let q = supabase
        .from('courses')
        .select(LIGHT_COLUMNS)
        .order('course_id', { ascending: true })
        .limit(LIGHT_PAGE)
      if (cursor) q = q.gt('course_id', cursor)
      return q
    }, `light page ${page}`)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    last = data[data.length - 1].course_id
    if (page % 10 === 0 || data.length < LIGHT_PAGE) {
      console.log(`  light: ${rows.length} rows (page ${page})`)
    }
    if (data.length < LIGHT_PAGE) break
    await sleep(50)
  }
  return rows.filter((r) => r.grading && String(r.grading).trim() && r.grading !== 'TBD')
}

async function fetchOneFull(supabase, id) {
  const one = await withRetries(
    () => supabase.from('courses').select(FULL_COLUMNS).eq('course_id', id),
    `full ${id}`,
  )
  if (one.error) {
    console.warn(`  skip ${id}: ${one.error.message || one.error.code}`)
    return []
  }
  return one.data || []
}

async function fetchFullByIds(supabase, ids, { checkpointPath } = {}) {
  const already = new Map()
  if (checkpointPath && existsSync(checkpointPath)) {
    try {
      for (const row of JSON.parse(readFileSync(checkpointPath, 'utf8'))) {
        if (row?.course_id) already.set(row.course_id, row)
      }
      console.log(`  resume: ${already.size} courses from checkpoint`)
    } catch { /* ignore corrupt checkpoint */ }
  }
  const pending = ids.filter((id) => !already.has(id))
  const rows = [...already.values()]
  const batches = []
  for (let i = 0; i < pending.length; i += DETAIL_BATCH) {
    batches.push(pending.slice(i, i + DETAIL_BATCH))
  }
  let done = already.size
  let skipped = 0
  const total = ids.length
  console.log(`  pending ${pending.length} of ${total}`)
  for (let i = 0; i < batches.length; i += DETAIL_PARALLEL) {
    const wave = batches.slice(i, i + DETAIL_PARALLEL)
    const results = await Promise.all(
      wave.map(async (batch, idx) => {
        const result = await supabase.from('courses').select(FULL_COLUMNS).in('course_id', batch)
        if (!result.error) return { data: result.data || [], skipped: 0 }
        if (!isRetryable(result.error)) {
          console.warn(`  batch ${i + idx + 1} hard fail → skip: ${result.error.message}`)
          return { data: [], skipped: batch.length }
        }
        console.warn(`  batch ${i + idx + 1} timeout → per-id (${batch.length})`)
        const got = []
        let miss = 0
        for (const id of batch) {
          const rows = await fetchOneFull(supabase, id)
          if (rows.length) got.push(...rows)
          else miss++
        }
        return { data: got, skipped: miss }
      }),
    )
    for (let r = 0; r < results.length; r++) {
      rows.push(...results[r].data)
      skipped += results[r].skipped
      done += wave[r].length
    }
    if (done % 300 === 0 || done >= total || i + DETAIL_PARALLEL >= batches.length) {
      console.log(`  full: ${done}/${total} courses (skipped ${skipped})`)
      if (checkpointPath) writeFileSync(checkpointPath, JSON.stringify(rows))
    }
  }
  return rows.filter((r) => r.grading && String(r.grading).trim() && r.grading !== 'TBD')
}

async function ensureCatalogBucket(supabase) {
  const { data: buckets } = await supabase.storage.listBuckets()
  const existing = buckets?.find((b) => b.name === 'catalog')
  if (!existing) {
    const { error } = await supabase.storage.createBucket('catalog', {
      public: true,
      fileSizeLimit: '100MB',
    })
    if (error && !/already exists/i.test(error.message || '')) throw error
  } else {
    const { error } = await supabase.storage.updateBucket('catalog', {
      public: true,
      fileSizeLimit: '100MB',
    })
    if (error) console.warn('  updateBucket:', error.message)
  }
}

async function uploadFile(supabase, name, body) {
  const { error } = await supabase.storage.from('catalog').upload(name, body, {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '86400',
  })
  if (error) throw error
  console.log(`  uploaded ${name} (${(body.length / 1e6).toFixed(2)} MB)`)
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  mkdirSync(OUT_DIR, { recursive: true })

  const lightPath = join(OUT_DIR, 'light.json')
  let lightMerged
  if (existsSync(lightPath)) {
    lightMerged = JSON.parse(readFileSync(lightPath, 'utf8'))
    console.log(`Reusing existing light dump (${lightMerged.length} courses)`)
  } else {
    console.log('Dumping light catalog…')
    const t0 = Date.now()
    lightMerged = mergeCourseRows(await fetchLight(supabase))
    const lightJson = JSON.stringify(lightMerged)
    writeFileSync(lightPath, lightJson)
    console.log(`Light: ${lightMerged.length} courses, ${(Buffer.byteLength(lightJson) / 1e6).toFixed(2)} MB, ${Date.now() - t0}ms`)
  }

  const fullPath = join(OUT_DIR, 'full.json')
  console.log('Dumping full catalog (scheduled only; empty schedules reuse light rows)…')
  const t1 = Date.now()
  const scheduled = lightMerged.filter((c) => Array.isArray(c.terms) && c.terms.length > 0)
  const unscheduled = lightMerged.filter((c) => !Array.isArray(c.terms) || c.terms.length === 0)
  const ids = scheduled.map((c) => c.course_id || c.id)
  console.log(`  fetching ${ids.length} scheduled; skipping ${unscheduled.length} empty`)
  const checkpointPath = join(OUT_DIR, 'full.partial.json')
  const fullRows = await fetchFullByIds(supabase, ids, { checkpointPath })
  const got = new Set(fullRows.map((r) => r.course_id))
  const missingScheduled = scheduled.filter((c) => !got.has(c.course_id || c.id))
  if (missingScheduled.length) {
    console.warn(`  filling ${missingScheduled.length} timed-out scheduled from light rows`)
  }
  // Empty-schedule + timed-out fetches: keep light row shape (no sections).
  const fullMerged = mergeCourseRows([
    ...fullRows,
    ...missingScheduled.map((c) => ({ ...c, sections: c.sections || [], description: c.description || '' })),
    ...unscheduled.map((c) => ({ ...c, sections: c.sections || [], description: c.description || '' })),
  ])
  const fullJson = JSON.stringify(fullMerged)
  writeFileSync(fullPath, fullJson)
  console.log(`Full: ${fullMerged.length} courses, ${(Buffer.byteLength(fullJson) / 1e6).toFixed(2)} MB, ${Date.now() - t1}ms`)

  console.log('Uploading to Supabase Storage bucket "catalog"…')
  try {
    await ensureCatalogBucket(supabase)
    await uploadFile(supabase, 'light.json', Buffer.from(JSON.stringify(lightMerged)))
    await uploadFile(supabase, 'full.json', Buffer.from(fullJson))
    console.log('Done. Deploy API change; /api/courses will prefer Storage dumps (near-instant).')
  } catch (err) {
    console.warn('Storage upload failed (local dumps still written):', err.message || err)
    console.log('Done. Deploy with public/catalog/*.json present, or set storage up and re-run upload.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

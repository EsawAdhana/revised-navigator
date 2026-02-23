#!/usr/bin/env node

/**
 * Scrape Stanford Explore Courses and add final exam info to existing courses in Supabase.
 *
 * Does not re-upload or change any course data—only updates the final_exam column.
 *
 * 1. Loads the list of courses from Supabase (distinct course_id, subject, code).
 * 2. For each course, fetches Explore Courses search (q=SUBJECT+CODE).
 * 3. Parses HTML for "Exam Date/Time: ..." per term (sectionContainerTerm).
 * 4. Updates only the final_exam column for matching (course_id, quarter) rows.
 *
 * Requires: final_exam column on courses table (run scripts/supabase-courses-final-exam.sql).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/scrape-final-exams.js
 *   node scripts/scrape-final-exams.js --limit 5    # first 5 courses only
 *   node scripts/scrape-final-exams.js --resume     # resume from progress file
 *   node scripts/scrape-final-exams.js --full       # re-run all courses (ignore progress, catch stragglers)
 *   node scripts/scrape-final-exams.js --debug CS103   # debug one course: save HTML and log why parsing passed/failed
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const cheerio = require('cheerio')
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const PROGRESS_FILE = path.join(__dirname, '..', '.final-exam-scrape-progress.json')
const BASE_URL = 'https://explorecourses.stanford.edu/search'
const REQUEST_DELAY_MS = 40
const EXPLORE_COOKIE = 'jsenabled=1'

const termToQuarter = {
  Autumn: 'fall',
  Fall: 'fall',
  Winter: 'winter',
  Spring: 'spring',
  Summer: 'summer'
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseArgs () {
  const args = process.argv.slice(2)
  const opts = { limit: null, resume: false, full: false, debug: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[i + 1], 10)
    if (args[i] === '--resume') opts.resume = true
    if (args[i] === '--full') opts.full = true
    if (args[i] === '--debug' && args[i + 1]) opts.debug = args[i + 1].trim()
  }
  return opts
}

async function loadCoursesFromSupabase (supabase) {
  const rows = []
  const pageSize = 500
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('courses')
      .select('course_id, subject, code')
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  const byId = new Map()
  for (const r of rows) {
    if (r && r.course_id && !byId.has(r.course_id)) {
      byId.set(r.course_id, { id: r.course_id, subject: r.subject || '', code: r.code || '' })
    }
  }
  return Array.from(byId.values())
}

function loadProgress () {
  if (!fs.existsSync(PROGRESS_FILE)) return new Set()
  const raw = fs.readFileSync(PROGRESS_FILE, 'utf-8')
  try {
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveProgress (done) {
  const arr = Array.from(done)
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(arr, null, 2))
}

/**
 * Normalize "CEE 154:" -> "CEE154"
 */
function normalizeCourseKey (subject, code) {
  const s = (subject || '').trim()
  const c = (code || '').toString().trim()
  return `${s}${c}`.replace(/\s/g, '')
}

/**
 * Extract quarter from "2025-2026 Winter" -> "winter"
 */
function parseQuarterFromTermHeading (text) {
  if (!text || typeof text !== 'string') return null
  const match = text.match(/\d{4}-\d{4}\s+(Autumn|Fall|Winter|Spring|Summer)/i)
  if (!match) return null
  const term = match[1]
  return termToQuarter[term.charAt(0).toUpperCase() + term.slice(1).toLowerCase()] || null
}

/**
 * Debug: log what we find in the HTML so we can see why a course gets 0 exams.
 */
function debugParse (html, subject, code, log) {
  const $ = cheerio.load(html)
  const targetKey = normalizeCourseKey(subject, code)
  log(`  targetKey (normalized): "${targetKey}"`)
  const blocks = $(`.searchResult-noBorder, .searchResult`)
  log(`  .searchResult / .searchResult-noBorder blocks: ${blocks.length}`)
  blocks.each((i, block) => {
    const $block = $(block)
    const numberText = $block.find('.courseNumber').first().text().trim()
    const blockKey = (numberText || '').replace(/\s*:\s*$/, '').replace(/\s+/g, '')
    const match = blockKey === targetKey
    log(`    block ${i}: .courseNumber="${numberText}" -> blockKey="${blockKey}" ${match ? 'MATCH' : 'skip'}`)
    if (!match) return
    const containers = $block.find('.sectionContainer')
    log(`    .sectionContainer count: ${containers.length}`)
    containers.each((j, container) => {
      const $container = $(container)
      const termHeading = $container.find('h3.sectionContainerTerm').first().text().trim()
      const quarter = parseQuarterFromTermHeading(termHeading)
      const containerText = $container.text()
      const examMatch = containerText.match(/(?:Final\s+)?Exam\s+Date\s*\/\s*Time:\s*([^\n(<]+)/i) ||
        containerText.match(/Exam\s+Date\/Time:\s*([^\n(<]+)/)
      log(`      section ${j}: termHeading="${termHeading}" quarter=${quarter ?? 'null'} examMatch=${examMatch ? 'YES' : 'NO'}`)
      if (!examMatch) {
        const snippet = containerText.replace(/\s+/g, ' ').trim().slice(0, 280)
        log(`        text snippet: "${snippet}..."`)
      }
    })
  })
  if (blocks.length === 0) {
    log('  No .searchResult / .searchResult-noBorder found. Sample of root classes:')
    $('[class]').slice(0, 20).each((i, el) => { log(`    ${$(el).attr('class')}`) })
  }
}

/**
 * Parse one Explore Courses search result HTML for final exam(s) per term.
 * Returns array of { quarter, finalExam: { date, time, location? } }
 */
function parseFinalExamsFromHTML (html, subject, code) {
  const $ = cheerio.load(html)
  const targetKey = normalizeCourseKey(subject, code)
  const results = []

  // Explore Courses uses .searchResult for most results and .searchResult-noBorder for the last one
  $('.searchResult-noBorder, .searchResult').each((_, block) => {
    const $block = $(block)
    const numberText = $block.find('.courseNumber').first().text().trim()
    const blockKey = (numberText || '').replace(/\s*:\s*$/, '').replace(/\s+/g, '')
    if (blockKey !== targetKey) return

    $block.find('.sectionContainer').each((__, container) => {
      const $container = $(container)
      const termHeading = $container.find('h3.sectionContainerTerm').first().text().trim()
      const quarter = parseQuarterFromTermHeading(termHeading)
      if (!quarter) return

      const containerText = $container.text()
      // Match "Exam Date/Time:", "Final Exam Date/Time:", or "Exam Date / Time:" (flexible spacing)
      const examMatch = containerText.match(/(?:Final\s+)?Exam\s+Date\s*\/\s*Time:\s*([^\n(<]+)/i) ||
        containerText.match(/Exam\s+Date\/Time:\s*([^\n(<]+)/)
      if (!examMatch) return

      const dateTimeStr = examMatch[1].trim()
      const dateMatch = dateTimeStr.match(/^(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch ? dateMatch[1] : null
      const timePart = dateMatch ? dateTimeStr.slice(dateMatch[1].length).trim() : dateTimeStr
      const time = timePart && timePart.length > 0 ? timePart : null

      results.push({
        quarter,
        finalExam: { date: date || undefined, time: time || undefined, location: undefined }
      })
    })
  })

  return results
}

/** When parseFinalExamsFromHTML returned [], explain why (for debugging). */
function whyNoExams (html, subject, code) {
  const $ = cheerio.load(html)
  const targetKey = normalizeCourseKey(subject, code)
  const blocks = $('.searchResult-noBorder, .searchResult')
  if (blocks.length === 0) return 'page has 0 result blocks (wrong page or changed HTML?)'
  const blockKeys = []
  blocks.each((_, block) => {
    const numberText = $(block).find('.courseNumber').first().text().trim()
    const blockKey = (numberText || '').replace(/\s*:\s*$/, '').replace(/\s+/g, '')
    blockKeys.push(blockKey || '(empty)')
  })
  const matched = blockKeys.includes(targetKey)
  if (!matched) return `blocks found: [${blockKeys.slice(0, 5).join(', ')}...], target "${targetKey}" not in list`
  let hasSection = false
  let hasExamLine = false
  blocks.each((_, block) => {
    const $block = $(block)
    const numberText = $block.find('.courseNumber').first().text().trim()
    const blockKey = (numberText || '').replace(/\s*:\s*$/, '').replace(/\s+/g, '')
    if (blockKey !== targetKey) return
    $block.find('.sectionContainer').each((__, container) => {
      hasSection = true
      const text = $(container).text()
      if (/Exam\s+Date\/Time:/i.test(text) || /Final\s+Exam\s+Date\s*\/\s*Time:/i.test(text)) hasExamLine = true
    })
  })
  if (!hasSection) return 'matched block has 0 .sectionContainer'
  if (!hasExamLine) return 'sections found but no "Exam Date/Time" text in any'
  return 'unknown'
}

async function fetchExplorePage (query) {
  const url = `${BASE_URL}?view=catalog&filter-coursestatus-Active=on&filter-catalog-Catalog=Stanford+University&q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      Cookie: EXPLORE_COOKIE,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  })
  if (!res.ok) return null
  return res.text()
}

async function main () {
  const opts = parseArgs()
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  console.log('Loading course list from Supabase...')
  let courses = await loadCoursesFromSupabase(supabase)
  if (opts.debug) {
    courses = courses.filter(c => c && (c.id === opts.debug || c.id === opts.debug.toUpperCase()))
    if (courses.length === 0) {
      console.error(`No course found for --debug ${opts.debug}. Use course_id e.g. CS103.`)
      process.exit(1)
    }
    console.log(`Debug mode: only processing ${courses[0].id}`)
  }
  const done = opts.full || opts.debug ? new Set() : (opts.resume ? loadProgress() : new Set())
  let processed = 0
  let updated = 0
  let noExamReasonsLogged = 0
  const limit = opts.limit == null ? courses.length : Math.min(opts.limit, courses.length)

  console.log(`Courses in Supabase: ${courses.length}. Processing up to ${limit}. Full re-run: ${opts.full}, Resume: ${opts.resume}.`)
  if (courses.length > 0) {
    const first = courses[0]
    console.log(`First course: id=${first.id} subject="${first.subject}" code="${first.code}" -> query "${(first.subject || '') + (first.code || '')}".trim() || id`)
  }

  for (let i = 0; i < courses.length && processed < limit; i++) {
    const c = courses[i]
    if (!c || !c.id) continue
    if (done.has(c.id)) continue
    processed++

    const query = `${c.subject || ''}${c.code || ''}`.trim() || c.id
    process.stdout.write(`  [${processed}/${limit}] ${c.id} ... `)
    const html = await fetchExplorePage(query)
    await sleep(REQUEST_DELAY_MS)

    if (!html) {
      console.warn(`No HTML`)
      done.add(c.id)
      saveProgress(done)
      continue
    }

    if (opts.debug) {
      const debugPath = path.join(__dirname, '..', `debug-${c.id}.html`)
      fs.writeFileSync(debugPath, html, 'utf-8')
      console.log(`  [${c.id}] Saved HTML to ${debugPath}`)
      debugParse(html, c.subject, c.code, (msg) => console.log(msg))
    }

    const exams = parseFinalExamsFromHTML(html, c.subject, c.code)
    if (exams.length === 0) {
      if (noExamReasonsLogged < 3) {
        const reason = whyNoExams(html, c.subject, c.code)
        console.log(`no exams (${reason})`)
        noExamReasonsLogged++
      } else {
        console.log('no exams')
      }
      done.add(c.id)
      saveProgress(done)
      continue
    }

    for (const { quarter, finalExam } of exams) {
      const { error } = await supabase
        .from('courses')
        .update({ final_exam: finalExam })
        .eq('course_id', c.id)
        .eq('quarter', quarter)

      if (error) {
        console.warn(`  ${quarter} error:`, error.message)
      } else {
        updated++
      }
    }
    if (exams.length > 0) console.log(`${exams.map(e => e.quarter).join(', ')}`)
    done.add(c.id)
    saveProgress(done)
  }

  saveProgress(done)
  console.log(`\nDone. Processed ${processed} courses, updated ${updated} (course, quarter) rows.`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

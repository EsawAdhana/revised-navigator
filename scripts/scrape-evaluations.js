#!/usr/bin/env node

/**
 * Stanford Course Evaluation Scraper
 *
 * Fully headless approach — Puppeteer is used ONLY for login:
 *   - Puppeteer: login (handles Stanford 2FA/SSO), then steals session cookies
 *   - HTTP + Cheerio: search results parsing
 *   - HTTP + regex: report data extraction (no DOM construction)
 *
 * Search uses the /AppApi/Report/PublicReport pagination endpoint
 * with parallel page fetching (6 pages per batch).
 * Reports are fetched from /Reports/StudentReport.aspx via direct HTTP.
 * Connection pooling via undici (50 connections), ~20+ concurrent requests.
 *
 * Usage:
 *   node scripts/scrape-evaluations.js [--resume] [--limit N] [--course "CS 106A"]
 *
 * Options:
 *   --resume        Resume from where a previous run left off (uses progress file)
 *   --limit N       Only scrape the first N courses (useful for testing)
 *   --course X      Scrape a single course by code, e.g. "CS 106A"
 *   --find-missing  Identify which evaluations are missing (no extraction, just lists them)
 *   --retry-missing Search by individual course code to find & extract only what's missing
 *   --backfill      For courses with zero evals in Supabase, find & upload (term-based, fast). Use --resume and --limit for incremental runs.
 *   --enrich        For courses with zero evals, scrape the most recent term from EvaluationKit (typically pre-2023). Supports --resume and --limit.
 *   --concurrency N Number of parallel HTTP requests (default: 20)
 *   --workers N     Number of parallel term searches (default: 5, use 2 for resume)
 */

const puppeteer = require('puppeteer')
const cheerio = require('cheerio')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Boost connection pool for high-throughput scraping (undici ships with Node 18+)
try {
  const { Agent, setGlobalDispatcher } = require('undici')
  setGlobalDispatcher(new Agent({ connections: 50, keepAliveTimeout: 30_000, pipelining: 1 }))
} catch { /* default fetch behavior is fine */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const BASE_URL = 'https://stanford.evaluationkit.com'
const SEARCH_URL = `${BASE_URL}/Report/Public/Results`
// Note: the report popup URL uses /Reports/ (with 's'), NOT /Report/Public/
const REPORT_URL = `${BASE_URL}/Reports/StudentReport.aspx`
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'evaluations.json')
const PROGRESS_FILE = path.join(__dirname, '..', '.eval-scrape-progress.json')
const BACKFILL_PROGRESS_FILE = path.join(__dirname, '..', '.eval-backfill-progress.json')
const ENRICH_PROGRESS_FILE = path.join(__dirname, '..', '.eval-enrich-progress.json')

const REQUEST_DELAY = 100
const SEARCH_DELAY = 100
// Number of parallel report extractions (adjustable via --concurrency flag)
// HTTP fetches are lightweight, so we can safely run many more in parallel
const DEFAULT_CONCURRENCY = 20

// Academic terms to scrape (2021–2026). Backfill processes most recent first.
const RECENT_TERMS = [
  // 2025–26
  { code: 'F25', label: 'Fall 2025' },
  { code: 'W26', label: 'Winter 2026' },
  { code: 'Sp26', label: 'Spring 2026' },
  { code: 'Su26', label: 'Summer 2026' },
  { code: 'F26', label: 'Fall 2026' },
  // 2024–25
  { code: 'W25', label: 'Winter 2025' },
  { code: 'Sp25', label: 'Spring 2025' },
  { code: 'Su25', label: 'Summer 2025' },
  { code: 'F24', label: 'Fall 2024' },
  // 2023–24
  { code: 'W24', label: 'Winter 2024' },
  { code: 'Sp24', label: 'Spring 2024' },
  { code: 'Su24', label: 'Summer 2024' },
  { code: 'F23', label: 'Fall 2023' },
  // 2022–23
  { code: 'W23', label: 'Winter 2023' },
  { code: 'Sp23', label: 'Spring 2023' },
  { code: 'Su23', label: 'Summer 2023' },
  { code: 'F22', label: 'Fall 2022' },
  // 2021–22
  { code: 'W22', label: 'Winter 2022' },
  { code: 'Sp22', label: 'Spring 2022' },
  { code: 'Su22', label: 'Summer 2022' },
  { code: 'F21', label: 'Fall 2021' },
  { code: 'W21', label: 'Winter 2021' },
  { code: 'Sp21', label: 'Spring 2021' },
  { code: 'Su21', label: 'Summer 2021' },
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { resume: false, limit: null, course: null, concurrency: DEFAULT_CONCURRENCY, workers: null, findMissing: false, retryMissing: false, backfill: false, enrich: false }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--resume') opts.resume = true
    if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[i + 1], 10)
    if (args[i] === '--course' && args[i + 1]) opts.course = args[i + 1]
    if (args[i] === '--concurrency' && args[i + 1]) opts.concurrency = parseInt(args[i + 1], 10)
    if (args[i] === '--workers' && args[i + 1]) opts.workers = parseInt(args[i + 1], 10)
    if (args[i] === '--find-missing') opts.findMissing = true
    if (args[i] === '--retry-missing') opts.retryMissing = true
    if (args[i] === '--backfill') opts.backfill = true
    if (args[i] === '--enrich') opts.enrich = true
  }

  return opts
}

/**
 * Extract the last name from a full name string.
 * "Percy Liang" -> "Liang", "Mary Teruel" -> "Teruel"
 */
function getLastName(fullName) {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  return parts[parts.length - 1] || ''
}

/**
 * Check if a term string like "Fall 2023" or "Winter 2024" is recent enough.
 * Only includes Fall 2023 and later (i.e., the 2023-24 academic year onward).
 */
function isTermRecent(termString) {
  const match = termString.match(/(fall|winter|spring|summer|autumn)\s+(\d{4})/i)
  if (!match) return true // Can't parse → include to be safe
  const season = match[1].toLowerCase()
  const year = parseInt(match[2], 10)
  if (year > 2023) return true
  if (year < 2023) return false
  // year === 2023: only Fall/Autumn quarter
  return season === 'fall' || season === 'autumn'
}

/**
 * Load course codes from the quarter JSON files or courses.json.
 * Also collects instructor names for smarter search queries.
 */
function loadCourseCodes() {
  const dataDir = path.join(__dirname, '..', 'public', 'data')
  const quarterFiles = ['fall.json', 'winter.json', 'spring.json', 'summer.json']
  const seen = new Set()
  const codes = []

  function processCourses(courses) {
    for (const c of courses) {
      if (!c || !c.subject || !c.code) continue
      const key = `${c.subject} ${c.code}`
      if (!seen.has(key)) {
        seen.add(key)
        // Collect unique instructor last names for this course
        const instructorLastNames = []
        if (c.instructors && Array.isArray(c.instructors)) {
          for (const name of c.instructors) {
            const last = getLastName(name)
            if (last && !instructorLastNames.includes(last)) {
              instructorLastNames.push(last)
            }
          }
        }
        // Also collect from section meeting instructors
        if (c.sections && Array.isArray(c.sections)) {
          for (const section of c.sections) {
            if (!section.meetings) continue
            for (const meeting of section.meetings) {
              if (!meeting.instructors) continue
              for (const name of meeting.instructors) {
                const last = getLastName(name)
                if (last && !instructorLastNames.includes(last)) {
                  instructorLastNames.push(last)
                }
              }
            }
          }
        }
        codes.push({
          subject: c.subject,
          code: c.code,
          id: c.id || key,
          instructorLastNames
        })
      }
    }
  }

  for (const file of quarterFiles) {
    const filepath = path.join(dataDir, file)
    if (!fs.existsSync(filepath)) continue

    try {
      const raw = fs.readFileSync(filepath, 'utf-8')
      const data = JSON.parse(raw)
      const courses = Array.isArray(data) ? data : (data?.courses ?? [])
      processCourses(courses)
    } catch (err) {
      console.warn(`Warning: Could not parse ${file}: ${err.message}`)
    }
  }

  // Fallback to courses.json if no quarter files found
  if (codes.length === 0) {
    const fallback = path.join(dataDir, 'courses.json')
    if (fs.existsSync(fallback)) {
      console.log('Using fallback courses.json...')
      const raw = fs.readFileSync(fallback, 'utf-8')
      const data = JSON.parse(raw)
      const courses = Array.isArray(data) ? data : (data?.courses ?? [])
      processCourses(courses)
    }
  }

  return codes
}

/**
 * Load existing evaluations and progress
 */
function loadProgress() {
  const evaluations = {}
  const completed = new Set()

  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'))
      Object.assign(evaluations, data)
    } catch (err) {
      console.warn('Warning: Could not parse existing evaluations file')
    }
  }

  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'))
      if (data.completed) {
        for (const c of data.completed) completed.add(c)
      }
    } catch (err) {
      console.warn('Warning: Could not parse progress file')
    }
  }

  return { evaluations, completed }
}

/**
 * Save evaluations and progress
 */
function saveProgress(evaluations, completed) {
  // Use compact JSON for evaluations (can be 100MB+ with pretty-print)
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(evaluations))
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
    completed: Array.from(completed),
    lastUpdated: new Date().toISOString()
  }))
}

/**
 * Parse the hdnReportData JSON from a report page into our simplified format
 */
function parseReportData(rawQuestions, pageMetadata) {
  const questions = []
  let comments = []

  for (const q of rawQuestions) {
    const questionText = (q.QuestionText || '').replace(/All comments are subject to.*$/, '').trim()

    // QuestionType 1 = open-ended text, QuestionType 3 = Likert scale, QuestionType 5 = numeric entry
    if (q.QuestionType === 1) {
      // Open-ended comments
      if (q.AnswerText) {
        comments = q.AnswerText
          .split('||')
          .map(c => c.trim())
          .filter(c => c.length > 0)
      }
      continue
    }

    const options = (q.Options || [])
      .filter(o => o.OptionText !== '')
      .map(o => ({
        text: o.OptionText,
        weight: o.OptionWeight,
        count: o.Frequency,
        pct: o.Percentage
      }))

    const type = q.QuestionType === 3 ? 'rating' : 'numeric'

    questions.push({
      text: questionText,
      type,
      mean: parseFloat(q.Mean) || 0,
      median: parseFloat(q.Meadian) || 0, // Note: typo in original data ("Meadian")
      std: parseFloat(q.STD) || 0,
      responseRate: q.ResponseRate || '',
      options
    })
  }

  // Extract attendance percentages as top-level fields for easy querying
  let onlineAttendancePct = null
  let inPersonAttendancePct = null
  for (const q of questions) {
    const t = q.text.toLowerCase()
    if (t.includes('percent') && t.includes('online') && q.median > 0) {
      onlineAttendancePct = q.median
    }
    if (t.includes('percent') && t.includes('in person') && q.median > 0) {
      inPersonAttendancePct = q.median
    }
  }

  return {
    term: pageMetadata.term || '',
    instructor: pageMetadata.instructor || '',
    courseCode: pageMetadata.courseCode || '',
    respondents: pageMetadata.respondents || '',
    questions,
    comments,
    ...(onlineAttendancePct != null && { onlineAttendancePct }),
    ...(inPersonAttendancePct != null && { inPersonAttendancePct }),
  }
}

/**
 * Parse search results from an HTML string using cheerio.
 * Works for both the initial full page and the "Show More" API responses,
 * since both contain the same .sr-dataitem elements.
 */
function parseSearchResultsHTML(html) {
  const $ = cheerio.load(html)
  const results = []

  $('.sr-dataitem').each((i, item) => {
    const $item = $(item)
    const viewBtn = $item.find('.sr-view-report')
    if (!viewBtn.length) return

    const id0 = viewBtn.attr('data-id0')
    const id1 = viewBtn.attr('data-id1')
    const id2 = viewBtn.attr('data-id2')
    const id3 = viewBtn.attr('data-id3')
    if (!id0 || !id1 || !id2 || !id3) return

    let term = ''
    const termEl = $item.find('.small').first()
    if (termEl.length) {
      const lines = termEl.text().trim().split('\n').map(l => l.trim()).filter(Boolean)
      term = lines[0] || ''
    }

    results.push({
      reportUrl: `${id0},${id1},${id2},${id3}`,
      courseCode: $item.find('.sr-dataitem-info-code').text().trim(),
      title: $item.find('h2').text().trim(),
      instructor: $item.find('.sr-dataitem-info-instr').text().trim(),
      term,
      respondents: $item.find('.sr-avg .small span').first().text().trim()
    })
  })

  return results
}

/**
 * Decode HTML entities in a string (for regex-extracted attribute values).
 */
function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/**
 * Fetch a single search pagination page and parse results.
 * Retries up to 3 times with exponential backoff on server errors.
 */
async function fetchSearchPage(courseQuery, instructorQuery, page, cookieString) {
  const apiUrl = `${BASE_URL}/AppApi/Report/PublicReport?Course=${encodeURIComponent(courseQuery)}&Instructor=${encodeURIComponent(instructorQuery)}&Search=true&page=${page}&_=${Date.now()}`

  let response
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(apiUrl, {
      headers: { ...getHTTPHeaders(cookieString), 'X-Requested-With': 'XMLHttpRequest', 'Accept': '*/*' }
    })
    if (response.ok) break
    await sleep(1000 * Math.pow(2, attempt))
  }

  if (!response.ok) return { page, reports: [], hasMore: false, failed: true }

  const rawData = await response.text()
  let reports = []
  let hasMore = true

  try {
    const json = JSON.parse(rawData)
    if (json.results && Array.isArray(json.results)) {
      reports = parseSearchResultsHTML(json.results.join(''))
      if (json.hasMore === false) hasMore = false
    } else if (typeof json === 'string') {
      reports = parseSearchResultsHTML(json)
    } else {
      reports = parseSearchResultsHTML(rawData)
    }
  } catch {
    reports = parseSearchResultsHTML(rawData)
  }

  return { page, reports, hasMore }
}

/**
 * Search for courses via HTTP. Page 1 is a full HTML fetch;
 * pages 2+ are fetched in parallel batches of PAGE_BATCH for 3-5x speedup.
 */
async function searchCourseHTTP(courseQuery, cookieString, instructorQuery = '', quiet = false) {
  const allReports = []

  const searchUrl = `${SEARCH_URL}?Course=${encodeURIComponent(courseQuery)}&Instructor=${encodeURIComponent(instructorQuery)}&Search=true`

  const initialResponse = await fetch(searchUrl, {
    headers: getHTTPHeaders(cookieString)
  })

  if (!initialResponse.ok) {
    if (!quiet) console.warn(`  Search returned HTTP ${initialResponse.status}`)
    return []
  }

  const initialHTML = await initialResponse.text()
  const firstBatch = parseSearchResultsHTML(initialHTML)
  allReports.push(...firstBatch)
  if (!quiet) console.log(`    Page 1: ${firstBatch.length} results`)

  if (firstBatch.length === 0) return allReports

  // Parallel pagination: fetch pages in batches of PAGE_BATCH
  const PAGE_BATCH = 6
  let startPage = 2
  let done = false

  while (!done) {
    const pages = Array.from({ length: PAGE_BATCH }, (_, i) => startPage + i)
    const pageResults = await Promise.all(
      pages.map(p => fetchSearchPage(courseQuery, instructorQuery, p, cookieString))
    )

    let batchHadResults = false
    for (const result of pageResults.sort((a, b) => a.page - b.page)) {
      if (result.failed) { done = true; break }
      if (result.reports.length > 0) {
        allReports.push(...result.reports)
        batchHadResults = true
      }
      if (!result.hasMore) { done = true; break }
    }

    if (!batchHadResults) done = true

    startPage += PAGE_BATCH
    if (!quiet && (startPage - 2) % 30 === 0) {
      console.log(`    Page ${startPage - 1}: ${allReports.length} total results so far`)
    }
  }

  return allReports
}

/**
 * Extract cookies from a Puppeteer page as a "Cookie: ..." header string.
 * All browser pages share the same cookie jar, so any page works.
 */
async function getCookieString(page) {
  const cookies = await page.cookies()
  return cookies.map(c => `${c.name}=${c.value}`).join('; ')
}

/**
 * HTTP headers for headless fetch requests.
 * Uses the session cookies extracted from Puppeteer after login.
 */
function getHTTPHeaders(cookieString) {
  return {
    'Cookie': cookieString,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  }
}

/**
 * Fetch a single report page via HTTP and extract the hdnReportData JSON.
 * ~10-100x faster than opening a browser popup since no rendering is needed.
 * The report URL pattern is: /Reports/StudentReport.aspx?id={id0},{id1},{id2},{id3}
 */
async function fetchReportHTTP(reportIdString, cookieString, metadata) {
  const url = `${REPORT_URL}?id=${reportIdString}`

  try {
    // Retry up to 2 times on server errors (500s from rate limiting)
    let response
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(url, {
        headers: getHTTPHeaders(cookieString),
        redirect: 'follow'
      })

      if (response.ok || response.status < 500) break
      // Server error — back off and retry
      await sleep(1000 * (attempt + 1))
    }

    if (!response.ok) {
      console.warn(`  HTTP ${response.status} for ${metadata.courseCode}`)
      return null
    }

    const html = await response.text()

    // Regex extraction: ~10-50x faster than constructing a Cheerio DOM
    const match = html.match(/id="hdnReportData"[^>]*\bvalue="([^"]*)"/)
    if (!match || match[1].length < 10) {
      console.warn(`  hdnReportData empty for ${metadata.courseCode}`)
      return null
    }

    const reportDataRaw = decodeHtmlEntities(match[1])
    const rawQuestions = JSON.parse(reportDataRaw)
    return parseReportData(rawQuestions, metadata)
  } catch (err) {
    console.warn(`  Failed HTTP fetch for ${metadata.courseCode}: ${err.message}`)
    return null
  }
}

/**
 * Extract evaluations from a batch of reports using direct HTTP requests.
 * All requests in the batch run fully in parallel — no browser rendering overhead.
 * This is the key speedup: 20+ lightweight text fetches vs 3-5 heavy browser popups.
 */
async function extractBatchViaHTTP(batch, cookieString) {
  const results = await Promise.all(
    batch.map(async (report) => {
      const { reportUrl, courseCode, instructor, term, respondents } = report
      const metadata = { courseCode, instructor, term, respondents }

      const evalData = await fetchReportHTTP(reportUrl, cookieString, metadata)
      return { report, evalData }
    })
  )

  return results
}

/**
 * Match a search result's course code to our course list.
 * Returns the course key if matched, or null.
 * Course codes can be cross-listed: "F24-CS-106A-01/F24-SYMSYS-106A-01"
 */
function matchResultToCourse(result, termCode, courseLookup) {
  const codeSegments = result.courseCode.split('/')
  for (const segment of codeSegments) {
    const parts = segment.trim().split('-')
    if (parts.length < 3) continue

    // Verify the term code matches what we searched for
    if (parts[0] !== termCode) continue

    // parts[1] = subject, parts[2] = course number
    const lookupKey = `${parts[1]}-${parts[2]}`
    if (courseLookup.has(lookupKey)) {
      return courseLookup.get(lookupKey)
    }
  }
  return null
}

/**
 * Convert a term string like "Fall 2022" or "Winter 2019" to a numeric sort key.
 * Higher = more recent. Returns -Infinity for unparseable strings.
 */
function termToSortKey(termString) {
  if (!termString) return -Infinity
  const match = termString.match(/(fall|autumn|winter|spring|summer)\s+(\d{4})/i)
  if (!match) return -Infinity
  const season = match[1].toLowerCase()
  const year = parseInt(match[2], 10)
  const weights = { winter: 1, spring: 2, summer: 3, fall: 4, autumn: 4 }
  return year * 10 + (weights[season] ?? 0)
}

/**
 * Given a list of search results (each with a `term` field), return only those
 * belonging to the single most recent term found in the list.
 */
function mostRecentTermGroup(results) {
  if (results.length === 0) return []
  let bestKey = -Infinity
  let bestTerm = null
  for (const r of results) {
    const key = termToSortKey(r.term)
    if (key > bestKey) {
      bestKey = key
      bestTerm = r.term
    }
  }
  if (bestTerm === null) return results // unparseable terms — return all
  return results.filter(r => r.term === bestTerm)
}

/**
 * Load backfill progress for --resume.
 * Returns { completedCourseIds: Set }.
 */
function loadBackfillProgress() {
  const completedCourseIds = new Set()
  if (fs.existsSync(BACKFILL_PROGRESS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(BACKFILL_PROGRESS_FILE, 'utf-8'))
      if (data.completedCourseIds) {
        for (const id of data.completedCourseIds) completedCourseIds.add(id)
      }
    } catch (err) {
      console.warn('Warning: Could not parse backfill progress file')
    }
  }
  return { completedCourseIds }
}

/**
 * Save backfill progress (completed course IDs).
 */
function saveBackfillProgress(completedCourseIds) {
  fs.writeFileSync(BACKFILL_PROGRESS_FILE, JSON.stringify({
    completedCourseIds: Array.from(completedCourseIds),
    lastUpdated: new Date().toISOString()
  }))
}

/**
 * Backfill mode: per-course search. For each course with zero evals in Supabase,
 * search EvaluationKit by course code (e.g. "CS 106A"), take only the most recent
 * term's evaluations (1 quarter), extract and insert. Insert as we go. Supports
 * --resume and --limit for incremental runs.
 */
async function runBackfill(cookieString, concurrency, opts) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Backfill requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    console.error('Run with: node --env-file=.env.local scripts/scrape-evaluations.js --backfill')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  console.log('\n=== BACKFILL MODE (per-course) ===')
  console.log('Querying Supabase for courses with zero evaluations...')

  // Collect all course_ids that already have evaluations
  const evCourseIds = new Set()
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase.from('evaluations').select('course_id').range(offset, offset + PAGE - 1)
    if (error) throw new Error(`Supabase evaluations query: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data) evCourseIds.add(r.course_id)
    if (data.length < PAGE) break
    offset += PAGE
  }

  // Collect all courses and deduplicate by course_id (courses table has one row per quarter)
  const allCoursesRaw = []
  offset = 0
  while (true) {
    const { data, error } = await supabase.from('courses').select('course_id, subject, code').range(offset, offset + PAGE - 1)
    if (error) throw new Error(`Supabase courses query: ${error.message}`)
    if (!data || data.length === 0) break
    allCoursesRaw.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  const missingByCourseId = new Map()
  for (const c of allCoursesRaw) {
    if (evCourseIds.has(c.course_id)) continue
    if (!missingByCourseId.has(c.course_id)) {
      missingByCourseId.set(c.course_id, c)
    }
  }
  let missing = Array.from(missingByCourseId.values())

  // Apply resume: skip already-completed
  const { completedCourseIds } = opts.resume ? loadBackfillProgress() : { completedCourseIds: new Set() }
  if (opts.resume && completedCourseIds.size > 0) {
    missing = missing.filter(c => !completedCourseIds.has(c.course_id))
    console.log(`Resuming: ${completedCourseIds.size} already backfilled, ${missing.length} remaining`)
  }

  // Apply limit
  if (opts.limit && opts.limit > 0) {
    missing = missing.slice(0, opts.limit)
    console.log(`Limit: processing at most ${opts.limit} courses this run`)
  }

  const totalMissing = missingByCourseId.size
  console.log(`${allCoursesRaw.length} total course rows | ${evCourseIds.size} with evaluations | ${totalMissing} to backfill | processing ${missing.length}`)
  console.log('Strategy: search each missing course by code → take latest term only → insert as we go\n')

  if (missing.length === 0) {
    console.log('Nothing to backfill — all target courses already have evaluation data!')
    return
  }

  let backfilled = 0
  let notFound = 0
  let errors = 0

  const BATCH = Math.min(concurrency, 15)
  const keepAliveTimer = setInterval(() => {
    fetch(`${BASE_URL}/Report/Public`, { headers: getHTTPHeaders(cookieString) }).catch(() => {})
  }, 3 * 60 * 1000)

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, Math.min(i + BATCH, missing.length))
    const allRows = []
    const batchCourseIds = []

    await Promise.all(batch.map(async (course) => {
      const subj = (course.subject || '').replace(/\s+/g, '')
      const code = (course.code || '').replace(/\s+/g, '')
      const searchQuery = `${subj} ${code}`

      const results = await searchCourseHTTP(searchQuery, cookieString)

      const matching = results.filter((r) => {
        for (const seg of r.courseCode.split('/')) {
          const parts = seg.trim().split('-')
          if (parts.length >= 3 && parts[1] === subj && parts[2] === code) return true
        }
        return false
      })

      if (matching.length === 0) {
        notFound++
        return
      }

      const toExtract = mostRecentTermGroup(matching)
      const extracted = await extractBatchViaHTTP(toExtract, cookieString)

      let courseHasData = false
      for (const { evalData } of extracted) {
        if (evalData) {
          allRows.push({
            course_id: course.course_id,
            term: evalData.term,
            instructor: evalData.instructor,
            course_code: evalData.courseCode,
            respondents: evalData.respondents,
            questions: evalData.questions,
            comments: evalData.comments,
          })
          courseHasData = true
        }
      }

      if (courseHasData) {
        batchCourseIds.push({ id: course.course_id, count: extracted.filter(e => e.evalData).length, term: toExtract[0]?.term })
      } else {
        notFound++
      }
    }))

    // Single bulk insert for the entire batch — reduces Supabase round-trips
    if (allRows.length > 0) {
      const { error } = await supabase.from('evaluations').insert(allRows)
      if (error) {
        errors += batchCourseIds.length
        console.error(`\n  ❌ Batch insert failed (${allRows.length} rows): ${error.message}`)
      } else {
        for (const c of batchCourseIds) {
          completedCourseIds.add(c.id)
          backfilled++
          console.log(`  ✅ ${c.id}: ${c.count} eval(s) from ${c.term}`)
        }
      }
    }

    saveBackfillProgress(completedCourseIds)

    const done = Math.min(i + BATCH, missing.length)
    process.stdout.write(`\r[${done}/${missing.length}] backfilled: ${backfilled} | not found: ${notFound} | errors: ${errors}  `)
    await sleep(100)
  }

  clearInterval(keepAliveTimer)

  console.log(`\n\nBackfill complete!`)
  console.log(`  Courses backfilled: ${backfilled}`)
  console.log(`  Not found on EvaluationKit: ${notFound}`)
  console.log(`  Errors: ${errors}`)
}

/**
 * Enrich mode: find courses that have zero evaluations in Supabase, search
 * each on EvaluationKit, and insert the most recent term's evaluation.
 *
 * Since the main scraper already covers Fall 2023+, these will typically be
 * pre-2023 evaluations. Attendance data is included automatically because
 * parseReportData captures all question types.
 *
 * Supports --resume and --limit.
 */
async function runEnrich(cookieString, concurrency, opts) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Enrich requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    console.error('Run with: node --env-file=.env.local scripts/scrape-evaluations.js --enrich')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  console.log('\n=== ENRICH MODE (pre-2023 backfill for courses with zero evals) ===')
  console.log('Loading courses and evaluations from Supabase...')

  // ── 1. Load all courses (deduplicate by course_id) ──
  const allCoursesRaw = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase.from('courses').select('course_id, subject, code').range(offset, offset + PAGE - 1)
    if (error) throw new Error(`courses query: ${error.message}`)
    if (!data || data.length === 0) break
    allCoursesRaw.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  const courseMap = new Map()
  for (const c of allCoursesRaw) {
    if (!courseMap.has(c.course_id)) courseMap.set(c.course_id, c)
  }
  const allCourses = Array.from(courseMap.values())

  // ── 2. Collect course_ids that already have any evaluation ──
  const evalCourseIds = new Set()
  offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('evaluations')
      .select('course_id')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`evaluations query: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) evalCourseIds.add(row.course_id)
    if (data.length < PAGE) break
    offset += PAGE
  }

  // ── 3. Build work list: courses with zero evals ──
  let toProcess = allCourses.filter(c => !evalCourseIds.has(c.course_id))

  // Resume support
  const completedIds = new Set()
  if (opts.resume && fs.existsSync(ENRICH_PROGRESS_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(ENRICH_PROGRESS_FILE, 'utf-8'))
      if (saved.completedIds) for (const id of saved.completedIds) completedIds.add(id)
    } catch { /* ignore */ }
    toProcess = toProcess.filter(c => !completedIds.has(c.course_id))
    console.log(`Resuming: ${completedIds.size} already processed`)
  }

  if (opts.limit && opts.limit > 0) {
    toProcess = toProcess.slice(0, opts.limit)
  }

  console.log(`Total courses: ${allCourses.length}`)
  console.log(`Already have evaluations: ${evalCourseIds.size} (skipped)`)
  console.log(`Missing evaluations: ${allCourses.length - evalCourseIds.size}`)
  console.log(`Processing ${toProcess.length} courses this run\n`)

  if (toProcess.length === 0) {
    console.log('Nothing to enrich — all courses already have evaluation data!')
    return
  }

  let inserted = 0
  let notFound = 0
  let errors = 0

  // Enrich searches are lightweight (most return 0 results), so allow larger batches
  const BATCH = concurrency
  const keepAliveTimer = setInterval(() => {
    fetch(`${BASE_URL}/Report/Public`, { headers: getHTTPHeaders(cookieString) }).catch(() => {})
  }, 3 * 60 * 1000)

  for (let i = 0; i < toProcess.length; i += BATCH) {
    const batch = toProcess.slice(i, Math.min(i + BATCH, toProcess.length))
    const insertRows = []
    const insertCourseInfo = []

    await Promise.all(batch.map(async (course) => {
      const subj = (course.subject || '').replace(/\s+/g, '')
      const code = (course.code || '').replace(/\s+/g, '')
      const searchQuery = `${subj} ${code}`

      const results = await searchCourseHTTP(searchQuery, cookieString, '', true)

      const matching = results.filter((r) => {
        for (const seg of r.courseCode.split('/')) {
          const parts = seg.trim().split('-')
          if (parts.length >= 3 && parts[1] === subj && parts[2] === code) return true
        }
        return false
      })

      if (matching.length === 0) {
        notFound++
        completedIds.add(course.course_id)
        return
      }

      // Take only the most recent term's evaluations
      const toExtract = mostRecentTermGroup(matching)
      const extracted = await extractBatchViaHTTP(toExtract, cookieString)

      let courseRowCount = 0
      for (const { evalData } of extracted) {
        if (evalData) {
          insertRows.push({
            course_id: course.course_id,
            term: evalData.term,
            instructor: evalData.instructor,
            course_code: evalData.courseCode,
            respondents: evalData.respondents,
            questions: evalData.questions,
            comments: evalData.comments,
          })
          courseRowCount++
        }
      }

      if (courseRowCount > 0) {
        insertCourseInfo.push({ id: course.course_id, count: courseRowCount, term: toExtract[0]?.term })
      } else {
        notFound++
      }
      completedIds.add(course.course_id)
    }))

    // Bulk insert
    if (insertRows.length > 0) {
      const { error } = await supabase.from('evaluations').insert(insertRows)
      if (error) {
        errors++
        console.error(`\n  ❌ Batch insert failed (${insertRows.length} rows): ${error.message}`)
      } else {
        for (const c of insertCourseInfo) {
          inserted++
          console.log(`  ✅ ${c.id}: ${c.count} eval(s) from ${c.term}`)
        }
      }
    }

    // Save progress
    fs.writeFileSync(ENRICH_PROGRESS_FILE, JSON.stringify({
      completedIds: Array.from(completedIds),
      lastUpdated: new Date().toISOString()
    }))

    const done = Math.min(i + BATCH, toProcess.length)
    process.stdout.write(`\r[${done}/${toProcess.length}] inserted: ${inserted} | not found: ${notFound} | errors: ${errors}  `)
    await sleep(100)
  }

  clearInterval(keepAliveTimer)

  console.log(`\n\nEnrich complete!`)
  console.log(`  Courses with new evals: ${inserted}`)
  console.log(`  Not found on EvaluationKit: ${notFound}`)
  console.log(`  Errors: ${errors}`)
}

/**
 * Main scraping function
 */
async function main() {
  const opts = parseArgs()
  const { resume, limit, course: singleCourse } = opts

  console.log('Stanford Course Evaluation Scraper')
  console.log('==================================')
  console.log('Strategy: fully headless HTTP (Puppeteer for login only)')

  // Load course codes
  let courseCodes
  if (singleCourse) {
    const [subject, ...codeParts] = singleCourse.split(' ')
    courseCodes = [{ subject, code: codeParts.join(' '), id: singleCourse, instructorLastNames: [] }]
    console.log(`Filtering for single course: ${singleCourse}`)
  } else {
    courseCodes = loadCourseCodes()
    console.log(`Loaded ${courseCodes.length} unique courses to match against`)
  }

  // Build a fast lookup: "CS-106A" -> course key (e.g., "CS 106A")
  const courseLookup = new Map()
  for (const c of courseCodes) {
    const subjectClean = c.subject.replace(/\s+/g, '')
    const codeClean = c.code.replace(/\s+/g, '')
    const key = `${subjectClean}-${codeClean}`
    if (!courseLookup.has(key)) {
      courseLookup.set(key, c.id || `${c.subject} ${c.code}`)
    }
  }

  // Load progress
  let evaluations = {}
  let completed = new Set()
  if (resume || opts.findMissing || opts.retryMissing) {
    const progress = loadProgress()
    evaluations = progress.evaluations
    completed = progress.completed
    console.log(`Resuming: ${completed.size} reports already scraped`)
  }

  // --find-missing / --retry-missing: find courses with ZERO evaluations in evaluations.json.
  // These are courses in our data files that we never successfully extracted data for.
  // (Courses only offered in some terms are NOT counted as "missing" for other terms.)
  let missingCourseList = null
  if (opts.findMissing || opts.retryMissing) {
    const evalsKeys = new Set(Object.keys(evaluations))
    missingCourseList = []

    for (const course of courseCodes) {
      const courseKey = course.id || `${course.subject} ${course.code}`
      if (!evalsKeys.has(courseKey)) {
        missingCourseList.push({
          courseKey,
          subject: course.subject.replace(/\s+/g, ''),
          code: course.code.replace(/\s+/g, '')
        })
      }
    }

    const withEvals = evalsKeys.size
    const total = courseCodes.length
    console.log(`\nCourses in data files: ${total}`)
    console.log(`Courses with evaluations: ${withEvals}`)
    console.log(`Courses with ZERO evaluations: ${missingCourseList.length}`)

    if (opts.findMissing) {
      // Just list them and exit — no browser needed
      console.log(`\nThese courses have no evaluation data at all:`)
      for (const m of missingCourseList) {
        console.log(`  ${m.courseKey}`)
      }
      console.log(`\nMany of these may simply not exist on EvaluationKit.`)
      console.log(`To search & extract any that do exist, run: npm run scrape:evals:retry`)
      return
    }
  }

  // Launch browser
  console.log('\nLaunching browser for login...')
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const page = await browser.newPage()

  // Navigate to the public report page for login
  await page.goto(`${BASE_URL}/Report/Public`, { waitUntil: 'networkidle2' })

  console.log('\n========================================')
  console.log('Please log in to EvaluationKit in the browser.')
  console.log('Once you are on the Student Reporting search page,')
  console.log('press ENTER in this terminal to continue...')
  console.log('========================================\n')

  // Wait for user to press Enter after logging in
  await new Promise(resolve => {
    process.stdin.once('data', () => resolve())
  })

  // Extract session cookies from the browser for HTTP requests.
  // This is the key to the speed optimization: all report fetches use lightweight
  // HTTP requests with these cookies instead of opening heavy browser popups.
  const cookieString = await getCookieString(page)
  console.log(`Extracted ${cookieString.split(';').length} session cookies for HTTP extraction`)

  const { concurrency } = opts

  // === BACKFILL MODE ===
  if (opts.backfill) {
    await runBackfill(cookieString, concurrency, opts)
    await browser.close()
    return
  }

  // === ENRICH MODE ===
  if (opts.enrich) {
    await runEnrich(cookieString, concurrency, opts)
    await browser.close()
    return
  }

  // === RETRY-MISSING MODE ===
  // Search for each course that has 0 evaluations, by course code (e.g., "CS 106A").
  // Each search returns a small set of results (all terms), no pagination needed.
  // This is much faster than re-searching all 9 terms with thousands of results each.
  if (opts.retryMissing && missingCourseList) {
    console.log(`\nRetry-missing: searching ${missingCourseList.length} courses directly by code...`)
    let retryExtracted = 0
    let retrySkipped = 0
    let retryNoResults = 0

    // Process courses in batches
    const BATCH = concurrency || 5

    for (let i = 0; i < missingCourseList.length; i += BATCH) {
      const batch = missingCourseList.slice(i, Math.min(i + BATCH, missingCourseList.length))

      await Promise.all(batch.map(async (info) => {
        // Search by subject + code (e.g., "CS 106A") — returns results across all terms
        const searchQuery = `${info.subject} ${info.code}`
        const results = await searchCourseHTTP(searchQuery, cookieString)

        // Filter to results that match our course and aren't already completed
        const toExtract = []
        for (const result of results) {
          if (completed.has(result.courseCode)) continue

          // Verify this result actually matches our course (not a substring match)
          const segments = result.courseCode.split('/')
          let matchedKey = null
          for (const seg of segments) {
            const parts = seg.trim().split('-')
            if (parts.length < 3) continue
            const lookupKey = `${parts[1]}-${parts[2]}`
            if (courseLookup.has(lookupKey)) {
              matchedKey = courseLookup.get(lookupKey)
              break
            }
          }
          if (matchedKey === info.courseKey) {
            toExtract.push({ ...result, _courseKey: matchedKey })
          }
        }

        if (toExtract.length === 0) {
          retryNoResults++
          return
        }

        // Extract each matched result
        const batchResults = await extractBatchViaHTTP(toExtract, cookieString)
        for (const { report, evalData } of batchResults) {
          if (evalData) {
            if (!evaluations[report._courseKey]) evaluations[report._courseKey] = []
            evaluations[report._courseKey].push(evalData)
            completed.add(report.courseCode)
            retryExtracted++
            console.log(`  OK: ${report.courseCode} - ${report.instructor} [${report._courseKey}]`)
          } else {
            retrySkipped++
            console.log(`  SKIP: ${report.courseCode} (no data on server)`)
          }
        }
      }))

      // Save after each batch
      saveProgress(evaluations, completed)

      // Progress log
      const done = Math.min(i + BATCH, missingCourseList.length)
      if (done % 50 === 0 || done === missingCourseList.length) {
        console.log(`  Progress: ${done}/${missingCourseList.length} courses searched`)
      }
    }

    const coursesWithEvals = Object.keys(evaluations).length
    console.log('\n==================================')
    console.log('Retry-missing complete!')
    console.log(`  Courses searched: ${missingCourseList.length}`)
    console.log(`  Not on EvaluationKit: ${retryNoResults}`)
    console.log(`  New evaluations extracted: ${retryExtracted}`)
    console.log(`  Skipped (empty data): ${retrySkipped}`)
    console.log(`  Total courses with evaluations: ${coursesWithEvals}`)
    console.log('==================================')
    await browser.close()
    return
  }

  // Number of terms to process in parallel (all HTTP now, no browser pages needed)
  const termWorkers = singleCourse ? 1 : (opts.workers || Math.min(5, RECENT_TERMS.length))

  console.log(`Extraction concurrency: ${concurrency} parallel HTTP requests`)
  console.log(`Term workers: ${termWorkers} parallel HTTP searches`)
  console.log('\nStarting scrape...\n')

  let totalExtracted = 0
  let totalMatched = 0
  let errors = 0

  // Keep-alive: periodically ping the site to prevent session expiry.
  // Uses a lightweight HTTP request instead of a full browser page.
  const KEEP_ALIVE_INTERVAL = 3 * 60 * 1000 // every 3 minutes
  const keepAliveTimer = setInterval(async () => {
    try {
      await fetch(`${BASE_URL}/Report/Public`, {
        headers: getHTTPHeaders(cookieString)
      })
    } catch {
      // Silently ignore — session may already be refreshed by active scraping
    }
  }, KEEP_ALIVE_INTERVAL)
  console.log('Session keep-alive started (HTTP ping every 3 minutes)')

  // Work queue of terms
  const termQueue = [...RECENT_TERMS]

  /**
   * Process a single term: search for results, match to course list,
   * then extract evaluations in parallel batches.
   */
  async function processTerm(term) {
    const prefix = `[${term.code}]`

    let searchQuery
    if (singleCourse) {
      const [subject, ...codeParts] = singleCourse.split(' ')
      searchQuery = `${term.code}-${subject}-${codeParts.join('')}`
    } else {
      searchQuery = term.code
    }

    console.log(`  ${prefix} Searching: "${searchQuery}"`)

    // Search entirely via HTTP (no browser needed)
    const allResults = await searchCourseHTTP(searchQuery, cookieString)
    console.log(`  ${prefix} Found ${allResults.length} total results`)

    if (allResults.length === 0) return

    // Collect matching results (fast, in-memory filtering)
    const matchedResults = []
    for (const result of allResults) {
      if (completed.has(result.courseCode)) continue
      const courseKey = matchResultToCourse(result, term.code, courseLookup)
      if (!courseKey) continue
      matchedResults.push({ ...result, _courseKey: courseKey })
    }

    if (matchedResults.length === 0) {
      console.log(`  ${prefix} No new evaluations to extract`)
      return
    }

    console.log(`  ${prefix} Extracting ${matchedResults.length} evaluations (${concurrency} at a time)...`)

    // Extract in parallel batches via HTTP requests:
    // Each batch fires N lightweight HTTP fetches simultaneously — no browser rendering
    for (let i = 0; i < matchedResults.length; i += concurrency) {
      if (limit && totalExtracted >= limit) break
      const batch = matchedResults.slice(i, Math.min(i + concurrency, matchedResults.length))

      const batchResults = await extractBatchViaHTTP(batch, cookieString)

      for (const { report, evalData } of batchResults) {
        if (evalData) {
          if (!evaluations[report._courseKey]) evaluations[report._courseKey] = []
          evaluations[report._courseKey].push(evalData)
          totalExtracted++
          completed.add(report.courseCode)
          console.log(`  ${prefix} OK: ${report.courseCode} - ${report.instructor}`)
        } else {
          // Don't add to completed — allows retry on --resume
          console.log(`  ${prefix} SKIP: ${report.courseCode} - ${report.instructor} (no data, will retry)`)
        }
      }

      // Save progress every 5th batch (balances crash safety vs I/O overhead on large files)
      const batchNum = Math.floor(i / concurrency)
      if (batchNum % 5 === 0 || i + concurrency >= matchedResults.length) {
        saveProgress(evaluations, completed)
      }

      // Brief delay between batches to avoid overwhelming the server
      if (i + concurrency < matchedResults.length) {
        await sleep(REQUEST_DELAY)
      }
    }

    totalMatched += matchedResults.length
    console.log(`  ${prefix} Done: ${matchedResults.length} matched [${completed.size} total, ${totalExtracted} extracted]`)
  }

  /**
   * Term worker: pulls terms from the shared queue and processes them.
   * Multiple workers run in parallel — all use HTTP, no browser pages needed.
   */
  async function termWorker(workerId) {
    while (termQueue.length > 0) {
      if (limit && totalExtracted >= limit) break
      const term = termQueue.shift()
      if (!term) break

      console.log(`\n=== ${term.label} (${term.code}) [Worker ${workerId + 1}] ===`)
      try {
        await processTerm(term)
        await sleep(SEARCH_DELAY)
      } catch (err) {
        errors++
        console.error(`  [${term.code}] Error: ${err.message}`)

        // If we get an HTTP error, the session may have expired
        if (err.message.includes('401') || err.message.includes('403') || err.message.includes('fetch')) {
          console.log('\n  Session may have expired. Please log in again in the browser,')
          console.log('  then press ENTER to re-extract cookies and continue...\n')
          await new Promise(resolve => {
            process.stdin.once('data', () => resolve())
          })
          // Note: cookieString won't update here since it's const.
          // User should restart with --resume for a fresh session.
        }
      }
    }
  }

  // Run term workers in parallel
  await Promise.all(
    Array.from({ length: termWorkers }, (_, i) => termWorker(i))
  )

  // Clean up keep-alive
  clearInterval(keepAliveTimer)

  // Final save
  saveProgress(evaluations, completed)

  const coursesWithEvals = Object.keys(evaluations).length

  console.log('\n==================================')
  console.log('Scraping complete!')
  console.log(`  Terms searched: ${RECENT_TERMS.length}`)
  console.log(`  Evaluations matched: ${totalMatched}`)
  console.log(`  Evaluations extracted: ${totalExtracted}`)
  console.log(`  Courses with evaluations: ${coursesWithEvals}`)
  console.log(`  Errors: ${errors}`)
  console.log(`  Output: ${OUTPUT_FILE}`)
  console.log('==================================')

  await browser.close()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

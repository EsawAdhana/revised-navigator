#!/usr/bin/env node

/**
 * Fetch Stanford EvaluationKit reports with one manual SSO login, then direct HTTP.
 *
 * Usage:
 *   node --env-file=.env.local scripts/scrape-evaluations.mjs --dry-run
 *   node --env-file=.env.local scripts/scrape-evaluations.mjs
 *   node --env-file=.env.local scripts/scrape-evaluations.mjs --terms W26,Sp26,Su26
 *   node --env-file=.env.local scripts/scrape-evaluations.mjs --course CS106B --dry-run
 */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://stanford.evaluationkit.com'
const SEARCH_URL = `${BASE_URL}/Report/Public/Results`
const REPORT_URL = `${BASE_URL}/Reports/StudentReport.aspx`
const PROFILE_DIR = '.evaluationkit-profile'
const DEFAULT_TERMS = ['W26', 'Sp26', 'Su26']
const TERM_LABELS = {
    W26: 'Winter 2026',
    Sp26: 'Spring 2026',
    Su26: 'Summer 2026',
}

function parseArgs() {
    const args = process.argv.slice(2)
    const opts = { dryRun: false, concurrency: 20, terms: DEFAULT_TERMS, course: null, metrics: true, force: false, repairEmpty: false }
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--dry-run') opts.dryRun = true
        if (args[i] === '--no-metrics') opts.metrics = false
        if (args[i] === '--force') opts.force = true
        if (args[i] === '--repair-empty') opts.repairEmpty = true
        if (args[i] === '--course' && args[i + 1]) opts.course = args[++i].replace(/\s+/g, '').toUpperCase()
        if (args[i] === '--concurrency' && args[i + 1]) opts.concurrency = Math.max(1, Math.min(30, Number(args[++i]) || 20))
        if (args[i] === '--terms' && args[i + 1]) opts.terms = args[++i].split(',').map(term => term.trim()).filter(Boolean)
    }
    for (const term of opts.terms) {
        if (!TERM_LABELS[term]) throw new Error(`Unsupported term ${term}. Supported: ${Object.keys(TERM_LABELS).join(', ')}`)
    }
    return opts
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function decodeHtml(text = '') {
    return text
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;|&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
        .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
}

function stripHtml(html = '') {
    return decodeHtml(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function attribute(html, name) {
    return decodeHtml(html.match(new RegExp(`\\b${name}=(?:\"([^\"]*)\"|'([^']*)')`, 'i'))?.slice(1).find(Boolean) || '')
}

function textByClass(html, className) {
    const pattern = new RegExp(
        `<([a-z0-9]+)[^>]*class=(?:\"[^\"]*\\b${className}\\b[^\"]*\"|'[^']*\\b${className}\\b[^']*')[^>]*>([\\s\\S]*?)<\\/\\1>`,
        'i'
    )
    return stripHtml(html.match(pattern)?.[2] || '')
}

function parseSearchResults(html) {
    const starts = [...html.matchAll(/<[^>]+\bclass=(?:"[^"]*"|'[^']*')[^>]*>/gi)]
        .filter(match => attribute(match[0], 'class').split(/\s+/).includes('sr-dataitem'))
    const reports = []
    for (let i = 0; i < starts.length; i++) {
        const start = starts[i].index
        const end = starts[i + 1]?.index ?? html.length
        const item = html.slice(start, end)
        const button = item.match(/<[^>]+class=(?:"[^"]*\bsr-view-report\b[^"]*"|'[^']*\bsr-view-report\b[^']*')[^>]*>/i)?.[0]
        if (!button) continue
        const ids = ['data-id0', 'data-id1', 'data-id2', 'data-id3'].map(name => attribute(button, name))
        if (ids.some(id => !id)) continue
        reports.push({
            reportUrl: ids.join(','),
            courseCode: textByClass(item, 'sr-dataitem-info-code'),
            instructor: textByClass(item, 'sr-dataitem-info-instr'),
            respondents: textByClass(item, 'sr-avg'),
        })
    }
    return reports
}

function requestHeaders(cookie) {
    return {
        Cookie: cookie,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }
}

async function authenticatedFetch(url, cookie, extraHeaders = {}) {
    let lastError
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { ...requestHeaders(cookie), ...extraHeaders },
                redirect: 'follow',
                signal: AbortSignal.timeout(30000),
            })
            if (response.url.includes('login.stanford.edu') || response.status === 401 || response.status === 403) {
                throw new Error('EvaluationKit session expired. Rerun and sign in again.')
            }
            if (response.ok) return response
            if (response.status < 500) throw new Error(`HTTP ${response.status} for ${url}`)
            lastError = new Error(`HTTP ${response.status} for ${url}`)
        } catch (error) {
            lastError = error
            if (String(error?.message).includes('session expired')) throw error
        }
        await sleep(attempt * 1000)
    }
    throw lastError
}

async function fetchSearchPage(termCode, page, cookie) {
    const params = new URLSearchParams({
        Course: termCode,
        Instructor: '',
        Search: 'true',
        page: String(page),
        _: String(Date.now()),
    })
    const response = await authenticatedFetch(
        `${BASE_URL}/AppApi/Report/PublicReport?${params}`,
        cookie,
        { 'X-Requested-With': 'XMLHttpRequest', Accept: '*/*' }
    )
    const text = await response.text()
    try {
        const json = JSON.parse(text)
        const html = Array.isArray(json.results) ? json.results.join('') : typeof json === 'string' ? json : text
        return { reports: parseSearchResults(html), hasMore: json.hasMore !== false }
    } catch {
        return { reports: parseSearchResults(text), hasMore: false }
    }
}

async function searchTerm(termCode, cookie) {
    const params = new URLSearchParams({ Course: termCode, Instructor: '', Search: 'true' })
    const first = await authenticatedFetch(`${SEARCH_URL}?${params}`, cookie)
    const reports = parseSearchResults(await first.text())
    if (reports.length === 0) return reports

    for (let start = 2; ; start += 6) {
        const pages = await Promise.all(
            Array.from({ length: 6 }, (_, offset) => fetchSearchPage(termCode, start + offset, cookie))
        )
        for (const page of pages) reports.push(...page.reports)
        if (pages.some(page => !page.hasMore) || pages.every(page => page.reports.length === 0)) break
    }
    return Array.from(new Map(reports.map(report => [report.reportUrl, report])).values())
}

function parseReportData(rawQuestions, metadata) {
    const questions = []
    const comments = []
    for (const question of rawQuestions) {
        const text = String(question.QuestionText || '').replace(/All comments are subject to.*$/s, '').trim()
        if (question.QuestionType === 1) {
            comments.push(...String(question.AnswerText || '').split('||').map(value => value.trim()).filter(Boolean))
            continue
        }
        questions.push({
            text,
            type: question.QuestionType === 3 ? 'rating' : 'numeric',
            mean: Number.parseFloat(question.Mean) || 0,
            median: Number.parseFloat(question.Meadian) || 0,
            std: Number.parseFloat(question.STD) || 0,
            responseRate: question.ResponseRate || '',
            options: (question.Options || []).filter(option => option.OptionText !== '').map(option => ({
                text: option.OptionText,
                weight: option.OptionWeight,
                count: option.Frequency,
                pct: option.Percentage,
            })),
        })
    }
    return { ...metadata, questions, comments }
}

async function fetchReport(report, term, cookie) {
    const response = await authenticatedFetch(`${REPORT_URL}?id=${report.reportUrl}`, cookie)
    const html = await response.text()
    const value = html.match(/id="hdnReportData"[^>]*\bvalue="([^"]*)"/i)?.[1]
    if (!value) return null
    const raw = JSON.parse(decodeHtml(value))
    const evaluation = parseReportData(raw, {
        term,
        instructor: report.instructor,
        course_code: report.courseCode,
        respondents: report.respondents,
    })
    return evaluation.questions.length > 0 || evaluation.comments.length > 0 ? evaluation : null
}

function courseIdsForReport(courseCode, termCode, knownCourseIds) {
    const ids = []
    for (const segment of courseCode.split('/')) {
        const parts = segment.trim().split('-')
        if (parts.length < 3 || parts[0] !== termCode) continue
        const id = `${parts[1]}${parts[2]}`.replace(/\s+/g, '').toUpperCase()
        if (knownCourseIds.has(id)) ids.push(id)
    }
    return Array.from(new Set(ids))
}

async function loadAll(supabase, table, columns) {
    const rows = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from(table).select(columns).range(from, from + 999)
        if (error) throw error
        rows.push(...data)
        if (data.length < 1000) return rows
    }
}

async function loadEmptyEvaluations(supabase, terms) {
    const rows = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from('evaluations')
            .select('course_id,term,instructor')
            .in('term', terms)
            .eq('questions', '[]')
            .eq('comments', '[]')
            .range(from, from + 999)
        if (error) throw error
        rows.push(...data)
        if (data.length < 1000) return rows
    }
}

function evaluationKey(row) {
    return `${row.course_id}\0${row.term}\0${row.instructor}`.toLowerCase()
}

async function login() {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        channel: 'chrome',
        headless: false,
        viewport: { width: 1280, height: 800 },
    })
    const page = context.pages()[0] || await context.newPage()
    await page.goto(SEARCH_URL)
    if (new URL(page.url()).hostname !== 'stanford.evaluationkit.com') {
        console.log('Complete Stanford login and two-step verification in the opened browser.')
    }
    await page.waitForURL(url => url.hostname === 'stanford.evaluationkit.com', {
        timeout: 10 * 60 * 1000,
    })
    const cookies = await context.cookies(BASE_URL)
    const cookie = cookies.map(value => `${value.name}=${value.value}`).join('; ')
    if (!cookie) throw new Error('No EvaluationKit session cookies found')
    return { context, cookie }
}

function category(text) {
    const value = String(text || '').toLowerCase()
    if (value.includes('quality') || value.includes('overall')) return 'quality'
    if (value.includes('how much did you learn')) return 'learning'
    if (value.includes('organized')) return 'organization'
    if (value.includes('hours per week') || (value.includes('hours') && value.includes('week'))) return 'hours'
    return null
}

function median(values) {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function units(value) {
    const matches = String(value || '').match(/\d+(?:\.\d+)?/g)
    return Math.max(...(matches?.map(Number) || [1]))
}

async function refreshMetrics(supabase) {
    console.log('Recomputing course metrics...')
    const [evaluations, courses] = await Promise.all([
        loadAll(supabase, 'evaluations', 'course_id,questions'),
        loadAll(supabase, 'courses', 'course_id,units'),
    ])
    const byCourse = new Map()
    for (const evaluation of evaluations) {
        if (!byCourse.has(evaluation.course_id)) byCourse.set(evaluation.course_id, [])
        byCourse.get(evaluation.course_id).push(...(evaluation.questions || []))
    }
    const courseUnits = new Map(courses.map(course => [course.course_id, units(course.units)]))
    const updates = []
    for (const [courseId, questions] of byCourse) {
        const values = { quality: [], learning: [], organization: [], hours: [] }
        for (const question of questions) {
            const key = category(question.text)
            if (key && Number.isFinite(question.median) && question.median > 0) values[key].push(question.median)
        }
        const hours = median(values.hours)
        const quality = median(['quality', 'learning', 'organization'].map(key => median(values[key])).filter(value => value != null))
        if (hours == null && quality == null) continue
        updates.push({
            course_id: courseId,
            ...(hours != null && { hours, difficulty: hours / (courseUnits.get(courseId) || 1) }),
            ...(quality != null && { quality }),
        })
    }
    for (let i = 0; i < updates.length; i += 100) {
        const batch = updates.slice(i, i + 100)
        const results = await Promise.all(batch.map(({ course_id, ...fields }) =>
            supabase.from('courses').update(fields).eq('course_id', course_id)
        ))
        const error = results.find(result => result.error)?.error
        if (error) throw error
        process.stdout.write(`\rMetrics ${Math.min(i + 100, updates.length)}/${updates.length}`)
    }
    process.stdout.write('\n')
}

async function main() {
    const opts = parseArgs()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const [courses, existing] = await Promise.all([
        loadAll(supabase, 'courses', 'course_id'),
        loadAll(supabase, 'evaluations', 'course_id,term,instructor'),
    ])
    const knownCourseIds = new Set(courses.map(course => course.course_id))
    const existingKeys = new Set(existing.map(evaluationKey))
    const emptyKeys = new Set(opts.repairEmpty
        ? (await loadEmptyEvaluations(supabase, opts.terms.map(term => TERM_LABELS[term]))).map(evaluationKey)
        : [])
    const runKeys = new Set()
    const { context, cookie } = await login()

    let found = 0
    let extracted = 0
    let unmatched = 0
    let duplicates = 0
    let failed = 0
    const unmatchedSamples = []
    try {
        for (const termCode of opts.terms) {
            const term = TERM_LABELS[termCode]
            console.log(`Searching ${term}...`)
            let reports = await searchTerm(termCode, cookie)
            if (opts.course) {
                reports = reports.filter(report => courseIdsForReport(report.courseCode, termCode, knownCourseIds).includes(opts.course))
            }
            found += reports.length
            console.log(`${term}: ${reports.length} reports`)

            const candidates = []
            for (const report of reports) {
                const courseIds = courseIdsForReport(report.courseCode, termCode, knownCourseIds)
                if (courseIds.length === 0) {
                    unmatched++
                    if (unmatchedSamples.length < 20) unmatchedSamples.push(report.courseCode)
                    continue
                }
                const pendingIds = courseIds.filter(course_id =>
                    opts.force
                    || (opts.repairEmpty
                        ? emptyKeys.has(evaluationKey({ course_id, term, instructor: report.instructor }))
                        : !existingKeys.has(evaluationKey({ course_id, term, instructor: report.instructor })))
                )
                duplicates += courseIds.length - pendingIds.length
                if (pendingIds.length > 0) candidates.push({ ...report, courseIds: pendingIds })
            }
            console.log(`${term}: ${candidates.length} reports need extraction`)

            for (let i = 0; i < candidates.length; i += opts.concurrency) {
                const batch = candidates.slice(i, i + opts.concurrency)
                const fetched = await Promise.all(batch.map(async report => {
                    try {
                        const evaluation = await fetchReport(report, term, cookie)
                        return { report, evaluation }
                    } catch (error) {
                        console.warn(`${report.courseCode}: ${error.message}`)
                        return { report, evaluation: null }
                    }
                }))

                const rows = []
                for (const { report, evaluation } of fetched) {
                    if (!evaluation) {
                        failed++
                        continue
                    }
                    for (const course_id of report.courseIds) {
                        const row = { course_id, ...evaluation }
                        const rowKey = evaluationKey(row)
                        if (runKeys.has(rowKey) || (!opts.force && !opts.repairEmpty && existingKeys.has(rowKey))) {
                            duplicates++
                            continue
                        }
                        runKeys.add(rowKey)
                        existingKeys.add(rowKey)
                        rows.push(row)
                    }
                }

                if (!opts.dryRun && rows.length > 0) {
                    if (opts.force || opts.repairEmpty) {
                        const results = await Promise.all(rows.map(({ course_id, term, instructor, ...fields }) =>
                            supabase.from('evaluations').update(fields).match({ course_id, term, instructor })
                        ))
                        const error = results.find(result => result.error)?.error
                        if (error) throw error
                    } else {
                        const { error } = await supabase.from('evaluations').insert(rows)
                        if (error) throw error
                    }
                }
                extracted += rows.length
                process.stdout.write(`\r${term}: ${Math.min(i + opts.concurrency, candidates.length)}/${candidates.length}, new=${extracted}, failed=${failed}`)
                await sleep(100)
            }
            process.stdout.write('\n')
        }
    } finally {
        await context.close()
    }

    console.log(JSON.stringify({ terms: opts.terms, found, extracted, duplicates, unmatched, unmatchedSamples, failed, dryRun: opts.dryRun }, null, 2))
    if (!opts.dryRun && opts.metrics) await refreshMetrics(supabase)
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})

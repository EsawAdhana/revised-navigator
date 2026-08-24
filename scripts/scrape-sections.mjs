/**
 * Scrape section data from Stanford's ExploreCourses XML API and update Supabase.
 *
 * Usage:
 *   node --env-file=.env.local scripts/scrape-sections.mjs                  # full run (+ Navigator gap-fill)
 *   node --env-file=.env.local scripts/scrape-sections.mjs --dry-run        # fetch and compare only
 *   node --env-file=.env.local scripts/scrape-sections.mjs --academic-year 20262027
 *   node --env-file=.env.local scripts/scrape-sections.mjs --resume         # only rows on a different year
 *   node --env-file=.env.local scripts/scrape-sections.mjs --course CS106B  # single course
 *   node --env-file=.env.local scripts/scrape-sections.mjs --nav-gaps       # only fill ExploreCourses holes from Navigator
 */

import { createClient } from '@supabase/supabase-js'
import { XMLParser } from 'fast-xml-parser'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** SUNet → full "Last, First" for people ExploreCourses only stores as an initial. */
const INSTRUCTOR_OVERRIDES = JSON.parse(
    readFileSync(join(__dirname, 'instructor-name-overrides.json'), 'utf8')
)

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CATALOG_CONCURRENCY = 6
const BASE_URL = 'https://explorecourses.stanford.edu/search'
const BROWSE_URL = 'https://explorecourses.stanford.edu/browse'


// NQTR attribute value → human-readable term.
// Derived from the active academic year so it self-rolls every year and never
// needs manual edits. Only used as a fallback when a section lacks a <term>
// element; the primary parser (parseSectionTerm) handles the authoritative year.
function buildNqtrMap(now = new Date()) {
    // Academic year starts in Autumn. Sep-Dec → AY starts this calendar year;
    // Jan-Aug → AY started the previous calendar year.
    const ayStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
    return {
        AUT: `Autumn ${ayStart}`,
        FAL: `Autumn ${ayStart}`,
        WIN: `Winter ${ayStart + 1}`,
        SPR: `Spring ${ayStart + 1}`,
        SUM: `Summer ${ayStart + 1}`,
    }
}
const NQTR_MAP = buildNqtrMap()

// Chronological term sort: by calendar year, then season-within-year
// (Winter < Spring < Summer < Autumn). Keeps `terms[0]` sensible downstream.
const SEASON_ORDER = { Winter: 0, Spring: 1, Summer: 2, Autumn: 3, Fall: 3 }
function termSortKey(term) {
    const parts = (term || '').trim().split(/\s+/)
    const season = parts[0] || ''
    const year = parseInt(parts[parts.length - 1], 10) || 0
    return year * 10 + (SEASON_ORDER[season] ?? 0)
}
function sortTerms(terms) {
    return [...terms].sort((a, b) => termSortKey(a) - termSortKey(b))
}

// ── Args ────────────────────────────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2)
    const opts = {
        course: null,
        dryRun: false,
        resume: false,
        navGaps: false,
        academicYear: defaultAcademicYear(),
    }
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--dry-run') opts.dryRun = true
        if (args[i] === '--resume') opts.resume = true
        if (args[i] === '--nav-gaps') opts.navGaps = true
        if (args[i] === '--course' && args[i + 1]) opts.course = args[i + 1].trim().toUpperCase()
        if (args[i] === '--academic-year' && /^\d{8}$/.test(args[i + 1] || '')) {
            opts.academicYear = args[i + 1]
        }
    }
    return opts
}

function academicYearLabel(academicYear) {
    // "20262027" → "2026-2027"
    return `${academicYear.slice(0, 4)}-${academicYear.slice(4)}`
}

function termsForAcademicYear(academicYear) {
    const start = parseInt(academicYear.slice(0, 4), 10)
    return [
        `Autumn ${start}`,
        `Winter ${start + 1}`,
        `Spring ${start + 1}`,
        `Summer ${start + 1}`,
    ]
}

function defaultAcademicYear(now = new Date()) {
    // Stanford publishes the next catalog during summer. Trying it early is safe:
    // full-catalog validation aborts before writes if the API has not published data.
    const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
    return `${start}${start + 1}`
}

// ── XML Parsing ───────────────────────────────────────────────────────────────

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '_',
    isArray: (name) => ['school', 'department', 'course', 'section', 'schedule', 'instructor', 'attribute', 'day'].includes(name),
    textNodeName: '_text',
})

function ensureArray(val) {
    if (!val) return []
    return Array.isArray(val) ? val : [val]
}

function textVal(v) {
    if (v == null || v === '') return ''
    if (typeof v === 'object' && '_text' in v) return String(v._text ?? '').trim()
    return String(v).trim()
}

function parseDays(schedule) {
    // Days are represented as child elements inside <days>. fast-xml-parser
    // captures these differently depending on content — we check common keys.
    const days = schedule?.days
    if (!days) return ''
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const found = dayNames.filter(d => days[d] !== undefined)
    if (found.length > 0) return found.join(', ')
    // Fallback — sometimes returned as a plain string
    if (typeof days === 'string') return days.trim()
    return ''
}

function parseGers(courseNode, sectionNode) {
    const gers = new Set()
    // Course-level <gers>
    const courseGers = courseNode?.gers
    if (typeof courseGers === 'string' && courseGers.trim()) {
        courseGers.split(',').forEach(g => { const t = g.trim(); if (t) gers.add(t) })
    }
    // Section-level attributes (WAY-*, GER-*)
    const attrs = ensureArray(sectionNode?.attributes?.attribute)
    for (const attr of attrs) {
        const name = attr?.name || ''
        const desc = attr?.description || ''
        if (name.startsWith('WAY') || name.startsWith('GER') || name === 'WIM') {
            gers.add(desc || name)
        }
    }
    return Array.from(gers)
}

function parseSectionTerm(sectionNode) {
    // 1. Try direct <term> element first (e.g. "2025-2026 Autumn")
    const rawTerm = sectionNode?.term
    if (rawTerm && typeof rawTerm === 'string') {
        const parts = rawTerm.trim().split(/\s+/)
        if (parts.length === 2 && parts[0].includes('-')) {
            const years = parts[0].split('-')
            const quarter = parts[1]
            if (quarter === 'Autumn' || quarter === 'Fall') return `Autumn ${years[0]}`
            if (quarter === 'Winter') return `Winter ${years[1]}`
            if (quarter === 'Spring') return `Spring ${years[1]}`
            if (quarter === 'Summer') return `Summer ${years[1]}`
        }
        return rawTerm
    }

    // 2. Fallback to NQTR attribute
    const attrs = ensureArray(sectionNode?.attributes?.attribute)
    for (const attr of attrs) {
        if (attr?.name === 'NQTR' || attr?._name === 'NQTR') {
            const val = attr?.value || attr?._value || ''
            return NQTR_MAP[val] || val
        }
    }
    return ''
}

/**
 * ExploreCourses puts the abbreviated form in <name> ("Zou, J.") and the real
 * person in <firstName>/<lastName> (plus <sunet>). Prefer the full name so
 * instructor pages don't collide on shared initials. A handful of people still
 * only have an initial in <firstName>; override those by SUNet.
 */
function instructorFullName(node) {
    const sunet = textVal(node?.sunet).toLowerCase()
    if (sunet && INSTRUCTOR_OVERRIDES[sunet]) return INSTRUCTOR_OVERRIDES[sunet]
    const first = textVal(node?.firstName)
    const last = textVal(node?.lastName)
    if (first && last) return `${last}, ${first}`
    return textVal(node?.name)
}

function parseSection(sectionNode, courseNode) {
    const schedules = ensureArray(sectionNode?.schedules?.schedule)

    const meetings = schedules.map(sched => ({
        days: parseDays(sched),
        time: [sched?.startTime, sched?.endTime].filter(Boolean).join(' – '),
        location: sched?.location || '',
        instructors: ensureArray(sched?.instructors?.instructor).map(instructorFullName).filter(Boolean),
    }))

    return {
        term: parseSectionTerm(sectionNode),
        classId: parseInt(sectionNode?.classId, 10) || 0,
        sectionNumber: String(sectionNode?.sectionNumber || ''),
        component: sectionNode?.component || '',
        // ExploreCourses puts section units in a single <units> element (e.g. "3" or "1-3"),
        // not minUnits/maxUnits — reading the wrong field left every section's units blank.
        units: textVal(sectionNode?.units) || '',
        grading: courseNode?.grading || '',
        classLevel: textVal(sectionNode?.classLevel) || '',
        instructionalMode: sectionNode?.instructionalMode || '',
        status: sectionNode?.enrollStatus || '',
        enrolled: parseInt(sectionNode?.currentClassSize, 10) || 0,
        capacity: parseInt(sectionNode?.maxClassSize, 10) || 0,
        waitlist: parseInt(sectionNode?.currentWaitlistSize, 10) || 0,
        waitlistMax: parseInt(sectionNode?.maxWaitlistSize, 10) || 0,
        openSeats: Math.max(0, (parseInt(sectionNode?.maxClassSize, 10) || 0) - (parseInt(sectionNode?.currentClassSize, 10) || 0)),
        startDate: sectionNode?.startDate || '',
        endDate: sectionNode?.endDate || '',
        meetings,
        gers: parseGers(courseNode, sectionNode),
    }
}

// ── XML Fetch & Parse ─────────────────────────────────────────────────────────

async function fetchXml(url) {
    let lastErr
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Cookie': 'jsenabled=1',
                },
                signal: AbortSignal.timeout(30000),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return await res.text()
        } catch (e) {
            lastErr = e
            if (attempt === 2) throw e instanceof Error ? e : new Error(String(e))
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error('No XML response')
}

function parseCourseNode(courseNode) {
    const subject = textVal(courseNode?.subject).replace(/\s+/g, '')
    const code = textVal(courseNode?.code).replace(/\s+/g, '')
    if (!subject || !code) return null

    const sections = ensureArray(courseNode?.sections?.section).map(section => parseSection(section, courseNode))
    const uniqueSections = []
    const seen = new Set()
    for (const section of sections) {
        const key = section.classId || `${section.term}:${section.sectionNumber}:${section.component}`
        if (seen.has(key)) continue
        seen.add(key)
        uniqueSections.push(section)
    }

    const instructors = Array.from(new Set(
        uniqueSections.flatMap(section => section.meetings.flatMap(meeting => meeting.instructors))
    ))

    return {
        course_id: `${subject}${code}`.toUpperCase(),
        subject,
        code,
        title: textVal(courseNode?.title),
        description: textVal(courseNode?.description)
            .replace(/&#[A-Z]+\s+039;/g, "'")
            .replace(/&#039;/g, "'")
            .replace(/&#[A-Z]+\s+034;/g, '"')
            .replace(/&amp;/g, '&'),
        units: [textVal(courseNode?.unitsMin), textVal(courseNode?.unitsMax)]
            .filter(value => value && value !== '0')
            .join('-') || textVal(courseNode?.unitsMin),
        grading: textVal(courseNode?.grading),
        instructors,
        sections: uniqueSections,
        terms: sortTerms(Array.from(new Set(uniqueSections.map(section => section.term).filter(Boolean)))),
    }
}

function mergeCatalogCourse(existing, incoming) {
    if (!existing) return incoming
    const sections = [...existing.sections, ...incoming.sections]
    const seen = new Set()
    const uniqueSections = sections.filter(section => {
        const key = section.classId || `${section.term}:${section.sectionNumber}:${section.component}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
    return {
        ...existing,
        title: existing.title || incoming.title,
        description: existing.description || incoming.description,
        units: existing.units || incoming.units,
        grading: existing.grading || incoming.grading,
        instructors: Array.from(new Set([...existing.instructors, ...incoming.instructors])),
        sections: uniqueSections,
        terms: sortTerms(Array.from(new Set(uniqueSections.map(section => section.term).filter(Boolean)))),
    }
}

/**
 * Subjects that offer Active courses but are missing from ExploreCourses /browse
 * (so the department walk never hits them). Keep short; cross-list follow-up
 * below also pulls siblings referenced from titles.
 */
const ORPHAN_SUBJECTS = ['PHOTON', 'TRAM']

/** "Foo (CS 238, EE 160A)" / "(MS&E 256)" → ["CS238", "EE160A"] / ["MS&E256"]. */
function extractCrossListedIds(title) {
    const ids = []
    for (const match of String(title || '').matchAll(/\(([^)]+)\)/g)) {
        const inner = match[1]
        if (!/[A-Z]{2,}(?:&[A-Z]+)?\s+\d/i.test(inner)) continue
        for (const code of inner.matchAll(/([A-Z]{2,}(?:&[A-Z]+)?)\s+(\d+[A-Z]*)/gi)) {
            ids.push(`${code[1]}${code[2]}`.toUpperCase().replace(/\s+/g, ''))
        }
    }
    return ids
}

function splitCourseId(courseId) {
    const id = String(courseId || '').toUpperCase().replace(/\s+/g, '')
    const match = id.match(/^([A-Z&]+)(\d.*)$/)
    if (!match) return null
    return { subject: match[1], code: match[2] }
}

async function fetchDepartmentCourses(department, academicYear) {
    const params = new URLSearchParams({
        view: 'xml-20200810',
        academicYear,
        q: department,
        [`filter-departmentcode-${department}`]: 'on',
        'filter-coursestatus-Active': 'on',
    })
    const parsed = parser.parse(await fetchXml(`${BASE_URL}?${params}`))
    return ensureArray((parsed?.xml ?? parsed)?.courses?.course)
}

/** Subject search without a browse department code (PHOTON / TRAM orphans). */
async function fetchSubjectCourses(subject, academicYear) {
    const params = new URLSearchParams({
        view: 'xml-20200810',
        academicYear,
        q: subject,
        'filter-coursestatus-Active': 'on',
    })
    const parsed = parser.parse(await fetchXml(`${BASE_URL}?${params}`))
    const target = subject.toUpperCase().replace(/\s+/g, '')
    return ensureArray((parsed?.xml ?? parsed)?.courses?.course).filter(node => {
        const s = textVal(node?.subject).replace(/\s+/g, '').toUpperCase()
        return s === target
    })
}

function ingestCourseNodes(catalog, nodes) {
    let added = 0
    for (const node of nodes) {
        const course = parseCourseNode(node)
        if (!course) continue
        const before = catalog.has(course.course_id)
        catalog.set(course.course_id, mergeCatalogCourse(catalog.get(course.course_id), course))
        if (!before) added++
    }
    return added
}

/**
 * Pull courses ExploreCourses lists only as cross-list siblings, or under
 * subjects absent from /browse, so the catalog is not limited to browse depts.
 */
async function fetchOrphanAndCrossListed(catalog, academicYear, browseDepartments) {
    const browseSet = new Set(browseDepartments.map(d => d.toUpperCase()))

    // 1) Known orphan subjects (not in /browse at all).
    const orphanSubjects = ORPHAN_SUBJECTS.filter(s => !browseSet.has(s))
    for (let i = 0; i < orphanSubjects.length; i += CATALOG_CONCURRENCY) {
        const batch = orphanSubjects.slice(i, i + CATALOG_CONCURRENCY)
        const results = await Promise.all(batch.map(subject => fetchSubjectCourses(subject, academicYear)))
        for (const nodes of results) ingestCourseNodes(catalog, nodes)
    }
    if (orphanSubjects.length) {
        console.log(`Fetched ${orphanSubjects.length} orphan subjects: ${orphanSubjects.join(', ')}`)
    }

    // 2) Cross-list IDs named in titles but missing / unscheduled in the catalog.
    const missingIds = new Set()
    for (const course of catalog.values()) {
        for (const id of extractCrossListedIds(course.title)) {
            const existing = catalog.get(id)
            if (!existing || existing.sections.length === 0) missingIds.add(id)
        }
    }

    const missing = [...missingIds]
    let fetched = 0
    for (let i = 0; i < missing.length; i += CATALOG_CONCURRENCY) {
        const batch = missing.slice(i, i + CATALOG_CONCURRENCY)
        const results = await Promise.all(batch.map(async id => {
            const parts = splitCourseId(id)
            if (!parts) return null
            try {
                return await fetchSections(parts.subject, parts.code, academicYear)
            } catch (err) {
                console.warn(`  ⚠ cross-list fetch failed for ${id}: ${err.message}`)
                return null
            }
        }))
        for (const course of results) {
            if (!course) continue
            catalog.set(course.course_id, mergeCatalogCourse(catalog.get(course.course_id), course))
            fetched++
        }
        process.stdout.write(`\rFetched cross-list ${Math.min(i + CATALOG_CONCURRENCY, missing.length)}/${missing.length}`)
    }
    if (missing.length) process.stdout.write('\n')
    console.log(`Cross-list follow-up: ${missing.length} candidates, ${fetched} scheduled courses merged`)
}

async function fetchCatalog(academicYear) {
    const browseUrl = `${BROWSE_URL}?view=xml-20200810&academicYear=${academicYear}`
    const browse = parser.parse(await fetchXml(browseUrl))
    const schools = ensureArray(browse?.schools?.school)
    const departments = Array.from(new Set(
        schools.flatMap(school => ensureArray(school?.department))
            .map(department => textVal(department?._name || department?.name))
            .filter(Boolean)
    ))

    if (departments.length < 100) {
        throw new Error(`Catalog validation failed: found only ${departments.length} departments`)
    }

    const catalog = new Map()
    for (let i = 0; i < departments.length; i += CATALOG_CONCURRENCY) {
        const batch = departments.slice(i, i + CATALOG_CONCURRENCY)
        const results = await Promise.all(batch.map(department => fetchDepartmentCourses(department, academicYear)))

        for (const nodes of results) ingestCourseNodes(catalog, nodes)
        process.stdout.write(`\rFetched ${Math.min(i + CATALOG_CONCURRENCY, departments.length)}/${departments.length} departments`)
    }
    process.stdout.write('\n')

    await fetchOrphanAndCrossListed(catalog, academicYear, departments)

    const scheduledCourses = Array.from(catalog.values()).filter(course => course.sections.length > 0)
    if (scheduledCourses.length < 5000) {
        throw new Error(`Catalog validation failed: found only ${scheduledCourses.length} scheduled courses; no database writes made`)
    }
    return { departments, courses: scheduledCourses }
}

async function fetchSections(subject, code, academicYear) {
    const query = `${subject}${code}`.replace(/\s+/g, '')
    const params = new URLSearchParams({
        q: query,
        view: 'xml-20200810',
        academicYear,
        'filter-coursestatus-Active': 'on',
    })
    const xml = await fetchXml(`${BASE_URL}?${params}`)
    try {
        const parsed = parser.parse(xml)
        // Root tag is <xml>, not <courses>
        const root = parsed?.xml ?? parsed
        const courses = ensureArray(root?.courses?.course)

        if (courses.length === 0) return null

        // Find all exact course matches (sometimes split across multiple course entries)
        const normalizedTarget = `${subject.replace(/\s+/g, '').toUpperCase()}${code.replace(/\s+/g, '').toUpperCase()}`
        const matchedCourses = courses.filter(c => {
            const s = String(c?.subject || '').replace(/\s+/g, '').toUpperCase()
            const cd = String(c?.code || '').replace(/\s+/g, '').toUpperCase()
            return `${s}${cd}` === normalizedTarget
        })

        if (matchedCourses.length === 0) return null

        return matchedCourses
            .map(parseCourseNode)
            .filter(Boolean)
            .reduce(mergeCatalogCourse, null)
    } catch (e) {
        // Corrupt/partial XML is transient — throw so the course is retried next run, not marked done
        throw new Error(`XML parse error for ${subject}${code}: ${e.message}`)
    }
}

// ── Supabase ──────────────────────────────────────────────────────────────────

function isStatementTimeout(err) {
    const code = err?.code ?? err?.details
    const msg = (err?.message || '').toLowerCase()
    const details = String(err?.details || '').toLowerCase()
    return code === '57014' || msg.includes('timeout') || msg.includes('canceling statement')
}

function isTransientDbError(err) {
    if (isStatementTimeout(err)) return true
    const msg = `${err?.message || ''} ${err?.details || ''}`.toLowerCase()
    return (
        msg.includes('fetch failed') ||
        msg.includes('socket') ||
        msg.includes('econnreset') ||
        msg.includes('und_err') ||
        msg.includes('upstream request timeout') ||
        msg.includes('connection')
    )
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}

/** Retry transient DB timeouts / dropped sockets (common on large `courses` writes). */
async function withRetries(fn, { label = 'query', maxAttempts = 6 } = {}) {
    let lastErr
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { data, error } = await fn()
        if (!error) return { data, error: null }
        lastErr = error
        if (!isTransientDbError(error) || attempt === maxAttempts) return { data, error }
        const wait = Math.min(8000, 800 * attempt)
        console.warn(`  ⚠ ${label} failed (attempt ${attempt}/${maxAttempts}): ${error.message || error.code}; retrying in ${wait}ms…`)
        await sleep(wait)
    }
    return { data: null, error: lastErr }
}

/**
 * Load all course ids in small pages. Keyset pagination + order avoids heavy OFFSET scans;
 * narrow select keeps payload small under Supabase statement limits.
 */
async function loadCourses(supabase) {
    const rows = []
    const PAGE = 300
    let lastCourseId = null

    while (true) {
        const cursor = lastCourseId
        const { data, error } = await withRetries(() => {
            let q = supabase
                .from('courses')
                .select('course_id, subject, code, terms')
                .order('course_id', { ascending: true })
                .limit(PAGE)
            if (cursor != null) q = q.gt('course_id', cursor)
            return q
        }, { label: 'loadCourses page' })
        if (error) throw error
        if (!data || data.length === 0) break

        rows.push(...data)
        lastCourseId = data[data.length - 1].course_id
        if (data.length < PAGE) break
    }

    return rows
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function upsertCatalog(supabase, rows) {
    const batchSize = 20
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const { error } = await withRetries(
            () => supabase.from('courses').upsert(batch, { onConflict: 'course_id' }),
            { label: `upsert batch ${Math.floor(i / batchSize) + 1}` }
        )
        if (error) throw error
        process.stdout.write(`\rUpserted ${Math.min(i + batchSize, rows.length)}/${rows.length} courses`)
    }
    process.stdout.write('\n')
}

async function updateCatalog(supabase, rows) {
    const concurrency = 10
    for (let i = 0; i < rows.length; i += concurrency) {
        const batch = rows.slice(i, i + concurrency)
        const results = await Promise.all(batch.map(({ course_id, ...fields }) =>
            withRetries(
                () => supabase.from('courses').update(fields).eq('course_id', course_id),
                { label: `update ${course_id}` }
            )
        ))
        const error = results.find(result => result.error)?.error
        if (error) throw error
        process.stdout.write(`\rUpdated ${Math.min(i + concurrency, rows.length)}/${rows.length} courses`)
    }
    process.stdout.write('\n')
}

async function clearStaleCourses(supabase, courseIds) {
    const batchSize = 200
    for (let i = 0; i < courseIds.length; i += batchSize) {
        const batch = courseIds.slice(i, i + batchSize)
        const { error } = await withRetries(
            () => supabase.from('courses').update({ sections: [], terms: [] }).in('course_id', batch),
            { label: `clear stale batch ${Math.floor(i / batchSize) + 1}` }
        )
        if (error) throw error
    }
}

// ── Navigator gap-fill (PeopleSoft via Algolia) ─────────────────────────────

const NAV_ALGOLIA_APP = 'RXGHAPCKOF'
const NAV_ATTRS = [
    'subject', 'catalogNbr', 'courseCode', 'courseTitle', 'courseDescr', 'termOffered',
    'classNbr', 'classSection', 'componentPrimary', 'format', 'units', 'gradingBasisDescr',
    'enrlCap', 'enrlTot', 'waitCap', 'waitTot', 'enrlStatDescr', 'classStatDescr',
    'instructionModeDescr', 'meetings', 'geRequirements', 'primaryComponentFlag', 'sortPrefix',
].join(',')

async function getNavigatorAlgoliaKey() {
    const res = await fetch('https://navigator.stanford.edu/api/generate-key', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            origin: 'https://navigator.stanford.edu',
            referer: 'https://navigator.stanford.edu/classes',
        },
        body: '{}',
    })
    if (!res.ok) throw new Error(`Navigator generate-key failed: HTTP ${res.status}`)
    const data = await res.json()
    if (!data.securedApiKey) throw new Error('Navigator generate-key returned no securedApiKey')
    return data.securedApiKey
}

async function algoliaMulti(key, requests) {
    for (let attempt = 1; attempt <= 6; attempt++) {
        const res = await fetch(`https://${NAV_ALGOLIA_APP}-dsn.algolia.net/1/indexes/*/queries`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-algolia-application-id': NAV_ALGOLIA_APP,
                'x-algolia-api-key': key,
            },
            body: JSON.stringify({ requests }),
        })
        if (res.ok) return res.json()
        const text = await res.text()
        if (attempt === 6 || (res.status !== 429 && res.status < 500)) {
            throw new Error(`Algolia ${res.status}: ${text.slice(0, 200)}`)
        }
        await sleep(400 * attempt)
    }
    throw new Error('Algolia multi-query failed')
}

function navInstructors(meeting) {
    return (meeting?.instructors || []).map(i => {
        if (i.lastName && i.firstName) return `${i.lastName}, ${i.firstName}`
        return i.displayName || ''
    }).filter(Boolean)
}

function navHitToSection(hit) {
    const units = Array.isArray(hit.units) ? hit.units.filter(u => u != null && u !== '').join('-') : ''
    return {
        term: hit.termOffered || '',
        classId: parseInt(hit.classNbr, 10) || 0,
        sectionNumber: String(hit.classSection || ''),
        component: hit.componentPrimary || '',
        units,
        grading: hit.gradingBasisDescr || '',
        classLevel: '',
        instructionalMode: hit.instructionModeDescr || '',
        status: hit.enrlStatDescr || hit.classStatDescr || '',
        enrolled: parseInt(hit.enrlTot, 10) || 0,
        capacity: parseInt(hit.enrlCap, 10) || 0,
        waitlist: parseInt(hit.waitTot, 10) || 0,
        waitlistMax: parseInt(hit.waitCap, 10) || 0,
        openSeats: Math.max(0, (parseInt(hit.enrlCap, 10) || 0) - (parseInt(hit.enrlTot, 10) || 0)),
        startDate: '',
        endDate: '',
        meetings: (hit.meetings || []).map(m => ({
            days: (m.daysOfWeekList || []).join(', ') || m.daysOfWeek || '',
            time: [m.startTime, m.endTime].filter(Boolean).join(' – '),
            location: [m.facilityDescr, m.room].filter(Boolean).join(' ') || '',
            instructors: navInstructors(m),
        })),
        gers: Array.isArray(hit.geRequirements) ? hit.geRequirements : [],
    }
}

function navHitsToCourse(hits) {
    if (!hits.length) return null
    const first = hits[0]
    const subject = String(first.subject || '').replace(/\s+/g, '')
    const code = String(first.catalogNbr || '').replace(/\s+/g, '')
    if (!subject || !code) return null

    const sections = []
    const seen = new Set()
    for (const hit of hits) {
        const section = navHitToSection(hit)
        const key = section.classId || `${section.term}:${section.sectionNumber}:${section.component}`
        if (seen.has(key)) continue
        seen.add(key)
        sections.push(section)
    }
    if (!sections.length) return null

    const instructors = Array.from(new Set(
        sections.flatMap(s => s.meetings.flatMap(m => m.instructors))
    ))
    const unitSet = [...new Set(sections.map(s => String(s.units || '')).filter(Boolean))]
    const units = unitSet[0] || ''

    return {
        course_id: `${subject}${code}`.toUpperCase(),
        subject,
        code,
        title: first.courseTitle || '',
        description: first.courseDescr || '',
        units,
        grading: first.gradingBasisDescr || sections[0]?.grading || '',
        instructors,
        sections,
        terms: sortTerms(Array.from(new Set(sections.map(s => s.term).filter(Boolean)))),
    }
}

async function fetchSubjectTermHits(key, subject, term, yearLabel, numericFilters = null) {
    const params = new URLSearchParams({
        query: `"${subject} "`,
        filters: `acadYearLabel:"${yearLabel}" AND termOffered:"${term}"`,
        hitsPerPage: '1000',
        attributesToRetrieve: NAV_ATTRS,
    })
    if (numericFilters) params.set('numericFilters', numericFilters)
    const data = await algoliaMulti(key, [{ indexName: 'classes', params: params.toString() }])
    const res = data.results[0]
    const hits = (res.hits || []).filter(h => String(h.subject || '').toUpperCase() === subject.toUpperCase())
    return { nbHits: res.nbHits || 0, hits }
}

async function fetchSubjectTermAllHits(key, subject, term, yearLabel) {
    const first = await fetchSubjectTermHits(key, subject, term, yearLabel)
    if (first.nbHits <= 1000) return first.hits

    // Secured key caps at 1000 hits/query — split on sortPrefix when a subject overflows.
    const thresholds = [100, 150, 200, 250, 300, 400, 500, 600, 800, 1000]
    let splitAt = 200
    for (const t of thresholds) {
        const lo = await fetchSubjectTermHits(key, subject, term, yearLabel, `sortPrefix<${t}`)
        const hi = await fetchSubjectTermHits(key, subject, term, yearLabel, `sortPrefix>=${t}`)
        if (lo.nbHits <= 1000 && hi.nbHits <= 1000) {
            splitAt = t
            const seen = new Set()
            const out = []
            for (const h of [...lo.hits, ...hi.hits]) {
                const k = `${h.termOffered}|${h.classNbr}`
                if (seen.has(k)) continue
                seen.add(k)
                out.push(h)
            }
            return out
        }
    }
    console.warn(`  ⚠ Navigator overflow for ${subject} ${term} (nbHits=${first.nbHits}); using first 1000 only`)
    return first.hits
}

/**
 * Pull Navigate Classes (Algolia) for the academic year and return Root-shaped
 * courses. Used to fill holes ExploreCourses never publishes (esp. Med/Law/GSB).
 */
async function fetchNavigatorCourses(academicYear, subjects) {
    const yearLabel = academicYearLabel(academicYear)
    const terms = termsForAcademicYear(academicYear)
    let key = await getNavigatorAlgoliaKey()
    const keyRefreshEvery = 80
    let queries = 0

    const byCourse = new Map()
    const jobs = []
    for (const subject of subjects) {
        for (const term of terms) jobs.push({ subject, term })
    }

    for (let i = 0; i < jobs.length; i++) {
        if (queries > 0 && queries % keyRefreshEvery === 0) {
            key = await getNavigatorAlgoliaKey()
        }
        const { subject, term } = jobs[i]
        const hits = await fetchSubjectTermAllHits(key, subject, term, yearLabel)
        queries++
        for (const hit of hits) {
            const id = `${String(hit.subject || '').replace(/\s+/g, '')}${String(hit.catalogNbr || '').replace(/\s+/g, '')}`.toUpperCase()
            if (!id) continue
            if (!byCourse.has(id)) byCourse.set(id, [])
            byCourse.get(id).push(hit)
        }
        if ((i + 1) % 25 === 0 || i === jobs.length - 1) {
            process.stdout.write(`\rNavigator pull ${i + 1}/${jobs.length} jobs, ${byCourse.size} courses`)
        }
    }
    process.stdout.write('\n')

    const courses = []
    for (const hits of byCourse.values()) {
        const course = navHitsToCourse(hits)
        if (course) courses.push(course)
    }
    return courses
}

/**
 * Keep Navigator rows that ExploreCourses missed entirely, or only as empty stubs.
 * Does not overwrite a healthy EC course that already has sections.
 */
function pickNavigatorGaps(existingById, navCourses) {
    const gaps = []
    for (const course of navCourses) {
        const existing = existingById.get(course.course_id)
        if (!existing) {
            gaps.push(course)
            continue
        }
        const existingTerms = existing.terms || []
        // Stale / cleared rows still sit in Supabase with empty terms.
        if (existingTerms.length === 0 && course.sections.length > 0) {
            gaps.push(course)
        }
    }
    return gaps
}

async function loadCourseTermsMap(supabase) {
    const rows = await loadCourses(supabase)
    return new Map(rows.map(row => [row.course_id, row]))
}

async function listBrowseSubjects(academicYear) {
    const browseUrl = `${BROWSE_URL}?view=xml-20200810&academicYear=${academicYear}`
    const browse = parser.parse(await fetchXml(browseUrl))
    const schools = ensureArray(browse?.schools?.school)
    const departments = Array.from(new Set(
        schools.flatMap(school => ensureArray(school?.department))
            .map(department => textVal(department?._name || department?.name))
            .filter(Boolean)
    ))
    return Array.from(new Set([...departments, ...ORPHAN_SUBJECTS])).sort()
}

async function main() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error('Missing env vars. Run with: node --env-file=.env.local scripts/scrape-sections.mjs')
        process.exit(1)
    }

    // Check fast-xml-parser is available
    try { await import('fast-xml-parser') } catch {
        console.error('Missing dependency: run  npm install fast-xml-parser  then retry.')
        process.exit(1)
    }

    const opts = parseArgs()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    if (opts.course) {
        const normalized = opts.course.replace(/\s+/g, '')
        const subject = normalized.match(/^[A-Z&]+/)?.[0] || ''
        const code = normalized.slice(subject.length)
        const course = await fetchSections(subject, code, opts.academicYear)
        if (!course) throw new Error(`Course ${opts.course} not found for ${opts.academicYear}`)
        console.log(JSON.stringify(course, null, opts.dryRun ? 2 : 0))
        if (!opts.dryRun) {
            await upsertCatalog(supabase, [course])
        }
        return
    }

    if (opts.navGaps) {
        console.log(`Navigator gap-fill for ${opts.academicYear}...`)
        const subjects = await listBrowseSubjects(opts.academicYear)
        console.log(`Subjects to query: ${subjects.length}`)
        const navCourses = await fetchNavigatorCourses(opts.academicYear, subjects)
        const existingById = await loadCourseTermsMap(supabase)
        const gaps = pickNavigatorGaps(existingById, navCourses)
        console.log(JSON.stringify({
            academicYear: opts.academicYear,
            navigatorCourses: navCourses.length,
            gaps: gaps.length,
            sampleGapIds: gaps.slice(0, 30).map(c => c.course_id),
            dryRun: opts.dryRun,
        }, null, 2))
        if (opts.dryRun) return
        if (gaps.length) await upsertCatalog(supabase, gaps)
        console.log(`Done. Upserted ${gaps.length} Navigator gap courses.`)
        return
    }

    console.log(`Fetching Stanford catalog for ${opts.academicYear}...`)
    const { departments, courses: ecCourses } = await fetchCatalog(opts.academicYear)

    console.log('Filling ExploreCourses holes from Navigator...')
    const navSubjects = Array.from(new Set([...departments, ...ORPHAN_SUBJECTS])).sort()
    let courses = ecCourses
    try {
        const navCourses = await fetchNavigatorCourses(opts.academicYear, navSubjects)
        const ecById = new Map(ecCourses.map(c => [c.course_id, c]))
        const gaps = pickNavigatorGaps(ecById, navCourses)
        if (gaps.length) {
            const merged = new Map(ecById)
            for (const gap of gaps) merged.set(gap.course_id, gap)
            courses = Array.from(merged.values())
            console.log(`Merged ${gaps.length} Navigator-only courses into catalog`)
        } else {
            console.log('No Navigator gaps to merge')
        }
    } catch (err) {
        console.warn(`  ⚠ Navigator gap-fill skipped: ${err.message}`)
    }

    console.log('Loading current Supabase course IDs...')
    const existingRows = await loadCourses(supabase)
    const existingById = new Map(existingRows.map(row => [row.course_id, row]))
    const existingIds = new Set(existingById.keys())
    const incomingIds = new Set(courses.map(course => course.course_id))
    const newCourses = courses.filter(course => !existingIds.has(course.course_id))
    const staleIds = existingRows.filter(row => !incomingIds.has(row.course_id)).map(row => row.course_id)
    const scheduled = courses.filter(course => course.sections.length > 0).length
    const terms = sortTerms(Array.from(new Set(courses.flatMap(course => course.terms))))

    console.log(JSON.stringify({
        academicYear: opts.academicYear,
        departments: departments.length,
        courses: courses.length,
        scheduled,
        newCourses: newCourses.length,
        staleCourses: staleIds.length,
        terms,
        sampleNewCourseIds: newCourses.slice(0, 20).map(course => course.course_id),
        dryRun: opts.dryRun,
    }, null, 2))

    if (opts.dryRun) return

    const rowsToUpsert = opts.resume
        ? courses.filter(course => JSON.stringify(course.terms) !== JSON.stringify(existingById.get(course.course_id)?.terms || []))
        : courses
    if (opts.resume) console.log(`Resume mode: ${rowsToUpsert.length}/${courses.length} course rows still need the new year.`)
    if (opts.resume) await updateCatalog(supabase, rowsToUpsert)
    else await upsertCatalog(supabase, rowsToUpsert)
    await clearStaleCourses(supabase, staleIds)
    console.log(`Done. Refreshed ${courses.length} courses; cleared ${staleIds.length} stale schedules.`)
}

main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
})

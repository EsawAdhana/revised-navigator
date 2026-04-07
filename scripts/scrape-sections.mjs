/**
 * Scrape section data from Stanford's ExploreCourses XML API and update Supabase.
 *
 * Usage:
 *   node --env-file=.env.local scripts/scrape-sections.mjs                  # full run
 *   node --env-file=.env.local scripts/scrape-sections.mjs --resume         # resume from progress file
 *   node --env-file=.env.local scripts/scrape-sections.mjs --course CS106B  # single course
 *   node --env-file=.env.local scripts/scrape-sections.mjs --limit 50       # first N courses
 */

import { createClient } from '@supabase/supabase-js'
import { XMLParser } from 'fast-xml-parser'
import { readFileSync, writeFileSync, existsSync } from 'fs'

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CONCURRENCY = 10      // parallel requests
const DELAY_MS = 80         // ms between batches
const PROGRESS_FILE = '.sections-scrape-progress.json'
const BASE_URL = 'https://explorecourses.stanford.edu/search'

// NQTR attribute value → human-readable term
const NQTR_MAP = {
    AUT: 'Autumn 2025',
    WIN: 'Winter 2026',
    SPR: 'Spring 2026',
    SUM: 'Summer 2026',
    // older terms just in case
    FAL: 'Autumn 2025',
}

// ── Args ────────────────────────────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2)
    const opts = { resume: false, limit: null, course: null }
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--resume') opts.resume = true
        if (args[i] === '--limit' && args[i + 1]) opts.limit = parseInt(args[i + 1], 10)
        if (args[i] === '--course' && args[i + 1]) opts.course = args[i + 1].trim().toUpperCase()
    }
    return opts
}

// ── Progress ─────────────────────────────────────────────────────────────────

function loadProgress() {
    if (!existsSync(PROGRESS_FILE)) return new Set()
    try { return new Set(JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'))) } catch { return new Set() }
}

function saveProgress(done) {
    writeFileSync(PROGRESS_FILE, JSON.stringify(Array.from(done)))
}

// ── XML Parsing ───────────────────────────────────────────────────────────────

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '_',
    isArray: (name) => ['course', 'section', 'schedule', 'instructor', 'attribute', 'day'].includes(name),
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

function parseSection(sectionNode, courseNode) {
    const schedules = ensureArray(sectionNode?.schedules?.schedule)

    const meetings = schedules.map(sched => ({
        days: parseDays(sched),
        time: [sched?.startTime, sched?.endTime].filter(Boolean).join(' – '),
        location: sched?.location || '',
        instructors: ensureArray(sched?.instructors?.instructor).map(i => i?.name || '').filter(Boolean),
    }))

    return {
        term: parseSectionTerm(sectionNode),
        classId: parseInt(sectionNode?.classId, 10) || 0,
        sectionNumber: String(sectionNode?.sectionNumber || ''),
        component: sectionNode?.component || '',
        units: (() => {
            const min = textVal(sectionNode?.minUnits)
            const max = textVal(sectionNode?.maxUnits)
            if (min && max && min !== max) return `${min}-${max}`
            return max || min || ''
        })(),
        grading: courseNode?.grading || '',
        classLevel: textVal(sectionNode?.classLevel) || '',
        instructionalMode: sectionNode?.instructionalMode || '',
        status: sectionNode?.currentlyEnrolled || '',
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

async function fetchSections(subject, code) {
    const query = `${subject}${code}`.replace(/\s+/g, '')
    const url = `${BASE_URL}?q=${encodeURIComponent(query)}&view=xml-20200810&filter-coursestatus-Active=on`

    let xml
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Cookie': 'jsenabled=1',
                },
                signal: AbortSignal.timeout(10000),
            })
            if (!res.ok) return null
            xml = await res.text()
            break
        } catch {
            if (attempt === 2) return null
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        }
    }

    if (!xml) return null

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

        const baseMatch = matchedCourses[0]
        const allSections = []
        for (const c of matchedCourses) {
            const secs = ensureArray(c?.sections?.section)
            allSections.push(...secs.map(sec => parseSection(sec, c)))
        }

        // Deduplicate sections by classId
        const uniqueSections = []
        const seenIds = new Set()
        for (const s of allSections) {
            if (!seenIds.has(s.classId)) {
                uniqueSections.push(s)
                seenIds.add(s.classId)
            }
        }

        const terms = Array.from(new Set(uniqueSections.map(s => s.term).filter(Boolean)))

        return {
            sections: uniqueSections,
            terms,
            description: (baseMatch.description || '')
                .replace(/&#[A-Z]+\s+039;/g, "'")
                .replace(/&#039;/g, "'")
                .replace(/&#[A-Z]+\s+034;/g, '"')
                .replace(/&amp;/g, '&'),
            title: baseMatch.title || '',
            units: [baseMatch.unitsMin, baseMatch.unitsMax].filter(u => u && u !== '0').join('-') || baseMatch.unitsMin || '',
            grading: baseMatch.grading || '',
        }
    } catch (e) {
        console.error(`  XML parse error for ${subject}${code}:`, e.message)
        return null
    }
}

// ── Supabase ──────────────────────────────────────────────────────────────────

async function loadCourses(supabase) {
    const rows = []
    const PAGE = 1000
    let offset = 0
    while (true) {
        const { data, error } = await supabase
            .from('courses')
            .select('course_id, subject, code')
            .range(offset, offset + PAGE - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < PAGE) break
        offset += PAGE
    }
    return rows
}

// ── Main ──────────────────────────────────────────────────────────────────────

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

    console.log('📚 Loading courses from Supabase...')
    let courses = await loadCourses(supabase)

    // Single-course mode
    if (opts.course) {
        const [subj, ...codeParts] = opts.course.split(/\s+/)
        const code = codeParts.join('') || opts.course.replace(/[A-Z]+/, '')
        const normTarget = opts.course.replace(/\s+/g, '')
        courses = courses.filter(c => `${c.subject}${c.code}`.replace(/\s+/g, '') === normTarget)
        if (courses.length === 0) {
            console.error(`❌ Course ${opts.course} not found in Supabase`)
            process.exit(1)
        }
    }

    const done = opts.resume ? loadProgress() : new Set()
    const remaining = courses.filter(c => !done.has(c.course_id))
    const limit = opts.limit ? Math.min(opts.limit, remaining.length) : remaining.length
    const toProcess = remaining.slice(0, limit)

    console.log(`📦 ${courses.length} total courses | ${done.size} already done | processing ${toProcess.length}`)
    console.log(`⚡ Concurrency: ${CONCURRENCY} | Delay: ${DELAY_MS}ms between batches`)
    console.log(`\n🚀 Starting scrape...\n`)

    let processed = 0
    let withSections = 0
    let noSections = 0
    let errors = 0

    for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
        const batch = toProcess.slice(i, i + CONCURRENCY)

        await Promise.all(batch.map(async (course) => {
            try {
                const result = await fetchSections(course.subject, course.code)

                if (!result) {
                    noSections++
                    done.add(course.course_id)
                    processed++
                    return
                }

                const { sections, terms, ...metadata } = result

                const { error } = await supabase
                    .from('courses')
                    .update({
                        sections,
                        terms,
                        description: metadata.description,
                        title: metadata.title,
                        units: metadata.units,
                        grading: metadata.grading
                    })
                    .eq('course_id', course.course_id)

                if (error) {
                    errors++
                    console.error(`  ❌ ${course.course_id}: ${error.message}`)
                } else {
                    if (sections.length > 0) withSections++
                    else noSections++
                    done.add(course.course_id)
                }
            } catch (e) {
                errors++
                console.error(`  ❌ ${course.course_id}: ${e.message}`)
            }
            processed++
        }))

        saveProgress(done)

        const pct = ((processed / toProcess.length) * 100).toFixed(1)
        const eta = Math.round(((toProcess.length - processed) / CONCURRENCY) * (DELAY_MS / 1000))
        process.stdout.write(`\r[${processed}/${toProcess.length}] ${pct}% | ✅ ${withSections} with sections | ⬜ ${noSections} empty | ETA ~${eta}s   `)

        if (i + CONCURRENCY < toProcess.length) {
            await new Promise(r => setTimeout(r, DELAY_MS))
        }
    }

    console.log(`\n\n🎉 Done!`)
    console.log(`  Processed: ${processed}`)
    console.log(`  With sections: ${withSections}`)
    console.log(`  No sections found (inactive/no schedule): ${noSections}`)
    console.log(`  Errors: ${errors}`)
}

main().catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
})

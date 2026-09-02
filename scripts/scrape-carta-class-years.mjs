#!/usr/bin/env node

/**
 * Fetch Carta's class-level enrollment breakdown for every course we list.
 *
 * Usage:
 *   node --env-file=.env.local scripts/scrape-carta-class-years.mjs --dry-run
 *   node --env-file=.env.local scripts/scrape-carta-class-years.mjs
 *   node --env-file=.env.local scripts/scrape-carta-class-years.mjs --course CS106A --dry-run
 *   CARTA_AUTH_TOKEN=... node --env-file=.env.local scripts/scrape-carta-class-years.mjs
 *
 * One manual SSO login, then direct HTTP -- Carta authenticates with a bearer token
 * it leaves in the `authToken` cookie, not a session cookie, so the browser is only
 * needed to obtain that token. Pass CARTA_AUTH_TOKEN to skip the browser entirely.
 *
 * Carta rate-limits this API to roughly 2.6 SUCCESSFUL requests/s, and that ceiling is
 * the whole cost model. Measured over 40s trials: a 4/s schedule returns 111 x 200 and
 * 49 x 429 (goodput 2.60/s); a 6/s schedule returns 112 x 200 and 128 x 429 (goodput
 * 2.68/s). Pushing harder buys nothing and just burns Retry-Afters of up to 11s, so the
 * default paces at the ceiling instead of above it. A full 9.5k pass is ~60 min.
 *
 * Because that hour cannot be shortened, the queue is ordered by evaluation sample size
 * descending, which is a strong predictor of whether Carta holds anything at all --
 * measured over 1,541 courses: 91% hit rate at 100+ ratings, 84% at 30-99, 42% at 1-29,
 * and 11% for courses with no evaluations. High-yield, high-traffic courses therefore
 * get their chart in the first few minutes and the long tail fills in behind them.
 *
 * Resume is by re-running: courses already stored are skipped unless --force.
 */

import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'

const CARTA = 'https://carta-beta.stanford.edu'
const API = `${CARTA}/api`
const PROFILE_DIR = '.carta-profile'
// Identifies us to Carta's operators with a way to ask us to stop.
const USER_AGENT = 'StanfordRootBot/0.1 (+https://www.stanfordroot.com; carta scrape; eadhana@stanford.edu)'

function parseArgs() {
    const argv = process.argv.slice(2)
    const value = name => {
        const index = argv.indexOf(name)
        return index === -1 ? null : argv[index + 1]
    }
    return {
        dryRun: argv.includes('--dry-run'),
        force: argv.includes('--force'),
        course: value('--course'),
        rate: Number(value('--rate') || 2.5),
        limit: Number(value('--limit') || 0),
    }
}

/** Our course_id is Carta's code with the space removed: "CS 106A" -> "CS106A". */
function courseIdForCartaCode(code) {
    return String(code || '').replace(/\s+/g, '').toUpperCase()
}

async function login() {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        channel: 'chrome',
        headless: false,
        viewport: { width: 1280, height: 800 },
    })
    const page = context.pages()[0] || await context.newPage()
    await page.goto(`${API}/authentication/login/?redirect=%2F`)
    console.log('Complete Stanford login and two-step verification in the opened browser.')
    // The token is set on the redirect back to Carta, so wait for the cookie itself
    // rather than for a URL -- the app lands on "/" both before and after login.
    const deadline = Date.now() + 10 * 60 * 1000
    let token = null
    while (Date.now() < deadline) {
        const cookies = await context.cookies(CARTA)
        token = cookies.find(cookie => cookie.name === 'authToken')?.value || null
        if (token) break
        await page.waitForTimeout(1000)
    }
    await context.close()
    if (!token) throw new Error('No Carta authToken cookie after login')
    return token
}

/** Global pacer: one shared schedule, so concurrency never exceeds `rate` overall. */
function pacer(rate) {
    let next = Date.now()
    return async () => {
        const now = Date.now()
        const at = Math.max(now, next)
        next = at + 1000 / rate
        const wait = at - Date.now()
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    }
}

async function getJson(url, token, pace) {
    for (let attempt = 0; attempt < 6; attempt++) {
        await pace()
        // A transient `fetch failed` (connection reset, DNS blip) must not end an
        // hour-long pass. It killed one 500-course run at the 4-minute mark, so network
        // errors retry here and only an auth failure is allowed to propagate.
        let res
        try {
            res = await fetch(url, {
                headers: { Authorization: `Token ${token}`, 'User-Agent': USER_AGENT },
            })
        } catch {
            await new Promise(resolve => setTimeout(resolve, (2 + attempt * 2) * 1000))
            continue
        }
        if (res.ok) {
            try {
                return await res.json()
            } catch {
                await new Promise(resolve => setTimeout(resolve, (1 + attempt) * 1000))
                continue
            }
        }
        if (res.status === 401 || res.status === 403) {
            throw new Error(`Carta rejected the token (${res.status}) -- log in again`)
        }
        if (res.status === 429) {
            // Carta's Retry-After is authoritative (1-11s observed); adding an attempt
            // penalty on top of it just idles a worker the server was ready to serve.
            const after = Number(res.headers.get('Retry-After') || 2)
            await new Promise(resolve => setTimeout(resolve, after * 1000 + 250))
            continue
        }
        if (res.status >= 500) {
            await new Promise(resolve => setTimeout(resolve, (1 + attempt) * 1000))
            continue
        }
        // 404 is normal: Carta's index lists courses its graph service has no record
        // of. Anything else is worth seeing, so the status travels with the failure
        // rather than collapsing into a bare null the caller cannot explain.
        return { __status: res.status }
    }
    return { __status: 'exhausted' }
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

async function main() {
    const opts = parseArgs()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(url, key, { auth: { persistSession: false } })

    const token = process.env.CARTA_AUTH_TOKEN || await login()
    const pace = pacer(opts.rate)

    const [courses, stored] = await Promise.all([
        loadAll(supabase, 'courses', 'course_id, quality_n'),
        opts.force ? [] : loadAll(supabase, 'course_class_years', 'course_id'),
    ])
    // Largest eval sample per course_id: the table has one row per term/cross-listing.
    const evalSampleSize = new Map()
    for (const course of courses) {
        const id = course.course_id.toUpperCase()
        evalSampleSize.set(id, Math.max(evalSampleSize.get(id) || 0, course.quality_n || 0))
    }
    const ours = new Set(evalSampleSize.keys())
    const already = new Set(stored.map(row => row.course_id.toUpperCase()))

    // One request for the whole 12k-course index, rather than a /courses/codes/ lookup
    // per course: the index is the only place that carries the UUID /graphs/ needs.
    const index = await getJson(`${API}/search/index`, token, pace)
    if (!index?.courses) throw new Error('Carta search index returned no courses')

    let targets = []
    const seen = new Set()
    for (const course of index.courses) {
        const courseId = courseIdForCartaCode(course.code)
        if (!courseId || seen.has(courseId)) continue
        if (!ours.has(courseId)) continue
        seen.add(courseId)
        targets.push({ courseId, uuid: course.id })
    }
    const inCarta = targets.length
    if (opts.course) targets = targets.filter(target => target.courseId === opts.course.toUpperCase())
    if (!opts.force) targets = targets.filter(target => !already.has(target.courseId))
    // Fetched most-reviewed first, so the courses students actually open get their
    // chart in the first minutes of an hour-long pass. Workers pop from the end.
    targets.sort((a, b) => (evalSampleSize.get(a.courseId) || 0) - (evalSampleSize.get(b.courseId) || 0))
    if (opts.limit) targets = targets.slice(-opts.limit)

    console.log(`${ours.size} courses on the site, ${inCarta} of them in Carta's index, ${targets.length} to fetch at ${opts.rate}/s`)

    const targetCount = targets.length
    let done = 0
    let withData = 0
    let empty = 0
    let failed = 0
    const failures = new Map()
    const pending = []
    const flush = async () => {
        if (opts.dryRun || pending.length === 0) return
        const batch = pending.splice(0, pending.length)
        const { error } = await supabase.from('course_class_years').upsert(batch, { onConflict: 'course_id' })
        if (error) throw error
    }

    const started = Date.now()
    const workers = Array.from({ length: 8 }, async () => {
        for (;;) {
            const target = targets.pop()
            if (!target) return
            let graphs
            try {
                graphs = await getJson(`${API}/courses/${target.uuid}/graphs/`, token, pace)
            } catch (error) {
                console.error(error.message)
                process.exit(1)
            }
            // Counted here, before any of the three outcomes returns, so progress
            // reflects requests made rather than only the ones that had data -- the
            // earlier version tested the milestone inside the success path and skipped
            // most multiples of it.
            done++
            if (done % 250 === 0) {
                const elapsed = (Date.now() - started) / 1000
                console.log(`  ${done}/${targetCount} fetched (${(done / elapsed).toFixed(1)}/s) -- ${withData} with data, ${empty} with none, ${failed} failed`)
            }
            if (graphs?.__status) {
                failed++
                failures.set(graphs.__status, (failures.get(graphs.__status) || 0) + 1)
                continue
            }
            const years = graphs?.years
            const values = Array.isArray(years?.values) ? years.values : null
            const total = values ? values.reduce((sum, count) => sum + count, 0) : 0
            if (!values || total === 0) {
                empty++
                continue
            }
            const levels = {}
            years.columns.forEach((column, i) => { levels[column] = values[i] })
            pending.push({
                course_id: target.courseId,
                levels,
                total,
                carta_uuid: target.uuid,
                updated_at: new Date().toISOString(),
            })
            withData++
            if (pending.length >= 50) await flush()
        }
    })
    await Promise.all(workers)
    await flush()

    const byStatus = [...failures.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => `${count}x ${status}`).join(', ')
    console.log(`${withData} courses stored, ${empty} had no class-year data, ${failed} failed${byStatus ? ` (${byStatus})` : ''}`)
    if (opts.dryRun) console.log('(dry run -- nothing written)')
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})

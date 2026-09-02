/**
 * Freeze the reviewed bare-number course links into src/lib/course-bare-links.json.
 *
 *   npm run build:course-links
 *
 * Candidates are exactly the spans the renderer would guess at: a bare number in
 * prerequisite-ish context that resolves under the page's own subject. Verdicts in
 * course-link-verdicts.ts drop the ones that are not courses and re-point the ones
 * whose subject is named in the sentence. Everything else was reviewed and kept.
 *
 * Reports stale verdicts (no longer matching any description) and any candidate
 * whose context has changed since the review, so a catalog refresh cannot quietly
 * ship unreviewed guesses.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { decodeHtmlEntities, normalizeCatalogDescription } from '../src/lib/utils'
import { hashDescription } from '../src/lib/course-bare-links'
import { VERDICTS, parseWhere } from './course-link-verdicts'

const CTX =
    /\b(?:prerequisites?|prereqs?|corequisites?|co-?\s*requisites?|recommended|recommendations?|requirements?|suggested|prior\s+courses?|concurrent\s+enrollment)\b/i
/** Mirrors src/components/course-description.tsx. Group 3 is a bare number. */
const RENDER_RE = /\b(?:([A-Z]{2,4})\s*(\d{1,3}[A-Z]?)|(\d{2,3}[A-Z]?))\b/g

type Course = { course_id: string; subject: string; code: string; description?: string }

const courses: Course[] = JSON.parse(readFileSync('data/catalog/full.json', 'utf8'))
const ids = new Map(courses.map(c => [`${c.subject}|${c.code}`, c.course_id]))

const parsed = VERDICTS.map(v => ({ verdict: v, ...parseWhere(v.where) }))
const used = new Set<string>()

/**
 * Every span that was actually read during review, as "courseId|span|context".
 * A candidate missing from this list is new prose nobody has judged, so it is
 * reported and left unlinked instead of silently inheriting the page's subject.
 * Regenerate with --snapshot only after reviewing what it reports.
 */
const SNAPSHOT_PATH = 'scripts/course-link-review.snapshot.json'
const writeSnapshot = process.argv.includes('--snapshot')
const snapshot: Set<string> = new Set(
    existsSync(SNAPSHOT_PATH) && !writeSnapshot ? JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) : [],
)
const seen: string[] = []
const unreviewed: string[] = []

const out: Record<string, Array<[number, number, string]>> = {}
let kept = 0
let rejected = 0
let retargeted = 0
let dropped = 0

for (const course of courses) {
    if (!course.description) continue
    // Must match what the renderer sees: rowToCourse normalises, then the
    // component decodes entities.
    const text = decodeHtmlEntities(normalizeCatalogDescription(course.description))
    const links: Array<[number, number, string]> = []
    RENDER_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = RENDER_RE.exec(text)) !== null) {
        const bare = m[3]
        if (!bare) continue
        const pageId = ids.get(`${course.subject}|${bare}`)
        if (!pageId) continue
        if (!CTX.test(text.slice(Math.max(0, m.index - 480), m.index))) continue

        // A verdict applies when its literal context appears in this description
        // and lines up with this exact span.
        let verdict = null
        for (const p of parsed) {
            let from = 0
            let at: number
            while ((at = text.indexOf(p.text, from)) !== -1) {
                if (at + p.spanOffset === m.index && p.span === bare) { verdict = p; break }
                from = at + 1
            }
            if (verdict) break
        }
        if (verdict) used.add(verdict.verdict.where)

        // Anchored to surrounding prose, not to an offset, so unrelated edits
        // elsewhere in the description do not invalidate a reviewed judgement.
        const fingerprint = `${course.course_id}|${bare}|${text.slice(Math.max(0, m.index - 40), m.index).replace(/\s+/g, ' ')}`
        seen.push(fingerprint)
        if (!writeSnapshot && !snapshot.has(fingerprint)) { unreviewed.push(fingerprint); continue }

        if (verdict?.verdict.kind === 'reject') { rejected++; continue }

        const subject = verdict?.verdict.kind === 'retarget' ? verdict.verdict.subject : course.subject
        const target = ids.get(`${subject}|${bare}`)
        if (!target) { dropped++; continue } // retargeted to a subject that no longer offers it
        if (verdict) retargeted++
        else kept++
        links.push([m.index, bare.length, target])
    }
    if (links.length) {
        // Not keyed by text alone: cross-listings share a description but each
        // resolves bare numbers against its own subject.
        out[`${course.course_id}:${hashDescription(text)}`] = links
    }
}

const stale = parsed.filter(p => !used.has(p.verdict.where)).map(p => p.verdict.where)

if (writeSnapshot) {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(seen, null, 0) + '\n')
    console.log(`wrote review snapshot: ${seen.length} spans`)
}
writeFileSync('src/lib/course-bare-links.json', JSON.stringify(out, null, 0) + '\n')

console.log(`courses with reviewed links: ${Object.keys(out).length}`)
console.log(`  kept as page subject: ${kept}`)
console.log(`  re-pointed by review:  ${retargeted}`)
console.log(`  rejected (not a course): ${rejected}`)
console.log(`  dropped (subject no longer offers it): ${dropped}`)
if (unreviewed.length) {
    console.log(`\nUNREVIEWED (${unreviewed.length}) — new prose since the last review, left unlinked:`)
    for (const u of unreviewed.slice(0, 40)) console.log(`  ${u}`)
    if (unreviewed.length > 40) console.log(`  …and ${unreviewed.length - 40} more`)
    process.exitCode = 1
}
if (stale.length) {
    console.log(`\nSTALE VERDICTS (${stale.length}) — context no longer in the catalog, re-review:`)
    for (const s of stale) console.log(`  ${s}`)
    process.exitCode = 1
}

/**
 * Emit every bare-number course-link candidate in the catalog, with context,
 * for human review. Bare numbers are the ambiguous case: "Prerequisite: 240"
 * is a course, "at least 30 hours" and "E2 300P" are not, and no regex can
 * tell them apart. Explicit "SUBJ NUM" references (subject present in the text
 * AND a real subject code) are not listed — there is nothing to adjudicate.
 *
 * The span set here is exactly what the renderer treats as bare, so a reviewed
 * allowlist covers every guess the renderer can make.
 *
 *   node scripts/course-link-candidates.mjs            # grouped review sheet
 *   node scripts/course-link-candidates.mjs --json     # machine-readable rows
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const CTX =
    /\b(?:prerequisites?|prereqs?|corequisites?|co-?\s*requisites?|recommended|recommendations?|requirements?|suggested|prior\s+courses?|concurrent\s+enrollment)\b/i
/** Mirrors src/components/course-description.tsx — group 3 is a bare number. */
const RENDER_RE = /\b(?:([A-Z]{2,4})\s*(\d{1,3}[A-Z]?)|(\d{2,3}[A-Z]?))\b/g
/** Any "Word 123" pair, so we can see which subject the sentence actually named. */
const NAMED_RE = /\b([A-Z][A-Za-z&]{1,13})\s*(\d{1,3}[A-Z]?)\b/g

const courses = JSON.parse(readFileSync('data/catalog/full.json', 'utf8'))
const ids = new Map(courses.map(c => [`${c.subject}|${c.code}`, c.course_id]))
const subjects = new Set(courses.map(c => c.subject))

/** Nearest subject word named before `offset`, within the same clause. */
function namedSubjectBefore(text, offset) {
    const clauseStart = Math.max(0, text.lastIndexOf('. ', offset), text.lastIndexOf('; ', offset))
    const clause = text.slice(clauseStart, offset)
    let found = null
    NAMED_RE.lastIndex = 0
    let m
    while ((m = NAMED_RE.exec(clause)) !== null) found = m[1]
    if (!found) return null
    const up = found.toUpperCase()
    return { word: found, subject: subjects.has(up) ? up : null }
}

export function candidatesFor(course) {
    const text = course.description || ''
    const out = []
    RENDER_RE.lastIndex = 0
    let m
    while ((m = RENDER_RE.exec(text)) !== null) {
        const bare = m[3]
        if (!bare) continue
        const pageId = ids.get(`${course.subject}|${bare}`)
        if (!pageId) continue // renderer would not link it anyway
        if (!CTX.test(text.slice(Math.max(0, m.index - 480), m.index))) continue
        const named = namedSubjectBefore(text, m.index)
        const conflict = named && named.subject !== course.subject
        out.push({
            span: bare,
            offset: m.index,
            pageSubject: course.subject,
            pageId,
            namedWord: conflict ? named.word : null,
            namedSubject: conflict ? named.subject : null,
            namedId: conflict && named.subject ? ids.get(`${named.subject}|${bare}`) || null : null,
            before: text.slice(Math.max(0, m.index - 72), m.index).replace(/\s+/g, ' '),
            after: text.slice(m.index + bare.length, m.index + bare.length + 30).replace(/\s+/g, ' '),
        })
    }
    return out
}

const rows = []
for (const c of courses) {
    for (const cand of candidatesFor(c)) {
        rows.push({ courseId: c.course_id, hash: createHash('sha1').update(c.description).digest('hex').slice(0, 12), ...cand })
    }
}

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 1))
} else {
    // Collapse cross-listings and repeated boilerplate: identical context is
    // one judgement, not N.
    const groups = new Map()
    for (const r of rows) {
        const key = `${r.before}|${r.span}|${r.after}|${r.pageSubject}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(r)
    }
    console.log(`${rows.length} candidate spans, ${groups.size} distinct contexts to judge\n`)
    let i = 0
    for (const [, g] of groups) {
        const r = g[0]
        const dupes = g.length > 1 ? ` x${g.length}(${g.slice(0, 3).map(x => x.courseId).join(',')}${g.length > 3 ? ',…' : ''})` : ''
        const target = r.namedWord
            ? `page:${r.pageId} BUT sentence says ${r.namedWord}${r.namedId ? ` -> ${r.namedId}` : ' (unresolved)'}`
            : r.pageId
        console.log(`${String(++i).padStart(3)} [${target}]${dupes} ${g[0].courseId}`)
        console.log(`     …${r.before}«${r.span}»${r.after}…`)
    }
}

/**
 * The one place an evaluation question is classified, and the one place duplicate
 * reports are collapsed.
 *
 * Plain .mjs so the scraper (plain node), the audit and the browser all share it. They
 * MUST share it: the headline rating is computed from these reports server-side and the
 * charts under it are computed from the same reports in the browser, so any divergence in
 * classification or de-duplication makes the two count different students.
 */

/** @typedef {'quality'|'learning'|'organization'|'goals'|'hours'|'attendance_in_person'|'attendance_online'|'unknown'} QuestionCategory */

/** Quarter digit of a PeopleSoft strm -> season. Autumn is reported as "Fall"
 *  to match every other term string in the `evaluations` table, so a Law term
 *  and a university term for the same quarter collapse to one chip. */
const STRM_SEASON = { 2: 'Fall', 4: 'Winter', 6: 'Spring', 8: 'Summer' }

/**
 * Term for a strm code, by the same rule as `strmForTerm` in `lib/seats.ts`:
 * 1 + (last two digits of the academic year's END) + quarter. Autumn falls in
 * the calendar year before the academic year ends; the other three don't.
 * Returns null for anything that isn't a plausible strm.
 *
 * @param {number} strm
 * @returns {string | null}
 */
function termFromStrm(strm) {
    if (!Number.isInteger(strm) || strm < 1000 || strm > 1999) return null
    const season = STRM_SEASON[strm % 10]
    if (!season) return null
    const acadYearEnd = 2000 + Math.floor((strm % 1000) / 10)
    return `${season} ${season === 'Fall' ? acadYearEnd - 1 : acadYearEnd}`
}

/**
 * Normalize an EvaluationKit term label. Three shapes exist, because the Law
 * School's project names come from a different template than the rest of the
 * university's:
 *
 *   "Fall 2024School of Medicine"                        -> Fall 2024
 *   "1244 SLS Winter 2023-24Law School Regular Courses"  -> Winter 2024
 *   "Law1236Law School Regular Courses"                  -> Spring 2023
 *
 * The trailing glue is the same scrape artifact in all three: the page renders
 * term and project group as adjacent inline nodes with no delimiter.
 *
 * The Law shapes must be decoded from the leading strm rather than by the
 * generic rule below, because that rule keeps the FIRST four-digit run -- which
 * for a Law label is the strm, not the year. That silently threw the real term
 * away and rendered a bare "1244" as a term chip on 75 course pages.
 *
 * Lives here rather than next to the client row mapper because de-duplication
 * keys on the term, and the scraper (plain node) has to key on it the same way:
 * the Feb-2026 scrape stored the glued shape, so a raw comparison reads an
 * already-stored report as new and inserts a second copy of it.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeTerm(raw) {
    const value = String(raw ?? '')
    const sls = value.match(/^(1\d{3})\s+SLS\b/) || value.match(/^Law(1\d{3})/)
    if (sls) {
        const decoded = termFromStrm(parseInt(sls[1], 10))
        if (decoded) return decoded
    }
    return value.replace(/(\d{4})\D.*$/, '$1')
}

/**
 * @param {string} text
 * @returns {QuestionCategory}
 */
export function categorizeQuestion(text) {
    const t = (text || '').toLowerCase()
    if (t.includes('quality') || t.includes('overall')) return 'quality'
    if (t.includes('how much did you learn')) return 'learning'
    if (t.includes('organized')) return 'organization'
    if (t.includes('learning goals')) return 'goals'
    // Hours: "hours per week", "how many hours...week", or "hours" + "week"
    // (Stanford: "How many hours per week on average did you spend...")
    if (t.includes('hours per week') || (t.includes('hours') && t.includes('week'))) return 'hours'
    if (t.includes('percent') && t.includes('in person')) return 'attendance_in_person'
    if (t.includes('percent') && t.includes('online')) return 'attendance_online'
    return 'unknown'
}

/** The 1-5 rating questions that make up a course's score, in display order. */
export const RATING_QUESTION_CATEGORIES = ['quality', 'learning', 'organization']

/**
 * A stable fingerprint of a report's course-level rating answers.
 *
 * Key-order independent on purpose: Postgres normalises jsonb key order, so comparing
 * serialised objects reported 19% of identical reports as differing.
 *
 * @param {{ questions?: Array<{ text?: unknown, options?: Array<{ weight?: unknown, count?: unknown }> }> }} report
 */
export function courseLevelSignature(report) {
    const parts = []
    for (const question of report?.questions || []) {
        const category = categorizeQuestion(String(question?.text ?? ''))
        if (!RATING_QUESTION_CATEGORIES.includes(category)) continue
        const counts = (question?.options || [])
            .filter(o => Number(o?.weight) >= 1 && Number(o?.weight) <= 5)
            .sort((a, b) => Number(a.weight) - Number(b.weight))
            .map(o => Number(o?.count) || 0)
            .join(',')
        parts.push(`${category}:${counts}`)
    }
    return parts.sort().join('|')
}

/**
 * One report per section per distinct set of course-level answers.
 *
 * A co-taught section files the SAME course-level answers once per instructor, so
 * pooling every row counted the same students two to thirteen times -- 21.4% of all
 * responses, and because the number of listed instructors varies by term it silently
 * re-weighted terms against each other (RADO 251 Fall 2025: four students counted as
 * sixteen). 98.55% of multi-instructor sections carry byte-identical course-level
 * answers, so collapsing them is exact rather than a heuristic.
 *
 * The exception is preserved: 57 Law School sections genuinely differ, because their
 * question is per-instructor ("the instructor was effective as a teacher"). Those have
 * different signatures and both copies survive.
 *
 * Instructor-level views must NOT use this -- they need one row per instructor.
 *
 * @template {{ courseCode?: unknown, course_code?: unknown, term?: unknown }} T
 * @param {T[]} reports
 * @returns {T[]}
 */
export function dedupeCourseLevelReports(reports) {
    const seen = new Set()
    const out = []
    for (const report of reports || []) {
        if (!report) continue
        const code = report.courseCode ?? report.course_code ?? ''
        const key = `${code}||${normalizeTerm(report.term)}||${courseLevelSignature(report)}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(report)
    }
    return out
}

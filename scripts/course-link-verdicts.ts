/**
 * Review record for bare-number course references in catalog descriptions.
 *
 * A "bare number" is a course reference with no subject attached — "Prerequisite:
 * 240". The renderer has to guess a subject for those, and guessing is wrong for
 * page counts, clock times, yardage, room numbers and URLs. Every bare span the
 * renderer can reach was read in context once (693 distinct contexts across 8,648
 * descriptions); the exceptions are below. Anything not listed here was judged a
 * genuine reference to a course in the page's own subject.
 *
 * `where` is a literal slice of the DECODED description with the span in [[…]],
 * so each verdict is anchored to prose a human can check, not to a byte offset.
 * A verdict that no longer matches any description is reported by the build as
 * stale rather than silently ignored.
 */
export type Verdict =
    | { kind: 'reject'; where: string; why: string }
    | { kind: 'retarget'; where: string; subject: string }

/** Numbers that are not courses at all. */
const REJECTS: Verdict[] = [
    { kind: 'reject', where: 'or [[60]] hours (2 units)', why: 'training hours' },
    { kind: 'reject', where: 'training time in the [[10]] week quarter', why: 'quarter length' },
    { kind: 'reject', where: 'and [[100]]% clean', why: 'percentage' },
    { kind: 'reject', where: 'Prerequisite: [[100]]-level course in Spanish', why: 'course level, not a course' },
    { kind: 'reject', where: 'roughly [[25]] pages', why: 'page count' },
    { kind: 'reject', where: 'due 9/13/[[25]]', why: 'date' },
    { kind: 'reject', where: 'Where: E2 [[300P]]', why: 'room number' },
    { kind: 'reject', where: 'CVRC CV-[[267]]', why: 'room number' },
    { kind: 'reject', where: 'write a [[90]]-page film script', why: 'page count' },
    { kind: 'reject', where: 'completed [[135]] units', why: 'unit count' },
    { kind: 'reject', where: '?page_id=[[23]]', why: 'URL query value' },
    { kind: 'reject', where: '?page_id=[[39]]', why: 'URL query value' },
    { kind: 'reject', where: 'numbered over [[99]]', why: 'course-number threshold' },
    { kind: 'reject', where: 'numbered above [[100]]', why: 'course-number threshold' },
    { kind: 'reject', where: 'numbered above [[99]]', why: 'course-number threshold' },
    { kind: 'reject', where: '[[25]] units of college physics', why: 'unit count' },
    { kind: 'reject', where: 'on the front ([[12]] yards)', why: 'distance' },
    { kind: 'reject', where: 'on back ([[12]] yards)', why: 'distance' },
    { kind: 'reject', where: 'swim [[50]] yards continuously', why: 'distance' },
    { kind: 'reject', where: '[[50]] yards backstroke', why: 'distance' },
    { kind: 'reject', where: '8 x [[50]] yards freestyle', why: 'distance' },
    { kind: 'reject', where: 'a [[30]]-page essay', why: 'page count' },
]

/**
 * Real course references whose subject is named in the sentence — a prose
 * department name ("Surgery 300A"), or a subject code longer than the four
 * letters the renderer's pattern allows ("BIOMEDIN 210", "SUSTAIN 376").
 * Without these the number inherits the page's subject and links to a
 * different course entirely.
 */
const RETARGETS: Verdict[] = [
    // Med-school clerkships: prose department names.
    { kind: 'retarget', where: 'and Surg [[300A]]', subject: 'SURG' },
    { kind: 'retarget', where: 'PREREQUISITES: Surgery [[300A]]', subject: 'SURG' },
    { kind: 'retarget', where: 'Medicine 300A, Pediatrics [[300A]]', subject: 'PEDS' },
    { kind: 'retarget', where: 'Pediatrics 300A, or Surgery [[300A]]', subject: 'SURG' },
    { kind: 'retarget', where: 'Medicine 300A, Surgery [[300A]]', subject: 'SURG' },
    { kind: 'retarget', where: 'Surgery 300A or Pediatrics [[300A]]', subject: 'PEDS' },
    { kind: 'retarget', where: 'equivalent to Medicine [[300A]]', subject: 'MED' },
    { kind: 'retarget', where: 'Pediatrics 300A and Medicine [[300A]]', subject: 'MED' },
    { kind: 'retarget', where: 'Psychiatry 300A and Medicine [[300A]]', subject: 'MED' },
    // Subject codes the renderer's [A-Z]{2,4} pattern cannot see.
    { kind: 'retarget', where: 'BIOMEDIN [[210]] or 214', subject: 'BMDS' },
    { kind: 'retarget', where: 'BIOMEDIN 210 or [[214]] or 215', subject: 'BMDS' },
    { kind: 'retarget', where: '210 or 214 or [[215]] or 217', subject: 'BMDS' },
    { kind: 'retarget', where: '214 or 215 or [[217]] or 260', subject: 'BMDS' },
    { kind: 'retarget', where: '215 or 217 or [[260]].', subject: 'BMDS' },
    { kind: 'retarget', where: 'PREREQUISITE: SUSTAIN [[376]]', subject: 'SUSTAIN' },
    { kind: 'retarget', where: 'CHINLANG 126/[[206]]', subject: 'CHINLANG' },
    { kind: 'retarget', where: 'CHEMENG 181/[[281]]', subject: 'CHEMENG' },
    { kind: 'retarget', where: 'one of LINGUIST [[180]]', subject: 'LINGUIST' },
    { kind: 'retarget', where: 'Recommended: STATS [[216]]', subject: 'STATS' },
    { kind: 'retarget', where: 'DATASCI 112 or STATS [[202]]', subject: 'STATS' },
    { kind: 'retarget', where: 'EPI 202 or 261/[[262]]', subject: 'EPI' },
    { kind: 'retarget', where: 'must enroll in FEMGEN [[256]]', subject: 'FEMGEN' },
    { kind: 'retarget', where: 'must enroll in PUBLPOL [[156]]', subject: 'PUBLPOL' },
    { kind: 'retarget', where: 'must enroll in INTNLREL [[103F]]', subject: 'INTNLREL' },
    { kind: 'retarget', where: 'already taken INTNLREL [[103F]]', subject: 'INTNLREL' },
    { kind: 'retarget', where: 'taken HISTORY 3F or [[103F]]', subject: 'HISTORY' },
    { kind: 'retarget', where: 'OSBEIJ 70 and EASTASN [[285]]', subject: 'EASTASN' },
    { kind: 'retarget', where: 'To enroll in MatSci [[50M]]', subject: 'MATSCI' },
    { kind: 'retarget', where: 'at least Economics [[50]]', subject: 'ECON' },
    { kind: 'retarget', where: 'or Publpol [[51]]', subject: 'PUBLPOL' },
    // Shared "quantitative methods" boilerplate, reused verbatim across
    // COMM / EARTHSYS / ECON / MS&E / POLISCI listings.
    { kind: 'retarget', where: 'following: DATASCI [[112]]', subject: 'DATASCI' },
    { kind: 'retarget', where: 'ECON 102 or [[108]]', subject: 'ECON' },
    { kind: 'retarget', where: 'CS 129, EARTHSYS [[140]]', subject: 'EARTHSYS' },
    { kind: 'retarget', where: 'HUMBIO 88, POLISCI [[150A]]', subject: 'POLISCI' },
    { kind: 'retarget', where: 'or MS&E [[125]]', subject: 'MS&E' },
    // Cross-subject prereqs where the named subject is short enough to match
    // but the number sits after a comma or "or", so it reads as bare.
    { kind: 'retarget', where: 'one of Math [[104]]', subject: 'MATH' },
    { kind: 'retarget', where: 'algebra such as Math [[51]]', subject: 'MATH' },
    { kind: 'retarget', where: 'Prerequisites: Math [[51]]; Math104', subject: 'MATH' },
    { kind: 'retarget', where: 'MATH 19, [[20]]', subject: 'MATH' },
    { kind: 'retarget', where: 'MATH 19 or [[20]]', subject: 'MATH' },
]

export const VERDICTS: Verdict[] = [...REJECTS, ...RETARGETS]

/** Splits a `where` pattern into its literal text and the span's offset in it. */
export function parseWhere(where: string): { text: string; spanOffset: number; span: string } {
    const open = where.indexOf('[[')
    const close = where.indexOf(']]')
    if (open < 0 || close < open) throw new Error(`verdict is missing [[span]]: ${where}`)
    const span = where.slice(open + 2, close)
    const text = where.slice(0, open) + span + where.slice(close + 2)
    return { text, spanOffset: open, span }
}

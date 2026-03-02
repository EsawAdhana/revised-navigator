import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Decode HTML entities in user-facing text (e.g. course descriptions/titles from API).
 * Converts &nbsp; &amp; &#39; etc. to actual characters so we never show raw "&something;" placeholders.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || typeof text !== 'string') return text
  let s = text
  // Numeric decimal &#39; &#039; &#8230; (semicolon optional per HTML5)
  s = s.replace(/&#(\d+);?/g, (_, num) => {
    const n = parseInt(num, 10)
    return n >= 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : `&#${num};`
  })
  // Numeric hex &#x00A0; &#x1F;
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const n = parseInt(hex, 16)
    return n >= 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : `&#x${hex};`
  })
  // Named entities (do &amp; last so it doesn't break others)
  s = s.replace(/&nbsp;/g, ' ')
  s = s.replace(/&lt;/g, '<')
  s = s.replace(/&gt;/g, '>')
  s = s.replace(/&quot;/g, '"')
  s = s.replace(/&apos;/g, "'")
  s = s.replace(/&lsquo;/g, "'")
  s = s.replace(/&rsquo;/g, "'")
  s = s.replace(/&ldquo;/g, '"')
  s = s.replace(/&rdquo;/g, '"')
  s = s.replace(/&ndash;/g, '–')
  s = s.replace(/&mdash;/g, '—')
  s = s.replace(/&hellip;/g, '…')
  s = s.replace(/&amp;/g, '&')
  return s
}

/**
 * Extract alternate course codes from a title's trailing parenthetical, e.g. "(CS 137A, EE 160A)".
 * Returns normalized ids (no space, uppercase) for comparison, or empty array if none.
 */
export function getAlternateCourseCodesFromTitle(title: string): string[] {
  if (!title || typeof title !== 'string') return []
  const trimmed = title.trim()
  const match = trimmed.match(/\s*\(([^)]+)\)\s*$/)
  if (!match) return []
  const inner = match[1].trim()
  const courseCodeList = /^[A-Za-z]{2,10}\s+\d{1,3}[A-Za-z]?(\s*,\s*[A-Za-z]{2,10}\s+\d{1,3}[A-Za-z]?)*$/
  if (!courseCodeList.test(inner)) return []
  return inner.split(/\s*,\s*/).map(part => part.replace(/\s+/g, '').toUpperCase())
}

/** Normalize course id for comparison (no spaces, uppercase). */
export function normalizeCourseId(id: string): string {
  if (!id || typeof id !== 'string') return ''
  return id.replace(/\s+/g, '').toUpperCase()
}

/**
 * Returns the set of normalized course ids that appear as alternates in some course's title.
 * Those courses should be hidden from the list (we show only the "primary" course that lists them).
 */
export function getCrossListAlternateIds(courses: { id: string; title: string }[]): Set<string> {
  const set = new Set<string>()
  for (const c of courses) {
    const alts = getAlternateCourseCodesFromTitle(c.title)
    alts.forEach(a => set.add(a))
  }
  return set
}

/**
 * Map from normalized alternate id -> normalized primary id.
 * Used to redirect /courses/CS137A to /courses/AA174A when they're the same course.
 * Note: When courses mutually list each other (A lists B, B lists A), both end up in the map.
 * Use resolveToCanonicalPrimary to get the single canonical id and avoid redirect loops.
 */
export function getCrossListPrimaryMap(courses: { id: string; title: string }[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of courses) {
    const primary = normalizeCourseId(c.id)
    const alts = getAlternateCourseCodesFromTitle(c.title)
    alts.forEach(a => {
      if (a !== primary) map.set(a, primary)
    })
  }
  return map
}

/**
 * Resolve a normalized course id to its canonical primary (for redirects).
 * Handles cycles: when A and B list each other, returns the alphabetically first as canonical.
 */
export function resolveToCanonicalPrimary(norm: string, primaryMap: Map<string, string>): string {
  const visited = new Set<string>()
  let current = norm
  while (primaryMap.has(current)) {
    if (visited.has(current)) {
      return [...visited].sort()[0]
    }
    visited.add(current)
    current = primaryMap.get(current)!
  }
  return current
}

/**
 * Returns all course IDs in the same cross-list group as the given course.
 * Used to aggregate evaluations from CS 24, LINGUIST 35, BILL 99, etc. when they're the same class.
 * Falls back to [courseId] when courses is empty (e.g. still loading) or course not in catalog.
 */
export function getCrossListGroupIds(courseId: string, courses: { id: string; title: string }[]): string[] {
  if (!courses.length) return [courseId]
  const primaryMap = getCrossListPrimaryMap(courses)
  const norm = normalizeCourseId(courseId)
  const canonical = resolveToCanonicalPrimary(norm, primaryMap)
  const group: string[] = []
  for (const c of courses) {
    const cNorm = normalizeCourseId(c.id)
    if (resolveToCanonicalPrimary(cNorm, primaryMap) === canonical) {
      group.push(c.id)
    }
  }
  return group.length > 0 ? group : [courseId]
}

// Very lightweight heuristic mapping for Stanford subjects.
// This is only used for filtering facets, so it's intentionally best-effort.
export function getSchoolFromSubject(subject: string) {
  if (!subject) return ''

  const s = subject.trim().toUpperCase()

  const engineering = new Set([
    'AA', 'AFRICAAM', // keep unknowns out of eng
    'BIOE', 'CS', 'CME', 'EE', 'MS&E', 'MSE', 'ENGR', 'ME', 'MATSCI', 'ENERGY', 'STS'
  ])

  const business = new Set(['GSBGEN', 'MGTECON', 'STRAMGT', 'FINANCE', 'OIT', 'HRMGT'])
  const education = new Set(['EDUC', 'EDUCATION'])
  const law = new Set(['LAW'])
  const medicine = new Set(['MED', 'SURG', 'PEDS', 'OBGYN', 'PSYC', 'PSY', 'PATH', 'ANAT'])
  const sustainability = new Set(['SUST', 'EARTHSYS', 'CEE', 'ENV', 'ENVRES'])

  if (engineering.has(s)) return 'Engineering'
  if (business.has(s)) return 'Business'
  if (education.has(s)) return 'Education'
  if (law.has(s)) return 'Law'
  if (medicine.has(s)) return 'Medicine'
  if (sustainability.has(s)) return 'Sustainability'

  // Default bucket
  return 'Humanities & Sciences'
}

export function getDepartmentUrl(code: string) {
  const c = (code || '').toUpperCase()

  const map: Record<string, string> = {
    AA: 'https://aa.stanford.edu/',
    BIOE: 'https://bioengineering.stanford.edu/',
    CEE: 'https://cee.stanford.edu/',
    CHEM: 'https://chemistry.stanford.edu/',
    CHEMENG: 'https://cheme.stanford.edu/',
    CLASSICS: 'https://classics.stanford.edu/',
    COMM: 'https://comm.stanford.edu/',
    CS: 'https://cs.stanford.edu/',
    ECON: 'https://economics.stanford.edu/',
    EDUC: 'https://ed.stanford.edu/',
    EE: 'https://ee.stanford.edu/',
    ENGLISH: 'https://english.stanford.edu/',
    GSBGEN: 'https://www.gsb.stanford.edu/',
    HISTORY: 'https://history.stanford.edu/',
    LAW: 'https://law.stanford.edu/',
    LINGUIST: 'https://linguistics.stanford.edu/',
    MATH: 'https://mathematics.stanford.edu/',
    MATSCI: 'https://mse.stanford.edu/',
    ME: 'https://me.stanford.edu/',
    MED: 'https://med.stanford.edu/',
    MUSIC: 'https://music.stanford.edu/',
    'MS&E': 'https://msande.stanford.edu/',
    PHIL: 'https://philosophy.stanford.edu/',
    PHYSICS: 'https://physics.stanford.edu/',
    POLISCI: 'https://politicalscience.stanford.edu/',
    PSYCH: 'https://psychology.stanford.edu/',
    SOC: 'https://sociology.stanford.edu/',
    STATS: 'https://statistics.stanford.edu/',
    TAPS: 'https://taps.stanford.edu/'
  }

  if (map[c]) return map[c]

  return `https://www.stanford.edu/search/?q=${encodeURIComponent(`${code} department`)}`
}

function convertTermToCode(term: string): string {
  // Convert "Winter 2026" -> "W26", "Autumn 2025" -> "F25", etc.
  if (!term) return ''

  const parts = term.split(' ')
  if (parts.length < 2) return ''

  const season = parts[0].toUpperCase()
  const year = parts[1]

  // Map season to code: Autumn/Fall -> F, Winter -> W, Spring -> S, Summer -> U
  let seasonCode = ''
  if (season === 'AUTUMN' || season === 'FALL') {
    seasonCode = 'F'
  } else if (season === 'WINTER') {
    seasonCode = 'W'
  } else if (season === 'SPRING') {
    seasonCode = 'S'
  } else if (season === 'SUMMER') {
    seasonCode = 'U'
  } else {
    // Fallback to first letter if unknown
    seasonCode = season.charAt(0)
  }

  // Get last 2 digits of year
  const yearCode = year.slice(-2)

  return `${seasonCode}${yearCode}`
}

export function getSyllabusUrl(subject: string, code: string, classId?: number, term?: string, sectionNumber?: string) {
  // Stanford syllabus URLs use format: {termCode}-{subject}-{code}-{section}
  // e.g., W26-ATHLETIC-60-01
  if (term) {
    const termCode = convertTermToCode(term)
    const subjectClean = (subject || '').replace(/\s+/g, '').toUpperCase()
    const codeClean = (code || '').replace(/\s+/g, '').toUpperCase()

    // Use provided section number, or default to "01" if missing
    const sectionToUse = (sectionNumber && sectionNumber.trim() !== '')
      ? sectionNumber.replace(/\s+/g, '').padStart(2, '0')
      : '01'

    // Validate all required parts are present
    if (termCode && subjectClean && codeClean && sectionToUse) {
      const courseIdentifier = `${termCode}-${subjectClean}-${codeClean}-${sectionToUse}`
      // The identifier appears twice in the URL path
      return `https://syllabus.stanford.edu/syllabus/doWebAuth/${courseIdentifier}/${courseIdentifier}`
    }
  }

  // Fallback: Try classId-based URL if available
  if (classId) {
    return `https://syllabus.stanford.edu/syllabus/#/viewSyllabus/${classId}`
  }

  // Final fallback: Course code-based search
  const subjectClean = (subject || '').replace(/\s+/g, '')
  const codeClean = (code || '').replace(/\s+/g, '')
  const courseCode = `${subjectClean}${codeClean}`

  return `https://syllabus.stanford.edu/syllabus/#/search?q=${encodeURIComponent(courseCode)}`
}

export function parseUnitsOptions(units: string | number): number[] {
  if (typeof units === 'number') {
    return isNaN(units) ? [] : [units]
  }
  // Strip " units" or " unit" suffix and trim; support en-dash (–) and minus (−) in ranges
  const s = String(units).toLowerCase().replace(/\s*units?\s*$/i, '').trim()
  if (!s) return []

  const rangeMatch = s.match(/^(\d+)\s*[-–−]\s*(\d+)$/)
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1], 10)
    const high = parseInt(rangeMatch[2], 10)
    if (low <= high) {
      const opts: number[] = []
      for (let i = low; i <= high; i++) opts.push(i)
      return opts
    }
  }
  const plusMatch = s.match(/^(\d+)\+$/)
  if (plusMatch) return [parseInt(plusMatch[1], 10)]
  const single = parseFloat(s)
  return isNaN(single) ? [] : [single]
}

/** True when the course/section can be taken for more than one unit value (e.g. "3-4"). */
export function hasVariableUnits(units: string | number): boolean {
  const opts = parseUnitsOptions(units)
  return opts.length > 1
}

/** Use "unit" only when value is exactly 1; otherwise "units". Ranges (e.g. "1-3") and "1+" always use "units". */
export function unitsLabel(value: number | string | null | undefined): 'unit' | 'units' {
  if (value == null || value === '') return 'units'
  const s = String(value).trim()
  // Ranges like "1-3", "2–4" and "1+" always use "units"
  if (/^\d+\s*[-–−]\s*\d+/.test(s) || /\d+\+$/.test(s)) return 'units'
  if (value === 1 || value === '1') return 'unit'
  const n = typeof value === 'number' ? value : parseFloat(s)
  if (!isNaN(n) && n === 1) return 'unit'
  return 'units'
}

/** Formats a unit value or range (e.g. "1 unit", "3 units", "3-4 units"). */
export function formatUnits(min: number, max?: number): string {
  if (max === undefined || min === max) {
    return `${min} ${unitsLabel(min)}`
  }
  return `${min}–${max} units`
}

/** Single numeric units value for a course (for sorting/display). Uses max of range or first section/course units. */
export function getCourseUnitsNumeric(course: { units?: string | number; sections?: { units?: string | number }[] }): number {
  const sources: (string | number | null | undefined)[] = [
    course.sections?.[0]?.units,
    course.units,
    ...(course.sections ?? []).slice(1, 5).map(s => s.units)
  ]
  for (const u of sources) {
    if (u == null || u === '') continue
    const opts = parseUnitsOptions(u)
    if (opts.length > 0 && Math.max(...opts) > 0) return Math.max(...opts)
  }
  return 0
}
/** Normalize a level string (e.g. "UG", "Graduate", "UNDERGRAD") to "Undergrad" or "Graduate". */
export function formatLevel(level: string): string {
  if (!level || !String(level).trim()) return 'N/A';
  const l = String(level).toUpperCase().trim();
  if (l.includes('UNDERGRAD') || l === 'UG' || l === 'U') return 'Undergrad';
  if (l.includes('GRAD') || l === 'GR' || l === 'G') return 'Graduate';
  // If it's a code-based check (e.g. "106A" -> Undergrad, "246" -> Graduate)
  const codeMatch = String(level).match(/\d+/);
  if (codeMatch) {
    const num = parseInt(codeMatch[0], 10);
    if (num < 200) return 'Undergrad';
    return 'Graduate';
  }
  return level;
}

/** GER display: show only acronym (e.g. "Applied Quantitative Reasoning (AQR)" -> "AQR"). */
const GER_ABBREV: Record<string, string> = {
  'Aesthetic and Interpretive Inquiry': 'AII',
  'Applied Quantitative Reasoning': 'AQR',
  'Creative Expression': 'CE',
  'Exploring Difference and Power': 'EDP',
  'Ethical Reasoning': 'ER',
  'Formal Reasoning': 'FR',
  'Scientific Method and Analysis': 'SMA',
  'Social Inquiry': 'SI',
  'Engaging Diversity': 'ED',
  'Writing and Rhetoric': 'PWR',
  'Civic, Liberal, and Global Education': 'COLLEGE'
}

export function isAllowedGer(ger: string): boolean {
  const g = ger.toUpperCase()
  // WAYS (all 8)
  if (g.startsWith('WAY-')) return true
  const ways = ['AII', 'AQR', 'CE', 'EDP', 'ER', 'FR', 'SMA', 'SI', 'ED']
  if (ways.some(w => g === w || g.includes(`(${w})`))) return true

  // WIM
  if (g === 'WIM' || g.includes('WRITING IN THE MAJOR')) return true

  // COLLEGE
  if (g.includes('COLLEGE') || g.includes('CIVIC, LIBERAL, AND GLOBAL EDUCATION')) return true

  // PWR
  if (g.includes('PWR 1') || g.includes('PWR 2') || g === 'PWR') return true

  // Language
  if (g.includes('LANGUAGE') && !g.includes('GER:')) return true
  if (g === 'LANG') return true

  return false
}

export function abbreviateGer(ger: string): string {
  const match = ger.match(/\s*\(([A-Za-z0-9+]+)\)\s*$/)
  if (match) return match[1]
  const abbr = GER_ABBREV[ger] ?? ger
  if (abbr === 'Engaging Diversity') return 'ED' // Fix for old/mixed format
  return abbr
}

const COMPONENT_MAP: Record<string, string> = {
  LEC: 'Lecture',
  SEM: 'Seminar',
  DIS: 'Discussion',
  LAB: 'Laboratory',
  LBS: 'Lab Section',
  INS: 'Independent Study',
  PRA: 'Practicum',
  LNG: 'Language',
  'T/D': 'Thesis/Dissertation',
  CLK: 'Clerkship',
  WKS: 'Workshop',
  COL: 'Colloquium',
  CAS: 'Case Study',
  ACT: 'Activity',
  ISF: 'Intro Seminar - Freshman',
  CLN: 'Clinical',
  RES: 'Research',
  ISS: 'Intro Seminar - Sophomore',
  ITR: 'Internship',
  RSC: 'Research Section',
  TUT: 'Tutorial',
  SIM: 'Simulation'
};

export function formatComponent(comp: string): string {
  if (!comp) return '';
  const c = comp.toUpperCase().trim();
  return COMPONENT_MAP[c] ?? comp;
}

/**
 * Custom sort comparator for course codes.
 * Ensures "7" comes before "10", and "106A" comes before "106B".
 * Does this by extracting the numeric part, comparing it, and then falling back to alphabetical for suffixes.
 */
export function compareCourseCodes(a: string, b: string): number {
  const parseCode = (code: string) => {
    const match = (code || '').match(/^(\d+)(.*)$/)
    if (match) {
      return { num: parseInt(match[1], 10), suffix: match[2].trim().toLowerCase() }
    }
    // Fallback if there are no leading numbers (e.g. some weird seminar codes)
    return { num: 0, suffix: (code || '').toLowerCase() }
  }

  const parsedA = parseCode(a)
  const parsedB = parseCode(b)

  if (parsedA.num !== parsedB.num) {
    return parsedA.num - parsedB.num // Ascending numeric 7 < 10
  }

  return parsedA.suffix.localeCompare(parsedB.suffix) // Ascending alphabetical A < B
}

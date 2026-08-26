import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Course, Section } from '@/types/course'
import type { LiveSeat } from './seats'

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
 * Tidy a catalog title for display, sorting and <title>.
 *
 * Upstream ships 10 titles with leading or trailing spaces (" The Spring Film
 * II") and ~68 with doubled inner spaces. Both survive into sort keys and search
 * matching, where whitespace is significant even though HTML collapses it.
 */
export function normalizeCatalogTitle(title: string | null | undefined): string {
  if (!title || typeof title !== 'string') return ''
  return title.replace(/\s+/g, ' ').trim()
}

/**
 * Tidy a catalog description for display.
 *
 * A handful of upstream descriptions carry stray markup — "<e>The Italian",
 * "<i>...</i>", "<link>" — which React renders literally as text. Tag-shaped
 * tokens are dropped; angle-bracketed URLs ("<https://...>") keep the URL and
 * lose only the brackets. Inner whitespace is left alone so the reviewed
 * course-link offsets stay anchored.
 */
export function normalizeCatalogDescription(description: string | null | undefined): string {
  if (!description || typeof description !== 'string') return ''
  return description
    .replace(/<((?:https?:\/\/|www\.)[^>\s]+)>/gi, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .trim()
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
  const courseCodeList = /^[A-Za-z&]{2,10}\s+\d{1,3}[A-Za-z]?(\s*,\s*[A-Za-z&]{2,10}\s+\d{1,3}[A-Za-z]?)*$/
  if (!courseCodeList.test(inner)) return []
  return inner.split(/\s*,\s*/).map(part => part.replace(/\s+/g, '').toUpperCase())
}

/** Normalize course id for comparison (no spaces, uppercase). */
export function normalizeCourseId(id: string): string {
  if (!id || typeof id !== 'string') return ''
  return id.replace(/\s+/g, '').toUpperCase()
}

/**
 * Map from normalized member id -> the canonical id of its cross-list class.
 *
 * Titles declare siblings ("Principles of Robot Autonomy I (AA 274A, CS 237A,
 * EE 260A)"), but they declare them pairwise and inconsistently: AA 274A's title
 * may name three siblings while CS 237A's names three different ones. Following
 * those links one hop at a time made a four-code class resolve to three
 * different canonical ids depending on which code you entered from, so the same
 * class showed different pooled evaluations per URL.
 *
 * So group by connected component (union-find) and pick one canonical member —
 * the alphabetically first id that exists in the catalog. Only non-canonical
 * members are keyed, which makes resolution a single hop and idempotent.
 *
 * Cached per `courses` array identity: /browse mounts FilterSidebar and
 * CourseList, which each built their own copy, and getCrossListGroupIds rebuilt
 * one per call — ~6 ms each over 8,648 courses, repeated on every catalog change.
 */
const primaryMapCache = new WeakMap<object, Map<string, string>>()

export function getCrossListPrimaryMap(courses: { id: string; title: string }[]): Map<string, string> {
  const cached = primaryMapCache.get(courses)
  if (cached) return cached
  const built = buildCrossListPrimaryMap(courses)
  primaryMapCache.set(courses, built)
  return built
}

function buildCrossListPrimaryMap(courses: { id: string; title: string }[]): Map<string, string> {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    // Path-compress so repeated lookups over the whole catalog stay cheap.
    let cur = x
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const add = (x: string) => { if (!parent.has(x)) parent.set(x, x) }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    // Keep the alphabetically smaller id as the root so the canonical choice
    // does not depend on iteration order.
    if (ra < rb) parent.set(rb, ra)
    else parent.set(ra, rb)
  }

  const real = new Set(courses.map(c => normalizeCourseId(c.id)))
  for (const c of courses) {
    const self = normalizeCourseId(c.id)
    add(self)
    for (const alt of getAlternateCourseCodesFromTitle(c.title)) {
      // Ignore codes that are not in the catalog: they cannot be a destination.
      if (!real.has(alt)) continue
      add(alt)
      union(self, alt)
    }
  }

  const map = new Map<string, string>()
  for (const id of parent.keys()) {
    const canonical = find(id)
    if (canonical !== id) map.set(id, canonical)
  }
  return map
}

/**
 * Resolve a normalized course id to its canonical primary (for redirects).
 * One hop with the component map above; the visited guard is kept so a
 * hand-built or legacy map cannot spin.
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

/**
 * Aggregate enrollment for the same logical section across cross-listed catalog entries.
 * Matches per sibling course by classId first, then component + sectionNumber within the anchor term.
 * Enrolled and waitlist counts are summed (total people); capacity and waitlistMax use max (shared cap, not summed department quotas).
 */
export function aggregateCrossListedSectionEnrollment(
  anchor: Section,
  crossListCourseIds: string[],
  courses: Course[],
  liveSeats?: Map<number, LiveSeat>
): Pick<Section, 'enrolled' | 'capacity' | 'waitlist' | 'waitlistMax'> {
  // A live reading replaces the dump's snapshot for that one section; siblings
  // with no live reading keep theirs, so a partial fetch still aggregates.
  const withLive = (s: Section): Section => {
    const live = liveSeats?.get(s.classId)
    if (!live) return s
    // Capacity is the one field where a zero is more likely a gap in the live
    // reading than a real cap of nothing, and a zero would hide the whole
    // enrollment line. Counts always take the live value.
    return {
      ...s,
      enrolled: live.enrolled,
      capacity: live.capacity > 0 ? live.capacity : s.capacity,
      waitlist: live.waitlist,
      waitlistMax: live.waitlistMax > 0 ? live.waitlistMax : s.waitlistMax,
    }
  }
  anchor = withLive(anchor)
  const byId = new Map(courses.map(c => [c.id, c]))
  const matches: Section[] = []
  for (const cid of crossListCourseIds) {
    const c = byId.get(cid)
    if (!c?.sections?.length) continue
    const sameTerm = c.sections.filter(s => s.term === anchor.term)
    const hit =
      sameTerm.find(s => s.classId === anchor.classId) ??
      sameTerm.find(
        s => s.component === anchor.component && s.sectionNumber === anchor.sectionNumber
      )
    if (hit) matches.push(withLive(hit))
  }
  if (matches.length === 0) {
    return {
      enrolled: anchor.enrolled,
      capacity: anchor.capacity,
      waitlist: anchor.waitlist,
      waitlistMax: anchor.waitlistMax,
    }
  }
  const caps = matches.map(s => s.capacity ?? 0)
  const waitCaps = matches.map(s => s.waitlistMax ?? 0)
  return {
    enrolled: matches.reduce((a, s) => a + (s.enrolled ?? 0), 0),
    capacity: Math.max(0, ...caps),
    waitlist: matches.reduce((a, s) => a + (s.waitlist ?? 0), 0),
    waitlistMax: Math.max(0, ...waitCaps),
  }
}

// Very lightweight heuristic mapping for Stanford subjects.
// This is only used for filtering facets, so it's intentionally best-effort.
export function getSchoolFromSubject(subject: string) {
  if (!subject) return ''

  const s = subject.trim().toUpperCase()

  const engineering = new Set([
    'AA',
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

function convertTermToCode(term: string): string {
  // Convert "Winter 2026" -> "W26", "Spring 2026" -> "Sp26", "Summer 2026" -> "Su26", "Autumn 2025" -> "F25", etc.
  if (!term) return ''

  const parts = term.split(' ')
  if (parts.length < 2) return ''

  const season = parts[0].toUpperCase()
  const year = parts[1]

  // Map season to code: Autumn/Fall -> F, Winter -> W, Spring -> Sp, Summer -> Su (Stanford syllabus URLs)
  let seasonCode = ''
  if (season === 'AUTUMN' || season === 'FALL') {
    seasonCode = 'F'
  } else if (season === 'WINTER') {
    seasonCode = 'W'
  } else if (season === 'SPRING') {
    seasonCode = 'Sp'
  } else if (season === 'SUMMER') {
    seasonCode = 'Su'
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
  // e.g., W26-ATHLETIC-60-01, Sp26-CS-106A-01, Su26-CS-106A-01
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

/**
 * Workload per unit, the figure shown as "N hrs/unit".
 *
 * Derived here rather than read from the stored `difficulty` column: that column
 * was computed against whatever unit count the course carried when its
 * evaluations were scraped, so 41 courses that have since been re-unitised
 * disagreed with the unit count displayed beside them. Zero-unit courses get
 * nothing instead of their raw hour count.
 *
 * Ranges divide by the largest option, which is the convention the stored
 * column used in all 1,249 range cases.
 */
export function hoursPerUnit(hours: number | null | undefined, units: string | number | null | undefined): number | undefined {
  if (hours == null || !Number.isFinite(hours)) return undefined
  const options = parseUnitsOptions((units ?? '') as string).filter(u => u > 0)
  if (!options.length) return undefined
  return hours / Math.max(...options)
}

/**
 * Pool evaluation figures across every code a class is listed under, so the
 * rating does not depend on which listing you opened. Each figure is the mean
 * over the members that have one; a member with no evaluations is skipped
 * rather than counted as zero.
 */
export function aggregateCrossListMetrics(
  members: Array<{ hours?: number | null; quality?: number | null; units?: string | number | null }>,
): { hours?: number; quality?: number; hrsPerUnit?: number } {
  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined)
  const hours = mean(members.map(m => m.hours).filter((h): h is number => h != null && Number.isFinite(h)))
  const quality = mean(members.map(m => m.quality).filter((q): q is number => q != null && Number.isFinite(q)))
  // Per-member hrs/unit, because members can carry different unit counts.
  const hrsPerUnit = mean(
    members
      .map(m => hoursPerUnit(m.hours, m.units))
      .filter((v): v is number => v != null && Number.isFinite(v)),
  )
  return {
    ...(hours != null && { hours }),
    ...(quality != null && { quality }),
    ...(hrsPerUnit != null && { hrsPerUnit }),
  }
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
  if (g.includes('PWR 1') || g.includes('PWR 2') || g === 'PWR' || g.includes('WRITING 1') || g.includes('WRITING 2')) return true

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

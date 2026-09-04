/**
 * Instructor identity.
 *
 * Instructors have no ID anywhere in our data — only name strings, and the two
 * sources spell them differently:
 *   - the course catalog gives initials ("Sakovsky, M.", occasionally "Sigrid Elschot")
 *   - evaluations give full first names ("Sakovsky, Maria")
 *
 * So a person is keyed by their slug. When a first name is known the slug uses
 * it ("sakovsky-maria"); when only an initial is known it falls back to
 * "sakovsky-m". Every entry also carries its initial slug, which is how catalog
 * listings are joined to evaluation history and how "clark-s" is resolved to
 * either one person or a disambiguation choice.
 */

import { decodeHtmlEntities } from '@/lib/utils'

/** Placeholder "instructors" in the source data that aren't people. */
const NOT_A_PERSON = /^(\d+\s+)?(staff|tba|tbd|instructor)\b/i

export interface ParsedInstructorName {
  last: string
  /** Full first name, a bare initial letter, or '' when the name is a single token. */
  first: string
}

/** Strips diacritics and case so "Núñez" and "Nunez" produce the same slug. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function slugPart(text: string): string {
  return fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Name split into comparable tokens: "Núñez-Martínez, José" -> ["nunez","martinez","jose"]. */
function nameTokens(text: string): string[] {
  return fold(text).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
}

/** Order-insensitive key, so "clark susan" and "susan clark" compare equal. */
function nameKey(tokens: string[]): string {
  return [...tokens].sort().join(' ')
}

export function parseInstructorName(raw: string): ParsedInstructorName {
  const name = decodeHtmlEntities(raw || '').replace(/\s+/g, ' ').trim()
  if (name.includes(',')) {
    const [last, ...rest] = name.split(',')
    return { last: last.trim(), first: rest.join(',').trim() }
  }
  // No comma: the catalog occasionally stores "First Last". Everything after the
  // first token is the surname, so "Nunez Martinez" stays intact.
  const tokens = name.split(' ')
  if (tokens.length > 1) return { last: tokens.slice(1).join(' '), first: tokens[0] }
  return { last: name, first: '' }
}

/** True when the first name is a real name rather than "M." or "" . */
export function hasFullFirstName(first: string): boolean {
  return fold(first).replace(/[^a-z0-9]/g, '').length > 1
}

/** "Sakovsky, Maria" -> "Maria Sakovsky". Also decodes entities. */
export function formatInstructorName(raw: string): string {
  const { last, first } = parseInstructorName(raw)
  return first ? `${first} ${last}` : last
}

/** "Sakovsky, Maria" -> "sakovsky-maria"; "Sakovsky, M." -> "sakovsky-m". */
export function instructorSlug(raw: string): string {
  const { last, first } = parseInstructorName(raw)
  const lastSlug = slugPart(last)
  if (!first) return lastSlug
  return `${lastSlug}-${hasFullFirstName(first) ? slugPart(first) : fold(first)[0]}`
}

/** The surname + first-initial slug, shared by every spelling of one person. */
export function instructorInitialSlug(raw: string): string {
  const { last, first } = parseInstructorName(raw)
  const lastSlug = slugPart(last)
  const initial = fold(first).replace(/[^a-z0-9]/g, '')[0]
  return initial ? `${lastSlug}-${initial}` : lastSlug
}

export interface InstructorEntry {
  slug: string
  /** Display form, e.g. "Maria Sakovsky". */
  name: string
  /** Directory form, e.g. "Sakovsky, Maria". */
  sortName: string
  initialSlug: string
  /** Whether this entry is identified by a full first name rather than an initial. */
  named: boolean
  /** Every raw spelling that maps to this slug — used for exact evaluation lookups. */
  aliases: string[]
}

export interface InstructorDirectory {
  entries: InstructorEntry[]
  bySlug: Map<string, InstructorEntry>
  /** Full-name entries grouped by initial slug, so "clark-s" finds Susan and Steven. */
  namedByInitialSlug: Map<string, InstructorEntry[]>
}

/**
 * Prebuilt dump shape. `courseLinks` maps a catalog course to the one full-name
 * slug that matches an initial when evaluation history makes the tie unique
 * ("Clark, S." on CS 229 → clark-susan). Older dumps were a bare string[].
 */
export interface InstructorDump {
  names: string[]
  /** courseId → initialSlug → named slug */
  courseLinks: Record<string, Record<string, string>>
}

export function parseInstructorDump(raw: unknown): InstructorDump {
  if (Array.isArray(raw)) {
    return { names: raw.filter((n): n is string => typeof n === 'string'), courseLinks: {} }
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { names?: unknown; courseLinks?: unknown }
    const names = Array.isArray(obj.names)
      ? obj.names.filter((n): n is string => typeof n === 'string')
      : []
    const courseLinks =
      obj.courseLinks && typeof obj.courseLinks === 'object' && !Array.isArray(obj.courseLinks)
        ? (obj.courseLinks as Record<string, Record<string, string>>)
        : {}
    return { names, courseLinks }
  }
  return { names: [], courseLinks: {} }
}

/** Profile path for a raw catalog/eval name, preferring a course-scoped resolution. */
export function instructorProfilePath(
  rawName: string,
  courseId?: string,
  courseLinks?: Record<string, Record<string, string>>,
): string {
  const initial = instructorInitialSlug(rawName)
  const resolved = courseId && initial ? courseLinks?.[courseId]?.[initial] : undefined
  return `/instructors/${resolved || instructorSlug(rawName)}`
}

/**
 * Groups raw instructor strings into one entry per person. Names that are only
 * ever written with an initial get their own initial-keyed entry; resolution
 * folds those into the full-name entry when exactly one exists.
 */
export function buildInstructorDirectory(rawNames: string[]): InstructorDirectory {
  const bySlug = new Map<string, InstructorEntry>()

  for (const raw of rawNames) {
    const name = decodeHtmlEntities(raw || '').replace(/\s+/g, ' ').trim()
    if (!name || NOT_A_PERSON.test(name)) continue

    const slug = instructorSlug(name)
    if (!slug) continue

    const existing = bySlug.get(slug)
    if (existing) {
      if (!existing.aliases.includes(name)) existing.aliases.push(name)
      continue
    }

    const { last, first } = parseInstructorName(name)
    bySlug.set(slug, {
      slug,
      name: formatInstructorName(name),
      sortName: first ? `${last}, ${first}` : last,
      initialSlug: instructorInitialSlug(name),
      named: hasFullFirstName(first),
      aliases: [name],
    })
  }

  const namedByInitialSlug = new Map<string, InstructorEntry[]>()
  for (const entry of bySlug.values()) {
    if (!entry.named) continue
    const group = namedByInitialSlug.get(entry.initialSlug)
    if (group) group.push(entry)
    else namedByInitialSlug.set(entry.initialSlug, [entry])
  }
  for (const group of namedByInitialSlug.values()) {
    group.sort((a, b) => a.sortName.localeCompare(b.sortName))
  }

  return {
    entries: Array.from(bySlug.values()).sort((a, b) => a.sortName.localeCompare(b.sortName)),
    bySlug,
    namedByInitialSlug,
  }
}

export type InstructorResolution =
  | { kind: 'found'; entry: InstructorEntry }
  | { kind: 'redirect'; slug: string }
  | { kind: 'ambiguous'; candidates: InstructorEntry[] }
  | { kind: 'missing' }

/**
 * Maps a URL slug to a person. An initial-only slug that matches exactly one
 * full name redirects to it; matching several is a disambiguation page.
 */
export function resolveInstructorSlug(dir: InstructorDirectory, slug: string): InstructorResolution {
  const exact = dir.bySlug.get(slug)
  if (exact?.named) return { kind: 'found', entry: exact }

  const candidates = dir.namedByInitialSlug.get(slug) ?? []
  if (candidates.length === 1) return { kind: 'redirect', slug: candidates[0].slug }
  if (candidates.length > 1) return { kind: 'ambiguous', candidates }

  return exact ? { kind: 'found', entry: exact } : { kind: 'missing' }
}

/**
 * Instructors whose name the query *is*, not merely starts with: the surname on
 * its own ("mathews"), the first name on its own ("matthew"), or both in any
 * spelling order ("susan clark", "clark, susan").
 *
 * This used to rank prefix and substring matches as well, which meant every
 * department query dragged people along — "math" returned Mathews and Mathur.
 * Matching whole tokens keeps that out: "math" is still nobody, while "mathew"
 * is Mathew Kiang and not every Mathews in the catalog.
 *
 * Surname matches sort ahead of first-name-only ones, so a popular first name
 * can't push the person you actually searched for past `limit`.
 */
export function findInstructorsByExactName(
  dir: InstructorDirectory,
  query: string,
  limit = 6
): InstructorEntry[] {
  const q = nameKey(nameTokens(query))
  if (q.length < 2) return []

  const bySurname: InstructorEntry[] = []
  const byFirstName: InstructorEntry[] = []
  for (const entry of dir.entries) {
    // "Sakovsky, M." is the same person as "Sakovsky, Maria" — list them once,
    // under the full name, exactly as resolveInstructorSlug would redirect.
    if (!entry.named && dir.namedByInitialSlug.has(entry.initialSlug)) continue

    const { last, first } = parseInstructorName(entry.sortName)
    const lastTokens = nameTokens(last)
    if (lastTokens.length === 0) continue
    const firstTokens = nameTokens(first)

    if (q === nameKey(lastTokens) || q === nameKey([...lastTokens, ...firstTokens])) {
      bySurname.push(entry)
    } else if (firstTokens.length > 0 && q === nameKey(firstTokens)) {
      // A bare initial is never a lookup; "j" can't reach the 2-char floor above.
      byFirstName.push(entry)
    }
  }

  const bySortName = (a: InstructorEntry, b: InstructorEntry) =>
    a.sortName.localeCompare(b.sortName)
  bySurname.sort(bySortName)
  byFirstName.sort(bySortName)
  return [...bySurname, ...byFirstName].slice(0, limit)
}

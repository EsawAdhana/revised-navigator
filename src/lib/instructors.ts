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
function hasFullFirstName(first: string): boolean {
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
 * Ranks instructors against a free-text query. Matches on surname prefix first,
 * then any name token, then substring, so "clark" beats "clarkson" and typing a
 * full "susan clark" still lands.
 */
export function searchInstructors(
  dir: InstructorDirectory,
  query: string,
  limit = 6
): InstructorEntry[] {
  const q = fold(query).trim().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')
  if (q.length < 2) return []
  const terms = q.split(' ')

  const scored: { entry: InstructorEntry; score: number }[] = []
  for (const entry of dir.entries) {
    // "Sakovsky, M." is the same person as "Sakovsky, Maria" — list them once,
    // under the full name, exactly as resolveInstructorSlug would redirect.
    if (!entry.named && dir.namedByInitialSlug.has(entry.initialSlug)) continue

    const last = fold(parseInstructorName(entry.sortName).last)
    const full = fold(entry.name)
    let score = 0

    if (terms.length > 1 && full.includes(q)) score = 5
    else if (last === q) score = 4
    else if (last.startsWith(q)) score = 3
    else if (full.split(' ').some(token => token.startsWith(q))) score = 2
    else if (terms.every(term => full.includes(term))) score = 1

    if (score > 0) scored.push({ entry, score })
  }

  scored.sort((a, b) =>
    b.score - a.score || a.entry.sortName.localeCompare(b.entry.sortName))
  return scored.slice(0, limit).map(s => s.entry)
}

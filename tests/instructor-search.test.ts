import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildInstructorDirectory,
  findInstructorsByExactName,
  parseInstructorDump,
} from '@/lib/instructors'

// Cases written to defeat exact-name matching, not to agree with it. The rule:
// a query surfaces people only when it *is* a name — the surname alone, or the
// full name in any order. Everything else is a course search.

const DIR = buildInstructorDirectory([
  'Mathews, Ella',
  'Mathews, Gordon',
  'Mathur, Maya',
  'Kiang, Mathew',
  'Lapotre, Mathieu',
  'Clark, Susan',
  'Clark, Steven',
  'Clarkson, Amy',
  'Sakovsky, Maria',
  'Sakovsky, M.',
  'Nunez Martinez, Jose',
  'Law, Wing-Sum',
  'Núñez, Ana',
  'Staff',
  'TBA',
  'Sting',
])

const names = (query: string) => findInstructorsByExactName(DIR, query).map(e => e.name)

describe('findInstructorsByExactName', () => {
  it('does not return people for a department-shaped query', () => {
    // The bug this replaced: "math" pulled in Mathews, Mathur, Mathew, Mathieu.
    expect(names('math')).toEqual([])
    expect(names('mathe')).toEqual([])
    expect(names('clar')).toEqual([])
    expect(names('sako')).toEqual([])
  })

  it('does not treat a name as a prefix of a longer name', () => {
    expect(names('clark')).toEqual(['Steven Clark', 'Susan Clark'])
    expect(names('clark')).not.toContain('Amy Clarkson')
    expect(names('mathew')).toEqual([]) // Mathew is a first name here, not Mathews
  })

  it('matches a surname on its own', () => {
    expect(names('mathews')).toEqual(['Ella Mathews', 'Gordon Mathews'])
    expect(names('sting')).toEqual(['Sting'])
  })

  it('matches a full name in either order and with punctuation', () => {
    expect(names('gordon mathews')).toEqual(['Gordon Mathews'])
    expect(names('mathews gordon')).toEqual(['Gordon Mathews'])
    expect(names('Mathews, Gordon')).toEqual(['Gordon Mathews'])
    expect(names('  GORDON   MATHEWS  ')).toEqual(['Gordon Mathews'])
  })

  it('does not match a first name alone', () => {
    expect(names('gordon')).toEqual([])
    expect(names('maria')).toEqual([])
  })

  it('does not match a partial full name', () => {
    expect(names('g mathews')).toEqual([])
    expect(names('gordon math')).toEqual([])
    expect(names('gordon mathews jr')).toEqual([])
  })

  it('handles multi-token surnames, hyphens and diacritics', () => {
    expect(names('nunez martinez')).toEqual(['Jose Nunez Martinez'])
    expect(names('jose nunez martinez')).toEqual(['Jose Nunez Martinez'])
    expect(names('nunez')).toEqual(['Ana Núñez'])
    expect(names('núñez')).toEqual(['Ana Núñez'])
    expect(names('law')).toEqual(['Wing-Sum Law'])
    expect(names('wing-sum law')).toEqual(['Wing-Sum Law'])
    expect(names('wing sum law')).toEqual(['Wing-Sum Law'])
  })

  it('lists an initial-only spelling once, under the full name', () => {
    expect(names('sakovsky')).toEqual(['Maria Sakovsky'])
    expect(names('m sakovsky')).toEqual([])
  })

  it('ignores placeholder instructors and junk queries', () => {
    expect(names('staff')).toEqual([])
    expect(names('tba')).toEqual([])
    expect(names('')).toEqual([])
    expect(names('   ')).toEqual([])
    expect(names('a')).toEqual([])
    expect(names('!!!')).toEqual([])
    expect(names('106a')).toEqual([])
  })

  it('caps how many people can sit above the course list', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Sun, Person${i}`)
    const dir = buildInstructorDirectory(many)
    expect(findInstructorsByExactName(dir, 'sun')).toHaveLength(6)
    expect(findInstructorsByExactName(dir, 'sun', 2)).toHaveLength(2)
  })

  it('keeps department words out of the real catalog dump', () => {
    const dump = parseInstructorDump(
      JSON.parse(readFileSync('public/catalog/instructors.json', 'utf8'))
    )
    const dir = buildInstructorDirectory(dump.names)
    for (const word of ['math', 'cs', 'bio', 'psych', 'econ', 'history', 'music', 'physics']) {
      expect(findInstructorsByExactName(dir, word), word).toEqual([])
    }
    // Sanity: a real surname from that same dump still resolves.
    expect(findInstructorsByExactName(dir, 'mathews').map(e => e.name))
      .toEqual(['Ella Mathews', 'Gordon Mathews'])
  })
})

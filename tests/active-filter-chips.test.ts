import { describe, it, expect } from 'vitest'
import {
  buildFilterChips,
  type BrowseFilterValues,
  type BrowseFilterSetters,
} from '@/lib/active-filters'

/**
 * The mobile menu badge is `buildFilterChips(...).length > 0`, so these cases
 * pin down exactly when the badge shows. They are written to break the naive
 * versions: "query is non-empty", "unitMax !== 5", "a term is selected".
 */

const DEFAULTS: BrowseFilterValues = {
  query: '',
  excludedWords: [],
  selectedTerms: ['Autumn 2026'], // useSelectedTerms fills this in when the URL has no `terms`
  selectedDepts: [],
  selectedFormats: [],
  selectedLevels: [],
  unitMin: 1,
  unitMax: 5,
  timeMin: 420,
  timeMax: 1320,
  selectedGers: [],
  selectedSchools: [],
}

function recordingSetters() {
  const calls: Array<[string, unknown]> = []
  const rec = (name: string) => (val: unknown) => { calls.push([name, val]) }
  const setters: BrowseFilterSetters = {
    setQuery: rec('query'),
    setExcludedWords: rec('exclude'),
    setSelectedTerms: rec('terms'),
    setSelectedDepts: rec('depts'),
    setSelectedFormats: rec('formats'),
    setSelectedLevels: rec('levels'),
    setUnitMin: rec('unitMin'),
    setUnitMax: rec('unitMax'),
    setTimeMin: rec('timeMin'),
    setTimeMax: rec('timeMax'),
    setSelectedGers: rec('gers'),
    setSelectedSchools: rec('schools'),
  }
  return { setters, calls }
}

function chips(overrides: Partial<BrowseFilterValues> = {}) {
  const { setters } = recordingSetters()
  return buildFilterChips({ ...DEFAULTS, ...overrides }, setters)
}

describe('buildFilterChips — when the mobile menu badge shows', () => {
  it('shows on a fresh load, because the catalog default term is a live filter', () => {
    const out = chips()
    expect(out.map(c => c.id)).toEqual(['term-Autumn 2026'])
    expect(out.length > 0).toBe(true)
  })

  it('hides only when nothing narrows the list ("any" term, everything else default)', () => {
    expect(chips({ selectedTerms: ['any'] })).toHaveLength(0)
  })

  it('ignores a whitespace-only search', () => {
    expect(chips({ selectedTerms: ['any'], query: '   ' })).toHaveLength(0)
    expect(chips({ selectedTerms: ['any'], query: '  cs106  ' }).map(c => c.label)).toEqual(['Search: cs106'])
  })

  it('treats the unit slider as active only when it is inside 1–5', () => {
    expect(chips({ selectedTerms: ['any'] })).toHaveLength(0)
    expect(chips({ selectedTerms: ['any'], unitMin: 2 }).map(c => c.id)).toEqual(['unit-range'])
    expect(chips({ selectedTerms: ['any'], unitMax: 4 }).map(c => c.id)).toEqual(['unit-range'])
    // A widened-past-default URL param is not a filter.
    expect(chips({ selectedTerms: ['any'], unitMin: 0, unitMax: 9 })).toHaveLength(0)
  })

  it('treats the time slider as active only when it is inside 7:00am–10:00pm', () => {
    expect(chips({ selectedTerms: ['any'], timeMin: 421 }).map(c => c.id)).toEqual(['time-range'])
    expect(chips({ selectedTerms: ['any'], timeMax: 1319 }).map(c => c.id)).toEqual(['time-range'])
    expect(chips({ selectedTerms: ['any'], timeMin: 0, timeMax: 1440 })).toHaveLength(0)
  })

  it('counts every filter family, so the badge cannot miss one', () => {
    const out = chips({
      selectedTerms: ['any'],
      excludedWords: ['seminar'],
      selectedDepts: ['Computer Science'],
      selectedFormats: ['LEC'],
      selectedLevels: ['Undergraduate'],
      selectedGers: ['WAY-FR'],
      selectedSchools: ['Engineering'],
    })
    expect(out.map(c => c.id)).toEqual([
      'exclude-seminar',
      'dept-Computer Science',
      'fmt-LEC',
      'level-Undergraduate',
      'ger-WAY-FR',
      'school-Engineering',
    ])
  })

  it('drops the last term to "any" and the last dept to null, so removal is idempotent', () => {
    const { setters, calls } = recordingSetters()
    const out = buildFilterChips({ ...DEFAULTS, selectedDepts: ['CS'] }, setters)
    out.find(c => c.id === 'term-Autumn 2026')!.onRemove()
    out.find(c => c.id === 'dept-CS')!.onRemove()
    expect(calls).toEqual([['terms', ['any']], ['depts', null]])
  })

  it('resets both slider ends when its chip is removed', () => {
    const { setters, calls } = recordingSetters()
    const out = buildFilterChips({ ...DEFAULTS, unitMin: 3, unitMax: 4, timeMin: 600, timeMax: 900 }, setters)
    out.find(c => c.id === 'unit-range')!.onRemove()
    out.find(c => c.id === 'time-range')!.onRemove()
    expect(calls).toEqual([
      ['unitMin', 1], ['unitMax', 5],
      ['timeMin', 420], ['timeMax', 1320],
    ])
  })
})

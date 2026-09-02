import { abbreviateGer, unitsLabel, formatComponent } from '@/lib/utils'
import { formatMinutes } from '@/lib/schedule-utils'

/**
 * Single source of truth for "which browse filters are currently narrowing the
 * list". The chip row renders these; the mobile menu badge counts them, so the
 * badge can never disagree with the chips.
 *
 * Note the default term counts: with no `terms` in the URL the list is still
 * scoped to one quarter, so a fresh page load has one active filter.
 */

export interface BrowseFilterValues {
  query: string
  excludedWords: string[]
  selectedTerms: string[]
  selectedDepts: string[]
  selectedFormats: string[]
  selectedLevels: string[]
  unitMin: number
  unitMax: number
  timeMin: number
  timeMax: number
  selectedGers: string[]
  selectedSchools: string[]
}

export interface BrowseFilterSetters {
  setQuery: (val: string | null) => void
  setExcludedWords: (val: string[] | null) => void
  setSelectedTerms: (val: string[] | null) => void
  setSelectedDepts: (val: string[] | null) => void
  setSelectedFormats: (val: string[] | null) => void
  setSelectedLevels: (val: string[] | null) => void
  setUnitMin: (val: number | null) => void
  setUnitMax: (val: number | null) => void
  setTimeMin: (val: number | null) => void
  setTimeMax: (val: number | null) => void
  setSelectedGers: (val: string[] | null) => void
  setSelectedSchools: (val: string[] | null) => void
}

export interface FilterChip {
  id: string
  label: string
  onRemove: () => void
}

export const UNIT_MIN_DEFAULT = 1
export const UNIT_MAX_DEFAULT = 5
export const TIME_MIN_DEFAULT = 420
export const TIME_MAX_DEFAULT = 1320

export function buildFilterChips(values: BrowseFilterValues, setters: BrowseFilterSetters): FilterChip[] {
  const {
    query, excludedWords, selectedTerms, selectedDepts, selectedFormats, selectedLevels,
    unitMin, unitMax, timeMin, timeMax, selectedGers, selectedSchools,
  } = values
  const {
    setQuery, setExcludedWords, setSelectedTerms, setSelectedDepts, setSelectedFormats,
    setSelectedLevels, setUnitMin, setUnitMax, setTimeMin, setTimeMax, setSelectedGers,
    setSelectedSchools,
  } = setters

  const toggleFilter = (item: string, current: string[], setFn: (val: string[] | null) => void, isTerm = false) => {
    if (current.includes(item)) {
      const next = current.filter(i => i !== item)
      setFn(next.length ? next : (isTerm ? ['any'] : null))
    } else {
      const next = current.filter(i => i !== 'any')
      setFn([...next, item])
    }
  }

  const removeDept = (dept: string) => {
    const next = selectedDepts.filter(d => d !== dept)
    setSelectedDepts(next.length ? next : null)
  }

  const removeExcludedWord = (word: string) => {
    const next = excludedWords.filter(w => w !== word)
    setExcludedWords(next.length ? next : null)
  }

  const out: FilterChip[] = []
  if (query.trim()) {
    out.push({ id: 'search', label: `Search: ${query.trim()}`, onRemove: () => setQuery(null) })
  }
  excludedWords.forEach(word => {
    out.push({ id: `exclude-${word}`, label: `Exclude: ${word}`, onRemove: () => removeExcludedWord(word) })
  })
  selectedTerms.forEach(term => {
    if (term !== 'any') {
      out.push({ id: `term-${term}`, label: term, onRemove: () => toggleFilter(term, selectedTerms, setSelectedTerms, true) })
    }
  })
  selectedDepts.forEach(dept => {
    out.push({ id: `dept-${dept}`, label: dept, onRemove: () => removeDept(dept) })
  })
  selectedFormats.forEach(fmt => {
    out.push({ id: `fmt-${fmt}`, label: formatComponent(fmt), onRemove: () => toggleFilter(fmt, selectedFormats, setSelectedFormats) })
  })
  selectedLevels.forEach(lvl => {
    out.push({ id: `level-${lvl}`, label: lvl, onRemove: () => toggleFilter(lvl, selectedLevels, setSelectedLevels) })
  })
  if (unitMin > UNIT_MIN_DEFAULT || unitMax < UNIT_MAX_DEFAULT) {
    const label = unitMin === unitMax
      ? (unitMax >= UNIT_MAX_DEFAULT ? `${unitMin}+ units` : `${unitMin} ${unitsLabel(unitMin)}`)
      : (unitMax >= UNIT_MAX_DEFAULT ? `${unitMin}–5+ units` : `${unitMin}–${unitMax} units`)
    out.push({
      id: 'unit-range',
      label,
      onRemove: () => {
        setUnitMin(UNIT_MIN_DEFAULT)
        setUnitMax(UNIT_MAX_DEFAULT)
      }
    })
  }
  if (timeMin > TIME_MIN_DEFAULT || timeMax < TIME_MAX_DEFAULT) {
    const label = `${formatMinutes(timeMin)} – ${formatMinutes(timeMax)}`
    out.push({
      id: 'time-range',
      label,
      onRemove: () => {
        setTimeMin(TIME_MIN_DEFAULT)
        setTimeMax(TIME_MAX_DEFAULT)
      }
    })
  }
  selectedGers.forEach(ger => {
    out.push({ id: `ger-${ger}`, label: abbreviateGer(ger), onRemove: () => toggleFilter(ger, selectedGers, setSelectedGers) })
  })
  selectedSchools.forEach(school => {
    out.push({ id: `school-${school}`, label: school, onRemove: () => toggleFilter(school, selectedSchools, setSelectedSchools) })
  })
  return out
}

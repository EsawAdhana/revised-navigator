import type { Course } from '@/types/course'
import type { CartItem } from '@/lib/cart-store'
import { getSchoolFromSubject, formatLevel, parseUnitsOptions, normalizeCourseId, resolveToCanonicalPrimary } from '@/lib/utils'
import { parseMeetingTimes, parseTimeRange, parseDays, timeToMinutes, isMeetingOptional } from '@/lib/schedule-utils'

export type CourseFilterCriteria = {
  excludedWords: string[]
  selectedDepts: string[]
  selectedTerms: string[]
  selectedFormats: string[]
  selectedLevels: string[]
  selectedGers: string[]
  selectedSchools: string[]
  unitMin: number
  unitMax: number
  timeMin: number
  timeMax: number
  hideConflicts: boolean
  hideUnavailable: boolean
}

/** When computing facet counts, the facet whose own filter should be omitted. */
export type FacetKey = 'exclude' | 'depts' | 'terms' | 'formats' | 'levels' | 'gers' | 'schools' | 'units' | 'times'

type Meeting = { days: string[]; startTime: string; endTime: string }

function hasOverlap(m1: Meeting, m2: Meeting, cartItem?: CartItem): boolean {
  let commonDays = m1.days.filter(d => m2.days.includes(d))
  if (cartItem) {
    commonDays = commonDays.filter(day => !isMeetingOptional(cartItem, day, m2.startTime, m2.endTime))
  }
  if (commonDays.length === 0) return false
  const start1 = timeToMinutes(m1.startTime)
  const end1 = timeToMinutes(m1.endTime)
  const start2 = timeToMinutes(m2.startTime)
  const end2 = timeToMinutes(m2.endTime)
  return start1 < end2 && start2 < end1
}

function parseSectionMeetings(section: { meetings?: { days?: string; time?: string }[] }): Meeting[] {
  return (section.meetings || []).flatMap(m => {
    const normalizedDays = parseDays(m.days || '')
    if (normalizedDays.length === 0) return []
    const range = parseTimeRange(m.time || '')
    if (!range?.startTime) return []
    return [{ days: normalizedDays, startTime: range.startTime, endTime: range.endTime }]
  })
}

/**
 * Single source of truth for course filtering, shared by the visible list
 * (use-filtered-courses) and the sidebar facet counts. Applies every filter
 * EXCEPT the free-text search query, which callers apply themselves (the list
 * has extra cross-list primary-inclusion logic on top of search).
 *
 * `exclude` omits one facet dimension so a facet's own selection doesn't zero
 * out its own counts.
 */
export function filterCourses(
  courses: Course[],
  criteria: CourseFilterCriteria,
  primaryMap: Map<string, string>,
  cartItems: CartItem[],
  exclude?: FacetKey,
): Course[] {
  const {
    excludedWords, selectedDepts, selectedTerms, selectedFormats, selectedLevels,
    selectedGers, selectedSchools, unitMin, unitMax, timeMin, timeMax,
    hideConflicts, hideUnavailable,
  } = criteria

  const deptsSet = new Set(selectedDepts ?? [])
  const termsSet = new Set(selectedTerms ?? [])
  const formatsSet = new Set(selectedFormats ?? [])
  const levelsSet = new Set(selectedLevels ?? [])
  const gersSet = new Set(selectedGers ?? [])
  const schoolsSet = new Set(selectedSchools ?? [])
  const hasTermFilter = termsSet.size > 0 && !termsSet.has('any')

  // Valid courses only (must have a grade basis), then canonical cross-list primary
  let result = courses.filter(c => c.grading && c.grading.trim() !== '' && c.grading !== 'TBD')
  result = result.filter(c => {
    const norm = normalizeCourseId(c.id)
    return resolveToCanonicalPrimary(norm, primaryMap) === norm
  })

  if (excludedWords && excludedWords.length > 0 && exclude !== 'exclude') {
    const excludedSet = new Set(excludedWords.map(w => w.toLowerCase()))
    result = result.filter(c => {
      const textToCheck = `${c.title} ${c.description} ${c.code}`.toLowerCase()
      return ![...excludedSet].some(word => textToCheck.includes(word))
    })
  }

  if (deptsSet.size > 0 && exclude !== 'depts') {
    result = result.filter(c => deptsSet.has(c.subject))
  }

  if (hasTermFilter && exclude !== 'terms') {
    result = result.filter(c => {
      if (c.terms) return c.terms.some(t => termsSet.has(t))
      return c.selectedTerm != null && termsSet.has(c.selectedTerm)
    })
  }

  if (formatsSet.size > 0 && exclude !== 'formats') {
    result = result.filter(c => {
      if (!c.sections || c.sections.length === 0) return true
      return c.sections.some(s => s.component && formatsSet.has(s.component))
    })
  }

  if (levelsSet.size > 0 && exclude !== 'levels') {
    result = result.filter(c => {
      const inferFromCode = () => levelsSet.has(formatLevel(c.code || ''))
      if (c.sections && c.sections.length > 0) {
        const sectionsToCheck = hasTermFilter
          ? c.sections.filter(s => s.term && termsSet.has(s.term))
          : c.sections
        const sectionMatch = sectionsToCheck.length > 0
          ? sectionsToCheck.some(s => s.classLevel && String(s.classLevel).trim() && levelsSet.has(formatLevel(s.classLevel)))
          : false
        if (sectionMatch) return true
      }
      return inferFromCode()
    })
  }

  if (gersSet.size > 0 && exclude !== 'gers') {
    result = result.filter(c => {
      if (!c.sections || c.sections.length === 0) return true
      return c.sections.some(s => s.gers && s.gers.some(g => gersSet.has(g)))
    })
  }

  const unitsFilterActive = unitMin > 1 || unitMax < 5
  if (unitsFilterActive && exclude !== 'units') {
    const min = Math.max(1, unitMin)
    const max = Math.min(5, unitMax)
    const maxOpen = max >= 5
    result = result.filter(c => {
      const checkUnits = (uStr: string | number) => {
        const opts = parseUnitsOptions(uStr)
        if (opts.length === 0) return false
        return opts.some(u => u >= min && (maxOpen ? true : u <= max))
      }
      if (c.sections && c.sections.length > 0) {
        const sectionsToCheck = hasTermFilter
          ? c.sections.filter(s => s.term && termsSet.has(s.term))
          : c.sections
        const sectionMatch = sectionsToCheck.length > 0
          ? sectionsToCheck.some(s => checkUnits(s.units))
          : false
        if (sectionMatch) return true
      }
      return checkUnits(c.units)
    })
  }

  const timeFilterActive = timeMin > 420 || timeMax < 1320
  if (timeFilterActive && exclude !== 'times') {
    const min = Math.max(420, timeMin)
    const max = Math.min(1320, timeMax)
    result = result.filter(c => {
      if (!c.sections || c.sections.length === 0) return true
      return c.sections.some(s => s.meetings?.some(m => {
        const range = parseTimeRange(m.time || '')
        if (!range?.startTime) return false
        const startMins = timeToMinutes(range.startTime)
        return startMins >= min && startMins <= max
      }))
    })
  }

  if (hideConflicts) {
    result = result.filter(c => {
      if (!c.sections || c.sections.length === 0) return true
      let sectionsToCheck = c.sections
      if (termsSet.size > 0) {
        sectionsToCheck = sectionsToCheck.filter(s => termsSet.has(s.term))
      }
      if (sectionsToCheck.length === 0) return true
      return sectionsToCheck.some(section => {
        const cartItemsForTerm = cartItems.filter(item => item.selectedTerm === section.term)
        if (cartItemsForTerm.length === 0) return true
        const sectionMeetings = parseSectionMeetings(section)
        if (sectionMeetings.length === 0) return true
        const isOverlapping = cartItemsForTerm.some(cartItem => {
          if (cartItem.id === c.id) return false
          const cartMeetings = parseMeetingTimes(cartItem, cartItem.selectedTerm)
          return cartMeetings.some(cm => sectionMeetings.some(sm => hasOverlap(sm, cm, cartItem)))
        })
        return !isOverlapping
      })
    })
  }

  if (hideUnavailable) {
    result = result.filter(c => {
      if (!c.sections || c.sections.length === 0) return true
      let sectionsToCheck = c.sections
      if (termsSet.size > 0) {
        sectionsToCheck = sectionsToCheck.filter(s => termsSet.has(s.term))
      }
      if (sectionsToCheck.length === 0) return true
      return sectionsToCheck.some(s => s.status?.toLowerCase() === 'open')
    })
  }

  if (schoolsSet.size > 0 && exclude !== 'schools') {
    result = result.filter(c => schoolsSet.has(getSchoolFromSubject(c.subject)))
  }

  return result
}

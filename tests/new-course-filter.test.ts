import { describe, expect, it } from 'vitest'
import { filterCourses } from '@/lib/course-filter'
import { getCrossListPrimaryMap } from '@/lib/utils'
import type { Course } from '@/types/course'

// Cases written to defeat the "new courses only" filter, not to agree with it.
// dump-catalog.mjs judges every row that has sections against its whole
// cross-list group: isNew true = the three prior catalogs never scheduled any of
// its codes and none has evaluations from those years; false = one of them did;
// undefined = the row has no sections, so the dump did not judge it.

function course(id: string, title: string, isNew?: boolean): Course {
  const match = /^([A-Z]+)(\d.*)$/.exec(id)!
  return {
    id,
    subject: match[1],
    code: match[2],
    title,
    description: '',
    units: '3',
    grading: 'Letter (ABCD/NP)',
    instructors: [],
    terms: ['Autumn 2026'],
    sections: [],
    ...(isNew === undefined ? {} : { isNew }),
  } as Course
}

const NO_FILTERS = {
  excludedWords: [], selectedDepts: [], selectedTerms: [], selectedFormats: [],
  selectedLevels: [], selectedGers: [], selectedSchools: [],
  // The sidebar's own defaults. Passing null here makes `unitMax < 5` true
  // (null coerces to 0) and filters the whole catalog away.
  unitMin: 1, unitMax: 5, timeMin: 420, timeMax: 1320,
  hideConflicts: false, hideUnavailable: false, hideStudyAbroad: false,
}

function newOnlyIds(courses: Course[]): string[] {
  const primaryMap = getCrossListPrimaryMap(courses)
  return filterCourses(courses, { ...NO_FILTERS, newOnly: true }, primaryMap, [])
    .map(c => c.id)
    .sort()
}

function allIds(courses: Course[]): string[] {
  const primaryMap = getCrossListPrimaryMap(courses)
  return filterCourses(courses, { ...NO_FILTERS, newOnly: false }, primaryMap, [])
    .map(c => c.id)
    .sort()
}

describe('newOnly filter', () => {
  it('is a no-op when off', () => {
    const courses = [course('CS106B', 'Programming Abstractions'), course('AA101', 'High Speed Gasdynamics', true)]
    expect(allIds(courses)).toEqual(['AA101', 'CS106B'])
  })

  it('keeps a standalone new course', () => {
    const courses = [course('CS106B', 'Programming Abstractions'), course('AA101', 'High Speed Gasdynamics', true)]
    expect(newOnlyIds(courses)).toEqual(['AA101'])
  })

  it('surfaces a new course under the canonical sibling browse keeps', () => {
    // ExploreCourses scheduled the AA 255 side; the ME 255 row has no sections,
    // so the dump left it unjudged. An unjudged sibling must abstain, not veto,
    // and the flag has to survive the collapse onto the canonical primary.
    const courses = [
      course('AA255', 'Origami Engineering (ME 255)', true),
      course('ME255', 'Origami Engineering (AA 255)'),
    ]
    expect(newOnlyIds(courses)).toEqual(['AA255'])
  })

  it('does NOT surface an existing course that gained a new cross-listed code', () => {
    // EE 186 has run for years; CS 140M is a new code on the same course. The
    // group is existing, not new. This is the case that shipped 41 wrong rows.
    const courses = [
      course('CS140M', 'Introduction to Embedded Systems (EE 186)', false),
      course('EE186', 'Introduction to Embedded Systems (CS 140M)', false),
    ]
    expect(newOnlyIds(courses)).toEqual([])
  })

  it('does NOT surface a new grad-level cross-listing of an existing course', () => {
    const courses = [
      // AFRICAAM 140 ran before, so the dump judges the 240C row existing even
      // though 240C itself is a code that never appeared in a prior catalog.
      course('AFRICAAM140', 'Black Ecologies (AFRICAAM 240C)'),
      course('AFRICAAM240C', 'Black Ecologies (AFRICAAM 140)', false),
    ]
    expect(newOnlyIds(courses)).toEqual([])
  })

  it('keeps a genuinely new course that is cross-listed from birth', () => {
    const courses = [
      course('AA254', 'Deployable Space Structures (ME 254)', true),
      course('ME254', 'Deployable Space Structures (AA 254)', true),
    ]
    expect(newOnlyIds(courses)).toEqual(['AA254'])
  })

  it('does not leak one group\'s newness into an unrelated group', () => {
    const courses = [
      course('AA255', 'Origami Engineering', true),
      course('CS140M', 'Introduction to Embedded Systems (EE 186)', false),
      course('EE186', 'Introduction to Embedded Systems (CS 140M)', false),
    ]
    expect(newOnlyIds(courses)).toEqual(['AA255'])
  })

  it('one existing sibling vetoes the group even when another says new', () => {
    // Guards the collapse rule itself: a false anywhere in the group wins.
    const courses = [
      course('CS140M', 'Introduction to Embedded Systems (EE 186)', true),
      course('EE186', 'Introduction to Embedded Systems (CS 140M)', false),
    ]
    expect(newOnlyIds(courses)).toEqual([])
  })

  it('returns nothing rather than everything when the dump set no flags', () => {
    // dump-catalog.mjs leaves isNew unset when prior-offerings.json is missing
    // or short of three years. That must read as "no new courses", never "all".
    const courses = [course('CS106B', 'Programming Abstractions'), course('AA101', 'High Speed Gasdynamics')]
    expect(newOnlyIds(courses)).toEqual([])
  })
})

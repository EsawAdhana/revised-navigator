import { describe, expect, it } from 'vitest'
import { CACHE_VERSION } from '@/lib/store'
import { rowToCourse } from '@/lib/course-mapper'

// The catalog cache in IndexedDB holds whole Course objects for up to 24h and is
// only discarded on a CACHE_VERSION mismatch. So adding a field to Course
// reaches nobody with a warm cache until CACHE_VERSION changes: "new courses
// only" shipped that way once and matched zero courses for every returning
// visitor. This pairs the cached shape with the version, so growing one without
// the other fails here instead of in production.
// v15 dropped `difficulty` (hrs/unit is derived from hours + units now) and
// started normalising title/description in rowToCourse, so a v14 cache holds
// both a dead field and untidied text.
const CACHED_COURSE_FIELDS_AT_V15 = [
  'id', 'subject', 'code', 'title', 'description', 'units', 'grading',
  'instructors', 'terms', 'sections', 'hours', 'quality', 'isNew',
].sort()

describe('catalog cache version', () => {
  it('is bumped whenever the cached Course shape changes', () => {
    const shape = Object.keys(rowToCourse({
      course_id: 'CS106B', subject: 'CS', code: '106B', title: 'Programming Abstractions',
      description: 'x', units: '5', grading: 'Letter (ABCD/NP)', instructors: [], terms: [],
      sections: [], hours: 10, quality: 4, difficulty: 2, isNew: false,
    })).sort()

    expect(
      shape,
      `Course gained or lost a field. Bump CACHE_VERSION (currently ${CACHE_VERSION}) ` +
      'and update this list, or returning visitors keep a catalog without it.',
    ).toEqual(CACHED_COURSE_FIELDS_AT_V15)
    expect(CACHE_VERSION).toBeGreaterThanOrEqual(15)
  })
})

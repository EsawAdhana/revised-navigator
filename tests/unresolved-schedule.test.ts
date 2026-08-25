import { describe, it, expect } from 'vitest'
import { findAffectedSchedule, courseLabel } from '@/lib/unresolved-schedule'

const course = (id: string, classIds: number[] = [], terms = ['Autumn 2026']) => ({
  id,
  terms,
  sections: classIds.map(classId => ({ classId })),
})

describe('courseLabel', () => {
  it('splits a course id back into subject and number', () => {
    expect(courseLabel('CS224U')).toBe('CS 224U')
    expect(courseLabel('MS&E256')).toBe('MS&E 256')
    expect(courseLabel('CHINLANG21B')).toBe('CHINLANG 21B')
  })

  it('leaves an id it cannot split alone', () => {
    expect(courseLabel('12345')).toBe('12345')
  })
})

describe('findAffectedSchedule', () => {
  it('reports nothing when every saved course is still in the catalog', () => {
    const items = [{ id: 'CS106A', subject: 'CS', code: '106A', selectedSectionIds: [1801] }]
    expect(findAffectedSchedule(items, [course('CS106A', [1801, 1807])], [])).toEqual({
      missing: [],
      movedSections: [],
    })
  })

  it('reports a signed-in user whose saved course could not be hydrated', () => {
    // The course is not in the cart at all — it only exists in the sync's
    // unresolved list, which is the whole reason that list is kept.
    const result = findAffectedSchedule([], [course('CS106A', [1801])], [{ id: 'CS224U' }])
    expect(result.missing).toEqual(['CS 224U'])
  })

  it('reports a signed-out user whose persisted cart item left the catalog', () => {
    const items = [{ id: 'CS103ACE', subject: 'CS', code: '103ACE' }]
    const result = findAffectedSchedule(items, [course('CS106A', [1801])], [])
    expect(result.missing).toEqual(['CS 103ACE'])
  })

  it('does not report the same course twice when both paths see it', () => {
    const items = [{ id: 'CS224U', subject: 'CS', code: '224U' }]
    const result = findAffectedSchedule(items, [], [{ id: 'CS224U' }])
    expect(result.missing).toEqual(['CS 224U'])
  })

  it('reports a picked section that no longer exists', () => {
    const items = [{ id: 'CS106A', subject: 'CS', code: '106A', selectedSectionIds: [1807] }]
    const result = findAffectedSchedule(items, [course('CS106A', [1801, 1899])], [])
    expect(result.movedSections).toEqual(['CS 106A'])
    expect(result.missing).toEqual([])
  })

  it('stays quiet for a course the user never picked a section for', () => {
    const items = [{ id: 'CS106A', subject: 'CS', code: '106A' }]
    expect(findAffectedSchedule(items, [course('CS106A', [1801])], []).movedSections).toEqual([])
  })

  it('stays quiet while the catalog is still light — no sections is not a change', () => {
    // Phase 1 of the catalog carries no sections; warning then would fire on
    // every schedule on every page load.
    const items = [{ id: 'CS106A', subject: 'CS', code: '106A', selectedSectionIds: [1801] }]
    expect(findAffectedSchedule(items, [course('CS106A', [])], []).movedSections).toEqual([])
  })

  it('reports a course whose sections all changed only once, not per section', () => {
    const items = [{ id: 'CS106A', subject: 'CS', code: '106A', selectedSectionIds: [1807, 1808] }]
    expect(findAffectedSchedule(items, [course('CS106A', [1801])], []).movedSections).toEqual(['CS 106A'])
  })

  it('keeps a missing course out of the moved-section list', () => {
    // A course with no catalog entry has no sections to compare, and saying
    // both things about one course would read as two separate problems.
    const items = [{ id: 'CS224U', subject: 'CS', code: '224U', selectedSectionIds: [25500] }]
    const result = findAffectedSchedule(items, [], [{ id: 'CS224U' }])
    expect(result).toEqual({ missing: ['CS 224U'], movedSections: [] })
  })

  it('reports a course the database still has but no longer schedules', () => {
    // clearStaleCourses empties terms and sections instead of deleting the row,
    // and the schedule page re-fetches cart courses straight from the database,
    // so a dropped course comes back looking present with nothing scheduled.
    const items = [{ id: 'CS224U', subject: 'CS', code: '224U', selectedSectionIds: [25500] }]
    const ghost = { id: 'CS224U', terms: [], sections: [] }
    expect(findAffectedSchedule(items, [ghost], [])).toEqual({
      missing: ['CS 224U'],
      movedSections: [],
    })
  })

  it('sorts both lists so the wording is stable across reloads', () => {
    const items = [
      { id: 'PHIL367C', subject: 'PHIL', code: '367C', selectedSectionIds: [9] },
      { id: 'AA100', subject: 'AA', code: '100', selectedSectionIds: [9] },
    ]
    const catalog = [course('PHIL367C', [1]), course('AA100', [1])]
    const result = findAffectedSchedule(items, catalog, [{ id: 'ZZZ1' }, { id: 'AAA1' }])
    expect(result.movedSections).toEqual(['AA 100', 'PHIL 367C'])
    expect(result.missing).toEqual(['AAA 1', 'ZZZ 1'])
  })

  it('falls back to the id when a saved item has no subject or code', () => {
    const items = [{ id: 'CS106A', selectedSectionIds: [1807] }]
    expect(findAffectedSchedule(items, [course('CS106A', [1801])], []).movedSections).toEqual(['CS 106A'])
  })
})

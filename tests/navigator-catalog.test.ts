import { describe, it, expect } from 'vitest'
import { buildCourses, crossListsByCrseId, decodeEntities, fetchYearClasses, mergeCrossListTitle } from '../scripts/navigator-catalog.mjs'
import { parseDays, parseTimeRange, timeToMinutes } from '@/lib/schedule-utils'

/** A primary class as Navigator's Algolia index returns it. */
function hit(over: Record<string, unknown> = {}) {
  return {
    subject: 'CS',
    catalogNbr: '106A',
    courseCode: 'CS 106A',
    courseTitle: 'Programming Methodology',
    courseDescr: 'Intro.',
    crseId: '105644',
    termOffered: 'Autumn 2026',
    strm: '1272',
    acadYearLabel: '2026-2027',
    deptName: 'Computer Science',
    acadCareerDescr: 'Undergraduate',
    classNbr: 1801,
    classSection: '01',
    componentPrimary: 'LEC',
    components: ['Lecture', 'Discussion'],
    units: [3, 5],
    gradingBasisDescr: 'Letter or Credit/No Credit',
    geRequirements: ['Formal Reasoning (FR)'],
    enrlCap: 500,
    enrlTot: 120,
    waitCap: 10,
    waitTot: 2,
    enrlStatDescr: 'Open',
    classStatDescr: 'Active',
    instructionModeDescr: 'In Person',
    startDt: '2026-09-22',
    endDt: '2026-12-04',
    meetings: [
      {
        facilityDescr: 'Hewlett Teaching Center 200',
        room: '200',
        startTime: '3:00 PM',
        endTime: '4:20 PM',
        daysOfWeek: 'Tues, Thurs',
        daysOfWeekList: ['Tuesday', 'Thursday'],
        instructors: [{ sunetId: 'psl', firstName: 'Percy', lastName: 'Liang' }],
      },
    ],
    ...over,
  }
}

function relatedClass(over: Record<string, unknown> = {}) {
  return {
    relatedClassNbr: 1815,
    relatedClassSection: '10',
    relatedClassComponent: 'DIS',
    relatedClassCapacityEnrollment: 15,
    relatedClassTotalEnrollment: 3,
    relatedClassCapacityWaitlist: 0,
    relatedClassTotalWaitlist: 0,
    relatedClassEnrollmentStatusDescr: 'Open',
    relatedClassStatusDescr: 'Active',
    relatedClassMeetings: [
      {
        relatedClassStartTime: '08:30 AM',
        relatedClassEndTime: '09:20 AM',
        relatedClassMon: 'Y',
        relatedClassTues: 'N',
        relatedClassWed: 'Y',
        relatedClassThur: 'N',
        relatedClassFri: 'N',
        relatedClassSat: 'N',
        relatedClassSun: 'N',
        relatedClassRoomDescr: '160-323',
        relatedClassInstructors: [
          { relatedClassInstrFirstName: '1', relatedClassInstrLastName: 'Staff' },
        ],
      },
    ],
    ...over,
  }
}

const build = (hits: unknown[], related: Map<string, unknown[]> = new Map(), overrides = {}) =>
  buildCourses(hits, related, { instructorOverrides: overrides, sortTerms: (t: string[]) => t })

describe('unit labels', () => {
  it('matches the ExploreCourses shape for ranges, fixed values and zero-unit classes', () => {
    expect(build([hit({ units: [3, 5] })])[0].units).toBe('3-5')
    expect(build([hit({ units: [3] })])[0].units).toBe('3')
    expect(build([hit({ units: [3.0] })])[0].units).toBe('3')
    expect(build([hit({ units: [0] })])[0].units).toBe('0')
    expect(build([hit({ units: null })])[0].units).toBe('0')
    // A variable-unit class enumerates every allowed value; only the ends matter.
    expect(build([hit({ units: [1, 2, 3, 4] })])[0].units).toBe('1-4')
    // The range spans every class of the course, not just the newest one.
    expect(build([
      hit({ units: [3] }),
      hit({ termOffered: 'Winter 2027', strm: '1274', classNbr: 1877, units: [3, 5] }),
    ])[0].units).toBe('3-5')
  })
})

describe('instructors', () => {
  it('drops the "Staff" placeholder instead of publishing "Staff, 1"', () => {
    const course = build([hit()], new Map([['1272|1801', [relatedClass()]]]))[0]
    expect(course.instructors).toEqual(['Liang, Percy'])
    const dis = course.sections.find((s: { component: string }) => s.component === 'DIS')
    expect(dis.meetings[0].instructors).toEqual([])
  })

  it('applies the SUNet override, which exists because some records hold an initial', () => {
    const [course] = build(
      [hit({ meetings: [{ ...hit().meetings[0], instructors: [{ sunetId: 'jzou', firstName: 'J', lastName: 'Zou' }] }] })],
      new Map(),
      { jzou: 'Zou, James' }
    )
    expect(course.instructors).toEqual(['Zou, James'])
  })

  it('keeps a last-name-only instructor rather than dropping the meeting', () => {
    const [course] = build([
      hit({ meetings: [{ ...hit().meetings[0], instructors: [{ lastName: 'Ng' }] }] }),
    ])
    expect(course.instructors).toEqual(['Ng'])
  })
})

describe('meetings the app has to parse', () => {
  it('emits days and times the schedule parser understands, for both section kinds', () => {
    const course = build([hit()], new Map([['1272|1801', [relatedClass()]]]))[0]
    const lec = course.sections.find((s: { component: string }) => s.component === 'LEC')
    const dis = course.sections.find((s: { component: string }) => s.component === 'DIS')

    expect(parseDays(lec.meetings[0].days)).toEqual(['Tue', 'Thu'])
    expect(parseDays(dis.meetings[0].days)).toEqual(['Mon', 'Wed'])

    const lecTime = parseTimeRange(lec.meetings[0].time)!
    expect(timeToMinutes(lecTime.startTime)).toBe(15 * 60)
    expect(timeToMinutes(lecTime.endTime)).toBe(16 * 60 + 20)

    // Related-class times arrive zero-padded ("08:30 AM"); the range must still parse.
    const disTime = parseTimeRange(dis.meetings[0].time)!
    expect(timeToMinutes(disTime.startTime)).toBe(8 * 60 + 30)
    expect(timeToMinutes(disTime.endTime)).toBe(9 * 60 + 20)
  })

  it('falls back to the flat day string when the day list is absent', () => {
    const [course] = build([
      hit({ meetings: [{ ...hit().meetings[0], daysOfWeekList: undefined, daysOfWeek: 'Mon, Wed, Fri' }] }),
    ])
    expect(parseDays(course.sections[0].meetings[0].days)).toEqual(['Mon', 'Wed', 'Fri'])
  })
})

describe('course rows', () => {
  it('carries enrollment, dates, mode and GERs onto the primary section', () => {
    const [course] = build([hit()])
    const [section] = course.sections
    expect(section).toMatchObject({
      term: 'Autumn 2026',
      classId: 1801,
      component: 'LEC',
      status: 'Open',
      enrolled: 120,
      capacity: 500,
      openSeats: 380,
      waitlist: 2,
      waitlistMax: 10,
      instructionalMode: 'In Person',
      startDate: '2026-09-22',
      endDate: '2026-12-04',
      gers: ['WAY-FR'],
    })
  })

  it('never reports negative open seats when a class is over-enrolled', () => {
    const [course] = build([hit({ enrlCap: 10, enrlTot: 14 })])
    expect(course.sections[0].openSeats).toBe(0)
  })

  it('groups terms under one course and dedupes a class returned twice', () => {
    const [course] = build([
      hit(),
      hit(),
      hit({ termOffered: 'Winter 2027', strm: '1274', classNbr: 1877 }),
    ])
    expect(course.sections.map((s: { classId: number }) => s.classId)).toEqual([1801, 1877])
    expect(course.terms).toEqual(['Autumn 2026', 'Winter 2027'])
  })

  it('keeps cross-listed codes as separate courses, the way the catalog lists them', () => {
    const courses = build([
      hit(),
      hit({ subject: 'AA', catalogNbr: '228', courseCode: 'AA 228', classNbr: 2, crseId: '215840' }),
    ])
    expect(courses.map((c: { course_id: string }) => c.course_id).sort()).toEqual(['AA228', 'CS106A'])
  })

  it('drops a hit with no subject or catalog number rather than writing a junk id', () => {
    expect(build([hit({ subject: '' })])).toEqual([])
    expect(build([hit({ catalogNbr: null })])).toEqual([])
  })

  it('falls back to an older class for a field the newest one is missing', () => {
    // A course with no grading is dropped from browse entirely, so a single
    // class missing the basis must not blank the whole course.
    const [course] = build([
      hit({ gradingBasisDescr: 'Medical Satisfactory/No Credit' }),
      hit({ termOffered: 'Winter 2027', strm: '1274', classNbr: 1877, gradingBasisDescr: undefined }),
    ])
    expect(course.grading).toBe('Medical Satisfactory/No Credit')
  })

  it('takes the title and description from the latest term when they change mid-year', () => {
    const [course] = build([
      hit({ courseTitle: 'Old title' }),
      hit({ termOffered: 'Spring 2027', strm: '1276', classNbr: 1924, courseTitle: 'New title' }),
    ])
    expect(course.title).toBe('New title')
  })
})

describe('GER codes', () => {
  it('translates PeopleSoft labels into the codes the browse filter speaks', () => {
    const [course] = build([hit({ geRequirements: ['Formal Reasoning (FR)', 'COLLEGE', 'Writing 2'] })])
    expect(course.sections[0].gers).toEqual(['WAY-FR', 'College', 'Writing 2'])
  })

  it('passes an unrecognised requirement through untouched', () => {
    const [course] = build([hit({ geRequirements: ['Some New Requirement'] })])
    expect(course.sections[0].gers).toEqual(['Some New Requirement'])
  })
})

describe('placeholder meeting times', () => {
  it('drops the zero-length noon slot but keeps the instructor on it', () => {
    const [course] = build([
      hit({
        meetings: [{
          startTime: '12:00 PM', endTime: '12:00 PM', daysOfWeekList: [], daysOfWeek: '',
          instructors: [{ sunetId: 'aviad', firstName: 'Aviad', lastName: 'Rubinstein' }],
        }],
      }),
    ])
    expect(course.sections[0].meetings[0].time).toBe('')
    expect(course.instructors).toEqual(['Rubinstein, Aviad'])
  })

  it('drops a half-populated time rather than emitting a one-ended range', () => {
    const [course] = build([hit({ meetings: [{ ...hit().meetings[0], endTime: '' }] })])
    expect(course.sections[0].meetings[0].time).toBe('')
  })

  it('keeps a real related-class time and strips its leading zero', () => {
    const course = build([hit()], new Map([['1272|1801', [relatedClass()]]]))[0]
    const dis = course.sections.find((s: { component: string }) => s.component === 'DIS')
    expect(dis.meetings[0].time).toBe('8:30 AM – 9:20 AM')
  })
})

describe('merging ExploreCourses cross-list titles', () => {
  it('unions both sides and keeps the numeric ordering', () => {
    expect(mergeCrossListTitle('Black Ecologies (AFRICAAM 240C, ENGLISH 246)', 'Black Ecologies (AFRICAAM 140, EARTHSYS 146J, ENGLISH 246)'))
      .toBe('Black Ecologies (AFRICAAM 140, AFRICAAM 240C, EARTHSYS 146J, ENGLISH 246)')
  })

  it('adds a parenthetical to a title that had none', () => {
    expect(mergeCrossListTitle('Imagining the Oceans', 'Imagining the Oceans (ENGLISH 268A)'))
      .toBe('Imagining the Oceans (ENGLISH 268A)')
  })

  it('leaves the title alone when ExploreCourses adds nothing', () => {
    expect(mergeCrossListTitle('Baroque Tragedy', 'Baroque Tragedy')).toBe('Baroque Tragedy')
  })

  it('ignores a parenthetical that is prose, not a code list', () => {
    // "Thesis (Ph.D.)" and "Light & Shadow III (4x5)" are titles, not cross-lists.
    expect(mergeCrossListTitle('Thesis', 'Thesis (Ph.D.)')).toBe('Thesis')
    expect(mergeCrossListTitle('Programming Methodologies (Accelerated)', 'Programming Methodologies (Accelerated)'))
      .toBe('Programming Methodologies (Accelerated)')
  })

  it('does not let a prose parenthetical swallow the base title', () => {
    expect(mergeCrossListTitle('Ancient Urbanism (CLASSICS 153)', 'Ancient Urbanism (a survey)'))
      .toBe('Ancient Urbanism (CLASSICS 153)')
  })
})

describe('cross-list groups', () => {
  it('groups every code PeopleSoft schedules under one crseId', () => {
    const groups = crossListsByCrseId([
      hit({ subject: 'CS', catalogNbr: '238', crseId: '215840', classNbr: 1 }),
      hit({ subject: 'AA', catalogNbr: '228', crseId: '215840', classNbr: 2 }),
      hit({ subject: 'CS', catalogNbr: '221', crseId: '105730', classNbr: 3 }),
    ])
    expect([...groups.get('215840')].sort()).toEqual(['AA228', 'CS238'])
    expect([...groups.get('105730')]).toEqual(['CS221'])
  })
})

// ── The sharded walk ─────────────────────────────────────────────────────────
// A secured key caps every query at 1000 hits and reports nbHits above that
// without returning the rows, so the walk has to keep splitting. These use a
// fake index to force the splits a real term only hits in a few departments.

type FakeHit = { classNbr: number; strm: string; deptName: string; acadCareerDescr: string; sortPrefix: number }

function fakeClient(rows: FakeHit[]) {
  const client = {
    queryCount: 0,
    async search(body: { filters?: string; facets?: string[]; hitsPerPage: number }) {
      client.queryCount++
      const filters = body.filters || ''
      const dept = /deptName:"([^"]+)"/.exec(filters)?.[1]
      const career = /acadCareerDescr:"([^"]+)"/.exec(filters)?.[1]
      const lo = /sortPrefix >= (\d+)/.exec(filters)?.[1]
      const hi = /sortPrefix < (\d+)/.exec(filters)?.[1]
      const matched = rows.filter(r =>
        (!dept || r.deptName === dept) &&
        (!career || r.acadCareerDescr === career) &&
        (lo === undefined || r.sortPrefix >= Number(lo)) &&
        (hi === undefined || r.sortPrefix < Number(hi))
      )
      const facets: Record<string, Record<string, number>> = {}
      for (const name of body.facets || []) {
        facets[name] = {}
        for (const row of matched) {
          const value = String(row[name as keyof FakeHit])
          facets[name][value] = (facets[name][value] || 0) + 1
        }
      }
      return {
        nbHits: matched.length,
        // Algolia refuses to return past the cap; nbHits still reports the truth.
        hits: matched.length > 1000 || body.hitsPerPage === 0 ? [] : matched,
        facets,
      }
    },
  }
  return client
}

function fakeRows(dept: string, count: number, career = 'Undergraduate', from = 0): FakeHit[] {
  return Array.from({ length: count }, (_, i) => ({
    classNbr: from + i,
    strm: '1272',
    deptName: dept,
    acadCareerDescr: career,
    sortPrefix: (i % 900) + 1,
  }))
}

describe('sharded year walk', () => {
  const pull = (client: ReturnType<typeof fakeClient>) =>
    fetchYearClasses(client, { yearLabel: '2026-2027', terms: ['Autumn 2026'] })

  it('returns a small department in one query', async () => {
    const client = fakeClient(fakeRows('Music', 30))
    const { classes } = await pull(client)
    expect(classes).toHaveLength(30)
  })

  it('splits a department that exceeds the 1000-hit cap by career', async () => {
    const client = fakeClient([
      ...fakeRows('Computer Science', 900, 'Undergraduate', 0),
      ...fakeRows('Computer Science', 900, 'Graduate', 1000),
    ])
    const { classes } = await pull(client)
    expect(classes).toHaveLength(1800)
  })

  it('falls back to catalog-number bands when one career alone is over the cap', async () => {
    const client = fakeClient(fakeRows('Graduate School of Business', 1400, 'Graduate'))
    const { classes } = await pull(client)
    expect(classes).toHaveLength(1400)
  })

  it('throws instead of returning a truncated catalog when hits go missing', async () => {
    // A band that stays over the cap loses rows; the facet count catches it.
    const rows = fakeRows('Law', 1200, 'Law').map(r => ({ ...r, sortPrefix: 5 }))
    await expect(pull(fakeClient(rows))).rejects.toThrow(/incomplete/)
  })
})

describe('decodeEntities', () => {
  it('decodes the entities Navigator actually sends', () => {
    expect(decodeEntities('the Registrar&#39;s Office')).toBe("the Registrar's Office")
    expect(decodeEntities('&lt;i&gt;The No. 1 Ladies')).toBe('<i>The No. 1 Ladies')
    expect(decodeEntities('Ethics &amp; Society')).toBe('Ethics & Society')
    expect(decodeEntities('&quot;source code&quot;')).toBe('"source code"')
  })

  it('does not round-trip an escaped entity into a live tag', () => {
    // &amp; must be decoded last, or "&amp;lt;script&amp;gt;" becomes "<script>".
    expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;')
    expect(decodeEntities('&amp;amp;')).toBe('&amp;')
  })

  it('leaves text with no entities byte-identical', () => {
    const plain = 'A coder’s primer — 3-4 units, 50% online.'
    expect(decodeEntities(plain)).toBe(plain)
  })

  it('leaves a bare ampersand and an unknown entity alone', () => {
    expect(decodeEntities('R&D')).toBe('R&D')
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;')
  })

  it('handles hex refs and null-ish input without throwing', () => {
    expect(decodeEntities('&#x27;')).toBe("'")
    expect(decodeEntities(null)).toBe('')
    expect(decodeEntities(undefined)).toBe('')
    expect(decodeEntities('')).toBe('')
  })
})

describe('instructor names are decoded', () => {
  it('decodes an escaped apostrophe in a surname', () => {
    // STATS 229 shipped with 'O&#039;Carroll, Liam' on a meeting: instructor
    // names were the one text field decodeEntities was not applied to.
    const [course] = buildCourses([hit({
      meetings: [{
        facilityDescr: 'Sequoia 200',
        startTime: '9:00 AM',
        endTime: '10:20 AM',
        daysOfWeekList: ['Monday'],
        instructors: [{ firstName: 'Liam', lastName: 'O&#039;Carroll' }],
      }],
    })] as never)

    expect(course.sections[0].meetings[0].instructors).toEqual(["O'Carroll, Liam"])
    expect(course.instructors).toEqual(["O'Carroll, Liam"])
  })

  it('decodes an escaped ampersand and leaves a plain name alone', () => {
    const [course] = buildCourses([hit({
      meetings: [{
        startTime: '9:00 AM',
        endTime: '10:20 AM',
        daysOfWeekList: ['Monday'],
        instructors: [
          { firstName: 'Ann', lastName: 'Smith &amp; Jones' },
          { firstName: 'Percy', lastName: 'Liang' },
        ],
      }],
    })] as never)

    expect(course.sections[0].meetings[0].instructors).toEqual(['Smith & Jones, Ann', 'Liang, Percy'])
  })

  it('still drops a placeholder instructor after decoding', () => {
    const [course] = buildCourses([hit({
      meetings: [{
        startTime: '9:00 AM',
        endTime: '10:20 AM',
        daysOfWeekList: ['Monday'],
        instructors: [{ firstName: '', lastName: '' }],
      }],
    })] as never)

    expect(course.sections[0].meetings[0].instructors).toEqual([])
  })
})

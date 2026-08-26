import { describe, expect, it } from 'vitest'
import { buildDescriptionSegments } from '@/components/course-description'

/** Catalog knows CEE 107S/207S and CEE 30; nothing else resolves. */
const resolve = (subject: string, code: string) =>
    ({ 'CEE|107S': 'CEE107S', 'CEE|207S': 'CEE207S', 'CEE|30': 'CEE30' } as Record<string, string>)[`${subject}|${code}`]

const render = (text: string, bare?: Map<number, [number, string]>) =>
    buildDescriptionSegments('CEE107D', text, resolve, bare ?? new Map()).map(s => s.text).join('')

describe('buildDescriptionSegments — prose is never rewritten', () => {
    // The reported bug: bare numbers in a CEE description came back as "CEE 80", "12:CEE 30 PM".
    it('leaves durations and clock times alone', () => {
        const text = 'meets once per week for 80 minutes (Mondays, 12:30 PM - 1:50 PM).'
        expect(render(text)).toBe(text)
    })

    it('leaves a bare number alone even when it resolves to a real course', () => {
        expect(render('the 30 students enrolled')).toBe('the 30 students enrolled')
    })

    it('round-trips the full reported description verbatim', () => {
        const text =
            'Enroll for 5 units to also attend the Workshop, an interactive discussion section on cross-cutting topics that meets once per week for 80 minutes (Mondays, 12:30 PM - 1:50 PM). CEE 107S/CEE 207S Understand Energy: Essentials is a shorter (3 unit) version. Prerequisites: Algebra.'
        expect(render(text)).toBe(text)
    })

    it('still links a real course code in prereq context', () => {
        const segs = buildDescriptionSegments('CEE107D', 'Prerequisites: CEE 107S or equivalent.', resolve, new Map())
        expect(segs.filter(s => s.courseId)).toEqual([{ text: 'CEE 107S', courseId: 'CEE107S' }])
        expect(segs.map(s => s.text).join('')).toBe('Prerequisites: CEE 107S or equivalent.')
    })

    it('never emits a subject that is absent from the source text', () => {
        const cases = [
            'Prerequisites: 30 or consent.',
            'Prerequisites: CEE 107S.',
            'meets for 80 minutes at 12:30 PM',
            'Recommended: BIOMEDIN 210 or 214 or 215.',
        ]
        for (const text of cases) expect(render(text)).toBe(text)
    })
})

describe('bare numbers link only from the reviewed list', () => {
    const text = 'Prerequisites: 30 or consent.'

    it('does not link a bare number with no reviewed entry', () => {
        expect(buildDescriptionSegments('CEE107D', text, resolve, new Map()).filter(s => s.courseId)).toEqual([])
    })

    it('links it when the review says so, printing the source text', () => {
        const segs = buildDescriptionSegments('CEE107D', text, resolve, new Map([[15, [2, 'CEE30']]]))
        expect(segs).toEqual([
            { text: 'Prerequisites: ' },
            { text: '30', courseId: 'CEE30' },
            { text: ' or consent.' },
        ])
    })

    it('ignores a reviewed entry whose length no longer matches the span', () => {
        const segs = buildDescriptionSegments('CEE107D', text, resolve, new Map([[15, [3, 'CEE30']]]))
        expect(segs.filter(s => s.courseId)).toEqual([])
    })

    it('ignores a reviewed entry at a stale offset', () => {
        const segs = buildDescriptionSegments('CEE107D', text, resolve, new Map([[14, [2, 'CEE30']]]))
        expect(segs.filter(s => s.courseId)).toEqual([])
    })
})

describe('bare links to courses that left the catalog', () => {
    const resolve = () => undefined
    const text = 'Prerequisites: 30 or consent.'
    const reviewed = new Map<number, [number, string]>([[15, [2, 'CEE30']]])

    it('renders plain text when the reviewed target is gone', () => {
        // Stanford unschedules courses. CS 224V linked a bare "180" to LINGUIST 180 and
        // sent users to "Course Not Found"; a dead target must degrade, not link.
        const segs = buildDescriptionSegments('CEE107D', text, resolve, reviewed, () => false)
        expect(segs.filter(s => s.courseId)).toEqual([])
        expect(segs.map(s => s.text).join('')).toBe(text)
    })

    it('still links when the target is in the catalog', () => {
        const segs = buildDescriptionSegments('CEE107D', text, resolve, reviewed, id => id === 'CEE30')
        expect(segs.filter(s => s.courseId)).toEqual([{ text: '30', courseId: 'CEE30' }])
    })

    it('checks the reviewed target, not the course being described', () => {
        const segs = buildDescriptionSegments('CEE107D', text, resolve, reviewed, id => id === 'CEE107D')
        expect(segs.filter(s => s.courseId)).toEqual([])
    })

    it('treats an omitted checker as no check, so existing callers are unaffected', () => {
        const segs = buildDescriptionSegments('CEE107D', text, resolve, reviewed)
        expect(segs.filter(s => s.courseId)).toEqual([{ text: '30', courseId: 'CEE30' }])
    })

    it('applies the guard to every bare link in one description, not just the first', () => {
        const many = 'Prerequisites: 30 and 40 recommended.'
        const links = new Map<number, [number, string]>([[15, [2, 'CEE30']], [22, [2, 'CEE40']]])
        const segs = buildDescriptionSegments('CEE107D', many, resolve, links, id => id === 'CEE40')
        expect(segs.filter(s => s.courseId)).toEqual([{ text: '40', courseId: 'CEE40' }])
        expect(segs.map(s => s.text).join('')).toBe(many)
    })

    it('does not weaken the span check when the target does exist', () => {
        // A drifted offset must still refuse to link even for a live course.
        const drifted = new Map<number, [number, string]>([[14, [2, 'CEE30']]])
        const segs = buildDescriptionSegments('CEE107D', text, resolve, drifted, () => true)
        expect(segs.filter(s => s.courseId)).toEqual([])
    })
})

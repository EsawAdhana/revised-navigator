import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDescriptionSegments } from '@/components/course-description'
import { decodeHtmlEntities, normalizeCatalogDescription } from '@/lib/utils'

/**
 * The whole catalog, not a handful of hand-picked strings: rendering a
 * description must never change a single character of it. This is the check
 * that would have caught "for CEE 80 minutes" on any of 8k+ courses.
 */
describe('every catalog description round-trips unchanged', () => {
    const file = path.join(process.cwd(), 'public/catalog/full.json')

    it('emits the source text verbatim for all courses', () => {
        const courses: Array<{ course_id: string; subject: string; code: string; description?: string }> =
            JSON.parse(fs.readFileSync(file, 'utf8'))
        expect(courses.length).toBeGreaterThan(1000)

        const ids = new Map(courses.map(c => [`${c.subject}|${c.code}`, c.course_id]))
        const resolve = (subject: string, code: string) => ids.get(`${subject}|${code}`)

        const broken: string[] = []
        for (const c of courses) {
            if (!c.description) continue
            const source = normalizeCatalogDescription(c.description)
            const rendered = buildDescriptionSegments(c.course_id, source, resolve)
                .map(s => s.text)
                .join('')
            if (rendered !== decodeHtmlEntities(source)) broken.push(c.course_id)
        }
        expect(broken).toEqual([])
    })
})

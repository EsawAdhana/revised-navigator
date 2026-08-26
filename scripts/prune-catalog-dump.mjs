/**
 * Drop fields from the committed catalog dumps that no UI reads, or that are
 * always empty. Every visitor downloads full.json, so dead keys are dead
 * bandwidth, parse time and memory on 65k sections.
 *
 *   node scripts/prune-catalog-dump.mjs            # report only
 *   node scripts/prune-catalog-dump.mjs --write    # rewrite the dumps
 *
 * Removed:
 *   section.openSeats  — read nowhere; always exactly capacity - enrolled
 *   section.classLevel — empty in 100% of rows; callers infer from course code
 *   section.gers       — when the array is empty (91% of rows)
 *   meeting.days/time/location/instructors — when empty (83-90% of rows)
 *   course.difficulty  — superseded by hoursPerUnit(hours, units)
 *
 * Idempotent: running it twice changes nothing. The generators
 * (navigator-catalog.mjs, scrape-sections.mjs) apply the same rules, so a fresh
 * dump lands pruned; this exists to prune dumps already committed.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const write = process.argv.includes('--write')
const FILES = ['public/catalog/full.json', 'public/catalog/light.json']

const isEmpty = v => v === '' || v == null || (Array.isArray(v) && v.length === 0)

function pruneCourse(course) {
    delete course.difficulty
    for (const section of course.sections || []) {
        delete section.openSeats
        if (isEmpty(section.classLevel)) delete section.classLevel
        if (isEmpty(section.gers)) delete section.gers
        for (const meeting of section.meetings || []) {
            for (const key of ['days', 'time', 'location', 'instructors']) {
                if (isEmpty(meeting[key])) delete meeting[key]
            }
        }
    }
    return course
}

for (const file of FILES) {
    const before = statSync(file).size
    const courses = JSON.parse(readFileSync(file, 'utf8'))
    const json = JSON.stringify(courses.map(pruneCourse))
    const after = Buffer.byteLength(json)
    const gzBefore = gzipSync(readFileSync(file)).length
    const gzAfter = gzipSync(Buffer.from(json)).length
    const mb = n => (n / 1048576).toFixed(2)
    console.log(
        `${file}\n  raw  ${mb(before)} MB -> ${mb(after)} MB  (-${mb(before - after)} MB, ${((1 - after / before) * 100).toFixed(1)}%)` +
        `\n  gzip ${mb(gzBefore)} MB -> ${mb(gzAfter)} MB  (-${mb(gzBefore - gzAfter)} MB, ${((1 - gzAfter / gzBefore) * 100).toFixed(1)}%)`,
    )
    if (write) writeFileSync(file, json + '\n')
}
console.log(write ? 'dumps rewritten' : 'dry run — pass --write to rewrite')

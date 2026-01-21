/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')

const INPUT_FILE = path.join(process.cwd(), 'public/data/courses.json')
const OUTPUT_DIR = path.join(process.cwd(), 'public/data')

function getQuarterFromTerm (term) {
  if (!term || typeof term !== 'string') return null
  const lower = term.toLowerCase()
  if (lower.startsWith('autumn') || lower.startsWith('fall')) return 'fall'
  if (lower.startsWith('winter')) return 'winter'
  if (lower.startsWith('spring')) return 'spring'
  if (lower.startsWith('summer')) return 'summer'
  return null
}

function uniqStrings (arr) {
  return Array.from(new Set((arr || []).filter(Boolean)))
}

function splitCourseForTerm (course, term) {
  const sections = Array.isArray(course.sections) ? course.sections : []
  const termSections = sections.filter(s => s && s.term === term)

  return {
    ...course,
    term,
    terms: [term],
    sections: termSections
  }
}

function main () {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Missing input file: ${INPUT_FILE}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(INPUT_FILE, 'utf8')
  const data = JSON.parse(raw)
  const courses = Array.isArray(data) ? data : (data?.courses ?? [])

  const out = {
    fall: [],
    winter: [],
    spring: [],
    summer: []
  }

  for (const course of courses) {
    const terms = uniqStrings(course?.terms)
    if (terms.length === 0) continue

    for (const term of terms) {
      const quarter = getQuarterFromTerm(term)
      if (!quarter) continue
      out[quarter].push(splitCourseForTerm(course, term))
    }
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const quarter of Object.keys(out)) {
    const outFile = path.join(OUTPUT_DIR, `${quarter}.json`)
    fs.writeFileSync(outFile, JSON.stringify(out[quarter], null, 2))
    console.log(`Wrote ${out[quarter].length} courses -> ${outFile}`)
  }
}

main()


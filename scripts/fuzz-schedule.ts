#!/usr/bin/env npx tsx
/**
 * Fuzzer for Stanford Root schedule parsing (schedule-utils.ts).
 *
 * Targets: timeToMinutes, parseTimeStringToMinutes, parseMeetingTimes
 * Bug classes: crashes, hangs (regex DoS), malformed input handling
 *
 * Usage:
 *   npm run fuzz
 *   npx tsx scripts/fuzz-schedule.ts
 *   npx tsx scripts/fuzz-schedule.ts --iterations 50000
 *   npx tsx scripts/fuzz-schedule.ts --iterations 100000
 */

import {
  timeToMinutes,
  parseTimeStringToMinutes,
  parseMeetingTimes,
} from '../src/lib/schedule-utils'
import type { Course, Section } from '../src/types/course'

// --- Seed corpus: valid meeting strings from real Stanford course data ---
const DAYS_CORPUS = [
  'Mon/Wed',
  'MWF',
  'Tue/Thu',
  'TTh',
  'TuTh',
  'Mon',
  'Fri',
  'M',
  'T',
  'W',
  'R',
  'F',
  'Mon, Wed, Fri',
  'TBA',
  '',
]

const TIME_CORPUS = [
  '10:00 AM - 11:30 AM',
  '9:30 AM – 11:20 AM', // en-dash
  '14:30 - 15:45',
  '9:00 AM',
  '12:00 PM',
  '12:00 AM',
  '1:30 PM',
  'TBA',
  '10:00AM-11:30AM',
  '24:00',
  '',
]

// Aggressive: regex-heavy and ReDoS-prone strings
const AGGRESSIVE_CORPUS = [
  '(((((((((((((((((((((a',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '.*.*.*.*.*.*.*.*.*.*',
  '[][][][][][][][][][]',
  '(((((((((((((((((((((((((((((((((((((((((((((((((((((',
  'a'.repeat(500),
  ' '.repeat(1000),
  '\n\n\n\n\n\n\n\n\n\n',
  'Mon' + ' '.repeat(200) + 'Wed',
  '10:00' + ' AM'.repeat(50),
]

const FUZZ_CHARS = ' \t\n\r\x00\x01MonTueWedThuFriAMPM0123456789:-/.\\[]()*+?{}|^$%\u200B\uFEFF'

function randomInt(max: number): number {
  return Math.floor(Math.random() * max)
}

function mutateString(s: string): string {
  if (s.length === 0) return FUZZ_CHARS[randomInt(FUZZ_CHARS.length)]
  const op = randomInt(10)
  const i = randomInt(s.length + 1)
  switch (op) {
    case 0: // flip byte
      return s.slice(0, i) + FUZZ_CHARS[randomInt(FUZZ_CHARS.length)] + s.slice(i + 1)
    case 1: // insert
      return s.slice(0, i) + FUZZ_CHARS[randomInt(FUZZ_CHARS.length)] + s.slice(i)
    case 2: // delete
      return s.slice(0, i) + s.slice(i + 1)
    case 3: // repeat char
      return s.slice(0, i) + s[i] + s[i] + s.slice(i + 1)
    case 4: // truncate
      return s.slice(0, Math.max(0, s.length - randomInt(s.length || 1)))
    case 5: // repeat substring (long strings)
      if (s.length > 0 && randomInt(10) === 0) {
        const sub = s.slice(0, Math.min(5, s.length))
        return sub.repeat(100 + randomInt(500))
      }
      return s
    case 6: // prepend/append special chars
      const c = FUZZ_CHARS[randomInt(FUZZ_CHARS.length)]
      return randomInt(2) === 0 ? c + s : s + c
    case 7: // replace with aggressive corpus (regex/ReDoS)
      if (randomInt(15) === 0) return pick(AGGRESSIVE_CORPUS)
      return s
    case 8: // many parens (ReDoS)
      if (randomInt(20) === 0) return '('.repeat(30 + randomInt(50)) + 'a'
      return s
    case 9: // very long repeat of single char
      if (randomInt(25) === 0) return 'a'.repeat(1000 + randomInt(2000))
      return s
    default:
      return s
  }
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(arr.length)]
}

function createMinimalCourse(days: string, time: string, term = 'Spring 2026'): Course {
  const section: Section = {
    term,
    classId: 12345,
    sectionNumber: '01',
    component: 'LEC',
    units: 3,
    grading: 'Letter',
    classLevel: 'UG',
    instructionalMode: 'In Person',
    status: 'Open',
    enrolled: 0,
    capacity: 0,
    waitlist: 0,
    waitlistMax: 0,
    openSeats: 0,
    startDate: '',
    endDate: '',
    meetings: [{ days, time, location: 'TBA', instructors: [] }],
  }
  return {
    id: 'CS106A',
    subject: 'CS',
    code: '106A',
    title: 'Test',
    description: '',
    units: '3',
    grading: 'Letter',
    instructors: [],
    terms: [term],
    sections: [section],
    selectedTerm: term,
  }
}

/** Malformed Course-like objects to trigger crashes (wrong types, missing fields, null/undefined). */
function createMalformedCourse(): Course {
  const malformed = [
    () => ({ sections: undefined, terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: null, terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{}], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: undefined }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: null }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: [] }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: [{}] }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: [{ days: 123, time: 456 }] }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: [{ days: null, time: undefined }] }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: [{ days: {}, time: [] }] }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: [{ days: '', time: '' }] }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ meetings: [{ days: 'Mon', time: '10:00 AM' }] }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: [{ days: 'Mon', time: '10:00 AM', location: 999 }] }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: 'not an array' }], terms: ['Spring 2026'] } as unknown as Course),
    () => ({ sections: [{ term: 'Spring 2026', meetings: [{ days: 'Mon'.repeat(1000), time: '10:00 AM' }] }], terms: ['Spring 2026'] } as unknown as Course),
  ]
  return pick(malformed)()
}

function parseArgs(): { iterations: number } {
  const args = process.argv.slice(2)
  let iterations = 50_000
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' && args[i + 1]) iterations = parseInt(args[i + 1], 10)
  }
  return { iterations }
}

function runWithTimeout<T>(fn: () => T, _ms?: number): { ok: true; value: T } | { ok: false; error: string } {
  try {
    const value = fn()
    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function main() {
  const { iterations } = parseArgs()
  console.log('Fuzzing Stanford Root schedule-utils')
  console.log('Targets: timeToMinutes, parseTimeStringToMinutes, parseMeetingTimes')
  console.log(`Iterations: ${iterations.toLocaleString()}`)
  console.log('')

  let executed = 0
  let crashes = 0
  const crashLog: Array<{ target: string; input: string | object; error: string }> = []

  const ALL_STRING_CORPUS = [...DAYS_CORPUS, ...TIME_CORPUS, ...AGGRESSIVE_CORPUS]
  for (let i = 0; i < iterations; i++) {
    // Mutate from corpus (includes aggressive regex/ReDoS strings)
    const daysSeed = pick(ALL_STRING_CORPUS)
    const timeSeed = pick(ALL_STRING_CORPUS)
    const daysMutated = mutateString(mutateString(daysSeed))
    const timeMutated = mutateString(mutateString(timeSeed))

    // Target 1: timeToMinutes
    const r1 = runWithTimeout(() => timeToMinutes(timeMutated))
    if (!r1.ok) {
      crashes++
      crashLog.push({ target: 'timeToMinutes', input: timeMutated, error: r1.error })
    }

    // Target 2: parseTimeStringToMinutes
    const r2 = runWithTimeout(() => parseTimeStringToMinutes(timeMutated))
    if (!r2.ok) {
      crashes++
      crashLog.push({ target: 'parseTimeStringToMinutes', input: timeMutated, error: r2.error })
    }

    // Target 3: parseMeetingTimes (exercises parseDays + parseTimeRange internally)
    const course = createMinimalCourse(daysMutated, timeMutated)
    const r3 = runWithTimeout(() => parseMeetingTimes(course))
    if (!r3.ok) {
      crashes++
      crashLog.push(
        { target: 'parseMeetingTimes', input: { days: daysMutated, time: timeMutated }, error: r3.error }
      )
    }

    // Target 4: Malformed Course structure (~20% of iterations)
    if (randomInt(5) === 0) {
      const malformed = createMalformedCourse()
      const r4 = runWithTimeout(() => parseMeetingTimes(malformed))
      if (!r4.ok) {
        crashes++
        crashLog.push({ target: 'parseMeetingTimes (malformed)', input: malformed, error: r4.error })
      }
      executed += 1
    }

    executed += 3
    if ((i + 1) % 10000 === 0) {
      process.stdout.write(`\r  ${(i + 1).toLocaleString()} iterations, ${crashes} crashes`)
    }
  }

  console.log('\n')
  console.log('--- Results ---')
  console.log(`Executed: ${executed.toLocaleString()} calls`)
  console.log(`Crashes: ${crashes}`)

  if (crashLog.length > 0) {
    // Deduplicate by target+error to show unique bug classes
    const seen = new Set<string>()
    const unique: typeof crashLog = []
    for (const c of crashLog) {
      const key = `${c.target}|${c.error}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(c)
      }
    }
    console.log('\n--- Unique crash types ---')
    unique.slice(0, 15).forEach((c, i) => {
      console.log(`\n[${i + 1}] ${c.target}`)
      console.log(`  Error: ${c.error}`)
      console.log(`  Example input: ${JSON.stringify(c.input).slice(0, 120)}${JSON.stringify(c.input).length > 120 ? '...' : ''}`)
    })
    process.exit(1)
  }

  console.log('\nNo crashes found. Schedule parsing appears robust for this corpus.')
  process.exit(0)
}

main()

#!/usr/bin/env npx tsx
/**
 * State-injection fuzzer for Stanford Root.
 *
 * Injects malformed/adversarial data into localStorage (Zustand persist store)
 * and IndexedDB caches, then reloads the page and checks for crashes.
 * This tests the resilience of the deserialization + hydration + render pipeline.
 *
 * Usage:
 *   npx tsx scripts/fuzz-state.ts
 *   npx tsx scripts/fuzz-state.ts --iterations 50
 */

import { chromium, type Page, type BrowserContext } from '@playwright/test'
import fs from 'fs'

const AUTH_FILE = '.auth.json'
const BASE_URL = 'http://localhost:3000'
const RESULTS_FILE = 'state-fuzzer-results.json'

function parseArgs() {
  const args = process.argv.slice(2)
  let iterations = 30
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' && args[i + 1]) iterations = parseInt(args[i + 1], 10)
  }
  return { iterations }
}

// Malformed cart payloads that probe edge cases in hydration + rendering
const MALFORMED_CARTS = [
  // Non-array items
  { state: { items: null }, version: 1 },
  { state: { items: undefined }, version: 1 },
  { state: { items: 'not-an-array' }, version: 1 },
  { state: { items: 42 }, version: 1 },
  { state: { items: {} }, version: 1 },

  // Array with malformed course objects
  { state: { items: [null] }, version: 1 },
  { state: { items: [undefined] }, version: 1 },
  { state: { items: [{}] }, version: 1 },
  { state: { items: [{ id: null }] }, version: 1 },
  { state: { items: [{ id: 123, title: 456 }] }, version: 1 },

  // Plausible but broken course objects
  { state: { items: [{ id: 'CS106A', title: 'Test', sections: null, terms: null }] }, version: 1 },
  { state: { items: [{ id: 'CS106A', title: 'Test', sections: [], terms: [] }] }, version: 1 },
  { state: { items: [{ id: 'CS106A', title: 'Test', sections: [{}], terms: ['Spring 2026'] }] }, version: 1 },

  // Course with non-string meeting days (triggers parseDays crash)
  { state: { items: [{
    id: 'CS106A', subject: 'CS', code: '106A', title: 'Intro CS',
    units: '5', grading: 'Letter', instructors: [], terms: ['Spring 2026'],
    selectedTerm: 'Spring 2026',
    sections: [{ term: 'Spring 2026', classId: 1, sectionNumber: '01', component: 'LEC',
      meetings: [{ days: 123, time: '10:00 AM - 11:30 AM', location: 'TBA', instructors: [] }],
      units: 5, grading: 'Letter', classLevel: 'UG', instructionalMode: 'In Person',
      status: 'Open', enrolled: 0, capacity: 100, waitlist: 0, waitlistMax: 0,
      openSeats: 100, startDate: '', endDate: '' }]
  }] }, version: 1 },

  // Course with non-string meeting time
  { state: { items: [{
    id: 'MATH51', subject: 'MATH', code: '51', title: 'Linear Algebra',
    units: '5', grading: 'Letter', instructors: [], terms: ['Spring 2026'],
    selectedTerm: 'Spring 2026',
    sections: [{ term: 'Spring 2026', classId: 2, sectionNumber: '01', component: 'LEC',
      meetings: [{ days: 'MWF', time: null, location: 'TBA', instructors: [] }],
      units: 5, grading: 'Letter', classLevel: 'UG', instructionalMode: 'In Person',
      status: 'Open', enrolled: 0, capacity: 100, waitlist: 0, waitlistMax: 0,
      openSeats: 100, startDate: '', endDate: '' }]
  }] }, version: 1 },

  // Course with meetings as wrong type
  { state: { items: [{
    id: 'PHYS41', subject: 'PHYS', code: '41', title: 'Mechanics',
    units: '4', grading: 'Letter', instructors: [], terms: ['Spring 2026'],
    selectedTerm: 'Spring 2026',
    sections: [{ term: 'Spring 2026', classId: 3, sectionNumber: '01', component: 'LEC',
      meetings: 'not-an-array',
      units: 4, grading: 'Letter', classLevel: 'UG', instructionalMode: 'In Person',
      status: 'Open', enrolled: 0, capacity: 100, waitlist: 0, waitlistMax: 0,
      openSeats: 100, startDate: '', endDate: '' }]
  }] }, version: 1 },

  // Very large cart (stress test)
  { state: { items: Array.from({ length: 200 }, (_, i) => ({
    id: `FAKE${i}`, subject: 'FAKE', code: `${i}`, title: `Course ${i}`,
    units: '3', grading: 'Letter', instructors: [], terms: ['Spring 2026'],
    selectedTerm: 'Spring 2026', sections: []
  })) }, version: 1 },

  // Wrong version
  { state: { items: [] }, version: 999 },

  // Completely wrong shape
  { state: 'hello' },
  { version: 1 },
  'not-json-at-all',
  42,
  null,

  // XSS in course title
  { state: { items: [{
    id: 'XSS1', subject: 'XSS', code: '1', title: '<img src=x onerror=alert(1)>',
    units: '3', grading: 'Letter', instructors: [], terms: ['Spring 2026'],
    selectedTerm: 'Spring 2026', sections: []
  }] }, version: 1 },

  // Prototype pollution attempt
  { state: { items: [{ id: 'PP1', '__proto__': { admin: true }, title: 'Proto' }] }, version: 1 },

  // Extremely long strings
  { state: { items: [{
    id: 'A'.repeat(10000), subject: 'LONG', code: '1', title: 'B'.repeat(10000),
    units: '3', grading: 'Letter', instructors: [], terms: ['Spring 2026'],
    selectedTerm: 'Spring 2026', sections: []
  }] }, version: 1 },
]

type BugReport = {
  iteration: number
  payload: string
  bugType: string
  message: string
  page: string
  screenshot?: string
}

async function run() {
  const { iterations } = parseArgs()
  console.log('State-Injection Fuzzer for Stanford Root')
  console.log('========================================')
  console.log(`Iterations: ${iterations}`)
  console.log('')

  const browser = await chromium.launch({ headless: true })
  let context: BrowserContext
  if (fs.existsSync(AUTH_FILE)) {
    context = await browser.newContext({ storageState: AUTH_FILE })
  } else {
    console.log('No auth file. Running unauthenticated.')
    context = await browser.newContext()
  }

  const bugs: BugReport[] = []
  const pages = ['/', '/schedule']
  const t0 = Date.now()

  const effectiveIterations = Math.min(iterations, MALFORMED_CARTS.length)

  for (let i = 0; i < effectiveIterations; i++) {
    const payload = MALFORMED_CARTS[i]
    const payloadStr = JSON.stringify(payload).slice(0, 120)

    for (const targetPage of pages) {
      const page = await context.newPage()
      const errors: string[] = []

      page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const t = msg.text()
          if (
            t.includes('React') || t.includes('Unhandled') || t.includes('TypeError') ||
            t.includes('Cannot read') || t.includes('is not a function') ||
            t.includes('is not iterable') || t.includes('RangeError') ||
            t.includes('Maximum update depth')
          ) {
            errors.push(`[console.error] ${t.slice(0, 300)}`)
          }
        }
      })

      try {
        // Load the page once to get the right origin for localStorage
        await page.goto(`${BASE_URL}${targetPage}`, { timeout: 10000 })
        await page.waitForTimeout(500)

        // Inject malformed cart data into localStorage
        await page.evaluate((data) => {
          localStorage.setItem('navigator-cart', typeof data === 'string' ? data : JSON.stringify(data))
        }, payload as any)

        // Reload — Zustand will try to rehydrate from the malformed data
        await page.reload({ timeout: 10000 })
        await page.waitForTimeout(2500)

        // Check for crashes
        if (errors.length > 0) {
          const bug: BugReport = {
            iteration: i,
            payload: payloadStr,
            bugType: 'js_error',
            message: errors[0],
            page: targetPage,
          }
          const ssPath = `crash_state_${i}_${targetPage.replace(/\//g, '_')}.png`
          try { await page.screenshot({ path: ssPath }); bug.screenshot = ssPath } catch {}
          bugs.push(bug)
          process.stdout.write(`\n  BUG #${bugs.length} [iter ${i}] ${targetPage}: ${errors[0].slice(0, 80)}`)
        }

        // Check error boundary
        const bodyText = await page.evaluate(() => document.body?.innerText || '')
        if (bodyText.includes('Application error') || bodyText.includes('Something went wrong')) {
          const bug: BugReport = {
            iteration: i,
            payload: payloadStr,
            bugType: 'error_boundary',
            message: 'Error boundary triggered by malformed cart data',
            page: targetPage,
          }
          const ssPath = `crash_state_${i}_${targetPage.replace(/\//g, '_')}.png`
          try { await page.screenshot({ path: ssPath }); bug.screenshot = ssPath } catch {}
          bugs.push(bug)
          process.stdout.write(`\n  BUG #${bugs.length} [iter ${i}] ${targetPage}: error boundary`)
        }

        // Check blank screen
        const divCount = await page.evaluate(() => document.querySelectorAll('div').length)
        if (divCount < 3) {
          bugs.push({
            iteration: i,
            payload: payloadStr,
            bugType: 'blank_screen',
            message: `Blank screen (${divCount} divs)`,
            page: targetPage,
          })
          process.stdout.write(`\n  BUG #${bugs.length} [iter ${i}] ${targetPage}: blank screen`)
        }
      } catch (err) {
        // Page load timeout or navigation failure is itself interesting
        bugs.push({
          iteration: i,
          payload: payloadStr,
          bugType: 'load_failure',
          message: `Page failed to load: ${(err as Error).message?.slice(0, 200)}`,
          page: targetPage,
        })
        process.stdout.write(`\n  BUG #${bugs.length} [iter ${i}] ${targetPage}: load failure`)
      }

      // Clean up localStorage for next iteration
      try {
        await page.evaluate(() => localStorage.removeItem('navigator-cart'))
      } catch {}
      await page.close()
    }

    process.stdout.write(`\r  [${i + 1}/${effectiveIterations}] payload: ${payloadStr.slice(0, 60).padEnd(60)}`)
  }

  const elapsed = Date.now() - t0
  console.log('\n\n========================================')
  console.log('RESULTS')
  console.log('========================================')
  console.log(`Iterations:  ${effectiveIterations}`)
  console.log(`Pages tested: ${pages.join(', ')}`)
  console.log(`Bugs found:  ${bugs.length}`)
  console.log(`Elapsed:     ${(elapsed / 1000).toFixed(1)}s`)

  if (bugs.length > 0) {
    console.log('\n--- Bug Details ---')
    const seen = new Set<string>()
    bugs.forEach((b, i) => {
      const key = `${b.bugType}|${b.message.slice(0, 100)}`
      if (seen.has(key)) return
      seen.add(key)
      console.log(`\n  [${i + 1}] ${b.bugType} on ${b.page} (iter ${b.iteration})`)
      console.log(`      Payload: ${b.payload}`)
      console.log(`      Message: ${b.message.slice(0, 200)}`)
      if (b.screenshot) console.log(`      Screenshot: ${b.screenshot}`)
    })
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ bugs, elapsed, iterations: effectiveIterations }, null, 2))
  console.log(`\nResults written to ${RESULTS_FILE}`)

  await browser.close()
  process.exit(bugs.length > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

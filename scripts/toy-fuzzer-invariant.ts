/**
 * Invariant-based oracle fuzzer for the toy catalog app.
 *
 * Instead of only detecting crashes, this fuzzer checks behavioral invariants
 * that the catalog should always satisfy — e.g. toggling a filter on then off
 * should return the same count, hiding unavailable courses should never increase
 * the count, and the header count should agree with the visible list.
 *
 * These properties let us catch 'correctness' bugs that a crash-only fuzzer misses.
 *
 * Usage: npx tsx scripts/toy-fuzzer-invariant.ts [--rounds N] [--headed] [--bugs all]
 */

import { chromium, type Page } from '@playwright/test'
import fs from 'fs'

const RESULTS_FILE = 'toy-invariant-fuzzer-results.json'
const SETTLE_MS = 800
const LOAD_MS = 2000

function parseArgs() {
  const args = process.argv.slice(2)
  let rounds = 30, headed = false, bugs = 'all', port = 3001
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rounds' && args[i + 1]) rounds = parseInt(args[i + 1], 10)
    if (args[i] === '--headed') headed = true
    if (args[i] === '--bugs' && args[i + 1]) bugs = args[i + 1]
    if (args[i] === '--port' && args[i + 1]) port = parseInt(args[i + 1], 10)
  }
  return { rounds, headed, bugs, port }
}


// --- Helpers ---

type FacetInfo = { label: string; count: number }

async function getCourseCount(page: Page): Promise<number> {
  try {
    await page.waitForSelector('text=/\\d+.*class/', { timeout: 3000 })
    const text = await page.locator('span').filter({ hasText: /^\d[\d,]* (class|classes)$/ }).first().innerText()
    return parseInt(text.replace(/,/g, ''), 10)
  } catch { return -1 }
}

async function isEmptyState(page: Page): Promise<boolean> {
  return (await page.locator('text=No courses match your filters').count()) > 0
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function isShowConflictsChecked(page: Page): Promise<boolean> {
  try { return await page.locator('#showConflicts').isChecked() }
  catch { return true }
}

async function isHideUnavailableChecked(page: Page): Promise<boolean> {
  try { return await page.locator('#hideUnavailable').isChecked() }
  catch { return false }
}

async function toggle(page: Page, selector: string) {
  await page.locator(selector).click()
  await page.waitForTimeout(SETTLE_MS)
}

async function readFacetSection(page: Page, sectionTitle: string): Promise<FacetInfo[]> {
  const results: FacetInfo[] = []
  try {
    const h3 = page.locator('h3', { hasText: new RegExp(`^${escapeRegex(sectionTitle)}$`, 'i') }).first()
    if (await h3.count() === 0) return results

    const triggerBtn = h3.locator('xpath=ancestor::button[1]')
    const collapsibleRoot = triggerBtn.locator('xpath=..')
    const contentDiv = collapsibleRoot.locator('[data-state]').first()

    if (await contentDiv.count() > 0 && await contentDiv.getAttribute('data-state') === 'closed') {
      await triggerBtn.click()
      await page.waitForTimeout(300)
    }

    const facetBtns = collapsibleRoot.locator('button').filter({ has: page.locator('span.rounded-full') })
    const count = await facetBtns.count()
    for (let i = 0; i < count; i++) {
      try {
        const label = await facetBtns.nth(i).locator('span.text-sm').first().innerText({ timeout: 500 })
        const countText = await facetBtns.nth(i).locator('span.rounded-full').first().innerText({ timeout: 500 })
        const num = parseInt(countText.replace(/,/g, ''), 10)
        if (!isNaN(num)) results.push({ label, count: num })
      } catch {}
    }
  } catch {}
  return results
}

async function clickFacet(page: Page, label: string): Promise<boolean> {
  try {
    const btn = page.locator('button').filter({ hasText: new RegExp(`^${escapeRegex(label)}`) }).first()
    if (await btn.count() === 0) return false
    await btn.click()
    await page.waitForTimeout(SETTLE_MS)
    return true
  } catch { return false }
}


// --- Invariant checks ---
// Each invariant function checks a specific behavioral property and pushes
// a violation if it fails.

type Violation = {
  invariant: string
  description: string
  expected: string
  actual: string
  action: string
  round: number
  screenshot?: string
}

/**
 * Invariant 1: Conflict filter effect.
 * The toy app has 3 courses in the cart that conflict with 4 others, so
 * unchecking "Show conflicting" should always reduce the unfiltered count.
 */
async function checkConflictFilter(page: Page, round: number, violations: Violation[]) {
  if (!await isShowConflictsChecked(page)) await toggle(page, '#showConflicts')
  const before = await getCourseCount(page)
  if (before <= 3) return

  await toggle(page, '#showConflicts')
  const after = await getCourseCount(page)
  await toggle(page, '#showConflicts')

  if (after >= before) {
    const v: Violation = {
      invariant: 'filter_effect_conflicts',
      description: 'Hiding conflicts did not reduce count despite cart items with scheduled times',
      expected: `count < ${before}`, actual: `count = ${after}`,
      action: 'Uncheck "Show conflicting classes"', round,
    }
    try { v.screenshot = `violation_conflict_r${round}.png`; await page.screenshot({ path: v.screenshot }) } catch {}
    violations.push(v)
  }
}

/**
 * Invariant 2: Filter monotonicity.
 * hideUnavailable is a pure AND filter — turning it on can only remove courses,
 * so the count should never increase.
 */
async function checkMonotonicity(page: Page, round: number, violations: Violation[]) {
  if (await isHideUnavailableChecked(page)) return
  const before = await getCourseCount(page)
  if (before <= 0) return

  await toggle(page, '#hideUnavailable')
  const after = await getCourseCount(page)
  await toggle(page, '#hideUnavailable')

  if (after > before) {
    const v: Violation = {
      invariant: 'filter_monotonicity',
      description: 'Checking "Hide closed & waitlisted" increased the course count',
      expected: `count ≤ ${before}`, actual: `count = ${after}`,
      action: 'Toggle hideUnavailable ON', round,
    }
    try { v.screenshot = `violation_mono_r${round}.png`; await page.screenshot({ path: v.screenshot }) } catch {}
    violations.push(v)
  }
}

/**
 * Invariant 3: Filter reversibility.
 * Toggling a filter on then off should return to the exact same count.
 */
async function checkReversibility(page: Page, round: number, violations: Violation[]) {
  const before = await getCourseCount(page)
  if (before <= 0) return

  await toggle(page, '#hideUnavailable')
  await toggle(page, '#hideUnavailable')
  const after = await getCourseCount(page)

  if (after !== before) {
    const v: Violation = {
      invariant: 'filter_reversibility',
      description: 'Toggling hideUnavailable on then off changed the count',
      expected: `count = ${before}`, actual: `count = ${after}`,
      action: 'Toggle hideUnavailable ON then OFF', round,
    }
    try { v.screenshot = `violation_reverse_r${round}.png`; await page.screenshot({ path: v.screenshot }) } catch {}
    violations.push(v)
  }
}

/**
 * Invariant 4: Header vs. list consistency.
 * If the header says 0, the empty state message should be visible, and vice versa.
 */
async function checkHeaderConsistency(page: Page, round: number, violations: Violation[]) {
  const count = await getCourseCount(page)
  const empty = await isEmptyState(page)

  if (count === 0 && !empty) {
    violations.push({
      invariant: 'header_list_consistency',
      description: 'Header shows 0 classes but empty state message is missing',
      expected: '"No courses match" visible', actual: 'No empty state shown',
      action: 'Check header vs empty state', round,
    })
  }
  if (count > 0 && empty) {
    violations.push({
      invariant: 'header_list_consistency',
      description: `Header shows ${count} classes but empty state is displayed`,
      expected: 'Course cards visible', actual: '"No courses match" shown',
      action: 'Check header vs empty state', round,
    })
  }
}


// --- Random filter action ---
// Between invariant checks we do random filter actions to put the app in
// different states. This increases the chance of hitting an edge case.

type ActionLog = { action: string; countBefore: number; countAfter: number }

async function doRandomFilterAction(page: Page): Promise<string> {
  const pick = Math.floor(Math.random() * 4)

  switch (pick) {
    case 0:
      await toggle(page, '#showConflicts')
      return 'Toggle "Show conflicting classes"'
    case 1:
      await toggle(page, '#hideUnavailable')
      return 'Toggle "Hide closed & waitlisted"'
    case 2: {
      const facets = await readFacetSection(page, 'Format')
      if (facets.length > 0) {
        const f = facets[Math.floor(Math.random() * facets.length)]
        await clickFacet(page, f.label)
        return `Toggle Format: "${f.label}" (${f.count})`
      }
      return 'noop (no format facets)'
    }
    case 3: {
      const facets = await readFacetSection(page, 'Class Level')
      if (facets.length > 0) {
        const f = facets[Math.floor(Math.random() * facets.length)]
        await clickFacet(page, f.label)
        return `Toggle Level: "${f.label}" (${f.count})`
      }
      return 'noop (no level facets)'
    }
    default: return 'noop'
  }
}


// --- Main ---

async function run() {
  const { rounds, headed, bugs, port } = parseArgs()
  const url = `http://localhost:${port}/?bugs=${bugs}`

  console.log('Invariant Oracle Fuzzer (Toy Catalog)')
  console.log('=========================================')
  console.log(`Target: ${url}  |  Rounds: ${rounds}  |  ${headed ? 'headed' : 'headless'}`)
  console.log('')

  const browser = await chromium.launch({ headless: !headed })
  const page = await (await browser.newContext()).newPage()
  const violations: Violation[] = []
  const crashErrors: string[] = []
  const actionHistory: ActionLog[] = []

  page.on('pageerror', (err) => crashErrors.push(`[pageerror] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text()
      if (t.includes('TypeError') || t.includes('Cannot read') ||
          t.includes('is not a function') || t.includes('RangeError')) {
        crashErrors.push(`[console.error] ${t.slice(0, 300)}`)
      }
    }
  })

  try { await page.goto(url, { timeout: 10000 }) } catch {
    console.error(`Can't connect to ${url}. Is toy:serve running?`)
    process.exit(1)
  }
  await page.waitForTimeout(LOAD_MS)

  const initialCount = await getCourseCount(page)
  console.log(`  Initial course count: ${initialCount}\n`)
  const t0 = Date.now()

  for (let round = 0; round < rounds; round++) {
    const countBefore = await getCourseCount(page)
    const actionDesc = await doRandomFilterAction(page)
    const countAfter = await getCourseCount(page)

    actionHistory.push({ action: actionDesc, countBefore, countAfter })
    process.stdout.write(`\r  [${round + 1}/${rounds}] ${actionDesc.padEnd(50)} ${countBefore} → ${countAfter}`)

    if (round % 3 === 0) await checkConflictFilter(page, round, violations)
    if (round % 4 === 0) await checkMonotonicity(page, round, violations)
    if (round % 5 === 0) await checkReversibility(page, round, violations)
    if (round % 5 === 0) await checkHeaderConsistency(page, round, violations)

    if (violations.length > 0 && violations[violations.length - 1].round === round) {
      const v = violations[violations.length - 1]
      console.log(`\n  >>> VIOLATION [${v.invariant}]: ${v.description}`)
      console.log(`      Expected: ${v.expected}  |  Actual: ${v.actual}`)
    }
  }

  const elapsed = Date.now() - t0
  const unique = dedup(violations)

  console.log('\n\n=========================================')
  console.log('RESULTS')
  console.log('=========================================')
  console.log(`Rounds:              ${rounds}`)
  console.log(`Actions:             ${actionHistory.length}`)
  console.log(`Invariant violations: ${unique.length}`)
  console.log(`Crash errors:        ${crashErrors.length}`)
  console.log(`Elapsed:             ${(elapsed / 1000).toFixed(1)}s`)

  if (unique.length > 0) {
    console.log('\n--- Unique Violations ---')
    for (const [i, v] of unique.entries()) {
      console.log(`\n  [${i + 1}] ${v.invariant}`)
      console.log(`      ${v.description}`)
      console.log(`      Expected: ${v.expected}`)
      console.log(`      Actual:   ${v.actual}`)
      if (v.screenshot) console.log(`      Screenshot: ${v.screenshot}`)
    }
  }

  if (crashErrors.length > 0) {
    console.log('\n--- Crash Errors ---')
    ;[...new Set(crashErrors.map(e => e.slice(0, 100)))].forEach((e, i) => console.log(`  [${i + 1}] ${e}`))
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify({
    fuzzerType: 'invariant',
    timestamp: new Date().toISOString(),
    config: { rounds, bugs, port },
    stats: { totalActions: actionHistory.length, violations: unique.length, crashErrors: crashErrors.length, elapsedMs: elapsed },
    violations: unique,
    crashErrors: [...new Set(crashErrors)],
    actionHistory,
  }, null, 2))
  console.log(`\nResults saved to ${RESULTS_FILE}`)

  await browser.close()
  process.exit(unique.length > 0 || crashErrors.length > 0 ? 1 : 0)
}

function dedup(violations: Violation[]): Violation[] {
  const seen = new Set<string>()
  return violations.filter(v => {
    const key = `${v.invariant}|${v.description.slice(0, 80)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

/**
 * Invariant-based oracle fuzzer for Stanford Root.
 *
 * Instead of only detecting crashes, this fuzzer checks behavioral invariants
 * that the app should always satisfy — e.g. toggling a filter on then off should
 * return the same count, hiding unavailable courses should never increase the count,
 * and facet sidebar counts should be consistent with actual results.
 *
 * These properties let us catch 'correctness' bugs that a crash-only fuzzer would miss.
 *
 * Usage:  npx tsx scripts/invariant-fuzzer.ts [--rounds N] [--headed]
 */

import { chromium, type Page, type BrowserContext } from '@playwright/test'
import fs from 'fs'

const AUTH_FILE = '.auth.json'
const BASE_URL = 'http://localhost:3000'
const RESULTS_FILE = 'invariant-fuzzer-results.json'
const SETTLE_MS = 1500     // wait after toggling a filter
const LOAD_MS   = 5000     // wait for initial course list to load

function parseArgs() {
  const args = process.argv.slice(2)
  let rounds = 30, headed = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rounds' && args[i + 1]) rounds = parseInt(args[i + 1], 10)
    if (args[i] === '--headed') headed = true
  }
  return { rounds, headed }
}


type FacetInfo = { label: string; count: number }

async function getCourseCount(page: Page): Promise<number> {
  try {
    await page.waitForSelector('text=/\\d+.*class/', { timeout: 5000 })
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

async function readFacetSection(page: Page, sectionTitle: string): Promise<FacetInfo[]> {
  const results: FacetInfo[] = []
  try {
    // Find the section header and make sure the collapsible is open
    const h3 = page.locator('h3', { hasText: new RegExp(`^${escapeRegex(sectionTitle)}$`, 'i') }).first()
    if (await h3.count() === 0) return results

    const triggerBtn = h3.locator('xpath=ancestor::button[1]')
    if (await triggerBtn.count() === 0) return results

    const collapsibleRoot = triggerBtn.locator('xpath=..')
    const contentDiv = collapsibleRoot.locator('[data-state]').first()

    if (await contentDiv.count() > 0) {
      if (await contentDiv.getAttribute('data-state') === 'closed') {
        await triggerBtn.click()
        await page.waitForTimeout(500)
      }
    } else {
      await triggerBtn.click()
      await page.waitForTimeout(500)
    }

    const facetBtns = collapsibleRoot.locator('button').filter({ has: page.locator('span.rounded-full') })
    const count = await facetBtns.count()
    for (let i = 0; i < count; i++) {
      try {
        const btn = facetBtns.nth(i)
        const label = await btn.locator('span.text-sm').first().innerText({ timeout: 1000 })
        const countText = await btn.locator('span.rounded-full').first().innerText({ timeout: 1000 })
        const num = parseInt(countText.replace(/,/g, ''), 10)
        if (!isNaN(num)) results.push({ label, count: num })
      } catch {}
    }
  } catch {}
  return results
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

async function clickFacet(page: Page, label: string): Promise<boolean> {
  try {
    const btn = page.locator('button').filter({ hasText: new RegExp(`^${escapeRegex(label)}`) }).first()
    if (await btn.count() === 0) return false
    await btn.click()
    await page.waitForTimeout(SETTLE_MS)
    return true
  } catch { return false }
}


// Each invariant function checks a specific behavioral property and pushes
// a violation if it fails. The violation includes the URL so we can reproduce.

type Violation = {
  invariant: string
  description: string
  expected: string
  actual: string
  action: string
  round: number
  url: string
  screenshot?: string
}

/**
 * Invariant 1: Conflict filter effect.
 * With courses in the user's schedule cart, unchecking "Show conflicting" should reduce the count.
 */
async function checkConflictFilter(page: Page, round: number, violations: Violation[], hasCart: boolean) {
  if (!hasCart) return

  // Only check on the unfiltered catalog — narrowed subsets may not overlap with cart times
  const url = new URL(page.url())
  if (url.searchParams.has('formats') || url.searchParams.has('levels') || url.searchParams.has('terms')) return

  if (!await isShowConflictsChecked(page)) await toggle(page, '#showConflicts')
  const before = await getCourseCount(page)
  if (before <= 0) return

  await toggle(page, '#showConflicts')
  const after = await getCourseCount(page)
  await toggle(page, '#showConflicts') // restore

  if (after >= before && before > 10) {
    const v: Violation = {
      invariant: 'filter_effect_conflicts',
      description: 'Hiding conflicts did not reduce count despite cart items with scheduled times',
      expected: `count < ${before}`, actual: `count = ${after}`,
      action: 'Uncheck "Show conflicting classes"', round, url: page.url(),
    }
    try { v.screenshot = `violation_conflict_r${round}.png`; await page.screenshot({ path: v.screenshot }) } catch {}
    violations.push(v)
  }
}

/**
 * Invariant 2: Facet count consistency.
 * With hideUnavailable ON, clicking a single facet should show <= the facet's advertised count.
 */
async function checkFacetConsistency(page: Page, round: number, violations: Violation[]) {
  // Only check when no other facets in the group are already selected (multi-select OR causes false positives)
  const url = new URL(page.url())
  const section = ['Format', 'Class Level'][Math.floor(Math.random() * 2)]
  const paramName = section === 'Format' ? 'formats' : 'levels'
  if (url.searchParams.has(paramName)) return

  const wasChecked = await isHideUnavailableChecked(page)
  if (!wasChecked) await toggle(page, '#hideUnavailable')

  const facets = await readFacetSection(page, section)
  if (facets.length === 0) { if (!wasChecked) await toggle(page, '#hideUnavailable'); return }

  const facet = facets[Math.floor(Math.random() * facets.length)]
  if (facet.count === 0) { if (!wasChecked) await toggle(page, '#hideUnavailable'); return }

  if (!await clickFacet(page, facet.label)) { if (!wasChecked) await toggle(page, '#hideUnavailable'); return }
  const actual = await getCourseCount(page)

  if (actual > facet.count) {
    const v: Violation = {
      invariant: 'facet_count_consistency',
      description: `"${facet.label}" (${section}) facet shows ${facet.count} but ${actual} courses displayed`,
      expected: `count ≤ ${facet.count}`, actual: `count = ${actual}`,
      action: `Enable hideUnavailable, click "${facet.label}"`, round, url: page.url(),
    }
    try { v.screenshot = `violation_facet_r${round}.png`; await page.screenshot({ path: v.screenshot }) } catch {}
    violations.push(v)
  }

  await clickFacet(page, facet.label)
  if (!wasChecked) await toggle(page, '#hideUnavailable')
}

/**
 * Invariant 3: Filter monotonicity.
 * hideUnavailable is a pure AND filter, thus turning it on should never increase the count.
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
      action: 'Toggle hideUnavailable ON', round, url: page.url(),
    }
    try { v.screenshot = `violation_mono_r${round}.png`; await page.screenshot({ path: v.screenshot }) } catch {}
    violations.push(v)
  }
}

/**
 * Invariant 4: Filter reversibility.
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
      action: 'Toggle hideUnavailable ON then OFF', round, url: page.url(),
    }
    try { v.screenshot = `violation_reverse_r${round}.png`; await page.screenshot({ path: v.screenshot }) } catch {}
    violations.push(v)
  }
}

/**
 * Invariant 5: Header vs. list consistency.
 * If header says 0, the empty state message should be visible, and vice versa.
 */
async function checkHeaderConsistency(page: Page, round: number, violations: Violation[]) {
  const count = await getCourseCount(page)
  const empty = await isEmptyState(page)

  if (count === 0 && !empty) {
    violations.push({
      invariant: 'header_list_consistency',
      description: 'Header shows 0 classes but empty state message is missing',
      expected: '"No courses match" visible', actual: 'No empty state shown',
      action: 'Check header vs empty state', round, url: page.url(),
    })
  }
  if (count > 0 && empty) {
    violations.push({
      invariant: 'header_list_consistency',
      description: `Header shows ${count} classes but empty state is displayed`,
      expected: 'Course cards visible', actual: '"No courses match" shown',
      action: 'Check header vs empty state', round, url: page.url(),
    })
  }
}


// --- Cart setup ---
// We add courses to the user's schedule cart to test the conflict filter invariant.

async function addToCart(page: Page, courseId: string): Promise<boolean> {
  try {
    await page.goto(`${BASE_URL}/courses/${encodeURIComponent(courseId)}`, { timeout: 10000 })

    try {
      await page.getByRole('button', { name: /View on Calendar/i }).first()
        .waitFor({ state: 'visible', timeout: 8000 })
    } catch { await page.waitForTimeout(3000) }

    const viewBtn = page.getByRole('button', { name: /View on Calendar/i }).first()
    if (await viewBtn.count() === 0) return false
    await viewBtn.click()

    try {
      await page.getByRole('button', { name: /Add to Calendar/i }).first()
        .waitFor({ state: 'visible', timeout: 5000 })
    } catch { await page.waitForTimeout(2000) }

    const addBtn = page.getByRole('button', { name: /Add to Calendar/i }).first()
    if (await addBtn.count() > 0) {
      await addBtn.click()
      await page.waitForTimeout(1500)
      return true
    }
    return false
  } catch { return false }
}


// --- Random filter action ---
// Between invariant checks we do random filter actions to put the app in
// different states. This increases the chance of hitting an edge case.

type ActionLog = { action: string; countBefore: number; countAfter: number }

async function doRandomFilterAction(page: Page): Promise<string> {
  const pick = Math.floor(Math.random() * 7)

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
    case 4: {
      const termBtns = page.locator('button').filter({
        has: page.locator('span.rounded-full')
      }).filter({ hasText: /(Spring|Winter|Autumn|Summer) \d{4}/ })
      const count = await termBtns.count()
      if (count > 0) {
        const idx = Math.floor(Math.random() * count)
        const label = await termBtns.nth(idx).locator('span.text-sm').first().innerText()
        await termBtns.nth(idx).click()
        await page.waitForTimeout(SETTLE_MS)
        return `Toggle Term: "${label}"`
      }
      return 'noop (no term facets)'
    }
    case 5: {
      const facets = await readFacetSection(page, 'General Education Requirements')
      if (facets.length > 0) {
        const f = facets[Math.floor(Math.random() * facets.length)]
        await clickFacet(page, f.label)
        return `Toggle GER: "${f.label}" (${f.count})`
      }
      return 'noop (no GER facets)'
    }
    case 6: {
      const facets = await readFacetSection(page, 'School')
      if (facets.length > 0) {
        const f = facets[Math.floor(Math.random() * facets.length)]
        await clickFacet(page, f.label)
        return `Toggle School: "${f.label}" (${f.count})`
      }
      return 'noop (no school facets)'
    }
    default: return 'noop'
  }
}


async function run() {
  const { rounds, headed } = parseArgs()

  console.log('Invariant Oracle Fuzzer for Stanford Root')
  console.log('=========================================')
  console.log(`Rounds: ${rounds}  |  ${headed ? 'headed' : 'headless'}`)
  console.log('')

  const browser = await chromium.launch({ headless: !headed })
  let context: BrowserContext

  if (fs.existsSync(AUTH_FILE)) {
    console.log('Using saved auth session.')
    context = await browser.newContext({ storageState: AUTH_FILE })
  } else {
    console.log('No .auth.json found, running without auth.')
    context = await browser.newContext()
  }

  const page = await context.newPage()
  const violations: Violation[] = []
  const crashErrors: string[] = []
  const actionHistory: ActionLog[] = []

  // Also catch JS crashes (secondary oracle)
  page.on('pageerror', (err) => crashErrors.push(`[pageerror] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text()
      if (t.includes('TypeError') || t.includes('Cannot read') || t.includes('is not a function') ||
          t.includes('is not iterable') || t.includes('RangeError') || t.includes('Maximum update depth')) {
        crashErrors.push(`[console.error] ${t.slice(0, 300)}`)
      }
    }
  })

  const t0 = Date.now()

  // Add courses to cart for conflict filter testing
  console.log('\n--- Phase 1: Adding courses to cart ---')
  const coursesToTry = ['MATH51', 'PHYSICS41', 'ECON1']
  let cartCount = 0
  for (const id of coursesToTry) {
    process.stdout.write(`  Adding ${id}...`)
    if (await addToCart(page, id)) {
      cartCount++
      console.log(' ok')
    } else {
      console.log(' failed')
    }
    if (cartCount >= 3) break
  }
  if (cartCount === 0) console.log('  WARNING: No courses added. Conflict tests will be skipped.')

  // Random filter actions + invariant checks
  console.log('\n--- Phase 2: Running invariant checks ---\n')
  await page.goto(BASE_URL, { timeout: 15000 })
  await page.waitForTimeout(LOAD_MS)

  const initialCount = await getCourseCount(page)
  console.log(`  Initial course count: ${initialCount}`)

  for (let round = 0; round < rounds; round++) {
    const countBefore = await getCourseCount(page)
    const actionDesc = await doRandomFilterAction(page)
    const countAfter = await getCourseCount(page)

    actionHistory.push({ action: actionDesc, countBefore, countAfter })
    process.stdout.write(`\r  [${round + 1}/${rounds}] ${actionDesc.padEnd(50)} ${countBefore} → ${countAfter}`)

    if (round % 3 === 0) await checkConflictFilter(page, round, violations, cartCount > 0)
    if (round % 5 === 0) await checkFacetConsistency(page, round, violations)
    if (round % 4 === 0) await checkMonotonicity(page, round, violations)
    if (round % 6 === 0) await checkReversibility(page, round, violations)
    if (round % 5 === 0) await checkHeaderConsistency(page, round, violations)

    if (violations.length > 0 && violations[violations.length - 1].round === round) {
      const v = violations[violations.length - 1]
      console.log(`\n  >>> VIOLATION [${v.invariant}]: ${v.description}`)
      console.log(`      Expected: ${v.expected}  |  Actual: ${v.actual}`)
      console.log(`      URL: ${v.url}`)
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
      console.log(`      URL:      ${v.url}`)
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
    config: { rounds, coursesInCart: cartCount },
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

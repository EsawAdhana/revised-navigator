#!/usr/bin/env npx tsx
/**
 * Invariant-Based Oracle Fuzzer for Stanford Root
 *
 * Instead of only detecting crashes, this fuzzer checks behavioral invariants —
 * self-consistency properties the app should always satisfy. For example:
 *   - Toggling "Hide Conflicts" with cart items should reduce visible courses
 *   - Sidebar facet counts should match actual filtered results
 *   - Adding then removing a filter should return to the same count
 *
 * These oracles can detect correctness bugs that crash-only fuzzers miss.
 *
 * Usage:
 *   npx tsx scripts/invariant-fuzzer.ts
 *   npx tsx scripts/invariant-fuzzer.ts --rounds 50
 *   npx tsx scripts/invariant-fuzzer.ts --headed
 */

import { chromium, type Page, type BrowserContext, type Locator } from '@playwright/test'
import fs from 'fs'

const AUTH_FILE = '.auth.json'
const BASE_URL = 'http://localhost:3000'
const RESULTS_FILE = 'invariant-fuzzer-results.json'
const SETTLE_MS = 1500
const COURSE_LOAD_MS = 5000

function parseArgs() {
  const args = process.argv.slice(2)
  let rounds = 30
  let headed = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rounds' && args[i + 1]) rounds = parseInt(args[i + 1], 10)
    if (args[i] === '--headed') headed = true
  }
  return { rounds, headed }
}

// ─── DOM Helpers ─────────────────────────────────────────────────────────────────

/** Read the "N classes" count from the results bar */
async function getCourseCount(page: Page): Promise<number> {
  try {
    await page.waitForSelector('text=/\\d+.*class/', { timeout: 5000 })
    const text = await page.locator('span').filter({ hasText: /^\d[\d,]* (class|classes)$/ }).first().innerText()
    return parseInt(text.replace(/,/g, ''), 10)
  } catch {
    return -1
  }
}

/** Check if the "No courses match" empty state is shown */
async function isEmptyState(page: Page): Promise<boolean> {
  const count = await page.locator('text=No courses match your filters').count()
  return count > 0
}

type FacetInfo = { label: string; count: number }

/** Read all facet items from a collapsible filter section */
async function readFacetSection(page: Page, sectionTitle: string): Promise<FacetInfo[]> {
  const results: FacetInfo[] = []
  try {
    // FilterSection structure:
    //   <div data-state="open|closed">        (Collapsible root)
    //     <button>                             (CollapsibleTrigger)
    //       <div> <h3>Title</h3> </div>
    //     </button>
    //     <div data-state="open|closed">       (CollapsibleContent)
    //       <div> <button>..CheckboxItem..</button> ... </div>
    //     </div>
    //   </div>

    // Find the h3 containing the section title
    const h3 = page.locator('h3', { hasText: new RegExp(`^${escapeRegex(sectionTitle)}$`, 'i') }).first()
    if (await h3.count() === 0) return results

    // The trigger button is the h3's grandparent (h3 > div > button)
    const triggerBtn = h3.locator('xpath=ancestor::button[1]')
    if (await triggerBtn.count() === 0) return results

    // Check if the collapsible content is open
    // The Collapsible root is the parent of the trigger button
    const collapsibleRoot = triggerBtn.locator('xpath=..')
    const contentDiv = collapsibleRoot.locator('[data-state]').first()

    if (await contentDiv.count() > 0) {
      const state = await contentDiv.getAttribute('data-state')
      if (state === 'closed') {
        await triggerBtn.click()
        await page.waitForTimeout(500)
      }
    } else {
      // If we can't find data-state, just click to toggle open
      await triggerBtn.click()
      await page.waitForTimeout(500)
    }

    // Now read the CheckboxItem buttons within this section.
    // They are inside a CollapsibleContent div that's a sibling of the trigger button.
    // Each CheckboxItem is a <button> containing a label <span class="text-sm"> and
    // a count <span class="rounded-full">.
    const sectionContainer = collapsibleRoot
    const facetButtons = sectionContainer.locator('button').filter({
      has: page.locator('span.rounded-full')
    })

    const count = await facetButtons.count()
    for (let i = 0; i < count; i++) {
      try {
        const btn = facetButtons.nth(i)
        const labelSpan = btn.locator('span.text-sm').first()
        const countSpan = btn.locator('span.rounded-full').first()
        const label = await labelSpan.innerText({ timeout: 1000 })
        const countText = await countSpan.innerText({ timeout: 1000 })
        const num = parseInt(countText.replace(/,/g, ''), 10)
        if (!isNaN(num)) {
          results.push({ label, count: num })
        }
      } catch {}
    }
  } catch (e) {
    // Silently continue — section may not exist
  }
  return results
}

/** Read the term filter options and their counts */
async function readTermFacets(page: Page): Promise<FacetInfo[]> {
  return readFacetSection(page, 'Term')
}

/** Check if the "Show conflicting classes" checkbox is checked */
async function isShowConflictsChecked(page: Page): Promise<boolean> {
  try {
    return await page.locator('#showConflicts').isChecked()
  } catch {
    return true
  }
}

/** Check if the "Hide closed & waitlisted" checkbox is checked */
async function isHideUnavailableChecked(page: Page): Promise<boolean> {
  try {
    return await page.locator('#hideUnavailable').isChecked()
  } catch {
    return false
  }
}

/** Toggle a checkbox and wait for the UI to settle */
async function toggleCheckbox(page: Page, selector: string) {
  await page.locator(selector).click()
  await page.waitForTimeout(SETTLE_MS)
}

/** Click a filter CheckboxItem by its label text */
async function clickFilterByLabel(page: Page, label: string): Promise<boolean> {
  try {
    const btn = page.locator('button').filter({ hasText: new RegExp(`^${escapeRegex(label)}`) }).first()
    if (await btn.count() === 0) return false
    await btn.click()
    await page.waitForTimeout(SETTLE_MS)
    return true
  } catch {
    return false
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Invariant Checks ───────────────────────────────────────────────────────────

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
 * INVARIANT 1: Filter Effect (Conflict Filter)
 *
 * When there are courses in the cart with scheduled times, unchecking
 * "Show conflicting classes" should reduce the visible course count
 * (since some courses conflict with the cart items).
 */
async function checkConflictFilterEffect(
  page: Page, round: number, violations: Violation[], hasCartItems: boolean
): Promise<void> {
  if (!hasCartItems) return

  // Make sure "Show conflicting classes" is checked (conflicts visible)
  const showConflicts = await isShowConflictsChecked(page)
  if (!showConflicts) {
    await toggleCheckbox(page, '#showConflicts')
  }

  const countBefore = await getCourseCount(page)
  if (countBefore <= 0) return

  // Uncheck to hide conflicts
  await toggleCheckbox(page, '#showConflicts')
  const countAfter = await getCourseCount(page)

  // Re-check to restore
  await toggleCheckbox(page, '#showConflicts')

  if (countAfter >= countBefore && countBefore > 10) {
    const v: Violation = {
      invariant: 'filter_effect_conflicts',
      description: 'Toggling "Hide Conflicts" did not reduce the course count despite having cart items with scheduled times',
      expected: `count < ${countBefore} (some courses should conflict with cart items)`,
      actual: `count = ${countAfter} (unchanged)`,
      action: 'Uncheck "Show conflicting classes"',
      round,
    }
    try {
      v.screenshot = `violation_conflict_r${round}.png`
      await page.screenshot({ path: v.screenshot })
    } catch {}
    violations.push(v)
  }
}

/**
 * INVARIANT 2: Facet Count vs Hide Unavailable
 *
 * When "Hide closed & waitlisted" is checked, the facet counts should
 * reflect only available courses — not the full unfiltered count.
 *
 * Test: Read facet count for a Format option, click it as the SOLE filter,
 * and check if the resulting count matches. Test both with and without
 * hideUnavailable to detect discrepancies.
 */
async function checkFacetCountConsistency(
  page: Page, round: number, violations: Violation[]
): Promise<void> {
  // This check is only meaningful from a relatively clean state.
  // We test: activate hideUnavailable, read a facet count, activate that
  // facet, and see if the list count exceeds the advertised facet count.

  // First ensure hideUnavailable is ON (this is where the bug manifests)
  const wasChecked = await isHideUnavailableChecked(page)
  if (!wasChecked) {
    await toggleCheckbox(page, '#hideUnavailable')
  }

  const sections = ['Format', 'Class Level']
  const section = sections[Math.floor(Math.random() * sections.length)]
  const facets = await readFacetSection(page, section)
  if (facets.length === 0) {
    if (!wasChecked) await toggleCheckbox(page, '#hideUnavailable')
    return
  }

  // Pick a random facet
  const facet = facets[Math.floor(Math.random() * facets.length)]
  if (facet.count === 0) {
    if (!wasChecked) await toggleCheckbox(page, '#hideUnavailable')
    return
  }

  // Activate ONLY this facet (click it)
  const clicked = await clickFilterByLabel(page, facet.label)
  if (!clicked) {
    if (!wasChecked) await toggleCheckbox(page, '#hideUnavailable')
    return
  }

  const countAfter = await getCourseCount(page)

  // With hideUnavailable ON, the facet count should match or exceed
  // the actual filtered count. If actual > facet, the facet didn't
  // account for hideUnavailable.
  if (countAfter > facet.count) {
    const v: Violation = {
      invariant: 'facet_count_consistency',
      description: `"${facet.label}" (${section}) facet shows ${facet.count} with hideUnavailable ON, but ${countAfter} courses are displayed`,
      expected: `count ≤ ${facet.count} (facet count should reflect hideUnavailable filter)`,
      actual: `count = ${countAfter}`,
      action: `Check hideUnavailable, read "${facet.label}" facet (${facet.count}), click it`,
      round,
    }
    try {
      v.screenshot = `violation_facet_r${round}.png`
      await page.screenshot({ path: v.screenshot })
    } catch {}
    violations.push(v)
  }

  // Deactivate the facet
  await clickFilterByLabel(page, facet.label)

  // Restore hideUnavailable state
  if (!wasChecked) await toggleCheckbox(page, '#hideUnavailable')
}

/**
 * INVARIANT 3: Filter Monotonicity (cross-category)
 *
 * Toggling hideUnavailable ON should never INCREASE the course count.
 * (This is a pure AND filter — it only removes courses.)
 *
 * Note: Within-category filters (Format, Level) are OR-ed, so adding
 * more options within the same category increases the count. We only
 * test cross-category filters here.
 */
async function checkFilterMonotonicity(
  page: Page, round: number, violations: Violation[]
): Promise<void> {
  const wasChecked = await isHideUnavailableChecked(page)
  if (wasChecked) return

  const countBefore = await getCourseCount(page)
  if (countBefore <= 0) return

  // hideUnavailable is a pure AND filter — turning it ON should only reduce
  await toggleCheckbox(page, '#hideUnavailable')
  const countAfter = await getCourseCount(page)

  // Restore
  await toggleCheckbox(page, '#hideUnavailable')

  if (countAfter > countBefore) {
    const v: Violation = {
      invariant: 'filter_monotonicity',
      description: 'Checking "Hide closed & waitlisted" increased the course count',
      expected: `count ≤ ${countBefore}`,
      actual: `count = ${countAfter}`,
      action: 'Activate "Hide closed & waitlisted"',
      round,
    }
    try {
      v.screenshot = `violation_mono_r${round}.png`
      await page.screenshot({ path: v.screenshot })
    } catch {}
    violations.push(v)
  }
}

/**
 * INVARIANT 4: Filter Reversibility
 *
 * Toggling a filter on then off should return to the same course count.
 */
async function checkFilterReversibility(
  page: Page, round: number, violations: Violation[]
): Promise<void> {
  const countBefore = await getCourseCount(page)
  if (countBefore <= 0) return

  // Toggle hideUnavailable on then off
  const wasChecked = await isHideUnavailableChecked(page)

  await toggleCheckbox(page, '#hideUnavailable')
  await toggleCheckbox(page, '#hideUnavailable')

  const countAfter = await getCourseCount(page)

  if (countAfter !== countBefore) {
    const v: Violation = {
      invariant: 'filter_reversibility',
      description: 'Toggling "Hide closed & waitlisted" on then off changed the course count',
      expected: `count = ${countBefore}`,
      actual: `count = ${countAfter}`,
      action: 'Toggle hideUnavailable ON then OFF',
      round,
    }
    try {
      v.screenshot = `violation_reverse_r${round}.png`
      await page.screenshot({ path: v.screenshot })
    } catch {}
    violations.push(v)
  }
}

/**
 * INVARIANT 5: Header Count Matches List
 *
 * The "N classes" count in the results bar should match the actual number
 * of course items rendered in the DOM (accounting for virtualization —
 * the virtualized list may only render a subset, so we check against the
 * count reported by the VList component).
 *
 * With virtualization we can only reliably check:
 *  - Count > 0 when list is not empty
 *  - Count = 0 when empty state is shown
 */
async function checkHeaderVsListConsistency(
  page: Page, round: number, violations: Violation[]
): Promise<void> {
  const count = await getCourseCount(page)
  const empty = await isEmptyState(page)

  if (count === 0 && !empty) {
    const v: Violation = {
      invariant: 'header_list_consistency',
      description: 'Header shows 0 classes but no empty state message is displayed',
      expected: '"No courses match" message when count = 0',
      actual: 'No empty state shown',
      action: 'Read header count and check for empty state',
      round,
    }
    violations.push(v)
  }

  if (count > 0 && empty) {
    const v: Violation = {
      invariant: 'header_list_consistency',
      description: `Header shows ${count} classes but empty state message is displayed`,
      expected: 'Course cards when count > 0',
      actual: '"No courses match" shown',
      action: 'Read header count and check for empty state',
      round,
    }
    violations.push(v)
  }
}

// ─── Course Cart Setup ──────────────────────────────────────────────────────────

/**
 * Adds a course to the cart by navigating to its detail page and clicking
 * "View on Calendar" then "Add to Calendar". Returns true if successful.
 */
async function addCourseToCart(page: Page, courseId: string): Promise<boolean> {
  try {
    await page.goto(`${BASE_URL}/courses/${encodeURIComponent(courseId)}`, { timeout: 10000 })

    // Wait for section data to load (the "View on Calendar" button appears in section rows)
    try {
      await page.getByRole('button', { name: /View on Calendar/i }).first()
        .waitFor({ state: 'visible', timeout: 8000 })
    } catch {
      // Sections might not have loaded yet — wait more
      await page.waitForTimeout(3000)
    }

    // Click the first "View on Calendar" button
    const viewBtn = page.getByRole('button', { name: /View on Calendar/i }).first()
    if (await viewBtn.count() === 0) return false
    await viewBtn.click()

    // Wait for the calendar preview modal to appear
    try {
      await page.getByRole('button', { name: /Add to Calendar/i }).first()
        .waitFor({ state: 'visible', timeout: 5000 })
    } catch {
      await page.waitForTimeout(2000)
    }

    // Click "Add to Calendar" in the modal
    const addBtn = page.getByRole('button', { name: /Add to Calendar/i }).first()
    if (await addBtn.count() > 0) {
      await addBtn.click()
      await page.waitForTimeout(1500)
      return true
    }

    return false
  } catch {
    return false
  }
}

// ─── Random Filter Actions ──────────────────────────────────────────────────────

type ActionLog = { action: string; countBefore: number; countAfter: number }

async function performRandomFilterAction(page: Page): Promise<string> {
  const actions = [
    'toggle_conflicts',
    'toggle_unavailable',
    'click_format',
    'click_level',
    'click_term',
  ]

  const action = actions[Math.floor(Math.random() * actions.length)]

  switch (action) {
    case 'toggle_conflicts':
      await toggleCheckbox(page, '#showConflicts')
      return 'Toggle "Show conflicting classes"'

    case 'toggle_unavailable':
      await toggleCheckbox(page, '#hideUnavailable')
      return 'Toggle "Hide closed & waitlisted"'

    case 'click_format': {
      const facets = await readFacetSection(page, 'Format')
      if (facets.length > 0) {
        const f = facets[Math.floor(Math.random() * facets.length)]
        await clickFilterByLabel(page, f.label)
        return `Toggle Format: "${f.label}" (${f.count})`
      }
      return 'click_format (no facets)'
    }

    case 'click_level': {
      const facets = await readFacetSection(page, 'Class Level')
      if (facets.length > 0) {
        const f = facets[Math.floor(Math.random() * facets.length)]
        await clickFilterByLabel(page, f.label)
        return `Toggle Level: "${f.label}" (${f.count})`
      }
      return 'click_level (no facets)'
    }

    case 'click_term': {
      // Term facets are in their own section (not a collapsible FilterSection)
      const termButtons = page.locator('button').filter({
        has: page.locator('span.rounded-full')
      }).filter({
        hasText: /(Spring|Winter|Autumn|Summer) \d{4}/
      })
      const count = await termButtons.count()
      if (count > 0) {
        const idx = Math.floor(Math.random() * count)
        const label = await termButtons.nth(idx).locator('span.text-sm').first().innerText()
        await termButtons.nth(idx).click()
        await page.waitForTimeout(SETTLE_MS)
        return `Toggle Term: "${label}"`
      }
      return 'click_term (no terms)'
    }

    default:
      return 'noop'
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────────

async function run() {
  const { rounds, headed } = parseArgs()

  console.log('Invariant-Based Oracle Fuzzer for Stanford Root')
  console.log('================================================')
  console.log(`Rounds:     ${rounds}`)
  console.log(`Mode:       ${headed ? 'headed' : 'headless'}`)
  console.log('')

  const browser = await chromium.launch({ headless: !headed })
  let context: BrowserContext

  if (fs.existsSync(AUTH_FILE)) {
    console.log('Found auth session.')
    context = await browser.newContext({ storageState: AUTH_FILE })
  } else {
    console.log('No auth session found. Running unauthenticated.')
    context = await browser.newContext()
  }

  const page = await context.newPage()
  const violations: Violation[] = []
  const crashErrors: string[] = []
  const actionHistory: ActionLog[] = []

  // Capture JS errors as crash oracle (still useful)
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

  // Step 1: Add courses to the cart (needed for conflict filter testing)
  console.log('\n--- Phase 1: Adding courses to cart ---')

  // Pick two courses likely to have time conflicts (large intro courses with common MWF slots)
  const coursesToAdd = ['CS106A', 'MATH51', 'PHYSICS41', 'CS106B', 'ECON1']
  let addedCount = 0
  for (const courseId of coursesToAdd) {
    process.stdout.write(`  Adding ${courseId}...`)
    const added = await addCourseToCart(page, courseId)
    if (added) {
      addedCount++
      console.log(' done')
    } else {
      console.log(' failed (course may not have sections)')
    }
    if (addedCount >= 2) break
  }

  if (addedCount === 0) {
    console.log('  WARNING: No courses added to cart. Conflict filter tests will be limited.')
  }

  // Step 2: Navigate to catalog
  console.log('\n--- Phase 2: Running invariant checks ---\n')
  await page.goto(BASE_URL, { timeout: 15000 })
  await page.waitForTimeout(COURSE_LOAD_MS)

  const initialCount = await getCourseCount(page)
  console.log(`  Initial course count: ${initialCount}`)

  // Step 3: Run invariant checks in rounds
  for (let round = 0; round < rounds; round++) {
    const countBefore = await getCourseCount(page)

    // Run a random filter action
    const actionDesc = await performRandomFilterAction(page)
    const countAfter = await getCourseCount(page)

    actionHistory.push({ action: actionDesc, countBefore, countAfter })
    process.stdout.write(`\r  [${round + 1}/${rounds}] ${actionDesc.padEnd(50)} ${countBefore} → ${countAfter}`)

    // Run invariant checks periodically (not every round to save time)
    if (round % 3 === 0) {
      await checkConflictFilterEffect(page, round, violations, addedCount > 0)
    }
    if (round % 5 === 0) {
      await checkFacetCountConsistency(page, round, violations)
    }
    if (round % 4 === 0) {
      await checkFilterMonotonicity(page, round, violations)
    }
    if (round % 6 === 0) {
      await checkFilterReversibility(page, round, violations)
    }
    if (round % 5 === 0) {
      await checkHeaderVsListConsistency(page, round, violations)
    }

    // Print violations as they're found
    if (violations.length > 0 && violations[violations.length - 1].round === round) {
      const v = violations[violations.length - 1]
      console.log(`\n  >>> VIOLATION: [${v.invariant}] ${v.description}`)
      console.log(`      Expected: ${v.expected}`)
      console.log(`      Actual:   ${v.actual}`)
    }
  }

  // Step 4: Reset filters and run targeted checks
  console.log('\n\n--- Phase 3: Targeted invariant probes ---\n')

  // Reset by navigating fresh
  await page.goto(BASE_URL, { timeout: 15000 })
  await page.waitForTimeout(COURSE_LOAD_MS)

  // Targeted: Conflict filter test
  console.log('  [Probe] Conflict filter effect test...')
  await checkConflictFilterEffect(page, 9000, violations, addedCount > 0)

  // Targeted: Facet consistency for each section
  for (const section of ['Format', 'Class Level']) {
    console.log(`  [Probe] Facet consistency for "${section}"...`)
    const facets = await readFacetSection(page, section)
    for (const f of facets.slice(0, 3)) {
      const countBefore = await getCourseCount(page)
      const clicked = await clickFilterByLabel(page, f.label)
      if (!clicked) continue
      const countAfter = await getCourseCount(page)

      if (countAfter > f.count) {
        violations.push({
          invariant: 'facet_count_consistency',
          description: `"${f.label}" (${section}) facet says ${f.count} but ${countAfter} courses shown`,
          expected: `count ≤ ${f.count}`,
          actual: `count = ${countAfter}`,
          action: `Click "${f.label}" in ${section}`,
          round: 9001,
        })
        console.log(`    >>> VIOLATION: "${f.label}" facet=${f.count}, actual=${countAfter}`)
      } else {
        console.log(`    OK: "${f.label}" facet=${f.count}, actual=${countAfter}`)
      }

      // Deactivate
      await clickFilterByLabel(page, f.label)
    }
  }

  // Targeted: hideUnavailable + facet count discrepancy
  console.log('\n  [Probe] hideUnavailable facet count test...')
  {
    // Read facet counts WITHOUT hideUnavailable
    const facetsClean = await readFacetSection(page, 'Format')
    const lectureClean = facetsClean.find(f => f.label === 'Lecture')

    // Now enable hideUnavailable and re-read
    await toggleCheckbox(page, '#hideUnavailable')
    const facetsFiltered = await readFacetSection(page, 'Format')
    const lectureFiltered = facetsFiltered.find(f => f.label === 'Lecture')

    if (lectureClean && lectureFiltered) {
      console.log(`    Without hideUnavailable: Lecture facet = ${lectureClean.count}`)
      console.log(`    With hideUnavailable:    Lecture facet = ${lectureFiltered.count}`)

      if (lectureClean.count === lectureFiltered.count && lectureClean.count > 0) {
        // If the facet count didn't change but hideUnavailable should have reduced it,
        // the sidebar isn't reflecting the filter.
        const mainCount = await getCourseCount(page)
        // Activate Lecture filter to see actual count
        await clickFilterByLabel(page, 'Lecture')
        const actualCount = await getCourseCount(page)

        if (actualCount < lectureFiltered.count) {
          violations.push({
            invariant: 'facet_hideUnavailable_mismatch',
            description: `Facet count for "Lecture" did not change when hideUnavailable was toggled (${lectureClean.count}→${lectureFiltered.count}), but actual filtered count is ${actualCount}`,
            expected: `Facet count should decrease when hideUnavailable is ON`,
            actual: `Facet stayed at ${lectureFiltered.count}, actual list has ${actualCount}`,
            action: 'Toggle hideUnavailable, compare facet count vs actual list count',
            round: 9003,
          })
          console.log(`    >>> VIOLATION: facet=${lectureFiltered.count} but actual=${actualCount}`)
        } else {
          console.log(`    OK: facet and actual counts are consistent (${actualCount})`)
        }

        await clickFilterByLabel(page, 'Lecture')
      } else {
        console.log(`    Facet counts differ (${lectureClean?.count} vs ${lectureFiltered?.count}) — sidebar reflects hideUnavailable correctly`)
      }
    }

    // Restore
    await toggleCheckbox(page, '#hideUnavailable')
  }

  // Targeted: Filter reversibility
  console.log('\n  [Probe] Filter reversibility test...')
  await checkFilterReversibility(page, 9002, violations)

  // Step 5: Results
  const elapsed = Date.now() - t0
  const uniqueViolations = deduplicateViolations(violations)

  console.log('\n\n================================================')
  console.log('RESULTS')
  console.log('================================================')
  console.log(`Rounds:              ${rounds}`)
  console.log(`Actions performed:   ${actionHistory.length}`)
  console.log(`Invariant violations: ${uniqueViolations.length}`)
  console.log(`Crash errors:        ${crashErrors.length}`)
  console.log(`Elapsed:             ${(elapsed / 1000).toFixed(1)}s`)

  if (uniqueViolations.length > 0) {
    console.log('\n--- Unique Violations ---')
    uniqueViolations.forEach((v, i) => {
      console.log(`\n  [${i + 1}] ${v.invariant}`)
      console.log(`      ${v.description}`)
      console.log(`      Expected: ${v.expected}`)
      console.log(`      Actual:   ${v.actual}`)
      console.log(`      Action:   ${v.action}`)
      if (v.screenshot) console.log(`      Screenshot: ${v.screenshot}`)
    })
  }

  if (crashErrors.length > 0) {
    console.log('\n--- Crash Errors ---')
    const unique = [...new Set(crashErrors.map(e => e.slice(0, 100)))]
    unique.forEach((e, i) => console.log(`  [${i + 1}] ${e}`))
  }

  // Write JSON results
  const results = {
    fuzzerType: 'invariant',
    timestamp: new Date().toISOString(),
    config: { rounds, coursesInCart: addedCount },
    stats: {
      totalActions: actionHistory.length,
      violations: uniqueViolations.length,
      crashErrors: crashErrors.length,
      elapsedMs: elapsed,
    },
    violations: uniqueViolations,
    crashErrors: [...new Set(crashErrors)],
    actionHistory,
  }
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2))
  console.log(`\nResults written to ${RESULTS_FILE}`)

  await browser.close()
  process.exit(uniqueViolations.length > 0 || crashErrors.length > 0 ? 1 : 0)
}

function deduplicateViolations(violations: Violation[]): Violation[] {
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

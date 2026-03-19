/**
 * Dumb fuzzer — baseline for comparison against the invariant-based approach.
 * Picks visible interactive elements at random and clicks/types adversarial inputs.
 * Crash-only oracle: detects JS errors, error boundaries, and blank screens.
 *
 * Usage: npx tsx scripts/toy-fuzzer-dumb.ts [--max-actions N] [--headed] [--bugs all]
 */

import { chromium, type Page, type ElementHandle } from '@playwright/test'
import fs from 'fs'

const RESULTS_FILE = 'toy-random-fuzzer-results.json'

const ADVERSARIAL_STRINGS = [
  '', '  ', 'A'.repeat(500), 'CS106A',
  "Robert'); DROP TABLE Students;--",
  '<script>alert(1)</script>',
  'javascript:alert(1)',
  '../../../etc/passwd',
  'undefined', 'null', '👍💀🔥',
  '[', '(', '*bad', '\\',
]

const DANGER_WORDS = ['submit', 'send', 'delete', 'remove', 'save', 'logout', 'sign out']

type BugReport = {
  step: number
  bugType: string
  message: string
  url: string
  trailingActions: string[]
  screenshot?: string
}

type CoverageSnapshot = {
  step: number
  statesDiscovered: number
  bugsFound: number
  elapsedMs: number
}

function parseArgs() {
  const args = process.argv.slice(2)
  let maxActions = 100, headed = false, bugs = 'all', port = 3001
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-actions' && args[i + 1]) maxActions = parseInt(args[i + 1], 10)
    if (args[i] === '--headed') headed = true
    if (args[i] === '--bugs' && args[i + 1]) bugs = args[i + 1]
    if (args[i] === '--port' && args[i + 1]) port = parseInt(args[i + 1], 10)
  }
  return { maxActions, headed, bugs, port }
}

function setupErrorListeners(page: Page, errors: string[]) {
  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`)
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const t = msg.text()
    if (t.includes('TypeError') || t.includes('Cannot read') ||
        t.includes('is not a function') || t.includes('RangeError')) {
      errors.push(`[console.error] ${t.slice(0, 300)}`)
    }
  })
}

async function checkOracles(page: Page, pendingErrors: string[]): Promise<{ bugType: string; message: string } | null> {
  if (pendingErrors.length > 0) {
    return { bugType: 'js_error', message: pendingErrors.shift()! }
  }

  const bodyText = await page.evaluate(() => document.body?.innerText || '')
  if (bodyText.includes('Application error') || bodyText.includes('Something went wrong'))
    return { bugType: 'error_boundary', message: 'Error boundary triggered' }

  const divCount = await page.evaluate(() => document.querySelectorAll('div').length)
  if (divCount < 3)
    return { bugType: 'blank_screen', message: `Blank screen (${divCount} divs)` }

  return null
}


async function run() {
  const { maxActions, headed, bugs, port } = parseArgs()
  const startUrl = `http://localhost:${port}/?bugs=${bugs}`

  console.log('Dumb Fuzzer (Toy Catalog)')
  console.log('======================================')
  console.log(`Target: ${startUrl}  |  Actions: ${maxActions}  |  ${headed ? 'headed' : 'headless'}`)
  console.log('')

  const browser = await chromium.launch({ headless: !headed })
  const page = await (await browser.newContext()).newPage()
  const pendingErrors: string[] = []
  setupErrorListeners(page, pendingErrors)

  try {
    await page.goto(startUrl)
  } catch {
    console.error(`Can't connect to ${startUrl}. Is toy:serve running?`)
    process.exit(1)
  }
  await page.waitForTimeout(1000)

  const historyLog: string[] = []
  const statesSeen = new Set<string>()
  const bugs_found: BugReport[] = []
  const timeline: CoverageSnapshot[] = []
  const t0 = Date.now()

  for (let i = 1; i <= maxActions; i++) {
    const stateKey = `${await page.evaluate(() => document.querySelectorAll('button,input').length)}|${await page.evaluate(() => document.body?.innerText?.length || 0)}`
    statesSeen.add(stateKey)

    if (i % 5 === 0) {
      timeline.push({ step: i, statesDiscovered: statesSeen.size, bugsFound: bugs_found.length, elapsedMs: Date.now() - t0 })
    }

    const hit = await checkOracles(page, pendingErrors)
    if (hit) {
      const bug: BugReport = {
        step: i, bugType: hit.bugType, message: hit.message,
        url: page.url(), trailingActions: historyLog.slice(-15),
      }
      try {
        bug.screenshot = `crash_toy_step${i}.png`
        await page.screenshot({ path: bug.screenshot })
      } catch {}
      bugs_found.push(bug)
      console.log(`\n  BUG #${bugs_found.length} [step ${i}]: ${hit.bugType} — ${hit.message.slice(0, 100)}`)

      try {
        await page.goto(startUrl, { timeout: 5000 })
        await page.waitForTimeout(500)
        pendingErrors.length = 0
      } catch {
        console.log('  Could not recover, stopping.')
        break
      }
    }

    const allTargets = await page.$$('button:visible:not([disabled]), input:visible:not([disabled])')
    if (allTargets.length === 0) { await page.waitForTimeout(300); continue }

    const safeTargets: ElementHandle[] = []
    for (const el of allTargets) {
      const text = await el.evaluate(e => ((e as HTMLElement).innerText || '').toLowerCase())
      if (!DANGER_WORDS.some(w => text.includes(w))) safeTargets.push(el)
    }
    if (safeTargets.length === 0) { await page.waitForTimeout(300); continue }

    const target = safeTargets[Math.floor(Math.random() * safeTargets.length)]

    try {
      const tagName = await target.evaluate(el => (el as Element).tagName.toLowerCase())
      const typeAttr = await target.evaluate(el => (el as Element).getAttribute('type') || '')
      const label = await target.evaluate(el => {
        const h = el as HTMLElement
        let l = h.innerText ? h.innerText.trim() : ''
        if (!l && h.tagName.toLowerCase() === 'input') l = h.getAttribute('placeholder') || ''
        if (!l) l = h.id || ''
        return l.split('\n')[0].slice(0, 30)
      })

      const desc = `<${tagName}${typeAttr ? ` type="${typeAttr}"` : ''}> ${label ? `"${label}"` : ''}`

      if (tagName === 'input' && (typeAttr === 'text' || typeAttr === 'search' || !typeAttr)) {
        const str = ADVERSARIAL_STRINGS[Math.floor(Math.random() * ADVERSARIAL_STRINGS.length)]
        await target.fill(str)
        await target.press('Enter').catch(() => {})
        historyLog.push(`Step ${i}: Typed ${JSON.stringify(str).slice(0, 40)} into ${desc}`)
        process.stdout.write(`\r  [${i}/${maxActions}] Typed into ${desc.slice(0, 35)}`.padEnd(70))
      } else {
        await target.click({ force: true, timeout: 1500 })
        historyLog.push(`Step ${i}: Clicked ${desc}`)
        process.stdout.write(`\r  [${i}/${maxActions}] Clicked ${desc.slice(0, 40)}`.padEnd(70))
      }

      await page.waitForTimeout(150)
    } catch {}
  }

  const elapsed = Date.now() - t0

  console.log('\n\n======================================')
  console.log('RESULTS')
  console.log('======================================')
  console.log(`Total actions:     ${maxActions}`)
  console.log(`States discovered: ${statesSeen.size}`)
  console.log(`Bugs found:        ${bugs_found.length}`)
  console.log(`Elapsed:           ${(elapsed / 1000).toFixed(1)}s`)

  if (bugs_found.length > 0) {
    console.log('\n--- Bug Details ---')
    for (const [i, b] of bugs_found.entries()) {
      console.log(`\n  [${i + 1}] ${b.bugType} at step ${b.step}`)
      console.log(`      URL:     ${b.url}`)
      console.log(`      Message: ${b.message.slice(0, 150)}`)
      if (b.screenshot) console.log(`      Screenshot: ${b.screenshot}`)
      console.log('      Last actions:')
      b.trailingActions.slice(-5).forEach(a => console.log(`        > ${a}`))
    }
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify({
    fuzzerType: 'random',
    timestamp: new Date().toISOString(),
    config: { maxActions, bugs, port },
    stats: { totalActions: maxActions, statesDiscovered: statesSeen.size, bugsFound: bugs_found.length, elapsedMs: elapsed },
    bugs: bugs_found,
    coverageTimeline: timeline,
  }, null, 2))
  console.log(`\nResults saved to ${RESULTS_FILE}`)

  await browser.close()
  process.exit(bugs_found.length > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

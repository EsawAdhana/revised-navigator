/**
 * Dumb fuzzer — baseline for comparison against the model-based approach.
 * Picks visible interactive elements at random and clicks/types adversarial inputs.
 * Usage: npx tsx scripts/dumb-fuzzer.ts [--max-actions N] [--headed] [--start /path]
 */

import { chromium, type Page, type BrowserContext, type ElementHandle } from '@playwright/test'
import fs from 'fs'

const AUTH_FILE = '.auth.json'
const BASE_URL = 'http://localhost:3000'
const RESULTS_FILE = 'random-fuzzer-results.json'

const ADVERSARIAL_STRINGS = [
  "Robert'); DROP TABLE Students;--",
  'A'.repeat(500),
  '<script>alert(1)</script>',
  'CS106A',
  '  spaces  ',
  '👍💀🔥',
  '',
  'undefined',
  'null',
  '../../../etc/passwd',
  'javascript:alert(1)',
]

// Don't click anything that could mutate data or log us out (using real Stanford Root website here)
const DANGER_WORDS = ['submit', 'send', 'delete', 'remove', 'add', 'import', 'save', 'update', 'logout', 'sign out']

type BugReport = {
  step: number | string
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
  let maxActions = 100
  let startPath = '/'
  let headed = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-actions' && args[i + 1]) maxActions = parseInt(args[i + 1], 10)
    if (args[i] === '--start' && args[i + 1]) startPath = args[i + 1]
    if (args[i] === '--headed') headed = true
  }
  return { maxActions, startPath, headed }
}

function setupErrorListeners(page: Page, errors: string[]) {
  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`)
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const t = msg.text()
    // Check for common React/Next.js error messages
    if (
      t.includes('React') || t.includes('Unhandled Runtime Error') ||
      t.includes('Rendered more hooks') || t.includes('Invariant') ||
      t.includes('Maximum update depth exceeded') ||
      t.includes('Cannot read properties of') ||
      t.includes('TypeError') || t.includes('RangeError')
    ) {
      errors.push(`[console.error] ${t.slice(0, 300)}`)
    }
  })
}

async function checkOracles(page: Page, pendingErrors: string[]): Promise<{ bugType: string; message: string } | null> {
  if (pendingErrors.length > 0) {
    return { bugType: 'js_error', message: pendingErrors.shift()! }
  }

  const bodyText = await page.evaluate(() => document.body?.innerText || '')
  if (bodyText.includes('Application error: a client-side exception has occurred') ||
      bodyText.includes('Something went wrong')) {
    return { bugType: 'error_boundary', message: 'Next.js Error Boundary triggered' }
  }

  // Blank screen (white screen of death)
  const divCount = await page.evaluate(() => document.querySelectorAll('div').length)
  if (divCount < 3) {
    return { bugType: 'blank_screen', message: `Blank screen (${divCount} divs)` }
  }

  return null
}


async function run() {
  const { maxActions, startPath, headed } = parseArgs()
  const startUrl = `${BASE_URL}${startPath.startsWith('/') ? startPath : `/${startPath}`}`

  console.log('Dumb Fuzzer')
  console.log('======================================')
  console.log(`Target: ${startUrl}  |  Actions: ${maxActions}  |  ${headed ? 'headed' : 'headless'}`)
  console.log('')

  const browser = await chromium.launch({ headless: !headed })
  let context: BrowserContext

  if (fs.existsSync(AUTH_FILE)) {
    console.log('Using saved auth session...')
    context = await browser.newContext({ storageState: AUTH_FILE })
  } else {
    console.log('No .auth.json found, running without auth.')
    context = await browser.newContext()
  }

  const page = await context.newPage()
  const pendingErrors: string[] = []
  setupErrorListeners(page, pendingErrors)

  try {
    await page.goto(startUrl)
  } catch {
    console.error(`Can't connect to ${startUrl}. Is the dev server running?`)
    process.exit(1)
  }
  await page.waitForTimeout(2000) // let hydration finish

  const historyLog: string[] = []
  const statesSeen = new Set<string>()
  const bugs: BugReport[] = []
  const timeline: CoverageSnapshot[] = []
  const t0 = Date.now()

  for (let i = 1; i <= maxActions; i++) {
    const stateKey = `${new URL(page.url()).pathname}|${await page.evaluate(() => document.querySelectorAll('button,input,a,[role]').length)}`
    statesSeen.add(stateKey)

    if (i % 5 === 0) {
      timeline.push({ step: i, statesDiscovered: statesSeen.size, bugsFound: bugs.length, elapsedMs: Date.now() - t0 })
    }

    const hit = await checkOracles(page, pendingErrors)
    if (hit) {
      const bug: BugReport = {
        step: i, bugType: hit.bugType, message: hit.message,
        url: page.url(), trailingActions: historyLog.slice(-15),
      }
      try {
        bug.screenshot = `crash_random_step${i}.png`
        await page.screenshot({ path: bug.screenshot })
      } catch {}
      bugs.push(bug)
      console.log(`\n  BUG #${bugs.length} [step ${i}]: ${hit.bugType} — ${hit.message.slice(0, 100)}`)

      // Try to recover by navigating back to start
      try {
        await page.goto(startUrl, { timeout: 10000 })
        await page.waitForTimeout(1500)
        pendingErrors.length = 0
      } catch {
        console.log('  Could not recover, stopping.')
        break
      }
    }

    const allTargets = await page.$$(
      'button:visible:not([disabled]), input:visible:not([disabled]), ' +
      '[role="tab"]:visible, [role="switch"]:visible, [role="slider"]:visible, ' +
      '[role="checkbox"]:visible, [role="menuitem"]:visible'
    )

    // Filter out dangerous actions (submit, delete, logout, etc.)
    const safeTargets: ElementHandle[] = []
    for (const el of allTargets) {
      const isInput = await el.evaluate(e => e.tagName.toLowerCase() === 'input')
      const text = await el.evaluate(e => ((e as HTMLElement).innerText || e.getAttribute('aria-label') || '').toLowerCase())
      const type = await el.evaluate(e => e.getAttribute('type') || '')
      if (isInput || (!DANGER_WORDS.some(w => text.includes(w)) && type !== 'submit')) {
        safeTargets.push(el)
      }
    }

    if (safeTargets.length === 0) {
      await page.waitForTimeout(1000)
      continue
    }

    const target = safeTargets[Math.floor(Math.random() * safeTargets.length)]

    try {
      const tagName = await target.evaluate(el => (el as Element).tagName.toLowerCase())
      const typeAttr = await target.evaluate(el => (el as Element).getAttribute('type'))
      const label = await target.evaluate(el => {
        const h = el as HTMLElement
        let l = h.innerText ? h.innerText.trim() : ''
        if (!l) l = h.getAttribute('aria-label') || ''
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
        await target.click({ force: true, timeout: 2000 })
        historyLog.push(`Step ${i}: Clicked ${desc}`)
        process.stdout.write(`\r  [${i}/${maxActions}] Clicked ${desc.slice(0, 40)}`.padEnd(70))
      }

      await page.waitForTimeout(300)
    } catch {
    }
  }

  const elapsed = Date.now() - t0

  console.log('\n\n======================================')
  console.log('RESULTS')
  console.log('======================================')
  console.log(`Total actions:     ${maxActions}`)
  console.log(`States discovered: ${statesSeen.size}`)
  console.log(`Bugs found:        ${bugs.length}`)
  console.log(`Elapsed:           ${(elapsed / 1000).toFixed(1)}s`)

  if (bugs.length > 0) {
    console.log('\n--- Bug Details ---')
    for (const [i, b] of bugs.entries()) {
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
    config: { maxActions, startUrl, headed },
    stats: { totalActions: maxActions, statesDiscovered: statesSeen.size, bugsFound: bugs.length, elapsedMs: elapsed },
    bugs,
    coverageTimeline: timeline,
  }, null, 2))
  console.log(`\nResults saved to ${RESULTS_FILE}`)

  await page.close()
  await browser.close()
  process.exit(bugs.length > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

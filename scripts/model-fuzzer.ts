#!/usr/bin/env npx tsx
/**
 * Model-Based GUI Fuzzer for Stanford Root
 *
 * Inspired by the Fuzzing Book's GUIFuzzer (Zeller et al., 2024).
 * Mines UI states, builds a finite state machine, and uses
 * coverage-guided exploration to systematically find bugs.
 *
 * Usage:
 *   npx tsx scripts/model-fuzzer.ts
 *   npx tsx scripts/model-fuzzer.ts --max-actions 200
 *   npx tsx scripts/model-fuzzer.ts --start /schedule
 *   npx tsx scripts/model-fuzzer.ts --headed          # visible browser
 */

import { chromium, type Page, type BrowserContext } from '@playwright/test'
import fs from 'fs'

// ─── Configuration ──────────────────────────────────────────────────────────────

const AUTH_FILE = '.auth.json'
const BASE_URL = 'http://localhost:3000'
const RESULTS_FILE = 'model-fuzzer-results.json'

const SETTLE_MS = parseInt(process.env.FUZZ_SETTLE || '400', 10)
const NAV_MS = parseInt(process.env.FUZZ_NAV || '1500', 10)
const ACTION_TIMEOUT = 3000

function parseArgs() {
  const args = process.argv.slice(2)
  let maxActions = 150
  let startPath = '/'
  let headed = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-actions' && args[i + 1]) maxActions = parseInt(args[i + 1], 10)
    if (args[i] === '--start' && args[i + 1]) startPath = args[i + 1]
    if (args[i] === '--headed') headed = true
  }

  return { maxActions, startPath, headed }
}

// ─── Types ──────────────────────────────────────────────────────────────────────

type ElementFingerprint = {
  tag: string
  type: string
  name: string
  role: string
  text: string
  href: string
  selector: string
}

type UIState = {
  id: string
  urlPath: string
  elements: ElementFingerprint[]
}

type ActionKind = 'click' | 'fill' | 'toggle' | 'navigate'

type Action = {
  kind: ActionKind
  elementIndex: number
  element: ElementFingerprint
  value?: string
}

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
  uniqueTransitions: number
  bugsFound: number
  elapsedMs: number
}

// ─── Fuzz Input Corpus ──────────────────────────────────────────────────────────

const VALID_INPUTS = [
  'CS106A',
  'MATH51',
  'Introduction to Computer Science',
  'Physics',
  'ECON',
]

const ADVERSARIAL_INPUTS = [
  '',
  ' ',
  'a'.repeat(500),
  '<script>alert(1)</script>',
  "Robert'); DROP TABLE Students;--",
  '\u0000\u0001\u0002',
  '👍💀🔥',
  'undefined',
  'null',
  'NaN',
  '../../../etc/passwd',
  '%00%01%0a%0d',
  '-1',
  '99999999',
  '\t\n\r',
  'javascript:alert(1)',
]

const ALL_INPUTS = [...VALID_INPUTS, ...ADVERSARIAL_INPUTS]

// ─── 1. State Mining ────────────────────────────────────────────────────────────

const INTERACTIVE_SELECTORS = [
  'button:not([disabled]):visible',
  'input:not([disabled]):not([type="hidden"]):visible',
  'a[href]:visible',
  '[role="tab"]:visible',
  '[role="checkbox"]:visible',
  '[role="switch"]:visible',
  '[role="combobox"]:visible',
  '[role="slider"]:visible',
  '[role="menuitem"]:visible',
  'select:not([disabled]):visible',
]

async function mineElements(page: Page): Promise<ElementFingerprint[]> {
  const results: ElementFingerprint[] = []

  for (const sel of INTERACTIVE_SELECTORS) {
    const handles = await page.locator(sel).all()
    for (const handle of handles) {
      try {
        const fp = await handle.evaluate((el) => {
          const htmlEl = el as HTMLElement
          const tag = htmlEl.tagName.toLowerCase()
          const type = htmlEl.getAttribute('type') || ''
          const name = htmlEl.getAttribute('name') || htmlEl.getAttribute('aria-label') || ''
          const role = htmlEl.getAttribute('role') || ''
          const text = (htmlEl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)
          const href = htmlEl.getAttribute('href') || ''

          const parts = [tag]
          if (htmlEl.id) parts.push('#' + htmlEl.id)
          else if (name) parts.push('[name="' + name + '"]')
          else if (role) parts.push('[role="' + role + '"]')
          if (type) parts.push('[type="' + type + '"]')

          return { tag, type, name, role, text, href, selector: parts.join('') }
        })
        results.push(fp)
      } catch {
        // Element became stale
      }
    }
  }

  return results
}

function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

function fingerprintElements(elements: ElementFingerprint[]): string {
  return elements
    .map(e => `${e.tag}|${e.type}|${e.name}|${e.role}`)
    .sort()
    .join('\n')
}

async function mineState(page: Page): Promise<UIState> {
  const elements = await mineElements(page)
  const urlPath = new URL(page.url()).pathname
  const sig = `${urlPath}\n${fingerprintElements(elements)}`
  return { id: `S_${hashString(sig)}`, urlPath, elements }
}

// ─── 2. Finite State Machine ────────────────────────────────────────────────────

class FSM {
  states = new Map<string, UIState>()
  transitionKeys = new Set<string>()
  transitionLog: { from: string; to: string; desc: string }[] = []
  private actionQueues = new Map<string, Action[]>()

  addState(state: UIState): boolean {
    if (this.states.has(state.id)) return false
    this.states.set(state.id, state)
    this.actionQueues.set(state.id, buildActionsForState(state))
    return true
  }

  recordTransition(from: string, to: string, action: Action) {
    const key = `${from}->${to}|${action.kind}|${action.element.selector}`
    this.transitionKeys.add(key)
    this.transitionLog.push({
      from, to,
      desc: actionDescription(action),
    })
  }

  popAction(stateId: string): Action | undefined {
    const q = this.actionQueues.get(stateId)
    if (!q || q.length === 0) return undefined
    return q.shift()
  }

  hasWork(): boolean {
    for (const q of this.actionQueues.values()) {
      if (q.length > 0) return true
    }
    return false
  }

  bestUnexploredState(): string | undefined {
    let best: string | undefined
    let bestLen = 0
    for (const [id, q] of this.actionQueues) {
      if (q.length > bestLen) {
        best = id
        bestLen = q.length
      }
    }
    return best
  }

  summary() {
    let remaining = 0
    for (const q of this.actionQueues.values()) remaining += q.length
    return {
      statesDiscovered: this.states.size,
      transitionsExplored: this.transitionLog.length,
      uniqueTransitions: this.transitionKeys.size,
      remainingActions: remaining,
    }
  }
}

// ─── Action Generation ──────────────────────────────────────────────────────────

const BLOCKED_LABELS = ['sign out', 'logout', 'log out', 'delete account']

function buildActionsForState(state: UIState): Action[] {
  const actions: Action[] = []

  state.elements.forEach((el, idx) => {
    const label = `${el.text} ${el.name}`.toLowerCase()
    if (BLOCKED_LABELS.some(b => label.includes(b))) return

    if (el.tag === 'input') {
      if (['text', 'search', 'email', 'url', 'number', 'tel', ''].includes(el.type)) {
        // Pick a random valid + a random adversarial input for each text field
        const validPick = VALID_INPUTS[Math.floor(Math.random() * VALID_INPUTS.length)]
        const advPick = ADVERSARIAL_INPUTS[Math.floor(Math.random() * ADVERSARIAL_INPUTS.length)]
        actions.push({ kind: 'fill', elementIndex: idx, element: el, value: validPick })
        actions.push({ kind: 'fill', elementIndex: idx, element: el, value: advPick })
      } else if (['checkbox', 'radio'].includes(el.type)) {
        actions.push({ kind: 'toggle', elementIndex: idx, element: el })
      }
      return
    }

    if (el.role === 'checkbox' || el.role === 'switch') {
      actions.push({ kind: 'toggle', elementIndex: idx, element: el })
      return
    }

    if (el.tag === 'a' && el.href) {
      try {
        const target = new URL(el.href, BASE_URL)
        if (target.hostname === new URL(BASE_URL).hostname) {
          actions.push({ kind: 'navigate', elementIndex: idx, element: el })
        }
      } catch {
        // Malformed href — skip
      }
      return
    }

    // Buttons, tabs, comboboxes, sliders, menu items — click
    actions.push({ kind: 'click', elementIndex: idx, element: el })
  })

  // Shuffle so exploration is non-deterministic across runs
  for (let i = actions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[actions[i], actions[j]] = [actions[j], actions[i]]
  }

  return actions
}

function actionDescription(a: Action): string {
  const target = a.element.name || a.element.text?.slice(0, 30) || a.element.selector
  if (a.kind === 'fill') return `fill("${target}", "${(a.value || '').slice(0, 25)}")`
  return `${a.kind}("${target}")`
}

// ─── 3. Crash Oracles ───────────────────────────────────────────────────────────

class CrashOracle {
  private pending: string[] = []

  attach(page: Page) {
    page.on('pageerror', (err) => {
      this.pending.push(`[pageerror] ${err.message}`)
    })

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const t = msg.text()
      if (
        t.includes('React') ||
        t.includes('Unhandled Runtime Error') ||
        t.includes('Rendered more hooks') ||
        t.includes('Invariant') ||
        t.includes('Maximum update depth exceeded') ||
        t.includes('Cannot read properties of') ||
        t.includes('TypeError') ||
        t.includes('RangeError')
      ) {
        this.pending.push(`[console.error] ${t.slice(0, 300)}`)
      }
    })
  }

  async check(page: Page): Promise<{ bugType: string; message: string } | null> {
    // JS errors collected from event listeners
    if (this.pending.length > 0) {
      const msg = this.pending.shift()!
      return { bugType: 'js_error', message: msg }
    }

    // Next.js error boundary
    const bodyText = await page.evaluate(() => document.body?.innerText || '')
    if (
      bodyText.includes('Application error: a client-side exception has occurred') ||
      bodyText.includes('Something went wrong')
    ) {
      return { bugType: 'error_boundary', message: 'Next.js Error Boundary triggered' }
    }

    // White screen of death
    const divCount = await page.evaluate(() => document.querySelectorAll('div').length)
    if (divCount < 3) {
      return { bugType: 'blank_screen', message: `Blank screen (${divCount} divs)` }
    }

    return null
  }

  drain() {
    this.pending = []
  }
}

// ─── 4. Action Execution ────────────────────────────────────────────────────────

async function findElement(page: Page, el: ElementFingerprint) {
  // Strategy: try name → aria-label → link text → CSS selector
  if (el.name) {
    const byName = page.locator(`[name="${CSS.escape(el.name)}"]`).first()
    if ((await byName.count()) > 0) return byName

    const byAria = page.locator(`[aria-label="${CSS.escape(el.name)}"]`).first()
    if ((await byAria.count()) > 0) return byAria
  }

  if (el.tag === 'a' && el.href) {
    const byHref = page.locator(`a[href="${CSS.escape(el.href)}"]`).first()
    if ((await byHref.count()) > 0) return byHref
  }

  if (el.text && el.text.length > 0 && el.text.length < 60) {
    const byText = page.getByText(el.text, { exact: false }).first()
    if ((await byText.count()) > 0) return byText
  }

  return page.locator(el.selector).first()
}

async function executeAction(page: Page, action: Action): Promise<boolean> {
  try {
    const loc = await findElement(page, action.element)
    if ((await loc.count()) === 0) return false

    switch (action.kind) {
      case 'fill': {
        await loc.fill(action.value || '', { timeout: ACTION_TIMEOUT })
        // Trigger debounced handlers
        await loc.press('Enter', { timeout: 1000 }).catch(() => {})
        await page.waitForTimeout(SETTLE_MS)
        break
      }
      case 'click':
      case 'toggle': {
        await loc.click({ timeout: ACTION_TIMEOUT, force: true })
        await page.waitForTimeout(SETTLE_MS)
        break
      }
      case 'navigate': {
        await loc.click({ timeout: ACTION_TIMEOUT })
        await page.waitForTimeout(NAV_MS)
        break
      }
    }
    return true
  } catch {
    return false
  }
}

// ─── 5. Main Fuzzer Loop ────────────────────────────────────────────────────────

async function run() {
  const { maxActions, startPath, headed } = parseArgs()
  const startUrl = `${BASE_URL}${startPath.startsWith('/') ? startPath : `/${startPath}`}`

  console.log('Model-Based GUI Fuzzer for Stanford Root')
  console.log('========================================')
  console.log(`Target:      ${startUrl}`)
  console.log(`Max actions: ${maxActions}`)
  console.log(`Mode:        ${headed ? 'headed' : 'headless'}`)
  console.log('')

  // ── Browser & Auth ──
  let context: BrowserContext
  const browser = await chromium.launch({ headless: !headed })

  if (fs.existsSync(AUTH_FILE)) {
    console.log('Found auth session, launching browser...')
    context = await browser.newContext({ storageState: AUTH_FILE })
  } else {
    console.log('No auth session found. Running without auth (landing + public pages only).')
    console.log('To create an auth session, run:  node scripts/smart-fuzzer.mjs')
    console.log('(it will open a browser for you to log in, then saves .auth.json)\n')
    context = await browser.newContext()
  }

  const page = await context.newPage()
  const oracle = new CrashOracle()
  oracle.attach(page)

  try {
    await page.goto(startUrl)
  } catch {
    console.error(`Cannot connect to ${startUrl}. Is the dev server running?`)
    process.exit(1)
  }
  await page.waitForTimeout(2000)

  // ── Init FSM ──
  const fsm = new FSM()
  const bugs: BugReport[] = []
  const trace: string[] = []
  const timeline: CoverageSnapshot[] = []
  const t0 = Date.now()
  let step = 0

  const initState = await mineState(page)
  fsm.addState(initState)
  let curId = initState.id

  console.log(`Initial state: ${curId} (${initState.elements.length} interactive elements on ${initState.urlPath})`)
  console.log('')

  // ── Explore ──
  while (step < maxActions) {
    let action = fsm.popAction(curId)

    // Current state exhausted — jump to the richest unexplored state
    if (!action) {
      if (!fsm.hasWork()) {
        console.log('\nAll discovered states fully explored.')
        break
      }

      const targetId = fsm.bestUnexploredState()
      if (!targetId) break
      const targetState = fsm.states.get(targetId)
      if (!targetState) break

      try {
        await page.goto(`${BASE_URL}${targetState.urlPath}`, { timeout: 10000 })
        await page.waitForTimeout(NAV_MS)
        oracle.drain()
      } catch {
        continue
      }

      const refreshed = await mineState(page)
      fsm.addState(refreshed)
      curId = refreshed.id
      action = fsm.popAction(curId)
      if (!action) continue
    }

    step++
    const desc = actionDescription(action)
    trace.push(`[${step}] ${desc}`)
    process.stdout.write(`\r  [${step}/${maxActions}] ${desc.padEnd(65).slice(0, 65)}`)

    const ok = await executeAction(page, action)
    if (!ok) continue

    // Oracle check
    const hit = await oracle.check(page)
    if (hit) {
      const bug: BugReport = {
        step,
        bugType: hit.bugType,
        message: hit.message,
        url: page.url(),
        trailingActions: trace.slice(-15),
      }

      try {
        const ssPath = `crash_model_step${step}.png`
        await page.screenshot({ path: ssPath })
        bug.screenshot = ssPath
      } catch {}

      bugs.push(bug)
      console.log(`\n  BUG #${bugs.length} [step ${step}]: ${hit.bugType} — ${hit.message.slice(0, 100)}`)

      // Recover
      try {
        await page.goto(startUrl, { timeout: 10000 })
        await page.waitForTimeout(NAV_MS)
        oracle.drain()
      } catch {
        console.log('  Could not recover from crash, stopping.')
        break
      }
    }

    // Mine post-action state
    const newState = await mineState(page)
    const isNew = fsm.addState(newState)
    fsm.recordTransition(curId, newState.id, action)
    curId = newState.id

    if (isNew) {
      process.stdout.write(` → NEW state ${newState.id} (${newState.elements.length} els)`)
    }

    // Periodic snapshot
    if (step % 5 === 0 || isNew) {
      const s = fsm.summary()
      timeline.push({
        step,
        statesDiscovered: s.statesDiscovered,
        uniqueTransitions: s.uniqueTransitions,
        bugsFound: bugs.length,
        elapsedMs: Date.now() - t0,
      })
    }
  }

  // ── Report ──
  const elapsed = Date.now() - t0
  const stats = fsm.summary()

  console.log('\n\n========================================')
  console.log('RESULTS')
  console.log('========================================')
  console.log(`Total actions:        ${step}`)
  console.log(`States discovered:    ${stats.statesDiscovered}`)
  console.log(`Transitions explored: ${stats.transitionsExplored}`)
  console.log(`Unique transitions:   ${stats.uniqueTransitions}`)
  console.log(`Remaining actions:    ${stats.remainingActions}`)
  console.log(`Bugs found:           ${bugs.length}`)
  console.log(`Elapsed:              ${(elapsed / 1000).toFixed(1)}s`)

  if (bugs.length > 0) {
    console.log('\n--- Bug Details ---')
    bugs.forEach((b, i) => {
      console.log(`\n  [${i + 1}] ${b.bugType} at step ${b.step}`)
      console.log(`      URL:     ${b.url}`)
      console.log(`      Message: ${b.message.slice(0, 150)}`)
      if (b.screenshot) console.log(`      Screenshot: ${b.screenshot}`)
      console.log('      Preceding actions:')
      b.trailingActions.slice(-5).forEach(a => console.log(`        → ${a}`))
    })
  }

  // ── Persist ──
  const results = {
    fuzzerType: 'model-based',
    timestamp: new Date().toISOString(),
    config: { maxActions, startUrl, headed },
    stats: { ...stats, totalActions: step, elapsedMs: elapsed, bugsFound: bugs.length },
    bugs,
    coverageTimeline: timeline,
    fsm: {
      states: Array.from(fsm.states.values()).map(s => ({
        id: s.id,
        urlPath: s.urlPath,
        elementCount: s.elements.length,
        elementSummary: s.elements.slice(0, 10).map(e => `${e.tag}[${e.type || e.role}] ${e.name || e.text?.slice(0, 20) || ''}`),
      })),
      transitions: fsm.transitionLog,
    },
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2))
  console.log(`\nResults written to ${RESULTS_FILE}`)

  await page.close()
  await browser.close()
  process.exit(bugs.length > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Fatal error in model fuzzer:', err)
  process.exit(1)
})

#!/usr/bin/env npx tsx
/**
 * Launches a visible browser so you can log in to Stanford Root.
 * Automatically detects when login succeeds and saves the session
 * to .auth.json for the fuzzers to reuse.
 *
 * Usage:  npx tsx scripts/save-auth.ts
 */

import { chromium } from '@playwright/test'
import fs from 'fs'

const AUTH_FILE = '.auth.json'
const BASE_URL = 'http://localhost:3000'

async function main() {
  console.log('Opening browser — log in to Stanford Root, then this script will auto-detect and save your session.\n')

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(BASE_URL)
  } catch {
    console.error(`Cannot connect to ${BASE_URL}. Is the dev server running? (npm run dev)`)
    await browser.close()
    process.exit(1)
  }

  console.log('Waiting for you to complete login...')

  // Poll until the auth gate disappears (the "Log in with Stanford" button is gone
  // and the site header or course list is visible)
  let attempts = 0
  const maxAttempts = 120 // 2 minutes
  while (attempts < maxAttempts) {
    await page.waitForTimeout(1000)
    attempts++

    const url = page.url()
    // If we're back on localhost and the auth gate is gone, we're logged in
    if (url.startsWith(BASE_URL)) {
      const hasLoginButton = await page.locator('button:has-text("Log in with Stanford")').count()
      const hasHeader = await page.locator('header').count()
      if (hasLoginButton === 0 && hasHeader > 0) {
        break
      }
    }
  }

  if (attempts >= maxAttempts) {
    console.error('Timed out waiting for login (2 minutes). Try again.')
    await browser.close()
    process.exit(1)
  }

  await context.storageState({ path: AUTH_FILE })
  console.log(`\nAuth saved to ${AUTH_FILE}`)
  console.log('You can now run the fuzzers headlessly:')
  console.log('  npm run fuzz:model')
  console.log('  npm run fuzz:random')

  await browser.close()
  process.exit(0)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})

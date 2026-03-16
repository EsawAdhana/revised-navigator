import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const AUTH_FILE = '.auth.json';
const BASE_URL = 'http://localhost:3000';
const TARGET_PATH = process.argv[2] || '/';
const TARGET_URL = `${BASE_URL}${TARGET_PATH.startsWith('/') ? TARGET_PATH : `/${TARGET_PATH}`}`;
const NUM_CLICKS = parseInt(process.argv.find((_, i, a) => a[i-1] === '--max-actions') || '100', 10);
const RESULTS_FILE = 'random-fuzzer-results.json';

async function runFuzzer() {
    console.log('🚀 Starting Smart UI Fuzzer...');
    let context;

    // 1. Setup Browser & Auth
    if (fs.existsSync(AUTH_FILE)) {
        console.log('✅ Found existing auth session, launching headless browser...');
        const browser = await chromium.launch({ headless: true });
        context = await browser.newContext({ storageState: AUTH_FILE });
    } else {
        console.log('⚠️ No auth session found. Launching visible browser for you to log in.');
        const browser = await chromium.launch({ headless: false });
        context = await browser.newContext();
        const page = await context.newPage();
        try {
            await page.goto(TARGET_URL);
        } catch (err) {
            console.error(`❌ Could not connect to ${TARGET_URL}. Is your local dev server running?`);
            process.exit(1);
        }

        console.log('⏳ Navigate to the application and complete any SSO / Logins.');
        console.log('⏳ PRESS [ENTER] IN THIS TERMINAL once you are fully logged in and looking at the main dashboard.');

        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });

        await context.storageState({ path: AUTH_FILE });
        console.log(`✅ Saved auth state to ${AUTH_FILE}`);
        console.log('You can close this script and re-run it later to fuzz headlessly instantly!');
    }

    const page = await context.newPage();

    let pageErrors = [];

    // Catch runtime JS exceptions
    page.on('pageerror', err => {
        pageErrors.push(err.message);
    });

    // Log specific React errors hitting the console
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const text = msg.text();
            // Only trap React invariant errors or obvious crashes, 
            // ignoring some 404s for missing images.
            if (text.includes('React') || text.includes('Unhandled Runtime Error') || text.includes('Rendered more hooks')) {
                pageErrors.push(text);
            }
        }
    });

    try {
        await page.goto(TARGET_URL);
    } catch (err) {
        console.error(`❌ Could not connect to ${TARGET_URL}. Is your local dev server running?`);
        process.exit(1);
    }

    await page.waitForTimeout(2000); // Wait for initial app load and hydration

    const historyLog = [];
    const statesSeen = new Set();
    const bugs = [];
    const timeline = [];
    const t0 = Date.now();

    console.log(`\n🐒 Unleashing the Chaos Monkey for ${NUM_CLICKS} continuous actions...\n`);

    for (let i = 1; i <= NUM_CLICKS; i++) {
        // Track unique states (URL + element count as rough proxy)
        const stateKey = `${new URL(page.url()).pathname}|${await page.evaluate(() => document.querySelectorAll('button,input,a,[role]').length)}`;
        statesSeen.add(stateKey);

        if (i % 5 === 0) {
            timeline.push({ step: i, statesDiscovered: statesSeen.size, bugsFound: bugs.length, elapsedMs: Date.now() - t0 });
        }

        // Check health before doing an action
        await checkHealth(page, pageErrors, historyLog, i);

        // 1. Find all potential targets
        const allTargets = await page.$$('button:visible:not([disabled]), input:visible:not([disabled]), [role="tab"]:visible, [role="switch"]:visible, [role="slider"]:visible, [role="checkbox"]:visible, [role="menuitem"]:visible');

        const targets = [];

        // 2. SAFE MODE FILTER: Prevent clicking anything that might mutate Production data
        for (const el of allTargets) {
            const isInput = await el.evaluate(e => e.tagName.toLowerCase() === 'input');
            const text = await el.evaluate(e => (e.innerText || e.getAttribute('aria-label') || '').toLowerCase());
            const type = await el.evaluate(e => e.getAttribute('type') || '');

            const dangerWords = ['submit', 'send', 'delete', 'remove', 'add', 'import', 'save', 'update', 'logout', 'sign out'];
            const isDangerousWord = dangerWords.some(word => text.includes(word));
            const isSubmitButton = type === 'submit';

            if (isInput || (!isDangerousWord && !isSubmitButton)) {
                targets.push(el);
            }
        }

        if (targets.length === 0) {
            console.log(`⚠️ [Step ${i}] No safe interactive targets found!`);
            await page.waitForTimeout(1000);
            continue;
        }

        // 3. Pick a random safe target
        const randomTarget = targets[Math.floor(Math.random() * targets.length)];

        try {
            const tagName = await randomTarget.evaluate(el => el.tagName.toLowerCase());
            const typeAttr = await randomTarget.evaluate(el => el.getAttribute('type'));
            const textContext = await randomTarget.evaluate(el => {
                let label = el.innerText ? el.innerText.trim() : '';
                if (!label) label = el.getAttribute('aria-label') || '';
                if (!label && tagName === 'input') label = el.getAttribute('placeholder') || '';
                if (!label) label = el.id || '';

                return label.split('\\n')[0].slice(0, 30); // Keep it short
            });

            const desc = `<${tagName}${typeAttr ? ` type="${typeAttr}"` : ''}> ${textContext ? `"${textContext}"` : ''}`;

            // 4. Perform an action
            if (tagName === 'input' && (typeAttr === 'text' || typeAttr === 'search' || !typeAttr)) {
                const weirdStrings = [
                    "Robert'); DROP TABLE Students;--",
                    "A".repeat(500),
                    "<script>alert(1)</script>",
                    "CS106A",
                    "  spaces  ",
                    "👍💀🔥",
                    ""
                ];
                const randomString = weirdStrings[Math.floor(Math.random() * weirdStrings.length)];
                await randomTarget.fill(randomString);
                await randomTarget.press('Enter');
                historyLog.push(`Step ${i}: Typed ${JSON.stringify(randomString)} into ${desc}`);
                process.stdout.write(`\r[${i}/${NUM_CLICKS}] Typed text...                   `);
            } else {
                await randomTarget.click({ force: true, timeout: 2000 });
                historyLog.push(`Step ${i}: Clicked ${desc}`);
                process.stdout.write(`\r[${i}/${NUM_CLICKS}] Clicked ${desc.slice(0, 30)}...          `);
            }

            // 4. Wait for React state, modals, and network to settle
            await page.waitForTimeout(300);

        } catch (e) {
            // Elements can disappear dynamically right before we click them (e.g., modals closing).
            // We just log it as a missed action internally.
        }
    }

    // Final health check
    await checkHealth(page, pageErrors, historyLog, "Final Check");

    const elapsed = Date.now() - t0;
    const results = {
        fuzzerType: 'random',
        timestamp: new Date().toISOString(),
        config: { maxActions: NUM_CLICKS, startUrl: TARGET_URL },
        stats: { totalActions: NUM_CLICKS, statesDiscovered: statesSeen.size, bugsFound: bugs.length, elapsedMs: elapsed },
        bugs,
        coverageTimeline: timeline,
    };
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    console.log(`\nResults written to ${RESULTS_FILE}`);

    console.log('\n\n✅🎉 Fuzzer completed successfully! The UI survived ' + NUM_CLICKS + ' random interactions without crashing.');
    process.exit(0);
}

async function checkHealth(page, pageErrors, historyLog, stepName, bugs = []) {
    if (pageErrors.length > 0) {
        const msg = `React Runtime Error: ${pageErrors[0]}`;
        bugs.push({ step: stepName, bugType: 'js_error', message: msg, trailingActions: historyLog.slice(-15) });
        logCrash(historyLog, msg, stepName);
        await page.screenshot({ path: 'crash_screenshot.png' });
        console.log(`📸 Saved screenshot to crash_screenshot.png`);
        process.exit(1);
    }

    const bodyContent = await page.content();

    if (bodyContent.includes('Application error: a client-side exception has occurred') ||
        bodyContent.includes('Something went wrong')) {
        const msg = 'Next.js Error Boundary Triggered!';
        bugs.push({ step: stepName, bugType: 'error_boundary', message: msg, trailingActions: historyLog.slice(-15) });
        logCrash(historyLog, msg, stepName);
        await page.screenshot({ path: 'crash_screenshot.png' });
        process.exit(1);
    }

    const numDivs = await page.evaluate(() => document.querySelectorAll('div').length);
    if (numDivs < 3) {
        const msg = 'Blank Screen of Death Detected (empty layout)';
        bugs.push({ step: stepName, bugType: 'blank_screen', message: msg, trailingActions: historyLog.slice(-15) });
        logCrash(historyLog, msg, stepName);
        await page.screenshot({ path: 'crash_screenshot.png' });
        process.exit(1);
    }
}

function logCrash(historyLog, reason, stepName) {
    console.error(`\n\n======================================================`);
    console.error(`💥 CRASH DETECTED at Step: ${stepName}`);
    console.error(`======================================================`);
    console.error(`🔴 Cause: ${reason}`);
    console.error(`======================================================\n`);
    console.error(`How to reproduce:\n`);

    // Show the last 15 actions that led to the crash
    const lastHistory = historyLog.slice(-15);
    lastHistory.forEach(log => console.error(`  -> ${log}`));
    console.error(`\n======================================================\n`);
}

runFuzzer().catch(err => {
    console.error('Fatal unexpected error in fuzzer:', err);
    process.exit(1);
});

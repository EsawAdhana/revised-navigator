# Fuzzing Suite — Stanford Root

How to reproduce the two fuzzing experiments described in the project report.

## Prerequisites

- **Node.js 20+** and npm
- **Playwright Chromium** (installed automatically below)
- Supabase anon key (provided with submission — read-only)

## Quick Start

```bash
npm install
npx playwright install chromium

cp .env.example.fuzz .env.local
# Edit .env.local and paste the provided URL + anon key

npm run dev          # in a separate terminal
npm run fuzz:all     # runs both fuzzers sequentially
```

## Individual Fuzzers

| Command | Script | Description |
|---------|--------|-------------|
| `npm run fuzz:random` | `scripts/dumb-fuzzer.ts` | Random monkey tester with crash-only oracle (baseline). |
| `npm run fuzz:invariant` | `scripts/invariant-fuzzer.ts` | Random filter actions + 5 behavioral invariant checks. |

### Options

```bash
npx tsx scripts/dumb-fuzzer.ts --max-actions 200 --headed
npx tsx scripts/invariant-fuzzer.ts --rounds 50 --headed
```

## Output

- `random-fuzzer-results.json` — states discovered, bugs, coverage timeline
- `invariant-fuzzer-results.json` — invariant violations with expected/actual values

Screenshots for bugs/violations are saved as `crash_*.png` / `violation_*.png`.

## How FUZZ_MODE Works

`NEXT_PUBLIC_FUZZ_MODE=true` does two things:

1. **Bypasses Stanford OAuth** — `AuthGate` renders the app without requiring login
2. **Uses the anon key for API routes** — read-only access via RLS policies

This flag is compile-time and is never set in production.

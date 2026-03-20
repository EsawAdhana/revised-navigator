# Fuzzing — Stanford Root

## Setup

Node 20+, npm, Playwright Chromium (`npx playwright install chromium`).
`npm run dev` loads root `env.example.fuzz` (fuzz mode + Supabase anon).

```bash
npm install
npx playwright install chromium
npm run dev
npm run fuzz:all
```

Defaults: **1000** dumb actions / **1000** invariant rounds (invariant run can exceed an hour).

`NEXT_PUBLIC_FUZZ_MODE=true` skips OAuth in `AuthGate` and uses the anon key on API routes (RLS).

## Fuzzers

**`fuzzing/dumb-fuzzer.ts`** — Random clicks/typing on safe controls; adversarial strings in text fields; 300 ms between steps; state key: `pathname` plus count of `button,input,a,[role]`. Crash checks: `pageerror`, console errors (React / TypeError / etc.), Next error-boundary text, blank screen (under three `div` nodes). On hit: screenshot, last 15 actions, reload start URL.

**`fuzzing/invariant-fuzzer.ts`** — Phase 1: seed cart for conflict tests. Phase 2: random filter toggles (terms, facets, hide unavailable, show conflicts) plus periodic checks: (1) hiding conflicts lowers count when cart non-empty, (2) facet count vs list, (3) hide-unavailable never increases count, (4) hide-unavailable on→off restores count, (5) header “0 classes” iff empty state.

| Command                 | Role                                              |
|-------------------------|---------------------------------------------------|
| `npm run fuzz:random`   | Dumb (production)                                 |
| `npm run fuzz:invariant`| Invariant (production)                            |
| `npm run fuzz:all`      | Both (`run-all-fuzzers.sh`; starts dev if needed) |

```bash
npx tsx fuzzing/dumb-fuzzer.ts --max-actions 200 --headed
npx tsx fuzzing/invariant-fuzzer.ts --rounds 50 --headed`
```

## Toy app

`fuzzing/toy-app/index.html` — 12 courses; `?bugs=all|none|conflict,leak,crash`. **conflict:** `conflicts()` always false. **leak:** hide-unavailable sticks on after 4+ toggles. **crash:** `new RegExp` on search input.

```bash
npm run toy:serve
npm run toy:fuzz:random
npm run toy:fuzz:invariant
```

Options: `--max-actions`, `--rounds`, `--headed`, `--bugs …`.

## Output

JSON: `random-fuzzer-results.json`, `invariant-fuzzer-results.json`, `toy-random-fuzzer-results.json`, `toy-invariant-fuzzer-results.json`. PNGs: `crash_*.png`, `violation_*.png`.

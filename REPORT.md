# Invariant-Based Oracle Fuzzing for GUI Bug Detection in a Production Web Application

**Esaw Adhana** | Stanford University | CS 256 Final Project Report

---

## 1. System Description

This project evaluates **invariant-based oracle fuzzing** for finding correctness bugs in interactive web applications. Traditional GUI fuzzers detect only crashes — JavaScript exceptions, error boundaries, blank screens — but are blind to bugs where the application silently produces incorrect output. We augment random GUI fuzzing with behavioral property checks that encode what the application *should* do, detecting a strictly larger class of bugs.

We implement two Playwright-driven GUI fuzzers that interact with a web application through headless Chromium. Both select visible interactive elements at random and perform clicks or adversarial text entry. They differ only in their oracle:

- **Dumb Fuzzer (baseline):** Crash-only oracle — `pageerror` events, React console errors, error boundary activation, and blank-screen detection.
- **Invariant Fuzzer:** Same crash checks plus behavioral invariants verified after random filter interactions (e.g., "toggling a filter on then off should restore the original count").

We target five bug categories: (1) unhandled JS exceptions, (2) error boundary activations, (3) white-screen-of-death failures, (4) silent filter logic errors, and (5) UI state desynchronization. Categories 1–3 are crash-detectable; 4–5 require invariant-based detection.

We evaluate against two targets: a toy catalog with three planted bugs (controlled evaluation), and **Stanford Root**, a production course discovery app with 3,400+ courses and 20+ filter controls.

## 2. Technical Overview

### 2.1 Test Harness and Auth Bypass

Both fuzzers register a `pageerror` handler and a `console` handler that filters for error-level messages matching crash signatures (`TypeError`, `Cannot read properties of`, `Maximum update depth exceeded`, etc.). For the production app, a compile-time flag (`NEXT_PUBLIC_FUZZ_MODE=true`) bypasses Stanford OAuth, and API routes use a read-only Supabase anonymous key.

### 2.2 Dumb Fuzzer

On each step: query all visible, non-disabled interactive elements → filter out dangerous labels (`delete`, `logout`, `save`, etc.) → pick one uniformly at random → fill with an adversarial string if it's a text input, else click → wait 300ms → run crash oracle. The adversarial corpus includes SQL injection, XSS vectors, regex metacharacters, boundary values, emoji, and type-confusion strings. The fuzzer tracks UI states via `pathname | element_count` fingerprints as a coverage proxy.

### 2.3 Invariant Fuzzer

**Phase 1 (cart seeding):** Adds courses to the schedule cart for conflict-filter testing. **Phase 2 (random actions + checks):** Performs random filter toggles and facet clicks, then periodically verifies five invariants:

| # | Invariant | What a Violation Means |
|---|-----------|----------------------|
| 1 | Conflict filter effect: hiding conflicts should reduce count | Conflict detection broken |
| 2 | Facet consistency: clicking a facet shows ≤ its advertised count | Sidebar counts wrong |
| 3 | Monotonicity: "Hide unavailable" never increases count | Filter interaction bug |
| 4 | Reversibility: toggle ON→OFF restores original count | State leak / desync |
| 5 | Header/list consistency: "0 classes" ↔ empty state visible | Header and list disagree |

Each violation captures expected vs. actual values and a screenshot.

### 2.4 Toy Application

A self-contained HTML catalog (`scripts/toy-app/index.html`) with 12 courses and three planted bugs controlled via `?bugs=all|none|conflict,leak,crash`:

- **`conflict`:** `conflicts()` always returns `false` — conflict filter is a silent no-op.
- **`leak`:** After 4+ toggles of "Hide unavailable," internal state locks to `true` regardless of checkbox.
- **`crash`:** Search passes input directly to `new RegExp()`, crashing on metacharacters like `[`.

## 3. System Setup Steps

**Prerequisites:** Node.js 20+, npm.

```bash
# Install dependencies and Playwright
npm install && npx playwright install chromium

# Configure environment (bypasses Stanford OAuth)
cp .env.example.fuzz .env.local
# Edit .env.local: paste the provided Supabase URL + anon key
```

**Toy evaluation:**
```bash
npm run toy:serve                    # Terminal 1: start toy app on port 3001
npm run toy:fuzz:random              # Terminal 2: dumb fuzzer
npm run toy:fuzz:invariant           # Terminal 2: invariant fuzzer
# Options: --max-actions N, --rounds N, --headed, --bugs all|none|conflict,leak,crash
```

**Production evaluation:**
```bash
npm run dev                          # Terminal 1: start Next.js dev server
npm run fuzz:all                     # Terminal 2: runs both fuzzers sequentially
```

Results are written to `*-fuzzer-results.json`. Screenshots are saved as `crash_*.png` / `violation_*.png`.

## 4. Evaluation Methodology

**Metrics:** Unique bugs/violations found, total crashes, UI states discovered, elapsed time, and actions performed.

**Bug detection:** The crash oracle (both fuzzers) detects JS errors, error boundaries, and blank screens. The invariant oracle (invariant fuzzer only) performs controlled state transitions and compares expected vs. actual values — no program annotation required.

**Ablation design:** Both fuzzers use identical random action strategies; the only difference is the oracle. Any bug caught by the invariant fuzzer but missed by the dumb fuzzer isolates the contribution of invariant-based detection. We also run with `--bugs none` to verify zero false positives.

**Production target:** Stanford Root — a Next.js 16 application with 3,400+ courses, faceted filtering across 7 groups, URL-synchronized state (nuqs), multiple Zustand stores, and virtualized rendering.

## 5. Basic Evaluation

### 5.1 Results

| Metric | Dumb Fuzzer | Invariant Fuzzer |
|--------|:-----------:|:----------------:|
| Actions / Rounds | 100 | 30 |
| Elapsed time | 19.5s | 51.6s |
| Crashes detected | 5 (3 unique) | 0 |
| Invariant violations | — | 2 unique |
| **Distinct bugs found** | **1 of 3** | **2 of 3** |

**Dumb fuzzer:** Found 5 crashes, all from the **regex crash bug** — adversarial strings like `[`, `*bad`, and `Robert'); DROP TABLE Students;--` cause `SyntaxError` in `new RegExp()`. Completely blind to the silent **conflict** and **leak** bugs.

**Invariant fuzzer:** Found 2 violations. The **conflict filter** invariant caught the planted conflict bug (count stayed at 8 after hiding conflicts when it should have dropped). The **reversibility** invariant caught the leak bug (count went from 9→6 after toggling hide-unavailable ON then OFF, indicating state desync). Did not trigger the crash bug because its action space covers only filter toggles, not search input.

### 5.2 Ablation

| Bug | Dumb | Invariant | Why |
|-----|:----:|:---------:|-----|
| `crash` (regex) | Found | Not triggered | Crash oracle catches `pageerror`; invariant fuzzer doesn't type in search |
| `conflict` (silent no-op) | Missed | Found | No crash produced; invariant 1 detects the missing count reduction |
| `leak` (state desync) | Missed | Found | No crash produced; invariant 4 detects the irreversible toggle |

The crash oracle and invariant oracle are complementary — neither alone finds all three bugs. The invariant oracle's advantage is precisely in the silent-correctness category that crash detection fundamentally cannot reach.

### 5.3 Discussion

The **leak bug** requires 4+ toggles to manifest, which random exploration reliably produces when the action space is small (4 choices). In larger applications, the probability of repeatedly hitting the same control decreases, making such stateful bugs harder to trigger randomly. The **crash bug** lives in a code path (search input) outside the invariant fuzzer's action space, showing that oracle sophistication does not substitute for input-surface coverage.

## 6. Evaluation on Production Application

| Metric | Dumb Fuzzer | Invariant Fuzzer |
|--------|:-----------:|:----------------:|
| Actions / Rounds | 100 | 30 |
| Elapsed time | 47.0s | 133.4s |
| States discovered | 40 | — |
| Crashes | 0 | 0 |
| Invariant violations | — | 1 |

**Dumb fuzzer:** No crashes in 100 actions. The production app sanitizes search input with `String.includes()` (not regex) and React's error boundaries are resilient. The fuzzer discovered 40 unique UI states with roughly linear growth.

**Invariant fuzzer:** Detected one violation — **`filter_effect_conflicts`**. After seeding 3 cart courses and filtering to WAY-EDP (88 courses), unchecking "Show conflicting" left the count unchanged at 88. This could indicate a real conflict-detection issue, or a false positive: the 88 WAY-EDP courses may simply have no time overlaps with the 3 cart courses. This highlights an important design consideration — **invariants that assume statistical properties of the data can produce false positives on narrow filtered subsets**.

**Exploration coverage.** The invariant fuzzer covers 7 filter action types (2 toggles + 5 facet groups) but does not exercise search, course detail pages, or the schedule builder. The 2.8× slowdown vs. the toy app (133s vs. 52s) reflects heavier React re-renders with 3,400+ courses. Extending the action space to cover search invariants and cross-page navigation would improve coverage of the production interactive surface.

## 7. Software Reproducibility Artifact Package

| File | Description |
|------|-------------|
| `scripts/toy-app/index.html` | Toy catalog with 3 planted bugs |
| `scripts/toy-app/serve.ts` | HTTP server for toy app (port 3001) |
| `scripts/toy-fuzzer-dumb.ts` | Dumb fuzzer for toy app |
| `scripts/toy-fuzzer-invariant.ts` | Invariant fuzzer for toy app |
| `scripts/dumb-fuzzer.ts` | Dumb fuzzer for production app |
| `scripts/invariant-fuzzer.ts` | Invariant fuzzer for production app |
| `scripts/run-all-fuzzers.sh` | Convenience script: starts dev server, runs both fuzzers |
| `.env.example.fuzz` | Template environment file for fuzz mode |
| `*-fuzzer-results.json` | Result files from evaluation runs in this report |

## References

[1] A. Zeller et al., "Testing Graphical User Interfaces," in *The Fuzzing Book*, CISPA, 2024. https://www.fuzzingbook.org/html/GUIFuzzer.html

[2] A. Mesbah, A. van Deursen, and S. Lenselink, "Crawling Ajax-based web applications through dynamic analysis of user interface state changes," *ACM TWEB*, vol. 6, no. 1, 2012.

[3] B. Holler, C. Herzig, and A. Zeller, "Fuzzing with Code Fragments," in *USENIX Security*, 2012.

[4] C. Pacheco et al., "Feedback-directed random test generation," in *ICSE*, 2007.

[5] Microsoft, "Playwright: End-to-end testing for modern web apps," 2024. https://playwright.dev/

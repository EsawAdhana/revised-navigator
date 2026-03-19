# Fuzzer Methods — Stanford Root

This document describes the two fuzzers. For setup instructions, see [FUZZING.md](FUZZING.md).

Both fuzzers use [Playwright](https://playwright.dev/) to drive a headless Chromium browser against the running dev server. They share a common test harness but differ in their **oracle strategy**: the dumb fuzzer only detects crashes, while the invariant fuzzer checks behavioral properties.

---

## 1. Dumb Fuzzer (Crash-Only Baseline)

**File:** `scripts/dumb-fuzzer.ts`

A random monkey tester. On each step it:

1. Queries the DOM for visible, non-disabled interactive elements (buttons, inputs, tabs, switches, sliders, checkboxes).
2. Filters out dangerous labels ("submit", "delete", "logout", etc.) to avoid mutating data.
3. Picks one element uniformly at random.
4. If it's a text input, fills it with a random adversarial string. Otherwise, clicks it.
5. Waits 300ms for React state to settle.
6. Runs the **crash oracle** (see below).

The dumb fuzzer tracks rough "states" using `URL_pathname | interactive_element_count` for comparison purposes, but has no memory of what it's already tried.

---

## 2. Invariant Oracle Fuzzer

**File:** `scripts/invariant-fuzzer.ts`

The dumb fuzzer can only find bugs that cause observable failures. Many real bugs are *silent* — the app doesn't crash, it just does the wrong thing. The invariant fuzzer addresses this by defining properties the app should always satisfy and checking them after random filter interactions.

### Execution

**Phase 1 — Cart Seeding.** Navigates to course detail pages and adds courses to the cart. This is needed for the conflict filter invariant.

**Phase 2 — Random Actions + Invariant Checks.** Navigates to the catalog and performs random filter actions (toggling switches, clicking facets). After each action, it periodically runs invariant checks on a staggered schedule.

### The Five Invariants

| # | Name | Property | What a violation means |
|---|------|----------|----------------------|
| 1 | Conflict Filter Effect | With cart items, hiding conflicts should reduce the count | Conflict detection is broken |
| 2 | Facet Count Consistency | Clicking a facet should show ≤ its advertised count | Sidebar counts are lying |
| 3 | Filter Monotonicity | "Hide closed & waitlisted" should never increase the count | Filter interaction bug |
| 4 | Filter Reversibility | Toggle ON then OFF should return to the same count | State leak in URL/store sync |
| 5 | Header/List Consistency | "0 classes" ↔ empty state message visible | Header and list disagree |

Each violation captures the invariant name, expected vs. actual values, the triggering action, and the full URL for reproduction.

---

## Crash Oracle (Shared)

Both fuzzers check for crashes after every action:

| Check | How | Bug Type |
|-------|-----|----------|
| JS exceptions | Playwright `pageerror` event | `js_error` |
| React errors | Console errors matching "React", "TypeError", etc. | `js_error` |
| Error boundary | Page contains "Application error" or "Something went wrong" | `error_boundary` |
| Blank screen | Fewer than 3 `<div>` elements in the DOM | `blank_screen` |

On crash, the fuzzer takes a screenshot, records the last 15 actions, and recovers by navigating back to the start URL.

## Adversarial Input Corpus

The dumb fuzzer uses a shared set of adversarial strings for text inputs:

| Category | Examples |
|----------|---------|
| XSS | `<script>alert(1)</script>`, `javascript:alert(1)` |
| SQL injection | `Robert'); DROP TABLE Students;--` |
| Path traversal | `../../../etc/passwd` |
| Boundary values | Empty string, whitespace, 500-char string |
| Type confusion | `undefined`, `null`, `NaN` |
| Encoding | Null bytes, emoji (`👍💀🔥`) |

## Why Two Fuzzers?

The dumb fuzzer serves as the **ablation baseline**. It uses the same random action strategy but only has the crash oracle. The invariant fuzzer adds behavioral property checks on top of random exploration. Comparing the two isolates the contribution of invariant-based oracles: any bug the invariant fuzzer catches that the dumb fuzzer misses is a bug that crash detection fundamentally cannot find.

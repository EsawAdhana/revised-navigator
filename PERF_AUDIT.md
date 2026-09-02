# Performance and UI audit

_Last reviewed: 2026-08-25. Findings 1, 2, 3, 4 and 19 are FIXED — see the status
notes on each. Do not re-fix them._

Full pass over `src/` focused on performance and UI/UX risk (complements AUDIT.md,
which was a correctness sweep, and FINDINGS.md, which was a QA pass). Every finding
below was verified against the code; the payload numbers were measured against the
live dev server: `/api/courses` (light) = **2.79 MB / 8,641 courses**,
`/api/courses?full=1` = **45.6 MB / 95,174 sections**.

Measured on production 2026-08-25 (`curl` + Human Behavior real-user vitals, 14d):
`/api/courses` = **394 KB brotli**, `/api/courses?full=1` = **3.3 MB brotli** on the
wire (the 45.6 MB figure above is the parsed size, not the download). Real-user
TTFB p75 was **1720ms** on `/instructors/[slug]`, **1006ms** on `/courses/[code]`,
**1272ms** on `/browse`, against an origin answering in ~110ms. Rendering was never
the problem: CLS ~0, INP p75 80ms desktop / 108ms mobile, LCP p75 1.6s.

## Fixed since this audit was written

- **Findings 1 and 2** — `fetchCourses` now does a single `readCacheEntry()` returning
  `{ data, ts }` and returns early when `Date.now() - entry.ts <= CACHE_TTL`, so the
  fresh-cache path is reachable and the 45 MB entry is read once.
- **Finding 3** — the import-time `fetchCourses()` is gone; screens that show courses
  call `useEnsureCatalog()` (`src/hooks/use-catalog.ts`), and `schedule-sync` kicks the
  load itself when it needs the catalog. The landing page no longer downloads it.
- **Finding 4** — `src/middleware.ts` returns `NextResponse.next()` immediately for any
  path other than `/`, and the matcher excludes `api/`, so the Supabase `getUser()`
  round trip happens on the landing page only.
- **Finding 19** — `/api/courses` caches the pre-serialized string (`cachedFull`) and
  prefers the prebuilt `data/catalog/*.json` dump, so it no longer re-stringifies
  per request.

## New since this audit (2026-08-25)

**Course and instructor pages were rendered per request despite `revalidate = 86400`.**
Every response carried `cache-control: private, no-cache, no-store` with no
`x-nextjs-cache` header, and `x-vercel-cache: MISS` on repeat hits of the same URL —
reproduced in a local production build, so it was app code, not Vercel. On a cold
instance each render also paid a 34 MB `full.json` read and parse (measured 70ms +
124ms locally, 123 MB heap). Cause: a dynamic route with no `generateStaticParams` is
not entered into the full route cache. Fixed by prerendering both routes from the dump
(`getAllCourseIdsFromDump` / `getAllInstructorSlugsFromDump`). Verified after the fix:
`x-nextjs-cache: HIT`, `x-nextjs-prerender: 1`,
`Cache-Control: s-maxage=86400, stale-while-revalidate=31449600`. Cost: the build now
generates 15,139 static pages and takes **151s** instead of ~32s.

Format: `path:line - what's wrong / why it hurts / suggested fix`.

---

## P0 - Major, affects every user

### 1. ~~The full 45.6 MB catalog is re-downloaded on every page load~~ — FIXED
`src/lib/store.ts:154-242`

`fetchCourses` reads `readStaleCache()` (accepts anything < 24 h) first, then checks
`if (cached && !stale)` to skip the network. Because everything `readCache()` accepts
(< 30 min) is also accepted by `readStaleCache()`, **`cached && !stale` can never be
true**. The 30-minute fresh-cache early return is dead code, so every full page load
(reload, new tab, first navigation) downloads and parses the entire 45.6 MB full
catalog again, then structured-clones it back into IndexedDB. Stale data does render
instantly, but the user still pays for: the download (multi-MB even compressed), a
~45 MB `JSON.parse`, `rowToCourse` over 8,641 rows, and a 45 MB IndexedDB write, on
main thread, every visit.

Fix: make the fresh-cache check meaningful, e.g. have `readStaleCache` also return the
entry age, and skip the network fetch entirely when age < TTL.

### 2. ~~Double IndexedDB read of the 45 MB cache entry on every load~~ — FIXED
`src/lib/store.ts:162,181`

`readStaleCache()` and `readCache()` each do a full `get(IDB_KEY)` of the same 45 MB
entry. When a cache exists (the common case), the second read's result is never used
(see finding 1). That's a wasted full deserialize of the largest object in the app.
Fix: read once, return `{ data, ts }`, and decide fresh/stale from the timestamp.

### 3. ~~The catalog fetch fires on *every* page, including the marketing landing page~~ — FIXED 2026-08-25
`src/lib/store.ts:323-325`, import chain: `layout.tsx` → `AuthProvider` →
`use-sync-schedule` → `schedule-sync` → `store`

`fetchCourses()` runs at module import time, and the root layout transitively imports
the store. A visitor who lands on `/`, `/privacy`, or `/terms` and never opens the
catalog still downloads 2.8 MB + 45.6 MB and pays the full parse/cache cost.
Fix: trigger `fetchCourses()` from the pages that need it (browse, schedule, course
detail) instead of at import time.

### 4. ~~Middleware makes a Supabase network round trip on every request~~ — FIXED
`src/middleware.ts:46,67-71`

`supabase.auth.getUser()` is a network call to Supabase Auth. The matcher only
excludes static assets, so **every page navigation, every `/api/courses` hit, and
every `/api/track` beacon** first blocks on an auth round trip, even though the only
thing the middleware does with the user is the `/` → `/browse` redirect. Analytics
beacons are the worst case: middleware `getUser()` + the route's own `getUser()` =
two Supabase auth calls per tracked event.

Fix: narrow the matcher (the redirect only needs `/`; session cookie refresh does not
need to run on `/api/*`), or use `getClaims()`/local JWT verification instead of the
network `getUser()` where possible. Also note the dev-server warning: the
`middleware` file convention is deprecated in Next 16 in favor of `proxy`.

### 5. Holding the whole catalog in client memory is the root architectural cost
`src/lib/store.ts` + `src/types/course.ts`

8,641 courses with 95,174 fully hydrated sections (meetings, instructors, GERs,
enrollment) live in a single Zustand array. Realistic JS heap cost is well north of
100 MB, which is tab-crash territory on low-memory phones (iOS Safari especially),
and it makes every downstream `map`/`filter`/`find` O(8.6k) at best. Client-side
filtering is a legitimate design for instant facets, but the payload can shrink a
lot without giving that up: the filter pipeline only needs a handful of section
fields (`term`, `component`, `classLevel`, `units`, `gers`, `status`, `meetings.days`,
`meetings.time`); locations, instructors per meeting, enrollment numbers, exam info
etc. could stay detail-only (the detail page already has its own fetch path). Worth
doing before the catalog grows further.

---

## P1 - Interaction performance (browse page hot paths)

### 6. Up to 7 full filter passes over the catalog per keystroke / filter change
`src/components/filter-sidebar.tsx:152-268`, `src/lib/course-filter.ts`

The visible list runs `filterCourses` once (`use-filtered-courses.ts:44`), and the
sidebar facets run it again up to 6 more times (once per active facet dimension,
`getFilteredCoursesForFacets`). Facets also depend on `query`, so every debounced
search keystroke recomputes all of it. Each pass re-derives Sets, re-normalizes
cross-list ids for all 8,641 courses, and (when the time filter is active) calls
`parseTimeRange` on up to 95k section meetings.

Fixes, in order of value:
- Precompute parsed meeting minutes once per catalog load (attach
  `startMinutes`/`endMinutes`/`days[]` to sections at `rowToCourse` time) instead of
  re-parsing strings in every pass.
- Compute all six facet variants in one shared traversal, or memoize the per-facet
  results individually so only the facet whose selection changed recomputes.

### 7. `hideConflicts` re-parses cart meetings once per *section*, not once per cart item
`src/lib/course-filter.ts:180-201`

Inside the per-course/per-section loop, `parseMeetingTimes(cartItem, ...)` is called
for every cartItem x section combination. With a 5-course cart and the filter on,
that's ~475k parse calls per pass. Hoist the parsed cart meetings out of the loop
(parse each cart item once per `filterCourses` call).

### 8. The desktop filter sidebar is mounted and computing on mobile, where it's invisible
`src/app/browse/page.tsx:29-31`

The `<aside>` uses `hidden md:block`, which hides it with CSS only. On phones the
`FilterSidebar` component still mounts, subscribes, and recomputes all facet counts
(finding 6) on every keystroke, purely for a `display: none` subtree. Gate it on a
media query (e.g. render only on `md+` via a `matchMedia` hook) so phones skip the
work entirely. (The mobile Sheet copy in `site-header.tsx` is fine - Radix only
mounts sheet content when opened.)

### 9. `CourseList` rebuilds 8,641 React elements per render and defeats `CourseCard`'s memo
`src/components/course-list.tsx:238-249`, `src/components/course-card.tsx:48`

`courses.map(...)` creates the full element array every render, and
`onMouseEnter={() => prefetchCourseDetail(course.id)}` is a fresh closure per card
per render, so `React.memo` on `CourseCard` never bails out for the visible rows.
Virtualization (virtua) keeps the DOM small, but element creation + memo-miss
re-renders still cost tens of ms per keystroke at this size. Fix: move the prefetch
into `CourseCard` itself (it already receives `course`), or pass a stable callback
that takes the id.

### 10. Facet counts go stale when "Hide closed & waitlisted" is toggled
`src/components/filter-sidebar.tsx:268`

The `facets` useMemo dependency array includes `hideConflicts` but **omits
`hideUnavailable`**, so toggling that checkbox filters the list but leaves every
facet count unchanged until something else recomputes them. One-line fix; this is a
visible UI bug, not just hygiene.

### 11. Hover prefetch does an O(n) scan per mouse-enter and retries known-failed ids
`src/lib/store.ts:287-295`, `src/components/course-list.tsx:64-66`

Every card hover calls `fetchCourseDetail`, which does `courses.find(...)` over 8,641
entries even when the id is already enriched, and `failedDetailIds` is never consulted
as a guard, so a failing id refetches on every hover. Keep a `Map` by id (several
other spots rebuild `new Map(courses.map(...))` ad hoc - `calendar-view.tsx:89`,
`schedule/page.tsx:78`, `schedule-sync.ts:54,119` - one memoized map in the store
would serve them all).

### 12. Catalog load does ~1.4M string comparisons for WIM tagging, twice
`src/lib/store.ts:103-125`, `src/lib/wim-courses.ts:168-182`

`isWimCourse` falls back to iterating all 160 WIM entries (with `split`/`trim` per
entry) for every non-matching course; `rowToCourse` runs it for all 8,641 rows on the
light fetch and again on the full fetch, plus 5 regexes per description for
`isLanguageCourse`. Precompute the expanded WIM id set once at module load (flatten
the `/` cross-listings into the Set) so the check is a single `Set.has`.

---

## P2 - UI / UX issues

### 13. All focus indicators are globally destroyed (accessibility)
`src/app/globals.css:81-89`

```css
*:focus { outline: none; }
*:focus-visible { outline: none; --tw-ring-shadow: none; box-shadow: none; }
```

Keyboard users get no focus indication anywhere except the few components that
explicitly re-add `focus-visible:ring-*` (which win on specificity). Native buttons,
links, checkboxes, the A-Z scrubber, calendar events, filter checkboxes: all
invisible to tab navigation. This fails WCAG 2.4.7 outright. Fix: remove the
`*:focus-visible` reset and only suppress `:focus` (mouse) outlines, or use
`:focus:not(:focus-visible)`.

### 14. Detail page state doesn't reset when navigating course to course
`src/app/courses/[courseId]/course-page-client.tsx:197`

Already flagged in AUDIT.md but worth repeating as the top UI-correctness item here:
`<CourseDetailContent course={course} />` without `key={course.id}` reuses component
state (term carousel index, `selectedUnits`, `previewSection`, active tab) across
different courses, e.g. via the cross-list redirect or in-page search redirect.
`key={course.id}` fixes all of it at once.

### 15. Whole-store subscriptions cause unnecessary re-renders
- `src/components/site-header.tsx:20` - `useAuthStore()` with no selector; the header
  (rendered on every page) re-renders on any auth-store change, including
  `isSigningIn` flips.
- `src/components/calendar-preview-modal.tsx:62-63` - `useCartStore()` /
  `useCourseStore()` destructured with no selector; the open modal re-renders on any
  store change, and `existingItems` does `courses.find` (O(8.6k)) per cart item.
- `src/components/course-evaluations.tsx:511` - same pattern with the evaluation
  store.

Use selectors (`useAuthStore(s => s.user)` etc.) like the rest of the codebase does.

### 16. An analytics beacon fires on every debounced search keystroke
`src/components/search-bar.tsx:26`

`track('search_performed')` fires each time the 250 ms debounce settles, i.e. roughly
per word while typing. Combined with finding 4, each beacon costs two Supabase auth
round trips server-side and an `analytics_events` insert. Track on submit/blur, or
sample.

### 17. Syllabus "validity check" adds a wasted network request per detail view
`src/hooks/use-syllabus-validity.ts:49`

Already flagged in AUDIT.md as meaningless (`no-cors` resolves opaque for nearly any
reachable URL); from the perf side it's also a spurious cross-origin request to
`syllabus.stanford.edu` on every course/term view, and its result drives a
misleading green/amber indicator. Recommend removing the fetch until there's a
server-side check.

### 18. Course detail server page queries Supabase twice per request
`src/app/courses/[courseId]/page.tsx:66-98,205-226`

`generateMetadata` and the page component each call `fetchCourse(decoded)`;
supabase-js calls aren't deduped by Next. Wrap `fetchCourse` in `React.cache()` so a
single render pays for one query. (ISR with `revalidate = 86400` limits the blast
radius, but it's still 2x on every revalidation.)

### 19. ~~`/api/courses?full=1` re-serializes 45.6 MB per request on the server~~ — FIXED
`src/app/api/courses/route.ts:82-83`

The in-memory cache avoids the DB scan, but `NextResponse.json(data)` still
stringifies 45 MB of JSON per request (and holds both light and full copies per
serverless instance). Cache the serialized string (or a gzipped buffer) alongside
the parsed cache, and rely on the existing `s-maxage=900` for the CDN layer.
Longer term this endpoint is the lever for finding 5 (slim the section shape).

### 20. Small items
- `src/components/course-list.tsx:61` - `FILTER_PARAM_KEYS` array is recreated per
  render; trivial, but it belongs at module scope.
- `src/app/schedule/page.tsx:173-183` - `sessionStorage.getItem` + `JSON.parse`
  inside a `useMemo` runs during render on the schedule page; move the cached-hours
  read into an effect/lazy init.
- `src/lib/evaluation-store.ts:68` - `readEvalCache()` (sessionStorage read + full
  JSON.parse of the cache blob) runs on every `fetchBulkEvaluations` call, even when
  everything is already in memory. Hydrate once per session.
- `next.config.mjs` - `script-src` allows `unsafe-eval` + `https://unpkg.com`.
  Tighten before treating this as production.
- `src/lib/rate-limit.ts` - unbounded in-memory map, already flagged in AUDIT.md.
- `e2e/` is an empty directory while Playwright is configured; stale scaffolding.
- The catalog fetch now has a 20s timeout and one retry (`src/lib/catalog-fetch.ts`);
  before that, any hiccup left `/browse` on "Couldn't load courses." with a Retry
  button that re-issued the identical request.

---

## Checked and fine (no action)

- List virtualization (virtua `VList`) with scroll restore and guarded
  `setShowJumpTop` - correct, no re-render per scroll frame.
- Search input debounce (250 ms) and slider debounce (300 ms local state) - correct
  pattern.
- `/api/courses` stampede guard + in-memory TTL cache + stable-ordered pagination -
  solid server-side.
- Batch detail endpoint capped at 50 ids; eval endpoint capped at 50 ids with
  per-user rate limit and `private, no-store`.
- Evaluations bulk fetch dedupes concurrent callers (`bulkInFlight`).
- Cart persists metadata only (`partialize`), not full course payloads - good.
- Detail page dynamic-imports `CourseDetailContent`; browse dynamic-imports the
  sidebar; schedule dynamic-imports the calendar - reasonable code splitting.
- SSR course summary + JSON-LD for SEO with client hide - reasonable pattern.

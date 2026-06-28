# Stanford Root — Student QA findings

QA pass driving the live app as a student (logged-out, which covers ~all of
browse/search/filter/course-detail/cart/schedule/ICS since auth only gates
Supabase sync). Out of scope: `checkout.js`, `test-lab`, Stripe, and the
HumanBehavior analytics wiring (intentional demo scaffolding).

## Bugs found & fixed

### 1. Course detail header showed `UNITS: —` for valid courses — `fix` ce5216b
- **Severity:** medium (wrong/missing info on most variable-unit courses)
- **Repro:** open `/courses/CS106A`. Card and section list show `3-5`, but the
  detail header showed `—`.
- **Root cause:** every CS 106A section has `units: ""`. The header used
  `section?.units ?? course?.units`; `??` keeps the empty string, so
  `parseUnitsOptions("")` → `[]` → `—`. The section card already had a richer
  fallback, which is why only the header was wrong.
- **Fix:** treat blank section units as missing and fall back to course units.
  `src/components/course-detail-content.tsx`.

### 2. Schedule class list showed seconds in meeting times — `fix` 08c7917
- **Severity:** low (cosmetic inconsistency)
- **Repro:** add any class, open `/schedule`; the class list read
  `2:30:00 PM - 3:20:00 PM` while the rest of the UI shows `2:30 PM - 3:20 PM`.
- **Root cause:** section times include seconds; the detail/modal strip them
  but `formatMeetingLine` rendered them raw.
- **Fix:** strip seconds in `formatMeetingLine`. `src/components/calendar-view.tsx`.

### 3. ICS export→import landed classes in the wrong quarter — `fix` 5a4fb67
- **Severity:** high (data corruption on a core feature)
- **Repro:** add a Spring class, Transfer → Export, then re-import the file.
  Before the fix it resolved to a Winter section; a Summer export re-imported as
  Spring; a MWF class split into two "courses" ("Imported 2 courses") that then
  silently collapsed via `addItem`'s dedupe-by-id.
- **Root cause:** `parseICS` inferred each event's term from its date via
  `getCurrentTerm()`, whose month buckets (Jan–Mar=Winter, Apr–Jun=Spring) don't
  match the export's approximate term-start anchors (Spring≈Mar 30, Summer≈Jun 22).
- **Fix:** read the term from the calendar's `X-WR-CALNAME` header (our export
  always writes it) and use it for all events; fall back to the date heuristic for
  foreign ICS files. `src/lib/ics-parser.ts`.

### 4. Course URLs were case/spacing-sensitive (`/courses/cs106a` → Not Found) — `fix` 5923fe6
- **Severity:** medium (shared/typed links 404 on a real course)
- **Repro:** open `/courses/cs106a` or `/courses/CS%20106A` → "Course Not Found"
  even though `/courses/CS106A` works.
- **Root cause:** the page matched the URL id exactly, the detail API is also
  case-sensitive, and the canonical-redirect effect required an exact match first
  and short-circuited on case-only differences.
- **Fix:** resolve the URL id to the canonical catalog course (tolerant of
  casing/spacing and cross-list alternates) and redirect to its real id, showing
  the loader instead of a "not found" flash.
  `src/app/courses/[courseId]/course-page-client.tsx`.

## Verified working (no bugs)
- Search variants (`CS 106A`, `cs106a`, instructor/title), all sidebar filters
  (term/dept/format/level/units/start-time/GER/school/exclude) with sensible
  counts, sort + order, active-filter chips, mobile filter sheet.
- Course detail tabs, term carousel, section/units selection, add/remove,
  cross-list canonical redirect, variable-units gating.
- Schedule calendar render, units + hrs/wk metrics, ICS export content (correct
  weekday anchoring + timezone block), theme toggle, 404, invalid course id.

## Design critiques (not changed — would need a behavior decision)
1. **One source of truth for quarter boundaries.** `getCurrentTerm` (month
   buckets) and `getApproxTermStart` (academic dates) disagree, so late March
   reports "Winter" and late June reports "Spring" even outside ICS. Derive both
   from one boundary table; then bug #3's workaround can become a clean solution.
2. **Normalize blank units at the data layer.** Sections arrive with `units: ""`;
   every consumer re-implements "section units or fall back to course" slightly
   differently (source of bug #1). A single `resolveUnits(section, course)` helper
   (or mapping `""`→`undefined` in `rowToCourse`) removes the footgun.
3. **Format times once.** Seconds are stripped ad-hoc in 3 places via
   `.replace(/:00/g,'')`, which is lossy ("12:00 PM"→"12 PM"). Normalize in
   `parseTimeRange`/a `formatTimeDisplay` helper.
4. **ICS import should dedupe by id+term and count what landed.** Today it dedupes
   by id and the toast over-counts.
5. **Tab labels.** "Charts"/"Comments" for evaluations are vague (README even says
   "Evaluations/Syllabus"); "Ratings"/"Reviews" would be clearer.

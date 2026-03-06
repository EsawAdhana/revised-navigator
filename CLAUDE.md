# Stanford Root — Claude Code Context

## 🚨 CRITICAL RULES & COMMUNICATION
- **NEVER delete files or drop database tables** without explicit confirmation.
- **NEVER commit `.env.local`** or any file containing secrets.
- **Keep responses brief and direct.** Lead with the action or answer, skip the preamble.
- **Show only changed/relevant code.** - **Flag UX tradeoffs** before implementing any feature.
- **Do not modify `src/components/ui/`** (shadcn components) directly.
- **Do not introduce new state management libraries.** Use existing Zustand or nuqs patterns.

## Project Overview
Stanford Root is a course discovery and schedule-planning app for Stanford University students (restricted to `@stanford.edu` Google accounts).

**Key user flows:**
- **Catalog browsing:** Virtualized list, faceted filtering (nuqs), full-text search.
- **Course detail:** Tabbed view with evaluation histograms and syllabus voting.
- **Schedule builder:** Interactive weekly grid, conflict detection, ICS import/export.
- **GER progress:** Tracks requirements based on cart contents.
- **Schedule sync:** User schedules persist to Supabase and sync across devices.

## Tech Stack & Infrastructure

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack dev) |
| Language | TypeScript (strict mode, `@/*` path alias) |
| Backend & Auth | Supabase (Postgres + Auth + RLS) |
| Deployment | Vercel |
| State | Zustand 5 (persist middleware) + nuqs 2.x (URL state) |
| Styling | Tailwind CSS 3 + shadcn/ui + CVA |

*Note: Check `src/types/` for up-to-date database schemas and TypeScript interfaces.*

## Build & Run Commands
```bash
npm install
npm run dev               # Binds to 0.0.0.0 for network access
npm run lint              # Uses ESLint directly (Next 16 CLI workaround)
npx tsc --noEmit          # Type check
npm run build
npm run start

NEXT_PUBLIC_SUPABASE_URL=[https://your-project.supabase.co](https://your-project.supabase.co)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key # Server-side only

Code Style & Conventions
Naming: kebab-case.tsx for files, PascalCase for components, camelCase for functions, UPPER_SNAKE_CASE for constants.

Imports: Always use @/* alias. Group: React/Next → third-party → components → lib → hooks → types.

Components: Use React.memo() for perf-sensitive components. Prefer next/dynamic ({ ssr: false }) for heavy client components.

Styling: Inline Tailwind. Use cn() for conditional classes. Design tokens are HSL CSS variables in globals.css.

Accessibility: Ensure aria-label on icon-only buttons, aria-live="polite" for loading states, and keyboard-first interactions.

Development Philosophy (HCI Focus)
Frontend UX is paramount: Use optimistic updates, skeleton loaders, and stale-while-revalidate patterns to eliminate perceived latency. Never show a blank screen.

Handle backend boilerplate autonomously: Implement API/Supabase plumbing correctly and quickly so human focus can remain on the UI/UX experience.

Respect information hierarchy: Primary data (course code, title, rating) must be scannable. Progressive disclosure for secondary details.

Functional animations only: Animations must communicate state change or guide attention. No purely decorative animations.

Graceful degradation: If external data (evaluations/sync) fails, keep the local UI functional.

Known Quirks & Gotchas
Auth Enforcement: No middleware.ts. @stanford.edu restriction is enforced client-side (AuthGate) and via OAuth hd param.

Course ID Normalization: Course IDs contain spaces. Always use normalizeCourseId() to strip spaces and uppercase for comparison.

WIM GERs: WIM courses are not tagged in catalog data. They are hardcoded in wim-courses.ts and injected at load time.

Cart Hydration: zustand/persist rehydrates asynchronously. Await cartHydrated (from cart-hydration.ts) before pulling server state.

In-Memory Cache: API routes use module-level variables for caching (15m TTL). First request after a cold start will be slow.

Content Security Policy: next.config.mjs has a strict CSP. Do not add external resources without updating this header.
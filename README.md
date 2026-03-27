# Stanford Root

A course discovery and schedule-planning web application for Stanford undergraduates. Built with Next.js 16 (App Router), Zustand 5, nuqs, and Supabase.

## Features

- **Catalog** — Browse 8,000+ courses with faceted filtering (department, term, format, level, GER, school, unit/time-range sliders), debounced search, and virtualized rendering via `virtua`.
- **Course Detail** — Tabbed content (Overview, Evaluations, Syllabus), section and unit selects, color picker, and add-to-cart.
- **Schedule Builder** — Weekly calendar grid, term navigation, ICS import/export, optional meeting toggles, color pickers, and GER progress tracking.
- **Auth** — Google OAuth via Supabase. For local development, copy your Supabase and OAuth settings into `.env.local` and run `npm run dev`, then sign in with Google.

## Tech Stack

| Layer          | Technology                                    |
|----------------|-----------------------------------------------|
| Framework      | Next.js 16 (App Router)                       |
| UI             | React 19, Radix UI, Tailwind CSS              |
| State          | Zustand 5 (client), nuqs (URL-synced filters) |
| Backend        | Supabase (Postgres + RLS + Auth)              |
| Virtualization | virtua                                        |

## Scripts

| Command         | Description          |
|-----------------|----------------------|
| `npm run dev`   | Dev server           |
| `npm run build` | Production build     |
| `npm run lint`  | ESLint               |

## License

ISC

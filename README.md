# Stanford Root

A course discovery and schedule-planning web application for Stanford undergraduates. Built with Next.js 16 (App Router), Zustand 5, nuqs, and Supabase.

## Features

- **Catalog** — Browse 8,000+ courses with faceted filtering (department, term, format, level, GER, school, unit/time-range sliders), debounced search, and virtualized rendering via `virtua`.
- **Course Detail** — Tabbed content (Overview, Evaluations, Syllabus), section and unit selects, color picker, and add-to-cart.
- **Schedule Builder** — Weekly calendar grid, term navigation, ICS import/export, optional meeting toggles, color pickers, and GER progress tracking.
- **Auth** — Google OAuth via Supabase, or fuzz mode via `env.example.fuzz` when using `npm run dev`.

## Tech Stack

| Layer          | Technology                                    |
|----------------|-----------------------------------------------|
| Framework      | Next.js 16 (App Router)                       |
| UI             | React 19, Radix UI, Tailwind CSS              |
| State          | Zustand 5 (client), nuqs (URL-synced filters) |
| Backend        | Supabase (Postgres + RLS + Auth)              |
| Virtualization | virtua                                        |
| Testing        | Playwright (fuzzing harnesses)                |

## Project Context

This application is the target system for Stanford's CS 295 (Software Engineering) project evaluating **invariant-based oracle fuzzing** for GUI bug detection. Two Playwright-driven fuzzers — a crash-only baseline and an invariant oracle fuzzer — exercise the app's interactive surfaces to compare bug-finding effectiveness.

See [fuzzing/README.md](fuzzing/README.md) for fuzzing setup and reproduction instructions.

## Scripts

| Command             | Description                                  |
|---------------------|----------------------------------------------|
| `npm run dev`       | Dev server (`env.example.fuzz`)              |
| `npm run dev:auth`  | Dev server (`.env.local`, OAuth)             |
| `npm run build`     | Production build                             |
| `npm run lint`      | ESLint                                       |
| `npm run fuzz:all`  | Run both production fuzzers sequentially     |
| `npm run toy:serve` | Serve the toy evaluation app on port 3001    |

## License

ISC

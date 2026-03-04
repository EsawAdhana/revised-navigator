# Stanford Root — Claude Code Context

## Project
Stanford Root is a course discovery app for Stanford students. Users can search for classes and view course reviews and details.

## Tech Stack
- **Frontend**: Next.js (App Router, `src/` directory)
- **Backend**: Supabase (Postgres + Auth)
- **Deployment**: Vercel
- **State**: Zustand (per-feature stores), nuqs (URL query state)
- **Styling**: Tailwind CSS, shadcn/ui (Radix UI primitives), `cn()` utility
- **Icons**: lucide-react
- **Toasts**: sonner
- **Auth**: Supabase Auth (Google OAuth provider, `@stanford.edu` emails only)
- **Types**: TypeScript strict mode

## Project Structure
```
src/
├── app/          # Next.js App Router pages + API routes
├── components/   # React components (kebab-case filenames)
│   └── ui/       # shadcn/ui components — don't modify directly
├── lib/          # Supabase client, Zustand stores, utilities
├── hooks/        # Custom React hooks
└── types/        # Shared TypeScript interfaces (course.ts)
```

## Conventions
- **Files**: kebab-case (`course-card.tsx`, `auth-store.ts`)
- **Components**: PascalCase exports, `React.memo()` for perf-sensitive ones
- **Functions/vars**: camelCase; constants `UPPER_SNAKE_CASE`
- **Imports**: Use `@/*` path alias (e.g., `import { cn } from '@/lib/utils'`)
- **Types**: Defined in `src/types/`, imported with `import type { ... }`
- **Supabase browser**: `createBrowserClient()` from `@supabase/ssr`
- **Supabase server/API**: service role key, `persistSession: false`
- **RLS**: Always consider Row Level Security policies when creating or modifying database interactions
- **Styling**: Tailwind classes inline; `cn()` for conditionals; CVA for variants
- **Error handling**: try/catch with `console.error`, set safe fallback state
- **Data loading**: Two-phase pattern (light load → background enrichment), session storage cache with TTL

## Do's
- Reuse existing stores, hooks, and utilities before creating new ones
- Keep components memoized where appropriate (`React.memo`, `useMemo`, `useCallback`)
- Use nuqs for any filter/search state that should be URL-shareable
- Follow existing shadcn/ui patterns for new UI components

## Don'ts
- **Never delete files or drop database tables** — destructive actions require explicit confirmation
- Don't break or modify the Supabase auth flow without clear instruction
- Don't make changes that harm the user experience — flag UX tradeoffs before implementing
- Don't modify `src/components/ui/` shadcn components directly
- Don't add unnecessary complexity or abstractions

## Communication
- Keep responses brief and direct
- Lead with the action or answer, skip preamble
- Show only changed/relevant code

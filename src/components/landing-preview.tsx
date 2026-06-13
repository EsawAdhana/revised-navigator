import { Search, CalendarDays } from 'lucide-react'
import { getCurrentTerm } from '@/lib/terms'

type PreviewCourse = {
  code: string
  title: string
  units: string
  rating: number
  instructor: string
  terms: string
}

const COURSES: PreviewCourse[] = [
  { code: 'CS 106A', title: 'Programming Methodology', units: '5', rating: 4.7, instructor: 'M. Sahami', terms: 'Aut, Win' },
  { code: 'ECON 1', title: 'Principles of Economics', units: '5', rating: 4.2, instructor: 'M. Clerici-Arias', terms: 'Aut, Spr' },
  { code: 'CS 161', title: 'Design and Analysis of Algorithms', units: '5', rating: 3.8, instructor: 'N. Anari', terms: 'Win' },
  { code: 'PSYCH 1', title: 'Introduction to Psychology', units: '4', rating: 4.6, instructor: 'R. Poldrack', terms: 'Spr' },
]

// Mirrors getRatingColor in course-card.tsx
function ratingColor(rating: number): string {
  if (rating >= 4.5) return 'text-emerald-600 dark:text-emerald-400'
  if (rating >= 3.5) return 'text-amber-600 dark:text-amber-400'
  if (rating >= 2.5) return 'text-orange-500 dark:text-orange-400'
  return 'text-red-500 dark:text-red-400'
}

function PreviewCard({ course }: { course: PreviewCourse }) {
  return (
    <div className="w-full rounded-xl bg-card border border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.03)] px-4 py-3.5">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[15px] font-bold tabular-nums text-destructive font-[family-name:var(--font-outfit)]">
          {course.code}
        </span>
        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-1 whitespace-nowrap">
            <span className="text-[13px] font-extrabold tabular-nums font-[family-name:var(--font-outfit)] leading-none">{course.units}</span>
            <span className="text-[13px] font-semibold tracking-tight leading-none">Units</span>
          </div>
          <div className={`text-[13px] font-semibold mt-0.5 ${ratingColor(course.rating)}`}>
            {course.rating.toFixed(1)}/5.0
          </div>
        </div>
      </div>
      <h3 className="font-semibold text-[16px] leading-tight text-foreground line-clamp-2 mb-3">
        {course.title}
      </h3>
      <div className="flex items-center justify-between gap-3 text-foreground pt-2.5 border-t border-border/30">
        <span className="text-[13px] text-muted-foreground truncate">{course.instructor}</span>
        <span className="text-[13px] font-medium text-right whitespace-nowrap">{course.terms}</span>
      </div>
    </div>
  )
}

function MiniCalendar() {
  const days = ['M', 'T', 'W', 'T', 'F']
  return (
    <div className="w-64 rounded-xl border border-border bg-card shadow-2xl p-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-foreground font-[family-name:var(--font-outfit)]">{getCurrentTerm()}</span>
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-5 gap-1 mb-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {days.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-5 gap-1 h-36">
        {/* Mon */}
        <div className="rounded bg-secondary/30 p-0.5 flex flex-col gap-1">
          <div className="mt-2 rounded border bg-sky-500/15 border-sky-500/40 text-sky-950 dark:text-sky-50 px-1 py-1 text-[7px] font-semibold leading-tight">CS 106A</div>
        </div>
        {/* Tue */}
        <div className="rounded bg-secondary/30 p-0.5 flex flex-col gap-1">
          <div className="mt-6 rounded border bg-emerald-500/15 border-emerald-500/40 text-emerald-950 dark:text-emerald-50 px-1 py-1 text-[7px] font-semibold leading-tight">CS 161</div>
        </div>
        {/* Wed */}
        <div className="rounded bg-secondary/30 p-0.5 flex flex-col gap-1">
          <div className="mt-2 rounded border bg-sky-500/15 border-sky-500/40 text-sky-950 dark:text-sky-50 px-1 py-1 text-[7px] font-semibold leading-tight">CS 106A</div>
        </div>
        {/* Thu */}
        <div className="rounded bg-secondary/30 p-0.5 flex flex-col gap-1">
          <div className="mt-6 rounded border bg-emerald-500/15 border-emerald-500/40 text-emerald-950 dark:text-emerald-50 px-1 py-1 text-[7px] font-semibold leading-tight">CS 161</div>
        </div>
        {/* Fri */}
        <div className="rounded bg-secondary/30 p-0.5 flex flex-col gap-1">
          <div className="mt-10 rounded border bg-violet-500/15 border-violet-500/40 text-violet-950 dark:text-violet-50 px-1 py-1 text-[7px] font-semibold leading-tight">PSYCH 1</div>
        </div>
      </div>
    </div>
  )
}

/** Static, non-interactive preview of the real app UI, used on the landing page.
 *  Mirrors course-card.tsx and the calendar palette so it reads as a genuine product shot. */
export function LandingPreview() {
  return (
    <div className="pointer-events-none relative mx-auto w-full max-w-5xl">
      {/* App window */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        {/* Window top bar */}
        <div className="flex items-center gap-3 border-b border-border/60 bg-secondary/40 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </div>
          <div className="flex-1 max-w-sm">
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              Search courses...
            </div>
          </div>
        </div>

        {/* Body: filter rail + course list */}
        <div className="flex">
          <aside className="hidden w-48 shrink-0 space-y-5 border-r border-border/50 p-4 sm:block">
            {[
              { label: 'Department', items: ['Computer Science', 'Economics', 'Psychology'] },
              { label: 'Term', items: ['Autumn', 'Winter', 'Spring'] },
            ].map((group) => (
              <div key={group.label}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</div>
                <div className="space-y-1.5">
                  {group.items.map((it, idx) => (
                    <div key={it} className="flex items-center gap-2 text-[12px] text-foreground/80">
                      <span className={`h-3 w-3 rounded-sm border ${idx === 0 ? 'border-primary bg-primary' : 'border-border'}`} />
                      {it}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <div className="flex-1 space-y-2.5 bg-secondary/20 p-3 sm:p-4">
            {COURSES.map((c) => (
              <PreviewCard key={c.code} course={c} />
            ))}
          </div>
        </div>
      </div>

      {/* Calendar card peeking in the corner — non-interactive so it can't block hero CTAs */}
      <div className="pointer-events-none absolute -bottom-10 -right-4 z-0 hidden md:block">
        <MiniCalendar />
      </div>
    </div>
  )
}

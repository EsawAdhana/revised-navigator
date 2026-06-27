import { Search, MessageSquareText, CalendarDays } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Capability = {
  icon: LucideIcon
  title: string
  description: string
}

const CAPABILITIES: Capability[] = [
  {
    icon: Search,
    title: 'Search every course',
    description:
      'The full catalog in one place — units, terms, and instructors at a glance across every department.',
  },
  {
    icon: MessageSquareText,
    title: 'Read real evaluations',
    description:
      'See genuine student course evaluations and ratings so you know what a class is like before you enroll.',
  },
  {
    icon: CalendarDays,
    title: 'Build your schedule',
    description:
      'Plan a conflict-free week and see exactly where each class lands before you commit.',
  },
]

/** Grounded, restrained summary of what the product does, shown on the landing page. */
export function LandingPreview() {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 sm:grid-cols-3">
      {CAPABILITIES.map(({ icon: Icon, title, description }) => (
        <div
          key={title}
          className="rounded-xl border border-border/50 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      ))}
    </div>
  )
}

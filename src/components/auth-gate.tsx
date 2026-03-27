'use client'

import React, { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useSyncSchedule } from '@/hooks/use-sync-schedule'
import { Logo } from './logo'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'



function MarqueeRow({ items, duration, reverse = false }: { items: string[], duration: string, reverse?: boolean }) {
  return (
    <div className="flex overflow-hidden whitespace-nowrap select-none">
      <div
        className={reverse ? 'animate-marquee-reverse' : 'animate-marquee'}
        style={{ animationDuration: duration }}
      >
        <div className="flex gap-3 pr-3">
          {[...items, ...items].map((text, i) => (
            <span
              key={i}
              className="inline-block rounded-full border border-border/40 bg-background/80 px-4 py-1.5 text-base sm:text-lg text-muted-foreground/40 font-medium whitespace-nowrap"
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, initialize, signInWithGoogle } = useAuthStore()
  useSyncSchedule()

  useEffect(() => {
    const unsubscribe = initialize()
    return () => {
      unsubscribe()
    }
  }, [initialize])

  if (user) {
    return <>{children}</>
  }

  // If loading or not logged in, show Landing Page.
  // This ensures bots always see content.

  // Extended phrase list for variety
  const ALL_PHRASES = [
    'Find courses.', 'Read syllabi.', 'Browse evaluations.', 'Build your schedule.',
    'Filter by WAYS.', 'Organize your week.', 'Compare sections.', 'Check course status.',
    'Explore departments.', 'Read student reviews.', 'Search by instructor.',
    'Filter by units.', 'View meeting times.', 'Export to calendar.',
    'Ace your quarter.', 'Plan in seconds.', 'Visualize your week.',
    'Discover gems.', 'Avoid 8am classes.', 'Simplifying Stanford.',
    'Search historically.', 'Review professors.', 'Mockup schedules.', 'Explore majors.',
    'Unit planning.', 'Search efficiently.', 'Fast & responsive.', 'Mobile friendly.',
    'Visualize workload.', 'Balance your life.', 'Curate your classes.', 'Map your term.',
  ]

  // Create 15 rows of deterministic content to allow SSR consistency
  const rows = Array.from({ length: 15 }, (_, i) => {
    // Simple deterministic rotation based on row index
    const offset = (i * 7) % ALL_PHRASES.length
    return [...ALL_PHRASES.slice(offset), ...ALL_PHRASES.slice(0, offset)].slice(0, 12)
  })

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20">

      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center min-h-[90vh] overflow-hidden">

        {/* Scrolling text background — fills entire screen edge-to-edge */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between -my-2 sm:-my-8 opacity-[0.4] dark:opacity-[0.25]">
          {rows.map((rowItems, i) => (
            <MarqueeRow
              key={i}
              items={rowItems}
              // Deterministic duration based on index
              duration={`${40 + (i % 3) * 5 + (i * 0.5)}s`}
              reverse={i % 2 === 1}
            />
          ))}
        </div>

        {/* Center fade overlay so text is readable */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(var(--background))_0%,_transparent_80%)] sm:bg-[radial-gradient(ellipse_at_center,_hsl(var(--background))_20%,_transparent_100%)]" />

        {/* Hero Content */}
        <div className="relative z-10 flex flex-col items-center px-6 py-8 sm:py-0 animate-fade-in-up text-center max-w-4xl mx-auto">
          <div className="mb-6 sm:mb-8 relative group w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
            <div className="absolute -inset-2 bg-primary/40 rounded-full blur-xl opacity-20 group-hover:opacity-60 transition duration-500" />
            <Logo className="w-full h-full relative rounded-2xl shadow-2xl object-cover" />
          </div>

          <h1 className="text-5xl sm:text-7xl font-[family-name:var(--font-outfit)] font-bold tracking-tight leading-[1.1] text-foreground mb-6">
            Everything <span className="text-primary">Stanford</span>,
            <br />
            in one place.
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground/80 max-w-2xl leading-relaxed font-light mb-10 sm:text-balance text-center mx-auto px-4 sm:px-0">
            The ultimate tool for course
            <br className="block sm:hidden" />
            <span className="hidden sm:inline"> </span>
            discovery and scheduling.
          </p>

          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            {isLoading ? (
              <button disabled className="w-full flex items-center justify-center gap-3 rounded-xl bg-muted text-muted-foreground px-8 py-3.5 sm:py-4 font-semibold text-[15px]">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Checking session...</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="w-full relative group flex items-center justify-center gap-3 rounded-xl bg-foreground text-background px-8 py-3.5 sm:py-4 font-semibold text-[15px] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
              >
                <span>Log in with Stanford</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 px-6 border-t border-border/40 bg-muted/20">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-12 text-xs font-medium text-muted-foreground/60">


          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>

          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>

          <span className="" suppressHydrationWarning>
            &copy; {new Date().getFullYear()} Stanford Root
          </span>
        </div>
      </footer>

    </div>
  )
}

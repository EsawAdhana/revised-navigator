import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { HeroActions } from '@/components/hero-actions';
import { LandingRedirect } from '@/components/landing-redirect';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata: Metadata = {
  title: 'Stanford Root — Search every Stanford course and evaluation',
  description:
    "Browse Stanford's full course catalog, read real student course evaluations, and build a conflict-free weekly schedule.",
  alternates: { canonical: '/' },
};

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <LandingRedirect />
      {/* Top bar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 sm:px-8 h-16">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="font-display text-xl font-semibold tracking-tight text-foreground">
            Stanford Root
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-6 pb-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="animate-fade-in-up text-balance text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
            Every Stanford course and evaluation, in one search.
          </h1>
          <p className="animate-fade-in-up mx-auto mt-5 max-w-xl text-balance text-lg leading-relaxed text-muted-foreground">
            Browse the full course catalog, read real student course evaluations, and build a
            conflict-free weekly schedule.
          </p>
          <div className="relative z-10 mt-8 flex justify-center">
            <HeroActions />
          </div>
          <p className="mt-5 text-sm text-muted-foreground/80">
            Built on Stanford&rsquo;s official course catalog and student evaluations.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-2 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:gap-6">
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
          </div>
          <span>&copy; {new Date().getFullYear()} Stanford Root. All rights reserved.</span>
        </div>
      </footer>
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { HeroActions } from '@/components/hero-actions';
import { ThemeToggle } from '@/components/theme-toggle';
import { LandingPreview } from '@/components/landing-preview';

export const metadata: Metadata = {
  title: 'Stanford Root — A better way to browse Stanford courses',
  description:
    "Explore Stanford's full course catalog, read student evaluations, and build your weekly schedule — fast, clean, and free.",
};

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 sm:px-8 h-16">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight text-foreground font-[family-name:var(--font-outfit)]">
            Stanford Root
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-6 pt-14 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="animate-fade-in-up text-balance text-4xl font-bold tracking-tight text-foreground sm:text-6xl font-[family-name:var(--font-outfit)]">
            A better way to browse{' '}
            <span className="text-primary">Stanford courses</span>
          </h1>
          <p className="animate-fade-in-up mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground">
            Search the catalog, read real student evaluations, and build your weekly schedule —
            all in one fast, clean, and free place.
          </p>
          <div className="animate-fade-in-up relative z-10 mt-10 flex justify-center">
            <HeroActions />
          </div>
        </div>

        {/* Product preview */}
        <div className="mt-16 px-2 pb-24 sm:mt-20">
          <LandingPreview />
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/40 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Stanford Root. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

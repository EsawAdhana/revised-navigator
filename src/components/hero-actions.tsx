'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StanfordLoginButton } from '@/components/stanford-login-button'

/** Guest-only CTAs on the landing page. Signed-in users are redirected to /browse in middleware. */
export function HeroActions() {
  return (
    <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3">
      <Button
        asChild
        size="lg"
        className="h-12 px-7 text-base font-semibold rounded-lg shadow-sm transition-colors"
      >
        <Link href="/browse">
          Browse courses
          <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
      <StanfordLoginButton
        source="hero"
        returnPath="/browse"
        variant="outline"
        size="lg"
        signingInLabel="Redirecting to Stanford…"
        className="h-12 px-7 text-base font-semibold rounded-lg border-border/70 hover:bg-secondary/60 transition-colors gap-2"
      />
    </div>
  )
}

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
        className="h-12 px-7 text-base font-semibold rounded-full font-[family-name:var(--font-outfit)] shadow-sm hover:shadow-md transition-all hover:scale-[1.02] active:scale-[0.99]"
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
        className="h-12 px-7 text-base font-semibold rounded-full border-border/70 hover:bg-secondary/60 transition-all hover:scale-[1.02] active:scale-[0.99] gap-2"
      />
    </div>
  )
}

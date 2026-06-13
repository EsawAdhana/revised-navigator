'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/auth-store'
import { track } from '@/lib/analytics'

export function HeroActions() {
  const signInWithGoogle = useAuthStore(state => state.signInWithGoogle)

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
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
      <Button
        variant="outline"
        size="lg"
        onClick={() => { track('login_started', { source: 'hero' }); signInWithGoogle(); }}
        className="h-12 px-7 text-base font-semibold rounded-full border-border/70 hover:bg-secondary/60 transition-all hover:scale-[1.02] active:scale-[0.99]"
      >
        Log in with Stanford
      </Button>
    </div>
  )
}

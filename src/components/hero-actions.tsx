'use client'

import Link from 'next/link'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/auth-store'
import { track } from '@/lib/analytics'

export function HeroActions() {
  const { user, isLoading, signInWithGoogle } = useAuthStore()

  const handleLogin = () => {
    track('login_started', { source: 'hero' })
    // Land on /browse after OAuth so the header reflects the signed-in session.
    void signInWithGoogle('/browse')
  }

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

      {user ? (
        <Button
          asChild
          variant="outline"
          size="lg"
          className="h-12 px-7 text-base font-semibold rounded-full border-border/70 hover:bg-secondary/60 transition-all hover:scale-[1.02] active:scale-[0.99]"
        >
          <Link href="/schedule">
            <CalendarDays className="mr-1.5 h-4 w-4" />
            View schedule
          </Link>
        </Button>
      ) : !isLoading ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={handleLogin}
          className="h-12 px-7 text-base font-semibold rounded-full border-border/70 hover:bg-secondary/60 transition-all hover:scale-[1.02] active:scale-[0.99]"
        >
          Log in with Stanford
        </Button>
      ) : null}
    </div>
  )
}

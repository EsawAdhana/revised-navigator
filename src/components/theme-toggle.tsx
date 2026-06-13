'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="rounded-full h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all"
    >
      {/* Render a stable icon until mounted to avoid hydration mismatch */}
      {mounted && isDark ? (
        <Sun className="h-5 w-5 md:h-[1.1rem] md:w-[1.1rem]" />
      ) : (
        <Moon className="h-5 w-5 md:h-[1.1rem] md:w-[1.1rem]" />
      )}
    </Button>
  )
}

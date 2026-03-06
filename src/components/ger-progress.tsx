'use client'

import React, { memo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useGerProgress } from '@/hooks/use-ger-progress'
import { GER_CATEGORIES } from '@/lib/ger-requirements'
import type { GerProgress as GerProgressItem } from '@/hooks/use-ger-progress'

function RequirementRow({ item }: { item: GerProgressItem }) {
  const { requirement: req, fulfilled, contributingCourses } = item
  const isComplete = fulfilled >= req.required
  const pct = req.required > 0 ? Math.min(fulfilled / req.required, 1) : 0
  const fraction = req.type === 'units'
    ? `${fulfilled}/${req.required}u`
    : `${fulfilled}/${req.required}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 py-1 cursor-default">
          <span className={cn(
            'w-14 shrink-0 text-[11px] font-medium truncate',
            isComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
          )}>
            {req.shortLabel}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                isComplete ? 'bg-emerald-500' : 'bg-primary/50'
              )}
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">
            {fraction}
          </span>
          {isComplete ? (
            <Check size={12} className="text-emerald-500 shrink-0" />
          ) : (
            <div className="w-3 shrink-0" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-[220px]">
        <p className="font-medium text-xs mb-1">{req.label}</p>
        {contributingCourses.length > 0 ? (
          <p className="text-xs text-muted-foreground">{contributingCourses.join(', ')}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No courses added yet</p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

const GerProgress = memo(function GerProgress() {
  const [open, setOpen] = useState(false)
  const { items, totalRequired, totalFulfilled } = useGerProgress()

  const byCategory = GER_CATEGORIES.map(cat => ({
    category: cat,
    items: items.filter(i => i.requirement.category === cat),
  }))

  return (
    <TooltipProvider delayDuration={300}>
      <div className="rounded-xl border bg-card overflow-hidden">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
        >
          <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            GERs
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {totalFulfilled}/{totalRequired} done
            </span>
            <ChevronDown
              size={14}
              className={cn('text-muted-foreground transition-transform', open && 'rotate-180')}
            />
          </div>
        </button>

        {open && (
          <div className="px-3 pb-3 pt-1 space-y-2 border-t">
            {byCategory.map(({ category, items: catItems }) => (
              <div key={category}>
                <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground/70 mb-1 mt-2">
                  {category}
                </p>
                {catItems.map(item => (
                  <RequirementRow key={item.requirement.id} item={item} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
})

export { GerProgress }

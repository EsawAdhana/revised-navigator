'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VList, VListHandle } from 'virtua';
import { useCourseStore } from '@/lib/store';
import { useFilteredCourses } from '@/hooks/use-filtered-courses';
import { CourseCard } from './course-card';
import { Course } from '@/types/course';
import { SearchX, Loader2, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { ActiveFilterChips } from './active-filter-chips';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
interface CourseListProps {
  onCourseClick: (course: Course) => void;
}



// One option per criterion; direction toggled by the button (Quality defaults to high first)
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'az', label: 'A-Z (Default)' },
  { value: 'units', label: 'Units' },
  { value: 'hours', label: 'Hours/Wk' },
  { value: 'quality', label: 'Course Rating' },
  { value: 'hours_per_unit', label: 'Difficulty (Hours/Unit)' },
]

function getDirectionLabel(sortBy: string, sortDir: string): string {
  if (sortBy === 'az') return sortDir === 'asc' ? 'A to Z' : 'Z to A'
  return sortDir === 'asc' ? 'Low to high' : 'High to low'
}

const SCROLL_THRESHOLD = 200

export function CourseList({ onCourseClick }: CourseListProps) {
  const { fetchCourses } = useCourseStore();
  const { courses, isLoading, isSortLoading, sortBy, setSortBy, sortDir, setSortDir, getSortDisplayValue } = useFilteredCourses();
  const vListRef = useRef<VListHandle>(null)
  const [scrollOffset, setScrollOffset] = useState(0)

  const isValidSortBy = SORT_OPTIONS.some((o) => o.value === sortBy)
  const displaySortValue = isValidSortBy ? sortBy : 'az'

  useEffect(() => {
    if (isSortLoading || courses.length === 0) setScrollOffset(0)
  }, [isSortLoading, courses.length])

  // Map letter -> first index for A-Z scrubber (only when sorted A-Z)
  const letterToIndex = useMemo(() => {
    if (displaySortValue !== 'az') return null
    const map = new Map<string, number>()
    courses.forEach((c, i) => {
      const firstChar = (c.subject || c.code || '')[0]?.toUpperCase()
      const letter = /[A-Z]/.test(firstChar) ? firstChar : '#'
      if (!map.has(letter)) map.set(letter, i)
    })
    return map
  }, [courses, displaySortValue])

  // Only letters that have courses, sorted (# first, then A-Z)
  const existingLetters = useMemo(() => {
    if (!letterToIndex) return []
    const letters = Array.from(letterToIndex.keys())
    return letters.sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)))
  }, [letterToIndex])

  const [scrubberExpanded, setScrubberExpanded] = useState(false)

  const scrollToLetter = useCallback((letter: string) => {
    const index = letterToIndex?.get(letter)
    if (index != null && vListRef.current) {
      vListRef.current.scrollToIndex(index, { align: 'start' })
    }
  }, [letterToIndex])

  const handleSortChange = (value: string) => {
    setSortBy(value)
  }

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);


  if (isLoading) {
    return (
      <div className="flex-1 h-full w-full overflow-hidden flex flex-col relative">
        <div className="shrink-0 border-b border-border/30 bg-background z-10 flex items-center gap-1 flex-nowrap py-2 pl-2 pr-2">
          <div className="h-7 w-[182px] rounded-md bg-muted/50 animate-pulse" />
          <div className="h-7 w-20 rounded-md bg-muted/50 animate-pulse" />
          <div className="flex-1" />
          <div className="h-5 w-16 rounded bg-muted/50 animate-pulse" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden p-2 space-y-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full w-full overflow-hidden flex flex-col relative">
      {/* Results bar: one line when possible; chips wrap to second line only when necessary */}
      <div className="shrink-0 overflow-hidden border-b border-border/30 bg-background z-10 flex items-center gap-1 flex-nowrap py-2 px-4 text-xs font-medium text-muted-foreground transition-all duration-300 leading-normal min-w-0">
        <span className="shrink-0 text-muted-foreground leading-7">Sort by</span>
        <Select value={displaySortValue} onValueChange={handleSortChange} disabled={isLoading}>
          <SelectTrigger className="h-7 min-h-7 w-[182px] shrink-0 text-xs border-border/60 bg-white dark:bg-background text-primary font-medium px-2 py-1.5" aria-label="Sort by">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortDir} onValueChange={(v) => setSortDir(v === 'desc' ? 'desc' : 'asc')} disabled={isLoading}>
          <SelectTrigger className="h-7 min-h-7 w-fit min-w-[5rem] shrink-0 text-xs border-border/60 bg-white dark:bg-background text-primary font-medium px-2 py-1.5" aria-label="Sort direction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc" className="text-xs">{getDirectionLabel(sortBy, 'asc')}</SelectItem>
            <SelectItem value="desc" className="text-xs">{getDirectionLabel(sortBy, 'desc')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="min-w-0 flex-1 flex flex-wrap gap-1.5 items-center">
          <ActiveFilterChips />
        </div>
        <div className="shrink-0 flex items-center gap-1.5 whitespace-nowrap min-w-0 justify-end">
          <span className="text-xs tabular-nums font-semibold text-foreground/70 leading-7">
            {courses.length.toLocaleString()} classes
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative group overflow-hidden">
        {isSortLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm font-medium tracking-tight">Loading classes…</p>
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <SearchX size={32} className="text-muted-foreground/30" />
            <p className="text-sm font-medium">No courses match your filters.</p>
            <p className="text-xs text-muted-foreground/60">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <>
            {/* Sticky jump-to-top button — visible when scrolled down, stays fixed in corner */}
            {scrollOffset > SCROLL_THRESHOLD && (
              <button
                type="button"
                onClick={() => vListRef.current?.scrollTo(0)}
                className="absolute top-0 right-0 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-bl-md bg-primary text-primary-foreground text-xs font-medium shadow-md hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring animate-in fade-in slide-in-from-top-2 duration-200"
                aria-label="Jump to top"
              >
                <ArrowUp size={14} strokeWidth={2.5} />
                <span>Top</span>
              </button>
            )}
            <VList
              ref={vListRef}
              className="h-full w-full scrollbar-hide pb-4 px-4"
              onScroll={(offset) => setScrollOffset(offset)}
            >
              {courses.map((course) => (
                <div key={course.id} className="w-full">
                  <CourseCard
                    course={course}
                    sortDisplayValue={getSortDisplayValue(course)}
                    onClick={() => onCourseClick(course)}
                  />
                </div>
              ))}
            </VList>

            {/* A-Z scrubber: collapsed icon expands to full letter strip */}
            {letterToIndex && existingLetters.length > 0 && (
              <>
                {scrubberExpanded ? (
                  <div
                    role="navigation"
                    aria-label="Jump to letter"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-row items-center gap-2 animate-in fade-in duration-200"
                  >
                    <button
                      type="button"
                      onClick={() => setScrubberExpanded(false)}
                      className="w-7 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] transition-all duration-200"
                      aria-label="Collapse A–Z index"
                    >
                      <ChevronRight size={16} strokeWidth={2} />
                    </button>
                    <div className="py-1.5 px-1 flex flex-col items-center gap-0.5 rounded-xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-border/40 shadow-lg shadow-black/5 ring-1 ring-black/5 dark:ring-white/5">
                      {existingLetters.map((letter) => (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => scrollToLetter(letter)}
                          className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          aria-label={`Jump to ${letter === '#' ? 'numbers/symbols' : letter}`}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setScrubberExpanded(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] transition-all duration-200"
                    aria-label="Open A–Z index"
                  >
                    <ChevronLeft size={16} strokeWidth={2} />
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

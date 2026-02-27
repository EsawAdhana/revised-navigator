'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VList, VListHandle } from 'virtua';
import { useCourseStore } from '@/lib/store';
import { useFilteredCourses } from '@/hooks/use-filtered-courses';
import { CourseCard } from './course-card';
import { Course } from '@/types/course';
import { SearchX, ArrowUp } from 'lucide-react';
import { ActiveFilterChips } from './active-filter-chips';
const SCROLL_THRESHOLD = 200;

interface CourseListProps {
  onCourseClick: (course: Course) => void;
}

export function CourseList({ onCourseClick }: CourseListProps) {
  const { fetchCourses } = useCourseStore();
  const { courses, isLoading, getSortDisplayValue, getRatingForCourse } = useFilteredCourses();
  const vListRef = useRef<VListHandle>(null)
  const [scrollOffset, setScrollOffset] = useState(0)

  // Map letter -> first index for A-Z scrubber
  const letterToIndex = useMemo(() => {
    const map = new Map<string, number>()
    courses.forEach((c, i) => {
      const firstChar = (c.subject || c.code || '')[0]?.toUpperCase()
      const letter = /[A-Z]/.test(firstChar) ? firstChar : '#'
      if (!map.has(letter)) map.set(letter, i)
    })
    return map
  }, [courses])

  // Only letters that have courses, sorted (# first, then A-Z)
  const existingLetters = useMemo(() => {
    if (!letterToIndex) return []
    const letters = Array.from(letterToIndex.keys())
    return letters.sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)))
  }, [letterToIndex])

  const scrollToLetter = useCallback((letter: string) => {
    const index = letterToIndex?.get(letter)
    if (index != null && vListRef.current) {
      vListRef.current.scrollToIndex(index, { align: 'start' })
    }
  }, [letterToIndex])

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);


  if (isLoading) {
    return (
      <div className="flex-1 h-full w-full overflow-hidden flex flex-col relative">
        <div className="shrink-0 border-b border-border/30 bg-background z-10 flex items-center gap-1 flex-nowrap py-2 pl-2 pr-2">
          <div className="h-7 flex-1 rounded-md bg-muted/50 animate-pulse" />
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
      {/* Results bar */}
      <div className="shrink-0 overflow-hidden border-b border-border/30 bg-background z-10 py-2 px-2 sm:px-4 text-xs font-medium text-muted-foreground transition-all duration-300 leading-normal">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-1 min-w-0">
          <div className="flex flex-row flex-wrap items-center gap-2 min-w-0 w-full sm:flex-1 sm:flex-nowrap sm:justify-between">
            <div className="min-w-0 flex-1 flex flex-row flex-wrap gap-2 items-center overflow-hidden">
              <ActiveFilterChips />
            </div>
            <span className="shrink-0 text-xs tabular-nums font-semibold text-foreground/70 leading-7 whitespace-nowrap">
              {courses.length.toLocaleString()} classes
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {courses.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <SearchX size={32} className="text-muted-foreground/30" />
            <p className="text-sm font-medium">No courses match your filters.</p>
            <p className="text-xs text-muted-foreground/60">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <>
            {/* List area — flex-1, scrubber gets dedicated space on right */}
            <div className="flex-1 min-w-0 relative overflow-hidden">
              {scrollOffset > SCROLL_THRESHOLD && (
                <button
                  type="button"
                  onClick={() => vListRef.current?.scrollTo(0)}
                  className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-bl-md bg-primary text-primary-foreground text-xs font-medium shadow-md hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring animate-in fade-in slide-in-from-top-2 duration-200"
                  aria-label="Jump to top"
                >
                  <ArrowUp size={14} strokeWidth={2.5} />
                  <span>Top</span>
                </button>
              )}
              <VList
                ref={vListRef}
                className="h-full w-full scrollbar-hide pb-4 px-2 sm:px-4"
                onScroll={(offset) => setScrollOffset(offset)}
              >
                {courses.map((course) => (
                  <div key={course.id} className="w-full">
                  <CourseCard
                    course={course}
                    sortDisplayValue={getSortDisplayValue(course)}
                    rating={getRatingForCourse(course)}
                    onClick={() => onCourseClick(course)}
                  />
                  </div>
                ))}
              </VList>
            </div>

            {/* A-Z scrubber — sticky on right edge, minimal space */}
            {letterToIndex && existingLetters.length > 0 && (
              <div className="shrink-0 w-6 flex flex-col items-center justify-center py-2 pr-1 sticky top-0 self-stretch">
                <div
                  role="navigation"
                  aria-label="Jump to letter"
                  className="flex flex-col items-center gap-0.5"
                >
                  {existingLetters.map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => scrollToLetter(letter)}
                      className="w-5 h-5 rounded flex items-center justify-center text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      aria-label={`Jump to ${letter === '#' ? 'numbers/symbols' : letter}`}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

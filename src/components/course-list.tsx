'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { VList, VListHandle } from 'virtua';
import { useCourseStore } from '@/lib/store';
import { useFilteredCourses } from '@/hooks/use-filtered-courses';
import { cn } from '@/lib/utils';
import { CourseCard } from './course-card';
import { Course } from '@/types/course';
import { SearchX } from 'lucide-react';
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

function AlphabetScrubber({ letters, onSelect }: { letters: string[], onSelect: (letter: string) => void }) {
  const [activeLetter, setActiveLetter] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const touchActive = React.useRef(false);

  const handleMove = (clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const itemHeight = rect.height / letters.length;
    const index = Math.floor(relativeY / itemHeight);

    // Check if index is within bounds (allowing a bit of buffer above/below)
    if (index >= 0 && index < letters.length) {
      const letter = letters[index];
      if (activeLetter !== letter) {
        setActiveLetter(letter);
        onSelect(letter);
        // Haptic feedback if available (standard vibration API)
        if (navigator.vibrate) navigator.vibrate(5);
      }
    } else if (index < 0) {
      // Snap to first if dragging above
      if (activeLetter !== letters[0]) {
        setActiveLetter(letters[0]);
        onSelect(letters[0]);
      }
    } else {
      // Snap to last if dragging below
      const last = letters[letters.length - 1];
      if (activeLetter !== last) {
        setActiveLetter(last);
        onSelect(last);
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent page scrolling
    handleMove(e.touches[0].clientY);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (e.buttons === 1) { // Only if left mouse button is pressed
      handleMove(e.clientY);
    }
  };

  return (
    <div
      className="absolute right-0 inset-y-0 pt-4 pb-40 md:pb-4 z-20 flex flex-col justify-center select-none touch-none"
      ref={containerRef}
      onTouchStart={(e) => { touchActive.current = true; handleMove(e.touches[0].clientY); }}
      onTouchMove={onTouchMove}
      onTouchEnd={() => { touchActive.current = false; setActiveLetter(null); }}
      onMouseDown={(e) => { handleMove(e.clientY); }}
      onMouseMove={onMouseMove}
      onMouseUp={() => setActiveLetter(null)}
      onMouseLeave={() => setActiveLetter(null)}
    >
      {/* Visual Background Pill */}
      <div className="absolute inset-0 bg-background/50 backdrop-blur-sm rounded-full -z-10 w-full h-full opacity-0 hover:opacity-100 transition-opacity duration-300" />

      {letters.map((letter) => {
        const isActive = activeLetter === letter;
        // Calculate distance from active letter could be cool but a simple scale is usually enough for the "blow up" effect users expect (like iOS)

        return (
          <div
            key={letter}
            className="relative flex items-center justify-center w-8 h-[18px] md:h-6"
          >
            <span
              className={cn(
                "text-[10px] md:text-xs font-semibold transition-all duration-150 leading-none",
                isActive ? "text-primary scale-[2.5] font-bold origin-right pr-6 drop-shadow-md" : "text-muted-foreground/60"
              )}
            >
              {letter}
            </span>

            {/* Bubble effect for active letter (iOS style popout to the left) */}
            {isActive && (
              <div className="absolute right-8 top-1/2 -translate-y-1/2 bg-background border border-border/50 shadow-xl rounded-full w-12 h-12 flex items-center justify-center pointer-events-none animate-in zoom-in-50 duration-100">
                <span className="text-xl font-bold text-primary">{letter}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// One option per criterion; direction toggled by the button (Quality defaults to high first)
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'az', label: 'A-Z (Default)' },
  { value: 'units', label: 'Units' },
  { value: 'hours', label: 'Hours/Wk' },
  { value: 'quality', label: 'Course Rating' },
  { value: 'hours_per_unit', label: 'Difficulty (Hours/Unit)' },
]

const DEFAULT_SORT_DIR: Record<string, 'asc' | 'desc'> = {
  quality: 'desc', // high first (best first)
  az: 'asc',
  units: 'asc',
  hours: 'asc',
  hours_per_unit: 'asc',
}

function getDirectionLabel(sortBy: string, sortDir: string): string {
  if (sortBy === 'az') return sortDir === 'asc' ? 'A to Z' : 'Z to A'
  return sortDir === 'asc' ? 'Low to high' : 'High to low'
}

export function CourseList({ onCourseClick }: CourseListProps) {
  const { fetchCourses } = useCourseStore();
  const { courses, isLoading, sortBy, setSortBy, sortDir, setSortDir, getSortDisplayValue } = useFilteredCourses();
  const vListRef = useRef<VListHandle>(null)

  const isValidSortBy = SORT_OPTIONS.some((o) => o.value === sortBy)
  const displaySortValue = isValidSortBy ? sortBy : 'az'

  const handleSortChange = (value: string) => {
    setSortBy(value)
    setSortDir(DEFAULT_SORT_DIR[value] ?? 'asc')
  }

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const letterMap = useMemo(() => {
    const map = new Map<string, number>();
    courses.forEach((course, index) => {
      const firstChar = course.subject.charAt(0).toUpperCase();
      if (!map.has(firstChar)) {
        map.set(firstChar, index);
      }
    });
    return map;
  }, [courses]);

  const sortedLetters = useMemo(() => {
    return Array.from(letterMap.keys()).sort();
  }, [letterMap]);

  const handleScrollToLetter = (letter: string) => {
    const index = letterMap.get(letter);
    if (index !== undefined && vListRef.current) {
      vListRef.current.scrollToIndex(index, { align: 'start' });
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className="flex-1 h-full w-full overflow-hidden flex flex-col relative">
      {/* Results bar: static padding so it stays centered regardless of scrubber */}
      <div className="min-h-9 py-1.5 pl-2 pr-4 text-xs font-medium text-muted-foreground border-b border-border/30 bg-background/80 backdrop-blur-sm z-10 flex items-center gap-1 flex-wrap min-w-0 transition-all duration-300">
        <span className="shrink-0 text-muted-foreground">Sort by</span>
        <Select value={displaySortValue} onValueChange={handleSortChange}>
          <SelectTrigger className="h-6 w-[182px] shrink-0 text-xs border-border/60 bg-white dark:bg-background text-primary font-medium px-2 py-1" aria-label="Sort by">
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
        <Select value={sortDir} onValueChange={(v) => setSortDir(v === 'desc' ? 'desc' : 'asc')}>
          <SelectTrigger className="h-6 w-fit min-w-[5rem] shrink-0 text-xs border-border/60 bg-white dark:bg-background text-primary font-medium px-2 py-1" aria-label="Sort direction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc" className="text-xs">{getDirectionLabel(sortBy, 'asc')}</SelectItem>
            <SelectItem value="desc" className="text-xs">{getDirectionLabel(sortBy, 'desc')}</SelectItem>
          </SelectContent>
        </Select>
        <ActiveFilterChips />
        <div className="ml-auto shrink-0 text-right">
          <span className="tabular-nums font-semibold text-foreground/70">
            {courses.length.toLocaleString()} classes
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative group">
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <SearchX size={32} className="text-muted-foreground/30" />
            <p className="text-sm font-medium">No courses match your filters.</p>
            <p className="text-xs text-muted-foreground/60">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <>
            <VList ref={vListRef} className="h-full w-full scrollbar-hide pb-8 pl-0 pr-0">
              {courses.map((course) => (
                <div key={course.id} className="pr-0 transition-all duration-300">
                  <CourseCard
                    course={course}
                    sortDisplayValue={getSortDisplayValue(course)}
                    onClick={() => onCourseClick(course)}
                  />
                </div>
              ))}
            </VList>

            {/* Alphabet Scrubber: only when sorted A-Z */}
            {sortBy === 'az' && sortedLetters.length > 1 && (
              <AlphabetScrubber
                letters={sortedLetters}
                onSelect={handleScrollToLetter}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

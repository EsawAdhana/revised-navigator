'use client';

import React, { useEffect, useRef } from 'react';
import { VList, VListHandle } from 'virtua';
import { useCourseStore } from '@/lib/store';
import { useFilteredCourses } from '@/hooks/use-filtered-courses';
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
          <span className="text-xs tabular-nums font-semibold text-foreground/70">
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
          <VList ref={vListRef} className="h-full w-full scrollbar-hide pb-4 pl-0 pr-0">
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
        )}
      </div>
    </div>
  );
}

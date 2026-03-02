import React from 'react';
import Link from 'next/link';
import { Course } from '@/types/course';
import { getDepartmentUrl, unitsLabel, parseUnitsOptions, decodeHtmlEntities } from '@/lib/utils';
import { Calendar, Users } from 'lucide-react';
import { InstructorList } from './instructor-list';

function getRatingColor(rating: number): string {
  if (rating >= 4.5) return 'text-emerald-600 dark:text-emerald-400';
  if (rating >= 3.5) return 'text-amber-600 dark:text-amber-400';
  if (rating >= 2.5) return 'text-orange-500 dark:text-orange-400';
  return 'text-red-500 dark:text-red-400';
}

interface CourseCardProps {
  course: Course;
  /** When provided, card is a link (supports Ctrl/Cmd+click to open in new tab) */
  href?: string;
  /** Difficulty (e.g. "3.2 hrs/unit") to show under unit count when available */
  sortDisplayValue?: string | null;
  /** Average course rating (1-5) from evaluations, with cross-list lookup */
  rating?: number | null;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

export const CourseCard = React.memo(({ course, href, sortDisplayValue, rating, style, onClick }: CourseCardProps) => {
  const cardContent = (
    <div
      className="group relative w-full min-w-0 rounded-xl bg-card text-card-foreground border border-border/40 hover:border-primary/25 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(140,21,21,0.06)] transition-all duration-300 cursor-pointer px-3 py-4 sm:px-4 hover:-translate-y-[1px] overflow-hidden"
      onClick={!href ? onClick : undefined}
    >
        {/* Top row: class code (left) + unit count (right); under unit count, show sort value when applicable */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="text-[15px] font-bold tabular-nums text-destructive group-hover:text-destructive/80 transition-colors font-[family-name:var(--font-outfit)]">
            {course.subject} {course.code}
          </span>
          <div className="shrink-0 text-right text-foreground">
            <div className="flex items-baseline justify-end gap-1 transition-colors whitespace-nowrap">
              {(() => {
                const opts = parseUnitsOptions(course.units || '');
                const displayVal = opts.length === 1 ? opts[0] : (course.units || '0');
                const label = unitsLabel(typeof displayVal === 'number' ? displayVal : course.units || '');
                return (
                  <>
                    <span className="text-[13px] font-extrabold tabular-nums font-[family-name:var(--font-outfit)] leading-none">{displayVal}</span>
                    <span className="text-[13px] font-semibold tracking-tight leading-none">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
                  </>
                );
              })()}
            </div>
            {(sortDisplayValue || rating != null) ? (
              <div className="flex flex-col items-end gap-0.5 mt-0.5">
                {sortDisplayValue ? (
                  <div className="text-[13px] font-medium">{sortDisplayValue}</div>
                ) : null}
                {rating != null ? (
                  <div className={`text-[13px] font-semibold ${getRatingColor(rating)}`}>
                    {rating.toFixed(1)}/5.0
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Title — largest text in card */}
        <h3 className="font-semibold text-[16px] leading-tight text-foreground line-clamp-2 transition-colors mb-3 group-hover:text-foreground">
          {decodeHtmlEntities(course.title)}
        </h3>

        {/* Bottom row: instructor + term — smaller than title/code; truncate to prevent overlap on mobile */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 text-foreground pt-2.5 border-t border-border/30 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            <InstructorList instructors={course.instructors} showIcon={false} size="sm" />
          </div>
          {(course.terms && course.terms.length > 0) && (
            <div className="flex items-center justify-end gap-1.5 font-medium shrink-0 min-w-0 max-w-[55%] sm:max-w-[60%]">
              <div className="text-right text-[13px] leading-tight whitespace-normal">
                {course.terms.map(t => t.split(' ')[0]).join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>
  );

  return (
    <div style={style} className="w-full min-w-0 py-1.5">
      {href ? (
        <Link href={href} onClick={onClick} className="block no-underline text-inherit">
          {cardContent}
        </Link>
      ) : (
        cardContent
      )}
    </div>
  );
});

CourseCard.displayName = 'CourseCard';

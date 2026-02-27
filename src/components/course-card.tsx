import React from 'react';
import { Course } from '@/types/course';
import { getDepartmentUrl, unitsLabel, parseUnitsOptions, decodeHtmlEntities } from '@/lib/utils';
import { Calendar, Users } from 'lucide-react';
import { InstructorList } from './instructor-list';

interface CourseCardProps {
  course: Course;
  /** When sorted by Units, Course Rating, Hours/Wk, or Difficulty, show this value under the unit count (e.g. "4.5/5.0", "3"). */
  sortDisplayValue?: string | null;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const CourseCard = React.memo(({ course, sortDisplayValue, style, onClick }: CourseCardProps) => {
  return (
    <div style={style} className="w-full py-1.5">
      <div
        className="group relative w-full rounded-xl bg-card text-card-foreground border border-border/40 hover:border-primary/25 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(140,21,21,0.06)] transition-all duration-300 cursor-pointer pl-4 pr-4 py-4 hover:-translate-y-[1px]"
        onClick={onClick}
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
            {sortDisplayValue ? (
              <div className="text-[11px] font-medium mt-0.5">
                {sortDisplayValue}
              </div>
            ) : null}
          </div>
        </div>

        {/* Title — largest text in card */}
        <h3 className="font-semibold text-[16px] leading-tight text-foreground line-clamp-2 transition-colors mb-3 group-hover:text-foreground">
          {decodeHtmlEntities(course.title)}
        </h3>

        {/* Bottom row: instructor + term — smaller than title/code */}
        <div className="flex items-center justify-between gap-3 text-foreground pt-2.5 border-t border-border/30">
          <div className="flex-1 min-w-0">
            <InstructorList instructors={course.instructors} showIcon={false} size="sm" />
          </div>
          {(course.terms && course.terms.length > 0) && (
            <div className="flex items-center gap-1.5 font-medium shrink-0 max-w-[50%]">
              <div className="text-right text-[13px] leading-none">
                {course.terms.map(t => t.split(' ')[0]).join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

CourseCard.displayName = 'CourseCard';

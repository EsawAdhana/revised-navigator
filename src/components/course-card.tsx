import React from 'react';
import { Course } from '@/types/course';
import { getDepartmentUrl, unitsLabel } from '@/lib/utils';
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
    <div style={style} className="pl-1 pr-3 py-1.5">
      <div
        className="group relative w-full rounded-xl bg-card text-card-foreground border border-border/40 hover:border-primary/25 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(140,21,21,0.06)] transition-all duration-300 cursor-pointer pl-4 pr-5 py-5 hover:-translate-y-[1px]"
        onClick={onClick}
      >
        {/* Top row: class code (left) + unit count (right); under unit count, show sort value when applicable */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <span className="text-sm font-bold tabular-nums text-primary/80 group-hover:text-primary transition-colors font-[family-name:var(--font-outfit)]">
            <a
              href={getDepartmentUrl(course.subject)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-inherit font-inherit hover:underline underline-offset-2"
              title={`Visit ${course.subject} Department Website`}
            >
              {course.subject}
            </a>
            {' '}{course.code}
          </span>
          <div className="shrink-0 text-right">
            <span className="text-sm font-bold tabular-nums text-primary/80 group-hover:text-primary transition-colors font-[family-name:var(--font-outfit)]" title="Units">
              {course.units ?? '—'} {unitsLabel(course.units)}
            </span>
            {sortDisplayValue ? (
              <div className="text-xs font-medium text-muted-foreground/80 mt-0.5" title="Value for current sort">
                {sortDisplayValue}
              </div>
            ) : null}
          </div>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-[15px] leading-snug text-foreground/90 group-hover:text-foreground line-clamp-2 transition-colors mb-3" title={course.title}>
          {course.title}
        </h3>

        {/* Bottom row: instructor + term */}
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground pt-3 border-t border-border/30">
          <div className="flex-1 min-w-0">
            <InstructorList instructors={course.instructors} />
          </div>
          {(course.terms && course.terms.length > 0) ? (
            <div className="flex items-start gap-1.5 font-medium text-muted-foreground/70 shrink-0 max-w-[55%]">
              <Calendar size={12} className="shrink-0 mt-0.5" />
              <div className="text-right text-xs leading-snug break-words" title={course.terms.join(', ')}>
                {course.terms.map(t => t.split(' ')[0]).join(', ')}
              </div>
            </div>
          ) : course.term ? (
            <div className="flex items-center gap-1.5 font-medium text-muted-foreground/70 shrink-0">
              <Calendar size={12} className="shrink-0" />
              <div className="truncate max-w-[80px] text-right">{course.term.split(' ')[0]}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

CourseCard.displayName = 'CourseCard';

'use client';

import React from 'react';
import Link from 'next/link';
import { User } from 'lucide-react';
import { decodeHtmlEntities } from '@/lib/utils';
import { instructorProfilePath } from '@/lib/instructors';
import { useCourseInstructorLinks } from '@/hooks/use-instructor-search';

interface InstructorListProps {
  instructors: string[];
  limit?: number;
  showIcon?: boolean;
  label?: string;
  /** Use 'sm' for compact contexts (e.g. course cards). */
  size?: 'default' | 'sm';
  /**
   * Link each name to its instructor page. Off by default because course cards
   * are themselves links, and anchors can't nest.
   */
  linkToProfile?: boolean;
  /** When set, prefer course-scoped resolutions ("Clark, S." on CS 229 → Susan). */
  courseId?: string;
  /**
   * Optional SSR map of initialSlug → named slug for this course. When omitted
   * and courseId is set, the client loads it from the instructors dump.
   */
  profileLinks?: Record<string, string>;
}

export function InstructorList({
  instructors,
  limit = 5,
  showIcon = true,
  label,
  size = 'default',
  linkToProfile = false,
  courseId,
  profileLinks,
}: InstructorListProps) {
  const textSize = size === 'sm' ? 'text-[13px]' : 'text-[17px]';
  const loadedLinks = useCourseInstructorLinks(
    linkToProfile && courseId && !profileLinks ? courseId : undefined,
  );
  const links = profileLinks ?? loadedLinks;
  const courseLinks = courseId ? { [courseId]: links } : undefined;

  if (!instructors || instructors.length === 0) {
    return (
      <div className="flex items-baseline gap-2 min-w-0">
        {showIcon && <User size={16} strokeWidth={2.5} className="text-muted-foreground shrink-0 mt-0.5" />}
        <div className="flex items-baseline gap-2 min-w-0 flex-1">
          {label && <span className="text-[13px] font-bold text-muted-foreground uppercase tracking-tight leading-none shrink-0">{label}</span>}
          <span className={`${textSize} font-medium text-muted-foreground/90 leading-tight break-words`}>Unknown Instructor</span>
        </div>
      </div>
    );
  }

  const displayed = instructors.slice(0, limit);
  const remaining = instructors.length - limit;

  return (
    <div className="flex items-baseline gap-2 text-muted-foreground/90 min-w-0">
      {showIcon && <User size={16} strokeWidth={2.5} className="text-muted-foreground shrink-0 mt-0.5" />}
      <div className="flex items-baseline gap-2 min-w-0 flex-1">
        {label && <span className="text-[13px] font-bold text-muted-foreground uppercase tracking-tight leading-none shrink-0">{label}</span>}
        <div className={`${textSize} font-medium text-muted-foreground leading-tight min-w-0 ${size === 'sm' ? 'truncate' : 'break-words'}`}>
          {displayed.map((name, i) => (
            <React.Fragment key={`${name}-${i}`}>
              {i > 0 && ', '}
              {linkToProfile ? (
                <Link
                  href={instructorProfilePath(name, courseId, courseLinks)}
                  className="hover:text-foreground hover:underline underline-offset-2 transition-colors"
                >
                  {decodeHtmlEntities(name)}
                </Link>
              ) : (
                decodeHtmlEntities(name)
              )}
            </React.Fragment>
          ))}
          {remaining > 0 && <span className="opacity-60 ml-1">+{remaining} more</span>}
        </div>
      </div>
    </div>
  );
}

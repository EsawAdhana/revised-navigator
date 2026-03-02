import React from 'react';
import { User } from 'lucide-react';
import { decodeHtmlEntities } from '@/lib/utils';

interface InstructorListProps {
  instructors: string[];
  limit?: number;
  showIcon?: boolean;
  label?: string;
  /** Use 'sm' for compact contexts (e.g. course cards). */
  size?: 'default' | 'sm';
}

export function InstructorList({ instructors, limit = 5, showIcon = true, label, size = 'default' }: InstructorListProps) {
  const textSize = size === 'sm' ? 'text-[13px]' : 'text-[17px]';

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
          {displayed.map((name) => decodeHtmlEntities(name)).join(', ')}
          {remaining > 0 && <span className="opacity-60 ml-1">+{remaining} more</span>}
        </div>
      </div>
    </div>
  );
}

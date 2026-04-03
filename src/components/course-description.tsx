'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useCourseStore } from '@/lib/store';
import { decodeHtmlEntities } from '@/lib/utils';

/** Only auto-link course codes when nearby preceding text looks like a prereq / requirement list (not e.g. lab fees like "$MUSIC 80"). */
const COURSE_REF_CONTEXT_RE =
    /\b(?:prerequisites?|prereqs?|corequisites?|co-?\s*requisites?|recommended|recommendations?|requirements?|suggested|prior\s+courses?|concurrent\s+enrollment)\b/i

function hasCourseReferenceContext(fullText: string, matchIndex: number): boolean {
    const lookback = 480
    const start = Math.max(0, matchIndex - lookback)
    return COURSE_REF_CONTEXT_RE.test(fullText.slice(start, matchIndex))
}

interface CourseDescriptionProps {
    description: string;
    /** When set, bare course numbers (e.g. "30", "70", "112") in the text are resolved as this subject (e.g. CS 30, CS 70). */
    contextSubject?: string;
    className?: string;
}

export function CourseDescription({ description, contextSubject, className }: CourseDescriptionProps) {
    const courses = useCourseStore(s => s.courses);

    const courseMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of courses) {
            map.set(`${c.subject}|${c.code}`, c.id);
        }
        return map;
    }, [courses]);

    const renderedParts = useMemo(() => {
        if (!description) return null;

        const decodedText = decodeHtmlEntities(description);
        const courseRegex = /\b(?:([A-Z]{2,4})\s*(\d{1,3}[A-Z]?)|(\d{2,3}[A-Z]?))\b/g;

        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;

        while ((match = courseRegex.exec(decodedText)) !== null) {
            const precedingText = decodedText.substring(0, match.index);
            if (precedingText.endsWith('&#') || (match[3] && precedingText.match(/&#\d*$/))) {
                continue;
            }

            if (match.index > lastIndex) {
                parts.push(decodedText.substring(lastIndex, match.index));
            }

            const subject = match[1] ?? (contextSubject && match[3] ? contextSubject : null);
            const code = match[2] ?? match[3];
            const fullCode = subject ? `${subject} ${code}` : match[0];

            if (!subject) {
                parts.push(match[0]);
                lastIndex = match.index + match[0].length;
                continue;
            }

            const courseId = courseMap.get(`${subject}|${code}`);
            const shouldLink = Boolean(courseId && hasCourseReferenceContext(decodedText, match.index));

            if (shouldLink && courseId) {
                parts.push(
                    <Link
                        key={`${match.index}-${fullCode}`}
                        href={`/courses/${encodeURIComponent(courseId)}`}
                        className="text-primary font-bold hover:underline"
                        onClick={(e) => { e.stopPropagation(); }}
                    >
                        {fullCode}
                    </Link>
                );
            } else {
                parts.push(fullCode);
            }

            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < decodedText.length) {
            parts.push(decodedText.substring(lastIndex));
        }

        return parts;
    }, [description, contextSubject, courseMap]);

    if (!renderedParts) return null;

    return (
        <div className={className}>
            <p className="text-muted-foreground text-[15px] leading-relaxed font-normal">
                {renderedParts}
            </p>
        </div>
    )
}

'use client';

import React from 'react';
import Link from 'next/link';
import { useCourseStore } from '@/lib/store';

interface CourseDescriptionProps {
    description: string;
    /** When set, bare course numbers (e.g. "30", "70", "112") in the text are resolved as this subject (e.g. CS 30, CS 70). */
    contextSubject?: string;
    className?: string;
    isEnriching?: boolean;
}

export function CourseDescription({ description, contextSubject, className, isEnriching }: CourseDescriptionProps) {
    const { courses } = useCourseStore();

    if (!description) {
        if (isEnriching) {
            return (
                <div className={className}>
                    <div className="space-y-2 mt-1 animate-pulse">
                        <div className="h-4 bg-secondary/30 rounded w-full"></div>
                        <div className="h-4 bg-secondary/30 rounded w-[95%]"></div>
                        <div className="h-4 bg-secondary/30 rounded w-[85%]"></div>
                        <div className="h-4 bg-secondary/30 rounded w-[60%]"></div>
                    </div>
                </div>
            );
        }
        return null;
    }

    // Helper to render description with clickable course links
    const renderDescriptionWithLinks = (text: string) => {
        // Match: "SUBJ CODE" or "SUBJCODE" (e.g. "CS 106A", "CS106B", "MATH 51") or bare code with context (e.g. "30" in a CS course).
        const courseRegex = /\b(?:([A-Z]{2,4})\s*(\d{1,3}[A-Z]?)|(\d{2,3}[A-Z]?))\b/g;

        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = courseRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.substring(lastIndex, match.index));
            }

            const subject = match[1] ?? (contextSubject && match[3] ? contextSubject : null);
            const code = match[2] ?? match[3];
            const fullCode = subject ? `${subject} ${code}` : match[0];

            if (!subject) {
                parts.push(match[0]);
                lastIndex = match.index + match[0].length;
                continue;
            }

            const targetCourse = courses.find(c => c.subject === subject && c.code === code);

            if (targetCourse) {
                parts.push(
                    <Link
                        key={`${match.index}-${fullCode}`}
                        href={`/courses/${encodeURIComponent(targetCourse.id)}`}
                        className="text-primary font-bold"
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        {fullCode}
                    </Link>
                );
            } else {
                parts.push(fullCode);
            }

            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }

        return parts;
    };

    return (
        <div className={className}>
            <p className="text-muted-foreground text-base leading-relaxed font-normal">
                {renderDescriptionWithLinks(description)}
            </p>
        </div>
    )
}

'use client';

import React from 'react';
import Link from 'next/link';
import { useCourseStore } from '@/lib/store';
import { decodeHtmlEntities } from '@/lib/utils';

interface CourseDescriptionProps {
    description: string;
    /** When set, bare course numbers (e.g. "30", "70", "112") in the text are resolved as this subject (e.g. CS 30, CS 70). */
    contextSubject?: string;
    className?: string;
}

export function CourseDescription({ description, contextSubject, className }: CourseDescriptionProps) {
    const { courses } = useCourseStore();

    if (!description) return null;

    // Decode all HTML entities first so we never show raw &nbsp; &amp; etc.
    const decodedDescription = decodeHtmlEntities(description);

    // Helper to render description with clickable course links
    const renderDescriptionWithLinks = (text: string) => {
        if (!text) return [];

        // Text is already decoded; use as-is for matching
        const decodedText = text;

        // Match: "SUBJ CODE" or "SUBJCODE" (e.g. "CS 106A", "CS106B", "MATH 51") or bare code with context (e.g. "30" in a CS course).
        // Added negative lookbehind (for browsers that support it) or just ensuring we don't match after &#
        const courseRegex = /\b(?:([A-Z]{2,4})\s*(\d{1,3}[A-Z]?)|(\d{2,3}[A-Z]?))\b/g;

        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = courseRegex.exec(decodedText)) !== null) {
            // Basic check to avoid matching inside an entity-like string if any remain
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

            const targetCourse = courses.find(c => c.subject === subject && c.code === code);

            if (targetCourse) {
                parts.push(
                    <Link
                        key={`${match.index}-${fullCode}`}
                        href={`/courses/${encodeURIComponent(targetCourse.id)}`}
                        className="text-primary font-bold hover:underline"
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

        if (lastIndex < decodedText.length) {
            parts.push(decodedText.substring(lastIndex));
        }

        return parts;
    };

    return (
        <div className={className}>
            <p className="text-muted-foreground text-[15px] leading-relaxed font-normal">
                {renderDescriptionWithLinks(decodedDescription)}
            </p>
        </div>
    )
}

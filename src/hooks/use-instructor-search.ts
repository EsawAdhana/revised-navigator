'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    buildInstructorDirectory,
    parseInstructorDump,
    findInstructorsByExactName,
    type InstructorDirectory,
    type InstructorDump,
    type InstructorEntry,
} from '@/lib/instructors';

let dumpPromise: Promise<InstructorDump> | null = null;

/** Loaded on first use rather than with the catalog — most sessions never search a name. */
function loadDump(): Promise<InstructorDump> {
    if (!dumpPromise) {
        dumpPromise = fetch('/catalog/instructors.json')
            .then(res => res.json())
            .then(parseInstructorDump)
            .catch(() => ({ names: [], courseLinks: {} }));
    }
    return dumpPromise;
}

export function useInstructorSearch(query: string): InstructorEntry[] {
    const [directory, setDirectory] = useState<InstructorDirectory | null>(null);
    const trimmed = query.trim();
    const shouldLoad = trimmed.length >= 2;

    useEffect(() => {
        if (!shouldLoad || directory) return;
        let cancelled = false;
        loadDump()
            .then(dump => buildInstructorDirectory(dump.names))
            .then(loaded => { if (!cancelled) setDirectory(loaded); });
        return () => { cancelled = true; };
    }, [shouldLoad, directory]);

    return useMemo(
        () => (directory ? findInstructorsByExactName(directory, trimmed) : []),
        [directory, trimmed]
    );
}

/** Course-scoped initial→named slug map from the instructors dump. Empty until loaded. */
export function useCourseInstructorLinks(courseId?: string): Record<string, string> {
    const [links, setLinks] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!courseId) {
            setLinks({});
            return;
        }
        let cancelled = false;
        loadDump().then(dump => {
            if (!cancelled) setLinks(dump.courseLinks[courseId] ?? {});
        });
        return () => { cancelled = true; };
    }, [courseId]);

    return links;
}

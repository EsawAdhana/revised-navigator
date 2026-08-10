'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    buildInstructorDirectory,
    searchInstructors,
    type InstructorDirectory,
    type InstructorEntry,
} from '@/lib/instructors';

let directoryPromise: Promise<InstructorDirectory> | null = null;

/** Loaded on first use rather than with the catalog — most sessions never search a name. */
function loadDirectory(): Promise<InstructorDirectory> {
    if (!directoryPromise) {
        directoryPromise = fetch('/catalog/instructors.json')
            .then(res => res.json())
            .then((names: string[]) => buildInstructorDirectory(names))
            .catch(() => buildInstructorDirectory([]));
    }
    return directoryPromise;
}

export function useInstructorSearch(query: string): InstructorEntry[] {
    const [directory, setDirectory] = useState<InstructorDirectory | null>(null);
    const trimmed = query.trim();
    const shouldLoad = trimmed.length >= 2;

    useEffect(() => {
        if (!shouldLoad || directory) return;
        let cancelled = false;
        loadDirectory().then(loaded => { if (!cancelled) setDirectory(loaded); });
        return () => { cancelled = true; };
    }, [shouldLoad, directory]);

    return useMemo(
        () => (directory ? searchInstructors(directory, trimmed) : []),
        [directory, trimmed]
    );
}

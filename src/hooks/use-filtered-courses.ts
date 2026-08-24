import React, { useMemo, useCallback } from 'react';
import { useCourseStore } from '@/lib/store';
import { useCartStore } from '@/lib/cart-store';
import { useQueryState, parseAsArrayOf, parseAsString, parseAsBoolean, parseAsInteger } from 'nuqs';
import { compareCourseCodes, getCrossListPrimaryMap, normalizeCourseId, resolveToCanonicalPrimary, parseUnitsOptions } from '@/lib/utils';
import type { Course } from '@/types/course';
import { searchCourses } from '@/lib/search-utils';
import { filterCourses } from '@/lib/course-filter';
import { useSelectedTerms } from '@/hooks/use-selected-terms';

export function useFilteredCourses() {
    const courses = useCourseStore(state => state.courses);
    const isLoading = useCourseStore(state => state.isLoading);
    const cartItems = useCartStore(state => state.items);

    const [query] = useQueryState('q', { defaultValue: '' });
    const [selectedDepts] = useQueryState('depts', parseAsArrayOf(parseAsString).withDefault([]));
    const [selectedTerms] = useSelectedTerms();
    const [selectedFormats] = useQueryState('formats', parseAsArrayOf(parseAsString).withDefault([]));
    const [selectedLevels] = useQueryState('levels', parseAsArrayOf(parseAsString).withDefault([]));
    const [selectedGers] = useQueryState('gers', parseAsArrayOf(parseAsString).withDefault([]));
    const [selectedSchools] = useQueryState('schools', parseAsArrayOf(parseAsString).withDefault([]));

    const [unitMin] = useQueryState('unitMin', parseAsInteger.withDefault(1));
    const [unitMax] = useQueryState('unitMax', parseAsInteger.withDefault(5));
    const [timeMin] = useQueryState('timeMin', parseAsInteger.withDefault(420));
    const [timeMax] = useQueryState('timeMax', parseAsInteger.withDefault(1320));
    const [hideConflicts] = useQueryState('hideConflicts', parseAsBoolean.withDefault(true));
    // Closed/waitlisted and study abroad (BOSP) courses are hidden by default.
    const [hideUnavailable] = useQueryState('hideUnavailable', parseAsBoolean.withDefault(true));
    const [hideStudyAbroad] = useQueryState('hideStudyAbroad', parseAsBoolean.withDefault(true));
    const [newOnly] = useQueryState('newOnly', parseAsBoolean.withDefault(false));
    const [excludedWords] = useQueryState('exclude', parseAsArrayOf(parseAsString).withDefault([]));
    const [sortBy, setSortBy] = useQueryState('sort', parseAsString.withDefault('az'));
    const [sortOrder, setSortOrder] = useQueryState('order', parseAsString);

    // Default order per sort type: rating = high→low (desc), others = low→high (asc)
    const getDefaultOrderForSort = useCallback((s: string) =>
        (s === 'rating' ? 'desc' : 'asc') as 'asc' | 'desc', []);
    const effectiveSortOrder = sortOrder ?? getDefaultOrderForSort(sortBy);

    const primaryMap = useMemo(() => getCrossListPrimaryMap(courses), [courses]);

    const filteredResult = useMemo(() => {
        // Shared filter pipeline (also used by the sidebar facet counts) — applies
        // every filter except the free-text query, which is handled below.
        let result = filterCourses(courses, {
            excludedWords,
            selectedDepts,
            selectedTerms,
            selectedFormats,
            selectedLevels,
            selectedGers,
            selectedSchools,
            unitMin,
            unitMax,
            timeMin,
            timeMax,
            hideConflicts,
            hideUnavailable,
            hideStudyAbroad,
            newOnly,
        }, primaryMap, cartItems);

        // Filter by Query
        if (query) {
            const beforeSearch = result;
            result = searchCourses(result, query);
            // If the user searched for an alternate course code (e.g. "cs 238v"), include the primary course so it shows up
            const queryNorm = normalizeCourseId(query.trim().replace(/\s+/g, ''));
            if (queryNorm) {
                if (primaryMap.has(queryNorm)) {
                    const canonicalNorm = resolveToCanonicalPrimary(queryNorm, primaryMap);
                    // Prefer primary from beforeSearch (so it passed term/dept etc.); fallback to full list so search always finds the course
                    let primary = beforeSearch.find(c => normalizeCourseId(c.id) === canonicalNorm);
                    if (!primary) {
                        const withGrading = courses.filter(c => c.grading && c.grading.trim() !== '' && c.grading !== 'TBD');
                        primary = withGrading.find(c => normalizeCourseId(c.id) === canonicalNorm);
                    }
                    if (primary && !result.some(c => c.id === primary!.id)) result = [...result, primary];
                }
            }
        }

        // All filtering is done; this is the set we will sort (sort is the last step)
        return result;
    }, [courses, primaryMap, query, selectedDepts, selectedTerms, selectedFormats, selectedLevels, selectedGers, selectedSchools, unitMin, unitMax, timeMin, timeMax, hideConflicts, hideUnavailable, hideStudyAbroad, newOnly, cartItems, excludedWords]);

    // Precompute difficulty/hours/rating per course (with cross-list lookup) — O(n) total, not O(n²)
    const metricsByCourseId = useMemo(() => {
        const map = new Map<string, { difficulty?: number; hours?: number; quality?: number }>();
        const coursesById = new Map(courses.map(c => [c.id, c]));

        // Build canonical -> courseIds in group (one pass)
        const canonicalToIds = new Map<string, string[]>();
        for (const c of courses) {
            const canonical = resolveToCanonicalPrimary(normalizeCourseId(c.id), primaryMap);
            if (!canonicalToIds.has(canonical)) canonicalToIds.set(canonical, []);
            canonicalToIds.get(canonical)!.push(c.id);
        }

        // For each course, get best metrics from its group (O(1) group lookup)
        for (const course of courses) {
            const canonical = resolveToCanonicalPrimary(normalizeCourseId(course.id), primaryMap);
            const groupIds = canonicalToIds.get(canonical) ?? [course.id];
            let difficulty: number | undefined;
            let hours: number | undefined;
            let quality: number | undefined;
            for (const id of groupIds) {
                const c = coursesById.get(id);
                if (c?.difficulty != null) difficulty = c.difficulty;
                if (c?.hours != null) hours = c.hours;
                if (c?.quality != null) quality = c.quality;
            }
            if (difficulty != null || hours != null || quality != null) {
                map.set(course.id, {
                    ...(difficulty != null && { difficulty }),
                    ...(hours != null && { hours }),
                    ...(quality != null && { quality }),
                });
            }
        }
        return map;
    }, [courses, primaryMap]);

    const displayCourses = useMemo(() => {
        if (filteredResult.length === 0) return [] as Course[];
        const effectiveSort = ['units', 'hrsPerWeek', 'hrsPerUnit', 'rating'].includes(sortBy) ? sortBy : 'az';
        const mult = effectiveSortOrder === 'desc' ? -1 : 1;
        return [...filteredResult].sort((a, b) => {
            const safeSubject = (x: Course) => (x?.subject ?? '').toString();
            const safeCode = (x: Course) => (x?.code ?? '').toString();
            const subjectCompare = safeSubject(a).localeCompare(safeSubject(b));
            const codeCompare = compareCourseCodes(safeCode(a), safeCode(b));
            const tiebreak = subjectCompare !== 0 ? subjectCompare : codeCompare;

            if (effectiveSort === 'az') {
                return mult * (subjectCompare !== 0 ? subjectCompare : codeCompare);
            }
            if (effectiveSort === 'units') {
                const optsA = parseUnitsOptions(a.units);
                const optsB = parseUnitsOptions(b.units);
                const hasA = optsA.length > 0;
                const hasB = optsB.length > 0;
                if (!hasA && !hasB) return tiebreak;
                if (!hasA) return 1;  // a (null) goes to bottom
                if (!hasB) return -1; // b (null) goes to bottom
                const minA = Math.min(...optsA);
                const minB = Math.min(...optsB);
                if (minA !== minB) return mult * (minA - minB);
                return tiebreak;
            }
            if (effectiveSort === 'hrsPerWeek') {
                const mA = metricsByCourseId.get(a.id);
                const mB = metricsByCourseId.get(b.id);
                const hrsA = mA?.hours;
                const hrsB = mB?.hours;
                const hasA = hrsA != null;
                const hasB = hrsB != null;
                if (!hasA && !hasB) return tiebreak;
                if (!hasA) return 1;
                if (!hasB) return -1;
                if (hrsA !== hrsB) return mult * (hrsA - hrsB);
                return tiebreak;
            }
            if (effectiveSort === 'hrsPerUnit') {
                const mA = metricsByCourseId.get(a.id);
                const mB = metricsByCourseId.get(b.id);
                const diffA = mA?.difficulty;
                const diffB = mB?.difficulty;
                const hasA = diffA != null;
                const hasB = diffB != null;
                if (!hasA && !hasB) return tiebreak;
                if (!hasA) return 1;
                if (!hasB) return -1;
                if (diffA !== diffB) return mult * (diffA - diffB);
                return tiebreak;
            }
            if (effectiveSort === 'rating') {
                const mA = metricsByCourseId.get(a.id);
                const mB = metricsByCourseId.get(b.id);
                const qA = mA?.quality;
                const qB = mB?.quality;
                const hasA = qA != null;
                const hasB = qB != null;
                if (!hasA && !hasB) return tiebreak;
                if (!hasA) return 1;
                if (!hasB) return -1;
                if (qA !== qB) return mult * (qA - qB);
                return tiebreak;
            }
            return mult * tiebreak;
        });
    }, [filteredResult, sortBy, effectiveSortOrder, metricsByCourseId]);

    const getSortDisplayValue = useCallback((course: Course): string | null => {
        const m = metricsByCourseId.get(course.id);
        const effectiveSort = ['units', 'hrsPerWeek', 'hrsPerUnit', 'rating'].includes(sortBy) ? sortBy : 'az';
        if (effectiveSort === 'hrsPerWeek' && m?.hours != null) return `${m.hours.toFixed(1)} hrs/wk`;
        if (effectiveSort === 'hrsPerUnit' && m?.difficulty != null) return `${m.difficulty.toFixed(1)} hrs/unit`;
        if (effectiveSort === 'rating') return null; // rating already shown on card
        if (effectiveSort === 'az' && m?.difficulty != null) return `${m.difficulty.toFixed(1)} hrs/unit`;
        return null;
    }, [metricsByCourseId, sortBy]);

    const getRatingForCourse = useCallback((course: Course): number | null => {
        const m = metricsByCourseId.get(course.id);
        return m?.quality ?? null;
    }, [metricsByCourseId]);

    const isEnriching = useCourseStore(state => state.isEnriching);

    const handleSetSortBy = useCallback((v: string) => {
        setSortBy(v);
        setSortOrder(getDefaultOrderForSort(v));
    }, [setSortBy, setSortOrder, getDefaultOrderForSort]);

    return { courses: displayCourses, isLoading, isEnriching, getSortDisplayValue, getRatingForCourse, sortBy, setSortBy: handleSetSortBy, sortOrder: effectiveSortOrder, setSortOrder };
}

import React, { useMemo, useCallback } from 'react';
import { useCourseStore } from '@/lib/store';
import { useCartStore } from '@/lib/cart-store';
import { useQueryState, parseAsArrayOf, parseAsString, parseAsBoolean, parseAsInteger } from 'nuqs';
import { parseMeetingTimes, timeToMinutes, isMeetingOptional } from '@/lib/schedule-utils';
import { getSchoolFromSubject, compareCourseCodes, getCrossListPrimaryMap, normalizeCourseId, resolveToCanonicalPrimary, formatLevel, parseUnitsOptions } from '@/lib/utils';
import type { Course } from '@/types/course';
import { searchCourses } from '@/lib/search-utils';

export function useFilteredCourses() {
    const { courses, isLoading } = useCourseStore();
    const cartItems = useCartStore(state => state.items);

    const [query] = useQueryState('q', { defaultValue: '' });
    const [selectedDepts] = useQueryState('depts', parseAsArrayOf(parseAsString).withDefault([]));
    const [selectedTerms] = useQueryState('terms', parseAsArrayOf(parseAsString).withDefault(['Spring 2026']));
    const [selectedFormats] = useQueryState('formats', parseAsArrayOf(parseAsString).withDefault([]));
    const [selectedLevels] = useQueryState('levels', parseAsArrayOf(parseAsString).withDefault([]));
    const [selectedGers] = useQueryState('gers', parseAsArrayOf(parseAsString).withDefault([]));
    const [selectedSchools] = useQueryState('schools', parseAsArrayOf(parseAsString).withDefault([]));

    const [unitMin] = useQueryState('unitMin', parseAsInteger.withDefault(1));
    const [unitMax] = useQueryState('unitMax', parseAsInteger.withDefault(5));
    const [timeMin] = useQueryState('timeMin', parseAsInteger.withDefault(420));
    const [timeMax] = useQueryState('timeMax', parseAsInteger.withDefault(1320));
    const [hideConflicts] = useQueryState('hideConflicts', parseAsBoolean.withDefault(false));
    const [hideUnavailable] = useQueryState('hideUnavailable', parseAsBoolean.withDefault(false));
    const [excludedWords] = useQueryState('exclude', parseAsArrayOf(parseAsString).withDefault([]));
    const [sortBy, setSortBy] = useQueryState('sort', parseAsString.withDefault('az'));
    const [sortOrder, setSortOrder] = useQueryState('order', parseAsString);

    // Default order per sort type: rating = high→low (desc), others = low→high (asc)
    const getDefaultOrderForSort = useCallback((s: string) =>
        (s === 'rating' ? 'desc' : 'asc') as 'asc' | 'desc', []);
    const effectiveSortOrder = sortOrder ?? getDefaultOrderForSort(sortBy);

    const filteredResult = useMemo(() => {
        // O(1) Set lookups for filter membership — faster than array .includes() per course
        const deptsSet = new Set(selectedDepts ?? []);
        const termsSet = new Set(selectedTerms ?? []);
        const formatsSet = new Set(selectedFormats ?? []);
        const levelsSet = new Set(selectedLevels ?? []);
        const gersSet = new Set(selectedGers ?? []);
        const schoolsSet = new Set(selectedSchools ?? []);
        const hasTermFilter = termsSet.size > 0 && !termsSet.has('any');

        // Start with all courses, excluding those without a grade basis (invalid)
        let result = courses.filter(c => c.grading && c.grading.trim() !== '' && c.grading !== 'TBD');

        // Cross-list: hide courses that are alternates; when A and B list each other, show only the canonical (alphabetically first)
        const primaryMap = getCrossListPrimaryMap(courses);
        result = result.filter(c => {
            const norm = normalizeCourseId(c.id);
            const canonical = resolveToCanonicalPrimary(norm, primaryMap);
            return canonical === norm;
        });

        // Filter by Excluded Keywords
        if (excludedWords && excludedWords.length > 0) {
            const excludedSet = new Set(excludedWords.map(w => w.toLowerCase()));
            result = result.filter(c => {
                const textToCheck = `${c.title} ${c.description} ${c.code}`.toLowerCase();
                return ![...excludedSet].some(word => textToCheck.includes(word));
            });
        }

        // Filter by Department
        if (deptsSet.size > 0) {
            result = result.filter(c => deptsSet.has(c.subject));
        }

        // Filter by Term
        if (hasTermFilter) {
            result = result.filter(c => {
                if (c.terms) {
                    return c.terms.some(t => termsSet.has(t));
                }
                return c.selectedTerm != null && termsSet.has(c.selectedTerm);
            });
        }

        // Filter by Format (Component)
        // When sections is empty (Phase 1 / light data), include course so we don't incorrectly hide during enrichment
        if (formatsSet.size > 0) {
            result = result.filter(c => {
                if (!c.sections || c.sections.length === 0) return true;
                return c.sections.some(s => s.component && formatsSet.has(s.component));
            });
        }


        // Filter by Level (Undergrad/Grad etc) - normalize classLevel for matching; fallback to course code
        if (levelsSet.size > 0) {
            result = result.filter(c => {
                const inferFromCode = () => levelsSet.has(formatLevel(c.code || ''));
                if (c.sections && c.sections.length > 0) {
                    const sectionsToCheck = hasTermFilter
                        ? c.sections.filter(s => s.term && termsSet.has(s.term))
                        : c.sections;
                    const sectionMatch = sectionsToCheck.length > 0
                        ? sectionsToCheck.some(s => s.classLevel && String(s.classLevel).trim() && levelsSet.has(formatLevel(s.classLevel)))
                        : false;
                    if (sectionMatch) return true;
                }
                return inferFromCode();
            });
        }

        // Filter by GERs
        // When sections is empty (Phase 1 / light data), include course so we don't incorrectly hide during enrichment
        if (gersSet.size > 0) {
            result = result.filter(c => {
                if (!c.sections || c.sections.length === 0) return true;
                return c.sections.some(s => s.gers && s.gers.some(g => gersSet.has(g)));
            });
        }


        // Filter by unit range (slider: unitMin–unitMax) - use parseUnitsOptions for variable units
        const unitsFilterActive = unitMin > 1 || unitMax < 5;
        if (unitsFilterActive) {
            const min = Math.max(1, unitMin);
            const max = Math.min(5, unitMax);
            const maxOpen = max >= 5;
            result = result.filter(c => {
                const checkUnits = (uStr: string | number) => {
                    const opts = parseUnitsOptions(uStr);
                    if (opts.length === 0) return false;
                    return opts.some(u => u >= min && (maxOpen ? true : u <= max));
                };
                if (c.sections && c.sections.length > 0) {
                    const sectionsToCheck = hasTermFilter
                        ? c.sections.filter(s => s.term && termsSet.has(s.term))
                        : c.sections;
                    const sectionMatch = sectionsToCheck.length > 0
                        ? sectionsToCheck.some(s => checkUnits(s.units))
                        : false;
                    if (sectionMatch) return true;
                }
                return checkUnits(c.units);
            });
        }

        // Filter by start time range (minutes from midnight, 0–1440) - handle hyphen and en dash
        // When sections is empty (Phase 1 / light data), include course so we don't incorrectly hide during enrichment
        const timeFilterActive = timeMin > 420 || timeMax < 1320;
        if (timeFilterActive) {
            const min = Math.max(420, timeMin);
            const max = Math.min(1320, timeMax);
            result = result.filter(c => {
                if (!c.sections || c.sections.length === 0) return true;
                return c.sections.some(s => s.meetings?.some(m => {
                    const timeStr = m.time || '';
                    const startStr = timeStr.split(/\s*[-–]\s*/)[0]?.trim() || timeStr;
                    const startMins = timeToMinutes(startStr);
                    return startMins >= min && startMins <= max;
                }));
            });
        }

        // WIM filter is now handled by standard GER filtering

        // Filter by Conflicts
        if (hideConflicts) {
            const hasOverlap = (m1: any, m2: any, cartItem?: any) => {
                // Check Days - but exclude optional days from cartItem
                let commonDays = m1.days.filter((d: string) => m2.days.includes(d));

                // If cartItem is provided, filter out optional days
                if (cartItem) {
                    commonDays = commonDays.filter((day: string) => {
                        return !isMeetingOptional(cartItem, day, m2.startTime, m2.endTime);
                    });
                }

                if (commonDays.length === 0) return false;

                // Check Times
                const start1 = timeToMinutes(m1.startTime);
                const end1 = timeToMinutes(m1.endTime);
                const start2 = timeToMinutes(m2.startTime);
                const end2 = timeToMinutes(m2.endTime);

                return start1 < end2 && start2 < end1;
            };

            const parseSectionMeetings = (section: any) => {
                return section.meetings.flatMap((m: any) => {
                    let days: string[] = [];
                    if (typeof m.days === 'string') days = m.days.split(/[ ,]+/);

                    // Normalize Days (Mon, Tue...)
                    const normalizedDays = days.map((d: string) => {
                        const lower = d.toLowerCase();
                        if (lower.startsWith('m')) return 'Mon';
                        if (lower.startsWith('tu')) return 'Tue';
                        if (lower.startsWith('w')) return 'Wed';
                        if (lower.startsWith('th')) return 'Thu';
                        if (lower.startsWith('f')) return 'Fri';
                        return '';
                    }).filter(Boolean);

                    let startTime = '', endTime = '';
                    if (m.time && m.time.includes('-')) {
                        [startTime, endTime] = m.time.split('-').map((s: string) => s.trim());
                    }

                    if (!startTime) return [];

                    return [{
                        days: normalizedDays,
                        startTime,
                        endTime
                    }];
                });
            };

            result = result.filter(c => {
                if (!c.sections || c.sections.length === 0) return true;

                let sectionsToCheck = c.sections;
                if (termsSet.size > 0) {
                    sectionsToCheck = sectionsToCheck.filter(s => termsSet.has(s.term));
                }

                if (sectionsToCheck.length === 0) return true;

                // A course is valid if AT LEAST ONE section does not overlap
                return sectionsToCheck.some(section => {
                    const cartItemsForTerm = cartItems.filter(item => item.selectedTerm === section.term);
                    if (cartItemsForTerm.length === 0) return true;

                    const sectionMeetings = parseSectionMeetings(section);
                    if (sectionMeetings.length === 0) return true;

                    const isOverlapping = cartItemsForTerm.some(cartItem => {
                        // Do not conflict a course with itself
                        if (cartItem.id === c.id) return false;

                        const cartMeetings = parseMeetingTimes(cartItem, cartItem.selectedTerm);
                        // Check conflicts, but pass cartItem to hasOverlap to exclude optional days
                        return cartMeetings.some(cm =>
                            sectionMeetings.some((sm: any) => hasOverlap(sm, cm, cartItem))
                        );
                    });

                    return !isOverlapping;
                });
            });
        }

        // Filter by Availability
        if (hideUnavailable) {
            result = result.filter(c => {
                if (!c.sections || c.sections.length === 0) return true; // No data yet → keep
                let sectionsToCheck = c.sections;
                if (termsSet.size > 0) {
                    sectionsToCheck = sectionsToCheck.filter(s => termsSet.has(s.term));
                }
                if (sectionsToCheck.length === 0) return true; // No sections for selected terms → keep
                return sectionsToCheck.some(s => s.status?.toLowerCase() === 'open');
            });
        }

        // Filter by School
        if (schoolsSet.size > 0) {
            result = result.filter(c => {
                const school = getSchoolFromSubject(c.subject);
                return schoolsSet.has(school);
            });
        }

        // Filter by Query
        if (query) {
            const beforeSearch = result;
            result = searchCourses(result, query);
            // If the user searched for an alternate course code (e.g. "cs 238v"), include the primary course so it shows up
            const queryNorm = normalizeCourseId(query.trim().replace(/\s+/g, ''));
            if (queryNorm) {
                const primaryMap = getCrossListPrimaryMap(courses);
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
    }, [courses, query, selectedDepts, selectedTerms, selectedFormats, selectedLevels, selectedGers, selectedSchools, unitMin, unitMax, timeMin, timeMax, hideConflicts, hideUnavailable, cartItems, excludedWords]);

    // Precompute difficulty/hours/rating per course (with cross-list lookup) — O(n) total, not O(n²)
    const metricsByCourseId = useMemo(() => {
        const map = new Map<string, { difficulty?: number; hours?: number; quality?: number }>();
        const primaryMap = getCrossListPrimaryMap(courses);
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
    }, [courses]);

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

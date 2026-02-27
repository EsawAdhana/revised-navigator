import { useMemo, useEffect, useCallback } from 'react';
import { useCourseStore } from '@/lib/store';
import { useCartStore } from '@/lib/cart-store';
import { useQueryState, useQueryStates, parseAsArrayOf, parseAsString, parseAsBoolean, parseAsInteger } from 'nuqs';
import { parseMeetingTimes, timeToMinutes, isMeetingOptional, getWeeklyContactHours } from '@/lib/schedule-utils';
import { getSchoolFromSubject, getCourseUnitsNumeric, compareCourseCodes, getCrossListPrimaryMap, normalizeCourseId, resolveToCanonicalPrimary, formatLevel, parseUnitsOptions } from '@/lib/utils';
// Removing isWimCourse import as WIM is now handled as a standard GER
import { useEvaluationStore } from '@/lib/evaluation-store';
import { aggregateMetrics, getOverallEvalScore } from '@/components/course-evaluations';
import type { Course } from '@/types/course';
import { searchCourses } from '@/lib/search-utils';

const DEFAULT_SORT_DIR: Record<string, 'asc' | 'desc'> = {
    quality: 'desc',
    az: 'asc',
    units: 'asc',
    hours: 'asc',
    hours_per_unit: 'asc',
};

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
    // WIM is now handled as a standard GER, so we no longer need a separate wimOnly query state.
    const [excludedWords] = useQueryState('exclude', parseAsArrayOf(parseAsString).withDefault([]));
    const [{ sortBy, sortDir }, setSortState] = useQueryStates({
        sortBy: parseAsString.withDefault('az'),
        sortDir: parseAsString.withDefault('asc'),
    });
    const getEvaluations = useEvaluationStore(state => state.getEvaluations);
    const fetchBulkEvaluations = useEvaluationStore(state => state.fetchBulkEvaluations);
    const evaluations = useEvaluationStore(state => state.evaluations);
    const isBulkLoading = useEvaluationStore(state => state.isBulkLoading);

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
    }, [courses, query, selectedDepts, selectedTerms, selectedFormats, selectedLevels, selectedGers, selectedSchools, unitMin, unitMax, timeMin, timeMax, hideConflicts, cartItems, excludedWords, evaluations]);

    useEffect(() => {
        if ((sortBy === 'quality' || sortBy === 'hours' || sortBy === 'hours_per_unit') && filteredResult.length > 0) {
            fetchBulkEvaluations(filteredResult.map(c => c.id).slice(0, 500));
        }
    }, [sortBy, filteredResult, fetchBulkEvaluations]);

    // Cache for expensive sort values (quality, hours, etc.) to avoid O(N log N) recalculations
    const sortValueCache = useMemo(() => new Map<string, number | null>(), []);

    // Clear cache when evaluations change significantly (e.g. bulk load finished)
    useEffect(() => {
        sortValueCache.clear();
    }, [evaluations, sortValueCache]);

    // Derive displayCourses synchronously via useMemo — no useEffect delay. Filter/sort changes
    // update in the same render cycle, eliminating the "split second" lag.
    const { displayCourses, isInternalLoading } = useMemo(() => {
        if (filteredResult.length === 0) {
            return { displayCourses: [] as Course[], isInternalLoading: false };
        }

        const sortKey = sortBy === 'default' ? 'az' : sortBy;
        const dir = sortDir === 'desc' ? 'desc' : 'asc';
        const needsEvalSort = sortBy === 'quality' || sortBy === 'hours' || sortBy === 'hours_per_unit' || sortBy === 'quality_per_unit' || sortBy === 'efficiency';

        const getSortValueCached = (c: Course): number | null => {
            const cacheKey = `${c.id}-${sortKey}`;
            if (sortValueCache.has(cacheKey)) return sortValueCache.get(cacheKey)!;

            let val: number | null = null;
            if (sortKey === 'units') {
                val = getCourseUnitsNumeric(c);
            } else {
                const units = getCourseUnitsNumeric(c);
                const evals = getEvaluations(c.id);
                const metrics = evals.length > 0 ? aggregateMetrics(evals) : null;
                const quality = metrics?.quality;
                if (sortKey === 'hours') val = evals.length > 0 && metrics?.hours != null ? metrics.hours : null;
                else if (sortKey === 'hours_per_unit') val = (evals.length > 0 && metrics?.hours != null && units > 0) ? metrics.hours / units : null;
                else if (sortKey === 'quality') val = evals.length > 0 ? getOverallEvalScore(metrics) : null;
                else if (sortKey === 'quality_per_unit') val = (quality != null && units > 0) ? quality / units : null;
                else if (sortKey === 'efficiency') {
                    const scheduled = getWeeklyContactHours(c);
                    val = (quality != null && scheduled > 0) ? quality / scheduled : null;
                }
            }

            sortValueCache.set(cacheKey, val);
            return val;
        };

        const sortVal = (v: number | null): number | null => (v === 0 ? null : v);

        const performSort = (list: Course[]) => {
            return [...list].sort((a, b) => {
                if (sortKey === 'az' || !sortKey) {
                    const subjectCompare = a.subject.localeCompare(b.subject);
                    const codeCompare = compareCourseCodes(a.code, b.code);
                    const cmp = subjectCompare !== 0 ? subjectCompare : codeCompare;
                    return dir === 'desc' ? -cmp : cmp;
                }
                const va = sortVal(getSortValueCached(a));
                const vb = sortVal(getSortValueCached(b));
                const mult = dir === 'desc' ? -1 : 1;
                if (va == null && vb == null) {
                    const subjectCompare = a.subject.localeCompare(b.subject);
                    if (subjectCompare !== 0) return subjectCompare;
                    return compareCourseCodes(a.code, b.code);
                }
                if (va == null) return 1;
                if (vb == null) return -1;
                if (va !== vb) return mult * (va > vb ? 1 : -1);
                const subjectCompare = a.subject.localeCompare(b.subject);
                if (subjectCompare !== 0) return subjectCompare;
                return compareCourseCodes(a.code, b.code);
            });
        };

        const baselineAz = (list: Course[]) =>
            [...list].sort((a, b) => {
                const subjectCompare = a.subject.localeCompare(b.subject);
                return subjectCompare !== 0 ? subjectCompare : compareCourseCodes(a.code, b.code);
            });

        const hasEvaluationsForSort = filteredResult.slice(0, 500).some(c => c.id in evaluations);
        const evalsReady = !needsEvalSort || (hasEvaluationsForSort && !isBulkLoading);

        if (!evalsReady) {
            return { displayCourses: baselineAz(filteredResult), isInternalLoading: true };
        }
        return { displayCourses: performSort(filteredResult), isInternalLoading: false };
    }, [filteredResult, sortBy, sortDir, getEvaluations, evaluations, sortValueCache, isBulkLoading]);

    /** Display string for the current sort criterion (e.g. "4.5/5.0" for quality). Null only for A-Z or Units; show "—" when sort is set but no value. */
    const getSortDisplayValue = useCallback((course: Course): string | null => {
        const sortKey = sortBy === 'default' ? 'az' : sortBy;
        if (sortKey === 'az' || !sortKey) return null;
        if (sortKey === 'units') return null;
        const evals = getEvaluations(course.id);
        const metrics = evals.length > 0 ? aggregateMetrics(evals) : null;
        const units = getCourseUnitsNumeric(course);
        const empty = '—';
        if (sortKey === 'quality') {
            const score = metrics ? getOverallEvalScore(metrics) : null;
            if (score == null || score === 0) return empty;
            return `${score.toFixed(1)}/5.0`;
        }
        if (sortKey === 'hours') {
            const hours = metrics?.hours;
            if (hours == null || hours === 0) return empty;
            return `${hours.toFixed(1)} hrs/wk`;
        }
        if (sortKey === 'hours_per_unit') {
            const hours = metrics?.hours;
            if (hours == null || units <= 0) return empty;
            const val = hours / units;
            if (val === 0) return empty;
            return `${val.toFixed(1)} hrs/unit`;
        }
        return null;
    }, [sortBy, getEvaluations, evaluations]);

    const isEnriching = useCourseStore(state => state.isEnriching);
    const needsEvalSort = sortBy === 'quality' || sortBy === 'hours' || sortBy === 'hours_per_unit';
    const hasEvaluationsForSort = filteredResult
        .slice(0, 500)
        .some(c => c.id in evaluations);
    const isSortLoading = (needsEvalSort && filteredResult.length > 0 && (isBulkLoading || !hasEvaluationsForSort)) || isInternalLoading;

    const setSortBy = useCallback((value: string) => {
        setSortState({ sortBy: value, sortDir: (DEFAULT_SORT_DIR[value] ?? 'asc') as 'asc' | 'desc' });
    }, [setSortState]);
    const setSortDir = useCallback((value: 'asc' | 'desc') => {
        setSortState({ sortDir: value });
    }, [setSortState]);

    return { courses: displayCourses, isLoading, isEnriching, isSortLoading, sortBy, setSortBy, sortDir, setSortDir, getSortDisplayValue };
}

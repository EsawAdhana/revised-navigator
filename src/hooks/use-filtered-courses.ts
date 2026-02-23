import { useMemo, useEffect, useCallback } from 'react';
import { useCourseStore } from '@/lib/store';
import { useCartStore } from '@/lib/cart-store';
import { useQueryState, parseAsArrayOf, parseAsString, parseAsBoolean, parseAsInteger } from 'nuqs';
import { parseMeetingTimes, timeToMinutes, isMeetingOptional, getWeeklyContactHours } from '@/lib/schedule-utils';
import { getSchoolFromSubject, getCourseUnitsNumeric } from '@/lib/utils';
// Removing isWimCourse import as WIM is now handled as a standard GER
import { useEvaluationStore } from '@/lib/evaluation-store';
import { aggregateMetrics, getOverallEvalScore } from '@/components/course-evaluations';
import type { Course } from '@/types/course';

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
    const [sortBy, setSortBy] = useQueryState('sortBy', parseAsString.withDefault('az'));
    const [sortDir, setSortDir] = useQueryState('sortDir', parseAsString.withDefault('asc'));
    const getEvaluations = useEvaluationStore(state => state.getEvaluations);
    const fetchBulkEvaluations = useEvaluationStore(state => state.fetchBulkEvaluations);
    const evaluations = useEvaluationStore(state => state.evaluations);

    const filteredResult = useMemo(() => {
        // Start with all courses
        let result = courses;

        // Filter by Excluded Keywords
        if (excludedWords && excludedWords.length > 0) {
            result = result.filter(c => {
                const textToCheck = `${c.title} ${c.description} ${c.code}`.toLowerCase();
                return !excludedWords.some(word => textToCheck.includes(word.toLowerCase()));
            });
        }

        // Filter by Department
        if (selectedDepts && selectedDepts.length > 0) {
            result = result.filter(c => selectedDepts.includes(c.subject));
        }

        // Filter by Term
        if (selectedTerms && selectedTerms.length > 0 && !selectedTerms.includes('any')) {
            result = result.filter(c => {
                if (c.terms) {
                    return c.terms.some(t => selectedTerms.includes(t));
                }
                return c.term && selectedTerms.includes(c.term);
            });
        }

        // Filter by Format (Component)
        if (selectedFormats && selectedFormats.length > 0) {
            result = result.filter(c => {
                if (c.sections && c.sections.length > 0) {
                    return c.sections.some(s => s.component && selectedFormats.includes(s.component));
                }
                return false;
            });
        }


        // Filter by Level (Undergrad/Grad etc)
        if (selectedLevels && selectedLevels.length > 0) {
            result = result.filter(c => {
                if (c.sections && c.sections.length > 0) {
                    return c.sections.some(s => s.classLevel && selectedLevels.includes(s.classLevel));
                }
                return false;
            });
        }

        // Filter by GERs
        if (selectedGers && selectedGers.length > 0) {
            result = result.filter(c => {
                if (c.sections && c.sections.length > 0) {
                    return c.sections.some(s => s.gers && s.gers.some(g => selectedGers.includes(g)));
                }
                return false;
            });
        }


        // Filter by unit range (slider: unitMin–unitMax)
        const unitsFilterActive = unitMin > 1 || unitMax < 5;
        if (unitsFilterActive) {
            const min = Math.max(1, unitMin);
            const max = Math.min(5, unitMax);
            result = result.filter(c => {
                const checkUnits = (uStr: string | number) => {
                    if (!uStr) return false;
                    const u = typeof uStr === 'string' ? parseFloat(uStr) : uStr;
                    if (isNaN(u)) return false;
                    return u >= min && (max >= 5 ? true : u <= max);
                };
                if (c.sections && c.sections.length > 0) {
                    return c.sections.some(s => checkUnits(s.units));
                }
                const mainUnits = parseFloat(c.units);
                if (!isNaN(mainUnits)) return checkUnits(mainUnits);
                return false;
            });
        }

        // Filter by start time range (minutes from midnight, 0–1440)
        const timeFilterActive = timeMin > 420 || timeMax < 1320;
        if (timeFilterActive) {
            const min = Math.max(420, timeMin);
            const max = Math.min(1320, timeMax);
            result = result.filter(c => {
                if (c.sections && c.sections.length > 0) {
                    return c.sections.some(s => s.meetings.some(m => {
                        const startStr = m.time && m.time.includes('-') ? m.time.split('-')[0].trim() : m.time;
                        const startMins = timeToMinutes(startStr || '');
                        return startMins >= min && startMins <= max;
                    }));
                }
                return false;
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
                if (selectedTerms && selectedTerms.length > 0) {
                    sectionsToCheck = sectionsToCheck.filter(s => selectedTerms.includes(s.term));
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
        if (selectedSchools && selectedSchools.length > 0) {
            result = result.filter(c => {
                const school = getSchoolFromSubject(c.subject);
                return selectedSchools.includes(school);
            });
        }


        // Filter by Query
        if (query) {
            const lowerQuery = query.toLowerCase().trim()
            const compactQuery = lowerQuery.replace(/\s+/g, '')
            const parts = lowerQuery.split(/\s+/).filter(Boolean)

            const allSubjects = new Set(courses.map(c => c.subject))

            let subject = parts[0]?.toUpperCase() || ''
            let remainingQuery = parts.slice(1).join(' ')

            // Support searches like "cs106a" as well as "cs 106a"
            if (parts.length === 1 && compactQuery) {
                const m = compactQuery.match(/^([a-z&]+)(\d.*)$/i)
                if (m) {
                    const maybeSubject = m[1].toUpperCase()
                    if (allSubjects.has(maybeSubject)) {
                        subject = maybeSubject
                        remainingQuery = m[2]
                    }
                }
            }

            const isSubjectSearch = Boolean(subject) && allSubjects.has(subject)

            if (isSubjectSearch) {
                result = result.filter(c => c.subject === subject)

                if (remainingQuery) {
                    const remainingLower = remainingQuery.toLowerCase().trim()
                    const remainingCompact = remainingLower.replace(/\s+/g, '')
                    result = result.filter(c => {
                        const codeCompact = (c.code || '').toLowerCase().replace(/\s+/g, '')
                        if (codeCompact.includes(remainingCompact)) return true
                        if ((c.title || '').toLowerCase().includes(remainingLower)) return true
                        return false
                    })
                }
            } else {
                result = result.filter(c => {
                    const subjectCodeSpaced = `${c.subject} ${c.code}`.toLowerCase()
                    const subjectCodeCompact = `${c.subject}${c.code}`.toLowerCase().replace(/\s+/g, '')
                    const codeCompact = (c.code || '').toLowerCase().replace(/\s+/g, '')

                    if (subjectCodeSpaced.startsWith(lowerQuery)) return true
                    if (subjectCodeCompact.startsWith(compactQuery)) return true
                    if (codeCompact.includes(compactQuery)) return true
                    if ((c.title || '').toLowerCase().includes(lowerQuery)) return true
                    if (c.instructors && c.instructors.some(i => i.toLowerCase().includes(lowerQuery))) return true
                    return false
                })
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

    // Sort is the absolute last step: operate only on the fully filtered list (filteredResult)
    const filteredCourses = useMemo(() => {
        const listToSort = filteredResult;
        const sortKey = sortBy === 'default' ? 'az' : sortBy;
        const dir = sortDir === 'desc' ? 'desc' : 'asc';

        const getSortValue = (c: Course): number | null => {
            if (sortKey === 'units') return getCourseUnitsNumeric(c);
            const units = getCourseUnitsNumeric(c);
            const evals = getEvaluations(c.id);
            const metrics = evals.length > 0 ? aggregateMetrics(evals) : null;
            const quality = metrics?.quality;
            // Hours/Wk: total median reported hours (from evaluations chart)
            if (sortKey === 'hours') return evals.length > 0 && metrics?.hours != null ? metrics.hours : null;
            // Difficulty: total median reported hours / unit count (from evaluations)
            if (sortKey === 'hours_per_unit') return (evals.length > 0 && metrics?.hours != null && units > 0) ? metrics.hours / units : null;
            const scheduleHours = getWeeklyContactHours(c);
            // Course rating: average of instruction quality, learning, organization (the three chart ratings, 5-point scale)
            if (sortKey === 'quality') return evals.length > 0 ? getOverallEvalScore(metrics) : null;
            if (sortKey === 'quality_per_unit') return (quality != null && units > 0) ? quality / units : -1;
            if (sortKey === 'efficiency') return (quality != null && scheduleHours > 0) ? quality / scheduleHours : -1;
            return null;
        };

        // Treat 0 as null so missing/no data sorts to the end
        const sortVal = (v: number | null): number | null => (v === 0 ? null : v);

        const sortedResult = [...listToSort].sort((a, b) => {
            if (sortKey === 'az' || !sortKey) {
                const subjectCompare = a.subject.localeCompare(b.subject);
                const codeCompare = a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
                const cmp = subjectCompare !== 0 ? subjectCompare : codeCompare;
                return dir === 'desc' ? -cmp : cmp;
            }
            const va = sortVal(getSortValue(a));
            const vb = sortVal(getSortValue(b));
            const mult = dir === 'desc' ? -1 : 1;
            if (va == null && vb == null) {
                const subjectCompare = a.subject.localeCompare(b.subject);
                if (subjectCompare !== 0) return subjectCompare;
                return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
            }
            if (va == null) return 1;
            if (vb == null) return -1;
            if (va !== vb) return mult * (va > vb ? 1 : -1);
            const subjectCompare = a.subject.localeCompare(b.subject);
            if (subjectCompare !== 0) return subjectCompare;
            return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
        });

        return sortedResult;
    }, [filteredResult, sortBy, sortDir, getEvaluations]);

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
    }, [sortBy, getEvaluations]);

    const isEnriching = useCourseStore(state => state.isEnriching);
    return { courses: filteredCourses, isLoading, isEnriching, sortBy, setSortBy, sortDir, setSortDir, getSortDisplayValue };
}

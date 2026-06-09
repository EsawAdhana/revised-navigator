'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { useCourseStore } from '@/lib/store';
import { SiteHeader } from '@/components/site-header';
import { useCartStore } from '@/lib/cart-store';
import { searchCourses } from '@/lib/search-utils';
import { compareCourseCodes, getCrossListPrimaryMap, normalizeCourseId, resolveToCanonicalPrimary } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const CourseDetailContent = dynamic(
  () => import('@/components/course-detail-content').then(m => ({ default: m.CourseDetailContent })),
  { ssr: false }
);

export function CoursePageClient() {
    const params = useParams();
    const router = useRouter();
    const rawCourseId = params.courseId as string;
    const courseId = (() => {
        try {
            return decodeURIComponent(rawCourseId);
        } catch {
            return rawCourseId;
        }
    })();
    const [mounted, setMounted] = useState(false);

    const [query] = useQueryState('q', { defaultValue: '' });
    const courses = useCourseStore(s => s.courses);
    const hasLoaded = useCourseStore(s => s.hasLoaded);
    const enrichedCourseIds = useCourseStore(s => s.enrichedCourseIds);
    const fetchCourseDetail = useCourseStore(s => s.fetchCourseDetail);
    const getItem = useCartStore(s => s.getItem);

    useEffect(() => {
        setMounted(true);
    }, []);

    const prevQueryAndId = useRef({ query: (query || '').trim(), courseId });

    // Top search match for the redirect effect only — avoids running the full
    // filter/sort/metrics pipeline on the detail page. Computed only when there's a query.
    const firstSearchMatch = useMemo(() => {
        const q = (query || '').trim();
        if (!q || courses.length === 0) return undefined;
        const valid = courses.filter(c => c.grading && c.grading.trim() !== '' && c.grading !== 'TBD');
        const matches = searchCourses(valid, q);
        if (matches.length === 0) return undefined;
        return [...matches].sort((a, b) => {
            const subjectCompare = (a.subject ?? '').localeCompare(b.subject ?? '');
            return subjectCompare !== 0 ? subjectCompare : compareCourseCodes(a.code ?? '', b.code ?? '');
        })[0];
    }, [query, courses]);

    useEffect(() => {
        const currentQuery = (query || '').trim();
        const prev = prevQueryAndId.current;
        prevQueryAndId.current = { query: currentQuery, courseId };

        if (currentQuery === prev.query) return;
        if (courseId !== prev.courseId) return;

        if (!currentQuery || !firstSearchMatch) return;

        if (firstSearchMatch.id !== courseId) {
            const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
            searchParams.set('q', currentQuery);
            const rest = searchParams.toString();
            router.push(rest ? `/courses/${encodeURIComponent(firstSearchMatch.id)}?${rest}` : `/courses/${encodeURIComponent(firstSearchMatch.id)}`);
        }
    }, [query, courseId, firstSearchMatch, router]);

    const course = useMemo(() => {
        let found = courses.find(c => c.id === courseId);
        if (!found) {
            const cartItem = getItem(courseId);
            if (cartItem) found = cartItem;
        }
        return found;
    }, [courses, courseId, getItem]);

    useEffect(() => {
        if (hasLoaded && course && !enrichedCourseIds.has(courseId)) {
            fetchCourseDetail(courseId);
        }
    }, [hasLoaded, course, courseId, enrichedCourseIds, fetchCourseDetail]);

    useEffect(() => {
        if (!hasLoaded || !course || !courses.length) return;
        const primaryMap = getCrossListPrimaryMap(courses);
        const norm = normalizeCourseId(courseId);
        const canonicalNorm = resolveToCanonicalPrimary(norm, primaryMap);
        if (canonicalNorm === norm) return;
        const primaryCourse = courses.find(c => normalizeCourseId(c.id) === canonicalNorm);
        if (primaryCourse && primaryCourse.id !== courseId) {
            const search = typeof window !== 'undefined' ? window.location.search : '';
            router.replace(`/courses/${encodeURIComponent(primaryCourse.id)}${search || ''}`);
        }
    }, [hasLoaded, course, courseId, courses, router]);

    if (!mounted) {
        return (
            <div className="min-h-screen bg-background flex flex-col">
                <SiteHeader />
                <main className="flex-1 bg-background">
                    <div className="flex flex-1 items-center justify-center">
                        <div className="flex flex-col items-center gap-3 animate-fade-in mt-32">
                            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
                            <span className="text-sm text-muted-foreground">Loading class information...</span>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <SiteHeader />
            <main className="flex-1 bg-background">
                {(!hasLoaded && !course) || (hasLoaded && course && !enrichedCourseIds.has(courseId)) ? (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="flex flex-col items-center gap-3 animate-fade-in mt-32">
                            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
                            <span className="text-sm text-muted-foreground">Loading class information...</span>
                        </div>
                    </div>
                ) : !course ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 mt-32">
                        <h1 className="text-2xl font-bold">Course Not Found</h1>
                        <p className="text-muted-foreground">The course you are looking for does not exist or has been removed.</p>
                    </div>
                ) : (
                    <CourseDetailContent course={course} />
                )}
            </main>
        </div>
    );
}

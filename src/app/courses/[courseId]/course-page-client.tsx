'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import type { Course } from '@/types/course';
import { useCourseStore, hasFullCourseData } from '@/lib/store';
import { SiteHeader } from '@/components/site-header';
import { useCartStore } from '@/lib/cart-store';
import { searchCourses } from '@/lib/search-utils';
import { compareCourseCodes, getCrossListPrimaryMap, normalizeCourseId, resolveToCanonicalPrimary } from '@/lib/utils';
import { Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const CourseDetailContent = dynamic(
  () => import('@/components/course-detail-content').then(m => ({ default: m.CourseDetailContent })),
  { ssr: false }
);

export function CoursePageClient({ initialCourse }: { initialCourse?: Course | null }) {
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
    // Tracks when the CourseDetailContent chunk has loaded. `dynamic()` starts
    // the same import on first render; this resolves alongside it.
    const [contentChunkReady, setContentChunkReady] = useState(false);
    useEffect(() => {
        let alive = true;
        import('@/components/course-detail-content').then(
            () => { if (alive) setContentChunkReady(true); },
            () => { /* chunk load failure — leave the SSR summary visible */ }
        );
        return () => { alive = false; };
    }, []);

    const [query] = useQueryState('q', { defaultValue: '' });
    const courses = useCourseStore(s => s.courses);
    const hasLoaded = useCourseStore(s => s.hasLoaded);
    const hasEnriched = useCourseStore(s => s.hasEnriched);
    const fetchCourseDetail = useCourseStore(s => s.fetchCourseDetail);
    const failedDetailIds = useCourseStore(s => s.failedDetailIds);
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
        // Prefer the server-fetched course over a light catalog row (no
        // sections/description yet) so the detail view renders immediately
        // instead of waiting for catalog enrichment.
        if ((!found || !hasFullCourseData(found)) && initialCourse && initialCourse.id === courseId) {
            found = initialCourse;
        }
        if (!found) {
            const cartItem = getItem(courseId);
            if (cartItem) found = cartItem;
        }
        return found;
    }, [courses, courseId, getItem, initialCourse]);

    // Resolve the catalog course for this URL id, tolerant of casing/spacing and
    // cross-list alternates (e.g. "cs106a" or "CS 106A" -> "CS106A"). Used to
    // redirect to the canonical id so the (case-sensitive) detail API resolves.
    const resolvedTarget = useMemo(() => {
        if (!courses.length) return undefined;
        const primaryMap = getCrossListPrimaryMap(courses);
        const canonicalNorm = resolveToCanonicalPrimary(normalizeCourseId(courseId), primaryMap);
        return courses.find(c => normalizeCourseId(c.id) === canonicalNorm);
    }, [courses, courseId]);

    // True while we have a matching course under a different id and are about to
    // redirect — show the loader instead of flashing "Course Not Found".
    const isRedirecting = Boolean(hasLoaded && !course && resolvedTarget && resolvedTarget.id !== courseId);

    const isDetailReady = Boolean(
        course && (hasEnriched || hasFullCourseData(course))
    );

    const detailFailed = Boolean(
        hasLoaded && course && !isDetailReady && failedDetailIds.has(courseId)
    );

    const retryDetail = () => {
        useCourseStore.setState(state => {
            const next = new Set(state.failedDetailIds);
            next.delete(courseId);
            return { failedDetailIds: next };
        });
        fetchCourseDetail(courseId);
    };

    useEffect(() => {
        if (hasLoaded && course && !isDetailReady) {
            fetchCourseDetail(courseId);
        }
    }, [hasLoaded, course, courseId, isDetailReady, fetchCourseDetail]);

    // The server renders a crawlable course summary (#ssr-course-summary) for SEO.
    // Once the interactive view is ready, hide it so users don't see duplicate content;
    // if loading fails it stays as a graceful fallback.
    useEffect(() => {
        if (course && isDetailReady && contentChunkReady) {
            document.getElementById('ssr-course-summary')?.style.setProperty('display', 'none');
        }
    }, [course, isDetailReady, contentChunkReady]);

    useEffect(() => {
        if (!hasLoaded || !resolvedTarget) return;
        if (resolvedTarget.id !== courseId) {
            const search = typeof window !== 'undefined' ? window.location.search : '';
            router.replace(`/courses/${encodeURIComponent(resolvedTarget.id)}${search || ''}`);
        }
    }, [hasLoaded, courseId, resolvedTarget, router]);

    if (!mounted) {
        return (
            <div className="min-h-screen bg-background flex flex-col">
                <SiteHeader />
                <main className="flex-1 bg-background">
                    {isDetailReady && course ? (
                        <CourseDetailContent key={course.id} course={course} />
                    ) : (
                        <div className="flex flex-1 items-center justify-center">
                            <div className="flex flex-col items-center gap-3 animate-fade-in mt-32">
                                <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
                                <span className="text-sm text-muted-foreground">Loading class information...</span>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <SiteHeader />
            <main className="flex-1 bg-background">
                {detailFailed ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 mt-32 px-4 text-center">
                        <AlertCircle className="h-8 w-8 text-muted-foreground" />
                        <div className="space-y-1">
                            <h1 className="text-lg font-semibold">Couldn&apos;t load this class</h1>
                            <p className="text-sm text-muted-foreground">Something went wrong fetching the class details.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button onClick={retryDetail}>Try again</Button>
                            <Button variant="outline" asChild>
                                <Link href="/browse">Back to browse</Link>
                            </Button>
                        </div>
                    </div>
                ) : ((!hasLoaded && !course) || (hasLoaded && course && !isDetailReady) || isRedirecting) ? (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="flex flex-col items-center gap-3 animate-fade-in mt-32">
                            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
                            <span className="text-sm text-muted-foreground">Loading class information...</span>
                        </div>
                    </div>
                ) : !course ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 mt-32 px-4 text-center">
                        <h1 className="text-2xl font-bold">Course Not Found</h1>
                        <p className="text-muted-foreground">The course you are looking for does not exist or has been removed.</p>
                        <Button variant="outline" asChild>
                            <Link href="/browse">Back to browse</Link>
                        </Button>
                    </div>
                ) : (
                    // key resets per-course UI state (term carousel, selected units,
                    // preview modal) when navigating course -> course
                    <CourseDetailContent key={course.id} course={course} />
                )}
            </main>
        </div>
    );
}

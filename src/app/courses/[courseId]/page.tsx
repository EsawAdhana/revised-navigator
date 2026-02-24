'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { useCourseStore } from '@/lib/store';
import { SiteHeader } from '@/components/site-header';
import { CourseDetailContent } from '@/components/course-detail-content';
import { useCartStore } from '@/lib/cart-store';
import { useFilteredCourses } from '@/hooks/use-filtered-courses';
import { Loader2 } from 'lucide-react';

export default function CoursePage() {
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
    const { courses: filteredCourses } = useFilteredCourses();
    const { courses, fetchCourses, hasLoaded, isEnriching } = useCourseStore();
    const { getItem } = useCartStore();

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        fetchCourses();
    }, [fetchCourses]);

    // Only jump to a new course if the query changes *while* we are remaining on the same course page.
    // This prevents spurious redirects on initial link load or back/forward navigation.
    const prevQueryAndId = useRef({ query: (query || '').trim(), courseId });

    useEffect(() => {
        const currentQuery = (query || '').trim();
        const prev = prevQueryAndId.current;
        prevQueryAndId.current = { query: currentQuery, courseId };

        // If the query didn't change, do nothing.
        if (currentQuery === prev.query) return;

        // If the courseId changed at the same time as the query (e.g. Back button, or clicking a link),
        // we shouldn't force a redirect because the user is already actively navigating.
        if (courseId !== prev.courseId) return;

        // Otherwise, it's a search keystroke while on this page! Jump to the first match.
        if (!currentQuery || filteredCourses.length === 0) return;
        const firstMatch = filteredCourses[0];

        if (firstMatch.id !== courseId) {
            const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
            searchParams.set('q', currentQuery);
            const rest = searchParams.toString();
            router.push(rest ? `/courses/${encodeURIComponent(firstMatch.id)}?${rest}` : `/courses/${encodeURIComponent(firstMatch.id)}`);
        }
    }, [query, courseId, filteredCourses, router]);

    const course = useMemo(() => {
        let found = courses.find(c => c.id === courseId);
        if (!found) {
            const cartItem = getItem(courseId);
            if (cartItem) found = cartItem;
        }
        return found;
    }, [courses, courseId, getItem]);

    // Same initial output on server and first client render to avoid hydration mismatch
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
                {isEnriching || (!hasLoaded && !course) ? (
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

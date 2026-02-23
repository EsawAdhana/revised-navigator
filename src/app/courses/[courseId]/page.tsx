'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { useCourseStore } from '@/lib/store';
import { SiteHeader } from '@/components/site-header';
import { CourseDetailContent } from '@/components/course-detail-content';
import { useCartStore } from '@/lib/cart-store';
import { useFilteredCourses } from '@/hooks/use-filtered-courses';

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
    const { courses, fetchCourses, hasLoaded } = useCourseStore();
    const { getItem } = useCartStore();

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        fetchCourses();
    }, [fetchCourses]);

    // When on a course page, searching for a different class should navigate to that course
    const lastNavigatedQuery = useRef<string | null>(null);
    useEffect(() => {
        lastNavigatedQuery.current = null;
    }, [courseId]);
    useEffect(() => {
        const q = (query || '').trim();
        if (!q || filteredCourses.length === 0) return;
        if (lastNavigatedQuery.current === q) return;
        const firstMatch = filteredCourses[0];
        if (firstMatch.id !== courseId) {
            lastNavigatedQuery.current = q;
            const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
            searchParams.set('q', q);
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
                        <div className="flex flex-col items-center gap-3 animate-fade-in">
                            <div className="h-8 w-8 rounded-xl bg-primary/10 animate-pulse" />
                            <span className="text-sm text-muted-foreground">Loading course details...</span>
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
                {!hasLoaded && !course ? (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="flex flex-col items-center gap-3 animate-fade-in">
                            <div className="h-8 w-8 rounded-xl bg-primary/10 animate-pulse" />
                            <span className="text-sm text-muted-foreground">Loading course details...</span>
                        </div>
                    </div>
                ) : !course ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4">
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

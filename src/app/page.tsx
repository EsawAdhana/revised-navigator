'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { CourseList } from '@/components/course-list';
import { FilterSidebar } from '@/components/filter-sidebar';
import { AuthGate } from '@/components/auth-gate';
import { Course } from '@/types/course';
import { SiteHeader } from '@/components/site-header';
import { useRouter } from 'next/navigation';

function HomeContent() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCourseClick = (course: Course) => {
    const params = new URLSearchParams(window.location.search);
    const qs = params.toString();
    router.push(`/courses/${encodeURIComponent(course.id)}${qs ? `?${qs}` : ''}`);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <SiteHeader />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[280px] border-r border-border/40 bg-background hidden md:block overflow-y-auto custom-scrollbar shrink-0">
          <FilterSidebar />
        </aside>
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-secondary/20 relative">
          <CourseList onCourseClick={handleCourseClick} />
        </main>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="h-8 w-8 rounded-xl bg-primary/10 animate-pulse" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    }>
      <AuthGate>
        <HomeContent />
      </AuthGate>
    </Suspense>
  );
}

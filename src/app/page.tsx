'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { CourseList } from '@/components/course-list';
import { AuthGate } from '@/components/auth-gate';
import { SiteHeader } from '@/components/site-header';

const FilterSidebar = dynamic(
  () => import('@/components/filter-sidebar').then(m => ({ default: m.FilterSidebar })),
  {
    ssr: false,
    loading: () => (
      <div className="p-4 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-muted/30 animate-pulse" />
        ))}
      </div>
    ),
  }
);

function HomeContent() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <SiteHeader />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[280px] border-r border-border/40 bg-background hidden md:block overflow-y-auto custom-scrollbar shrink-0">
          <FilterSidebar />
        </aside>
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-secondary/20 relative">
          <CourseList />
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

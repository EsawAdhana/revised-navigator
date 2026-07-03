'use client';

import React, { Suspense } from 'react';
import { CourseList } from '@/components/course-list';
import { SiteHeader } from '@/components/site-header';
import { AnnouncementBanner } from '@/components/announcement-banner';
import { FilterSidebar } from '@/components/filter-sidebar';
import { BrowsePageShell } from '@/components/browse-page-shell';

function BrowseContent() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <AnnouncementBanner />
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

export default function BrowsePage() {
  return (
    <Suspense fallback={<BrowsePageShell />}>
      <BrowseContent />
    </Suspense>
  );
}

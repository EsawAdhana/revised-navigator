'use client';

import React from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterSidebar } from '@/components/filter-sidebar';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader, SheetDescription } from '@/components/ui/sheet';
import { useActiveFilterChips } from '@/hooks/use-active-filter-chips';

/**
 * Mobile-only trigger for the filter sidebar. The filters live off-screen here,
 * so the button carries a dot whenever any filter is narrowing the list —
 * including the term the catalog defaults to, which is set on a fresh load.
 */
export function MobileFilterMenu() {
    const hasActiveFilters = useActiveFilterChips().length > 0;

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden -ml-2 relative"
                    aria-label={hasActiveFilters ? 'Open menu (filters active)' : 'Open menu'}
                >
                    <Menu className="h-5 w-5" />
                    {hasActiveFilters && (
                        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" aria-hidden />
                    )}
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[300px] sm:max-w-[320px]">
                <SheetHeader>
                    <SheetTitle className="sr-only">Filters</SheetTitle>
                    <SheetDescription className="sr-only">
                        Filter courses by department, term, and other criteria.
                    </SheetDescription>
                </SheetHeader>
                <FilterSidebar />
            </SheetContent>
        </Sheet>
    );
}

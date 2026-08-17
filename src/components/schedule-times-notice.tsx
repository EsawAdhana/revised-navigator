'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useCartStore } from '@/lib/cart-store';
import { useCourseStore, getCoursesById } from '@/lib/store';
import { standInSectionChanged } from '@/lib/schedule-utils';
import { track } from '@/lib/analytics';

/**
 * Courses added straight from the schedule search carry no section pick, and
 * the calendar used to stand in with whichever section the catalog happened to
 * list first — usually a discussion rather than the lecture. Saved calendars
 * therefore moved when that was fixed, so tell the affected people once.
 */
const DISMISSED_KEY = 'schedule-times-notice-v1';

export function ScheduleTimesNotice() {
    const items = useCartStore(s => s.items);
    const courses = useCourseStore(s => s.courses);
    const hasLoaded = useCourseStore(s => s.hasLoaded);

    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        try {
            setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
        } catch {
            // Private mode / storage disabled — skip the notice rather than
            // showing it on every visit with no way to remember the dismissal.
            setDismissed(true);
        }
    }, []);

    // Only courses whose displayed time actually changed, so nobody gets a
    // warning about a calendar that looks the same as it did before.
    const shiftedCourses = useMemo(() => {
        if (!hasLoaded) return [];
        const byId = getCoursesById(courses);
        return items
            .map(item => {
                const full = byId.get(item.id);
                const sections = full?.sections?.length ? full.sections : item.sections;
                return { ...item, sections };
            })
            .filter(course => standInSectionChanged(course, course.selectedTerm))
            .map(course => `${course.subject} ${course.code}`);
    }, [items, courses, hasLoaded]);

    const open = !dismissed && shiftedCourses.length > 0;

    useEffect(() => {
        if (open) track('schedule_times_notice_shown', { courses: shiftedCourses.length });
    }, [open, shiftedCourses.length]);

    function close() {
        setDismissed(true);
        try {
            localStorage.setItem(DISMISSED_KEY, '1');
        } catch {
            // Nothing to do — the notice just may reappear next visit.
        }
    }

    return (
        <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) close(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarClock size={18} strokeWidth={2.5} className="shrink-0" />
                        Your calendar may have shifted
                    </DialogTitle>
                    <DialogDescription asChild>
                        <div className="space-y-3 text-left">
                            <p>
                                Some classes added from search were showing a discussion or lab
                                time instead of the lecture. That&apos;s now fixed, so these may
                                have moved on your calendar:
                            </p>
                            <p className="font-medium text-foreground">
                                {shiftedCourses.join(' · ')}
                            </p>
                            <p>
                                Their times now match ExploreCourses. If you meant a specific
                                section, open the course and pick it to set your own time.
                            </p>
                        </div>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onClick={close}>Got it</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

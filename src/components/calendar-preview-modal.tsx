'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/lib/cart-store';
import { useCourseStore } from '@/lib/store';
import { parseMeetingTimes, parseTimeRange, timeToMinutes } from '@/lib/schedule-utils';
import { cn, decodeHtmlEntities, parseUnitsOptions } from '@/lib/utils';
import { AlertTriangle, CalendarPlus, Calendar, Clock, MapPin } from 'lucide-react';
import type { Course, Section } from '@/types/course';

// ─── Types ───────────────────────────────────────────────────────────────────

type CalendarEvent = {
    id: string;
    courseId: string;
    courseCode: string;
    title: string;
    day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';
    start: number; // minutes from midnight
    end: number;
    startTime: string;
    endTime: string;
    location?: string;
    isPreview: boolean;
};

type LaidOutEvent = CalendarEvent & {
    colIndex: number;
    colCount: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: { key: CalendarEvent['day']; label: string }[] = [
    { key: 'Mon', label: 'Mon' },
    { key: 'Tue', label: 'Tue' },
    { key: 'Wed', label: 'Wed' },
    { key: 'Thu', label: 'Thu' },
    { key: 'Fri', label: 'Fri' },
];

const HOUR_HEIGHT = 52;
const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 20 * 60;

const COLORS = {
    sky: 'bg-sky-500/15 border-sky-500/40 text-sky-950 dark:text-sky-50',
    indigo: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-950 dark:text-indigo-50',
    violet: 'bg-violet-500/15 border-violet-500/40 text-violet-950 dark:text-violet-50',
    fuchsia: 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-950 dark:text-fuchsia-50',
    rose: 'bg-rose-500/15 border-rose-500/40 text-rose-950 dark:text-rose-50',
    orange: 'bg-orange-500/15 border-orange-500/40 text-orange-950 dark:text-orange-50',
    amber: 'bg-amber-500/15 border-amber-500/40 text-amber-950 dark:text-amber-50',
    emerald: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-950 dark:text-emerald-50',
} as const;

type ColorKey = keyof typeof COLORS;

function hashString(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getColorClasses(seed: string, userColor?: string) {
    if (userColor && userColor in COLORS) return COLORS[userColor as ColorKey];
    return Object.values(COLORS)[hashString(seed) % Object.values(COLORS).length];
}

// ─── Layout helper ────────────────────────────────────────────────────────────

function layoutDayEvents(events: CalendarEvent[]): LaidOutEvent[] {
    const sorted = [...events].sort((a, b) => (a.start - b.start) || (b.end - a.end));
    const laidOut: LaidOutEvent[] = [];
    let active: LaidOutEvent[] = [];
    let currentGroup: LaidOutEvent[] = [];

    const finishGroup = () => {
        if (!currentGroup.length) return;
        const colCount = currentGroup.reduce((m, e) => Math.max(m, e.colIndex), 0) + 1;
        currentGroup.forEach(e => { e.colCount = colCount; });
        currentGroup = [];
    };

    for (const ev of sorted) {
        active = active.filter(a => a.end > ev.start);
        if (!active.length) finishGroup();
        const used = new Set(active.map(a => a.colIndex));
        let colIndex = 0;
        while (used.has(colIndex)) colIndex++;
        const placed: LaidOutEvent = { ...ev, colIndex, colCount: 1 };
        active.push(placed);
        currentGroup.push(placed);
        laidOut.push(placed);
    }

    finishGroup();
    return laidOut;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CalendarPreviewModalProps {
    course: Course;
    section: Section;
    term: string;
    isOpen: boolean;
    onClose: () => void;
    /** Called with selectedUnits when section has variable units (e.g. 3-4). */
    onConfirm: (selectedUnits?: number) => void;
    /** Pre-selected units from parent (e.g. from section card or cart). */
    initialSelectedUnits?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CalendarPreviewModal({
    course,
    section,
    term,
    isOpen,
    onClose,
    onConfirm,
    initialSelectedUnits,
}: CalendarPreviewModalProps) {
    const { items } = useCartStore();
    const { courses } = useCourseStore();

    // Section may have 0, empty, or invalid units; use course as fallback (e.g. section "0" vs course "4")
    const sectionOpts = parseUnitsOptions(section.units ?? '');
    const courseOpts = parseUnitsOptions(course.units ?? '');
    const secHasValidUnits = sectionOpts.length > 0 && Math.max(0, ...sectionOpts) > 0;
    const unitOptions = sectionOpts.length > 1 ? sectionOpts : courseOpts.length > 1 ? courseOpts : (secHasValidUnits ? sectionOpts : courseOpts);
    const hasVariableUnits = unitOptions.length > 1;

    const [selectedUnits, setSelectedUnits] = useState<number | undefined>(() =>
        initialSelectedUnits !== undefined && unitOptions.includes(initialSelectedUnits) ? initialSelectedUnits : undefined
    );

    useEffect(() => {
        if (initialSelectedUnits !== undefined && unitOptions.includes(initialSelectedUnits)) {
            setSelectedUnits(initialSelectedUnits);
        }
    }, [initialSelectedUnits, unitOptions.join(',')]);

    // Existing cart items for this term (excluding this course), merged with full course data for sections
    const existingItems = useMemo(() => {
        const filtered = items.filter(c => {
            const forTerm = c.selectedTerm
                ? c.selectedTerm === term
                : ((c.terms && c.terms.includes(term)));
            return forTerm && c.id !== course.id;
        });
        return filtered.map(item => {
            const fullCourse = courses.find(c => c.id === item.id);
            if (fullCourse?.sections && fullCourse.sections.length > 0) {
                return { ...fullCourse, ...item, sections: fullCourse.sections };
            }
            return item;
        });
    }, [items, term, course.id, courses]);

    // Build calendar events from existing cart items
    const existingEvents = useMemo<CalendarEvent[]>(() => {
        const out: CalendarEvent[] = [];
        existingItems.forEach(c => {
            const meetings = parseMeetingTimes(c, term);
            meetings.forEach(m => {
                if (!m.startTime || !m.endTime) return;
                const start = timeToMinutes(m.startTime);
                const end = timeToMinutes(m.endTime);
                if (!start || !end || end <= start) return;
                (m.days || []).forEach(day => {
                    if (!DAYS.some(d => d.key === day)) return;
                    out.push({
                        id: `${c.id}-${day}-${start}`,
                        courseId: c.id,
                        courseCode: `${c.subject} ${c.code}`,
                        title: decodeHtmlEntities(c.title),
                        day: day as CalendarEvent['day'],
                        start,
                        end,
                        startTime: m.startTime,
                        endTime: m.endTime,
                        location: m.location,
                        isPreview: false,
                    });
                });
            });
        });
        return out;
    }, [existingItems, term]);

    // Build preview (ghost) events from the candidate section
    const previewEvents = useMemo<CalendarEvent[]>(() => {
        const out: CalendarEvent[] = [];
        const meetings = section.meetings || [];
        meetings.forEach(m => {
            if (!m.time) return;
            const range = parseTimeRange(m.time);
            if (!range?.startTime) return;
            const startTime = range.startTime;
            const endTime = range.endTime
            if (!startTime) return;
            const start = timeToMinutes(startTime);
            const end = endTime ? timeToMinutes(endTime) : start + 60;
            if (!start || end <= start) return;

            // Parse days (reuse normalization logic)
            const rawDays = (m.days || '').split(/[,\s]+/).map((d: string) => {
                const t = d.trim().toLowerCase();
                if (t.startsWith('mon')) return 'Mon';
                if (t === 'tu' || t.startsWith('tue')) return 'Tue';
                if (t.startsWith('wed')) return 'Wed';
                if (t === 'th' || t.startsWith('thu')) return 'Thu';
                if (t.startsWith('fri')) return 'Fri';
                return '';
            }).filter(Boolean) as CalendarEvent['day'][];

            rawDays.forEach(day => {
                out.push({
                    id: `preview-${day}-${start}`,
                    courseId: course.id,
                    courseCode: `${course.subject} ${course.code}`,
                    title: decodeHtmlEntities(course.title),
                    day,
                    start,
                    end,
                    startTime,
                    endTime,
                    location: m.location,
                    isPreview: true,
                });
            });
        });
        return out;
    }, [section, course]);

    const allEvents = useMemo(() => [...existingEvents, ...previewEvents], [existingEvents, previewEvents]);

    // Detect conflicts: preview events overlapping with existing events
    const conflictingCourses = useMemo(() => {
        const names = new Set<string>();
        previewEvents.forEach(pv => {
            existingEvents.forEach(ex => {
                if (ex.day === pv.day && ex.start < pv.end && ex.end > pv.start) {
                    names.add(ex.courseCode);
                }
            });
        });
        return Array.from(names);
    }, [previewEvents, existingEvents]);

    // Calendar range
    const { startMinutes, endMinutes, hours } = useMemo(() => {
        const minStart = allEvents.length
            ? allEvents.reduce((m, e) => Math.min(m, e.start), Infinity)
            : DEFAULT_START_MINUTES;
        const maxEnd = allEvents.length
            ? allEvents.reduce((m, e) => Math.max(m, e.end), 0)
            : DEFAULT_END_MINUTES;
        const start = Math.min(DEFAULT_START_MINUTES, Math.floor(minStart / 60) * 60);
        const end = Math.max(DEFAULT_END_MINUTES, Math.ceil(maxEnd / 60) * 60);
        const hrs = Array.from(
            { length: (end - start) / 60 + 1 },
            (_, i) => start / 60 + i
        );
        return { startMinutes: start, endMinutes: end, hours: hrs };
    }, [allEvents]);

    // Events laid out per day
    const eventsByDay = useMemo(() => {
        const byDay: Record<CalendarEvent['day'], LaidOutEvent[]> = {
            Mon: [], Tue: [], Wed: [], Thu: [], Fri: [],
        };
        DAYS.forEach(({ key }) => {
            byDay[key] = layoutDayEvents(allEvents.filter(e => e.day === key));
        });
        return byDay;
    }, [allEvents]);

    const gridHeight = ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT;

    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || !isOpen) return;
        const handleWheel = (e: WheelEvent) => {
            const { scrollTop, scrollHeight, clientHeight } = el;
            const atTop = scrollTop <= 0;
            const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
            if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
                e.preventDefault();
                window.scrollBy({ top: e.deltaY, behavior: 'auto' });
            }
        };
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }} modal={false}>
            <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden rounded-2xl [&>button:last-child]:hidden">
                <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40">
                    <DialogTitle className="text-base font-semibold flex items-center gap-2">
                        <CalendarPlus size={16} className="text-primary shrink-0" />
                        Preview: {course.subject} {course.code} — {term}
                    </DialogTitle>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-col gap-1.5">
                        {section.meetings?.[0] ? (
                            <>
                                <div className="flex items-center gap-1.5 capitalize">
                                    <Calendar size={14} strokeWidth={2.5} className="text-foreground shrink-0" />
                                    <span>{(() => {
                                        const days = (section.meetings[0].days || '').toLowerCase().split(/[,\s]+/);
                                        return days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
                                    })()}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Clock size={14} strokeWidth={2.5} className="text-foreground shrink-0" />
                                    <span>{section.meetings[0].time?.replace(/:00/g, '').replace(/\s+-\s+/g, '-')}</span>
                                </div>
                                {section.meetings[0].location && section.meetings[0].location !== 'TBA' && (
                                    <div className="flex items-center gap-1.5">
                                        <MapPin size={14} strokeWidth={2.5} className="text-foreground shrink-0" />
                                        <span className="truncate">{section.meetings[0].location}</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <Clock size={14} strokeWidth={2.5} className="text-foreground shrink-0" />
                                <span>Time TBA</span>
                            </div>
                        )}
                    </div>
                </DialogHeader>

                {/* Conflict warning */}
                {conflictingCourses.length > 0 && (
                    <div className="mx-6 mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                            Overlaps with{' '}
                            {conflictingCourses.map((c, i) => (
                                <span key={c}>
                                    <span className="font-bold">{c}</span>
                                    {i < conflictingCourses.length - 2 ? ', ' : i < conflictingCourses.length - 1 ? ' and ' : ''}
                                </span>
                            ))}
                        </p>
                    </div>
                )}

                {/* Scrollable body — at scroll boundary, wheel scrolls the page */}
                <div
                    ref={scrollRef}
                    className="overflow-y-auto max-h-[60vh]"
                >
                    <div className="overflow-x-auto px-4 pb-2 pt-3">
                        <div className="min-w-[560px]">
                            {/* Day header */}
                            <div className="grid grid-cols-[52px_repeat(5,1fr)] border-b border-border/40 mb-0">
                                <div className="p-1" />
                                {DAYS.map(d => (
                                    <div key={d.key} className="py-1.5 text-[10px] font-semibold text-muted-foreground text-center uppercase tracking-wide">
                                        {d.label}
                                    </div>
                                ))}
                            </div>

                            {/* Grid body */}
                            <div
                                className="grid grid-cols-[52px_repeat(5,1fr)] relative"
                                style={{ height: `${gridHeight}px`, '--start-minutes': startMinutes } as React.CSSProperties}
                            >
                                {/* Time rail */}
                                <div className="relative border-r border-border/30 bg-background/50">
                                    {hours.map((h, idx) => (
                                        <div
                                            key={h}
                                            className="absolute left-0 right-0"
                                            style={{ top: `${idx * HOUR_HEIGHT}px` }}
                                        >
                                            {idx !== hours.length - 1 && (
                                                <div className="absolute right-0 top-0 pr-1 text-right text-[9px] text-muted-foreground whitespace-nowrap mt-1">
                                                    {`${((h + 11) % 12) + 1}${h >= 12 ? 'p' : 'a'}`}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Day columns */}
                                {DAYS.map(({ key }) => (
                                    <div key={key} className="relative border-r last:border-r-0 border-border/20 bg-background/30">
                                        {eventsByDay[key].map(ev => {
                                            const colWidth = 100 / ev.colCount;
                                            const leftPct = ev.colIndex * colWidth;
                                            const gutter = 2;
                                            const topPx = ((ev.start - startMinutes) / 60) * HOUR_HEIGHT;
                                            const heightPx = Math.max(18, ((ev.end - ev.start) / 60) * HOUR_HEIGHT);

                                            if (ev.isPreview) {
                                                return (
                                                    <div
                                                        key={ev.id}
                                                        className={cn(
                                                            'absolute rounded-md border-2 border-dashed px-1 py-0.5 overflow-hidden z-20',
                                                            'bg-primary/10 border-primary/50 text-primary'
                                                        )}
                                                        style={{
                                                            top: `${topPx}px`,
                                                            height: `${heightPx}px`,
                                                            left: `calc(${leftPct}% + ${gutter}px)`,
                                                            width: `calc(${colWidth}% - ${gutter * 2}px)`,
                                                        }}
                                                    >
                                                        <div className="text-[10px] font-bold leading-tight truncate">{ev.courseCode}</div>
                                                        <div className="text-[9px] opacity-70 truncate hidden sm:block">{ev.location || 'TBA'}</div>
                                                    </div>
                                                );
                                            }

                                            const colorClasses = getColorClasses(ev.courseId);
                                            return (
                                                <div
                                                    key={ev.id}
                                                    className={cn(
                                                        'absolute rounded-md border px-1 py-0.5 overflow-hidden z-10 shadow-sm',
                                                        colorClasses
                                                    )}
                                                    style={{
                                                        top: `${topPx}px`,
                                                        height: `${heightPx}px`,
                                                        left: `calc(${leftPct}% + ${gutter}px)`,
                                                        width: `calc(${colWidth}% - ${gutter * 2}px)`,
                                                    }}
                                                >
                                                    <div className="text-[10px] font-semibold leading-tight truncate">{ev.courseCode}</div>
                                                    <div className="text-[9px] opacity-75 truncate hidden sm:block">{ev.location || 'TBA'}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}

                                {/* Horizontal hour lines */}
                                <div className="absolute inset-0 pointer-events-none col-span-6">
                                    {hours.map((_, idx) => (
                                        <div
                                            key={idx}
                                            className="absolute left-0 right-0 border-t border-border/30"
                                            style={{ top: `${idx * HOUR_HEIGHT}px` }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                {/* end scrollable body */}

                {/* Legend */}
                <div className="flex items-center gap-4 px-6 py-2 text-xs text-muted-foreground border-t border-border/30">
                    <div className="flex items-center gap-1.5">
                        <div className="h-3 w-4 rounded-sm bg-primary/10 border-2 border-dashed border-primary/50" />
                        <span>This class (preview)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="h-3 w-4 rounded-sm bg-sky-500/15 border border-sky-500/40" />
                        <span>Already scheduled</span>
                    </div>
                </div>

                {/* Units selector when section has variable units */}
                {hasVariableUnits && (
                    <div className="px-6 py-3 border-t border-border/30 flex items-center gap-3">
                        <span className="text-sm font-semibold text-muted-foreground">Units:</span>
                        <div className="flex items-center gap-2">
                            <div className={cn("grid gap-1.5", unitOptions.length <= 3 ? "grid-cols-3" : unitOptions.length === 4 ? "grid-cols-4" : "grid-cols-5")}>
                                {unitOptions.map((u) => (
                                    <button
                                        key={u}
                                        type="button"
                                        onClick={() => setSelectedUnits(prev => prev === u ? undefined : u)}
                                        className={cn(
                                            "flex items-center justify-center w-9 h-8 font-bold rounded-md transition-all text-sm",
                                            selectedUnits === u
                                                ? "bg-primary text-primary-foreground shadow-sm"
                                                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                        )}
                                    >
                                        {u}
                                    </button>
                                ))}
                            </div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-tight shrink-0">units</span>
                        </div>
                    </div>
                )}

                <DialogFooter className="px-6 py-4 border-t border-border/40 flex flex-row items-center justify-between sm:justify-between gap-3">
                    <Button
                        size="sm"
                        onClick={onClose}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold shadow-sm"
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm"
                        disabled={hasVariableUnits && selectedUnits === undefined}
                        onClick={() => { onConfirm(hasVariableUnits ? selectedUnits : undefined); onClose(); }}
                    >
                        <CalendarPlus size={13} />
                        Add to Calendar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog >
    );
}

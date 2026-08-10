'use client';

import React, { useState, useEffect } from 'react';
import { useCourseStore } from '@/lib/store';
import { ExternalLink, MapPin, Clock, Check, FileText, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/lib/cart-store';
import { useAuthStore } from '@/lib/auth-store';
import { promptLoginToSyncOnce } from '@/lib/login-nudge';
import { track } from '@/lib/analytics';
import { Section } from '@/types/course';
import { cn, getSyllabusUrl, parseUnitsOptions, formatLevel, abbreviateGer, unitsLabel, compareCourseCodes, formatComponent, isAllowedGer, decodeHtmlEntities, getCrossListGroupIds, aggregateCrossListedSectionEnrollment } from '@/lib/utils';
import { isDevEvalsUnlocked } from '@/lib/dev-flags';
import { InstructorList } from './instructor-list';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CourseEvaluations, ScoreBadge, barFill, CATEGORY_LABELS, QuestionCategory, aggregateMetrics } from './course-evaluations';
import { SyllabusVoting } from './syllabus-voting';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Course, CourseEvaluation } from '@/types/course';
import { CourseDescription } from './course-description';
import { useEvaluationStore } from '@/lib/evaluation-store';
import { useMemo } from 'react';
import { useQueryState, parseAsArrayOf, parseAsString } from 'nuqs';
import { CalendarPreviewModal } from './calendar-preview-modal';
import { isWimCourse } from '@/lib/wim-courses';
import { compareTerms, getDefaultTerm, isFutureTerm as isTermInFuture } from '@/lib/terms';

interface CourseDetailContentProps {
    course: Course;
}

function InstructorSummary({ instructorName, evals }: { instructorName: string; evals: CourseEvaluation[] }) {
    const instructorEvals = useMemo(() => evals.filter(e => e.instructor === instructorName), [evals, instructorName]);
    const metrics = useMemo(() => aggregateMetrics(instructorEvals), [instructorEvals]);

    if (instructorEvals.length === 0) return null;

    const ratingCats: QuestionCategory[] = ['quality', 'learning', 'organization', 'hours'];

    return (
        <div className="bg-secondary/10 rounded-2xl p-4 border border-border/40 space-y-3">
            <div className="flex items-center justify-between border-b border-border/20 pb-2">
                <h3 className="text-sm font-bold text-foreground truncate max-w-[200px]">
                    {decodeHtmlEntities(instructorName).split(', ').reverse().join(' ')}
                </h3>
                <div className="text-xs text-muted-foreground font-medium">
                    {instructorEvals.length} {instructorEvals.length === 1 ? 'Eval' : 'Evals'}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {ratingCats.map(cat => {
                    const score = metrics[cat];
                    if (score === undefined) return null;

                    return (
                        <div key={cat} className="space-y-1">
                            <div className="text-xs text-muted-foreground uppercase font-bold tracking-tight truncate">
                                {CATEGORY_LABELS[cat].replace('Instruction ', '')}
                            </div>
                            <div className="flex items-center gap-1.5">
                                {cat === 'hours' ? (
                                    <span className="text-sm font-bold tabular-nums">{score.toFixed(1)}h</span>
                                ) : (
                                    <>
                                        <div className="w-8 h-1 bg-secondary/60 rounded-full overflow-hidden shrink-0">
                                            <div
                                                className={cn('h-full rounded-full', barFill(score))}
                                                style={{ width: `${(score / 5) * 100}%` }}
                                            />
                                        </div>
                                        <ScoreBadge score={score} size="sm" />
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}



export function CourseDetailContent({ course }: CourseDetailContentProps) {
    const addItem = useCartStore(s => s.addItem);
    const removeItem = useCartStore(s => s.removeItem);
    const courses = useCourseStore(s => s.courses);
    const fetchBulkEvaluations = useEvaluationStore(s => s.fetchBulkEvaluations);
    const getMergedEvaluations = useEvaluationStore(s => s.getMergedEvaluations);
    const evaluationsById = useEvaluationStore(state => state.evaluations);
    const user = useAuthStore(s => s.user);
    const canViewEvals = Boolean(user) || isDevEvalsUnlocked();

    const crossListIds = useMemo(() => getCrossListGroupIds(course.id, courses), [course.id, courses]);

    useEffect(() => {
        if (canViewEvals && crossListIds.length > 0) fetchBulkEvaluations(crossListIds);
    }, [crossListIds, fetchBulkEvaluations, canViewEvals]);

    const evaluations = useMemo(() => getMergedEvaluations(crossListIds), [getMergedEvaluations, crossListIds, evaluationsById]);

    // Subscribe to only this course's cart entry so unrelated cart changes don't re-render the page
    const cartItem = useCartStore(s => s.items.find(i => i.id === course.id));

    // Group sections by term (dedup by classId), sort sections + terms — memoized so this
    // doesn't re-run on every render (e.g. tab switches, hover state).
    const sectionsByTerm = useMemo(() => {
        const grouped = (course?.sections || []).reduce((acc, section) => {
            if (!acc[section.term]) acc[section.term] = [];
            const already = acc[section.term].some(s => s.classId === section.classId);
            if (!already) acc[section.term].push(section);
            return acc;
        }, {} as Record<string, Section[]>);
        Object.keys(grouped).forEach(term => {
            grouped[term].sort((a, b) => compareCourseCodes(a.sectionNumber, b.sectionNumber));
        });
        return grouped;
    }, [course?.sections]);

    const terms = useMemo(() => Object.keys(sectionsByTerm).sort(compareTerms), [sectionsByTerm]);

    // Term(s) carried over from the browse filter (?terms=). When the user arrived
    // having filtered to a specific quarter, open that quarter's tab if this course
    // offers it, instead of defaulting to the latest offered term.
    const [urlTerms] = useQueryState('terms', parseAsArrayOf(parseAsString));
    const incomingPreferredTerm = useMemo(() => {
        if (!urlTerms || urlTerms.length === 0) return null;
        const offered = urlTerms.filter(t => terms.includes(t)).sort(compareTerms);
        return offered[0] ?? null;
    }, [urlTerms, terms]);

    // Precompute cross-listed enrollment per section so it isn't recomputed for every render/tab switch
    const enrollmentBySectionId = useMemo(() => {
        const map = new Map<number, ReturnType<typeof aggregateCrossListedSectionEnrollment>>();
        for (const term of Object.keys(sectionsByTerm)) {
            for (const section of sectionsByTerm[term]) {
                map.set(section.classId, aggregateCrossListedSectionEnrollment(section, crossListIds, courses));
            }
        }
        return map;
    }, [sectionsByTerm, crossListIds, courses]);

    // State for active tab
    const [activeTerm, setActiveTerm] = useState<string>(() => {
        if (cartItem?.selectedTerm && terms.includes(cartItem.selectedTerm)) {
            return cartItem.selectedTerm;
        }
        if (incomingPreferredTerm) return incomingPreferredTerm;
        return getDefaultTerm(terms);
    });

    // Term carousel: show 3 at a time when there are more than 3 terms
    const TERMS_VISIBLE = 3;
    const maxCarouselIndex = Math.max(0, terms.length - TERMS_VISIBLE);
    const [termCarouselIndex, setTermCarouselIndex] = useState(0);
    const visibleTerms = terms.length > TERMS_VISIBLE
        ? terms.slice(termCarouselIndex, termCarouselIndex + TERMS_VISIBLE)
        : terms;

    // Keep active term in view when user selects a tab; don't override arrow clicks
    const prevActiveTermRef = React.useRef(activeTerm);
    const isInitialMount = React.useRef(true);
    useEffect(() => {
        if (!isInitialMount.current && prevActiveTermRef.current === activeTerm) return;
        isInitialMount.current = false;
        prevActiveTermRef.current = activeTerm;
        const idx = terms.indexOf(activeTerm);
        if (idx >= 0 && terms.length > TERMS_VISIBLE) {
            const newStart = Math.min(idx, Math.max(0, terms.length - TERMS_VISIBLE));
            setTermCarouselIndex(Math.max(0, newStart));
        }
    }, [activeTerm]);

    // Units: use active section or course; support variable units (e.g. 3-4).
    // Section units are often blank ("") in the data, so fall back to course units
    // for blanks too (plain ?? would keep the empty string and show "—").
    const unitsSource = (() => {
        const secs = sectionsByTerm[activeTerm]
        const section = secs?.find(s => s.classId === (cartItem?.selectedSectionId ?? secs?.[0]?.classId)) ?? secs?.[0]
        const secUnits = section?.units
        const hasSecUnits = secUnits !== undefined && secUnits !== null && String(secUnits).trim() !== ''
        return hasSecUnits ? secUnits : course?.units
    })()
    const unitOptions = course ? parseUnitsOptions(unitsSource ?? course.units) : []
    const hasVariable = unitOptions.length > 1
    const [selectedUnits, setSelectedUnits] = useState<number | undefined>(() => {
        if (cartItem?.selectedUnits !== undefined && unitOptions.includes(cartItem.selectedUnits)) return cartItem.selectedUnits
        return undefined
    })

    // Sync selectedUnits when cart item changes
    useEffect(() => {
        if (cartItem?.selectedUnits !== undefined && unitOptions.includes(cartItem.selectedUnits)) {
            setSelectedUnits(cartItem.selectedUnits)
        }
    }, [cartItem?.selectedUnits, unitOptions.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

    // Get the first section with a valid sectionNumber for the active term to use in syllabus URL
    const activeSections = sectionsByTerm[activeTerm] || []
    const activeSection = activeSections.find(s => s.sectionNumber && s.sectionNumber.trim() !== '') || activeSections[0]
    const syllabusClassId = activeSection?.classId
    const syllabusSectionNumber = activeSection?.sectionNumber

    const syllabusUrl = course && activeTerm && syllabusSectionNumber
        ? getSyllabusUrl(course.subject, course.code, syllabusClassId, activeTerm, syllabusSectionNumber)
        : null

    // Update active term if course changes or terms load
    useEffect(() => {
        if (cartItem?.selectedTerm && terms.includes(cartItem.selectedTerm)) {
            setActiveTerm(cartItem.selectedTerm);
        } else if (terms.length > 0 && !terms.includes(activeTerm)) {
            setActiveTerm(incomingPreferredTerm ?? getDefaultTerm(terms));
        }
    }, [course.id, cartItem?.selectedTerm, terms.length]); // eslint-disable-line react-hooks/exhaustive-deps -- activeTerm omitted to avoid loop; setActiveTerm is stable

    const isFutureTerm = isTermInFuture(activeTerm)

    // GER (General Education Requirements / WAYS) from sections — dedupe by display abbreviation
    // so e.g. "Writing in the Major (WIM)" (injected in store) and "WIM" do not both show as WIM.
    const gers = useMemo(() => {
        const byAbbrev = new Map<string, string>()
        const consider = (g: string) => {
            if (!isAllowedGer(g)) return
            const abbr = abbreviateGer(g)
            const existing = byAbbrev.get(abbr)
            if (!existing || g.length > existing.length) byAbbrev.set(abbr, g)
        }
        course.sections?.forEach(s => s.gers?.forEach(consider))
        if (isWimCourse(course.subject, course.code)) consider('WIM')
        return Array.from(byAbbrev.values()).sort((a, b) =>
            abbreviateGer(a).localeCompare(abbreviateGer(b))
        )
    }, [course.sections, course.subject, course.code])
    const gerLabel = gers.length > 0 ? gers.map(abbreviateGer).join(', ') : '—'

    const [previewSection, setPreviewSection] = useState<Section | null>(null);

    const handleSelectSection = (sectionId: number, section?: Section, selectedUnitsOverride?: number) => {
        if (cartItem?.selectedSectionId === sectionId && cartItem?.selectedTerm === activeTerm) {
            removeItem(course.id);
        } else {
            // Section may have single value (e.g. "4") while course has range ("3-4"); use course as fallback
            const sectionOpts = parseUnitsOptions(section?.units ?? '');
            const courseOpts = parseUnitsOptions(course.units ?? '');
            const hasVariable = sectionOpts.length > 1 || courseOpts.length > 1;
            const unitsToUse = selectedUnitsOverride !== undefined ? selectedUnitsOverride : selectedUnits;
            addItem(course, activeTerm, sectionId, hasVariable ? unitsToUse : undefined);
            track('course_added_to_schedule', { auth: user ? 'authed' : 'anonymous', source: 'detail' });
            promptLoginToSyncOnce();
        }
    };

    const handleUnitsChange = (u: number) => {
        const newValue = selectedUnits === u ? undefined : u;
        setSelectedUnits(newValue);
        if (cartItem?.selectedTerm === activeTerm) {
            const sectionId = cartItem?.selectedSectionId ?? sectionsByTerm[activeTerm]?.[0]?.classId;
            addItem(course, activeTerm, sectionId, newValue);
        }
    };

    return (
        <div className="container max-w-[95rem] mx-auto p-4 md:px-8 md:pt-4 md:pb-10 space-y-4">
            {/* Calendar Preview Modal */}
            {previewSection && (
                <CalendarPreviewModal
                    course={course}
                    section={previewSection}
                    term={activeTerm}
                    isOpen={!!previewSection}
                    onClose={() => setPreviewSection(null)}
                    onConfirm={(units) => handleSelectSection(previewSection.classId, previewSection, units)}
                    initialSelectedUnits={selectedUnits}
                />
            )}
            {/* Header Area */}
            <div className="space-y-3">
                <div className="flex items-center gap-3 pl-3 md:pl-4">
                    <h1 className="text-2xl font-bold text-destructive tracking-tight">
                        {course.subject} {course.code}
                    </h1>
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold leading-tight text-foreground tracking-tight pl-3 md:pl-4">{decodeHtmlEntities(course.title)}</h2>

                {/* Quick Info - 2x2 grid on mobile (UNITS|GRADING, LEVEL|GER), single row on md+ */}
                <div className="grid grid-cols-2 md:inline-flex md:flex-nowrap rounded-xl border border-border/40 bg-secondary/10 w-fit min-w-0">
                    <div className="order-1 flex flex-col md:flex-row md:items-center gap-0.5 md:gap-2 p-3 border-r border-b md:border-b-0 border-border/40 shrink-0">
                        <span className="text-[15px] font-bold text-muted-foreground uppercase tracking-tight shrink-0">UNITS:</span>
                        <span className="text-[18px] font-bold text-foreground tabular-nums">
                            {(() => {
                                if (unitOptions.length === 1) return unitOptions[0];
                                if (unitOptions.length > 1) return (unitsSource ?? course.units ?? '').toString();
                                return '—';
                            })()}
                        </span>
                    </div>
                    <div className="order-2 flex flex-col md:flex-row md:items-center gap-0.5 md:gap-2 p-3 border-b border-r-0 md:border-b-0 md:border-r md:border-border/40 shrink-0 min-w-0">
                        <span className="text-[15px] font-bold text-muted-foreground uppercase tracking-tight shrink-0">GRADING:</span>
                        <span className="text-[18px] font-bold text-foreground break-words">{course.grading || 'Letter (ABC/NC)'}</span>
                    </div>
                    <div className="order-3 flex flex-col md:flex-row md:items-center gap-0.5 md:gap-2 p-3 border-r border-border/40 shrink-0">
                        <span className="text-[15px] font-bold text-muted-foreground uppercase tracking-tight shrink-0">LEVEL:</span>
                        <span className="text-[18px] font-bold text-foreground">{formatLevel(activeSection?.classLevel || course.code)}</span>
                    </div>
                    <div className="order-4 flex flex-col md:flex-row md:items-center gap-0.5 md:gap-2 p-3 min-w-0 shrink-0">
                        <span className="text-[15px] font-bold text-muted-foreground uppercase tracking-tight shrink-0">GER:</span>
                        <span className="text-[18px] font-bold text-foreground break-words">{gerLabel}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
                {/* Left Column: Tab Content */}
                <div className="space-y-2">
                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="w-full justify-start bg-transparent border-b border-border/40 rounded-none h-auto p-0 pl-3 md:pl-4 gap-8 mb-4">
                            <TabsTrigger
                                value="overview"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-3 text-[18px] font-bold text-muted-foreground data-[state=active]:text-foreground transition-all hover:text-foreground/80"
                            >
                                Overview
                            </TabsTrigger>
                            <TabsTrigger
                                value="charts"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-3 text-[18px] font-bold text-muted-foreground data-[state=active]:text-foreground transition-all hover:text-foreground/80"
                            >
                                Charts
                            </TabsTrigger>
                            <TabsTrigger
                                value="comments"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-3 text-[18px] font-bold text-muted-foreground data-[state=active]:text-foreground transition-all hover:text-foreground/80"
                            >
                                Comments
                            </TabsTrigger>
                        </TabsList>

                        {/* Overview Tab Content */}
                        <TabsContent value="overview" className="focus-visible:outline-none focus-visible:ring-0 pl-3 md:pl-4">
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <CourseDescription description={course.description} contextSubject={course.subject} className="text-[15px] leading-relaxed" />

                                    {/* Syllabus */}
                                    <div className="pt-2 space-y-2 group/syllabus">
                                        {activeTerm && syllabusSectionNumber ? (
                                            <>
                                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                                    Syllabus for selected term:
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    asChild
                                                    disabled={!syllabusUrl}
                                                    className={cn(
                                                        "gap-2 w-full sm:w-auto",
                                                        !syllabusUrl && "opacity-50 cursor-not-allowed"
                                                    )}
                                                >
                                                    <a
                                                        href={syllabusUrl || '#'}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => {
                                                            if (!syllabusUrl) {
                                                                e.preventDefault()
                                                            } else {
                                                                e.stopPropagation()
                                                            }
                                                        }}
                                                    >
                                                        <FileText size={16} />
                                                        View {activeTerm} Syllabus
                                                        <ExternalLink size={14} className="opacity-60" />
                                                    </a>
                                                </Button>
                                                {!isFutureTerm && (
                                                    <SyllabusVoting courseId={course.id} term={activeTerm} />
                                                )}
                                            </>
                                        ) : (
                                            <div className="text-sm text-muted-foreground">
                                                {!activeTerm ? "No terms available" : "Syllabus not available for this section"}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* Charts Tab Content */}
                        <TabsContent value="charts" className="focus-visible:outline-none focus-visible:ring-0 pl-3 md:pl-4">
                            <CourseEvaluations
                                courseIds={crossListIds}
                                subject={course.subject}
                                code={course.code}
                                forcedTab="overview"
                            />
                        </TabsContent>

                        {/* Comments Tab Content */}
                        <TabsContent value="comments" className="focus-visible:outline-none focus-visible:ring-0 pl-3 md:pl-4">
                            <CourseEvaluations
                                courseIds={crossListIds}
                                subject={course.subject}
                                code={course.code}
                                forcedTab="comments"
                            />
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right Column: Persistent Sidebar (Sections) */}
                <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto pr-2 scrollbar-hide">
                    {/* Instructor Summary */}
                    {(() => {
                        const activeSections = sectionsByTerm[activeTerm] || [];
                        const primaryInstructor = activeSections[0]?.meetings?.[0]?.instructors?.[0];
                        if (!primaryInstructor) return null;
                        return <InstructorSummary instructorName={primaryInstructor} evals={evaluations} />;
                    })()}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-border/40 pb-2 pl-5">
                            <h3 className="text-[20px] font-bold text-foreground">
                                Sections
                            </h3>
                            <div className="text-[15px] text-muted-foreground font-medium">
                                {terms.length} {terms.length === 1 ? 'Term' : 'Terms'}
                            </div>
                        </div>

                        {terms.length > 0 ? (
                            <Tabs value={activeTerm} onValueChange={setActiveTerm} className="w-full">
                                <div className="flex items-center gap-2 md:gap-1 pl-5 mb-4 border-b border-border/40">
                                    {terms.length > TERMS_VISIBLE && (
                                        <button
                                            type="button"
                                            onClick={() => setTermCarouselIndex(i => Math.max(0, i - 1))}
                                            disabled={termCarouselIndex === 0}
                                            className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                            aria-label="Previous terms"
                                        >
                                            <ChevronLeft size={20} strokeWidth={2.5} />
                                        </button>
                                    )}
                                    <TabsList className="flex-1 flex min-w-0 overflow-x-auto overflow-y-hidden scrollbar-hide md:overflow-hidden bg-transparent border-0 rounded-none h-auto p-0 gap-6 md:gap-1">
                                        {visibleTerms.map(term => (
                                            <TabsTrigger
                                                key={term}
                                                value={term}
                                                title={term}
                                                className="flex-shrink-0 min-w-[7rem] whitespace-nowrap rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5 md:flex-1 md:min-w-0 md:truncate md:px-1 md:py-2 text-[15px] font-bold text-muted-foreground data-[state=active]:text-foreground transition-all"
                                            >
                                                {term}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                    {terms.length > TERMS_VISIBLE && (
                                        <button
                                            type="button"
                                            onClick={() => setTermCarouselIndex(i => Math.min(maxCarouselIndex, i + 1))}
                                            disabled={termCarouselIndex >= maxCarouselIndex}
                                            className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                            aria-label="Next terms"
                                        >
                                            <ChevronRight size={20} strokeWidth={2.5} />
                                        </button>
                                    )}
                                </div>

                                {terms.map(term => (
                                    <TabsContent key={term} value={term} className="space-y-3 focus-visible:outline-none focus-visible:ring-0">
                                        {(() => {
                                            const termSections = sectionsByTerm[term];
                                            const compCounters: Record<string, number> = {};

                                            const INDEPENDENT_COMPONENTS = new Set(['INS', 'PRA', 'T/D', 'CLN', 'RES', 'ITR', 'RSC', 'TUT', 'SIM', 'CAS']);

                                            return termSections.map((section) => {
                                                const enrollAgg = enrollmentBySectionId.get(section.classId) ?? aggregateCrossListedSectionEnrollment(section, crossListIds, courses);
                                                const isIndependent = INDEPENDENT_COMPONENTS.has(section.component);
                                                const tbdLabel = isIndependent ? 'Not Applicable' : 'TBD';
                                                const compLabel = formatComponent(section.component);
                                                compCounters[compLabel] = (compCounters[compLabel] || 0) + 1;
                                                const displayNum = compCounters[compLabel];

                                                return (
                                                    <div key={section.classId} className="border border-border/60 rounded-xl p-5 bg-card/50 hover:bg-card hover:shadow-md transition-all duration-200 group/section overflow-hidden">
                                                        <div className="flex justify-between items-start gap-3 mb-4">
                                                            <div>
                                                                <div className="font-bold text-[18px] text-foreground flex flex-wrap items-center gap-2">
                                                                    <span className="shrink-0">{compLabel} {displayNum}</span>
                                                                    {section.status && (
                                                                        <span className={cn(
                                                                            "text-[12px] uppercase font-bold px-1.5 py-0.5 rounded",
                                                                            section.status.toLowerCase() === 'open'
                                                                                ? "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/50"
                                                                                : section.status.toLowerCase().includes('waitlist')
                                                                                    ? "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50"
                                                                                    : "text-muted-foreground bg-secondary/60"
                                                                        )}>
                                                                            {section.status}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-[15px] text-muted-foreground mt-0.5 font-medium tracking-tight">ID: {section.classId}</div>
                                                                {enrollAgg.capacity > 0 && (
                                                                    <div className="text-[13px] text-muted-foreground mt-0.5">
                                                                        {enrollAgg.enrolled} / {enrollAgg.capacity} enrolled
                                                                        {enrollAgg.waitlist > 0 && ` · ${enrollAgg.waitlist} / ${enrollAgg.waitlistMax} on waitlist`}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="space-y-4 text-[17px] text-foreground/80 mb-4">
                                                            {section.meetings.map((m, i) => (
                                                                <div
                                                                    key={i}
                                                                    className={cn(
                                                                        "flex flex-col gap-3 text-[17px] text-foreground/90",
                                                                        section.meetings.length > 1 && i > 0 && "pt-4 border-t border-border/50"
                                                                    )}
                                                                >
                                                                    {section.meetings.length > 1 && (
                                                                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                                                            Meeting {i + 1} of {section.meetings.length}
                                                                        </div>
                                                                    )}
                                                                    <div className="flex gap-2.5 min-w-0">
                                                                        <Calendar size={15} strokeWidth={2.5} className="text-foreground shrink-0 mt-0.5" />
                                                                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0 flex-1">
                                                                            <span className="text-[13px] font-bold text-muted-foreground uppercase tracking-tight leading-none shrink-0">DAYS:</span>
                                                                            <span className="capitalize font-medium text-foreground leading-tight break-words">{(() => {
                                                                                const rawDays = m.days || '';
                                                                                if (!rawDays.trim()) return tbdLabel;
                                                                                const days = rawDays.toLowerCase().split(/[,\s/]+/).filter(Boolean);
                                                                                return days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
                                                                            })()}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2.5 min-w-0">
                                                                        <Clock size={15} strokeWidth={2.5} className="text-foreground shrink-0 mt-0.5" />
                                                                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0 flex-1">
                                                                            <span className="text-[13px] font-bold text-muted-foreground uppercase tracking-tight leading-none shrink-0">TIME:</span>
                                                                            <span className="font-medium text-foreground leading-tight break-words">{m.time ? m.time.replace(/:00/g, '').replace(/\s+-\s+/g, '-') : tbdLabel}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2.5 min-w-0">
                                                                        <MapPin size={15} strokeWidth={2.5} className="text-foreground shrink-0 mt-0.5" />
                                                                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0 flex-1">
                                                                            <span className="text-[13px] font-bold text-muted-foreground uppercase tracking-tight leading-none shrink-0">LOCATION:</span>
                                                                            <span className="font-medium text-foreground leading-tight break-words">{m.location || tbdLabel}</span>
                                                                        </div>
                                                                    </div>
                                                                    {m.instructors && m.instructors.length > 0 && (
                                                                        <div className="flex gap-2.5 min-w-0">
                                                                            <InstructorList instructors={m.instructors} showIcon={true} label="INSTRUCTOR:" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="pt-4 border-t border-border/30 flex flex-wrap justify-between items-center gap-3">
                                                            {(() => {
                                                                const secOpts = parseUnitsOptions(section.units ?? '');
                                                                const courseOpts = parseUnitsOptions(course.units ?? '');
                                                                const secHasValidUnits = secOpts.length > 0 && Math.max(0, ...secOpts) > 0;
                                                                const opts = secOpts.length > 1 ? secOpts : courseOpts.length > 1 ? courseOpts : (secHasValidUnits ? secOpts : courseOpts);
                                                                const useCourseForDisplay = !secHasValidUnits || opts.length > 1;
                                                                const uVal = opts.length > 1 ? (course.units || '') : (useCourseForDisplay ? (course.units ?? '') : (section.units ?? course.units ?? ''));
                                                                const isVariable = opts.length > 1;
                                                                return (
                                                            <div className={cn("flex items-center text-[17px] font-bold text-foreground/80 bg-secondary/40 rounded-lg border border-border/40 transition-colors group-hover/section:bg-secondary/60", isVariable ? "px-2 py-2 min-h-10" : "px-3 h-10")}>
                                                                {opts.length > 1 ? (
                                                                            <div className="flex items-center gap-1.5">
                                                                                <div className={cn("grid gap-1.5", opts.length === 2 ? "grid-cols-2" : opts.length === 3 ? "grid-cols-3" : opts.length === 4 ? "grid-cols-4" : "grid-cols-5")}>
                                                                                    {opts.map((u) => (
                                                                                        <button
                                                                                            key={u}
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                handleUnitsChange(u);
                                                                                            }}
                                                                                            className={cn(
                                                                                                "flex items-center justify-center font-bold rounded-md transition-all",
                                                                                                opts.length > 6 ? "w-7 h-6 text-[11px]" : "w-8 h-7 text-[13px]",
                                                                                                (selectedUnits === u || (selectedUnits === undefined && cartItem?.selectedUnits === u))
                                                                                                    ? "bg-primary text-primary-foreground shadow-sm"
                                                                                                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                                                                            )}
                                                                                        >
                                                                                            {u}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>
                                                                                <span className="text-[13px] font-bold text-muted-foreground uppercase tracking-tight leading-none">units</span>
                                                                            </div>
                                                                        ) : (
                                                                            (() => {
                                                                                const normalizedVal = (() => {
                                                                                    if (opts.length === 0) return '0';
                                                                                    const s = (uVal || '').toString();
                                                                                    const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
                                                                                    if (m && m[1] === m[2]) return m[1];
                                                                                    return s || '0';
                                                                                })();
                                                                                return (
                                                                                    <div className="flex items-baseline gap-1 px-0.5 uppercase whitespace-nowrap text-[15px] font-bold">
                                                                                        <span className="tabular-nums leading-none">{normalizedVal}</span>
                                                                                        <span className="opacity-70 tracking-tight text-[14px] leading-none">{unitsLabel(normalizedVal)}</span>
                                                                                    </div>
                                                                                );
                                                                            })()
                                                                        )}
                                                            </div>
                                                                );
                                                            })()}

                                                            <Button
                                                                size="sm"
                                                                variant={cartItem?.selectedSectionId === section.classId && cartItem?.selectedTerm === activeTerm ? "default" : "outline"}
                                                                className={cn(
                                                                    "h-10 text-[16px] px-5 rounded-lg font-bold transition-all whitespace-nowrap",
                                                                    cartItem?.selectedSectionId === section.classId && cartItem?.selectedTerm === activeTerm
                                                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-sm"
                                                                        : "hover:bg-primary/5 hover:text-primary hover:border-primary/30"
                                                                )}
                                                                onClick={() =>
                                                                    cartItem?.selectedSectionId === section.classId && cartItem?.selectedTerm === activeTerm
                                                                        ? handleSelectSection(section.classId)
                                                                        : setPreviewSection(section)
                                                                }
                                                            >
                                                                {cartItem?.selectedSectionId === section.classId && cartItem?.selectedTerm === activeTerm ? (
                                                                    <Check size={12} className="mr-1.5 stroke-[3px]" />
                                                                ) : (
                                                                    <Calendar size={12} className="mr-1.5" />
                                                                )}
                                                                {cartItem?.selectedSectionId === section.classId && cartItem?.selectedTerm === activeTerm ? "Added" : "View on Calendar"}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </TabsContent>
                                ))}
                            </Tabs>
                        ) : (
                            <div className="text-center text-muted-foreground py-8 bg-secondary/10 rounded-2xl border border-dashed border-border/40 text-xs font-medium">
                                No sections available.
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useCourseStore } from '@/lib/store';
import { ExternalLink, MapPin, Clock, Check, Plus, FileText, AlertCircle, Loader2, Palette, Info, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/lib/cart-store';
import { Section } from '@/types/course';
import { cn, getSyllabusUrl, parseUnitsOptions, hasVariableUnits, formatLevel, abbreviateGer, unitsLabel } from '@/lib/utils';
import { InstructorList } from './instructor-list';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSyllabusValidity } from '@/hooks/use-syllabus-validity';
import { CourseEvaluations, ScoreBadge, barFill, scoreColor, CATEGORY_LABELS, QuestionCategory, aggregateMetrics } from './course-evaluations';
import { SyllabusVoting } from './syllabus-voting';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Course, CourseEvaluation } from '@/types/course';
import { CourseDescription } from './course-description';
import { useEvaluationStore } from '@/lib/evaluation-store';
import { useMemo } from 'react';
import { CalendarPreviewModal } from './calendar-preview-modal';
import { isWimCourse } from '@/lib/wim-courses';

const COLORS = {
    sky: 'bg-sky-500/15 border-sky-500/40 text-sky-950 dark:text-sky-50',
    emerald: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-950 dark:text-emerald-50',
    violet: 'bg-violet-500/15 border-violet-500/40 text-violet-950 dark:text-violet-50',
    amber: 'bg-amber-500/15 border-amber-500/40 text-amber-950 dark:text-amber-50',
    rose: 'bg-rose-500/15 border-rose-500/40 text-rose-950 dark:text-rose-50',
    teal: 'bg-teal-500/15 border-teal-500/40 text-teal-950 dark:text-teal-50',
    pink: 'bg-pink-500/15 border-pink-500/40 text-pink-950 dark:text-pink-50',
    indigo: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-950 dark:text-indigo-50',
} as const

const THEME_COLORS = {
    sky: 'bg-sky-500 hover:bg-sky-600',
    emerald: 'bg-emerald-500 hover:bg-emerald-600',
    violet: 'bg-violet-500 hover:bg-violet-600',
    amber: 'bg-amber-500 hover:bg-amber-600',
    rose: 'bg-rose-500 hover:bg-rose-600',
    teal: 'bg-teal-500 hover:bg-teal-600',
    pink: 'bg-pink-500 hover:bg-pink-600',
    indigo: 'bg-indigo-500 hover:bg-indigo-600',
} as const

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
                <h3 className="text-sm font-bold text-foreground truncate max-w-[200px]" title={instructorName}>
                    {instructorName.split(', ').reverse().join(' ')}
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

function CourseMetricsSummary({ metrics, evalsCount, isLoading }: { metrics: Partial<Record<QuestionCategory, number>>; evalsCount: number; isLoading: boolean }) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mt-6">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-secondary/10 rounded-2xl p-4 border border-border/40 animate-pulse h-[88px]" />
                ))}
            </div>
        );
    }

    const ratingCats: QuestionCategory[] = ['quality', 'learning', 'organization', 'hours'];

    if (evalsCount === 0) {
        return (
            <div className="mt-6 p-4 bg-secondary/5 border border-dashed border-border/40 rounded-2xl flex items-center justify-between group">
                <div className="text-sm text-muted-foreground font-medium">
                    No historical evaluation data available for this course.
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-3 mt-4">
            {ratingCats.map(cat => {
                const score = metrics[cat];
                if (score === undefined) return null;

                const label = CATEGORY_LABELS[cat].replace('Instruction ', '');

                return (
                    <div
                        key={cat}
                        className="bg-secondary/10 rounded-2xl p-3 border border-border/40 hover:bg-secondary/15 transition-all duration-300 group"
                    >
                        <div className="text-xs text-muted-foreground uppercase font-bold tracking-tight mb-1.5 group-hover:text-foreground transition-colors">
                            {label}
                        </div>
                        <div className="flex items-center gap-2.5">
                            {cat === 'hours' ? (
                                <div className="flex items-baseline gap-1">
                                    <span className="text-xl font-black tabular-nums text-foreground">{score.toFixed(1)}</span>
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase">hrs/wk</span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col">
                                        <span className={cn("text-xl font-black tabular-nums", scoreColor(score))}>
                                            {score.toFixed(1)}
                                        </span>
                                    </div>
                                    <div className="flex-1 h-1.5 bg-secondary/30 rounded-full overflow-hidden">
                                        <div
                                            className={cn('h-full rounded-full transition-all duration-700 ease-out', barFill(score))}
                                            style={{ width: `${(score / 5) * 100}%` }}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}


export function CourseDetailContent({ course }: CourseDetailContentProps) {
    const { addItem, removeItem, hasItem, getItem } = useCartStore();
    const { fetchCourseEvaluations, getEvaluations, isLoadingCourse } = useEvaluationStore();
    const { isEnriching } = useCourseStore();

    useEffect(() => {
        fetchCourseEvaluations(course.id);
    }, [course.id, fetchCourseEvaluations]);

    const evaluations = getEvaluations(course.id);
    const isLoadingEvals = isLoadingCourse(course.id);
    const metrics = useMemo(() => aggregateMetrics(evaluations), [evaluations]);

    const cartItem = getItem(course.id);

    // Group sections by term, deduplicating by classId so the same section never appears twice
    const sectionsByTerm = (course?.sections || []).reduce((acc, section) => {
        if (!acc[section.term]) acc[section.term] = [];
        const already = acc[section.term].some(s => s.classId === section.classId);
        if (!already) acc[section.term].push(section);
        return acc;
    }, {} as Record<string, Section[]>);

    // Sort terms logically
    const terms = Object.keys(sectionsByTerm).sort((a, b) => {
        const order = ['Autumn', 'Winter', 'Spring', 'Summer'];
        const [semA, yearA] = a.split(' ');
        const [semB, yearB] = b.split(' ');
        if (yearA !== yearB) return yearA.localeCompare(yearB);
        return order.indexOf(semA) - order.indexOf(semB);
    });

    // State for active tab
    const [activeTerm, setActiveTerm] = useState<string>(() => {
        if (cartItem?.selectedTerm && terms.includes(cartItem.selectedTerm)) {
            return cartItem.selectedTerm;
        }
        if (terms.includes('Spring 2026')) return 'Spring 2026';
        return terms[0] || '';
    });

    // Units: use active section or course; support variable units (e.g. 3-4)
    const unitsSource = (() => {
        const secs = sectionsByTerm[activeTerm]
        const section = secs?.find(s => s.classId === (cartItem?.selectedSectionId ?? secs?.[0]?.classId)) ?? secs?.[0]
        return section?.units ?? course?.units
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

    // Get syllabus URL and validate it
    const syllabusUrl = course && activeTerm && syllabusSectionNumber
        ? getSyllabusUrl(course.subject, course.code, syllabusClassId, activeTerm, syllabusSectionNumber)
        : null
    const { isValid: isSyllabusValid, isChecking: isCheckingSyllabus } = useSyllabusValidity(syllabusUrl)

    // Update active term if course changes or terms load
    useEffect(() => {
        if (cartItem?.selectedTerm && terms.includes(cartItem.selectedTerm)) {
            setActiveTerm(cartItem.selectedTerm);
        } else if (terms.length > 0 && !terms.includes(activeTerm)) {
            if (terms.includes('Spring 2026')) setActiveTerm('Spring 2026');
            else setActiveTerm(terms[0]);
        }
    }, [course.id, cartItem?.selectedTerm, terms.length]); // eslint-disable-line

    const isSpring2026 = activeTerm === 'Spring 2026'

    // GER (General Education Requirements / WAYS) from sections
    const gers = useMemo(() => {
        const set = new Set<string>()
        course.sections?.forEach(s => s.gers?.forEach(g => set.add(g)))
        if (isWimCourse(course.subject, course.code)) {
            set.add('WIM')
        }
        return Array.from(set).sort()
    }, [course.sections, course.subject, course.code])
    const gerLabel = gers.length > 0 ? gers.map(abbreviateGer).join(', ') : '—'

    const [previewSection, setPreviewSection] = useState<Section | null>(null);

    const handleSelectSection = (sectionId: number) => {
        if (cartItem?.selectedSectionId === sectionId && cartItem?.selectedTerm === activeTerm) {
            removeItem(course.id);
        } else {
            addItem(course, activeTerm, sectionId, hasVariable ? selectedUnits : undefined);
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
        <div className="container max-w-[95rem] mx-auto p-4 md:px-8 md:pt-4 md:pb-10 space-y-4 animate-in fade-in zoom-in-95 duration-300">
            {/* Calendar Preview Modal */}
            {previewSection && (
                <CalendarPreviewModal
                    course={course}
                    section={previewSection}
                    term={activeTerm}
                    isOpen={!!previewSection}
                    onClose={() => setPreviewSection(null)}
                    onConfirm={() => handleSelectSection(previewSection.classId)}
                />
            )}
            {/* Header Area */}
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-destructive tracking-tight font-[family-name:var(--font-outfit)]">
                        {course.subject} {course.code}
                    </h1>
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold leading-tight text-foreground tracking-tight">{course.title}</h2>

                {/* Quick Info - continuous strip; flex-wrap so dept/GER are never cut off */}
                <div className="inline-flex flex-wrap items-stretch rounded-xl border border-border/40 bg-secondary/20 min-w-0">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 border-r border-border/40 last:border-r-0 shrink-0">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">Units:</span>
                        <span className="text-sm font-semibold text-foreground">{course.units}</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 border-r border-border/40 last:border-r-0 shrink-0">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">Level:</span>
                        <span className="text-sm font-semibold text-foreground">{formatLevel(course.sections?.[0]?.classLevel || course.code)}</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 border-r border-border/40 last:border-r-0 shrink-0">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">Grading:</span>
                        <span className="text-sm font-semibold text-foreground">{course.grading || 'Letter (ABC/NC)'}</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 border-r border-border/40 last:border-r-0 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight shrink-0">Dept:</span>
                        <span className="text-sm font-semibold text-foreground break-words" title={course.dept}>{course.dept || 'N/A'}</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 min-w-0" title={gers.length > 0 ? gers.join(', ') : undefined}>
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight shrink-0">GER:</span>
                        {isEnriching && gers.length === 0 ? (
                            <div className="h-4 bg-secondary/30 rounded w-16 animate-pulse" />
                        ) : (
                            <span className="text-sm font-semibold text-foreground break-words">{gerLabel}</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
                {/* Left Column: Tab Content */}
                <div className="space-y-2">
                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="w-full justify-start bg-transparent border-b border-border/40 rounded-none h-auto p-0 gap-8 mb-4">
                            <TabsTrigger
                                value="overview"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-3 font-semibold text-muted-foreground data-[state=active]:text-foreground transition-all hover:text-foreground/80"
                            >
                                Overview
                            </TabsTrigger>
                            <TabsTrigger
                                value="charts"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-3 font-semibold text-muted-foreground data-[state=active]:text-foreground transition-all hover:text-foreground/80"
                            >
                                Charts
                            </TabsTrigger>
                            <TabsTrigger
                                value="comments"
                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-3 font-semibold text-muted-foreground data-[state=active]:text-foreground transition-all hover:text-foreground/80"
                            >
                                Comments
                            </TabsTrigger>
                        </TabsList>

                        {/* Overview Tab Content */}
                        <TabsContent value="overview" className="focus-visible:outline-none focus-visible:ring-0">
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <CourseDescription description={course.description} contextSubject={course.subject} className="text-lg leading-relaxed" isEnriching={isEnriching} />

                                    {/* Syllabus */}
                                    <div className="pt-2 space-y-2 group/syllabus">
                                        {activeTerm && syllabusSectionNumber ? (
                                            <>
                                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                                    Syllabus for selected term:
                                                    {!isSpring2026 && isCheckingSyllabus && (
                                                        <Loader2 size={12} className="animate-spin opacity-60" />
                                                    )}
                                                    {!isSpring2026 && !isCheckingSyllabus && isSyllabusValid === false && (
                                                        <div title="Syllabus URL may be invalid">
                                                            <AlertCircle size={12} className="text-amber-500" />
                                                        </div>
                                                    )}
                                                    {!isSpring2026 && !isCheckingSyllabus && isSyllabusValid === null && (
                                                        <div title="Unable to verify syllabus availability">
                                                            <AlertCircle size={12} className="text-muted-foreground opacity-50" />
                                                        </div>
                                                    )}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    asChild
                                                    disabled={isSpring2026}
                                                    className={cn(
                                                        "gap-2 w-full sm:w-auto",
                                                        isSpring2026 && "opacity-50 cursor-not-allowed",
                                                        !isSpring2026 && isSyllabusValid === false && "border-amber-500/50 text-amber-600 dark:text-amber-400"
                                                    )}
                                                >
                                                    <a
                                                        href={isSpring2026 ? '#' : (syllabusUrl || '#')}
                                                        target={isSpring2026 ? undefined : "_blank"}
                                                        rel={isSpring2026 ? undefined : "noopener noreferrer"}
                                                        onClick={(e) => {
                                                            if (isSpring2026 || !syllabusUrl) {
                                                                e.preventDefault()
                                                            } else {
                                                                e.stopPropagation()
                                                            }
                                                        }}
                                                    >
                                                        <FileText size={16} />
                                                        View {activeTerm} Syllabus
                                                        {!isSpring2026 && isSyllabusValid === false && (
                                                            <span className="text-xs ml-1">(may not be available)</span>
                                                        )}
                                                        {!isSpring2026 && <ExternalLink size={14} className="opacity-60" />}
                                                    </a>
                                                </Button>
                                                {isSpring2026 && (
                                                    <p className="text-xs text-muted-foreground opacity-0 group-hover/syllabus:opacity-100 transition-opacity duration-150 delay-500">
                                                        Syllabi for Spring 2026 are not yet available on syllabus.stanford.edu.
                                                    </p>
                                                )}
                                                {!isSpring2026 && isSyllabusValid === false && (
                                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                                        This syllabus link may not be available. Try searching on syllabus.stanford.edu directly.
                                                    </p>
                                                )}
                                                {!isSpring2026 && (
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
                        <TabsContent value="charts" className="focus-visible:outline-none focus-visible:ring-0">
                            <CourseEvaluations
                                courseId={course.id}
                                subject={course.subject}
                                code={course.code}
                                forcedTab="overview"
                            />
                        </TabsContent>

                        {/* Comments Tab Content */}
                        <TabsContent value="comments" className="focus-visible:outline-none focus-visible:ring-0">
                            <CourseEvaluations
                                courseId={course.id}
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
                        <div className="flex items-center justify-between border-b border-border/40 pb-2">
                            <h3 className="text-lg font-bold text-foreground">
                                Sections
                            </h3>
                            <div className="text-sm text-muted-foreground font-medium">
                                {terms.length} {terms.length === 1 ? 'Term' : 'Terms'}
                            </div>
                        </div>

                        {terms.length > 0 ? (
                            <Tabs value={activeTerm} onValueChange={setActiveTerm} className="w-full">
                                <TabsList className="w-full justify-start overflow-x-auto bg-transparent border-b border-border/40 rounded-none h-auto p-0 gap-4 mb-4">
                                    {terms.map(term => (
                                        <TabsTrigger
                                            key={term}
                                            value={term}
                                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2 text-sm font-bold text-muted-foreground data-[state=active]:text-foreground transition-all"
                                        >
                                            {term}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>

                                {terms.map(term => (
                                    <TabsContent key={term} value={term} className="space-y-3 focus-visible:outline-none focus-visible:ring-0">
                                        {sectionsByTerm[term].map((section) => (
                                            <div key={section.classId} className="border border-border/60 rounded-xl p-4 bg-card/50 hover:bg-card hover:shadow-md transition-all duration-200 group/section">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="font-bold text-sm text-foreground flex items-center gap-2">
                                                            Section {section.sectionNumber}
                                                            {section.status !== 'Open' && (
                                                                <span className="text-[10px] uppercase font-bold text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                                                                    {section.status}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-0.5 font-medium tracking-tight">ID: {section.classId}</div>
                                                    </div>
                                                </div>

                                                <div className="space-y-2.5 text-sm text-foreground/80 mb-4">
                                                    {section.meetings.map((m, i) => (
                                                        <div key={i} className="space-y-1.5">
                                                            <div className="flex items-center gap-2 text-sm">
                                                                <Clock size={12} className="text-primary/70 shrink-0" />
                                                                <span className="font-semibold text-foreground/90">{m.days} {m.time}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                                <MapPin size={12} className="shrink-0" />
                                                                <span className="truncate">{m.location}</span>
                                                            </div>
                                                            {m.instructors && m.instructors.length > 0 && (
                                                                <InstructorList instructors={m.instructors} />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="pt-3 border-t border-border/30 flex flex-wrap justify-between items-center gap-x-2 gap-y-3">
                                                    <div className="text-sm font-bold text-primary/80 flex items-center gap-2">
                                                        {hasVariableUnits(section.units) ? (() => {
                                                            const opts = parseUnitsOptions(section.units);
                                                            const label = unitsLabel(section.units);
                                                            return opts.length > 1 ? (
                                                                <div className="flex items-center gap-2">
                                                                    <div className={cn(
                                                                        "inline-flex items-center p-0.5 bg-secondary/40 border border-border/60 rounded-lg",
                                                                        opts.length > 6 ? "flex-wrap gap-0.5 max-w-[200px]" : ""
                                                                    )}>
                                                                        {opts.map((u) => (
                                                                            <button
                                                                                key={u}
                                                                                onClick={(e) => { e.stopPropagation(); handleUnitsChange(u); }}
                                                                                disabled={cartItem?.selectedSectionId === section.classId && cartItem?.selectedTerm === activeTerm}
                                                                                className={cn(
                                                                                    "flex items-center justify-center font-bold rounded-md transition-all disabled:opacity-50",
                                                                                    opts.length > 6 ? "w-6 h-5 text-[10px]" : "w-7 h-6 text-xs",
                                                                                    selectedUnits === u
                                                                                        ? "bg-primary text-primary-foreground shadow-sm"
                                                                                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                                                                )}
                                                                            >
                                                                                {u}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
                                                                </div>
                                                            ) : (
                                                                <span>{section.units} {label.charAt(0).toUpperCase() + label.slice(1)}</span>
                                                            );
                                                        })() : (
                                                            <span>{section.units} {unitsLabel(section.units).charAt(0).toUpperCase() + unitsLabel(section.units).slice(1)}</span>
                                                        )}
                                                    </div>

                                                    <Button
                                                        size="sm"
                                                        variant={cartItem?.selectedSectionId === section.classId && cartItem?.selectedTerm === activeTerm ? "default" : "outline"}
                                                        className={cn(
                                                            "h-8 text-sm px-4 rounded-lg font-bold transition-all whitespace-nowrap",
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
                                                        {cartItem?.selectedSectionId === section.classId && cartItem?.selectedTerm === activeTerm ? "Added to Calendar" : "View on Calendar"}
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </TabsContent>
                                ))}
                            </Tabs>
                        ) : isEnriching ? (
                            <div className="space-y-3">
                                {[1, 2].map((i) => (
                                    <div key={i} className="border border-border/60 rounded-xl p-4 bg-card/50 transition-all duration-200">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="space-y-2">
                                                <div className="h-4 bg-secondary/30 rounded w-24 animate-pulse"></div>
                                                <div className="h-3 bg-secondary/30 rounded w-16 animate-pulse mt-1"></div>
                                            </div>
                                        </div>
                                        <div className="space-y-2.5 mb-4">
                                            <div className="h-3 bg-secondary/30 rounded w-40 animate-pulse"></div>
                                            <div className="h-3 bg-secondary/30 rounded w-48 animate-pulse"></div>
                                            <div className="h-3 bg-secondary/30 rounded w-32 animate-pulse"></div>
                                        </div>
                                        <div className="pt-3 border-t border-border/30 flex justify-between items-center">
                                            <div className="h-4 bg-secondary/30 rounded w-16 animate-pulse"></div>
                                            <div className="h-8 bg-secondary/30 rounded w-36 animate-pulse"></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
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

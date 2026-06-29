import type { Metadata } from 'next';
import type { Course, Section } from '@/types/course';
import { getPublicClient, mergeCourseRows, FULL_COURSE_COLUMNS } from '@/lib/supabase-admin';
import {
    abbreviateGer,
    decodeHtmlEntities,
    formatComponent,
    formatLevel,
    isAllowedGer,
    parseUnitsOptions,
} from '@/lib/utils';
import { isWimCourse } from '@/lib/wim-courses';
import { compareTerms } from '@/lib/terms';
import { SITE_URL } from '@/lib/site';
import { CoursePageClient } from './course-page-client';

// Cache the server render (metadata + SSR summary + JSON-LD) for a day.
export const revalidate = 86400;

/** Fetch and merge all rows for a course_id into one Course (multi-term/cross-list aware). */
async function fetchCourse(courseId: string): Promise<Course | null> {
    try {
        const supabase = getPublicClient();
        const { data } = await supabase
            .from('courses')
            .select(FULL_COURSE_COLUMNS)
            .eq('course_id', courseId);
        if (!data || data.length === 0) return null;
        const row = mergeCourseRows(data)[0];
        return {
            id: row.course_id,
            subject: row.subject,
            code: row.code,
            title: row.title,
            description: row.description || '',
            units: row.units,
            grading: row.grading || '',
            instructors: row.instructors || [],
            terms: row.terms || [],
            sections: row.sections || [],
            hours: row.hours != null ? Number(row.hours) : undefined,
            quality: row.quality != null ? Number(row.quality) : undefined,
            difficulty: row.difficulty != null ? Number(row.difficulty) : undefined,
        };
    } catch {
        return null;
    }
}

function plainText(html: string): string {
    return decodeHtmlEntities((html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function stripSeconds(t: string): string {
    return (t || '').replace(/(\d{1,2}:\d{2}):\d{2}/g, '$1');
}

/** GER abbreviations for the course (from sections + WIM injection). */
function gersForCourse(course: Course): string[] {
    const set = new Set<string>();
    course.sections?.forEach((s) => s.gers?.forEach((g) => { if (isAllowedGer(g)) set.add(abbreviateGer(g)); }));
    if (isWimCourse(course.subject, course.code)) set.add('WIM');
    return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ courseId: string }>;
}): Promise<Metadata> {
    const { courseId } = await params;
    const decoded = decodeURIComponent(courseId);
    const course = await fetchCourse(decoded);

    if (!course) {
        return { title: 'Course Not Found — Stanford Root' };
    }

    const code = `${course.subject} ${course.code}`;
    const title = `${code}: ${decodeHtmlEntities(course.title)} — Stanford Root`;
    const blurb = plainText(course.description);
    const desc = (
        `Student reviews, ratings, hours/week, sections, and syllabus for ${code} at Stanford. ` +
        blurb
    ).slice(0, 300);

    return {
        title,
        description: desc,
        alternates: { canonical: `/courses/${encodeURIComponent(course.id)}` },
        openGraph: {
            title,
            description: desc,
            url: `${SITE_URL}/courses/${encodeURIComponent(course.id)}`,
            type: 'article',
        },
    };
}

/** schema.org/Course structured data for rich results. */
function courseJsonLd(course: Course) {
    const code = `${course.subject} ${course.code}`;
    const terms = Array.from(new Set((course.sections || []).map((s) => s.term).filter(Boolean)))
        .sort(compareTerms);

    const instanceByTerm = terms.map((term) => {
        const instructors = Array.from(
            new Set(
                (course.sections || [])
                    .filter((s) => s.term === term)
                    .flatMap((s) => s.meetings?.flatMap((m) => m.instructors || []) || [])
            )
        );
        return {
            '@type': 'CourseInstance',
            name: `${code} — ${term}`,
            courseMode: 'onsite',
            ...(instructors.length > 0 && {
                instructor: instructors.map((name) => ({
                    '@type': 'Person',
                    name: decodeHtmlEntities(name),
                })),
            }),
        };
    });

    return {
        '@context': 'https://schema.org',
        '@type': 'Course',
        name: `${code}: ${decodeHtmlEntities(course.title)}`,
        courseCode: code,
        description: plainText(course.description).slice(0, 500) ||
            `Details, sections, and student evaluations for ${code} at Stanford.`,
        url: `${SITE_URL}/courses/${encodeURIComponent(course.id)}`,
        provider: {
            '@type': 'CollegeOrUniversity',
            name: 'Stanford University',
            sameAs: 'https://www.stanford.edu',
        },
        ...(instanceByTerm.length > 0 && { hasCourseInstance: instanceByTerm }),
    };
}

/** Server-rendered, crawlable course summary (hidden by the client once the
 *  interactive view is ready — see course-page-client.tsx). */
function CourseSummary({ course }: { course: Course }) {
    const code = `${course.subject} ${course.code}`;
    const description = plainText(course.description);
    const unitOpts = parseUnitsOptions(course.units ?? '');
    const unitsLabel = unitOpts.length > 1 ? `${unitOpts[0]}-${unitOpts[unitOpts.length - 1]}` : (unitOpts[0]?.toString() ?? '');
    const gers = gersForCourse(course);
    const terms = Array.from(new Set((course.sections || []).map((s) => s.term).filter(Boolean)))
        .sort(compareTerms);

    const sectionsByTerm = terms.map((term) => {
        const seen = new Set<number>();
        const secs = (course.sections || []).filter((s) => {
            if (s.term !== term || seen.has(s.classId)) return false;
            seen.add(s.classId);
            return true;
        });
        return { term, secs };
    });

    return (
        <section id="ssr-course-summary" aria-label={`${code} overview`} className="mx-auto max-w-3xl px-5 py-8">
            <h1 className="text-2xl font-bold">{code}: {decodeHtmlEntities(course.title)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                {[unitsLabel && `${unitsLabel} units`, course.grading, gers.length > 0 && `GER: ${gers.join(', ')}`]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
            {description && <p className="mt-4 leading-relaxed">{description}</p>}
            {terms.length > 0 && (
                <p className="mt-4 text-sm">Offered in {terms.join(', ')} at Stanford University.</p>
            )}
            {sectionsByTerm.map(({ term, secs }) => (
                secs.length > 0 && (
                    <div key={term} className="mt-6">
                        <h2 className="text-lg font-semibold">{term} sections</h2>
                        <ul className="mt-2 space-y-1 text-sm">
                            {secs.map((s: Section) => {
                                const m = s.meetings?.[0];
                                const days = m?.days?.trim() || 'TBA';
                                const time = m?.time ? stripSeconds(m.time) : 'TBA';
                                const instructors = (m?.instructors || []).map(decodeHtmlEntities).join(', ');
                                const level = formatLevel(s.classLevel || course.code);
                                return (
                                    <li key={s.classId}>
                                        {formatComponent(s.component)} — {days} {time}
                                        {m?.location ? ` — ${m.location}` : ''}
                                        {instructors ? ` — ${instructors}` : ''}
                                        {level ? ` (${level})` : ''}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )
            ))}
        </section>
    );
}

export default async function CoursePage({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    const { courseId } = await params;
    const decoded = decodeURIComponent(courseId);
    const course = await fetchCourse(decoded);

    return (
        <>
            {course && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd(course)) }}
                />
            )}
            {course && <CourseSummary course={course} />}
            <CoursePageClient />
        </>
    );
}

import type { Metadata } from 'next';
import { getPublicClient } from '@/lib/supabase-admin';
import { CoursePageClient } from './course-page-client';

async function fetchCourseMeta(courseId: string) {
    try {
        const supabase = getPublicClient();
        const { data } = await supabase
            .from('courses')
            .select('title, subject, code, description, units')
            .eq('course_id', courseId)
            .limit(1)
            .single();
        return data;
    } catch {
        return null;
    }
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ courseId: string }>;
}): Promise<Metadata> {
    const { courseId } = await params;
    const decoded = decodeURIComponent(courseId);
    const course = await fetchCourseMeta(decoded);

    if (!course) {
        return { title: 'Course Not Found — Stanford Root' };
    }

    const title = `${course.subject} ${course.code}: ${course.title} — Stanford Root`;
    const desc = course.description
        ? course.description.replace(/<[^>]*>/g, '').slice(0, 160)
        : `View details, sections, and evaluations for ${course.subject} ${course.code} at Stanford.`;

    return {
        title,
        description: desc,
        openGraph: { title, description: desc },
    };
}

export default function CoursePage() {
    return <CoursePageClient />;
}

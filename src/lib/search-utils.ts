import type { Course } from '@/types/course';

/**
 * Filters a list of courses based on a search query.
 * This function encapsulates the core text-matching logic used across the application.
 *
 * @param courses The array of courses to search through.
 * @param query The search string provided by the user.
 * @returns A new array of filtered courses.
 */
export function searchCourses(courses: Course[], query: string): Course[] {
    if (!query) return courses;

    let result = courses;
    const lowerQuery = query.toLowerCase().trim();
    const compactQuery = lowerQuery.replace(/\s+/g, '');
    const parts = lowerQuery.split(/\s+/).filter(Boolean);

    const allSubjects = new Set(courses.map(c => c.subject));

    let subject = parts[0]?.toUpperCase() || '';
    let remainingQuery = parts.slice(1).join(' ');

    // Support searches like "cs106a" (combined subject and code) as well as "cs 106a"
    if (parts.length === 1 && compactQuery) {
        const m = compactQuery.match(/^([a-z&]+)(\d.*)$/i);
        if (m) {
            const maybeSubject = m[1].toUpperCase();
            if (allSubjects.has(maybeSubject)) {
                subject = maybeSubject;
                remainingQuery = m[2] || '';
            }
        }
    }

    const isSubjectSearch = Boolean(subject) && allSubjects.has(subject);

    if (isSubjectSearch) {
        result = result.filter(c => c.subject === subject);

        if (remainingQuery) {
            const remainingLower = remainingQuery.toLowerCase().trim();
            const remainingCompact = remainingLower.replace(/\s+/g, '');
            result = result.filter(c => {
                const codeCompact = (c.code || '').toLowerCase().replace(/\s+/g, '');
                if (codeCompact.includes(remainingCompact)) return true;
                if ((c.title || '').toLowerCase().includes(remainingLower)) return true;
                return false; /* No instructor search under explicit subject */
            });
        }
    } else {
        result = result.filter(c => {
            const subjectCodeSpaced = `${c.subject} ${c.code}`.toLowerCase();
            const subjectCodeCompact = `${c.subject}${c.code}`.toLowerCase().replace(/\s+/g, '');
            const codeCompact = (c.code || '').toLowerCase().replace(/\s+/g, '');

            if (subjectCodeSpaced.startsWith(lowerQuery)) return true;
            if (subjectCodeCompact.startsWith(compactQuery)) return true;
            if (codeCompact.includes(compactQuery)) return true;
            if ((c.title || '').toLowerCase().includes(lowerQuery)) return true;
            if (c.instructors && c.instructors.some(i => i.toLowerCase().includes(lowerQuery))) return true;
            return false;
        });
    }

    return result;
}

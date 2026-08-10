import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { getInstructorCoursesFromDump, getInstructorDirectory } from '@/lib/catalog-dump';
import { resolveInstructorSlug, type InstructorResolution } from '@/lib/instructors';
import { SITE_URL } from '@/lib/site';
import { SiteHeader } from '@/components/site-header';
import { InstructorDetailContent } from '@/components/instructor-detail-content';

export const revalidate = 86400;

const resolve = cache(async (slug: string): Promise<InstructorResolution> => {
    const directory = await getInstructorDirectory();
    return resolveInstructorSlug(directory, slug);
});

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const resolved = await resolve(decodeURIComponent(slug));

    if (resolved.kind === 'ambiguous') {
        const last = resolved.candidates[0].sortName.split(',')[0];
        return { title: `Instructors named ${last} — Stanford Root` };
    }

    // An initial-only slug redirects, so describe the person it lands on.
    const entry = resolved.kind === 'found'
        ? resolved.entry
        : resolved.kind === 'redirect'
            ? (await getInstructorDirectory()).bySlug.get(resolved.slug)
            : undefined;
    if (!entry) {
        return { title: 'Instructor Not Found — Stanford Root' };
    }

    const { name, slug: canonical } = entry;
    const title = `${name} — Stanford Root`;
    const description =
        `Student ratings, hours per week, reviews, and comments for ${name}'s Stanford courses.`;

    return {
        title,
        description,
        alternates: { canonical: `/instructors/${canonical}` },
        openGraph: {
            title,
            description,
            url: `${SITE_URL}/instructors/${canonical}`,
            type: 'profile',
        },
    };
}

/** Several people share this surname and first initial, so let the reader pick. */
function InstructorChooser({ candidates }: { candidates: { slug: string; name: string; sortName: string }[] }) {
    const last = candidates[0].sortName.split(',')[0];

    return (
        <div className="container max-w-2xl mx-auto px-4 py-10 space-y-5">
            <div className="space-y-2">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Which {last}?</h1>
                <p className="text-[15px] text-muted-foreground">
                    Course listings publish first initials only, and more than one instructor matches.
                </p>
            </div>
            <div className="space-y-2">
                {candidates.map(candidate => (
                    <Link
                        key={candidate.slug}
                        href={`/instructors/${candidate.slug}`}
                        className="block rounded-xl border border-border/40 bg-secondary/10 px-4 py-3 text-[15px] font-bold text-foreground hover:bg-secondary/20 transition-colors"
                    >
                        {candidate.name}
                    </Link>
                ))}
            </div>
        </div>
    );
}

export default async function InstructorPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const decoded = decodeURIComponent(slug);
    const resolved = await resolve(decoded);

    if (resolved.kind === 'missing') notFound();
    if (resolved.kind === 'redirect') redirect(`/instructors/${resolved.slug}`);

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <SiteHeader />
            <main className="flex-1 bg-background">
                {resolved.kind === 'ambiguous' ? (
                    <InstructorChooser candidates={resolved.candidates} />
                ) : (
                    <InstructorDetailContent
                        slug={resolved.entry.slug}
                        name={resolved.entry.name}
                        upcoming={await getInstructorCoursesFromDump(resolved.entry.initialSlug)}
                        sharesInitialWith={(await getInstructorDirectory())
                            .namedByInitialSlug.get(resolved.entry.initialSlug)
                            ?.filter(other => other.slug !== resolved.entry.slug)
                            .map(other => ({ slug: other.slug, name: other.name })) ?? []}
                    />
                )}
            </main>
        </div>
    );
}

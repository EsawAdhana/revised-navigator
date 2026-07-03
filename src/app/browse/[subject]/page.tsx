import Link from 'next/link'
import { cache, Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { getDepartmentCourses, type DeptCourse } from '@/lib/departments'
import { decodeHtmlEntities } from '@/lib/utils'
import { SITE_URL } from '@/lib/site'

// Rebuild each department page at most once a day.
export const revalidate = 86400

/** Resolve the subject param, canonicalizing casing (e.g. /browse/cs -> /browse/CS)
 *  and 404ing unknown departments. Shared by generateMetadata and the page so the
 *  redirect/notFound fires in generateMetadata — before the response streams —
 *  producing a real 308/404 status instead of a meta-refresh/noindex body. */
const resolveDepartment = cache(async (raw: string) => {
  const subject = decodeURIComponent(raw)
  if (subject !== subject.toUpperCase()) {
    permanentRedirect(`/browse/${encodeURIComponent(subject.toUpperCase())}`)
  }
  const courses = await getDepartmentCourses(subject)
  if (courses.length === 0) notFound()
  return { subject, courses }
})

function courseMeta(course: DeptCourse): string {
  return [
    course.units && `${course.units} units`,
    course.quality != null && `${course.quality.toFixed(1)}/5 rating`,
    course.hours != null && `${course.hours.toFixed(0)} hrs/wk`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subject: string }>
}): Promise<Metadata> {
  const { subject: raw } = await params
  const { subject, courses } = await resolveDepartment(raw)

  const title = `${subject} Courses at Stanford (${courses.length}) — Stanford Root`
  const description =
    `All ${courses.length} ${subject} courses in Stanford's catalog with student evaluation ` +
    `ratings, hours per week, and sections. ` +
    courses.slice(0, 3).map((c) => `${c.subject} ${c.code}`).join(', ') +
    ', and more.'

  return {
    title,
    description,
    alternates: { canonical: `/browse/${encodeURIComponent(subject)}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/browse/${encodeURIComponent(subject)}`,
      type: 'website',
    },
  }
}

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ subject: string }>
}) {
  const { subject: raw } = await params
  const { subject, courses } = await resolveDepartment(raw)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Suspense fallback={<div className="h-16 border-b border-border/50" />}>
        <SiteHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-3xl px-6 py-12 flex-1">
        <nav className="mb-6 text-sm text-muted-foreground">
          <Link href="/browse/departments" className="hover:text-primary transition-colors">
            &larr; All departments
          </Link>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight">{subject} courses at Stanford</h1>
        <p className="mt-2 text-muted-foreground">
          {courses.length} {subject} {courses.length === 1 ? 'course' : 'courses'}{' '}
          in Stanford&rsquo;s catalog, with ratings and hours per week from real student evaluations.
        </p>
        <ul className="mt-8 divide-y divide-border/40">
          {courses.map((course) => {
            const meta = courseMeta(course)
            return (
              <li key={course.id}>
                <Link
                  href={`/courses/${encodeURIComponent(course.id)}`}
                  prefetch={false}
                  className="block py-3 group"
                >
                  <span className="font-medium group-hover:text-primary transition-colors">
                    {course.subject} {course.code}: {decodeHtmlEntities(course.title)}
                  </span>
                  {meta && (
                    <span className="mt-0.5 block text-sm text-muted-foreground">{meta}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
        <p className="mt-10 text-sm text-muted-foreground">
          <Link href="/browse" className="underline hover:text-primary transition-colors">
            Search and filter the full catalog
          </Link>
          {' · '}
          <Link href="/browse/departments" className="underline hover:text-primary transition-colors">
            All departments
          </Link>
        </p>
      </main>
    </div>
  )
}

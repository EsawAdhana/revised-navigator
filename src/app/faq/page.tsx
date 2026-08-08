import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SiteHeader } from '@/components/site-header'

export const metadata: Metadata = {
  title: 'FAQ — Stanford Root',
  description: 'Where course data comes from, why evaluations need Stanford sign-in, and how feedback works.',
  alternates: { canonical: '/faq' },
}

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Suspense fallback={<div className="h-16 border-b border-border/50" />}>
        <SiteHeader />
      </Suspense>
      <div className="mx-auto max-w-3xl px-6 py-12 flex-1">
        <h1 className="text-3xl font-bold text-foreground mb-10">FAQ</h1>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-sm text-foreground/80 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Why does Stanford Root not show grade averages or distributions?
            </h2>
            <p>
              Carta was the only place to get performance review data, and that feature has since been
              removed as of 2020; you can read The Stanford Daily&apos;s coverage{' '}
              <a
                href="https://stanforddaily.com/2020/05/04/carta-removes-performance-feature-following-grading-policy-changes/"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                here
              </a>
              . So technically, grade data is still available through 2019, but it is so stale that
              it was decided against adding it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Where does the course information come from?
            </h2>
            <p>
              Course information comes from Stanford&apos;s official course catalog and is refreshed once
              per day. Details can change, so verify enrollment status, prerequisites, meeting times,
              and deadlines in official Stanford systems before making academic decisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Why do I need to sign in with Stanford to view evaluations?
            </h2>
            <p>
              Stanford&apos;s own{' '}
              <a
                href="https://course-evaluations.stanford.edu"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Course Evaluation System
              </a>{' '}
              restricts evaluation results to the Stanford community. Stanford Root follows that same
              boundary. Anyone can browse courses and build a schedule without signing in.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Do I need an account to use Stanford Root?
            </h2>
            <p>
              No. As stated above, course browsing and schedule building are available to everyone. A
              Stanford account is only required to view evaluations and sync a schedule across devices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Is Stanford Root affiliated with Stanford University?
            </h2>
            <p>
              No. Stanford Root is an independent course discovery and scheduling tool. It is not
              affiliated with or endorsed by Stanford University.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Is feedback sent through Stanford Root anonymous?
            </h2>
            <p>
              Yes. Feedback from the help button is never attached to your Stanford account, even when
              you are signed in. We only store the message and whether it is feedback or a request.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

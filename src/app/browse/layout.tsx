import type { Metadata } from 'next';

// Canonicalize all filtered/query-param browse URLs (?depts=..., ?q=...) to the
// bare /browse so search engines don't index thousands of filter permutations.
export const metadata: Metadata = {
  title: 'Browse Stanford Courses — Stanford Root',
  description:
    "Search and filter Stanford's full course catalog by department, term, units, time, GER, and more. See ratings and hours/week from real student evaluations.",
  alternates: { canonical: '/browse' },
};

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return children;
}

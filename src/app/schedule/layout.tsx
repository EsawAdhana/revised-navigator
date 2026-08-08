import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Schedule — Stanford Root',
  description: 'Build a conflict-free weekly schedule from Stanford courses.',
  alternates: { canonical: '/schedule' },
}

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children
}

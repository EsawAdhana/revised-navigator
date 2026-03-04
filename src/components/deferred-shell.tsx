'use client';

import dynamic from 'next/dynamic';

const LoadingToast = dynamic(
  () => import('@/components/loading-toast').then(m => ({ default: m.LoadingToast })),
  { ssr: false }
);
const FeedbackDialog = dynamic(
  () => import('@/components/feedback-dialog').then(m => ({ default: m.FeedbackDialog })),
  { ssr: false }
);

export function DeferredShell() {
  return (
    <>
      <LoadingToast />
      <FeedbackDialog />
    </>
  );
}

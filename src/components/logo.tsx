import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Stanford Root brand mark — a sprout, recolorable via `currentColor`.
 * Defaults to foreground (black in light mode, white in dark mode).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Stanford Root"
      className={cn('text-foreground', className)}
    >
      <path d="M24 41 V20" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
      <path d="M24 30 C15 30 9 24 9 15 C18 15 24 21 24 30 Z" fill="currentColor" />
      <path d="M24 24 C33 24 39 18 39 9 C30 9 24 15 24 24 Z" fill="currentColor" />
    </svg>
  );
}

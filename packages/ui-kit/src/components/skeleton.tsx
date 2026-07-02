import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * Skeleton per docs/08 §15.14 — subtle opacity pulse, no shimmer wave.
 * Respects prefers-reduced-motion (animation collapses via motion tokens in globals.css).
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-sm bg-surface-2', className)}
      {...props}
    />
  );
}

import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * Badge per docs/08 §15.6 — rectangular status/count marker.
 * Color semantics never encode meaning alone (docs/07 §12.5); pair with text/icon.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        neutral: 'border border-edge-subtle bg-surface-2 text-fg',
        success: 'bg-success-surface text-success',
        warning: 'bg-warning-surface text-warning',
        danger: 'bg-danger-surface text-danger',
        info: 'bg-info-surface text-info',
        ai: 'bg-ai-surface text-ai',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

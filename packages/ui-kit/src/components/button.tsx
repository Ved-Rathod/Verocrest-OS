import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * Button per docs/08 §15.1 + state matrix §9.
 * Variants: primary, secondary, ghost, danger. Sizes: sm (28px), md (36px), lg (44px).
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-md font-medium',
    'transition-colors duration-100 select-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    'disabled:pointer-events-none disabled:opacity-40',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-fg-on-primary hover:bg-primary-hover active:bg-primary-active',
        secondary: 'border border-edge bg-surface-2 text-fg hover:bg-surface-3',
        ghost: 'text-fg hover:bg-surface-2',
        danger: 'bg-danger text-fg-on-primary hover:opacity-90',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

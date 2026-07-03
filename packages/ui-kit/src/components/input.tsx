import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '../lib/cn';

/**
 * Input per docs/08 §15.2 — label above, help text below, error replaces help.
 * Error state colors the border and is announced to screen readers.
 */
export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  help?: string;
  error?: string;
}

export function InputField({ label, help, error, className, id, ...props }: InputFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-fg">
        {label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={help || error ? messageId : undefined}
        className={cn(
          'h-9 rounded-sm border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-subtle',
          'transition-colors duration-100',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          'disabled:cursor-not-allowed disabled:opacity-40',
          error ? 'border-danger' : 'border-edge hover:border-edge-strong',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={messageId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : help ? (
        <p id={messageId} className="text-xs text-fg-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}

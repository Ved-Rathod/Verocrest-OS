import type { TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '../lib/cn';

/**
 * Textarea per docs/08 §15.2 — label above, help/error below, error colors the
 * border and is announced to screen readers. Mirrors InputField.
 */
export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  help?: string;
  error?: string;
}

export function TextareaField({ label, help, error, className, id, ...props }: TextareaFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-message`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-fg">
        {label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={help || error ? messageId : undefined}
        className={cn(
          'min-h-20 rounded-sm border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-subtle',
          'transition-colors duration-100 resize-y',
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

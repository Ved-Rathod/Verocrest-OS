import { AlertTriangleIcon } from 'lucide-react';

/** Form-level error banner per docs/07 §9.3 / docs/08 §15.13 (danger variant). */
export function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger"
    >
      <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      <span>{message}</span>
    </div>
  );
}

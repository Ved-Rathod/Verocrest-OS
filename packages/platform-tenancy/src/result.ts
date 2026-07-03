/**
 * Shared action-result envelope per docs/10 §10. This is the platform home for
 * the contract (domain-auth carries a local copy from Sprint 1.3 that graduates
 * here when the API-layer sprint consolidates). Client-safe: pure, no imports.
 */
export type ErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'business'
  | 'rate_limit'
  | 'integration'
  | 'ai'
  | 'database'
  | 'internal';

export type ActionError = {
  code: string;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  fieldErrors?: Record<string, string>;
};

export type ActionResult<T> = {
  data: T | null;
  error: ActionError | null;
  requestId: string;
};

export function ok<T>(data: T): ActionResult<T> {
  return { data, error: null, requestId: crypto.randomUUID() };
}

export function fail<T = never>(error: ActionError): ActionResult<T> {
  return { data: null, error, requestId: crypto.randomUUID() };
}

/** Generic internal fallback — never leaks a raw error upstream (docs/11 §14.3). */
export function internalError(): ActionError {
  return {
    code: 'INTERNAL',
    category: 'internal',
    message: 'Something didn’t go through. Try again.',
    retryable: true,
  };
}

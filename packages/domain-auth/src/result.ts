/**
 * Action result envelope per docs/10 §10. Local to domain-auth for now;
 * graduates to a platform package when the API layer sprint lands (the shape
 * is the frozen contract, the location is implementation detail).
 */
export type ActionError = {
  code: string;
  category:
    | 'validation'
    | 'authentication'
    | 'authorization'
    | 'business'
    | 'rate_limit'
    | 'integration'
    | 'internal';
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

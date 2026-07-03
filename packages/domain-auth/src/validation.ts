import { z } from 'zod';

/**
 * Auth input validation per docs/10 §9.4 (strict, unknown keys rejected at the
 * form boundary) and NFR-SEC-009 (password ≥ 12 chars; breach check in hibp.ts).
 */

export const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Email format is invalid');

export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(12, 'Must be at least 12 characters')
  .max(128, 'Must be at most 128 characters');

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const signInSchema = z
  .object({
    email: emailSchema,
    password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
  })
  .strict();

export const resetRequestSchema = z.object({ email: emailSchema }).strict();

export const updatePasswordSchema = z.object({ password: passwordSchema }).strict();

/** Flatten a Zod error into the envelope's fieldErrors shape (docs/10 §10.4). */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '(root)';
    out[key] ??= issue.message;
  }
  return out;
}

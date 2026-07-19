import { z } from 'zod';

/** Analyze-website input (Sprint 4.8). A bare host gets an https:// scheme. */
export function withScheme(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export const analyzeInputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Enter a website URL')
    .max(2048, 'URL is too long')
    .transform(withScheme)
    .refine((v) => {
      try {
        const u = new URL(v);
        return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
      } catch {
        return false;
      }
    }, 'Enter a valid http(s) URL'),
});

export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;

import { z } from 'zod';
import { WORKSPACE_CURRENCIES } from './types';

/** True when the string is a valid IANA timezone on this runtime. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Workspace settings input per docs/04 §3.1 constraints + FR-FIN-008 currencies. */
export const workspaceSettingsSchema = z
  .object({
    name: z
      .string({ required_error: 'Workspace name is required' })
      .trim()
      .min(2, 'Must be at least 2 characters')
      .max(60, 'Must be at most 60 characters'),
    timezone: z
      .string({ required_error: 'Timezone is required' })
      .refine(isValidTimezone, 'Must be a valid IANA timezone'),
    defaultCurrency: z.enum(WORKSPACE_CURRENCIES, {
      errorMap: () => ({ message: 'Must be one of the supported launch currencies' }),
    }),
  })
  .strict();

export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;

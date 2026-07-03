// @verocrest/platform-integrations — provider adapters per docs/11.
// Vendor SDK imports are permitted ONLY inside this package (docs/11 §2).
//
// Consumers import via subpaths to keep server/browser code separated:
//   @verocrest/platform-integrations/supabase/server
//   @verocrest/platform-integrations/supabase/browser
//   @verocrest/platform-integrations/supabase/middleware
//   @verocrest/platform-integrations/supabase/types
//
// Supabase adapter landed in Sprint 1.3. Anthropic, OpenAI, Browserless,
// Google (Gmail/Calendar), and Resend adapters land in Sprint 5+ per BUILD_ROADMAP.
export type { AuthUser } from './supabase/types';

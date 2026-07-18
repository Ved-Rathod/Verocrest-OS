import { serve } from 'inngest/next';
import { functions, inngest } from '@verocrest/platform-jobs/server';

/**
 * Inngest serve endpoint (docs/10 §3.4, §7). Inngest (cloud or the local dev
 * server) discovers the app's functions here and invokes them over HTTP when a
 * matching event is sent. This is the first API Route Handler in the app — all
 * CRM mutations are Server Actions; only the bus runtime needs a public webhook.
 */
export const { GET, POST, PUT } = serve({ client: inngest, functions });

import 'server-only';
import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import {
  BASELINE_PROMPTS,
  getBaselinePrompt,
  getCapabilityConfig,
  type Capability,
} from '@verocrest/platform-ai-router';
import { createSupabasePromptStore } from '@verocrest/platform-ai-router/server';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';

/**
 * Read model for Settings → AI Prompt Library viewer (docs/09 §3.9, docs/06
 * §5.10). Read-only (v0.1 — editing is Phase 2). Reuses the Router's resolution
 * chain: workspace override → global default → code baseline (docs/09 §3.4).
 *
 * The active prompt per capability is resolved through the same PromptStore the
 * Router uses at call time, so the viewer shows exactly what would run. DB tiers
 * are probed via the RLS cookie client (member SELECT on prompt_library).
 */

export type PromptSource = 'workspace' | 'global' | 'code';

export type PromptTier = {
  tier: PromptSource;
  present: boolean;
  version: number | null;
};

export type PromptView = {
  capability: Capability;
  activeSource: PromptSource;
  version: number;
  systemMessage: string;
  template: string;
  variables: readonly string[];
  /** True when the capability declares a structured-output schema (docs/09 §2.7). */
  hasSchema: boolean;
  chain: PromptTier[];
};

/** Capabilities that carry a prompt today: any with a code baseline or a DB row. */
async function candidateCapabilities(workspaceId: string): Promise<Capability[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('prompt_library')
    .select('capability, workspace_id')
    .is('deleted_at', null)
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`);
  if (error) throw error;

  const caps = new Set<Capability>(Object.keys(BASELINE_PROMPTS) as Capability[]);
  for (const row of data ?? []) caps.add(row.capability as Capability);
  return [...caps].sort();
}

export async function getPromptViews(ctx: WorkspaceContext): Promise<PromptView[]> {
  const store = createSupabasePromptStore();
  const capabilities = await candidateCapabilities(ctx.workspaceId);

  const views: PromptView[] = [];
  for (const capability of capabilities) {
    // Fail-soft per tier, matching resolvePrompt (docs/09 §3.4 guarantee).
    const workspacePrompt = await store
      .getActivePrompt(ctx.workspaceId, capability)
      .catch(() => null);
    const globalPrompt = await store.getActivePrompt(null, capability).catch(() => null);
    const baseline = getBaselinePrompt(capability);

    const active =
      workspacePrompt ??
      globalPrompt ??
      (baseline ? { ...baseline, source: 'code' as const } : null);
    if (!active) continue; // capability with no resolvable prompt (e.g. embed-only)

    views.push({
      capability,
      activeSource: active.source,
      version: active.version,
      systemMessage: active.systemMessage,
      template: active.template,
      variables: active.variables,
      hasSchema: Boolean(getCapabilityConfig(capability)?.outputSchema),
      chain: [
        {
          tier: 'workspace',
          present: Boolean(workspacePrompt),
          version: workspacePrompt?.version ?? null,
        },
        { tier: 'global', present: Boolean(globalPrompt), version: globalPrompt?.version ?? null },
        { tier: 'code', present: Boolean(baseline), version: baseline?.version ?? null },
      ],
    });
  }
  return views;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { createSupabaseServiceRoleClient } from '@verocrest/platform-integrations/supabase/service';
import type { AiUsageRecord, UsageStore } from './ports';
import type { PromptStore, ResolvedPrompt } from './prompts/registry';
import type { Capability } from './types';

/**
 * Supabase-backed implementations of the Router's persistence ports. Retrieval /
 * generation run in the requesting user's context (cookie client, RLS). The
 * memory-writer subscriber has no session, so it uses the service-role variant —
 * its ai.output.produced event MUST carry a non-'user' actor or the atomic RPC's
 * actor check (auth.uid() is null under service role) rejects it.
 */

function usageRowFromRecord(record: AiUsageRecord): Record<string, unknown> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    request_id: record.requestId,
    capability: record.capability,
    provider: record.provider,
    model: record.model,
    input_tokens: record.inputTokens,
    output_tokens: record.outputTokens,
    cost_usd: record.costUsd,
    latency_ms: record.latencyMs,
    caller_module: record.callerModule,
    prompt_id: record.promptId,
    prompt_version: record.promptVersion,
    prompt_library_id: record.promptLibraryId ?? null,
    status: record.status,
    error: record.error ?? null,
    occurred_at: record.occurredAt,
  };
}

function makeUsageStore(getClient: () => Promise<SupabaseClient>): UsageStore {
  return {
    async getMonthlySpendUsd(workspaceId: string): Promise<number> {
      const supabase = await getClient();
      const { data, error } = await supabase.rpc('month_ai_spend_usd', {
        p_workspace: workspaceId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },

    async getMonthlyBudgetUsd(workspaceId: string): Promise<number> {
      const supabase = await getClient();
      const { data, error } = await supabase
        .from('workspaces')
        .select('ai_budget_monthly_usd')
        .eq('id', workspaceId)
        .single();
      if (error) throw error;
      return Number(data.ai_budget_monthly_usd);
    },

    async logUsageWithEvent(
      record: AiUsageRecord,
      journalRow: Record<string, unknown>,
    ): Promise<void> {
      const supabase = await getClient();
      const { error } = await supabase.rpc('log_ai_usage_with_event', {
        p_usage: usageRowFromRecord(record),
        p_event: journalRow,
      });
      if (error) throw error;
    },

    async logUsageError(record: AiUsageRecord): Promise<void> {
      const supabase = await getClient();
      const { error } = await supabase.from('ai_usage_events').insert(usageRowFromRecord(record));
      if (error) throw error;
    },
  };
}

/** Request-scoped usage store (RLS, cookie client). */
export function createSupabaseUsageStore(): UsageStore {
  return makeUsageStore(() => createSupabaseServerClient());
}

/** Service-role usage store — the memory-writer subscriber (no user session). */
export function createServiceRoleUsageStore(): UsageStore {
  return makeUsageStore(() => Promise.resolve(createSupabaseServiceRoleClient()));
}

type PromptLibraryRow = {
  id: string;
  key: string;
  version: number;
  template: string;
  system_message: string | null;
  variables: unknown;
};

function variableNames(raw: unknown): string[] {
  // docs/04 §18.3: variables jsonb is [{ name, type, required, description }].
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) =>
      typeof v === 'string'
        ? v
        : typeof v === 'object' && v !== null && 'name' in v
          ? String((v as { name: unknown }).name)
          : null,
    )
    .filter((n): n is string => n !== null && n !== '');
}

function toResolvedPrompt(row: PromptLibraryRow, source: 'workspace' | 'global'): ResolvedPrompt {
  return {
    id: row.key,
    version: row.version,
    systemMessage: row.system_message ?? '',
    template: row.template,
    variables: variableNames(row.variables),
    promptLibraryId: row.id,
    source,
  };
}

export function createSupabasePromptStore(): PromptStore {
  return {
    async getActivePrompt(
      workspaceId: string | null,
      capability: Capability,
      versionPin?: number,
    ): Promise<ResolvedPrompt | null> {
      const supabase = await createSupabaseServerClient();
      let query = supabase
        .from('prompt_library')
        .select('id, key, version, template, system_message, variables')
        .eq('capability', capability)
        .eq('active', true)
        .is('deleted_at', null);
      query =
        workspaceId === null
          ? query.is('workspace_id', null)
          : query.eq('workspace_id', workspaceId);
      query =
        versionPin !== undefined ? query.eq('version', versionPin) : query.eq('is_default', true);

      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return toResolvedPrompt(
        data as PromptLibraryRow,
        workspaceId === null ? 'global' : 'workspace',
      );
    },
  };
}

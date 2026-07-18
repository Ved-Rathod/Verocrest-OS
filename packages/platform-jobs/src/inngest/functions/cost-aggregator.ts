import { createSupabaseServiceRoleClient } from '@verocrest/platform-integrations/supabase/service';
import { inngest } from '../client';

/**
 * Cost aggregator (docs/03 §8.5; docs/09 §6.6): subscribes to
 * ai.output.produced and maintains the ai_usage_daily rollup. Runs with the
 * service role (subscribers have no user session; ai_usage_daily has no member
 * write policy). Reads the authoritative usage row via the event's subject_id
 * (Amendment 005) so token totals come from ai_usage_events, not the payload.
 * Idempotency: the envelope ULID dedupes deliveries at the Inngest layer.
 */

type CountMap = Record<string, number>;

function bump(map: unknown, key: string): CountMap {
  const counts: CountMap = typeof map === 'object' && map !== null ? { ...(map as CountMap) } : {};
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}

export const costAggregator = inngest.createFunction(
  { id: 'ai-cost-aggregator', name: 'AI cost aggregator' },
  { event: 'ai.output.produced' },
  async ({ event, logger }) => {
    const envelope = event.data;
    const usageId = envelope.subject.id;
    if (!usageId) {
      logger.warn('ai.output.produced without subject_id; skipping rollup', { id: envelope.id });
      return { skipped: true };
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data: usage, error: usageError } = await supabase
      .from('ai_usage_events')
      .select('workspace_id, capability, model, cost_usd, input_tokens, output_tokens, occurred_at')
      .eq('id', usageId)
      .maybeSingle();
    if (usageError) throw usageError;
    if (!usage) {
      logger.warn('usage row not found for ai.output.produced', { usageId });
      return { skipped: true };
    }

    const day = String(usage.occurred_at).slice(0, 10);
    const { data: existing, error: readError } = await supabase
      .from('ai_usage_daily')
      .select(
        'total_calls, total_cost_usd, total_input_tokens, total_output_tokens, by_capability, by_model',
      )
      .eq('workspace_id', usage.workspace_id)
      .eq('day', day)
      .maybeSingle();
    if (readError) throw readError;

    const { error: upsertError } = await supabase.from('ai_usage_daily').upsert(
      {
        workspace_id: usage.workspace_id,
        day,
        total_calls: (existing?.total_calls ?? 0) + 1,
        total_cost_usd: Number(existing?.total_cost_usd ?? 0) + Number(usage.cost_usd),
        total_input_tokens: Number(existing?.total_input_tokens ?? 0) + Number(usage.input_tokens),
        total_output_tokens:
          Number(existing?.total_output_tokens ?? 0) + Number(usage.output_tokens),
        by_capability: bump(existing?.by_capability, String(usage.capability)),
        by_model: bump(existing?.by_model, String(usage.model)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,day' },
    );
    if (upsertError) throw upsertError;

    logger.info('ai usage rolled up', { workspaceId: usage.workspace_id, day, usageId });
    return { workspaceId: usage.workspace_id, day };
  },
);

import {
  buildEvent,
  journalRowFromEnvelope,
  publishToBus,
  type EventActor,
} from '@verocrest/platform-event-bus';
import type { AiUsageRecord, UsageStore } from './ports';

/**
 * Shared success-path telemetry (docs/09 §2.3 step 9): atomically write the
 * ai_usage_events row + its ai.output.produced journal row, then fire-and-forget
 * the bus publish. Used by BOTH the generation pipeline and the embed path so
 * cost + event emission are identical. Fail-soft: the model already produced its
 * result, so losing telemetry must not lose the result.
 */
export async function logAiUsageAndEmit(
  usageStore: UsageStore,
  params: {
    workspaceId: string;
    actor: EventActor;
    requestId: string;
    capability: string;
    callerModule: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
    promptId: string;
    promptVersion: number;
    promptLibraryId?: string;
  },
): Promise<{ usageId: string }> {
  const usageId = crypto.randomUUID();
  const event = buildEvent({
    name: 'ai.output.produced',
    workspaceId: params.workspaceId,
    actor: params.actor,
    subjectId: usageId,
    payload: {
      capability: params.capability,
      model: params.model,
      cost_usd: params.costUsd,
      latency_ms: params.latencyMs,
    },
    correlationId: params.requestId,
  });
  const record: AiUsageRecord = {
    id: usageId,
    workspaceId: params.workspaceId,
    requestId: params.requestId,
    capability: params.capability,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd: params.costUsd,
    latencyMs: params.latencyMs,
    callerModule: params.callerModule,
    promptId: params.promptId,
    promptVersion: params.promptVersion,
    ...(params.promptLibraryId ? { promptLibraryId: params.promptLibraryId } : {}),
    status: 'ok',
    occurredAt: event.occurredAt,
  };
  try {
    await usageStore.logUsageWithEvent(record, journalRowFromEnvelope(event));
    await publishToBus(event);
  } catch (err) {
    console.error('[ai-router] usage logging failed (result preserved)', err);
  }
  return { usageId };
}

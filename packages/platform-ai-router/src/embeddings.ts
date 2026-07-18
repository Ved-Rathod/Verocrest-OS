import {
  type EmbeddingProvider,
  type EmbeddingProviderName,
} from '@verocrest/platform-integrations/llm';
import type { EventActor } from '@verocrest/platform-event-bus';
import { checkBudget } from './budget';
import { getCapabilityConfig } from './capabilities';
import type { UsageStore } from './ports';
import { actualCostUsd, estimateCostUsd, estimateTokens, getModelPricing } from './pricing';
import { RouterError, type Capability } from './types';
import { logAiUsageAndEmit } from './usage';

/**
 * The embed side of the Router (docs/09 §5.5): shares the generation pipeline's
 * cost gate + usage logging + ai.output.produced emission, minus generation.
 * Used for the fire-and-forget memory write embed and (Sprint 3.4) the retrieval
 * query embed. Provider selection mirrors §2.5: OpenAI when keyed, mock otherwise
 * (keyless local dev). Batch-friendly (docs/09 §5.3).
 */

export type EmbeddingRegistry = Partial<Record<EmbeddingProviderName, EmbeddingProvider>>;

export type EmbedThroughRouterDeps = {
  embedders: EmbeddingRegistry;
  usageStore: UsageStore;
  onBudgetWarning?: (info: { workspaceId: string; spend: number; budget: number }) => void;
};

export type EmbedThroughRouterResult = {
  vectors: number[][];
  provider: EmbeddingProviderName;
  model: string;
  costUsd: number;
  inputTokens: number;
};

function selectEmbedder(registry: EmbeddingRegistry): EmbeddingProvider {
  const embedder = registry.openai ?? registry.mock;
  if (!embedder) {
    throw new RouterError('AI_PROVIDER_UNAVAILABLE', 'no embedding provider available');
  }
  return embedder;
}

export async function embedThroughRouter(
  deps: EmbedThroughRouterDeps,
  params: {
    capability: Capability; // an embed-* capability
    workspaceId: string;
    actor: EventActor;
    requestId: string;
    texts: string[];
  },
): Promise<EmbedThroughRouterResult> {
  const config = getCapabilityConfig(params.capability);
  if (!config) {
    throw new RouterError(
      'AI_CAPABILITY_UNKNOWN',
      `capability not registered: ${params.capability}`,
    );
  }
  if (params.texts.length === 0) {
    return {
      vectors: [],
      provider: 'mock',
      model: config.models.mock ?? 'mock-embedding',
      costUsd: 0,
      inputTokens: 0,
    };
  }

  const embedder = selectEmbedder(deps.embedders);
  const pricing = getModelPricing(embedder.name, embedder.model);

  // Cost gate BEFORE dispatch (docs/09 §6.2), estimating from input size.
  const estimatedTokens = params.texts.reduce((sum, t) => sum + estimateTokens(t), 0);
  const estimated = pricing ? estimateCostUsd(pricing, estimatedTokens, 0) : 0;
  await checkBudget({
    usageStore: deps.usageStore,
    workspaceId: params.workspaceId,
    config,
    estimatedCostUsd: estimated,
    onWarning: deps.onBudgetWarning,
  });

  const startedAt = Date.now();
  const { vectors, inputTokens } = await embedder.embed(params.texts);
  const latencyMs = Date.now() - startedAt;
  const costUsd = pricing ? actualCostUsd(pricing, inputTokens, 0) : 0;

  await logAiUsageAndEmit(deps.usageStore, {
    workspaceId: params.workspaceId,
    actor: params.actor,
    requestId: params.requestId,
    capability: params.capability,
    callerModule: config.module,
    provider: embedder.name,
    model: embedder.model,
    inputTokens,
    outputTokens: 0,
    costUsd,
    latencyMs,
    promptId: `${params.capability}-embed`,
    promptVersion: 1,
  });

  return { vectors, provider: embedder.name, model: embedder.model, costUsd, inputTokens };
}

import type { LlmProviderName } from '@verocrest/platform-integrations/llm';

/**
 * Centralized model pricing (docs/09 §6.4) — the SINGLE place model ids and
 * per-million-token prices live (Sprint 3.3 decision #6). Reviewed monthly.
 * Model ids are the tier the frozen catalogue names (docs/09 §11 — "actual model
 * strings resolved from pricing.ts").
 */

export type ModelPricing = {
  provider: LlmProviderName;
  model: string;
  inputPricePerMillion: number; // USD
  outputPricePerMillion: number;
  cachedInputPricePerMillion?: number;
  contextWindow: number;
  effectiveDate: string;
};

export const MODEL_PRICING: readonly ModelPricing[] = [
  {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    cachedInputPricePerMillion: 0.3,
    contextWindow: 200_000,
    effectiveDate: '2026-07-16',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    inputPricePerMillion: 1,
    outputPricePerMillion: 5,
    contextWindow: 200_000,
    effectiveDate: '2026-07-16',
  },
  {
    provider: 'openai',
    model: 'gpt-4.1',
    inputPricePerMillion: 2,
    outputPricePerMillion: 8,
    contextWindow: 1_000_000,
    effectiveDate: '2026-07-16',
  },
  {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    inputPricePerMillion: 0.4,
    outputPricePerMillion: 1.6,
    contextWindow: 1_000_000,
    effectiveDate: '2026-07-16',
  },
  {
    provider: 'openai',
    model: 'text-embedding-3-small',
    inputPricePerMillion: 0.02,
    outputPricePerMillion: 0,
    contextWindow: 8_192,
    effectiveDate: '2026-07-16',
  },
  {
    // Deterministic offline provider — free by definition.
    provider: 'mock',
    model: 'mock-model',
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    contextWindow: 1_000_000,
    effectiveDate: '2026-07-16',
  },
] as const;

export function getModelPricing(provider: LlmProviderName, model: string): ModelPricing | null {
  return MODEL_PRICING.find((p) => p.provider === provider && p.model === model) ?? null;
}

/** Estimated cost pre-dispatch (docs/09 §6.3): input tokens + full output budget. */
export function estimateCostUsd(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokenBudget: number,
): number {
  return (
    (inputTokens * pricing.inputPricePerMillion +
      outputTokenBudget * pricing.outputPricePerMillion) /
    1_000_000
  );
}

/** Actual cost post-call from provider-reported usage. */
export function actualCostUsd(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number,
): number {
  return estimateCostUsd(pricing, inputTokens, outputTokens);
}

/**
 * Token estimator used ONLY for pre-dispatch cost estimation (~4 chars/token).
 * Provider-reported usage is authoritative for actual cost; provider-exact
 * tokenizers are a noted refinement, not required for the gate's purpose.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

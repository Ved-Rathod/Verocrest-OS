import {
  LlmProviderError,
  type LlmCallParams,
  type LlmCompletion,
  type LlmProvider,
  type LlmProviderName,
} from '@verocrest/platform-integrations/llm';
import { isCallAllowed, recordFailure, recordSuccess } from './circuit-breaker';
import { RouterError, type CapabilityConfig } from './types';

/**
 * Provider selection + retry + failover (docs/09 §2.5, §11.2; docs/11 §5).
 * The registry maps provider names to LlmProvider instances; which instances
 * exist is decided at wiring time (server.ts): Anthropic when its key is set,
 * mock always. When the capability's primary has no configured instance, the
 * Router transparently uses the mock provider — local dev needs no AI keys
 * (Sprint 3.3 decision #4).
 */

export type ProviderRegistry = Partial<Record<LlmProviderName, LlmProvider>>;

export type SelectedProvider = { provider: LlmProvider; model: string };

export function selectProviders(
  registry: ProviderRegistry,
  config: CapabilityConfig,
  modelOverride?: string,
): SelectedProvider[] {
  const chain: SelectedProvider[] = [];
  const primary = registry[config.primary];
  if (primary) {
    const model = modelOverride ?? config.models[config.primary];
    if (model) chain.push({ provider: primary, model });
  }
  if (config.fallback) {
    const fallback = registry[config.fallback];
    const model = config.models[config.fallback];
    if (fallback && model) chain.push({ provider: fallback, model });
  }
  if (chain.length === 0) {
    // No real provider configured → deterministic mock (keyless local dev).
    const mock = registry.mock;
    const model = config.models.mock;
    if (mock && model) chain.push({ provider: mock, model });
  }
  if (chain.length === 0) {
    throw new RouterError(
      'AI_PROVIDER_UNAVAILABLE',
      `no provider available for capability ${config.capability}`,
    );
  }
  return chain;
}

/** Retry budgets per failure class (docs/09 §11.2). Timeout: fail fast. */
function retryBudget(kind: LlmProviderError['kind']): { attempts: number; baseDelayMs: number } {
  switch (kind) {
    case 'server':
      return { attempts: 2, baseDelayMs: 500 };
    case 'rate_limit':
      return { attempts: 3, baseDelayMs: 1000 };
    default:
      return { attempts: 0, baseDelayMs: 0 };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute an awaited completion against one provider with its retry budget and
 * circuit-breaker accounting. Throws LlmProviderError when the provider is
 * exhausted so the caller can move down the failover chain.
 */
export async function completeWithRetry(
  selected: SelectedProvider,
  params: LlmCallParams,
): Promise<LlmCompletion> {
  const name = selected.provider.name;
  if (!isCallAllowed(name)) {
    throw new LlmProviderError('circuit open', 'server', name);
  }
  let lastError: LlmProviderError | null = null;
  let retriesLeft = Infinity;
  for (let attempt = 0; retriesLeft >= 0; attempt++) {
    try {
      const completion = await selected.provider.complete({ ...params, model: selected.model });
      recordSuccess(name);
      return completion;
    } catch (err) {
      const providerError =
        err instanceof LlmProviderError
          ? err
          : new LlmProviderError(err instanceof Error ? err.message : String(err), 'server', name);
      recordFailure(name);
      const budget = retryBudget(providerError.kind);
      if (attempt === 0) retriesLeft = budget.attempts;
      lastError = providerError;
      retriesLeft -= 1;
      if (
        retriesLeft < 0 ||
        providerError.kind === 'auth' ||
        providerError.kind === 'bad_request'
      ) {
        break;
      }
      await sleep(budget.baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError ?? new LlmProviderError('provider exhausted', 'server', name);
}

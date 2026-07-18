import {
  LlmProviderError,
  type LlmCompletion,
  type LlmMessage,
} from '@verocrest/platform-integrations/llm';
import type { EventActor } from '@verocrest/platform-event-bus';
import { checkBudget } from './budget';
import { getCapabilityConfig } from './capabilities';
import { embedThroughRouter, type EmbeddingRegistry } from './embeddings';
import { getCachedQueryEmbedding, setCachedQueryEmbedding } from './memory/cache';
import { queryHash } from './memory/hash';
import { assertScopesAllowed, getMemoryPolicy, type MemoryPolicy } from './memory/scopes';
import type { MemoryHit, MemoryStore } from './memory/types';
import { withMemory } from './memory/with-memory';
import type { UsageStore } from './ports';
import { actualCostUsd, estimateCostUsd, estimateTokens, getModelPricing } from './pricing';
import {
  completeWithRetry,
  selectProviders,
  type ProviderRegistry,
  type SelectedProvider,
} from './providers';
import {
  promptHash,
  resolvePrompt,
  substituteVariables,
  type PromptStore,
  type ResolvedPrompt,
} from './prompts/registry';
import {
  RouterError,
  type Capability,
  type CapabilityConfig,
  type MemoryScope,
  type RouterCall,
  type RouterMetadata,
  type RouterResult,
} from './types';
import { logAiUsageAndEmit } from './usage';

function actorFor(call: RouterCall<PromptVariables>): EventActor {
  return call.workspaceContext.actorUserId
    ? { type: 'user', id: call.workspaceContext.actorUserId }
    : { type: 'system', id: 'ai-router' };
}

/**
 * The Model Router 10-step pipeline (docs/09 §2.3). Sprint 3.4 activates step 4
 * (memory retrieval) via withMemory; step 10 (memory write) is delivered as the
 * out-of-band rememberMemory path (server.ts) driven by the memory-writer
 * subscriber — the generation pipeline auto-writes only once a writing capability
 * ships (Sprint 9+), so no untriggered write branch lives here.
 *
 *  1. capability config   → capabilities.ts
 *  2. prompt resolution   → prompts/registry.ts (workspace → global → code)
 *  3. cost gate           → budget.ts (live sum over ai_usage_events)
 *  4. memory retrieval    → withMemory (scope allow-list enforced; skipped when scopes empty)
 *  5. prompt assembly     → substituteVariables + retrieved-context injection
 *  6. provider selection  → providers.ts (+ mock when keyless)
 *  7. execution           → awaited or streaming, timeout-bounded
 *  8. structured parse    → Zod ladder (retry → fallback → typed error)
 *  9. usage + event       → atomic RPC, then post-commit publishToBus (usage.ts)
 * 10. memory write        → rememberMemory (server.ts) + memory.write.requested subscriber
 */

export type RouterDeps = {
  providers: ProviderRegistry;
  usageStore: UsageStore;
  promptStore: PromptStore | null;
  /** Memory retrieval store (null disables retrieval → cold-start, docs/09 §4.8). */
  memoryStore?: MemoryStore | null;
  /** Embedding providers for query embedding (mock when keyless). */
  embedders?: EmbeddingRegistry;
  /** Test-only override of the capability catalogue. */
  capabilities?: Partial<Record<Capability, CapabilityConfig>>;
  /** Test-only override of the per-capability memory scope policy. */
  memoryPolicy?: Partial<Record<Capability, MemoryPolicy>>;
  onBudgetWarning?: (info: { workspaceId: string; spend: number; budget: number }) => void;
};

/** Sprint 3.3 capabilities take template variables as input. */
export type PromptVariables = Record<string, string>;

type PreparedCall = {
  config: CapabilityConfig;
  prompt: ResolvedPrompt;
  messages: LlmMessage[];
  assembledHash: string;
  chain: SelectedProvider[];
  memoryHits: MemoryHit[];
  startedAt: number;
};

function resolveConfig(deps: RouterDeps, capability: Capability): CapabilityConfig {
  const config = deps.capabilities?.[capability] ?? getCapabilityConfig(capability);
  if (!config) {
    throw new RouterError('AI_CAPABILITY_UNKNOWN', `capability not registered: ${capability}`);
  }
  return config;
}

/**
 * Step 4 — memory retrieval (docs/09 §4). Runs only when the capability declares
 * scopes AND the caller requests them AND a store + embedders are wired.
 * Enforces the scope allow-list (leakage impossible by construction, §4.3),
 * embeds the query (cost-logged + cached, §4.7), and returns the ranked hits.
 * Retrieval failure degrades to [] (cold-start §4.8) — it never fails the call.
 */
async function retrieveMemory(
  deps: RouterDeps,
  call: RouterCall<PromptVariables>,
  queryText: string,
): Promise<MemoryHit[]> {
  const policy = deps.memoryPolicy?.[call.capability] ?? getMemoryPolicy(call.capability);
  if (policy.scopes.length === 0) return [];
  if (!call.memory || call.memory.scopes.length === 0) return [];
  if (!deps.memoryStore || !deps.embedders) return [];

  const requested = call.memory.scopes as MemoryScope[];
  assertScopesAllowed(call.capability, requested, policy.scopes); // honors the effective policy

  const workspaceId = call.workspaceContext.workspaceId;
  const hash = queryHash(queryText);
  let queryEmbedding = getCachedQueryEmbedding(workspaceId, call.capability, hash);
  if (!queryEmbedding) {
    const embedded = await embedThroughRouter(
      {
        embedders: deps.embedders,
        usageStore: deps.usageStore,
        onBudgetWarning: deps.onBudgetWarning,
      },
      {
        capability: 'embed-memory-generic',
        workspaceId,
        actor: actorFor(call),
        requestId: call.workspaceContext.requestId,
        texts: [queryText],
      },
    );
    queryEmbedding = embedded.vectors[0] ?? null;
    if (queryEmbedding) setCachedQueryEmbedding(workspaceId, call.capability, hash, queryEmbedding);
  }
  if (!queryEmbedding) return [];

  return withMemory(deps.memoryStore, {
    workspaceId,
    scopes: requested,
    queryEmbedding,
    ...(call.memory.subjectIds ? { subjectIds: call.memory.subjectIds } : {}),
    topK: call.memory.topK ?? policy.topK,
    minSimilarity: call.memory.minSimilarity ?? policy.minSimilarity,
    capability: call.capability,
  });
}

/** Pipeline steps 1–6 shared by awaited + streaming execution. */
async function prepare(deps: RouterDeps, call: RouterCall<PromptVariables>): Promise<PreparedCall> {
  const config = resolveConfig(deps, call.capability);

  // Step 2 — prompt resolution (3-tier, cached, pin-aware).
  const prompt = await resolvePrompt(
    deps.promptStore,
    call.workspaceContext.workspaceId,
    call.capability,
    call.promptVersionPin,
  );

  const userMessage = substituteVariables(prompt.template, call.input, prompt.variables);

  // Step 6 — provider chain (mock when keyless).
  const chain = selectProviders(deps.providers, config, call.modelOverride);
  const first = chain[0];
  if (!first) throw new RouterError('AI_PROVIDER_UNAVAILABLE', 'empty provider chain');

  // Step 3 — cost gate against the chain head's pricing (prices the base prompt).
  const pricing = getModelPricing(first.provider.name, first.model);
  const estimated = pricing
    ? estimateCostUsd(
        pricing,
        estimateTokens(`${prompt.systemMessage}\n${userMessage}`),
        config.maxOutputTokens,
      )
    : 0;
  await checkBudget({
    usageStore: deps.usageStore,
    workspaceId: call.workspaceContext.workspaceId,
    config,
    estimatedCostUsd: estimated,
    onWarning: deps.onBudgetWarning,
  });

  // Step 4 — memory retrieval; step 5 — assemble with retrieved context injected.
  const memoryHits = await retrieveMemory(deps, call, userMessage);
  const contextBlock =
    memoryHits.length > 0
      ? `\n\nRelevant workspace context (cite as [source-N] where used):\n${memoryHits
          .map((h, i) => `[source-${i + 1}] ${h.content}`)
          .join('\n')}`
      : '';
  const finalUserMessage = `${userMessage}${contextBlock}`;
  const messages: LlmMessage[] = [
    { role: 'system', content: prompt.systemMessage },
    { role: 'user', content: finalUserMessage },
  ];

  return {
    config,
    prompt,
    messages,
    assembledHash: promptHash(`${prompt.systemMessage}\n${finalUserMessage}`),
    chain,
    memoryHits,
    startedAt: Date.now(),
  };
}

function timeoutSignal(ms: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return external ? AbortSignal.any([external, timeout]) : timeout;
}

function isTimeout(err: unknown): boolean {
  return err instanceof LlmProviderError && err.kind === 'timeout';
}

/** Steps 7 (awaited) with failover down the chain (docs/09 §2.5). */
async function executeAwaited(
  prepared: PreparedCall,
  systemSuffix?: string,
): Promise<{ completion: LlmCompletion; used: SelectedProvider }> {
  const messages = systemSuffix
    ? prepared.messages.map((m) =>
        m.role === 'system' ? { ...m, content: `${m.content}\n\n${systemSuffix}` } : m,
      )
    : prepared.messages;
  let lastError: unknown = null;
  for (const selected of prepared.chain) {
    try {
      const completion = await completeWithRetry(selected, {
        model: selected.model,
        messages,
        maxOutputTokens: prepared.config.maxOutputTokens,
        ...(prepared.config.temperature !== undefined
          ? { temperature: prepared.config.temperature }
          : {}),
        abortSignal: timeoutSignal(prepared.config.timeoutMs),
      });
      return { completion, used: selected };
    } catch (err) {
      if (isTimeout(err)) {
        // Timeouts fail fast — no cross-provider failover (docs/09 §11.2).
        throw new RouterError('AI_TIMEOUT', `${prepared.config.capability} timed out`);
      }
      lastError = err; // 5xx/429 exhausted → try next provider (transparent failover)
    }
  }
  throw new RouterError(
    'AI_PROVIDER_UNAVAILABLE',
    lastError instanceof Error ? lastError.message : 'all providers exhausted',
  );
}

/** Step 8 — structured-output ladder (docs/09 §2.7). */
async function executeStructured(
  prepared: PreparedCall,
): Promise<{ output: unknown; completion: LlmCompletion; used: SelectedProvider }> {
  const schema = prepared.config.outputSchema;
  if (!schema) throw new Error('executeStructured requires an outputSchema');

  const tryParse = (text: string): { ok: true; value: unknown } | { ok: false } => {
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      const parsed: unknown = JSON.parse(stripped);
      const result = schema.safeParse(parsed);
      return result.success ? { ok: true, value: result.data } : { ok: false };
    } catch {
      return { ok: false };
    }
  };

  // Attempt 1: as-assembled. Attempt 2: same provider, stricter instruction.
  // Attempt 3: fallback provider with the strict instruction. Then typed error.
  const strict =
    'Reply with ONLY a JSON object strictly matching the required schema. No prose, no code fences.';
  const attempts: Array<{ chain: SelectedProvider[]; suffix?: string }> = [
    { chain: prepared.chain.slice(0, 1) },
    { chain: prepared.chain.slice(0, 1), suffix: strict },
    ...(prepared.chain.length > 1 ? [{ chain: prepared.chain.slice(1), suffix: strict }] : []),
  ];

  for (const attempt of attempts) {
    const scoped: PreparedCall = { ...prepared, chain: attempt.chain };
    const { completion, used } = await executeAwaited(scoped, attempt.suffix);
    const parsed = tryParse(completion.text);
    if (parsed.ok) return { output: parsed.value, completion, used };
  }
  throw new RouterError(
    'AI_STRUCTURED_OUTPUT_FAILED',
    `${prepared.config.capability}: no provider produced schema-conformant output`,
  );
}

/** Step 9 — atomic usage+journal write, then post-commit bus publish. Fail-soft:
 *  the model already answered; losing telemetry must not lose the user's result. */
async function logSuccess(
  deps: RouterDeps,
  call: RouterCall<PromptVariables>,
  prepared: PreparedCall,
  used: SelectedProvider,
  completion: LlmCompletion,
  latencyMs: number,
): Promise<RouterMetadata> {
  const pricing = getModelPricing(used.provider.name, used.model);
  const costUsd = pricing
    ? actualCostUsd(pricing, completion.usage.inputTokens, completion.usage.outputTokens)
    : 0;

  await logAiUsageAndEmit(deps.usageStore, {
    workspaceId: call.workspaceContext.workspaceId,
    actor: actorFor(call),
    requestId: call.workspaceContext.requestId,
    capability: call.capability,
    callerModule: prepared.config.module,
    provider: used.provider.name,
    model: used.model,
    inputTokens: completion.usage.inputTokens,
    outputTokens: completion.usage.outputTokens,
    costUsd,
    latencyMs,
    promptId: `${prepared.prompt.id}#${prepared.assembledHash}`,
    promptVersion: prepared.prompt.version,
    ...(prepared.prompt.promptLibraryId
      ? { promptLibraryId: prepared.prompt.promptLibraryId }
      : {}),
  });

  return {
    provider: used.provider.name,
    model: used.model,
    promptId: prepared.prompt.id,
    promptVersion: prepared.prompt.version,
    ...(prepared.prompt.promptLibraryId
      ? { promptLibraryId: prepared.prompt.promptLibraryId }
      : {}),
    memoryHits: prepared.memoryHits.map((h) => ({
      memoryId: h.id,
      scope: h.scope,
      similarity: h.similarity,
      excerpt: h.content.slice(0, 200),
    })),
    inputTokens: completion.usage.inputTokens,
    outputTokens: completion.usage.outputTokens,
    costUsd,
    latencyMs,
    requestId: call.workspaceContext.requestId,
  };
}

async function logFailure(
  deps: RouterDeps,
  call: RouterCall<PromptVariables>,
  prepared: PreparedCall | null,
  err: unknown,
  latencyMs: number,
): Promise<void> {
  try {
    await deps.usageStore.logUsageError({
      id: crypto.randomUUID(),
      workspaceId: call.workspaceContext.workspaceId,
      requestId: call.workspaceContext.requestId,
      capability: call.capability,
      provider: prepared?.chain[0]?.provider.name ?? 'none',
      model: prepared?.chain[0]?.model ?? 'none',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs,
      callerModule: prepared?.config.module ?? 'unknown',
      promptId: prepared ? `${prepared.prompt.id}#${prepared.assembledHash}` : 'unresolved',
      promptVersion: prepared?.prompt.version ?? 0,
      status: 'error',
      error: {
        code: err instanceof RouterError ? err.code : 'UNKNOWN',
        message: err instanceof Error ? err.message : String(err),
      },
      occurredAt: new Date().toISOString(),
    });
  } catch (logErr) {
    console.error('[ai-router] failure logging failed', logErr);
  }
}

export function createRouter(deps: RouterDeps) {
  /** Awaited entry point (docs/09 §2.2 callCapability). */
  async function callCapability<TOutput = string>(
    call: RouterCall<PromptVariables>,
  ): Promise<RouterResult<TOutput>> {
    let prepared: PreparedCall | null = null;
    const startedAt = Date.now();
    try {
      prepared = await prepare(deps, call);
      const executed = prepared.config.outputSchema
        ? await executeStructured(prepared)
        : await (async () => {
            const { completion, used } = await executeAwaited(prepared!);
            return { output: completion.text as unknown, completion, used };
          })();
      const latencyMs = Date.now() - startedAt;
      const metadata = await logSuccess(
        deps,
        call,
        prepared,
        executed.used,
        executed.completion,
        latencyMs,
      );
      return { output: executed.output as TOutput, metadata };
    } catch (err) {
      // Budget refusals happen pre-dispatch and are not usage (docs/09 §6.2).
      if (!(err instanceof RouterError && err.code === 'AI_BUDGET_EXCEEDED')) {
        await logFailure(deps, call, prepared, err, Date.now() - startedAt);
      }
      throw err;
    }
  }

  /**
   * Streaming entry point (docs/09 §2.6): yields text deltas, returns the full
   * RouterResult once complete. Structured capabilities execute awaited and
   * yield the final text once (streamed structured output arrives with its
   * first consumer capability).
   */
  async function* callCapabilityStream(
    call: RouterCall<PromptVariables>,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<string, RouterResult<string>, void> {
    let prepared: PreparedCall | null = null;
    const startedAt = Date.now();
    try {
      prepared = await prepare(deps, call);
      if (prepared.config.outputSchema) {
        const { completion, used } = await executeStructured(prepared).then((r) => ({
          completion: r.completion,
          used: r.used,
        }));
        yield completion.text;
        const metadata = await logSuccess(
          deps,
          call,
          prepared,
          used,
          completion,
          Date.now() - startedAt,
        );
        return { output: completion.text, metadata };
      }

      const first = prepared.chain[0];
      if (!first) throw new RouterError('AI_PROVIDER_UNAVAILABLE', 'empty provider chain');
      const stream = first.provider.stream({
        model: first.model,
        messages: prepared.messages,
        maxOutputTokens: prepared.config.maxOutputTokens,
        ...(prepared.config.temperature !== undefined
          ? { temperature: prepared.config.temperature }
          : {}),
        abortSignal: timeoutSignal(prepared.config.timeoutMs, abortSignal),
      });
      let completion: LlmCompletion;
      try {
        let next = await stream.next();
        while (!next.done) {
          yield next.value;
          next = await stream.next();
        }
        completion = next.value;
      } catch (err) {
        if (isTimeout(err))
          throw new RouterError('AI_TIMEOUT', `${call.capability} stream timed out`);
        throw new RouterError(
          'AI_PROVIDER_UNAVAILABLE',
          err instanceof Error ? err.message : 'stream failed',
        );
      }
      const metadata = await logSuccess(
        deps,
        call,
        prepared,
        first,
        completion,
        Date.now() - startedAt,
      );
      return { output: completion.text, metadata };
    } catch (err) {
      if (!(err instanceof RouterError && err.code === 'AI_BUDGET_EXCEEDED')) {
        await logFailure(deps, call, prepared, err, Date.now() - startedAt);
      }
      throw err;
    }
  }

  return { callCapability, callCapabilityStream };
}

export type Router = ReturnType<typeof createRouter>;

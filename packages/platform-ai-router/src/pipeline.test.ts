import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  resetEventPublisherForTests,
  setEventPublisher,
  type EventEnvelope,
} from '@verocrest/platform-event-bus';
import {
  LlmProviderError,
  createMockProvider,
  type LlmCallParams,
  type LlmCompletion,
  type LlmProvider,
  type LlmProviderName,
} from '@verocrest/platform-integrations/llm';
import { resetBudgetWarningsForTests } from './budget';
import { getCapabilityConfig } from './capabilities';
import { resetCircuitBreakersForTests } from './circuit-breaker';
import { createRouter, type RouterDeps } from './pipeline';
import type { AiUsageRecord } from './ports';
import { clearPromptCacheForTests } from './prompts/registry';
import type { CapabilityConfig, RouterCall } from './types';

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

class FakeUsageStore {
  spend = 0;
  budget = 200;
  logged: { record: AiUsageRecord; journalRow: Record<string, unknown> }[] = [];
  errors: AiUsageRecord[] = [];
  getMonthlySpendUsd = () => Promise.resolve(this.spend);
  getMonthlyBudgetUsd = () => Promise.resolve(this.budget);
  logUsageWithEvent = (record: AiUsageRecord, journalRow: Record<string, unknown>) => {
    this.logged.push({ record, journalRow });
    return Promise.resolve();
  };
  logUsageError = (record: AiUsageRecord) => {
    this.errors.push(record);
    return Promise.resolve();
  };
}

function makeCall(): RouterCall<Record<string, string>> {
  return {
    capability: 'summarize-thread',
    input: {
      channel: 'email',
      participants: 'Ana and Bob',
      thread: 'Bob: Can you audit our site?\nAna: Yes, proposal Friday.',
    },
    workspaceContext: { workspaceId: WS, actorUserId: USER, agentId: null, requestId: 'req-1' },
  };
}

function makeDeps(over: Partial<RouterDeps> = {}) {
  const usageStore = new FakeUsageStore();
  const deps: RouterDeps = {
    providers: { mock: createMockProvider() },
    usageStore,
    promptStore: null,
    ...over,
  };
  return { deps, usageStore: (over.usageStore as FakeUsageStore | undefined) ?? usageStore };
}

function capturePublished(): EventEnvelope[] {
  const published: EventEnvelope[] = [];
  setEventPublisher({
    publish: (e) => {
      published.push(e);
      return Promise.resolve();
    },
  });
  return published;
}

function textProvider(
  name: LlmProviderName,
  texts: string[],
  usage = { inputTokens: 10, outputTokens: 5 },
): LlmProvider & { calls: number } {
  const provider = {
    name,
    calls: 0,
    complete(params: LlmCallParams): Promise<LlmCompletion> {
      void params;
      const text = texts[Math.min(provider.calls, texts.length - 1)] ?? '';
      provider.calls += 1;
      return Promise.resolve({ text, usage, stopReason: 'end' as const });
    },
    // eslint-disable-next-line require-yield
    async *stream(params: LlmCallParams): AsyncGenerator<string, LlmCompletion, void> {
      return provider.complete(params);
    },
  };
  return provider;
}

afterEach(() => {
  resetEventPublisherForTests();
  resetCircuitBreakersForTests();
  resetBudgetWarningsForTests();
  clearPromptCacheForTests();
});

describe('callCapability — mock provider end-to-end', () => {
  it('returns output + metadata, logs usage atomically, publishes ai.output.produced', async () => {
    const published = capturePublished();
    const { deps, usageStore } = makeDeps();
    const router = createRouter(deps);

    const result = await router.callCapability(makeCall());

    expect(result.output).toContain('[mock:mock-model]');
    expect(result.metadata.provider).toBe('mock');
    expect(result.metadata.costUsd).toBe(0);
    expect(result.metadata.memoryHits).toEqual([]); // Sprint 3.4 hook inert
    expect(result.metadata.promptId).toBe('summarize-thread-baseline');
    expect(result.metadata.requestId).toBe('req-1');

    expect(usageStore.logged).toHaveLength(1);
    const { record, journalRow } = usageStore.logged[0]!;
    expect(record.status).toBe('ok');
    expect(record.capability).toBe('summarize-thread');
    expect(record.callerModule).toBe('personalization');
    expect(journalRow['name']).toBe('ai.output.produced');
    expect(journalRow['subject_type']).toBe('ai_call');
    expect(journalRow['subject_id']).toBe(record.id); // event points at the usage row

    expect(published).toHaveLength(1);
    expect(published[0]!.name).toBe('ai.output.produced');
    expect(published[0]!.payload).toMatchObject({
      capability: 'summarize-thread',
      model: 'mock-model',
    });
  });

  it('tracks real cost from provider-reported usage via pricing.ts', async () => {
    capturePublished();
    const anthropic = textProvider('anthropic', ['summary'], {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    const { deps, usageStore } = makeDeps({ providers: { anthropic, mock: createMockProvider() } });
    const router = createRouter(deps);

    const result = await router.callCapability(makeCall());
    expect(result.metadata.provider).toBe('anthropic');
    expect(result.metadata.model).toBe('claude-sonnet-5');
    expect(result.metadata.costUsd).toBeCloseTo(18); // $3/M in + $15/M out
    expect(usageStore.logged[0]!.record.costUsd).toBeCloseTo(18);
  });

  it('refuses pre-dispatch on exhausted budget without calling any provider', async () => {
    const published = capturePublished();
    const usageStore = new FakeUsageStore();
    usageStore.spend = 200;
    const mock = textProvider('mock', ['should never run']);
    const { deps } = makeDeps({ providers: { mock }, usageStore });
    const router = createRouter(deps);

    await expect(router.callCapability(makeCall())).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
    });
    expect(mock.calls).toBe(0);
    expect(usageStore.logged).toHaveLength(0);
    expect(usageStore.errors).toHaveLength(0); // refusals are not usage
    expect(published).toHaveLength(0);
  });

  it('fails over transparently to the fallback provider (docs/09 §2.5)', async () => {
    capturePublished();
    const failing: LlmProvider = {
      name: 'anthropic',
      complete: () =>
        Promise.reject(new LlmProviderError('anthropic down', 'bad_request', 'anthropic')),
      // eslint-disable-next-line require-yield
      async *stream(): AsyncGenerator<string, LlmCompletion, void> {
        throw new LlmProviderError('anthropic down', 'bad_request', 'anthropic');
      },
    };
    const fallback = textProvider('openai', ['fallback summary']);
    const config: CapabilityConfig = {
      ...getCapabilityConfig('summarize-thread')!,
      fallback: 'openai',
      models: { anthropic: 'claude-sonnet-5', openai: 'gpt-4.1', mock: 'mock-model' },
    };
    const { deps } = makeDeps({
      providers: { anthropic: failing, openai: fallback },
      capabilities: { 'summarize-thread': config },
    });
    const router = createRouter(deps);

    const result = await router.callCapability(makeCall());
    expect(result.output).toBe('fallback summary');
    expect(result.metadata.provider).toBe('openai'); // actually-used provider surfaces
  });

  it('logs a status=error usage row when every provider is exhausted', async () => {
    capturePublished();
    const failing: LlmProvider = {
      name: 'anthropic',
      complete: () => Promise.reject(new LlmProviderError('down', 'bad_request', 'anthropic')),
      // eslint-disable-next-line require-yield
      async *stream(): AsyncGenerator<string, LlmCompletion, void> {
        throw new LlmProviderError('down', 'bad_request', 'anthropic');
      },
    };
    const { deps, usageStore } = makeDeps({ providers: { anthropic: failing } });
    const router = createRouter(deps);

    await expect(router.callCapability(makeCall())).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
    });
    expect(usageStore.errors).toHaveLength(1);
    expect(usageStore.errors[0]!.status).toBe('error');
    expect(usageStore.logged).toHaveLength(0);
  });

  it('times out fast with AI_TIMEOUT (no cross-provider failover)', async () => {
    capturePublished();
    const hanging: LlmProvider = {
      name: 'anthropic',
      complete: (params) =>
        new Promise((_resolve, reject) => {
          params.abortSignal?.addEventListener('abort', () =>
            reject(new LlmProviderError('aborted', 'timeout', 'anthropic')),
          );
        }),
      // eslint-disable-next-line require-yield
      async *stream(): AsyncGenerator<string, LlmCompletion, void> {
        throw new LlmProviderError('aborted', 'timeout', 'anthropic');
      },
    };
    const config: CapabilityConfig = {
      ...getCapabilityConfig('summarize-thread')!,
      timeoutMs: 25,
    };
    const { deps } = makeDeps({
      providers: { anthropic: hanging, mock: createMockProvider() },
      capabilities: { 'summarize-thread': config },
    });
    const router = createRouter(deps);

    await expect(router.callCapability(makeCall())).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  });
});

describe('structured output ladder (docs/09 §2.7)', () => {
  const schema = z.object({ score: z.number(), reason: z.string() });
  const good = JSON.stringify({ score: 82, reason: 'strong fit' });

  function structuredConfig(fallback: 'openai' | null): CapabilityConfig {
    return {
      ...getCapabilityConfig('summarize-thread')!,
      fallback,
      models: { anthropic: 'claude-sonnet-5', openai: 'gpt-4.1', mock: 'mock-model' },
      outputSchema: schema,
    };
  }

  it('retries once with a stricter instruction, then parses', async () => {
    capturePublished();
    const anthropic = textProvider('anthropic', ['not json at all', `\`\`\`json\n${good}\n\`\`\``]);
    const { deps } = makeDeps({
      providers: { anthropic },
      capabilities: { 'summarize-thread': structuredConfig(null) },
    });
    const router = createRouter(deps);

    const result = await router.callCapability<z.infer<typeof schema>>(makeCall());
    expect(result.output).toEqual({ score: 82, reason: 'strong fit' });
    expect(anthropic.calls).toBe(2);
  });

  it('falls back to the second provider for the third attempt', async () => {
    capturePublished();
    const anthropic = textProvider('anthropic', ['junk', 'still junk']);
    const openai = textProvider('openai', [good]);
    const { deps } = makeDeps({
      providers: { anthropic, openai },
      capabilities: { 'summarize-thread': structuredConfig('openai') },
    });
    const router = createRouter(deps);

    const result = await router.callCapability<z.infer<typeof schema>>(makeCall());
    expect(result.output).toEqual({ score: 82, reason: 'strong fit' });
    expect(anthropic.calls).toBe(2);
    expect(openai.calls).toBe(1);
    expect((await Promise.resolve(result)).metadata.provider).toBe('openai');
  });

  it('surfaces AI_STRUCTURED_OUTPUT_FAILED after the full ladder', async () => {
    capturePublished();
    const anthropic = textProvider('anthropic', ['junk']);
    const { deps, usageStore } = makeDeps({
      providers: { anthropic },
      capabilities: { 'summarize-thread': structuredConfig(null) },
    });
    const router = createRouter(deps);

    await expect(router.callCapability(makeCall())).rejects.toMatchObject({
      code: 'AI_STRUCTURED_OUTPUT_FAILED',
    });
    expect(usageStore.errors).toHaveLength(1);
  });
});

describe('callCapabilityStream — mock provider', () => {
  it('yields tokens then returns the full result and publishes the event', async () => {
    const published = capturePublished();
    const { deps, usageStore } = makeDeps();
    const router = createRouter(deps);

    const tokens: string[] = [];
    const generator = router.callCapabilityStream(makeCall());
    let next = await generator.next();
    while (!next.done) {
      tokens.push(next.value);
      next = await generator.next();
    }
    const result = next.value;

    expect(tokens.length).toBeGreaterThan(1); // genuinely chunked
    expect(tokens.join('')).toBe(result.output);
    expect(result.metadata.provider).toBe('mock');
    expect(usageStore.logged).toHaveLength(1);
    expect(published).toHaveLength(1);
    expect(published[0]!.name).toBe('ai.output.produced');
  });
});

describe('capability guard', () => {
  it('rejects unregistered capabilities with a typed error', async () => {
    capturePublished();
    const { deps } = makeDeps();
    const router = createRouter(deps);
    await expect(
      router.callCapability({ ...makeCall(), capability: 'score-lead' }),
    ).rejects.toMatchObject({ code: 'AI_CAPABILITY_UNKNOWN' });
  });
});

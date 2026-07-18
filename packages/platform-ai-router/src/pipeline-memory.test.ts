import { afterEach, describe, expect, it } from 'vitest';
import { resetEventPublisherForTests, setEventPublisher } from '@verocrest/platform-event-bus';
import {
  createMockEmbeddingProvider,
  createMockProvider,
} from '@verocrest/platform-integrations/llm';
import { resetBudgetWarningsForTests } from './budget';
import { getCapabilityConfig } from './capabilities';
import { resetCircuitBreakersForTests } from './circuit-breaker';
import { resetQueryEmbeddingCacheForTests } from './memory/cache';
import type { MemoryHit, MemoryStore } from './memory/types';
import { createRouter, type RouterDeps } from './pipeline';
import type { AiUsageRecord } from './ports';
import { clearPromptCacheForTests } from './prompts/registry';
import type { RouterCall } from './types';

const WS = '11111111-1111-4111-8111-111111111111';

class FakeUsageStore {
  logged: AiUsageRecord[] = [];
  getMonthlySpendUsd = () => Promise.resolve(0);
  getMonthlyBudgetUsd = () => Promise.resolve(200);
  logUsageWithEvent = (r: AiUsageRecord) => {
    this.logged.push(r);
    return Promise.resolve();
  };
  logUsageError = (r: AiUsageRecord) => {
    this.logged.push(r);
    return Promise.resolve();
  };
}

function memoryStore(hits: MemoryHit[]): MemoryStore {
  return {
    match: () => Promise.resolve(hits),
    annotationsFor: () => Promise.resolve([]),
    findMemoryIdByHash: () => Promise.resolve(null),
    insert: () => Promise.resolve('mem-id'),
    deleteStaleChunks: () => Promise.resolve(0),
  };
}

// summarize-thread retrieves nothing by policy; a test-only policy override turns
// it into a retriever so the pipeline's step-4 integration is exercised.
function retrievingDeps(store: MemoryStore, over: Partial<RouterDeps> = {}): RouterDeps {
  return {
    providers: { mock: createMockProvider() },
    embedders: { mock: createMockEmbeddingProvider() },
    usageStore: new FakeUsageStore(),
    promptStore: null,
    memoryStore: store,
    memoryPolicy: {
      'summarize-thread': { scopes: ['contact', 'company'], topK: 2, minSimilarity: 0.5 },
    },
    ...over,
  };
}

function call(
  memory?: RouterCall<Record<string, string>>['memory'],
): RouterCall<Record<string, string>> {
  return {
    capability: 'summarize-thread',
    input: { channel: 'email', participants: 'A and B', thread: 'hello there' },
    workspaceContext: { workspaceId: WS, actorUserId: 'u1', agentId: null, requestId: 'req-1' },
    ...(memory ? { memory } : {}),
  };
}

const hit = (id: string, similarity: number): MemoryHit => ({
  id,
  scope: 'contact',
  subjectId: 'c1',
  content: `remembered ${id}`,
  metadata: {},
  similarity,
  agentId: null,
});

afterEach(() => {
  resetEventPublisherForTests();
  resetCircuitBreakersForTests();
  resetBudgetWarningsForTests();
  clearPromptCacheForTests();
  resetQueryEmbeddingCacheForTests();
});

describe('pipeline step 4 — memory retrieval integration', () => {
  it('retrieves within allowed scopes and surfaces hits in metadata', async () => {
    setEventPublisher({ publish: () => Promise.resolve() });
    const router = createRouter(retrievingDeps(memoryStore([hit('a', 0.9), hit('b', 0.8)])));
    const result = await router.callCapability(
      call({ scopes: ['contact'], subjectIds: ['c1'], topK: 2 }),
    );
    expect(result.metadata.memoryHits).toHaveLength(2);
    expect(result.metadata.memoryHits[0]!.memoryId).toBe('a');
    expect(result.metadata.memoryHits[0]!.excerpt).toContain('remembered a');
  });

  it('does not retrieve when the caller requests no memory', async () => {
    setEventPublisher({ publish: () => Promise.resolve() });
    const router = createRouter(retrievingDeps(memoryStore([hit('a', 0.9)])));
    const result = await router.callCapability(call());
    expect(result.metadata.memoryHits).toEqual([]);
  });

  it('refuses a scope outside the capability allow-list (leakage impossible)', async () => {
    setEventPublisher({ publish: () => Promise.resolve() });
    // Policy allows contact+company; request 'lead' → violation.
    const router = createRouter(retrievingDeps(memoryStore([])));
    await expect(router.callCapability(call({ scopes: ['lead'], topK: 2 }))).rejects.toThrow(
      /may not retrieve memory scope 'lead'/,
    );
  });

  it('cold-start: an empty store yields no hits but the call still succeeds', async () => {
    setEventPublisher({ publish: () => Promise.resolve() });
    const router = createRouter(retrievingDeps(memoryStore([])));
    const result = await router.callCapability(call({ scopes: ['contact'], topK: 4 }));
    expect(result.metadata.memoryHits).toEqual([]);
    expect(result.output).toContain('[mock:mock-model]');
  });

  it('capability with empty policy never retrieves even if memory requested', async () => {
    setEventPublisher({ publish: () => Promise.resolve() });
    // No policy override → summarize-thread's real policy (scopes: []).
    const deps: RouterDeps = {
      providers: { mock: createMockProvider() },
      embedders: { mock: createMockEmbeddingProvider() },
      usageStore: new FakeUsageStore(),
      promptStore: null,
      memoryStore: memoryStore([hit('a', 0.9)]),
      capabilities: { 'summarize-thread': getCapabilityConfig('summarize-thread')! },
    };
    const router = createRouter(deps);
    const result = await router.callCapability(call({ scopes: [], topK: 2 }));
    expect(result.metadata.memoryHits).toEqual([]);
  });
});

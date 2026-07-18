import { afterEach, describe, expect, it } from 'vitest';
import {
  resetEventPublisherForTests,
  setEventPublisher,
  type EventEnvelope,
} from '@verocrest/platform-event-bus';
import { createMockEmbeddingProvider } from '@verocrest/platform-integrations/llm';
import { embedThroughRouter } from './embeddings';
import type { AiUsageRecord, UsageStore } from './ports';
import { resetBudgetWarningsForTests } from './budget';

const WS = '11111111-1111-4111-8111-111111111111';

class FakeUsageStore implements UsageStore {
  spend = 0;
  budget = 200;
  logged: AiUsageRecord[] = [];
  getMonthlySpendUsd = () => Promise.resolve(this.spend);
  getMonthlyBudgetUsd = () => Promise.resolve(this.budget);
  logUsageWithEvent = (r: AiUsageRecord) => {
    this.logged.push(r);
    return Promise.resolve();
  };
  logUsageError = (r: AiUsageRecord) => {
    this.logged.push(r);
    return Promise.resolve();
  };
}

function capture(): EventEnvelope[] {
  const published: EventEnvelope[] = [];
  setEventPublisher({
    publish: (e) => {
      published.push(e);
      return Promise.resolve();
    },
  });
  return published;
}

const actor = { type: 'system' as const, id: 'test' };

afterEach(() => {
  resetEventPublisherForTests();
  resetBudgetWarningsForTests();
});

describe('embedThroughRouter (docs/09 §5.5)', () => {
  it('embeds a batch, logs usage as embed-memory-generic, emits ai.output.produced', async () => {
    const published = capture();
    const usageStore = new FakeUsageStore();
    const result = await embedThroughRouter(
      { embedders: { mock: createMockEmbeddingProvider() }, usageStore },
      {
        capability: 'embed-memory-generic',
        workspaceId: WS,
        actor,
        requestId: 'r1',
        texts: ['a', 'b'],
      },
    );
    expect(result.vectors).toHaveLength(2);
    expect(result.vectors[0]).toHaveLength(1536);
    expect(result.provider).toBe('mock');
    expect(result.costUsd).toBe(0); // mock model priced at $0

    expect(usageStore.logged).toHaveLength(1);
    expect(usageStore.logged[0]!.capability).toBe('embed-memory-generic');
    expect(usageStore.logged[0]!.callerModule).toBe('memory');
    expect(usageStore.logged[0]!.outputTokens).toBe(0);

    expect(published).toHaveLength(1);
    expect(published[0]!.name).toBe('ai.output.produced');
  });

  it('short-circuits on empty input (no cost, no event)', async () => {
    const published = capture();
    const usageStore = new FakeUsageStore();
    const result = await embedThroughRouter(
      { embedders: { mock: createMockEmbeddingProvider() }, usageStore },
      { capability: 'embed-memory-generic', workspaceId: WS, actor, requestId: 'r1', texts: [] },
    );
    expect(result.vectors).toEqual([]);
    expect(usageStore.logged).toHaveLength(0);
    expect(published).toHaveLength(0);
  });

  it('refuses on exhausted budget before embedding', async () => {
    capture();
    const usageStore = new FakeUsageStore();
    usageStore.spend = 200;
    await expect(
      embedThroughRouter(
        { embedders: { mock: createMockEmbeddingProvider() }, usageStore },
        {
          capability: 'embed-memory-generic',
          workspaceId: WS,
          actor,
          requestId: 'r1',
          texts: ['x'],
        },
      ),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    expect(usageStore.logged).toHaveLength(0);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { getBaselinePrompt } from './baselines';
import {
  clearPromptCacheForTests,
  promptHash,
  resolvePrompt,
  substituteVariables,
  type PromptStore,
  type ResolvedPrompt,
} from './registry';

const WS = '11111111-1111-4111-8111-111111111111';

const FIXTURE_VARS = {
  channel: 'email',
  participants: 'Ana (agency) and Bob (prospect)',
  thread: 'Bob: Can you audit our site?\nAna: Yes — sending a proposal Friday.',
};

function dbPrompt(over: Partial<ResolvedPrompt>): ResolvedPrompt {
  return {
    id: 'summarize-thread-v2',
    version: 2,
    systemMessage: 'db system',
    template: 'db template {{thread}}',
    variables: ['thread'],
    promptLibraryId: '99999999-9999-4999-8999-999999999999',
    source: 'global',
    ...over,
  };
}

afterEach(() => clearPromptCacheForTests());

describe('prompt regression — summarize-thread baseline', () => {
  it('assembled prompt is stable (fixture snapshot)', () => {
    const baseline = getBaselinePrompt('summarize-thread')!;
    const user = substituteVariables(baseline.template, FIXTURE_VARS, baseline.variables);
    const assembled = `${baseline.systemMessage}\n${user}`;
    expect(assembled).toMatchSnapshot();
  });

  it('assembled prompt hash is deterministic and version-locked', () => {
    const baseline = getBaselinePrompt('summarize-thread')!;
    const user = substituteVariables(baseline.template, FIXTURE_VARS, baseline.variables);
    const h1 = promptHash(`${baseline.systemMessage}\n${user}`);
    const h2 = promptHash(`${baseline.systemMessage}\n${user}`);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
    expect(baseline.version).toBe(1);
  });

  it('substitution fills every declared variable and leaves no placeholders', () => {
    const baseline = getBaselinePrompt('summarize-thread')!;
    const user = substituteVariables(baseline.template, FIXTURE_VARS, baseline.variables);
    expect(user).toContain(FIXTURE_VARS.thread);
    expect(user).not.toMatch(/\{\{\w+\}\}/);
  });

  it('rejects a call missing a declared variable', () => {
    const baseline = getBaselinePrompt('summarize-thread')!;
    expect(() =>
      substituteVariables(baseline.template, { channel: 'email' }, baseline.variables),
    ).toThrow(/missing prompt variable/);
  });
});

describe('resolution chain (docs/09 §3.4: workspace → global → code)', () => {
  it('prefers the workspace tier', async () => {
    const store: PromptStore = {
      getActivePrompt: (workspaceId) =>
        Promise.resolve(
          workspaceId === WS ? dbPrompt({ source: 'workspace' }) : dbPrompt({ source: 'global' }),
        ),
    };
    const resolved = await resolvePrompt(store, WS, 'summarize-thread');
    expect(resolved.source).toBe('workspace');
  });

  it('falls back to the global tier when the workspace has no override', async () => {
    const store: PromptStore = {
      getActivePrompt: (workspaceId) =>
        Promise.resolve(workspaceId === null ? dbPrompt({ source: 'global' }) : null),
    };
    const resolved = await resolvePrompt(store, WS, 'summarize-thread');
    expect(resolved.source).toBe('global');
    expect(resolved.promptLibraryId).toBeDefined();
  });

  it('falls back to the code baseline when no DB rows exist', async () => {
    const store: PromptStore = { getActivePrompt: () => Promise.resolve(null) };
    const resolved = await resolvePrompt(store, WS, 'summarize-thread');
    expect(resolved.source).toBe('code');
    expect(resolved.id).toBe('summarize-thread-baseline');
  });

  it('fails soft to the code baseline on a store error', async () => {
    const store: PromptStore = { getActivePrompt: () => Promise.reject(new Error('db down')) };
    const resolved = await resolvePrompt(store, WS, 'summarize-thread');
    expect(resolved.source).toBe('code');
  });

  it('caches resolution per (workspace, capability, pin) for 60s', async () => {
    let calls = 0;
    const store: PromptStore = {
      getActivePrompt: () => {
        calls += 1;
        return Promise.resolve(dbPrompt({}));
      },
    };
    await resolvePrompt(store, WS, 'summarize-thread');
    await resolvePrompt(store, WS, 'summarize-thread');
    expect(calls).toBe(1); // second hit served from cache
    await resolvePrompt(store, WS, 'summarize-thread', 2);
    expect(calls).toBe(2); // a version pin is a distinct cache key
  });
});

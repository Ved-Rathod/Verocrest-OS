import type { LlmCallParams, LlmCompletion, LlmProvider } from './types';

/**
 * Deterministic mock provider (docs/09 testing checklist — "mock-mode
 * verification for offline dev"). The Router selects it automatically when no
 * real provider key is configured, so local development needs NO AI API keys
 * (Sprint 3.3 decision #4). Zero cost; pricing.ts prices the mock model at $0.
 */

/** ~4 chars/token heuristic — good enough for deterministic mock usage numbers. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function mockResponseFor(params: LlmCallParams): string {
  const lastUser = [...params.messages].reverse().find((m) => m.role === 'user');
  const source = lastUser?.content ?? '';
  const firstLine =
    source
      .split('\n')
      .find((l) => l.trim() !== '')
      ?.trim() ?? '(empty input)';
  return [
    `[mock:${params.model}] Deterministic response.`,
    `Input began: "${firstLine.slice(0, 120)}"`,
    `Input size: ~${estimateTokens(source)} tokens across ${params.messages.length} message(s).`,
  ].join(' ');
}

function usageFor(params: LlmCallParams, text: string) {
  return {
    inputTokens: estimateTokens(params.messages.map((m) => m.content).join('\n')),
    outputTokens: estimateTokens(text),
  };
}

export function createMockProvider(): LlmProvider {
  return {
    name: 'mock',

    async complete(params: LlmCallParams): Promise<LlmCompletion> {
      const text = mockResponseFor(params);
      return { text, usage: usageFor(params, text), stopReason: 'end' };
    },

    async *stream(params: LlmCallParams): AsyncGenerator<string, LlmCompletion, void> {
      const text = mockResponseFor(params);
      // Stream word-by-word so SSE frame handling is genuinely exercised.
      for (const word of text.split(/(?<= )/)) {
        if (params.abortSignal?.aborted) {
          return { text, usage: usageFor(params, text), stopReason: 'aborted' };
        }
        yield word;
      }
      return { text, usage: usageFor(params, text), stopReason: 'end' };
    },
  };
}

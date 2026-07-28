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

/**
 * Deterministic structured outputs per capability (D4) so structured capabilities
 * run keyless. A router test asserts these conform to the capability's schema.
 */
const MOCK_STRUCTURED: Record<string, unknown> = {
  'generate-personalization': {
    opening_line: 'Noticed your team is scaling client acquisition — quick thought.',
    compliment: 'Your positioning around measurable ROI stands out in a noisy space.',
    website_observation:
      'Your homepage has a clear offer but no visible booking CTA above the fold.',
    pain_hypothesis: 'You may be losing warm visitors who have no fast path to book a call.',
    value_proposition:
      'We add a friction-free booking path so more of your existing traffic converts.',
    cta_suggestion: 'Open to a 15-minute walkthrough next week?',
    confidence: 72,
  },
  // Sprint 5.0 — recommend-offer (Outreach Queue). Mirrors MOCK_RECOMMEND_OFFER in
  // the router's schemas/recommend-offer.ts (a router test asserts conformance).
  'recommend-offer': {
    offer_ref: 1,
    rationale:
      'This offer targets the same industry as the lead and directly addresses the conversion gap surfaced by the website analysis.',
    confidence: 64,
  },
  // Sprint 4.9 — score-lead explainability (numbers come from the deterministic
  // engine; this is the narrative layer). Mirrors MOCK_SCORE_LEAD in the router's
  // schemas/scoring.ts (a router test asserts schema conformance).
  'score-lead': {
    summary:
      'Strong ICP alignment on industry and geography; website intelligence shows conversion gaps that this offer directly addresses.',
    signals: [
      {
        label: 'ICP match',
        detail: 'Company industry and target geography match the active ICP.',
        direction: 'positive',
      },
      {
        label: 'Website intelligence',
        detail: 'Audit flagged a missing booking CTA — a fixable conversion gap.',
        direction: 'positive',
      },
      {
        label: 'Readiness',
        detail: 'Relationship signals are not yet available for this lead.',
        direction: 'neutral',
      },
    ],
    confidence: 68,
  },
};

function mockResponseFor(params: LlmCallParams): string {
  if (params.capability && MOCK_STRUCTURED[params.capability]) {
    return JSON.stringify(MOCK_STRUCTURED[params.capability]);
  }
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

/**
 * Provider-agnostic LLM contract (docs/11 §4–5, docs/09 §2.5). Every provider
 * adapter implements {@link LlmProvider}; the Model Router consumes only this
 * interface. Vendor SDKs may be imported ONLY inside platform-integrations
 * (docs/03 §9 rule 2; docs/09 §12 decision log).
 */

export type LlmProviderName = 'anthropic' | 'openai' | 'mock';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmCallParams = {
  model: string;
  messages: LlmMessage[];
  maxOutputTokens: number;
  temperature?: number;
  abortSignal?: AbortSignal;
};

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type LlmCompletion = {
  text: string;
  usage: LlmUsage;
  stopReason: 'end' | 'max_tokens' | 'aborted' | 'other';
};

/** Thrown by adapters for provider-side failures the Router can act on. */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    /** Coarse failure class driving the Router's retry budget (docs/09 §11.2). */
    readonly kind: 'server' | 'rate_limit' | 'timeout' | 'auth' | 'bad_request',
    readonly provider: LlmProviderName,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

export interface LlmProvider {
  readonly name: LlmProviderName;

  /** Awaited mode (docs/09 §2.6): full response once complete. */
  complete(params: LlmCallParams): Promise<LlmCompletion>;

  /**
   * Streaming mode (docs/09 §2.6): yields text deltas as they arrive and
   * returns the final completion (with usage) when the stream ends.
   */
  stream(params: LlmCallParams): AsyncGenerator<string, LlmCompletion, void>;
}

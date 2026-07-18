/**
 * Provider-agnostic embedding contract (docs/09 §5). Separate from the chat
 * {@link LlmProvider} because embedding is a distinct capability with no
 * generation. Vendor SDKs live ONLY in platform-integrations (docs/03 §9).
 */

export type EmbeddingProviderName = 'openai' | 'mock';

export const EMBEDDING_DIMENSIONS = 1536; // docs/04 §7.1 vector(1536)

export type EmbedResult = {
  /** One 1536-d vector per input, in input order. */
  vectors: number[][];
  inputTokens: number;
};

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'server' | 'rate_limit' | 'timeout' | 'auth' | 'bad_request',
    readonly provider: EmbeddingProviderName,
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}

export interface EmbeddingProvider {
  readonly name: EmbeddingProviderName;
  readonly model: string;
  /** Embed a batch of inputs (docs/09 §5.3). Returns one vector per input. */
  embed(texts: string[], abortSignal?: AbortSignal): Promise<EmbedResult>;
}

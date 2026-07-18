import OpenAI from 'openai';
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingProviderError,
  type EmbedResult,
  type EmbeddingProvider,
} from './embeddings-types';

/**
 * OpenAI embedding adapter (docs/09 §5.1) — text-embedding-3-small, 1536-d. The
 * ONLY file that may import `openai`. Reads OPENAI_API_KEY at construction; the
 * Router falls back to the mock embedder when the key is absent (decision D2).
 */

const MODEL = 'text-embedding-3-small';

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function toProviderError(err: unknown): EmbeddingProviderError {
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    const kind =
      status === 429
        ? 'rate_limit'
        : status === 401 || status === 403
          ? 'auth'
          : status >= 500
            ? 'server'
            : 'bad_request';
    return new EmbeddingProviderError(err.message, kind, 'openai');
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new EmbeddingProviderError('aborted', 'timeout', 'openai');
  }
  return new EmbeddingProviderError(
    err instanceof Error ? err.message : String(err),
    'server',
    'openai',
  );
}

export function createOpenAiEmbeddingProvider(): EmbeddingProvider {
  const client = new OpenAI(); // reads OPENAI_API_KEY from env

  return {
    name: 'openai',
    model: MODEL,
    async embed(texts: string[], abortSignal?: AbortSignal): Promise<EmbedResult> {
      if (texts.length === 0) return { vectors: [], inputTokens: 0 };
      try {
        const res = await client.embeddings.create(
          { model: MODEL, input: texts, dimensions: EMBEDDING_DIMENSIONS },
          { signal: abortSignal },
        );
        // API returns data in input order, but sort by index defensively.
        const vectors = [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
        return { vectors, inputTokens: res.usage.prompt_tokens };
      } catch (err) {
        throw toProviderError(err);
      }
    },
  };
}

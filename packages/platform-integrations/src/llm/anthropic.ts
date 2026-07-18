import Anthropic from '@anthropic-ai/sdk';
import {
  LlmProviderError,
  type LlmCallParams,
  type LlmCompletion,
  type LlmMessage,
  type LlmProvider,
} from './types';

/**
 * Anthropic adapter (docs/11 §4). The ONLY file that may import
 * @anthropic-ai/sdk. Reads ANTHROPIC_API_KEY at construction; the Router falls
 * back to the mock provider when the key is absent (Sprint 3.3 decision #4).
 */

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function splitMessages(messages: LlmMessage[]): {
  system: string | undefined;
  turns: { role: 'user' | 'assistant'; content: string }[];
} {
  // Anthropic takes the system prompt as a dedicated parameter, not a message.
  const system =
    messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n') || undefined;
  const turns = messages
    .filter((m): m is LlmMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
  return { system, turns };
}

function toProviderError(err: unknown): LlmProviderError {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    const kind =
      status === 429
        ? 'rate_limit'
        : status === 401 || status === 403
          ? 'auth'
          : status >= 500
            ? 'server'
            : 'bad_request';
    return new LlmProviderError(err.message, kind, 'anthropic');
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new LlmProviderError('aborted', 'timeout', 'anthropic');
  }
  return new LlmProviderError(
    err instanceof Error ? err.message : String(err),
    'server',
    'anthropic',
  );
}

export function createAnthropicProvider(): LlmProvider {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  return {
    name: 'anthropic',

    async complete(params: LlmCallParams): Promise<LlmCompletion> {
      const { system, turns } = splitMessages(params.messages);
      try {
        const res = await client.messages.create(
          {
            model: params.model,
            max_tokens: params.maxOutputTokens,
            ...(system ? { system } : {}),
            ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
            messages: turns,
          },
          { signal: params.abortSignal },
        );
        const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        return {
          text,
          usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
          stopReason: res.stop_reason === 'max_tokens' ? 'max_tokens' : 'end',
        };
      } catch (err) {
        throw toProviderError(err);
      }
    },

    async *stream(params: LlmCallParams): AsyncGenerator<string, LlmCompletion, void> {
      const { system, turns } = splitMessages(params.messages);
      try {
        const stream = client.messages.stream(
          {
            model: params.model,
            max_tokens: params.maxOutputTokens,
            ...(system ? { system } : {}),
            ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
            messages: turns,
          },
          { signal: params.abortSignal },
        );
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield event.delta.text;
          }
        }
        const final = await stream.finalMessage();
        const text = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        return {
          text,
          usage: {
            inputTokens: final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
          },
          stopReason: final.stop_reason === 'max_tokens' ? 'max_tokens' : 'end',
        };
      } catch (err) {
        throw toProviderError(err);
      }
    },
  };
}

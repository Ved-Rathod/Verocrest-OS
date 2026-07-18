import { rememberMemory } from '@verocrest/platform-ai-router/server';
import { inngest } from '../client';

/**
 * Memory writer (docs/09 §4.6, pipeline step 10). Subscribes to the internal
 * `memory.write.requested` job event and persists the learning: embed the
 * content (cost-logged as embed-memory-generic) + dedup + insert a memory_vectors
 * row, all under the service role. Fire-and-forget by construction — a failure
 * here never touches the original AI request. The event carries a SYSTEM actor
 * for the embed's ai.output.produced (the atomic RPC rejects a 'user' actor under
 * the service role, where auth.uid() is null).
 */
export const memoryWriter = inngest.createFunction(
  { id: 'memory-writer', name: 'Memory writer' },
  { event: 'memory.write.requested' },
  async ({ event, logger }) => {
    const job = event.data;
    const result = await rememberMemory({
      workspaceId: job.workspaceId,
      actor: { type: 'system', id: 'memory-writer' },
      requestId: job.requestId,
      scope: job.scope,
      subjectId: job.subjectId,
      content: job.content,
      ...(job.metadata ? { metadata: job.metadata } : {}),
      ...(job.createdBy ? { createdBy: job.createdBy } : {}),
    });
    logger.info('memory write processed', {
      workspaceId: job.workspaceId,
      scope: job.scope,
      written: result.written,
    });
    return result;
  },
);

import type { NextRequest } from 'next/server';
import { RouterError, type RouterMetadata } from '@verocrest/platform-ai-router';
import { createServerRouter } from '@verocrest/platform-ai-router/server';
import { WorkspaceContextError, requireWorkspaceContext } from '@verocrest/platform-tenancy/server';

/**
 * SSE streaming Route Handler (docs/10 §7.4 frame contract: start → token* →
 * complete | error) for the Sprint 3.3 capability, summarize-thread. This is
 * the substrate's streaming surface — the draft-outreach endpoints (S9) reuse
 * this exact pattern. Session + workspace auth; capability-level budget gating
 * happens inside the Router (docs/09 §6).
 *
 * Query params: thread (required), channel?, participants?.
 * Cancellation: closing the EventSource aborts the provider call.
 */

export const dynamic = 'force-dynamic';

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** The §7.4 aiMetadata frame shape (subset of RouterMetadata). */
function aiMetadata(m: RouterMetadata): Record<string, unknown> {
  return {
    provider: m.provider,
    model: m.model,
    promptId: m.promptId,
    promptVersion: m.promptVersion,
    memoryHits: m.memoryHits,
    ...(m.confidence ? { confidence: m.confidence } : {}),
    costUsd: m.costUsd,
    latencyMs: m.latencyMs,
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  let ctx;
  try {
    ctx = await requireWorkspaceContext();
  } catch (err) {
    const message = err instanceof WorkspaceContextError ? err.message : 'unauthorized';
    return Response.json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const thread = params.get('thread');
  if (!thread || thread.trim() === '') {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: 'thread is required' } },
      { status: 400 },
    );
  }

  const router = createServerRouter();
  const requestId = crypto.randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseFrame(event, data)));
      send('start', { requestId });
      try {
        const generator = router.callCapabilityStream(
          {
            capability: 'summarize-thread',
            input: {
              thread,
              channel: params.get('channel') ?? 'email',
              participants: params.get('participants') ?? 'the agency and a prospect',
            },
            workspaceContext: {
              workspaceId: ctx.workspaceId,
              actorUserId: ctx.userId,
              agentId: null,
              requestId,
            },
            streaming: true,
          },
          request.signal,
        );
        let next = await generator.next();
        while (!next.done) {
          send('token', { delta: next.value });
          next = await generator.next();
        }
        send('complete', { aiMetadata: aiMetadata(next.value.metadata) });
      } catch (err) {
        const code = err instanceof RouterError ? err.code : 'AI_PROVIDER_UNAVAILABLE';
        const message = err instanceof Error ? err.message : 'stream failed';
        send('error', { code, message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

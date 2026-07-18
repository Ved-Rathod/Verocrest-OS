// @verocrest/platform-ai-router — server entry. The Router is the ONLY way
// feature code reaches an LLM (docs/09 §12); provider SDKs live exclusively in
// platform-integrations (docs/03 §9).
import {
  createAnthropicProvider,
  createMockEmbeddingProvider,
  createMockProvider,
  createOpenAiEmbeddingProvider,
  hasAnthropicKey,
  hasOpenAiKey,
} from '@verocrest/platform-integrations/llm';
import type { EventActor } from '@verocrest/platform-event-bus';
import { embedThroughRouter, type EmbeddingRegistry } from './embeddings';
import { chunkText } from './memory/chunker';
import {
  createServiceRoleMemoryStore,
  createSupabaseMemoryStore,
} from './memory/supabase-memory-store';
import { writeMemory } from './memory/writer';
import type { IndexedChunk } from './memory/types';
import type { Capability, MemoryScope } from './types';
import { createRouter, type Router } from './pipeline';
import type { ProviderRegistry } from './providers';
import {
  createServiceRoleUsageStore,
  createSupabasePromptStore,
  createSupabaseUsageStore,
} from './supabase-stores';

export { createRouter, type Router, type RouterDeps, type PromptVariables } from './pipeline';
export type { ProviderRegistry, SelectedProvider } from './providers';
export { selectProviders, completeWithRetry } from './providers';
export { embedThroughRouter, type EmbeddingRegistry } from './embeddings';
export type { AiUsageRecord, UsageStore } from './ports';
export type { PromptStore, ResolvedPrompt } from './prompts/registry';
export {
  createServiceRoleUsageStore,
  createSupabasePromptStore,
  createSupabaseUsageStore,
} from './supabase-stores';
export {
  createServiceRoleKnowledgeChunkStore,
  createServiceRoleMemoryStore,
  createSupabaseMemoryStore,
} from './memory/supabase-memory-store';
export type { MemoryHit, MemoryStore, IndexedChunk } from './memory/types';
export {
  syncKnowledgeChunks,
  type KnowledgeChunkRecord,
  type KnowledgeChunkStore,
} from './memory/knowledge-chunks';

function budgetWarning(info: { workspaceId: string; spend: number; budget: number }): void {
  console.warn(
    `[ai-router] workspace ${info.workspaceId} at ${Math.round((info.spend / info.budget) * 100)}% of monthly AI budget`,
  );
}

/**
 * Chat providers. Anthropic joins only when ANTHROPIC_API_KEY is set; the mock is
 * always present, so a keyless machine runs offline (Sprint 3.3 decision #4).
 */
export function buildProviderRegistry(): ProviderRegistry {
  const registry: ProviderRegistry = { mock: createMockProvider() };
  if (hasAnthropicKey()) registry.anthropic = createAnthropicProvider();
  return registry;
}

/**
 * Embedding providers. OpenAI joins only when OPENAI_API_KEY is set; the mock is
 * always present, so memory works keyless in local dev (Sprint 3.4 decision D2).
 */
export function buildEmbeddingRegistry(): EmbeddingRegistry {
  const registry: EmbeddingRegistry = { mock: createMockEmbeddingProvider() };
  if (hasOpenAiKey()) registry.openai = createOpenAiEmbeddingProvider();
  return registry;
}

/**
 * The production Router for request-scoped server code. Retrieval reads memory as
 * the requesting user (RLS-scoped); memory writes happen out-of-band in the
 * subscriber. The bus publisher was registered at boot by instrumentation.ts.
 */
export function createServerRouter(): Router {
  return createRouter({
    providers: buildProviderRegistry(),
    embedders: buildEmbeddingRegistry(),
    usageStore: createSupabaseUsageStore(),
    promptStore: createSupabasePromptStore(),
    memoryStore: createSupabaseMemoryStore(),
    onBudgetWarning: budgetWarning,
  });
}

/**
 * Pipeline step 10 — persist a learning to Memory (docs/09 §4.6). Embeds the
 * content through the Router (cost-logged + ai.output.produced), then writes a
 * deduped memory_vectors row under the service role. Invoked by the memory-writer
 * subscriber (fire-and-forget); returns whether a new row was written.
 */
export async function rememberMemory(params: {
  workspaceId: string;
  actor: EventActor;
  requestId: string;
  scope: MemoryScope;
  subjectId: string | null;
  content: string;
  metadata?: Record<string, unknown>;
  ttlAt?: string | null;
  createdBy?: string | null;
}): Promise<{ written: boolean; contentHash: string }> {
  const embedders = buildEmbeddingRegistry();
  const usageStore = createServiceRoleUsageStore();
  const embedded = await embedThroughRouter(
    { embedders, usageStore, onBudgetWarning: budgetWarning },
    {
      capability: 'embed-memory-generic',
      workspaceId: params.workspaceId,
      actor: params.actor,
      requestId: params.requestId,
      texts: [params.content],
    },
  );
  const embedding = embedded.vectors[0];
  if (!embedding) return { written: false, contentHash: '' };

  return writeMemory(createServiceRoleMemoryStore(), {
    workspaceId: params.workspaceId,
    scope: params.scope,
    subjectId: params.subjectId,
    content: params.content,
    embedding,
    metadata: { ...(params.metadata ?? {}), workspace_id: params.workspaceId }, // defence-in-depth (docs/03 §12)
    ttlAt: params.ttlAt ?? null,
    createdBy: params.createdBy ?? null,
  });
}

/**
 * Knowledge Indexer engine (docs/09 §5.2–5.4). Chunks an entity's source text,
 * embeds the chunks (batch, cost-logged via the given embed-* capability), writes
 * each as a memory_vectors row tagged with the entity's `sourceContentHash`, then
 * runs the two-phase swap: delete the entity's rows carrying a prior hash. Runs
 * under the service role (Knowledge Indexer subscriber). Idempotent — an unchanged
 * `sourceContentHash` re-inserts nothing (per-chunk dedup) and deletes nothing.
 * Returns the chunk count for the `*.indexed` event payload.
 */
export async function indexEntityIntoMemory(params: {
  workspaceId: string;
  scope: MemoryScope;
  subjectId: string;
  sourceText: string;
  sourceContentHash: string;
  embedCapability: Capability; // an embed-* capability (e.g. 'embed-icp')
  actor: EventActor;
  requestId: string;
  metadataBase?: Record<string, unknown>;
}): Promise<{ chunkCount: number; chunks: IndexedChunk[] }> {
  const chunks = chunkText(params.sourceText);
  const store = createServiceRoleMemoryStore();
  const indexed: IndexedChunk[] = [];

  if (chunks.length > 0) {
    const embedded = await embedThroughRouter(
      {
        embedders: buildEmbeddingRegistry(),
        usageStore: createServiceRoleUsageStore(),
        onBudgetWarning: budgetWarning,
      },
      {
        capability: params.embedCapability,
        workspaceId: params.workspaceId,
        actor: params.actor,
        requestId: params.requestId,
        texts: chunks.map((c) => c.content),
      },
    );
    for (let i = 0; i < chunks.length; i++) {
      const embedding = embedded.vectors[i];
      if (!embedding) continue;
      const written = await writeMemory(store, {
        workspaceId: params.workspaceId,
        scope: params.scope,
        subjectId: params.subjectId,
        content: chunks[i]!.content,
        embedding,
        metadata: {
          ...(params.metadataBase ?? {}),
          workspace_id: params.workspaceId, // defence-in-depth (docs/03 §12)
          chunk_index: chunks[i]!.chunkIndex,
          source_content_hash: params.sourceContentHash,
        },
      });
      indexed.push({
        chunkIndex: chunks[i]!.chunkIndex,
        charStart: chunks[i]!.charStart,
        charEnd: chunks[i]!.charEnd,
        content: chunks[i]!.content,
        contentHash: written.contentHash,
        memoryVectorId: written.memoryId,
      });
    }
  }

  // Two-phase swap (memory side): new chunks are durable above; remove any
  // prior-version vectors. Chunk-tracking (knowledge_document_chunks) is swapped
  // by the caller's descriptor afterIndex hook (Sprint 4.3).
  await store.deleteStaleChunks({
    workspaceId: params.workspaceId,
    scope: params.scope,
    subjectId: params.subjectId,
    keepSourceContentHash: params.sourceContentHash,
  });

  return { chunkCount: chunks.length, chunks: indexed };
}

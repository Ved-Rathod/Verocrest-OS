import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { createSupabaseServiceRoleClient } from '@verocrest/platform-integrations/supabase/service';
import type { MemoryScope } from '../types';
import type { KnowledgeChunkRecord, KnowledgeChunkStore } from './knowledge-chunks';
import type { MemoryAnnotation, MemoryHit, MemoryStore, MemoryWriteRecord } from './types';

/**
 * Supabase-backed MemoryStore. Retrieval runs in the requesting user's context
 * (cookie client, RLS-scoped); writes run under the service role in the
 * memory-writer subscriber (no user session). Two factories make the context
 * explicit at the call site.
 */

/** pgvector literal: '[0.1,0.2,...]' with no spaces (vector input format). */
function formatVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

function makeStore(getClient: () => Promise<SupabaseClient>): MemoryStore {
  return {
    async match(params): Promise<MemoryHit[]> {
      const supabase = await getClient();
      const { data, error } = await supabase.rpc('match_memory', {
        p_workspace: params.workspaceId,
        p_scopes: params.scopes,
        p_subject_ids: params.subjectIds,
        p_query_embedding: formatVector(params.queryEmbedding),
        p_top_k: params.topK,
        p_min_similarity: params.minSimilarity,
      });
      if (error) throw error;
      return (data ?? []).map(
        (r: {
          id: string;
          scope: MemoryScope;
          subject_id: string | null;
          content: string;
          metadata: Record<string, unknown> | null;
          agent_id: string | null;
          similarity: number;
        }): MemoryHit => ({
          id: r.id,
          scope: r.scope,
          subjectId: r.subject_id,
          content: r.content,
          metadata: r.metadata ?? {},
          similarity: Number(r.similarity),
          agentId: r.agent_id,
        }),
      );
    },

    async annotationsFor(workspaceId: string, memoryIds: string[]): Promise<MemoryAnnotation[]> {
      if (memoryIds.length === 0) return [];
      const supabase = await getClient();
      const { data, error } = await supabase
        .from('memory_annotations')
        .select('memory_id, annotation, capability')
        .eq('workspace_id', workspaceId)
        .in('memory_id', memoryIds);
      if (error) throw error;
      return (data ?? []).map(
        (r: { memory_id: string; annotation: string; capability: string | null }) => ({
          memoryId: r.memory_id,
          annotation: r.annotation as MemoryAnnotation['annotation'],
          capability: r.capability,
        }),
      );
    },

    async findMemoryIdByHash(params): Promise<string | null> {
      const supabase = await getClient();
      let query = supabase
        .from('memory_vectors')
        .select('id')
        .eq('workspace_id', params.workspaceId)
        .eq('scope', params.scope)
        .eq('content_hash', params.contentHash);
      query =
        params.subjectId === null
          ? query.is('subject_id', null)
          : query.eq('subject_id', params.subjectId);
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      return data ? (data.id as string) : null;
    },

    async insert(record: MemoryWriteRecord): Promise<string> {
      const supabase = await getClient();
      const { data, error } = await supabase
        .from('memory_vectors')
        .insert({
          workspace_id: record.workspaceId,
          scope: record.scope,
          subject_id: record.subjectId,
          content_hash: record.contentHash,
          content: record.content,
          embedding: formatVector(record.embedding),
          metadata: record.metadata,
          ttl_at: record.ttlAt ?? null,
          created_by: record.createdBy ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async deleteStaleChunks(params): Promise<number> {
      const supabase = await getClient();
      const { data, error } = await supabase
        .from('memory_vectors')
        .delete()
        .eq('workspace_id', params.workspaceId)
        .eq('scope', params.scope)
        .eq('subject_id', params.subjectId)
        .neq('metadata->>source_content_hash', params.keepSourceContentHash)
        .select('id');
      if (error) throw error;
      return (data ?? []).length;
    },
  };
}

/** Request-scoped store (RLS) — retrieval + annotations. */
export function createSupabaseMemoryStore(): MemoryStore {
  return makeStore(() => createSupabaseServerClient());
}

/** Service-role store — the memory-writer subscriber (dedup + insert). */
export function createServiceRoleMemoryStore(): MemoryStore {
  return makeStore(() => Promise.resolve(createSupabaseServiceRoleClient()));
}

/**
 * Service-role knowledge_document_chunks store (Sprint 4.3). Written only by the
 * Knowledge Indexer's afterIndex hook (no user session).
 */
export function createServiceRoleKnowledgeChunkStore(): KnowledgeChunkStore {
  const client = createSupabaseServiceRoleClient();
  return {
    async upsertChunks(records: KnowledgeChunkRecord[]): Promise<void> {
      if (records.length === 0) return;
      const { error } = await client.from('knowledge_document_chunks').upsert(
        records.map((r) => ({
          workspace_id: r.workspaceId,
          knowledge_document_id: r.knowledgeDocumentId,
          chunk_index: r.chunkIndex,
          content: r.content,
          char_start: r.charStart,
          char_end: r.charEnd,
          memory_vector_id: r.memoryVectorId,
          content_hash: r.contentHash,
          doc_version_at_index: r.docVersionAtIndex,
        })),
        { onConflict: 'knowledge_document_id,chunk_index' },
      );
      if (error) throw error;
    },

    async deleteChunksWhereHashNot(params): Promise<number> {
      const { data, error } = await client
        .from('knowledge_document_chunks')
        .delete()
        .eq('workspace_id', params.workspaceId)
        .eq('knowledge_document_id', params.knowledgeDocumentId)
        .neq('content_hash', params.keepContentHash)
        .select('id');
      if (error) throw error;
      return (data ?? []).length;
    },
  };
}

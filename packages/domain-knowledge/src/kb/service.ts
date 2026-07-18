import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { slugify } from '../offer/validation';
import { knowledgeDocContentHash } from './hash';
import {
  KNOWLEDGE_DOC_SELECT,
  knowledgeDocRowSchema,
  toKnowledgeDoc,
  type KnowledgeDoc,
  type KnowledgeDocListItem,
} from './types';
import type { KnowledgeDocInput } from './validation';

/**
 * Knowledge Documents repository (docs/04 §7.3, docs/05 §3.5). Server-only; RLS
 * backstop. Every save emits `knowledge_doc.upserted` (no draft gating — D5),
 * which the Knowledge Indexer consumes to chunk + embed content (scope
 * 'knowledge_doc') and maintain knowledge_document_chunks.
 */

export async function listKnowledgeDocs(ctx: WorkspaceContext): Promise<KnowledgeDocListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('id, title, doc_type, is_indexed, tags, updated_at')
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    docType: r.doc_type as KnowledgeDocListItem['docType'],
    isIndexed: Boolean(r.is_indexed),
    tags: (r.tags as string[]) ?? [],
    updatedAt: r.updated_at as string,
  }));
}

export async function getKnowledgeDoc(
  ctx: WorkspaceContext,
  id: string,
): Promise<KnowledgeDoc | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select(KNOWLEDGE_DOC_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toKnowledgeDoc(knowledgeDocRowSchema.parse(data)) : null;
}

async function uniqueSlug(
  ctx: WorkspaceContext,
  base: string,
  excludeId?: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('id, slug')
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null)
    .ilike('slug', `${base}%`);
  if (error) throw error;
  const taken = new Set(
    (data ?? [])
      .filter((r) => r.id !== excludeId && r.slug)
      .map((r) => (r.slug as string).toLowerCase()),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

function docFields(input: KnowledgeDocInput, slug: string, contentHash: string) {
  return {
    doc_type: input.docType,
    title: input.title,
    slug,
    summary: input.summary || null,
    content: input.content,
    content_rich: null, // markdown is the source of truth (D8)
    tags: input.tags,
    linked_entity_type: input.linkedEntityType ?? null,
    linked_entity_id: input.linkedEntityId ?? null,
    visibility: input.visibility,
    content_hash: contentHash,
  };
}

export async function createKnowledgeDoc(
  ctx: WorkspaceContext,
  input: KnowledgeDocInput,
): Promise<KnowledgeDoc> {
  const supabase = await createSupabaseServerClient();
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(ctx, input.slug ? slugify(input.slug) : slugify(input.title));
  const contentHash = knowledgeDocContentHash(input.content);

  const event = buildEvent({
    name: 'knowledge_doc.upserted',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { knowledge_doc_id: id, version: 1 },
  });
  const { data, error } = await supabase.rpc('create_knowledge_doc_with_event', {
    p_doc: {
      id,
      workspace_id: ctx.workspaceId,
      ...docFields(input, slug, contentHash),
      version: 1,
      active: true,
      author_user_id: ctx.userId,
    },
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  const doc = toKnowledgeDoc(knowledgeDocRowSchema.parse(data));
  await publishToBus(event); // fan out → Knowledge Indexer
  return doc;
}

export async function updateKnowledgeDoc(
  ctx: WorkspaceContext,
  id: string,
  input: KnowledgeDocInput,
): Promise<KnowledgeDoc | null> {
  const supabase = await createSupabaseServerClient();
  const { data: current, error: readError } = await supabase
    .from('knowledge_documents')
    .select('content_hash, is_indexed, slug, version')
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) return null;

  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.title);
  const slug =
    baseSlug === (current.slug as string | null) ? baseSlug : await uniqueSlug(ctx, baseSlug, id);
  const contentHash = knowledgeDocContentHash(input.content);
  const contentChanged = contentHash !== (current.content_hash as string);
  // Content change → new version + re-index; metadata-only edits keep both.
  const version = contentChanged ? (current.version as number) + 1 : (current.version as number);
  const isIndexed = contentChanged ? false : Boolean(current.is_indexed);

  const event = buildEvent({
    name: 'knowledge_doc.upserted',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { knowledge_doc_id: id, version },
  });
  const { data, error } = await supabase.rpc('update_knowledge_doc_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_doc: {
      ...docFields(input, slug, contentHash),
      version,
      is_indexed: isIndexed,
      active: true,
    },
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  if (!data) return null;
  const doc = toKnowledgeDoc(knowledgeDocRowSchema.parse(data));
  await publishToBus(event);
  return doc;
}

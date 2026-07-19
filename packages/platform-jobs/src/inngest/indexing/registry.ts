import type { Capability, MemoryScope } from '@verocrest/platform-ai-router';
import {
  createServiceRoleKnowledgeChunkStore,
  syncKnowledgeChunks,
  type IndexedChunk,
} from '@verocrest/platform-ai-router/server';
import type { EventName } from '@verocrest/platform-event-bus';

/**
 * Knowledge-Indexer descriptor registry (Sprint 4.2, decision D2). The single
 * indexer generalizes over entity types by looking up an `*.upserted` event's
 * descriptor here. Adding a Knowledge-Layer entity = adding a row, not a new
 * subscriber. ICP behavior is preserved byte-for-byte by its descriptor.
 */
export type IndexDescriptor = {
  table: string;
  selectColumns: string;
  scope: MemoryScope;
  embedCapability: Capability;
  /** Deterministic source text that gets chunked + embedded (docs/09 §5.2). */
  buildSourceText: (row: Record<string, unknown>) => string;
  metadataBase: (row: Record<string, unknown>) => Record<string, unknown>;
  setIndexedRpc: string;
  indexedEventName: EventName;
  buildIndexedPayload: (
    row: Record<string, unknown>,
    chunkCount: number,
  ) => Record<string, unknown>;
  /**
   * Whether the source table has a `deleted_at` column (Sprint 4.8). Append-only
   * tables (audits) set this false so the indexer skips the `deleted_at is null`
   * filter. Defaults to true (icp/offer/kb/target are soft-deletable).
   */
  softDelete?: boolean;
  /**
   * Optional post-index hook (Sprint 4.3): entities that maintain a chunk-tracking
   * table (KB docs → knowledge_document_chunks) use this to record + swap chunks.
   * ICP/Offer omit it → identical behavior to Sprints 4.1/4.2.
   */
  afterIndex?: (ctx: {
    workspaceId: string;
    subjectId: string;
    row: Record<string, unknown>;
    chunks: IndexedChunk[];
  }) => Promise<void>;
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const objs = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

/**
 * Offer source text (docs/04 §10.7): positioning + roi_narrative + deliverables +
 * guarantees. Structured jsonb items are serialized to readable lines so the
 * embedder sees the substance, not JSON.
 */
function offerSourceText(row: Record<string, unknown>): string {
  const parts: string[] = [];
  if (str(row['positioning'])) parts.push(str(row['positioning']));
  if (str(row['roi_narrative'])) parts.push(str(row['roi_narrative']));
  for (const d of objs(row['deliverables'])) {
    const line = `Deliverable: ${str(d['title'])}. ${str(d['description'])}`.trim();
    if (line !== 'Deliverable: .') parts.push(line);
  }
  for (const g of objs(row['guarantees'])) {
    const line =
      `Guarantee: ${str(g['type'])}. ${str(g['description'])} ${str(g['conditions'])}`.trim();
    if (line !== 'Guarantee: .') parts.push(line);
  }
  return parts.join('\n\n');
}

/** Revenue-target fact (docs/04 §13.2, Sprint 4.7). One short line per target. */
function targetSourceText(row: Record<string, unknown>): string {
  const period = str(row['period']);
  const label = period ? `${period[0]!.toUpperCase()}${period.slice(1)}` : 'Revenue';
  const amount = row['revenue_target'];
  const currency = str(row['currency']);
  return `${label} revenue target: ${currency} ${amount ?? ''} for ${str(row['period_start'])} to ${str(row['period_end'])}.`.trim();
}

export const INDEX_DESCRIPTORS: Partial<Record<EventName, IndexDescriptor>> = {
  'icp.upserted': {
    table: 'icps',
    selectColumns: 'id, name, narrative, content_hash',
    scope: 'icp',
    embedCapability: 'embed-icp',
    buildSourceText: (row) => str(row['narrative']),
    metadataBase: (row) => ({ icp_name: row['name'], source: 'icp' }),
    setIndexedRpc: 'set_icp_indexed_with_event',
    indexedEventName: 'icp.indexed',
    buildIndexedPayload: (row, chunkCount) => ({ icp_id: row['id'], chunk_count: chunkCount }),
  },
  'offer.upserted': {
    table: 'offers',
    selectColumns: 'id, name, positioning, roi_narrative, deliverables, guarantees, content_hash',
    scope: 'offer',
    embedCapability: 'embed-offer',
    buildSourceText: offerSourceText,
    metadataBase: (row) => ({ offer_name: row['name'], source: 'offer' }),
    setIndexedRpc: 'set_offer_indexed_with_event',
    indexedEventName: 'offer.indexed',
    buildIndexedPayload: (row, chunkCount) => ({ offer_id: row['id'], chunk_count: chunkCount }),
  },
  'knowledge_doc.upserted': {
    table: 'knowledge_documents',
    selectColumns: 'id, title, doc_type, content, content_hash, version',
    scope: 'knowledge_doc',
    embedCapability: 'embed-knowledge',
    buildSourceText: (row) => str(row['content']),
    metadataBase: (row) => ({
      doc_title: row['title'],
      doc_type: row['doc_type'],
      source: 'knowledge_doc',
    }),
    setIndexedRpc: 'set_knowledge_doc_indexed_with_event',
    indexedEventName: 'knowledge_doc.indexed',
    buildIndexedPayload: (row, chunkCount) => ({
      knowledge_doc_id: row['id'],
      chunk_count: chunkCount,
    }),
    // Maintain knowledge_document_chunks (docs/04 §7.4–7.5) with the two-phase swap.
    afterIndex: async ({ workspaceId, subjectId, row, chunks }) => {
      await syncKnowledgeChunks(createServiceRoleKnowledgeChunkStore(), {
        workspaceId,
        knowledgeDocumentId: subjectId,
        docContentHash: String(row['content_hash']),
        docVersion: Number(row['version'] ?? 1),
        chunks,
      });
    },
  },
  // Website audits (Sprint 4.8 D3): the deterministic analysis summary indexed
  // under the frozen 'audit' scope. Trigger is `website.audit.completed`. `audits`
  // is append-only (no deleted_at → softDelete: false). The service pre-builds
  // `signals.summary` (problems + technologies + opportunities) — that's embedded.
  'website.audit.completed': {
    table: 'audits',
    selectColumns: 'id, url_normalized, signals, content_hash',
    scope: 'audit',
    embedCapability: 'embed-audit',
    softDelete: false,
    buildSourceText: (row) => {
      const signals = (row['signals'] ?? {}) as Record<string, unknown>;
      return typeof signals['summary'] === 'string' ? signals['summary'] : '';
    },
    metadataBase: (row) => ({ source: 'website_audit', url: row['url_normalized'] }),
    setIndexedRpc: 'set_audit_indexed_with_event',
    indexedEventName: 'website.audit.indexed',
    buildIndexedPayload: (row, chunkCount) => ({ audit_id: row['id'], chunk_count: chunkCount }),
  },
  // Revenue targets (Sprint 4.7 D4): indexed under the existing 'workspace' scope —
  // no new scope. Trigger is the frozen `target.set` event; no afterIndex hook.
  'target.set': {
    table: 'workspace_targets',
    selectColumns: 'id, period, period_start, period_end, revenue_target, currency, content_hash',
    scope: 'workspace',
    embedCapability: 'embed-target',
    buildSourceText: targetSourceText,
    metadataBase: (row) => ({ source: 'revenue_target', period: row['period'] }),
    setIndexedRpc: 'set_target_indexed_with_event',
    indexedEventName: 'target.indexed',
    buildIndexedPayload: (row, chunkCount) => ({ target_id: row['id'], chunk_count: chunkCount }),
  },
};

export const INDEXER_TRIGGER_EVENTS = Object.keys(INDEX_DESCRIPTORS) as EventName[];

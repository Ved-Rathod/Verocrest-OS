import { describe, expect, it } from 'vitest';
import { INDEXER_TRIGGER_EVENTS, INDEX_DESCRIPTORS } from './registry';

/**
 * Descriptor-registry tests (Sprint 4.2 D2). The ICP assertions are the
 * regression guard: the generalized indexer must produce byte-identical ICP
 * behavior to Sprint 4.1.
 */
describe('index descriptor registry', () => {
  it('triggers exactly on the Knowledge-Layer upserted events', () => {
    expect(INDEXER_TRIGGER_EVENTS.sort()).toEqual([
      'icp.upserted',
      'knowledge_doc.upserted',
      'offer.upserted',
      'target.set',
    ]);
  });

  describe('ICP descriptor (regression — must match Sprint 4.1)', () => {
    const d = INDEX_DESCRIPTORS['icp.upserted']!;
    it('reads the icps table, scope icp, embed-icp', () => {
      expect(d.table).toBe('icps');
      expect(d.scope).toBe('icp');
      expect(d.embedCapability).toBe('embed-icp');
      expect(d.setIndexedRpc).toBe('set_icp_indexed_with_event');
      expect(d.indexedEventName).toBe('icp.indexed');
    });
    it('source text is the narrative verbatim', () => {
      expect(d.buildSourceText({ narrative: 'Owner-operated clinics.' })).toBe(
        'Owner-operated clinics.',
      );
    });
    it('payload + metadata shapes match 4.1', () => {
      expect(d.buildIndexedPayload({ id: 'x' }, 3)).toEqual({ icp_id: 'x', chunk_count: 3 });
      expect(d.metadataBase({ name: 'Clinics' })).toEqual({ icp_name: 'Clinics', source: 'icp' });
    });
  });

  describe('Offer descriptor', () => {
    const d = INDEX_DESCRIPTORS['offer.upserted']!;
    it('reads the offers table, scope offer, embed-offer', () => {
      expect(d.table).toBe('offers');
      expect(d.scope).toBe('offer');
      expect(d.embedCapability).toBe('embed-offer');
      expect(d.setIndexedRpc).toBe('set_offer_indexed_with_event');
      expect(d.indexedEventName).toBe('offer.indexed');
    });
    it('serializes positioning + roi + deliverables + guarantees (docs/04 §10.7)', () => {
      const text = d.buildSourceText({
        positioning: 'We audit fast.',
        roi_narrative: 'Clients see 3x.',
        deliverables: [{ title: 'Report', description: 'Full audit' }],
        guarantees: [{ type: 'money_back', description: '30-day', conditions: 'if unhappy' }],
      });
      expect(text).toContain('We audit fast.');
      expect(text).toContain('Clients see 3x.');
      expect(text).toContain('Deliverable: Report. Full audit');
      expect(text).toContain('Guarantee: money_back. 30-day if unhappy');
    });
    it('omits empty structured items', () => {
      const text = d.buildSourceText({
        positioning: 'Only positioning.',
        deliverables: [],
        guarantees: [],
      });
      expect(text).toBe('Only positioning.');
    });
    it('payload + metadata shapes', () => {
      expect(d.buildIndexedPayload({ id: 'o1' }, 5)).toEqual({ offer_id: 'o1', chunk_count: 5 });
      expect(d.metadataBase({ name: 'Audit' })).toEqual({ offer_name: 'Audit', source: 'offer' });
    });
    it('has NO afterIndex hook (offers do not track chunks)', () => {
      expect(d.afterIndex).toBeUndefined();
    });
  });

  describe('ICP descriptor has no afterIndex (chunk-tracking is KB-only)', () => {
    it('is undefined', () => {
      expect(INDEX_DESCRIPTORS['icp.upserted']!.afterIndex).toBeUndefined();
    });
  });

  describe('Revenue-target descriptor (Sprint 4.7 D4 — scope workspace, no new scope)', () => {
    const d = INDEX_DESCRIPTORS['target.set']!;
    it('reads workspace_targets, scope workspace, embed-target', () => {
      expect(d.table).toBe('workspace_targets');
      expect(d.scope).toBe('workspace');
      expect(d.embedCapability).toBe('embed-target');
      expect(d.setIndexedRpc).toBe('set_target_indexed_with_event');
      expect(d.indexedEventName).toBe('target.indexed');
    });
    it('builds a single revenue-target fact string', () => {
      const text = d.buildSourceText({
        period: 'monthly',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
        revenue_target: 50000,
        currency: 'USD',
      });
      expect(text).toContain('Monthly revenue target: USD 50000');
      expect(text).toContain('2026-07-01 to 2026-07-31');
    });
    it('payload + metadata shapes', () => {
      expect(d.buildIndexedPayload({ id: 't1' }, 1)).toEqual({ target_id: 't1', chunk_count: 1 });
      expect(d.metadataBase({ period: 'monthly' })).toEqual({
        source: 'revenue_target',
        period: 'monthly',
      });
    });
    it('has NO afterIndex hook (targets do not track chunks)', () => {
      expect(d.afterIndex).toBeUndefined();
    });
  });

  describe('Knowledge-doc descriptor', () => {
    const d = INDEX_DESCRIPTORS['knowledge_doc.upserted']!;
    it('reads knowledge_documents, scope knowledge_doc, embed-knowledge', () => {
      expect(d.table).toBe('knowledge_documents');
      expect(d.scope).toBe('knowledge_doc');
      expect(d.embedCapability).toBe('embed-knowledge');
      expect(d.setIndexedRpc).toBe('set_knowledge_doc_indexed_with_event');
      expect(d.indexedEventName).toBe('knowledge_doc.indexed');
    });
    it('source text is the content verbatim', () => {
      expect(d.buildSourceText({ content: '# Title\nBody.' })).toBe('# Title\nBody.');
    });
    it('carries doc_title + doc_type metadata', () => {
      expect(d.metadataBase({ title: 'SOP', doc_type: 'sop' })).toEqual({
        doc_title: 'SOP',
        doc_type: 'sop',
        source: 'knowledge_doc',
      });
    });
    it('HAS an afterIndex hook (maintains knowledge_document_chunks)', () => {
      expect(typeof d.afterIndex).toBe('function');
    });
  });
});

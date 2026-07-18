import { z } from 'zod';

/** Enums (docs/04 §7.3). */
export const KNOWLEDGE_DOC_TYPES = [
  'sop',
  'offer_narrative',
  'pricing_note',
  'case_study',
  'testimonial',
  'faq',
  'onboarding',
  'sales_playbook',
  'brand_voice',
  'legal_terms',
  'objection_handling',
  'other',
] as const;
export type KnowledgeDocType = (typeof KNOWLEDGE_DOC_TYPES)[number];

export const KNOWLEDGE_DOC_VISIBILITIES = ['internal', 'client_shareable'] as const;
export type KnowledgeDocVisibility = (typeof KNOWLEDGE_DOC_VISIBILITIES)[number];

/** Linked entity kinds supported by the v0.1 editor (docs/04 §7.3). */
export const KNOWLEDGE_LINKED_ENTITY_TYPES = ['offer', 'icp'] as const;
export type KnowledgeLinkedEntityType = (typeof KNOWLEDGE_LINKED_ENTITY_TYPES)[number];

export type KnowledgeDoc = {
  id: string;
  docType: KnowledgeDocType;
  title: string;
  slug: string | null;
  summary: string | null;
  content: string;
  tags: string[];
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  visibility: KnowledgeDocVisibility;
  version: number;
  isIndexed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeDocListItem = Pick<
  KnowledgeDoc,
  'id' | 'title' | 'docType' | 'isIndexed' | 'tags' | 'updatedAt'
>;

export const knowledgeDocRowSchema = z.object({
  id: z.string().uuid(),
  doc_type: z.enum(KNOWLEDGE_DOC_TYPES),
  title: z.string(),
  slug: z.string().nullable(),
  summary: z.string().nullable(),
  content: z.string(),
  tags: z.array(z.string()),
  linked_entity_type: z.string().nullable(),
  linked_entity_id: z.string().uuid().nullable(),
  visibility: z.enum(KNOWLEDGE_DOC_VISIBILITIES),
  version: z.number().int(),
  is_indexed: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export function toKnowledgeDoc(row: z.infer<typeof knowledgeDocRowSchema>): KnowledgeDoc {
  return {
    id: row.id,
    docType: row.doc_type,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    content: row.content,
    tags: row.tags,
    linkedEntityType: row.linked_entity_type,
    linkedEntityId: row.linked_entity_id,
    visibility: row.visibility,
    version: row.version,
    isIndexed: row.is_indexed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const KNOWLEDGE_DOC_SELECT =
  'id, doc_type, title, slug, summary, content, tags, linked_entity_type, linked_entity_id, visibility, version, is_indexed, created_at, updated_at';

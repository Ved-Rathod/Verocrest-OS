import { z } from 'zod';
import {
  KNOWLEDGE_DOC_TYPES,
  KNOWLEDGE_DOC_VISIBILITIES,
  KNOWLEDGE_LINKED_ENTITY_TYPES,
} from './types';

/**
 * Knowledge Document input validation (docs/04 §7.3, docs/05 §3.5). Markdown
 * `content` is the source of truth (no WYSIWYG — Sprint 4.3 D8). `summary` is an
 * optional user field; AI-generated summaries are deferred (no such capability
 * exists yet — D9).
 */
export const knowledgeDocInputSchema = z
  .object({
    docType: z.enum(KNOWLEDGE_DOC_TYPES),
    title: z.string().trim().min(1, 'Title is required').max(200),
    slug: z.string().trim().max(120).optional().or(z.literal('')),
    summary: z.string().trim().max(2000).optional().or(z.literal('')),
    content: z.string().trim().min(1, 'Content is required').max(200_000),
    tags: z.array(z.string().trim().min(1)).max(50).default([]),
    visibility: z.enum(KNOWLEDGE_DOC_VISIBILITIES).default('internal'),
    linkedEntityType: z.enum(KNOWLEDGE_LINKED_ENTITY_TYPES).nullable().optional(),
    linkedEntityId: z.string().uuid().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    // Linked entity is all-or-nothing.
    if (v.linkedEntityType && !v.linkedEntityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['linkedEntityId'],
        message: 'Select the linked item',
      });
    }
    if (v.linkedEntityId && !v.linkedEntityType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['linkedEntityType'],
        message: 'Choose a linked entity type',
      });
    }
  });

export type KnowledgeDocInput = z.infer<typeof knowledgeDocInputSchema>;

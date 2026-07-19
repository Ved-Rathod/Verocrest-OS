import type { z } from 'zod';
import type { LlmProviderName } from '@verocrest/platform-integrations/llm';

/**
 * Model Router public contract (docs/09 §2.2). Feature code names WHAT it wants
 * (a capability); the Router decides HOW (provider, model, prompt, budget).
 * Sprint 3.3 implements the substrate with exactly one live capability
 * (summarize-thread); the full union ships so downstream sprints add config,
 * not new plumbing. Memory fields are accepted but inert until Sprint 3.4.
 */

export type Capability =
  // Lead Intelligence (Module 2 / LIE)
  | 'score-lead'
  | 'embed-knowledge'
  | 'embed-icp'
  | 'embed-offer'
  | 'embed-target'
  | 'embed-audit'
  | 'embed-memory-generic'
  | 'classify-company-suggestion'
  // Website Auditor (Module 3)
  | 'audit-website'
  | 'generate-loom-script'
  // AI Personalization (Module 4)
  | 'draft-outreach-email'
  | 'draft-outreach-ig-dm'
  | 'draft-outreach-linkedin-dm'
  | 'classify-reply'
  | 'summarize-thread'
  // Sales CRM (Module 5)
  | 'draft-proposal'
  | 'regenerate-proposal-section'
  | 'summarize-meeting'
  | 'recommend-offer';

/**
 * Memory scopes — the frozen memory_scope_enum (docs/04 §7.1). Corrected in
 * Sprint 3.4 from the 3.3 placeholder (which carried a non-enum 'capability'
 * value) to the exact 10 database values.
 */
export type MemoryScope =
  | 'workspace'
  | 'company'
  | 'contact'
  | 'lead'
  | 'deal'
  | 'project'
  | 'audit'
  | 'knowledge_doc'
  | 'offer'
  | 'icp';

export const MEMORY_SCOPES: readonly MemoryScope[] = [
  'workspace',
  'company',
  'contact',
  'lead',
  'deal',
  'project',
  'audit',
  'knowledge_doc',
  'offer',
  'icp',
];

export type RouterWorkspaceContext = {
  workspaceId: string;
  actorUserId?: string;
  agentId?: string | null; // v0.1: always null; Phase 3+ scaffolding
  requestId: string;
};

export type RouterCall<TInput> = {
  capability: Capability;
  input: TInput;
  workspaceContext: RouterWorkspaceContext;
  memory?: {
    scopes: MemoryScope[];
    subjectIds?: string[];
    topK?: number;
    minSimilarity?: number;
  };
  streaming?: boolean;
  promptVersionPin?: number;
  modelOverride?: string;
};

/** Citation stub (docs/09 §2.2). Always [] in 3.3; populated by Memory in 3.4. */
export type MemoryHitCitation = {
  memoryId: string;
  scope: MemoryScope;
  similarity: number;
  excerpt: string;
};

export type RouterMetadata = {
  provider: LlmProviderName;
  model: string;
  promptId: string;
  promptVersion: number;
  promptLibraryId?: string;
  memoryHits: MemoryHitCitation[];
  confidence?: 'high' | 'medium' | 'low';
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  requestId: string;
};

export type RouterResult<TOutput> = {
  output: TOutput;
  metadata: RouterMetadata;
};

/** Canonical AI error codes (docs/10 §9 error registry). */
export type RouterErrorCode =
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_STRUCTURED_OUTPUT_FAILED'
  | 'AI_TIMEOUT'
  | 'AI_CAPABILITY_UNKNOWN';

export class RouterError extends Error {
  constructor(
    readonly code: RouterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RouterError';
  }
}

/** Per-capability configuration (docs/09 §11 catalogue row). */
export type CapabilityConfig = {
  capability: Capability;
  module: string; // ai_usage_events.caller_module
  primary: LlmProviderName;
  fallback: LlmProviderName | null;
  /** Model id per provider, resolved against pricing.ts. */
  models: Partial<Record<LlmProviderName, string>>;
  streamingDefault: boolean;
  maxOutputTokens: number;
  temperature?: number;
  timeoutMs: number; // docs/09 §11.1
  /** Zod schema for structured-output capabilities (docs/09 §2.7); absent = freeform text. */
  outputSchema?: z.ZodType<unknown>;
  /** Per-request hard cost cap in USD (docs/09 §6.1). */
  hardMaxUsd: number;
};

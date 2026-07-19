import type { Capability, CapabilityConfig } from './types';

/**
 * Capability catalogue — code baseline config (docs/09 §2.3 step 1, §11).
 * Sprint 3.3 registers exactly ONE capability (summarize-thread) per the
 * approved scope; every other catalogue row is added by the sprint that ships
 * its feature. An unregistered capability is a typed AI_CAPABILITY_UNKNOWN
 * error, never a silent default.
 */
export const CAPABILITY_CONFIGS: Partial<Record<Capability, CapabilityConfig>> = {
  'summarize-thread': {
    capability: 'summarize-thread',
    module: 'personalization', // Module 4 (docs/09 §11)
    primary: 'anthropic',
    fallback: null, // OpenAI chat adapter is interface-only in 3.3 (decision #4)
    models: {
      anthropic: 'claude-sonnet-5',
      mock: 'mock-model',
    },
    streamingDefault: false, // docs/09 §11: summarize-thread streams off by default
    maxOutputTokens: 1024,
    temperature: 0.3,
    timeoutMs: 30_000, // draft-single class (docs/09 §11.1)
    hardMaxUsd: 0.05, // est. band $0.003–$0.01 (docs/09 §11) with headroom
  },
  // Embed-only capability (docs/09 §5.5): the generic memory writer. Shares the
  // Router's cost + logging + budget path minus generation. Landed Sprint 3.4.
  'embed-memory-generic': {
    capability: 'embed-memory-generic',
    module: 'memory',
    primary: 'openai', // text-embedding-3-small (docs/09 §5.1)
    fallback: null, // no embedding fallback in v0.1 (docs/09 §2.5)
    models: {
      openai: 'text-embedding-3-small',
      mock: 'mock-embedding',
    },
    streamingDefault: false,
    maxOutputTokens: 0, // embeddings produce no output tokens
    timeoutMs: 5_000, // embed-single class (docs/09 §11.1)
    hardMaxUsd: 0.02, // ~$0.00003/write (docs/09 §11) with wide headroom for batches
  },
  // ICP narrative embedder (docs/09 §5.5) — used by the Knowledge Indexer.
  // Separate capability so ICP indexing cost is attributable (docs/09 §5.7).
  // Landed Sprint 4.1.
  'embed-icp': {
    capability: 'embed-icp',
    module: 'knowledge',
    primary: 'openai',
    fallback: null,
    models: {
      openai: 'text-embedding-3-small',
      mock: 'mock-embedding',
    },
    streamingDefault: false,
    maxOutputTokens: 0,
    timeoutMs: 60_000, // embed-batch class (docs/09 §11.1) — a narrative is many chunks
    hardMaxUsd: 0.05, // batch of chunks; wide headroom over ~$0.00003/chunk
  },
  // Offer positioning/ROI embedder (docs/09 §5.5, docs/04 §10.7). Landed Sprint 4.2.
  'embed-offer': {
    capability: 'embed-offer',
    module: 'knowledge',
    primary: 'openai',
    fallback: null,
    models: {
      openai: 'text-embedding-3-small',
      mock: 'mock-embedding',
    },
    streamingDefault: false,
    maxOutputTokens: 0,
    timeoutMs: 60_000,
    hardMaxUsd: 0.05,
  },
  // Website-audit embedder (docs/09 §5.5, docs/04 §6) — the deterministic analysis
  // summary indexed under the frozen 'audit' memory scope. Landed Sprint 4.8.
  'embed-audit': {
    capability: 'embed-audit',
    module: 'website_intelligence',
    primary: 'openai',
    fallback: null,
    models: {
      openai: 'text-embedding-3-small',
      mock: 'mock-embedding',
    },
    streamingDefault: false,
    maxOutputTokens: 0,
    timeoutMs: 60_000, // an audit summary can be several chunks
    hardMaxUsd: 0.05,
  },
  // Revenue-target embedder (docs/09 §5.5, docs/04 §13.2) — a single short fact per
  // target, indexed under scope 'workspace' so AI can answer "what's our monthly
  // target?". Landed Sprint 4.7.
  'embed-target': {
    capability: 'embed-target',
    module: 'knowledge',
    primary: 'openai',
    fallback: null,
    models: {
      openai: 'text-embedding-3-small',
      mock: 'mock-embedding',
    },
    streamingDefault: false,
    maxOutputTokens: 0,
    timeoutMs: 5_000, // embed-single class (docs/09 §11.1) — one short fact
    hardMaxUsd: 0.02,
  },
  // Knowledge-document embedder (docs/09 §5.5, docs/04 §7.5). Landed Sprint 4.3.
  'embed-knowledge': {
    capability: 'embed-knowledge',
    module: 'knowledge',
    primary: 'openai',
    fallback: null,
    models: {
      openai: 'text-embedding-3-small',
      mock: 'mock-embedding',
    },
    streamingDefault: false,
    maxOutputTokens: 0,
    timeoutMs: 60_000,
    hardMaxUsd: 0.1, // docs can be long → many chunks
  },
};

export function getCapabilityConfig(capability: Capability): CapabilityConfig | null {
  return CAPABILITY_CONFIGS[capability] ?? null;
}

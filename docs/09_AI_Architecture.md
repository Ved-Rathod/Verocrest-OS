# 09 — AI Architecture

**Document:** AI Substrate — Model Router, Prompt Registry, Memory Retrieval, Embeddings, Cost Controls, HITL, Agent Layer Scaffolding, Observability, Failure Handling
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint — Core Engine First)
**Status:** Draft for approval
**Owner:** Founder / CTO / AI Systems Architect
**Depends on (frozen):** `01_Vision.md`, `02_Product_Requirements.md`, `03_System_Architecture.md`, `04_Database_Design.md`, `05_User_Flows.md`, `06_Feature_Modules.md`, `07_UI_UX_System.md`, `08_Design_System.md`
**Last updated:** 2026-07-01

---

## 0. How to read this document

This document defines **how AI is delivered** across Verocrest OS Version 0.1. It does not introduce new product functionality. Every capability documented here powers a feature already scoped in `06_Feature_Modules.md`.

- **Everything routes.** No feature code imports Anthropic or OpenAI SDKs directly (`AI-PROV-001`). All AI calls go through the **Model Router**.
- **Everything remembers.** Every AI call reads and writes to **AI Memory** (`AI-MEM-001, 002, 003`).
- **Everything is versioned.** Every AI call resolves a **Prompt Library** entry with a version pin, then logs the exact prompt hash used (`AI-XPL-005`).
- **Everything is metered.** Every AI call records tokens, cost, latency, provider, model, capability, workspace, agent (if any) into `ai_usage_events` (`04` §18.1).
- **Everything is human-in-the-loop.** Every AI output that leaves the workspace is a **draft** in v0.1 (`AI-HITL-001`). No autonomous action ships in v0.1.
- **Everything is failable, gracefully.** Every failure code in `05` §14 that starts with `F-AI-*` has a defined recovery here.

If a downstream implementation contradicts what is written here, this document wins until formally amended.

---

## 1. Substrate at a Glance

```
Feature code (Server Actions / Route Handlers / Inngest steps)
       │
       │  calls capability by name, never an SDK
       ▼
┌────────────────────────────────────────────────────────────┐
│                     MODEL ROUTER                           │
│  ┌────────────────────────────────────────────────────┐   │
│  │ 1. Resolve capability config                       │   │
│  │ 2. Resolve prompt via Prompt Registry              │   │
│  │    (workspace override → global default → code)    │   │
│  │ 3. Check workspace budget + cost policy            │   │
│  │ 4. withMemory: retrieve top-K by scope filter      │   │
│  │ 5. Assemble final prompt (system + retrieved ctx)  │   │
│  │ 6. Select provider (primary + fallback)            │   │
│  │ 7. Stream or await response with retry policy      │   │
│  │ 8. Parse + validate structured output (if applic.) │   │
│  │ 9. Log ai_usage_event + emit ai.output.produced    │   │
│  │ 10. Write learnings to Memory (fire-and-forget)    │   │
│  └────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
       │                              │
       │                              │
       ▼                              ▼
  Providers                     AI Memory Service
  ├── Anthropic (primary)        ├── pgvector (embeddings)
  ├── OpenAI (fallback +          ├── structured metadata
  │    structured extraction)     ├── memory_annotations
  └── OpenAI (embeddings)         └── knowledge_document_chunks

       ┌───────────────────────────────┐
       │  Agency Event Bus (Inngest)   │
       │  emits: ai.output.produced,   │
       │         outreach.draft.gen'd, │
       │         website.audit.done,   │
       │         proposal.drafted, ... │
       └───────────────────────────────┘
```

Six load-bearing subsystems, all in `packages/platform-ai-router/`:

- **Model Router** (§2)
- **Prompt Registry** (§3)
- **Memory Service** (§4)
- **Embeddings Service** (§5)
- **Cost Controls** (§6)
- **Agent Layer scaffolding** (§8) — dormant in v0.1

Plus cross-cutting: HITL enforcement (§7), Observability (§9), Failure Handling (§10).

---

## 2. Model Router

### 2.1 Purpose

Provider-agnostic entry point for every AI call in Verocrest OS. Feature code names *what it wants* (a capability); the Router picks *how to fulfill it* (which provider, which model, which prompt, which memory scope, which budget).

### 2.2 Public API

```typescript
type Capability =
  // Lead Intelligence (Module 2 / LIE)
  | 'score-lead'
  | 'embed-knowledge'
  | 'embed-icp'
  | 'embed-offer'
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

type RouterCall<TInput, TOutput> = {
  capability: Capability;
  input: TInput;
  workspaceContext: {
    workspaceId: string;
    actorUserId?: string;
    agentId?: string | null;   // v0.1: always null; scaffolding for Phase 3+
    requestId: string;
  };
  memory?: {
    scopes: MemoryScope[];
    subjectIds?: string[];
    topK?: number;
    minSimilarity?: number;
  };
  streaming?: boolean;                    // default per capability
  promptVersionPin?: number;               // override prompt resolution
  modelOverride?: string;                  // rare: force a model
};

type RouterResult<TOutput> = {
  output: TOutput;                        // parsed + validated
  metadata: {
    provider: 'anthropic' | 'openai' | 'groq';
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
};

async function callCapability<I, O>(
  call: RouterCall<I, O>
): Promise<RouterResult<O>>;
```

### 2.3 Resolution pipeline (10 steps)

Each call passes through the pipeline in this fixed order. Any step can short-circuit (budget rejection, memory-empty warning) without breaking the contract.

| Step | Action | Reference |
|---|---|---|
| 1 | Load capability config from the code baseline | §11 catalogue |
| 2 | Resolve prompt: workspace override → global default → code baseline | §3.4 resolution chain |
| 3 | Check cost policy: workspace monthly budget, per-capability cap, per-request cap | §6 |
| 4 | If `memory.scopes` present: retrieve top-K via `withMemory` | §4 |
| 5 | Assemble final prompt: system message + user template + variables filled + retrieved context injected | §3.2 anatomy |
| 6 | Select provider: primary (from capability config), fallback ready | §2.5 provider selection |
| 7 | Execute: stream tokens OR await full response; abortable | §2.6 execution |
| 8 | Parse structured output (Zod validate); on schema failure retry with structured-output enforcement | §2.7 structured output |
| 9 | Log to `ai_usage_events`; emit `ai.output.produced` on Agency Event Bus | §9 |
| 10 | Fire-and-forget: write learnings to Memory (`AI-MEM-003`) | §4.6 |

### 2.4 Timing invariants

Per `NFR-PERF-005, 006`:

| Capability class | First token | Complete | Router overhead budget |
|---|---|---|---|
| Single-step draft (outreach, Loom script, meeting summary, classify) | < 1.5s | < 15s P95 | Router adds < 200ms |
| Multi-step (website audit, proposal) | < 3s | < 90s P95 | Router adds < 300ms |
| Embedding batch (per chunk) | — | < 500ms | — |

Router overhead includes: config lookup (< 5ms), prompt resolution (< 20ms cached), budget check (< 10ms), memory retrieval (< 150ms), provider dispatch (< 20ms).

### 2.5 Provider selection

Two providers funded at MVP (`03` §3.11): **Anthropic Claude Sonnet 5** (primary) and **OpenAI GPT-class** (fallback + structured extraction). Selection rules:

**Per-capability primary + fallback** (documented in §11):

- Draft-heavy capabilities (outreach, Loom script, proposal, meeting summary) → **Anthropic primary**, OpenAI fallback
- Structured-strict capabilities (score-lead, classify-reply, audit-website, classify-company-suggestion, recommend-offer) → **OpenAI primary** (Structured Outputs mode), Anthropic fallback with tool-use for the schema
- Embeddings → **OpenAI `text-embedding-3-small`** (1536 dim per `04` §7.1), no fallback in v0.1

**Failover triggers:**
- Provider returns 5xx or timeout → immediate fallback attempt (same request)
- Provider returns malformed structured output twice → fallback to secondary provider with structured-output enforcement
- Provider hits rate limit → queue-and-retry with exponential backoff (max 3 attempts across providers)

**Failover is transparent to the caller.** The Router's return value carries the actually-used provider in `metadata.provider` for observability, but the caller's contract is unchanged.

**Provider override** (`modelOverride`) is reserved for evaluation runs; not used in normal feature code.

### 2.6 Execution modes

**Streaming (default for user-facing draft dialogs):**
- Server-Sent Events (SSE) via Next.js Route Handler
- Chunks flushed as they arrive from the provider
- Caller aborts by closing the SSE connection; Router forwards `AbortSignal` to provider SDK
- Partial content preserved on mid-stream failure

**Awaited (default for background jobs, embeddings, classifications):**
- Full response returned once complete
- Inngest step timeout: capability-specific (see §11)

**Batch (embeddings):**
- Router exposes `embedBatch(capability, texts[])` which chunks internally to fit provider batch limits (OpenAI: 2048 inputs / call, 8192 tokens each)

### 2.7 Structured output enforcement

For capabilities whose contract is a typed object (score, classify, findings list, recommendation), the Router enforces schema conformance:

1. Attach a Zod schema at capability config
2. If provider supports native structured outputs (OpenAI's `response_format: { type: 'json_schema', ... }`): use it
3. Otherwise (Anthropic path): use tool-use / function calling with the schema
4. Parse response with the Zod schema
5. On parse failure: **retry once** with more explicit "reply strictly matching this schema" system message
6. On second failure: **fallback provider** with structured mode
7. On third failure: surface `F-AI-DRAFT-001` / capability-specific failure to caller

Never return unparseable content upstream. Router's contract is: structured output means structured output.

### 2.8 Streaming for structured output

For capabilities that stream *and* return structured output (e.g. drafts that must satisfy a schema), the Router uses:

- **Anthropic:** partial JSON streaming with our own JSON stream parser
- **OpenAI:** Structured Outputs with streaming

Callers receive partial JSON as it stabilizes; the final validated object is returned in the completion callback.

### 2.9 Router internals: caching

- **Prompt resolution:** LRU-cached per (workspace_id, capability, version) for 60 seconds; invalidated on `prompt_library.upserted` event
- **Capability config:** loaded on server start; hot-reloaded on file change in dev
- **Model cost table:** loaded on server start from `packages/platform-ai-router/pricing.ts`; refreshed daily via cron
- **No response caching in v0.1.** Every call is fresh. Response caching (by input hash + prompt version) is a Phase 2+ optimization; a stub interface exists but returns miss always.

---

## 3. Prompt Registry

### 3.1 Purpose

Prompts are versioned, resolvable data — not string constants scattered through feature code. The Registry is the layer that turns a capability call into a concrete prompt.

### 3.2 Prompt anatomy

Every prompt (whether in `prompt_library` DB row or code baseline) has this shape:

```typescript
type PromptEntry = {
  id: string;                          // stable slug, e.g. 'draft-outreach-email-v3'
  key: string;                         // capability slug, e.g. 'draft-outreach-email'
  version: number;                     // monotonically increasing
  capability: Capability;              // Router capability id
  systemMessage?: string;              // provider-agnostic system prompt
  template: string;                    // Mustache-lite variables: {{lead.name}}, {{audit.top_finding}}
  variables: PromptVariable[];         // declared inputs
  expectedSchema?: JsonSchema;         // for structured output
  examples?: FewShotExample[];         // optional
  modelHint?: string;                  // 'anthropic:claude-sonnet-5', 'openai:gpt-4.1', ...
  providerHint?: 'anthropic' | 'openai' | 'groq';
  temperature?: number;                // default per capability
  maxOutputTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  changelog?: string;
  createdBy?: string;
  createdAt: string;
};

type PromptVariable = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  example?: unknown;
};
```

Prompt shape matches `04` §18.3 `prompt_library` columns exactly.

### 3.3 Prompt storage tiers

| Tier | Location | Editable by | Purpose |
|---|---|---|---|
| **Workspace override** | `prompt_library` where `workspace_id = X` | Workspace ops only via `app_role_admin` in v0.1 (read-only viewer for members per `07` §8) | Per-workspace fine-tuning; Phase 2 gains an editor |
| **Global default** | `prompt_library` where `workspace_id IS NULL` | `app_role_admin` (product team, seeded via `prompt_library_seed.sql`) | Curated defaults that ship with the product |
| **Code baseline** | `packages/platform-ai-router/prompts/<key>-v<n>.ts` | Engineers via PR | Last-resort fallback if DB rows are missing; ships every release |

### 3.4 Resolution chain

For every Router call:

```
1. Query prompt_library for the workspace-scoped active default:
     SELECT * FROM prompt_library
     WHERE workspace_id = $workspace AND key = $capability
       AND active = TRUE AND is_default = TRUE AND deleted_at IS NULL
     ORDER BY version DESC LIMIT 1;

2. If nothing → query global default:
     SELECT * FROM prompt_library
     WHERE workspace_id IS NULL AND key = $capability
       AND active = TRUE AND is_default = TRUE AND deleted_at IS NULL
     ORDER BY version DESC LIMIT 1;

3. If nothing → load code baseline from packages/platform-ai-router/prompts.

4. If nothing exists in any tier → hard error at capability config load time
   (build-time check ensures every capability has a code baseline).
```

Resolution is cached for 60s (§2.9).

### 3.5 Version pinning

- Every Router call records the resolved `promptId` + `promptVersion` in `ai_usage_events`
- Callers may pin a specific version via `RouterCall.promptVersionPin`; used for evaluation and A/B testing (Phase 2+)
- Bumping a prompt to `active=true, is_default=true` is a deliberate act (admin console); prior versions remain queryable

### 3.6 Variable substitution

Prompts use a Mustache-lite syntax:

- `{{variable}}` — direct substitution (escaped for the target format)
- `{{#section}}...{{/section}}` — conditional (renders if section is truthy)
- `{{#list}}{{item}}{{/list}}` — iteration (item is scoped to the block)

Substitution is done **after** memory retrieval so retrieved context can be injected as variables (`{{memory.audit_summary}}`).

### 3.7 System messages

Every prompt has three components in the assembled final message:

1. **Product system message** — invariant across all prompts; sets brand voice, safety rules, HITL disclosure
2. **Capability system message** — from `PromptEntry.systemMessage`; capability-specific persona and constraints
3. **Retrieved context** — memory hits formatted with source citations (`[source-1]`, `[source-2]`, ...)

The product system message includes (paraphrased): "You are an assistant inside Verocrest OS. Every output you produce will be reviewed by a human before it leaves the workspace. Cite sources with [source-N] tags. If asked to do something outside scope, decline and suggest the appropriate action."

### 3.8 Few-shot examples

Optional per prompt. When present, injected as prior conversation turns (Anthropic messages array; OpenAI messages array). Example structure:

```typescript
type FewShotExample = {
  input: Record<string, unknown>;      // variables
  output: unknown;                     // expected output (schema-conformant)
  notes?: string;                      // not injected; documentation only
};
```

Rule of thumb: 1–3 examples per prompt for classification tasks; 0–1 for drafts (too many biases the tone).

### 3.9 Prompt Library viewer (v0.1 UI)

Per `07` §8 Settings > AI (read-only viewer, per user selection at Module 6 checkpoint):

- List capabilities × active prompt (source: workspace / global / code)
- Click → modal showing template, system message, expected schema, resolution chain, version history
- No editing in v0.1
- Editing UI is Phase 2

### 3.10 Evaluation harness (Phase 2 scaffolding)

The evaluation harness is out of MVP scope but the data model supports it:

- Golden datasets stored as fixtures in `packages/platform-ai-router/evals/<capability>/`
- Runs on every AI-touching PR in CI (regression prevention)
- Per-capability metrics: structured-output pass rate, cost, latency, human-preference score (later)
- Extends to production sampled comparisons in Phase 3+

### 3.11 Prompt security

- **Never** interpolate raw user input into system messages; only into user messages via structured variables
- Every string variable is escaped for the target format (JSON injection, prompt injection defense)
- Long user inputs (notes, discovery call transcripts) are wrapped in delimiter tags: `<user_input>...</user_input>` with explicit instructions to treat contents as data, not instructions
- Known jailbreak patterns are pattern-matched at the Router boundary and stripped (basic defense; full anti-jailbreak strategy is Phase 3+)

---

## 4. Memory Retrieval

### 4.1 Purpose

Every AI call inherits **workspace context** — the sum of what has been learned so far. Memory is the substrate through which that context is delivered.

### 4.2 The `withMemory` wrapper

The only public retrieval path. Feature code never queries `memory_vectors` directly:

```typescript
type MemoryRequest = {
  workspaceId: string;                 // enforced via GUC + explicit filter
  scopes: MemoryScope[];               // ['contact', 'company', 'audit', 'icp', 'offer', 'knowledge_doc', 'workspace']
  subjectIds?: string[];               // narrow scope filter
  queryText?: string;                  // will be embedded
  queryEmbedding?: number[];           // pre-computed embedding
  topK: number;                        // per-request cap
  minSimilarity?: number;              // cosine similarity threshold, default 0.55
  excludeSources?: string[];           // memory ids to skip (e.g. one that was just written)
  agentId?: string | null;
};

type MemoryHit = {
  id: string;
  scope: MemoryScope;
  subjectId?: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  agentId?: string | null;
};

async function withMemory(req: MemoryRequest): Promise<MemoryHit[]>;
```

### 4.3 Scope allow-lists per capability

Each capability declares which memory scopes are permitted. Enforces least-privilege retrieval and prevents cross-context leakage.

| Capability | Allowed scopes | Default topK | Min similarity |
|---|---|---|---|
| `score-lead` | `contact`, `company`, `audit`, `icp` | 6 | 0.55 |
| `audit-website` | `workspace`, `icp` | 4 | 0.50 |
| `generate-loom-script` | `audit`, `workspace` (brand voice) | 4 | 0.50 |
| `draft-outreach-email` | `contact`, `company`, `audit`, `icp`, `offer`, `knowledge_doc`, `workspace` | 8 | 0.60 |
| `draft-outreach-ig-dm` | `contact`, `company`, `audit`, `offer`, `workspace` | 5 | 0.60 |
| `draft-outreach-linkedin-dm` | `contact`, `company`, `audit`, `offer`, `workspace` | 5 | 0.60 |
| `classify-reply` | `contact` (recent interactions only) | 3 | 0.60 |
| `summarize-thread` | none (input is self-contained) | 0 | — |
| `draft-proposal` | `contact`, `company`, `audit`, `icp`, `offer`, `knowledge_doc`, `workspace` | 12 | 0.55 |
| `regenerate-proposal-section` | same as `draft-proposal` | 8 | 0.55 |
| `summarize-meeting` | `contact`, `company`, `deal` | 3 | 0.50 |
| `recommend-offer` | `icp`, `offer`, `company`, `audit`, `knowledge_doc` | 8 | 0.60 |
| `classify-company-suggestion` | `company` (candidate matches only) | 5 | 0.55 |
| `embed-*` | none (writers only) | — | — |

**Scope leakage is impossible by construction.** The Router refuses a scope not in the capability's allow-list.

### 4.4 Retrieval query

Canonical SQL query, filters applied in order:

```sql
SELECT id, scope, subject_id, content, metadata, agent_id,
       1 - (embedding <=> $query_embedding::vector) AS similarity
FROM memory_vectors
WHERE workspace_id = $workspace_id                     -- RLS also enforces
  AND scope = ANY($scopes)
  AND (subject_id = ANY($subject_ids) OR subject_id IS NULL OR $subject_ids IS NULL)
  AND (ttl_at IS NULL OR ttl_at > now())
  AND id != ALL(COALESCE($exclude_ids, '{}'::uuid[]))
ORDER BY embedding <=> $query_embedding::vector
LIMIT $top_k * 3;                                      -- oversample for annotation filtering
```

### 4.5 Annotation application

After raw retrieval, `memory_annotations` are applied:

1. **Never apply:** memories marked `never_apply` for this capability are dropped
2. **Always apply:** memories marked `always_apply` for this capability are unioned into results even if below similarity threshold
3. **Boost / suppress:** future extension; ignored in v0.1

Final result is truncated to `topK`.

### 4.6 Fire-and-forget writes

Per `AI-MEM-003`, every AI operation writes to Memory after producing output. Writes are:

- **Non-blocking:** dispatched as an Inngest event `memory.write.requested`; failure does not fail the calling Router call
- **Deduped by `content_hash`:** if the same content was written recently for the same scope + subject, skip
- **Metadata-rich:** every write carries the capability, prompt id + version, request id, and (Phase 3+) agent id
- **Scoped correctly:** written to the tightest applicable scope (contact-level for a personalization draft; workspace-level for a brand voice correction)

Writes that don't add signal (e.g. a duplicate summarization of the same input) are silently dropped by the deduper.

### 4.7 Retrieval performance

- P95 latency budget: 150ms end-to-end (embedding generation + vector search + annotation filter)
- Query embedding cached per (workspace_id, capability, content_hash) for 5 minutes to avoid re-embedding regenerations
- HNSW index configured with `ef_search = 40` (default), tunable per capability if needed
- If retrieval budget is exceeded, log warning and proceed with what was returned (no cascading delay)

### 4.8 Cold-start behavior

A new workspace has an empty memory. Retrieval returns zero hits. The Router:

- Proceeds with the prompt using only base context (no memory injection)
- Sets `metadata.memoryHits = []`
- Surfaces "limited context" in the AI Trace panel (`F-AI-DRAFT-003`, `07` §17)

Onboarding items (ICP, KB docs, Offers) exist explicitly to warm this substrate before real leads arrive.

### 4.9 Retrieval provenance in Trace panel

Every returned `MemoryHit` becomes a source citation in the AI Trace panel (`07` §8.3):

- Type label (Contact / Company / Audit / KB doc / ICP / Offer)
- Human-readable source label (contact name, doc title, audit URL)
- Clickable link to the source entity
- Similarity score (rounded to 2 decimals)

The `[source-N]` tags produced by the AI in its output link back to the same hits.

---

## 5. Embeddings

### 5.1 Model choice

**`text-embedding-3-small`** (OpenAI), 1536 dimensions, per `04` §7.1 approved.

**Rationale:**
- Cost: ~$0.02 per million tokens — the cheapest OpenAI embedder at good quality
- Quality: adequate for the workspace-scoped retrieval Verocrest OS needs (not high-recall academic search)
- Latency: sub-100ms per single input; batch friendly
- Dimensionality (1536) matches `04` `vector(1536)` column
- Migration path preserved: if we upgrade to `text-embedding-3-large` (3072) or a different provider, we re-embed via a documented backfill

### 5.2 Chunking strategy

**Default: 500 tokens per chunk, 100-token overlap** (per `05` §3.5 approved).

- Enforced by the LIE Knowledge Indexer for `knowledge_documents`, `offers.positioning + roi_narrative`, `icps.narrative`
- Chunks stored in `knowledge_document_chunks` with `char_start`, `char_end`, `chunk_index`
- Corresponding `memory_vectors` rows carry `metadata: { chunk_index, doc_title, doc_type, section }`
- **Sentence boundary preservation:** chunker rounds to the nearest sentence boundary within ±50 tokens of the target
- **Structural preservation:** headings are duplicated into the chunk immediately following (single-heading redundancy improves retrieval accuracy on outline-heavy docs)

### 5.3 Batching

Router's `embedBatch` groups inputs to OpenAI's per-request cap. For workspaces with large KB uploads:

- Batch size: 100 inputs per call
- Cost logged per batch, attributed to the calling capability
- Progress emitted as `knowledge_doc.indexing.progress` events for large docs

### 5.4 Two-phase swap on re-index

Per `04` §7.5 and `06` §3.12 — no retrieval gap during re-index:

1. Compute new content_hash for the source (knowledge_doc / offer / icp)
2. If unchanged → no-op
3. If changed:
   - a. Chunk + embed the new version
   - b. Insert new `knowledge_document_chunks` + `memory_vectors` rows (new content_hash)
   - c. Update source row: `is_indexed = true`, `last_indexed_at = now()`
   - d. Delete old chunks + old memory_vectors matching the prior content_hash
   - e. Emit `knowledge_doc.indexed` / `offer.indexed` / `icp.indexed`
4. Steps b → d wrapped in an Inngest step so retrieval during the window still returns old chunks; the deletion in (d) is atomic once (b) is durable.

### 5.5 Embed-only capabilities

The Router exposes `embed-*` capabilities that skip generation entirely:

- `embed-knowledge` — for KB doc chunks
- `embed-icp` — for ICP narratives
- `embed-offer` — for offer positioning
- `embed-memory-generic` — for miscellaneous memory writes (fire-and-forget from other capabilities)

These share the same Router pipeline (cost, logging, workspace context) minus generation.

### 5.6 Embedding failure

- Provider timeout on a single embed → retry once with backoff
- Persistent failure → source stays `is_indexed = false`; retry banner in UI (`F-AI-INDEX-001`)
- Partial batch failure → successful embeds are committed; failed ones re-queued individually

### 5.7 Cost visibility

Embedding cost aggregated separately from generation cost in `ai_usage_events.capability`. Dashboard cost tile (Settings > AI Usage) breaks out:

- Generation cost (drafts, classifications, audits)
- Embedding cost (KB indexing, offer indexing, ICP indexing)
- Router-side memory retrieval cost (query embeddings)

---

## 6. AI Cost Controls

### 6.1 Budgeting model

- **Per-workspace monthly budget:** `workspaces.ai_budget_monthly_usd` (`04` §3.1), default $200/month for internal workspaces
- **Per-capability soft cap:** each capability declares an expected cost band (per-call min / max USD); Router logs but does not block on cap unless it exceeds `capability.hardMaxUsd`
- **Per-request cap:** `capability.hardMaxUsd` — refuses to run if the estimated cost (based on input tokens × model output cap) exceeds

### 6.2 Cost gating flow

```
For every Router call:
  1. Sum ai_usage_events.cost_usd for this workspace, this month
  2. If sum >= workspace.ai_budget_monthly_usd:
       - Return AI_BUDGET_EXCEEDED error (F-AI-DRAFT-002 / F-AUDIT-006)
       - Do NOT execute the model call
  3. If sum >= 0.80 * budget AND no warning shown in last 4h:
       - Emit workspace-level notification with category 'system'
       - Continue execution
  4. Execute call; log actual cost
  5. If actual cost > estimated cost * 3 (anomaly):
       - Emit alert to observability (Axiom + Sentry)
```

### 6.3 Estimated cost calculation

`estimated_cost_usd = (input_tokens × model.input_price) + (output_token_budget × model.output_price)`

Where:
- `input_tokens` = tokenizer count of assembled final prompt (system + user + memory hits + examples)
- `output_token_budget` = `capability.maxOutputTokens` or `prompt.maxOutputTokens`
- `model.input_price` / `output_price` = per-million-token pricing from `pricing.ts`

Tokenizer: provider-specific (Anthropic tokenizer for Claude prompts, OpenAI tiktoken for GPT prompts). Cached per-capability per model.

### 6.4 Pricing table

Maintained in `packages/platform-ai-router/pricing.ts`. Structure:

```typescript
type ModelPricing = {
  provider: 'anthropic' | 'openai' | 'groq';
  model: string;
  inputPricePerMillion: number;        // USD
  outputPricePerMillion: number;
  cachedInputPricePerMillion?: number; // provider-side prompt caching
  contextWindow: number;
  effectiveDate: string;               // "2026-07-01"
};
```

Reviewed monthly; updated when provider prices change.

### 6.5 Prompt caching

Where providers support it (Anthropic prompt caching, OpenAI cached input pricing), the Router marks reused prompt prefixes (product system message, capability system message) as cacheable. Reduces marginal cost significantly for high-volume capabilities (audit, draft, embed).

### 6.6 Cost dashboards

Per `06` §5.10 Settings > AI Usage:

- Rolling monthly spend by capability + model
- Budget cap indicator + 80% warning
- Cost-per-capability trend (last 30 days)
- Top-spending workspaces (global admin only)

Data source: `ai_usage_daily` (`04` §18.2), refreshed nightly + on every AI call for the current day.

### 6.7 Cost anomaly detection

Cron nightly:

- For each capability × workspace: compute rolling 30-day median cost per call
- If today's median > 2× rolling median: emit `system` notification and alert Axiom
- Guards against a prompt regression or provider price surprise

---

## 7. Human-in-the-Loop (HITL)

### 7.1 v0.1 invariants (non-negotiable)

Per `AI-HITL-001` through `005`, in v0.1:

1. **No AI output leaves the workspace without explicit human action.** Sending an email, sending a proposal, copying a DM, marking a proposal signed — all require a click.
2. **Every AI output has a confidence signal** (`AI-HITL-002`) — `high` / `medium` / `low` — self-reported by the model per prompt design.
3. **Every AI output is inspectable** (`AI-HITL-003`) — inputs, prompt id + version, memory hits, model, cost — all logged and surfaced in the AI Trace panel.
4. **Autonomy tier promotion is gated** (`AI-HITL-004`) — for v0.1, all agents are dormant at `assist` tier; promotion to `automate` or `autonomous` is Phase 3+ with data-backed criteria.
5. **Every autonomous action is reversible** (`AI-HITL-005`) — irrelevant in v0.1 (no autonomous actions); the reversibility column exists so future Automate-tier actions can be one-click undone.

### 7.2 Confidence signal design

Every prompt whose output supports confidence includes an instruction:

> Rate your confidence in this output as `high`, `medium`, or `low`. Use `low` when the retrieved context is thin or contradictory, `medium` when reasonable inference was required, `high` when the answer is well-supported by evidence.

The Router parses the confidence field from structured output (or extracts it from a `<confidence>...</confidence>` block for freeform outputs) and returns it in `RouterResult.metadata.confidence`.

**Confidence is not a probability.** It's a self-report calibrated by prompt design. Poor calibration is caught in the evaluation harness (Phase 2) and corrected via prompt revision.

### 7.3 Explainability payload

Every output includes (per `AI-XPL-005`):

- `memoryHits` — the retrieval provenance (§4.9)
- `confidence` — self-reported (§7.2)
- `topSignals` (for scoring capabilities) — plain-language list of what drove the output
- `citations` — inline `[source-N]` tags in generated text, resolved to memory hit ids

This payload is persisted alongside the output row (e.g., `outreach_messages.citations`, `lead_scores.explainability`, `audit_findings.evidence`).

### 7.4 AI Trace panel contract (renders to spec in `07` §8.3)

The Router populates a trace object that the UI renders without transformation. Fields:

```typescript
type AiTrace = {
  provider: string;
  model: string;
  promptId: string;
  promptVersion: number;
  promptSource: 'workspace' | 'global' | 'code';
  memoryHits: {
    scope: string;
    subjectLabel: string;
    subjectHref: string;
    similarity: number;
  }[];
  confidence: 'high' | 'medium' | 'low';
  confidenceRationale?: string;
  costUsd: number;
  latencyMs: number;
  requestId: string;
  reasoning?: string;
};
```

### 7.5 Autonomy tier promotion criteria (deferred, documented)

For Phase 3+ when specific capabilities are promoted to `automate` tier:

- ≥ 1000 completed actions at Assist tier for the capability
- < 2% correction rate (measured via `outreach.draft.rejected` for drafting, human overrides for classification)
- Explicit workspace owner opt-in
- Autonomous tier requires an additional 3 months at Automate tier

None of this is active in v0.1; the tables and columns exist per `04` §17.

---

## 8. Agent Layer Scaffolding (dormant in v0.1)

Per `03` §7.6, agent primitives exist in v0.1 even though no agents ship. Every Router call already accepts an `agentId` field (null in v0.1); Memory writes carry `agent_id`; Action Log has agent columns; `agent_policy_envelopes` table exists with `active = false` on any row.

### 8.1 Agent runtime pattern (Phase 3+)

When agents ship:

```
Feature or Event Bus
       │
       ▼
Agent Runtime (packages/platform-agent-runtime, Phase 3)
   1. Load agent from agent_registry
   2. Load workspace's agent_policy_envelope for this agent
   3. Check tier constraints (Assist / Automate / Autonomous)
   4. Check budget envelope (daily $ cap)
   5. Check channel + domain + business-hours envelope
       │
       ▼
Model Router (existing) with agent_context = { agent_id, tier, envelope_id }
       │
       ▼
Action Log write with agent_id, autonomy_tier, reversibility
       │
       ▼
Agency Event Bus emit: agent.action.executed
       │
       ▼
Reversibility handler (if tier > assist): register a reverse action
```

Nothing above is v0.1 code. The **hooks are v0.1** (columns, table, Router field, event name); the runtime is Phase 3+.

### 8.2 Agent evaluation harness (Phase 3+)

Every agent that ships passes through the same evaluation pattern as prompts:

- Golden datasets per role (SDR, PM, CS, QA, Ops per Vision §4.6)
- Success criteria per action class (draft accepted, meeting booked, deal advanced)
- Escalation rate < X% before tier promotion

### 8.3 Escalation surface

Every agent has a canonical "ask a human" primitive that routes to the Notifications surface with `category = 'agent_escalation'` (already in enum per `04` §14). In v0.1: unused. Phase 3+: primary trust-building signal — agents that escalate more get promoted faster.

---

## 9. Observability

### 9.1 Per-call telemetry

Every Router call writes one row to `ai_usage_events` (`04` §18.1):

```
workspace_id, request_id, capability, provider, model,
input_tokens, output_tokens, cost_usd, latency_ms,
caller_module, agent_id, prompt_id, prompt_version, prompt_library_id,
status ('ok' | 'error' | 'timeout'), error jsonb, occurred_at
```

Plus emits `ai.output.produced` event (`03` §8.3) with a subset of the same data.

### 9.2 Aggregation

Nightly cron rolls `ai_usage_events` → `ai_usage_daily` (`04` §18.2):

- Total calls / cost / tokens for the day
- Breakdowns: `by_capability`, `by_model`, `by_agent`
- Powers Settings > AI Usage dashboard

### 9.3 Request-ID propagation

Per `NFR-OBS-001, 003`:

- Middleware sets `app.request_id` on every request
- Router includes `request_id` in every log entry, event emission, and downstream call
- Provider SDK calls tag `x-request-id` header where supported

### 9.4 Structured logs

Every Router call emits an Axiom-ingested log entry with:

- `request_id`, `workspace_id`, `capability`, `provider`, `model`, `prompt_id`, `prompt_version`
- `input_tokens`, `output_tokens`, `cost_usd`, `latency_ms`
- `memory_hits_count`, `memory_hits_similarity_avg`
- `confidence` (when applicable)
- `status`, `retry_count`, `fallback_used` (boolean)

### 9.5 Prompt hash logging

Every call logs `prompt_hash = sha256(system + template + variables_resolved)` so identical inputs produce identical hashes. Enables reproducibility audits: "show me every time we used prompt X on inputs like Y."

### 9.6 Alerts

Sentry + Axiom (`03` §3.17):

- **Error rate > 1%** of Router calls in 5-min window → page founder
- **P95 latency > 2× SLO** for any capability → page founder
- **AI cost > 2× rolling 7-day average** for a workspace → email + Axiom
- **Provider failover rate > 10%** in 5-min → warn (potential upstream incident)
- **Structured-output failure rate > 3%** for a capability → warn (prompt regression suspected)

### 9.7 Reproducibility

Given `request_id`, we can reconstruct:

- The exact prompt sent (via `prompt_id + prompt_version` in `ai_usage_events`)
- The exact memory hits used (via retrieval trace stored on the domain row, e.g. `outreach_messages.citations`)
- The exact model + provider
- The cost + latency
- The parsed output (persisted on the domain row)

Meets `AI-XPL-005` requirement.

---

## 10. AI Failure Handling

Every `F-AI-*` failure code from `05` §14 has a defined recovery in the Router.

### 10.1 Provider outage

**`F-AI-DRAFT-001` — both providers unavailable.**

Router chain:
1. Primary provider returns 5xx / timeout → attempt fallback within same request
2. Fallback fails → return `AI_PROVIDER_UNAVAILABLE` error with 60s cooldown hint
3. UI shows "Try again in 60s"; partial content preserved (streaming case)

Server-side: `ai_usage_events.status = 'error'`; alert threshold at fleet-wide error rate.

### 10.2 Budget exceeded

**`F-AI-DRAFT-002` / `F-AUDIT-006`.**

Router refuses the call before dispatching:

- Return `AI_BUDGET_EXCEEDED` with `{ currentSpend, budget, capability }`
- UI shows top-up dialog; capability button disabled
- `ai_usage_events` records the refusal (status = 'error', error = { code: 'BUDGET_EXCEEDED' })

### 10.3 Empty memory retrieval

**`F-AI-DRAFT-003` — cold workspace or narrow scope produces zero hits.**

Router:
- Proceeds with prompt (no memory injection)
- Sets `metadata.memoryHits = []`
- Sets `metadata.warnings = ['limited_context']`
- UI shows "Limited context — this draft has less grounding than usual"

Not an error; a degraded-but-functional state.

### 10.4 Structured output malformed

**`F-AUDIT-004` and analogous for other structured capabilities.**

Router:
1. Parse response with Zod schema
2. On failure: retry once with more explicit "reply strictly matching this schema" system message
3. On second failure: switch to fallback provider with structured mode
4. On third failure: surface capability-specific error to caller (e.g., audit marked failed; user offered "start from blank template" fallback)

Fleet-wide fallback rate > 3% for a capability triggers a Sentry alert (§9.6) — indicates prompt regression.

### 10.5 Stream interrupted

**`F-AI-DRAFT-001` mid-stream variant.**

Partial content preserved in a scratch buffer (in-memory on the Route Handler; not persisted). UI:
- Shows accumulated content
- Offers "Retry" (Router re-runs full call; does not attempt to resume from mid-stream — providers don't support it reliably)

### 10.6 Rate limit

**Not user-facing; handled internally.**

Router:
- Detect provider 429 → exponential backoff (500ms, 1s, 2s)
- Try fallback provider after 2 retries on primary
- If all retries exhausted → `F-AI-DRAFT-001`

Backoff never exceeds capability timeout budget (§11).

### 10.7 Timeout

**Capability-specific timeout enforced by Router.**

- Router aborts the provider call at the timeout
- Emits `ai_usage_events` with `status='timeout'`
- Returns `AI_TIMEOUT` to caller
- Streaming case: whatever was streamed is preserved for caller

### 10.8 Reply classification failure

**`F-REPLY-003` — sentiment / intent classification returns malformed output.**

Router falls back to `sentiment = 'neutral'`, `intent = 'unclassified'`. Downstream code (Relationship Profile update, Outreach Queue re-rank) handles the neutral case gracefully.

### 10.9 Memory write failure

**Not user-facing; fire-and-forget.**

- Inngest retries the memory write with backoff
- After 3 failures: log to Axiom and drop
- Missing memory writes degrade future retrieval but do not fail the current request

---

## 11. Capability Catalogue

The concrete list of AI capabilities in v0.1, with model + prompt + retrieval config per capability. Sourced from module specs in `06`.

Every row obeys the following defaults unless overridden:
- Streaming: **on** for user-facing drafts, **off** for structured / background
- Primary → fallback pattern per `03` §3.11
- Memory scope per §4.3 allow-list
- HITL: always (v0.1 invariant)

| Capability | Module | Primary Model | Fallback | Streaming | Structured Output | Est. Cost / Call |
|---|---|---|---|---|---|---|
| `score-lead` | 2 | OpenAI GPT-4.1-mini (Structured Outputs) | Anthropic Claude Sonnet 5 (tool-use) | off | yes | $0.002–$0.008 |
| `embed-knowledge` | 2 | OpenAI text-embedding-3-small | — | off | — | ~$0.00003 / chunk |
| `embed-icp` | 2 | OpenAI text-embedding-3-small | — | off | — | ~$0.00003 / chunk |
| `embed-offer` | 2 | OpenAI text-embedding-3-small | — | off | — | ~$0.00003 / chunk |
| `embed-memory-generic` | any | OpenAI text-embedding-3-small | — | off | — | ~$0.00003 / write |
| `classify-company-suggestion` | 2 | OpenAI GPT-4.1-mini | Anthropic Claude Haiku | off | yes | $0.001–$0.003 |
| `audit-website` | 3 | Anthropic Claude Sonnet 5 | OpenAI GPT-4.1 | off (multi-step) | yes (findings list) | $0.05–$0.20 |
| `generate-loom-script` | 3 | Anthropic Claude Sonnet 5 | OpenAI GPT-4.1 | on | no | $0.005–$0.02 |
| `draft-outreach-email` | 4 | Anthropic Claude Sonnet 5 | OpenAI GPT-4.1 | on | no (freeform text) | $0.01–$0.04 |
| `draft-outreach-ig-dm` | 4 | Anthropic Claude Sonnet 5 | OpenAI GPT-4.1 | on | no | $0.005–$0.02 |
| `draft-outreach-linkedin-dm` | 4 | Anthropic Claude Sonnet 5 | OpenAI GPT-4.1 | on | no | $0.005–$0.02 |
| `classify-reply` | 4 | OpenAI GPT-4.1-mini | Anthropic Claude Haiku | off | yes (sentiment + intent) | $0.001–$0.003 |
| `summarize-thread` | 4 | Anthropic Claude Sonnet 5 | OpenAI GPT-4.1-mini | off | no | $0.003–$0.01 |
| `draft-proposal` | 5 | Anthropic Claude Sonnet 5 | OpenAI GPT-4.1 | on (section-by-section) | partial (structured section metadata) | $0.10–$0.40 |
| `regenerate-proposal-section` | 5 | Anthropic Claude Sonnet 5 | OpenAI GPT-4.1 | on | no | $0.01–$0.05 |
| `summarize-meeting` | 5 | Anthropic Claude Sonnet 5 | OpenAI GPT-4.1-mini | off | no | $0.003–$0.01 |
| `recommend-offer` | 5 (via LIE) | OpenAI GPT-4.1-mini | Anthropic Claude Sonnet 5 | off | yes | $0.002–$0.008 |

Model IDs are indicative of tier — actual model strings resolved from `pricing.ts` and updated as providers release new versions.

### 11.1 Timeout budgets per capability

| Capability class | Router timeout |
|---|---|
| Embed (single input) | 5s |
| Embed (batch) | 60s |
| Classify | 10s |
| Draft (single) | 30s |
| Draft (multi-step: audit, proposal) | 120s |

### 11.2 Retry budgets

| Failure class | Retries |
|---|---|
| Provider 5xx | 2 (with 500ms / 1s backoff) |
| Provider rate limit (429) | 3 (exponential) |
| Structured output malformed | 1 same-provider + 1 fallback-provider |
| Timeout | 0 (fail fast; caller re-invokes) |

---

## 12. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | Model Router is the only entry point for AI; no direct SDK imports allowed in feature code | `AI-PROV-001` hard requirement; provider swaps must not touch business code |
| 2026-07-01 | Prompt Registry three-tier resolution (workspace → global → code) | Enables workspace fine-tuning (Phase 2) without deploy; guarantees an active prompt even if DB rows missing |
| 2026-07-01 | `text-embedding-3-small` (1536 dim) as default embedder | Cost + quality trade-off validated by `04` §7 |
| 2026-07-01 | Chunking default 500 tokens / 100 overlap | Approved via freeze of `05` §3.5 |
| 2026-07-01 | Scope allow-list per capability | Prevents context leakage; least-privilege memory retrieval |
| 2026-07-01 | Similarity threshold defaults per capability (0.50–0.60) | Empirically tuned during dogfooding; overrideable per prompt |
| 2026-07-01 | Structured-output failure retries with prompt enforcement + provider fallback | Router's contract is: structured means structured; never returns unparseable content |
| 2026-07-01 | Fire-and-forget memory writes via Inngest | Never block user-facing calls on memory write success |
| 2026-07-01 | Every AI call carries a `prompt_hash` for reproducibility | Enables audits + evaluation runs against production traces |
| 2026-07-01 | Cost estimation happens **before** the model call; hard budget refuses to run | Prevents runaway spend; user sees a clear cap message rather than a mystery failure |
| 2026-07-01 | Prompt caching enabled where providers support it | Reduces marginal cost significantly on high-volume capabilities (draft-outreach, audit-website) |
| 2026-07-01 | HITL is a v0.1 invariant across every capability | `AI-HITL-001`; safety-first while workspace trust compounds |
| 2026-07-01 | Confidence signal is self-reported by prompt design, not a real probability | Calibration is a prompt-quality problem; evaluation harness (Phase 2) catches drift |
| 2026-07-01 | Agent Layer scaffolding ships in v0.1 (columns, table, Router field, event name); runtime is Phase 3+ | Retrofitting agent primitives later is a rewrite; scaffolding now is cheap |
| 2026-07-01 | Sentry alert threshold: structured-output failure rate > 3% per capability | Fast prompt-regression detection |
| 2026-07-01 | No response caching in v0.1 | Every call fresh; caching is an optimization for scale, not correctness |
| 2026-07-01 | Cost anomaly detection = today's median > 2× rolling 30-day median | Simple, robust to expected day-to-day variance |
| 2026-07-01 | Reply classification failure fallback = `neutral` sentiment, `unclassified` intent | Downstream code is designed for these values; no cascading failure |

---

## 13. Resolved Decisions

Every question that could remain open is decided here:

1. **Embedding model** → `text-embedding-3-small` (1536 dim); frozen via `04`.
2. **Chunk size + overlap** → 500 / 100 tokens; frozen via `05` §3.5.
3. **Provider primary + fallback** → Anthropic (drafts) + OpenAI (structured); frozen via `03` §3.11.
4. **Similarity thresholds per capability** → set in §4.3; overrideable in prompt config.
5. **Top-K per capability** → set in §4.3; overrideable per call.
6. **Timeout budgets per capability** → set in §11.1.
7. **Retry budgets** → set in §11.2.
8. **Structured-output enforcement** → single retry + fallback provider; never return unparseable.
9. **Memory write concurrency** → fire-and-forget via Inngest; failure logged, not surfaced.
10. **Prompt hash algorithm** → SHA-256 of assembled `system + template + variables_resolved`.
11. **Confidence taxonomy** → 3-level (`high` / `medium` / `low`); self-reported.
12. **Cost anomaly threshold** → 2× rolling 30-day median for the capability × workspace.
13. **Structured-output failure alert** → 3% per capability triggers Sentry.
14. **Router response caching** → not in v0.1.
15. **Agent runtime activation** → Phase 3+; scaffolding present in v0.1.
16. **Prompt Library editor UI** → Phase 2 (v0.1 is read-only viewer per `07` §8).

No open questions remain on the AI substrate. Any new ambiguity discovered during `10_API_Architecture.md` will surface there.

---

## 14. Approval Gate

To move to `10_API_Architecture.md`, the founder must sign off on:

1. **Model Router as the exclusive AI entry point** with the 10-step resolution pipeline (§2.3).
2. **Prompt Registry three-tier resolution** (workspace → global → code baseline) with version pinning + prompt hash logging.
3. **Memory Service `withMemory` wrapper** with per-capability scope allow-list (§4.3).
4. **Embeddings: `text-embedding-3-small`, 1536 dim, 500 / 100 chunking** with two-phase re-index swap.
5. **Cost controls:** per-workspace monthly budget, per-capability soft cap, hard per-request cap, refusal-before-dispatch on budget exceeded.
6. **HITL invariants** for v0.1 (§7.1) — no autonomous action; every output human-reviewed.
7. **Agent Layer scaffolding** present in v0.1 (columns, table, Router field, event names) — runtime dormant until Phase 3+.
8. **Observability contract** — every Router call writes `ai_usage_events` + emits `ai.output.produced` + logs to Axiom with prompt hash.
9. **Failure handling** — every `F-AI-*` code has a defined recovery (§10).
10. **Capability catalogue** (§11) — 17 capabilities with primary + fallback + cost bands + structured-output flag — is the source of truth for what AI does in v0.1.
11. **Sentry alerts** as configured in §9.6.

Once signed off, `10_API_Architecture.md` will produce the API layer: internal typed contracts (Server Actions + Route Handlers), public webhook endpoints (Gmail, calendar, e-sign vendor), signed URL surfaces, request/response envelope, rate limiting, versioning, and the deferred public API surface reserved for Future SaaS.

---

*End of 09_AI_Architecture.md*

---

**Should I continue to the next blueprint document (`10_API_Architecture.md`)?**

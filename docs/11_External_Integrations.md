# 11 — External Integrations

**Document:** External Service Integrations — Contracts, Authentication, Configuration, Failure Recovery, Observability, Testing
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint — Core Engine First)
**Status:** Draft for approval
**Owner:** Founder / CTO / Integrations Engineering
**Depends on (frozen):** `01_Vision.md`, `02_Product_Requirements.md`, `03_System_Architecture.md`, `04_Database_Design.md`, `05_User_Flows.md`, `06_Feature_Modules.md`, `07_UI_UX_System.md`, `08_Design_System.md`, `09_AI_Architecture.md`, `10_API_Architecture.md`
**Last updated:** 2026-07-01

---

## 0. How to read this document

This document defines **every external service Verocrest OS depends on in Version 0.1**, and reserves architectural space for services that will land in Phase 2 and Phase 3.

- **Not an API doc.** APIs — internal and external HTTP surfaces exposed *by* Verocrest OS — live in `10_API_Architecture.md`.
- **Not an infrastructure doc.** Hosting, secrets platform, CI/CD, and observability tooling live in `16_Deployment.md`. Where we consume observability data (Axiom, Sentry) or durable-execution (Inngest), those are referenced but not spec'd here.
- **No new product functionality.** Every integration serves a feature already scoped in `06_Feature_Modules.md`. Where a service listed in the brief is not yet needed (e.g., Stripe, DocuSign), we reserve the interface shape without shipping code.
- **Adapter-first.** Every provider is accessed via a typed adapter in `packages/platform-integrations/<provider>/`. Feature code, the AI Router, and Inngest jobs consume the adapter interface; only the adapter package imports the vendor SDK. This is a v0.1 invariant (see architecture §3.4, §8).

If a downstream implementation contradicts what is written here, this document wins until formally amended.

---

## 1. Purpose

### 1.1 Role of the External Integration Layer

The Integration Layer is the **provider-abstracted seam** through which Verocrest OS reaches every third-party service. Its responsibilities:

- **Isolate vendor SDK usage** — one package per provider; nothing else imports the SDK
- **Enforce a typed contract** — every adapter exposes a stable TypeScript interface; consumers depend on the interface, not the vendor
- **Own credential handling** — per-workspace OAuth tokens (Gmail, Calendar) are read/written only inside the adapter; system-wide keys (Anthropic, OpenAI, Browserless, Resend) are resolved via `platform-config`
- **Contain provider quirks** — retries, backoff, quotas, pagination, streaming, webhook signature verification — all live in the adapter, never leak upstream
- **Uniform observability** — every outbound call and inbound webhook is logged with a shared shape (§15)

### 1.2 How the layer connects (no changes to `01–10`)

```
┌───────────────────────────────────────────────────────────┐
│                       Feature code                        │
│  (Server Actions, Route Handlers, Service Layer)          │
└──────────────┬──────────────────────────┬─────────────────┘
               │                          │
               ▼                          ▼
     ┌──────────────────┐        ┌──────────────────┐
     │   AI Router      │        │  Background jobs │
     │   (09 §2)        │        │    (Inngest)     │
     └────────┬─────────┘        └────────┬─────────┘
              │                           │
              ▼                           ▼
   ┌───────────────────────────────────────────────────┐
   │       External Integration Layer                  │
   │       packages/platform-integrations/*            │
   │  ┌────────────────────────────────────────────┐   │
   │  │  Adapter interfaces (typed)                │   │
   │  │  Retry / backoff / circuit breaker         │   │
   │  │  Credential resolution + refresh           │   │
   │  │  Structured logs + metrics                 │   │
   │  └────────────────────────────────────────────┘   │
   └────────────────────────────┬──────────────────────┘
                                │
      ┌──────────┬──────────┬──┴───┬──────────┬──────────┬──────────┐
      ▼          ▼          ▼      ▼          ▼          ▼          ▼
  Supabase   Anthropic   OpenAI   Browserless  Gmail   Calendar   Resend
```

The layer connects to:

- **API Layer (`10`)** — Server Actions and Route Handlers invoke adapters via the Service Layer. Never direct.
- **AI Router (`09`)** — the Router is the sole path from feature code to Anthropic/OpenAI. It uses the adapters as `LlmProvider` implementations.
- **Event Bus (`03` §8 / `10` §11)** — inbound webhooks (Gmail push, Calendar sync, Resend delivery, Browserless session, future Stripe/e-sign) land at Route Handlers in `10` §8, are verified + normalized in the corresponding adapter, then emit typed events.
- **Database (`04`)** — OAuth tokens persisted in `integration_connections` (§4 §19) or `calendar_connections` (§11.2); adapters resolve tokens via the tenancy GUC (`04` §2.3).
- **Background Jobs (Inngest)** — long-running audit orchestration (Browserless), memory reindexing (OpenAI embeddings), reply detection (Gmail Pub/Sub) run inside Inngest steps that call adapters.

Nothing in this document changes any of the above.

---

## 2. Integration Layer Principles

Six principles, ordered. Earlier ones win in conflict.

1. **Every provider is an adapter.** No feature code imports a vendor SDK. `@anthropic-ai/sdk`, `openai`, `resend`, `browserless`, `@supabase/*`, `google-auth-library`, `googleapis` — all restricted to their respective packages via ESLint `no-restricted-imports`.
2. **Interfaces are stable; vendors are swappable.** Every adapter exposes an interface (`LlmProvider`, `EmailSender`, `BrowserSession`, `CalendarProvider`, `IdentityProvider`, `TransactionalEmailSender`, `StorageProvider`) that another vendor could implement. This is what makes escape hatches in `03` §13 real.
3. **All external calls are metered.** Timing histogram + success/failure counter per adapter per operation, tagged with `workspace_id` where applicable. Feeds `15`.
4. **All external calls are traced.** `requestId` from `10` §13.4 propagated as `X-Request-ID` header (or provider equivalent) where supported.
5. **Circuit break, don't cascade.** Each adapter carries a per-provider circuit breaker (§12.9). Provider outage degrades a specific feature, never the whole app.
6. **Sandbox everywhere.** Local development, preview environments, and integration tests never hit real production tenants of external providers. Every adapter has a mock / test-double contract (§16).

---

## 3. Supabase

Supabase is the **primary data plane**: Postgres, Auth, Storage, Realtime, and Vault. Frozen choice per `03` §3.5, §3.8, §3.9, §3.19; schema per `04`.

### 3.1 Role in the system

- **Postgres 16 + `pgvector`, `citext`, `pg_trgm`, `unaccent` extensions** (`04` §2.1) — every business row, every audit, every embedding
- **Auth** (`03` §3.8) — email/password + Google OAuth + magic link identity; JWT with `app_metadata.workspace_ids[]` claim (`10` §9.10)
- **Storage** (`03` §3.9, `04` §26) — audit screenshots, proposal PDFs, KB uploads, offer imagery, imports, attachments
- **Realtime** (`03` §11.1) — powers Dashboard widget refresh (`07` §9.8) and activity timeline live updates
- **Row-Level Security** (`03` §4, `04` §21) — the tenancy boundary
- **Vault** (`03` §3.19) — per-workspace OAuth-token encryption

### 3.2 SDK + versioning

| Component | Package | Version pin |
|---|---|---|
| Server-side client | `@supabase/supabase-js` | `^2.45.x` |
| Auth helpers (Next.js) | `@supabase/ssr` | `^0.5.x` |
| Postgres driver | `postgres` (via Drizzle) | `^3.4.x` |
| Type generation | `supabase gen types` (CLI) | matches deployed schema |

Vendor SDK imports restricted to `packages/platform-integrations/supabase/*`.

### 3.3 Connection lifecycle (Postgres)

- **Pooler:** Supabase Supavisor in **transaction mode** (`10` §12.6)
- **Prepared statements:** disabled at the driver level (incompatible with transaction pool)
- **Session variables:** every request sets `app.workspace_id`, `app.actor_user_id`, `app.request_id` at the top of the transaction; RLS reads these GUCs (`04` §2.3)
- **Statement timeout:** 10s default at the driver; per-query overrides for known heavy reads (dashboard denorm reads: 20s)
- **Idle connection reap:** Supavisor-managed; app-side driver holds no long-lived sockets

### 3.4 Auth integration

- **Sign-up / sign-in:** flow per `10` §5.2 and §5.3. Supabase Auth issues JWT; we set `sb-access-token` (httpOnly, Secure, SameSite=Lax) and optionally `vc_active_workspace` (also httpOnly)
- **Custom claims injection:** on workspace membership change, a Postgres trigger updates `auth.users.raw_app_meta_data.workspace_ids[]`. The next JWT refresh carries the updated claim.
- **Password policy:** min 12 chars, HIBP breach check per `10` §5.2 — hooked via `beforeSignUp` gate in the Signup Server Action; Supabase Auth's built-in policy is stricter of the two
- **Session lifetime:** 12h inactive, 30d absolute (`NFR-SEC-011`); refresh via Supabase's refresh token, transparent to the app
- **Email verification:** Supabase generates verification tokens; our Resend template delivers them (§9.3). Redirect URL: `/api/auth/verify`.

### 3.5 Storage integration

- **Buckets:** `workspace-assets`, `audits`, `proposals`, `knowledge`, `offers`, `attachments`, `imports` (per `04` §26)
- **Access:** all buckets private; access via signed URLs generated server-side after workspace-membership verification (`10` §9.11)
- **Signed URL TTLs:** 60s inline / 1h user export / 24h shareable (`10` §9.11)
- **Upload flow:**
  1. Client → `POST /api/uploads/sign-request` with `{ bucket, entityType, entityId, contentType, sizeBytes }`
  2. Server verifies membership + MIME allowlist + size cap → returns a **signed upload URL** valid for 5 minutes
  3. Client PUTs directly to Supabase Storage
  4. Client → `POST /api/uploads/complete` to persist the entity link
  Storage policies mirror the workspace RLS pattern (`04` §26).

### 3.6 Realtime integration

- **Channels:** per-workspace channel `workspace:<workspace_id>:changes`; per-user channel `user:<user_id>:notifications`
- **Subscribed tables:** `outreach_queue_items`, `reminders`, `meetings`, `deals`, `dashboard_metrics_daily`, `notifications`
- **Auth on subscribe:** JWT + workspace-membership check enforced by RLS-aware Realtime policies
- **Client lifecycle:** subscription established at app-shell mount; fallback to 30s polling if disconnected > 5 min (`07` §9.8)

### 3.7 RLS (referenced, not re-specified)

- Policies live in migrations per `04` §21
- Adapters set the tenancy GUC before any query; `service-role` used only by Inngest for cross-tenant reconciliation (see `10` §11.3)
- Tenancy Fuzzer (`03` §4.5) runs on every PR to enforce isolation

### 3.8 Vault (per-workspace secrets)

- **Use case:** encrypt Gmail refresh tokens, Calendar refresh tokens, and any per-workspace OAuth material
- **Key derivation:** per-workspace key wrapped by Supabase's Vault-managed key; adapter code uses the Vault client to encrypt/decrypt without ever handling the raw key
- **Retrieval path:** adapter loads the token → decrypts via Vault → passes to provider → discards; encrypted form never leaves Postgres

### 3.9 Edge Functions

- **Not used in v0.1.** The application runs on Vercel; Supabase Edge Functions are not required. Reserved for Phase 3+ if we need low-latency compute at Supabase's edge (unlikely).

### 3.10 Configuration (env vars)

| Var | Where | Purpose |
|---|---|---|
| `SUPABASE_URL` | server + client (public prefix) | Project URL |
| `SUPABASE_ANON_KEY` | server + client | Public key for browser-safe reads via RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Elevated ops (migrations, Inngest reconciliation) — never exposed to client bundles |
| `SUPABASE_JWT_SECRET` | server only | JWT verification (fetched from Supabase; cached) |
| `DATABASE_URL` | server only | Direct Postgres via Supavisor |
| `SUPABASE_VAULT_KEY_ID` | server only | Vault key identifier |

Vercel env scope: `production`, `preview`, `development` — distinct Supabase projects per environment (`03` §2.3).

### 3.11 Failure handling

| Failure | Symptom | Recovery |
|---|---|---|
| Supabase Postgres unreachable | connection errors on every query | Adapter emits `DB_CONNECTION_ERROR`; degraded readiness (`/api/ready` 503); circuit-breaker opens for 30s |
| Auth JWKS fetch fails | JWT verification fails | Adapter serves the last cached JWKS (up to 1h old); logs warn; readiness stays healthy |
| Storage 5xx on signed URL generation | intermittent | Retry once with 200ms backoff; on second failure return `INTEGRATION_DOWN` |
| Vault encryption/decryption failure | rare | Fail fast; do not persist unencrypted token; alert |
| Realtime disconnect | client sees stale data | Automatic reconnect via Supabase SDK; app polls at 30s after 5-min disconnect (`07` §9.8) |
| RLS misconfigured (build) | Tenancy Fuzzer test fails | Build blocked; migration reviewed |
| Statement timeout | 10s exceeded | Query returns error; UI shows retry (list) or degraded state (dashboard) |
| Point-in-time recovery required | rare — human incident | Restore per Supabase console; documented runbook in `16` |

### 3.12 Observability

- Every query wrapped in a span: `db.query.<operation>`; tagged with `workspace_id`, `endpoint`, `table`
- Slow-query log: any query > 500ms P95 → Axiom warning
- Storage operations tagged with `bucket`, `operation`
- Realtime metrics: subscription count per workspace, disconnect rate

### 3.13 Testing

- **Local:** `supabase start` runs a local Postgres + Auth + Storage; migrations applied on init
- **Preview per PR:** Supabase Branching (when available on our tier) OR a shared dev project with per-PR schema prefix
- **Integration tests:** run against local Supabase; Tenancy Fuzzer runs against a dedicated schema
- **Production canaries:** `GET /api/ready` on a schedule; `SELECT 1` from a health-probe worker

### 3.14 Rate limits + quotas

- **Postgres:** governed by pool size (200 client conns at Pro tier); no per-endpoint limit
- **Auth:** Supabase throttles at ~30 requests/min per IP for signup; matches our own limits (`10` §9.3)
- **Storage:** provider-side quotas per Supabase Pro plan; we monitor `bucket_bytes` and alert at 80% of plan limit
- **Realtime:** 200 concurrent connections per project on Pro; upgrade before hitting

---

## 4. Anthropic

Anthropic is the **primary provider** for draft-heavy AI capabilities (`09` §3.11, §11). Model: **Claude Sonnet 5**.

### 4.1 Role in the system

Called exclusively via the AI Router (`09` §2). Capabilities routed to Anthropic-primary (§11 of `09`):

- `audit-website` (multi-step reasoning + findings synthesis)
- `generate-loom-script`
- `draft-outreach-email`, `draft-outreach-ig-dm`, `draft-outreach-linkedin-dm`
- `summarize-thread`, `summarize-meeting`
- `draft-proposal`, `regenerate-proposal-section`

Also used as **fallback** for capabilities where OpenAI is primary (score-lead, classify-reply, classify-company-suggestion, recommend-offer) via tool-use for schema conformance.

### 4.2 SDK + versioning

| Component | Package | Version pin |
|---|---|---|
| Anthropic SDK | `@anthropic-ai/sdk` | `^0.30.x` |

Vendor SDK imports restricted to `packages/platform-integrations/anthropic/*`.

### 4.3 Authentication

- **API key** stored in Vercel env `ANTHROPIC_API_KEY` (server-only, scoped per environment)
- Rotated quarterly (see §14.3)
- No per-workspace credentials in v0.1 (all workspaces share the platform key); Phase 3+ enterprise tier may support BYO-key

### 4.4 Prompt execution

- **Assembly** owned by AI Router (`09` §3.7)
- **Adapter contract:** `AnthropicProvider` implements `LlmProvider`:
  ```typescript
  interface LlmProvider {
    stream(request: LlmRequest): AsyncIterable<LlmChunk>;
    complete(request: LlmRequest): Promise<LlmCompletion>;
  }
  ```
- **Prompt caching:** enabled on the product system message + capability system message; provider-side prompt caching per `09` §6.5

### 4.5 Streaming

- **Transport:** Anthropic Messages API with `stream: true`; adapter converts to internal `LlmChunk` type
- **Cancellation:** `AbortSignal` forwarded to the SDK
- **Reconciliation on interrupt:** partial content returned; final `usage` block captured if available (Anthropic emits usage at stream close even on early interrupts)

### 4.6 Structured output via tool-use

For capabilities that need strict JSON when Anthropic is the primary and the schema is required:

- Adapter defines a single "output" tool per capability; forces `tool_choice: { type: "tool", name: "output" }`
- Model's response is parsed from the tool call arguments
- Fallback to OpenAI structured mode if two tool-call attempts fail (`09` §2.7)

### 4.7 Retry logic

- **429 (rate limit):** exponential backoff — 500ms, 1s, 2s — max 3 attempts
- **5xx:** 1 same-provider retry with 500ms backoff; then OpenAI fallback
- **408 / timeout:** immediate provider failover (no same-provider retry)
- **Retries never exceed** the capability timeout budget (`09` §11.1)

### 4.8 Cost tracking

- Every completion recorded via `ai_usage_events` (`04` §18.1) with `provider = 'anthropic'`, `model`, `input_tokens`, `output_tokens`, `cost_usd`, `latency_ms`, `prompt_hash`
- Adapter computes cost from `pricing.ts` (`09` §6.4)
- Provider-side cached-input pricing honored when applicable

### 4.9 Failover

- Router pattern per `09` §2.5: primary Anthropic → fallback OpenAI on 5xx / timeout / structured-output failure
- Circuit breaker: 10 consecutive Anthropic failures within 60s opens the breaker for 30s; during open state, all Anthropic-primary capabilities route directly to OpenAI

### 4.10 Rate limits + quotas

- **Provider limits:** Anthropic accounts have per-model TPM (tokens-per-minute) and RPM (requests-per-minute) caps; adapter respects `retry-after` header on 429
- **Client-side throttle:** the Router's per-workspace budget gating (`09` §6) implicitly caps volume; no additional adapter throttle needed in v0.1
- **Concurrent stream cap:** 40 in-flight streams per adapter instance (matches Vercel serverless concurrency assumptions)

### 4.11 Configuration

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Bearer key |
| `ANTHROPIC_API_BASE_URL` | Optional override; defaults to `https://api.anthropic.com` |
| `ANTHROPIC_DEFAULT_MODEL` | Primary model id (allows quick swap); default `claude-sonnet-5-latest` |
| `ANTHROPIC_MAX_RETRIES` | default 3 |

### 4.12 Failure handling

| Failure | Recovery |
|---|---|
| 429 rate limit | Exponential backoff × 3 attempts |
| 5xx transient | Same-provider retry × 1 → OpenAI fallback |
| Timeout | OpenAI fallback |
| Structured-output failure | Same-provider retry with stricter instructions × 1 → OpenAI fallback |
| Invalid API key (401) | Alert on-call; feature-gate all AI capabilities with clear message until key rotated |
| Content-policy refusal | Surface `AI_CONTENT_REFUSED` (rare in v0.1 usage patterns); UI surfaces "Model declined; adjust inputs and retry" |
| Circuit breaker open | Route all traffic to OpenAI for 30s; degrade transparently |

### 4.13 Observability

- Span: `ai.provider.anthropic.<operation>` (`stream`, `complete`)
- Metrics: request count, error count, P50/P95/P99 latency, token counts, USD cost, cache-hit rate
- Alerts: error rate > 3% in 5-min → Sentry warn; failover rate to OpenAI > 10% → Sentry page

### 4.14 Testing

- **Local:** MSW-based mock returning fixture responses per capability; enables offline development
- **Preview / staging:** real Anthropic with dev API key; smaller budgets
- **Integration tests:** golden-set prompts hit real Anthropic in CI (nightly, not per-PR to control cost); per-PR uses mocks
- **Production validation:** post-deploy canary — one call per capability to a "hello-world" prompt

---

## 5. OpenAI

OpenAI is the **structured-output specialist and embeddings provider** (`09` §3.11, §5.1, §11).

### 5.1 Role in the system

Called via the AI Router. Capabilities routed to OpenAI-primary:

- `score-lead`
- `classify-reply`
- `classify-company-suggestion`
- `recommend-offer`

Plus fallback for all Anthropic-primary capabilities. Plus **exclusive** provider for embeddings via `text-embedding-3-small` (`09` §5.1) — used by capabilities:

- `embed-knowledge`
- `embed-icp`
- `embed-offer`
- `embed-memory-generic`
- Router-side query embeddings for memory retrieval

### 5.2 SDK + versioning

| Component | Package | Version pin |
|---|---|---|
| OpenAI SDK | `openai` | `^4.60.x` |

Vendor SDK imports restricted to `packages/platform-integrations/openai/*`.

### 5.3 Authentication

- **API key** stored in Vercel env `OPENAI_API_KEY` (server-only)
- Optional `OPENAI_ORG_ID` and `OPENAI_PROJECT_ID` for cost tracking segregation
- Rotated quarterly (see §14.3)

### 5.4 Structured outputs

- **`response_format: { type: "json_schema", schema, strict: true }`** used for every structured-output capability
- Zod schema converted to JSON Schema via `zod-to-json-schema` inside the adapter
- Parse failure → same-provider retry with stricter system message → Anthropic tool-use fallback

### 5.5 Embeddings

- **Model:** `text-embedding-3-small` (1536 dims) — matches `04` `vector(1536)` column
- **Batch endpoint used** for reindexing: up to 100 inputs per batch (well under OpenAI's 2048 limit); enforces our `09` §5.3 batch size
- **Adapter interface:**
  ```typescript
  interface EmbeddingProvider {
    embed(texts: string[]): Promise<number[][]>;   // 1:1 order preserved
  }
  ```

### 5.6 Streaming

- OpenAI SDK's `stream: true` on `chat.completions.create`
- Streaming with `response_format: json_schema` supported; adapter parses partial JSON stabilization to expose complete objects to the Router

### 5.7 Retry logic

Identical strategy to Anthropic (§4.7). Anthropic is the fallback for OpenAI's structured-output primary capabilities.

### 5.8 Cost management

- Same `ai_usage_events` logging with `provider = 'openai'`
- OpenAI's cached-input pricing honored where applicable (system prompt reuse)
- Embedding cost separated in analytics (`09` §5.7)

### 5.9 Failover

- OpenAI-primary capability fails → fallback to Anthropic (with schema enforcement via tool-use)
- Anthropic-primary capability fails → fallback to OpenAI (structured-output mode enforces schema if applicable)
- Circuit breaker: same shape as §4.9

### 5.10 Rate limits + quotas

- Per-model TPM/RPM caps; adapter respects `retry-after`
- Embedding endpoint has separate quotas; batch calls minimize RPM pressure
- Reindexing jobs run inside Inngest with concurrency = 4 to stay within provider limits during large KB uploads

### 5.11 Configuration

| Var | Purpose |
|---|---|
| `OPENAI_API_KEY` | Bearer key |
| `OPENAI_ORG_ID` | Optional organization scope |
| `OPENAI_PROJECT_ID` | Optional project scope for cost segregation |
| `OPENAI_API_BASE_URL` | Optional override; defaults to `https://api.openai.com/v1` |
| `OPENAI_DEFAULT_MODEL` | Primary chat model id |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` |
| `OPENAI_MAX_RETRIES` | default 3 |

### 5.12 Failure handling

| Failure | Recovery |
|---|---|
| 429 rate limit | Exponential backoff × 3 |
| 5xx transient | Retry × 1 → Anthropic fallback |
| Timeout | Anthropic fallback |
| Structured-output validation fail | Retry with schema-emphasized system prompt → Anthropic tool-use fallback |
| 401 | Alert; gate all OpenAI-primary capabilities |
| Content policy refusal | Surface `AI_CONTENT_REFUSED` |
| Embedding batch partial failure | Successful items committed; failed items re-queued individually (`09` §5.6) |

### 5.13 Observability

Same metrics + spans as Anthropic (§4.13). Separate dashboard tile for embedding cost/volume.

### 5.14 Testing

- **Local:** MSW mocks for both chat and embeddings; a small "recorded" embedding vector fixture ensures deterministic memory retrieval in tests
- **Preview / staging:** real OpenAI dev key; monthly cap of $10 to prevent accidental blowup
- **Integration tests:** structured-output regression tests in CI (nightly, real OpenAI); per-PR uses fixtures
- **Production validation:** post-deploy canary + weekly embedding round-trip check (embed → store → retrieve)

---

## 6. Browserless

Browserless is the **headless Chrome runtime** for Website Intelligence (`03` §3.13, `05` §7, `06` §4, `09` §11).

### 6.1 Role in the system

Called only by the Website Audit Agent's Inngest orchestrator (`05` §7). Provides:

- Full-page render (mobile + desktop viewports)
- Screenshot capture (uploaded to Supabase Storage `audits` bucket)
- DOM snapshot extraction
- Core Web Vitals collection (LCP, INP, CLS)
- Meta tags, structured data, detected tech stack signals

### 6.2 SDK + versioning

Browserless is accessed via **REST** (browserless.io functions) and **CDP (Chrome DevTools Protocol)** over `wss://`:

| Component | Package | Version pin |
|---|---|---|
| Playwright client | `playwright-core` | `^1.48.x` |
| WebSocket client | `ws` | `^8.18.x` (or Playwright's built-in) |

Adapter connects Playwright to Browserless's remote CDP endpoint; we do not run our own Chrome.

### 6.3 Session lifecycle

1. Audit orchestrator emits `website.audit.requested`
2. Inngest step calls adapter `browserless.session()`
3. Adapter opens a CDP session (`await chromium.connectOverCDP(BROWSERLESS_WS_URL)`)
4. New browser context per audit (fresh cookies, no cross-tenant state)
5. Actions performed: navigate, wait for network idle, capture screenshots, dump DOM, collect vitals
6. Context closed → session closed → adapter releases the connection
7. Screenshot files → adapter uploads to Supabase Storage; returns storage paths to caller

Session identifier logged; if Browserless sends a webhook (§6.10) with a matching `session_id`, we correlate on the `audits.browserless_session_id` column.

### 6.4 Website rendering

- **Viewports:** two per audit — mobile (375 × 812) and desktop (1440 × 900)
- **Wait strategy:** `networkidle0` for 500ms, capped at 15s
- **JS execution:** allowed; certain risky APIs (notifications, geolocation) auto-denied to avoid modals
- **User-Agent:** standard Chrome-latest; no spoofing (we don't want to look adversarial)
- **Timeout:** 60s total per session (matches `10` §12.4 downstream timeout)

### 6.5 Screenshots

- Full-page (mobile + desktop) → stored as `webp` (or `png` fallback) at 80% quality
- Path: `workspace/<workspace_id>/audits/<audit_id>/<viewport>.webp`
- Signed URL TTL: 60s inline, 1h for user download (`10` §9.11)

### 6.6 DOM extraction

- Serialized HTML captured after network idle
- Selectors for known conversion elements (CTAs, forms, booking widgets) evaluated in-browser via `page.evaluate`
- DOM tree size capped at 2MB (over-large DOMs trigger `AUDIT_TIMEOUT` handling)

### 6.7 Failure recovery

Per `05` §14 F-AUDIT-* codes and `10` §14:

| Failure | Recovery |
|---|---|
| `AUDIT_UNREACHABLE` (F-AUDIT-001) | Mark audit failed; do not retry (user retries) |
| `AUDIT_TIMEOUT` (F-AUDIT-002) | Retry once with `waitUntil: 'domcontentloaded'` instead of `networkidle`; mark failed on second attempt |
| `AUDIT_BLOCKED` (F-AUDIT-003 — Cloudflare / bot challenge) | Mark failed with explicit reason; suggest manual audit |
| Screenshot upload failure (F-AUDIT-005) | Persist audit findings; retry upload asynchronously |
| Browserless session crash | Retry once with a fresh session; mark failed on second |
| Budget exceeded (F-AUDIT-006) | Refuse audit at Router layer before dispatching to Browserless |

### 6.8 Timeouts

- Per-session hard cap: 60s (Inngest step timeout)
- Per-navigation cap: 15s
- Per-screenshot cap: 10s
- Per-DOM-extraction cap: 5s

### 6.9 Rate limits + quotas

- Browserless plan-based concurrency cap (varies by tier — MVP starts at 6 concurrent sessions per `03` ASM-ARCH-005)
- Adapter enforces a **client-side concurrency semaphore** matching the plan cap; excess audits queue in Inngest with backpressure
- Cost/session metric fed to Axiom for capacity planning

### 6.10 Webhooks

Per `10` §8.4, Browserless can emit session lifecycle events:

- Endpoint: `POST /api/webhooks/browserless`
- Verification: shared secret in `X-Browserless-Signature` header
- Behavior: fast ack; async update `audits.browserless_session_id`, `status`, `error`
- Idempotency: dedupe on `(session_id, event_type)`

### 6.11 Configuration

| Var | Purpose |
|---|---|
| `BROWSERLESS_WS_URL` | e.g., `wss://chrome.browserless.io?token=<key>` |
| `BROWSERLESS_API_KEY` | API key embedded in URL query |
| `BROWSERLESS_WEBHOOK_SECRET` | HMAC secret for webhook signatures |
| `BROWSERLESS_MAX_CONCURRENT` | Client-side semaphore cap; default 6 |
| `BROWSERLESS_SESSION_TIMEOUT_MS` | Hard timeout; default 60000 |

### 6.12 Observability

- Span: `browserless.session.<operation>` (`open`, `navigate`, `screenshot`, `dom_extract`, `close`)
- Metrics: sessions/min, success rate, P95 total-session-time, per-viewport render time, screenshot bytes uploaded
- Alerts: failure rate > 10% in 15-min → Sentry warn; sessions/min > 80% of plan cap → capacity warning

### 6.13 Testing

- **Local:** an environment variable `BROWSERLESS_MODE=mock` swaps the adapter to a fixture-based mock that returns pre-recorded DOM + screenshot fixtures for known URLs
- **Preview / staging:** real Browserless with a low-tier plan
- **Integration tests:** the mock adapter is used per-PR; nightly job runs a real Browserless audit against a stable target URL as a smoke test
- **Production validation:** post-deploy canary audit on `example.com`

### 6.14 Escape hatch (documented per `03` §13)

At ~$1500/mo Browserless spend, migrate to self-hosted Playwright pool on Fly.io. The `BrowserSession` interface is unchanged; only the connector swaps.

---

## 7. Gmail API

Gmail is the **outreach send channel** and **reply detection source** (`03` §3.14, `05` §8, `05` §9, `06` §5).

### 7.1 Role in the system

- Send emails from each authenticated user's own inbox (personalized outreach)
- Detect replies via Gmail Push (Pub/Sub) notifications → `outreach.reply.received` event
- Track thread state for reply matching (`outreach_messages.provider_thread_id`)

### 7.2 SDK + versioning

| Component | Package | Version pin |
|---|---|---|
| Google auth | `google-auth-library` | `^9.14.x` |
| Gmail client | `googleapis` (Gmail v1) | `^144.x.x` |

Vendor SDK imports restricted to `packages/platform-integrations/google-gmail/*`.

### 7.3 OAuth lifecycle

- **Scopes requested** (matches minimum needed):
  - `https://www.googleapis.com/auth/gmail.send`
  - `https://www.googleapis.com/auth/gmail.readonly` (for reply thread fetch on webhook)
  - `https://www.googleapis.com/auth/gmail.metadata` (labels + minimal history)
  - `openid`, `email`, `profile` (identity for the connection record)
- **Consent screen** appears once per user per workspace
- **Callback:** Google OAuth returns to `/api/auth/google/callback` (`10` §5.6); adapter creates `integration_connections` row with `provider = 'google_gmail'`, encrypted tokens via Vault
- **Refresh tokens:** stored `encrypted_refresh_token`; access token refreshed lazily on each API call when `token_expires_at` < now + 60s
- **Revocation:** adapter exposes `disconnect(workspaceId, userId)` — calls Google's revoke endpoint + soft-deletes the connection row
- **Reconnect flow:** on refresh failure (401), UI banner prompts reconnect; connection status flips to `expired`

### 7.4 Sending email

- **API used:** `users.messages.send` with RFC 5322 MIME body
- **From header:** authenticated user's Gmail address (no spoofing possible; Gmail rejects mismatched From)
- **Reply-To:** authenticated user's address (default)
- **Threading:** `In-Reply-To` and `References` headers set on follow-ups
- **Tracking:** we do not inject open-tracking pixels or wrapped links in v0.1 (deferred to Phase 2 per `06` §5.13)
- **Attachments:** not supported in v0.1 (all attachments referenced as links)

### 7.5 Thread retrieval

On push notification (§7.6), adapter:

1. Fetches `users.history.list` since last known `historyId`
2. For each new inbound message on a thread matching `outreach_messages.provider_thread_id`, retrieves `users.messages.get` with `format: 'full'`
3. Persists as `outreach_messages` with `direction = 'inbound'`
4. Emits `outreach.reply.received`
5. Updates the workspace's stored `historyId` cursor for the next push

### 7.6 Push notifications (Pub/Sub)

Per `05` §17 ASM-FLOW-001 (Gmail Push confirmed) and `10` §8.1:

- On connection: adapter calls `users.watch` to register a Pub/Sub topic subscription
- Google publishes to our Pub/Sub topic; Pub/Sub push-delivers to `/api/webhooks/gmail`
- Watch registrations expire after 7 days; a nightly cron re-invokes `users.watch` for all active connections
- **Fallback polling** if push webhook fails > 5 minutes: cron polls `users.history.list` every 5 minutes per active connection until push resumes

### 7.7 Quotas

Gmail API v1 quotas per project:

- 1,000,000,000 quota units/day
- Per-user rate limit: 250 quota units/user/second
- `send` costs 100 units; `history.list` costs 2 units; `messages.get` costs 5 units
- Adapter maintains a **per-user token bucket** aligned to these limits; excess queues in Inngest with backpressure
- If quota exceeded despite throttling, adapter surfaces `GMAIL_RATE_LIMITED` (§10 in `10`); server auto-retries with exponential backoff

### 7.8 Error handling

| Failure | Recovery |
|---|---|
| `GMAIL_DISCONNECTED` (token invalid) | Set connection `status = 'expired'`; UI banner to reconnect; draft preserved |
| `GMAIL_RATE_LIMITED` | Exponential backoff × 3; if still failing, queue via Inngest for delayed send |
| `RECIPIENT_INVALID` | Validated pre-send; user prompted to fix |
| `CONTACT_UNSUBSCRIBED` | Send refused pre-dispatch |
| Push webhook signature failure | 401; logged; delivered via polling fallback |
| Watch registration expiry | Nightly cron re-registers all active watches |
| `historyId` drift (rare — Google's stated occurrence) | Full inbox scan since last successful cursor; may take up to 10 min for large mailboxes |

### 7.9 Configuration

| Var | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client id |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URL` | e.g., `https://verocrest.app/api/auth/google/callback` |
| `GOOGLE_PUBSUB_TOPIC` | Pub/Sub topic name for Gmail push |
| `GOOGLE_PUBSUB_VERIFICATION_TOKEN` | Shared secret in Pub/Sub push |

### 7.10 Observability

- Span: `gmail.<operation>` (`send`, `history.list`, `messages.get`, `watch.register`)
- Metrics: send count/min, send success rate, quota consumption %, reply-detection latency (webhook receipt → event emitted)
- Alerts: send failure rate > 5% → warn; quota consumption > 80% → capacity warning; push-to-poll fallback engaged > 15 min → warn

### 7.11 Testing

- **Local:** MSW mock for Gmail API; `GMAIL_MODE=mock` env flag
- **Preview / staging:** real Gmail with dedicated Verocrest test Google Workspace account
- **Integration tests:** mock adapter for per-PR; nightly send + reply round-trip against staging Workspace
- **Production validation:** post-deploy send a test message from a dedicated `hello@verocrest.app` mailbox to itself; verify webhook receipt

### 7.12 Deliverability posture

- **Dedicated Verocrest Google Workspace** per `03` decision (§3.14 approved)
- SPF, DKIM, DMARC properly configured on Verocrest sender domain(s) — documented in `16_Deployment.md`
- No warm-up needed for v0.1 since sends originate from the human user's own inbox (never a shared sender)

---

## 8. Google Calendar

Google Calendar powers **booking links** and **meeting sync** (`03` §3.14, `05` §10, `06` §5, `10` §6.5).

### 8.1 Role in the system

- Read free/busy state to compute available slots on public booking pages
- Create calendar events for prospect-booked meetings
- Watch calendar changes and reconcile `meetings.status`

### 8.2 SDK + versioning

Same as Gmail (`googleapis` monorepo; Calendar v3 API).

### 8.3 OAuth lifecycle

- **Scopes** (added when the user connects Calendar; may be requested together with Gmail on initial consent to avoid double prompt):
  - `https://www.googleapis.com/auth/calendar.readonly` — free/busy read
  - `https://www.googleapis.com/auth/calendar.events` — create booked events
- **Token storage:** `calendar_connections` (`04` §11.2) — encrypted access + refresh tokens
- **Reconnect flow:** identical shape to Gmail (§7.3)

### 8.4 Booking synchronization

1. Prospect selects a slot on `/book/<workspaceSlug>/<linkSlug>`
2. Server validates slot via free/busy API (`freebusy.query`)
3. Server calls `events.insert` on the owner's primary calendar with:
   - Title: from booking link config
   - Attendees: owner + prospect
   - Description: link to Verocrest deal (if matched)
   - Google Meet auto-generated (`conferenceDataVersion=1`)
4. Response `event.id` stored as `meetings.external_event_id`
5. Emit `meeting.booked`
6. Confirmation email sent via Resend (§9)

### 8.5 Availability

- **Read via `freebusy.query`** on the owner's primary calendar for the requested date range
- Adapter merges with `booking_links.availability` config (weekly windows + buffer minutes) to produce a list of open slots
- Cache: 60s per (link_id, month) — a busy Google response is unlikely to change slot decisions within that window

### 8.6 Meeting creation

- Idempotent by `(workspace_id, booking_link_id, scheduled_at, attendee_email)` for 60s to prevent double-booking races
- Failure path: if `events.insert` fails, adapter still returns success to the prospect (meeting row persisted with `provider = 'manual'` + status flag `pending_sync`); nightly cron retries the sync
- Correspondingly, on race with a concurrent booking (`409` from Google or free/busy mismatch), prospect sees `SLOT_TAKEN` (F-CAL-002)

### 8.7 Webhooks (push notifications)

- Adapter calls `events.watch` on connection to register a notification channel
- Google POSTs to `/api/webhooks/google-calendar` (`10` §8.2) on any change
- Channel expires every 7 days; nightly cron re-registers
- On change: adapter fetches `events.list` since last `syncToken`; reconciles `meetings.status` (e.g., prospect cancelled → `cancelled`)

### 8.8 Recovery

| Failure | Recovery |
|---|---|
| `CALENDAR_DISCONNECTED` (F-CAL-001) | Booking page returns 503; owner banner to reconnect |
| Free/busy read failure | Booking page shows generic "temporarily unavailable"; owner notified |
| `events.insert` failure | Meeting stored `pending_sync`; nightly cron retries; if unresolved after 24h, alert owner |
| `SLOT_TAKEN` (F-CAL-002) | Return 409 to prospect with alternative slots |
| Watch expiry | Nightly cron re-registers |
| `syncToken` invalidated | Full re-sync (Google's `410 Gone` semantics) |

### 8.9 Configuration

Same OAuth client credentials as Gmail (§7.9); Calendar scopes bundled on initial user consent.

### 8.10 Observability

- Span: `google-calendar.<operation>`
- Metrics: booking success rate, sync latency, watch renewal success rate, `syncToken` invalidations count
- Alerts: booking failure rate > 5% → warn; watch expired without renewal > 24h → page

### 8.11 Testing

- **Local:** MSW mock returning fixture free/busy + a synthesized `event.id`
- **Preview / staging:** real Calendar against Verocrest test Workspace
- **Integration tests:** mock per-PR; nightly synthetic booking + cancellation against staging
- **Production validation:** post-deploy — book a test slot on a dedicated "canary" calendar and verify webhook receipt

---

## 9. Resend

Resend is the **transactional email sender** (`03` §3.14) — verification, magic link, password reset, notifications, reminder digests. **Never used for outreach sends** (those go through Gmail per §7).

### 9.1 Role in the system

- Deliver Supabase Auth's email flows using our brand (verification, magic link, password reset)
- Send in-app notifications by email per user preferences (`06` §8.2)
- Send booking confirmation emails to prospects on public booking (§8.4)
- (Phase 2) Deliver client-facing reports and Client Portal invitations

### 9.2 SDK + versioning

| Component | Package | Version pin |
|---|---|---|
| Resend SDK | `resend` | `^4.0.x` |

Vendor SDK imports restricted to `packages/platform-integrations/resend/*`.

### 9.3 Templates

- **Verification:** Supabase Auth generates the token; our Server Action builds the email body from a template in `packages/platform-integrations/resend/templates/verification.tsx` (React Email) and sends via Resend
- **Password reset:** same pattern; token from Supabase Auth
- **Magic link:** same pattern
- **Notification (categorized):** rendered per notification category (mention, reply received, proposal signed, deal won)
- **Booking confirmation:** rendered from meeting + booking link + workspace brand

All templates use React Email components so the same TSX produces both the HTML body and the plaintext fallback.

### 9.4 Domain configuration

- **Sending domain:** `notifications.verocrest.app` (subdomain isolates transactional from marketing)
- **SPF, DKIM, DMARC** verified in Resend dashboard; DMARC set to `p=reject` after warm-up
- **From address:** `<Sender Name> <notifications@notifications.verocrest.app>` for system emails; per-workspace future customization is Phase 2 branding

### 9.5 Delivery events

- Resend webhook (`/api/webhooks/resend`, `10` §8.3) delivers events: `email.delivered`, `email.opened`, `email.bounced`, `email.complained`, `email.clicked`
- Signed via `Svix-Signature`; idempotency keyed on `svix-id`
- **Bounce handling:** persistent bounces on a user's own email → flag account; on a prospect's email (booking confirmation) → log for owner visibility, no downstream action in v0.1

### 9.6 Retries

- Adapter-side retry on Resend 5xx: 3 attempts, exponential (500ms / 1s / 2s)
- Idempotency key = ULID; Resend supports client-provided idempotency
- If all retries fail, adapter surfaces error to caller; for verification emails (critical), caller re-queues in Inngest for later retry

### 9.7 Rate limits

- Resend plan-based; v0.1 tier is well within limits (< 10k emails/day expected)
- Client-side throttle: 10 emails/sec per adapter instance to smooth bursts

### 9.8 Configuration

| Var | Purpose |
|---|---|
| `RESEND_API_KEY` | API key |
| `RESEND_WEBHOOK_SECRET` | Svix HMAC secret |
| `RESEND_FROM_DEFAULT` | Default From address |
| `RESEND_DOMAIN` | Verified sending domain |

### 9.9 Failure handling

| Failure | Recovery |
|---|---|
| 5xx transient | Retry × 3 |
| 4xx invalid recipient | Persist failure; caller sees `RECIPIENT_INVALID` |
| Rate limited | Retry × 3 with `retry-after` respect |
| Webhook signature failure | 401 + log; delivery events reconciled via daily audit of Resend's API |
| Bounce on user primary email | Flag account; disable email notifications for that user until they update email |

### 9.10 Observability

- Span: `resend.send`
- Metrics: sends/min, delivery rate (from webhooks), bounce rate, complaint rate, open rate (opt-in per user preferences)
- Alerts: bounce rate > 2% → warn (deliverability degradation); complaint rate > 0.1% → page

### 9.11 Testing

- **Local:** `RESEND_MODE=console` — the adapter logs the rendered HTML + plaintext to stdout instead of sending; developer sees the exact email that would fire
- **Preview / staging:** real Resend with a sandbox domain
- **Integration tests:** the console mode used per-PR; nightly send a test verification email to a monitored inbox and assert delivery via webhook
- **Production validation:** post-deploy — send a health-check email to `deliverability-health@verocrest.app` and assert `email.delivered` within 60s

---

## 10. Reserved Future Integrations

Placeholder architecture only. Each entry defines: role, when it lands, interface shape reserved, no code written.

### 10.1 Stripe (Phase 2 — FR-FIN-*)

- **Role:** payment processing for invoicing and (later) SaaS subscriptions
- **Adapter interface reserved:**
  ```typescript
  interface InvoicingProvider {
    createHostedInvoice(invoice: Invoice): Promise<HostedInvoice>;
    getPaymentStatus(providerId: string): Promise<PaymentStatus>;
    handleWebhook(event: WebhookPayload): Promise<void>;
  }
  ```
- **Webhook receiver:** `/api/webhooks/stripe` already reserved in `10` §8.5 (501 in v0.1)
- **Auth:** API keys; per-workspace Stripe Connect (Phase 2 decision — deferred)
- **v0.1 posture:** external Stripe Payment Links generated outside Verocrest OS for MVP deposits (`06` §6.4). No SDK integration ships in v0.1.

### 10.2 DocuSign (Phase 2 — FR-SALES-006)

- **Role:** in-house e-signature for proposals
- **v0.1 posture:** external DocuSign / Adobe Sign; status marked manually (`06` §6.4)
- **Adapter interface reserved:**
  ```typescript
  interface ESignProvider {
    createEnvelope(proposal: Proposal): Promise<EnvelopeRef>;
    getStatus(envelopeId: string): Promise<ESignStatus>;
    handleWebhook(event: WebhookPayload): Promise<void>;
  }
  ```
- **Webhook receiver:** `/api/webhooks/esign` reserved in `10` §8.6 (501 in v0.1)
- **Auth (Phase 2):** OAuth for user-authored envelopes; API key for platform-level

### 10.3 Slack (Phase 2 — FR-NOT-004)

- **Role:** notification delivery beyond in-app + email
- **v0.1 posture:** no Slack integration
- **Adapter interface reserved:**
  ```typescript
  interface ChatNotifier {
    sendToChannel(channelRef: string, notification: NotificationPayload): Promise<void>;
  }
  ```
- **Auth (Phase 2):** OAuth per workspace with `chat:write` scope

### 10.4 Xero (Phase 3 — FR-FIN-006)

- **Role:** accounting export for invoices + payments
- **v0.1 posture:** no Xero integration
- **Adapter interface reserved:**
  ```typescript
  interface AccountingExport {
    exportInvoice(invoice: Invoice): Promise<AccountingRef>;
    exportPayment(payment: Payment): Promise<AccountingRef>;
  }
  ```
- **Auth (Phase 3):** OAuth per workspace

### 10.5 QuickBooks (Phase 3 — FR-FIN-006)

- Same `AccountingExport` interface as Xero
- Selection between Xero and QuickBooks per workspace (Phase 3 configuration surface — deferred)

### 10.6 Zapier (Future SaaS)

- **Role:** third-party workflow automation via outbound triggers + inbound actions
- **v0.1 posture:** no Zapier integration
- **Architecture reserved:** subscription surface reads from the `event_journal` (`04` §16) — Zapier and n8n share the same read path; Zapier-specific adapter maps typed events to Zapier's REST triggers

### 10.7 n8n (Phase 2 — FR-AUTO-004)

- **Role:** advanced automation via outbound webhooks per `02` INT-006
- **v0.1 posture:** no n8n integration
- **Adapter interface reserved:**
  ```typescript
  interface WebhookOutbox {
    subscribe(config: SubscriptionConfig): Promise<SubscriptionRef>;
    dispatch(event: BusEvent, subscription: SubscriptionRef): Promise<DeliveryResult>;
  }
  ```
- **Delivery:** signed outbound POSTs from `event_journal`; retries with backoff

### 10.8 Reserved integration rules

For every reserved provider:

1. **No SDK dependency added to `package.json` in v0.1**
2. **Interface types committed** to `packages/platform-integrations/<provider>/types.ts` — no implementation
3. **Webhook receiver route stub** returns `501 FEATURE_NOT_AVAILABLE_V0_1` (already reserved in `10` §8)
4. **Documentation only** (this document); no product surface

---

## 11. Authentication (OAuth Lifecycle Across Integrations)

Consolidated OAuth handling shared by Gmail + Calendar (and later Slack, Xero, QuickBooks, DocuSign).

### 11.1 OAuth flow

1. User initiates connect from `/settings/integrations`
2. Server Action generates a signed `state` (contains `workspace_id`, `user_id`, `intended_return_url`, nonce, expiry 10 min)
3. Redirect to provider's authorize endpoint with scopes + `state`
4. Provider redirects to `/api/auth/<provider>/callback` (Google shares one callback: `/api/auth/google/callback`)
5. Callback verifies signed `state`, exchanges `code` for tokens via provider token endpoint
6. Adapter persists tokens (encrypted) in `integration_connections` / `calendar_connections`
7. Emit `integration.google.connected` (or provider-appropriate event)
8. Redirect user to `intended_return_url`

### 11.2 Token storage

- **Location:** `integration_connections.encrypted_access_token` and `encrypted_refresh_token` (`04` §19)
- **Encryption:** Supabase Vault-managed key per workspace (`03` §3.19)
- **Scope:** rows workspace-scoped by RLS; user-scoped where a per-user connection exists (Gmail Send)
- **Expiry tracking:** `token_expires_at` column; adapter refreshes lazily at 60s before expiry

### 11.3 Refresh tokens

- **Long-lived refresh tokens** obtained during initial OAuth
- On access-token expiry: adapter calls provider's token endpoint with the stored refresh token, updates the row transactionally
- **Concurrency:** `SELECT ... FOR UPDATE` while refreshing to avoid duplicate refresh calls from parallel adapter invocations
- **Refresh failure (401):** connection flipped to `expired`; user prompted to reconnect

### 11.4 Revocation

- Adapter exposes `disconnect(workspaceId, userId)` → calls provider's revoke endpoint → soft-delete connection row
- On user account deletion: cascade revoke all connections for that user

### 11.5 Encryption

- All OAuth tokens encrypted at rest via Vault (§3.8)
- Tokens never logged, never returned in API responses (`10` §9.1)
- Encryption keys never handled by app code — Vault is the KMS boundary

### 11.6 Scopes

Requested minimally per provider (§7.3, §8.3). Additional scopes require a re-consent flow — never silently expanded.

### 11.7 Secrets

- OAuth client ID + secret per provider (Google, future Slack, future DocuSign) stored in Vercel env
- Per-environment separate credentials — dev/staging/prod are distinct OAuth clients

### 11.8 Rotation

- **Vercel env secrets:** rotated quarterly with a 24h overlap window (dual-secret verification) — see `16_Deployment.md` runbook
- **OAuth client secrets:** rotated annually or on suspected compromise; provider consoles support secret rotation without app downtime
- **Vault encryption keys:** managed by Supabase; rotation transparent to app
- **API keys** (Anthropic, OpenAI, Resend, Browserless): rotated quarterly; adapters support dual-key verification during rotation window

---

## 12. Configuration Matrix

Every provider's configuration surface at a glance. Values represent v0.1 defaults; live values are per-environment.

| Provider | SDK | Env vars | Timeout | Retries | Rate-limit strategy | Circuit breaker |
|---|---|---|---|---|---|---|
| Supabase | `@supabase/supabase-js@^2.45` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SUPABASE_VAULT_KEY_ID` | 10s query, 15s storage | 1 on DB transient | Pool-scoped | 30s on Postgres unreachable |
| Anthropic | `@anthropic-ai/sdk@^0.30` | `ANTHROPIC_API_KEY`, `ANTHROPIC_DEFAULT_MODEL` | Capability-specific (`09` §11.1) | 3 with backoff + OpenAI failover | Router budget | 30s after 10 failures/60s |
| OpenAI | `openai@^4.60` | `OPENAI_API_KEY`, `OPENAI_ORG_ID?`, `OPENAI_EMBEDDING_MODEL` | Capability-specific | 3 with backoff + Anthropic failover | Router budget + concurrency=4 for embeds | 30s after 10 failures/60s |
| Browserless | `playwright-core@^1.48` | `BROWSERLESS_WS_URL`, `BROWSERLESS_WEBHOOK_SECRET`, `BROWSERLESS_MAX_CONCURRENT` | 60s session, 15s navigate | 1 on transient | Semaphore (6 concurrent) | 60s after 5 failures/5min |
| Gmail | `googleapis@^144`, `google-auth-library@^9.14` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URL`, `GOOGLE_PUBSUB_TOPIC` | 20s | 3 on 429/5xx | Per-user token bucket (Gmail quota) | 60s after 5 send failures/5min |
| Google Calendar | Same as Gmail | Same | 15s | 3 on 429/5xx | Free/busy 60s cache | 60s after 5 failures/5min |
| Resend | `resend@^4.0` | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `RESEND_FROM_DEFAULT`, `RESEND_DOMAIN` | 10s | 3 on 5xx | 10 emails/sec throttle | 60s after 5 failures/5min |

### 12.9 Circuit breaker semantics

- **Closed** (normal): calls flow through
- **Open** (tripped): calls fail fast for the open duration; fallback provider (AI) or degraded feature (non-AI)
- **Half-open** (recovery probe): one call allowed; success → closed; failure → open again
- Configured per adapter; state stored in-process (not persistent across serverless invocations — acceptable at v0.1 volume; Phase 3+ may promote to Postgres-backed shared state)

---

## 13. Security

### 13.1 Secret management

- **Vercel env** for system-wide provider secrets — never in git
- **Supabase Vault** for per-workspace OAuth tokens
- **GitHub push protection + secret scanning** on the repo
- **No client bundle exposure** — all provider secrets are `NEXT_PUBLIC_`-free

### 13.2 Webhook verification

Non-negotiable per provider:

| Provider | Verification |
|---|---|
| Gmail (Pub/Sub push) | Google-signed JWT in `Authorization` header; audience matches our subscription; issuer is Google |
| Google Calendar | Channel token match + `X-Goog-Channel-ID` header + expiry check |
| Resend | Svix `Svix-Signature` HMAC |
| Browserless | Shared secret in `X-Browserless-Signature` HMAC |
| Stripe (reserved) | `Stripe-Signature` |
| ESign (reserved) | Vendor-specific |

Any unverified webhook → `401`, logged.

### 13.3 Encryption

- **At rest:** all Postgres data encrypted by Supabase (AES-256); OAuth tokens double-encrypted via Vault
- **In transit:** TLS 1.3 mandatory (Supabase, Vercel, all providers)

### 13.4 Least privilege

- Provider scopes requested minimally (§7.3, §8.3)
- Supabase `service-role` used only from server code paths that require it (migrations, cross-tenant reconciliation, Inngest system tasks) — never in Route Handlers directly exposed to browsers
- OAuth clients scoped per environment

### 13.5 Token refresh

Per §11.3; concurrency-safe.

### 13.6 Audit logging

Every OAuth event logged to `action_log` (`04` §15):

- `integration.connected` — `action_type = 'integration.connected'`, subject = user
- `integration.disconnected`
- `integration.token.refreshed` — logged only on failure (avoids noise on routine refresh)
- `integration.token.revoked`

### 13.7 Provider permission review

- Documented per provider (§7.3, §8.3)
- Reviewed quarterly against minimum-necessary principle
- Any scope escalation requires updated consent screen + user re-consent flow

---

## 14. Failure Handling

This section consolidates failure handling documented per-provider (§3.11, §4.12, §5.12, §6.7, §7.8, §8.8, §9.9) into a cross-cutting recovery playbook.

### 14.1 Common failure classes

| Class | Response |
|---|---|
| Transient 5xx | Retry with backoff per adapter; if persistent, degrade feature |
| Rate limit (429) | Respect `retry-after`; queue via Inngest for non-user-facing calls |
| Auth failure (401 on API key) | Alert on-call; feature-gate; rotate key |
| Auth failure (401 on OAuth) | Flip connection to `expired`; UI reconnect banner |
| Timeout | Provider-specific — fallback (AI), fail (Browserless), retry (Gmail/Calendar) |
| Signature failure (webhook) | 401 + log |
| Circuit-breaker open | Fallback (AI) or fail fast with degraded UX (non-AI) |
| Provider content policy | User-facing `AI_CONTENT_REFUSED`; log for prompt-quality review |

### 14.2 Recovery strategies

**Immediate (in-request):**
- Retry with jittered exponential backoff
- Same-provider retry ceiling: 3
- Cross-provider failover: AI only

**Deferred (via Inngest):**
- Non-user-facing calls (memory writes, reindexes, webhook processing) queue for retry
- Ceiling: 3 Inngest attempts with backoff; final failure alerts

**Reconciliation:**
- Nightly cron reconciles: unwatch-expired OAuth channels re-registered (Gmail, Calendar)
- Nightly `event_journal` sweep re-emits any missed events (per `10` §11.3)

### 14.3 User experience per failure class

Per `05` §14 + `10` §14, every failure code has a UI treatment. Adapters map provider errors to these codes at the adapter boundary — feature code never sees raw provider exceptions.

### 14.4 Logging

- Every failure logged with: `requestId`, `workspaceId`, `provider`, `operation`, `errorClass`, `providerErrorCode`, `providerErrorMessage`, `retryCount`
- Provider error messages **redacted** if they may contain user data (Gmail message bodies never logged)

### 14.5 Alerting

Consolidated:

| Signal | Threshold | Action |
|---|---|---|
| Any provider error rate > 5% in 5-min | Any | Sentry warn |
| Any provider error rate > 10% in 5-min | Any | Sentry page |
| AI provider failover rate > 10% | AI | Sentry page (potential upstream outage) |
| OAuth reconnect banner surfaced > 3 users in 1h | Any | Sentry warn (potential platform-wide credential issue) |
| Webhook 4xx rate > 5% | Any | Sentry warn |
| Circuit breaker open > 5 min | Any | Sentry page |
| Provider cost spike > 2× rolling median | Any | Axiom warn (per `09` §9.6) |

---

## 15. Observability

### 15.1 Logs

Every adapter operation emits a structured log line at the adapter boundary:

```json
{
  "level": "info" | "warn" | "error",
  "requestId": "01H...",
  "workspaceId": "uuid?",
  "provider": "gmail",
  "operation": "send",
  "durationMs": 812,
  "status": "ok" | "error" | "timeout",
  "retryCount": 0,
  "errorClass": "GMAIL_RATE_LIMITED?",
  "providerErrorCode": "429?"
}
```

Sink: Axiom via `packages/platform-observability/`.

### 15.2 Metrics

Per adapter, per operation:

- Request rate (req/sec)
- Success rate (%)
- P50 / P95 / P99 latency
- Retry count distribution
- Circuit-breaker state transitions

Plus provider-specific counters (§4.13, §5.13, §6.12, §7.10, §8.10, §9.10).

### 15.3 Tracing

- `requestId` propagated to providers via headers where supported (`X-Request-ID` for most; provider-specific for Anthropic's `x-request-id`)
- Distributed tracing (OpenTelemetry) not shipped in v0.1 (`10` §13.2); adapter spans logged as structured events instead

### 15.4 Provider latency

- Weekly dashboard: P95 latency per adapter per operation, trended
- Regression alarm: P95 latency > 1.5× 30-day baseline → warn

### 15.5 Failure rate

- Per-provider dashboard with rolling failure rate + circuit-breaker events
- Aggregated view across all providers on the main ops dashboard

### 15.6 Cost metrics

- **AI (Anthropic + OpenAI):** per `09` §9 — dashboard tile per capability × workspace
- **Browserless:** cost per session × sessions per day → forecast against plan cap
- **Resend:** volume × plan cost
- **Gmail / Calendar:** quota consumption %, no direct cost
- **Supabase:** plan tier tracked; storage + DB usage forecast

---

## 16. Testing

### 16.1 Local development

- **Mock mode per provider** activated via env vars:
  - `SUPABASE_MODE=local` — uses local Supabase (docker)
  - `AI_MODE=mock` — MSW fixtures for Anthropic + OpenAI
  - `BROWSERLESS_MODE=mock` — pre-recorded DOM + screenshot fixtures
  - `GMAIL_MODE=mock`, `CALENDAR_MODE=mock` — MSW fixtures
  - `RESEND_MODE=console` — logs email HTML/text to stdout
- Local development runs fully offline against mocks
- Fixtures maintained under `packages/platform-integrations/<provider>/__fixtures__/`

### 16.2 Sandbox mode

- **Preview / staging environments** use real providers with sandbox credentials:
  - Dedicated Supabase staging project
  - Anthropic + OpenAI dev API keys with monthly cost caps ($10 / $10)
  - Real Browserless on the smallest paid tier
  - Verocrest test Google Workspace for Gmail + Calendar
  - Resend on a sandbox subdomain
- No production tenant data ever touched from staging

### 16.3 Mock strategy

- **HTTP mocks:** MSW (Mock Service Worker) intercepts adapter's outbound requests in Jest / Vitest
- **Fixture files:** JSON per operation × scenario (`success.json`, `429.json`, `5xx.json`, `content_refused.json`, etc.)
- **Recorded responses:** nightly job hits sandbox providers with a canonical set of inputs, updates fixtures — keeps mocks aligned with provider evolution

### 16.4 Integration testing

- **Per PR:** all mocks; fast; covers happy + failure paths for every adapter method
- **Nightly (staging):** real providers; end-to-end scenarios (audit an example URL → draft outreach → send via test Workspace → mock reply → classify) validated against real APIs

### 16.5 Production validation

Post-deploy, a **synthetic canary suite** runs against production:

1. Supabase `/api/ready` — passes if DB + Auth reachable
2. Anthropic — one `hello-world` completion via the Router
3. OpenAI — one embedding + one classification
4. Browserless — audit of `example.com`
5. Gmail — send from `hello@verocrest.app` to itself
6. Calendar — book a slot on the `canary` calendar and verify webhook
7. Resend — send to `deliverability-health@verocrest.app` and verify `email.delivered` webhook

Total run time < 3 minutes. Failure of any canary blocks the deploy.

### 16.6 Chaos + fault injection

- v0.1: manual only (documented runbook in `16_Deployment.md` — kill a provider connection, trigger circuit breaker, verify graceful degradation)
- Phase 3+: automated chaos schedule against staging

---

## 17. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | Adapter-first architecture — no vendor SDK imported outside `packages/platform-integrations/*` | Escape hatches in `03` §13 require true isolation; ESLint enforces |
| 2026-07-01 | Interfaces stable, vendors swappable | Aligns with `09` §2.5 Router provider abstraction and `03` §3.13 Browserless swap path |
| 2026-07-01 | OAuth tokens in `integration_connections` / `calendar_connections`, Vault-encrypted | Matches `04` §11.2, §19; consistent per-workspace isolation |
| 2026-07-01 | Supabase Auth issues JWT; our Resend template delivers verification/reset emails | Combines Supabase's token machinery with our brand voice |
| 2026-07-01 | Storage upload uses signed-URL flow with pre-verification + post-registration | Avoids multipart body handling on `/api/*`; matches `03` §3.9 and `10` §9.11 |
| 2026-07-01 | Realtime channels workspace-scoped; RLS-aware Realtime policies enforce isolation | Consistent with `03` §11.1 |
| 2026-07-01 | Anthropic-primary for drafts; OpenAI-primary for structured; embeddings always OpenAI | Frozen in `09` §3.11 and §11 |
| 2026-07-01 | Circuit breakers per provider in-process; state not persisted across serverless invocations in v0.1 | Simpler; acceptable at MVP volume; Phase 3+ can promote to shared state |
| 2026-07-01 | Prompt caching enabled where providers support it | Cost optimization per `09` §6.5 |
| 2026-07-01 | Browserless session concurrency semaphore per adapter matching plan tier | Prevents overrun; queue via Inngest with backpressure |
| 2026-07-01 | Browserless webhooks used for session events; reconciled with audit rows | Aligns with `10` §8.4 |
| 2026-07-01 | Gmail scopes minimal: send + readonly + metadata | Least privilege; matches user consent expectations |
| 2026-07-01 | Gmail Push (Pub/Sub) as primary reply detection; 5-min polling fallback | Frozen decision per `05` §17 ASM-FLOW-001; recovery per §7.6 |
| 2026-07-01 | Gmail `users.watch` re-registration via nightly cron; drift handling with `historyId` reconciliation | Consistent with Gmail's stated 7-day watch expiry |
| 2026-07-01 | Google Calendar `events.watch` channels re-registered nightly | Same 7-day expiry pattern |
| 2026-07-01 | `freebusy.query` result cached 60s per (link, month) | Reduces API pressure; slot decisions rarely change within window |
| 2026-07-01 | Resend `notifications.verocrest.app` as sending subdomain; SPF/DKIM/DMARC-verified | Isolates transactional reputation from marketing surfaces |
| 2026-07-01 | Reserved providers ship only interface types in v0.1; no SDK dependency | Prevents accidental usage; aligns with `06` §9 phased scope |
| 2026-07-01 | Every failure code maps to `05` §14 / `10` §14 categories at the adapter boundary | Feature code never sees raw provider errors |
| 2026-07-01 | Synthetic canary suite blocks deploys on failure | Higher signal than post-deploy monitoring alone |
| 2026-07-01 | Local mode swaps every provider to mocks; developer can work offline | Reduces dev-loop friction; keeps costs at $0 during development |
| 2026-07-01 | API keys rotated quarterly; OAuth client secrets annually | Standard security hygiene; documented runbook in `16_Deployment.md` |
| 2026-07-01 | Distributed tracing (OTel) not shipped in v0.1 | Consistent with `10` §13.2; adapter spans as structured logs suffice at MVP |
| 2026-07-01 | Provider content-policy refusals surface as `AI_CONTENT_REFUSED` with user prompt to adjust inputs | Rare in v0.1 usage; explicit UX beats mystery failure |

---

## 18. Resolved Decisions

Every question that could remain open is decided here:

1. **Vendor SDK isolation** → strict; ESLint-enforced (§2, §17)
2. **OAuth token encryption** → Supabase Vault, per-workspace key (§3.8, §11.5)
3. **Access token refresh strategy** → lazy refresh 60s before expiry with `FOR UPDATE` concurrency lock (§11.3)
4. **Anthropic model default** → `claude-sonnet-5-latest` via env override (§4.11)
5. **OpenAI embedding model** → `text-embedding-3-small` (1536 dims) (§5.11, matches `04`/`09`)
6. **Browserless concurrency** → 6 (matches v0.1 plan; overrideable via `BROWSERLESS_MAX_CONCURRENT`)
7. **Browserless viewport strategy** → mobile 375×812 + desktop 1440×900 per audit (§6.4)
8. **Gmail scopes** → send + readonly + metadata + identity (§7.3)
9. **Gmail send retry policy** → exponential backoff × 3 + Inngest queue on persistent failure (§7.7)
10. **Calendar scopes** → readonly + events (§8.3)
11. **Booking event conferencing** → Google Meet auto-created (`conferenceDataVersion=1`) (§8.4)
12. **Resend sending domain** → `notifications.verocrest.app` (§9.4)
13. **Resend bounce policy** → flag user account on primary-email bounce (§9.5)
14. **Circuit breaker duration** → 30s (AI providers), 60s (non-AI providers) (§12.9)
15. **Retry attempts across providers** → 3 same-provider + 1 cross-provider for AI; 3 same-provider only for non-AI (§4.7, §5.7, §7.7)
16. **Sandbox testing tier** → dedicated staging Supabase + dev API keys with monthly caps (§16.2)
17. **Local mock coverage** → every provider has a mock path (§16.1)
18. **Canary suite** → 7 checks post-deploy, blocks on failure (§16.5)
19. **API key rotation cadence** → quarterly; OAuth client secrets annually (§14.3)
20. **Content refusal handling** → user-facing `AI_CONTENT_REFUSED`; log for prompt review (§14.1)

No open questions remain on external integrations. Any new ambiguity discovered during `12_Roadmap.md` will surface there.

---

## 19. Approval Gate

To move to `12_Roadmap.md`, the founder must sign off on:

1. **Adapter-first architecture** with SDK-import ESLint enforcement (§2, §17)
2. **Supabase spec** including Auth, Postgres, Storage, Realtime, Vault, and no-Edge-Functions posture (§3)
3. **Anthropic spec** including Claude Sonnet 5 as primary-draft, tool-use fallback for structured, prompt caching (§4)
4. **OpenAI spec** including structured-output primary, embeddings, batch reindex concurrency (§5)
5. **Browserless spec** including concurrency semaphore, viewport strategy, timeout budgets, self-host escape hatch (§6)
6. **Gmail spec** including scopes, Pub/Sub push + polling fallback, watch re-registration cron (§7)
7. **Calendar spec** including scopes, `freebusy` caching, events.watch re-registration cron (§8)
8. **Resend spec** including `notifications.verocrest.app` sending domain, delivery webhook, bounce policy (§9)
9. **Reserved future integrations** as interface-only stubs (Stripe, DocuSign, Slack, Xero, QuickBooks, Zapier, n8n) — no SDK dependencies added in v0.1 (§10)
10. **OAuth lifecycle** including token encryption via Vault, lazy refresh, revocation on disconnect (§11)
11. **Configuration matrix** (§12) — env vars, versions, timeouts, retries, circuit breakers, rate-limit strategies per provider
12. **Security posture** — secret management, webhook verification, encryption in transit and at rest, least privilege, quarterly rotation, audit logging (§13)
13. **Failure handling** — provider errors mapped to `05` §14 / `10` §14 codes at the adapter boundary; feature code never sees raw provider errors (§14)
14. **Observability** — structured logs, metrics per adapter, provider latency dashboards, cost metrics (§15)
15. **Testing strategy** — offline mocks, sandbox staging, integration testing, synthetic canary suite blocking deploys (§16)

Once signed off, `12_Roadmap.md` will produce the phased delivery plan across Act I (v0.1 through MVP acceptance) and the Phase 2 / Phase 3 / Future SaaS milestones — grounded in the modules and integrations locked by `01–11`.

---

*End of 11_External_Integrations.md*

---

**Should I continue to the next blueprint document (`12_Roadmap.md`)?**

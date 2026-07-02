# 03 — System Architecture

**Document:** System Architecture
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint — Core Engine First, rev 2)
**Status:** Approved with revisions
**Owner:** Founder / CTO
**Depends on:** `01_Vision.md`, `02_Product_Requirements.md`
**Last updated:** 2026-07-01

---

## 0. How to read this document

This is the **architectural constitution** of Verocrest OS Version 0.1. Every implementation decision (framework choice, database schema, deployment topology, security control) must trace back to a decision in this document.

If a downstream document (schema, module spec, deployment plan) contradicts what is written here, this document wins until it is formally amended.

**This document is scoped to Version 0.1 (Core Engine First).** Phase 2, Phase 3, and Future SaaS architecture concerns are noted but not designed here — they get their own architecture addenda when their triggers fire.

**This revision (rev 2) adds three load-bearing architectural concepts** that shape everything downstream:
- **Lead Intelligence Engine** (§6) — the primary differentiator, elevated from "scattered features" to a first-class subsystem.
- **AI Agent Layer** (§7.6) — architected in v0.1 even though not activated until Phase 3, so retrofitting is not needed.
- **Agency Event Bus** (§8) — every meaningful business action is a standardized event; the subscription surface for automations and future agents.

---

## 1. Guiding Principles

Nine principles drive every architectural choice below. They are ordered — the earlier ones outrank the later.

1. **Simplicity over cleverness.** The right architecture for a solo founder shipping a differentiated product in 90 days is *the smallest thing that works*. Every added moving part is a tax on velocity.
2. **Managed over self-hosted (until it hurts).** Vercel + Supabase + Inngest + Browserless replace a full DevOps team. We pay the vendor tax until scale or cost forces a swap.
3. **Escape hatches by design.** Every third-party dependency is behind an interface. When we outgrow Supabase, we swap Postgres providers — we don't rewrite the app.
4. **Multi-tenant from day one.** Row-Level Security at the database layer. Not application-layer filtering. Never.
5. **AI is a first-class subsystem, not a library call.** All AI calls flow through the Model Router; nothing else in the codebase imports vendor SDKs directly.
6. **Events over direct calls.** Every meaningful business action emits a typed event on the Agency Event Bus. Consumers subscribe. Emitters never know who is listening.
7. **Durable execution for long jobs.** Website audits, LLM chains, and outreach sequences run in a background-job runtime that survives restarts, retries on failure, and is observable end-to-end.
8. **Type safety end-to-end.** TypeScript strict; Zod-validated boundaries at every request; typed events for background jobs.
9. **Observable by default.** Every request has an ID. Every AI call is metered. Every job is traceable. Debugging bad AI output six months later must be possible.

---

## 2. Architecture at a Glance

### 2.1 High-level topology

```
                             ┌──────────────────────┐
                             │       Users          │
                             │ (browsers, desktop)  │
                             └──────────┬───────────┘
                                        │ HTTPS
                                        ▼
                             ┌──────────────────────┐
                             │      Vercel Edge     │
                             │  (Next.js 15 App)    │
                             │  UI + Server Actions │
                             │  + Route Handlers    │
                             └────┬────────┬────────┘
                                  │        │ emit events
                                  │        │
       ┌──────────────────────────┘        └────────────────────────┐
       │                                                             │
       ▼                                                             ▼
┌──────────────┐                                          ┌────────────────────────┐
│  Supabase    │                                          │  AGENCY EVENT BUS      │
│ ──────────── │                                          │  (Inngest)             │
│  Postgres 16 │◀─── read/write ─────────────────────────▶│ ────────────────────── │
│  + pgvector  │                                          │  standardized business │
│  + RLS       │                                          │  events + durable      │
│  Auth        │                                          │  workflows + cron      │
│  Storage     │                                          └───┬──────┬────────┬────┘
│  Realtime    │                                              │      │        │
└──────┬───────┘                                              │      │        │
       │                                                      │      │        │
       │      ┌───────────────────────────────────────────────┘      │        │
       │      │                                                       │        │
       │      ▼                                                       ▼        ▼
       │ ┌──────────────────────────────────────────────┐   ┌──────────────────────────┐
       │ │      LEAD INTELLIGENCE ENGINE (LIE)          │   │  AI SUBSTRATE            │
       │ │ ──────────────────────────────────────────── │◀──│ ──────────────────────── │
       │ │ • Website Intelligence  (auditor + deltas)   │   │  Model Router            │
       │ │ • Relationship Intelligence (profile, score) │   │  Prompt Registry         │
       │ │ • AI Memory  (pgvector-backed, RLS-isolated) │   │  Memory Service          │
       │ │ • Opportunity Scoring (fit × readiness)      │   │  Cost + HITL controls    │
       │ │ • Outreach Queue (next-best-action ranked)   │   │  Agent Layer (Phase 3+)  │
       │ └────────┬─────────────────────────────────────┘   └──────┬─────────────┬─────┘
       │          │                                                 │             │
       │          ▼                                                 ▼             ▼
       │  ┌───────────────┐                                ┌──────────────┐ ┌──────────────┐
       │  │  Browserless  │                                │  Anthropic   │ │   OpenAI     │
       │  │  (headless    │                                │  Claude S5   │ │  GPT-class   │
       │  │   Chrome)     │                                │  (primary)   │ │  (fallback)  │
       │  └──────┬────────┘                                └──────────────┘ └──────────────┘
       │         │ audits
       │         ▼
       │  ┌───────────────┐
       │  │  Target web   │
       │  │  properties   │
       │  └───────────────┘
       │
       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Resend     │  │  Gmail API   │  │   Axiom      │  │   Sentry     │
│  (system +   │  │  (outreach   │  │ (structured  │  │  (errors)    │
│  transact.)  │  │   send)      │  │  logs)       │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

Three concepts to absorb from the diagram:

- The **Lead Intelligence Engine** is a distinct subsystem (§6), not a scattered set of features. It is Verocrest OS's differentiator.
- The **AI Substrate** (§7) includes an **Agent Layer** whose primitives exist from v0.1 even though specialized agents don't ship until Phase 3+.
- The **Agency Event Bus** (§8) is how everything else composes. Every meaningful action emits a standard event; consumers subscribe.

### 2.2 Layered view

- **Presentation layer** — Next.js RSC + client components, TanStack Query for server state, shadcn/ui primitives, Tailwind tokens
- **Application layer** — Server Actions + Route Handlers, module-scoped services
- **Domain layer** — pure TypeScript entities and use cases, no framework leakage
- **Subsystem layer (LIE)** — Website Intelligence + Relationship Intelligence + AI Memory + Opportunity Scoring + Outreach Queue as a coherent whole
- **AI substrate** — Model Router, Prompt Registry, Memory service, Agent primitives
- **Event Bus** — Agency Event Bus (Inngest) with standardized business events
- **Data layer** — repository interfaces per module → Postgres via Supabase; MemoryStore interface → pgvector
- **Integrations** — thin adapters (Google, Browserless, Resend) behind stable interfaces

### 2.3 Runtime environments

| Env | Purpose | Data | Access |
|---|---|---|---|
| **local** | Founder development | Supabase local (Docker) or a dedicated dev project | Local only |
| **preview** | Per-PR previews for validation | Ephemeral Supabase branch (Supabase Branching) or shared dev DB | Vercel preview URL, protected |
| **staging** | Pre-prod integration testing | Dedicated Supabase staging project | Internal only |
| **production** | Live | Dedicated Supabase prod project (**US-East region**) | Public |

**No secrets are shared across environments.** Each env has its own Supabase project, Anthropic key, Google OAuth credentials, and Resend domain.

---

## 3. Technology Choices — With Rationale and Alternatives Considered

Each choice records: **the pick**, **why**, **what we rejected**, and **the escape hatch**. Approved decisions are marked ✅.

### 3.1 Frontend framework

- **Pick:** Next.js 15 (App Router) with React Server Components, TypeScript in strict mode.
- **Why:** Server components collapse frontend + backend for a solo team; server actions eliminate an API surface; Vercel-native deployment; largest ecosystem for the stack.
- **Rejected:** Remix, SvelteKit (smaller ecosystems); SPA + separate backend (doubles deployment surface).
- **Escape hatch:** none needed; component logic reusable in React Native/Expo if we ever go native mobile.

### 3.2 UI system

- **Pick:** Tailwind CSS + shadcn/ui + Radix UI primitives + Lucide icons + `class-variance-authority` for variant styling.
- **Why:** shadcn/ui gives premium primitives without lock-in (source lives in our repo); aligns with `08_Design_System.md` token discipline.
- **Rejected:** MUI, Chakra (heavy, wrong aesthetic); Ark UI, Park UI (smaller ecosystems).
- **Escape hatch:** shadcn source is in our repo; nothing to swap.

### 3.3 State management

- **Pick:** TanStack Query for server state; `useState`/`useReducer` + React Context sparingly for local UI state; URL as state for filters and views.
- **Why:** most state is server state; Query handles cache invalidation, optimistic updates, background refetch.
- **Rejected:** Redux, Zustand (no global-store use case yet).
- **Escape hatch:** add Zustand later if any client-heavy view demands it.

### 3.4 Backend/API topology

- **Pick:** Next.js Server Actions for mutations; Route Handlers for webhooks, exports, public endpoints. **Monolith deployed as one Vercel project.**
- **Why:** one codebase, one deployment; server actions provide typed RPC-style mutation with automatic CSRF handling. Splitting services at MVP is premature.
- **Rejected:** tRPC (Server Actions cover it), NestJS backend (over-engineered), GraphQL (unneeded surface).
- **Escape hatch:** module boundaries (§5) enable extraction of a heavy module (e.g. Website Auditor) to a dedicated service without a re-architecture.

### 3.5 Database

- **Pick:** Postgres 16 via **Supabase Pro** with `pgvector` extension enabled. **Region: US-East (confirmed).** ✅
- **Why:** Postgres is the right primitive; Supabase bundles auth + DB + storage + realtime with proper role model. RLS satisfies NFR-SEC-003. US-East minimizes latency to Anthropic + OpenAI + primary ICP.
- **Rejected:** PlanetScale (MySQL, no RLS, no pgvector); Neon (no bundled auth/storage); Firestore/DynamoDB (schemaless is wrong for a relational domain).
- **Escape hatch:** schema is portable Postgres SQL. Migrate to self-hosted Postgres (Neon dedicated, RDS, Fly Postgres) when trigger in §13 fires.

### 3.6 ORM / query layer

- **Pick:** **Drizzle ORM** with `postgres.js` driver, migrations via `drizzle-kit`.
- **Why:** thin, TypeScript-first, SQL-shaped API; no hidden N+1 magic; readable migrations; works well with Supabase's connection pooler.
- **Rejected:** Prisma (heavier runtime, historical pooling issues on serverless, slower codegen); Kysely (Drizzle has slightly better schema-first DX); raw SQL (no result type safety).
- **Escape hatch:** Drizzle schemas portable across Postgres providers.

### 3.7 Multi-tenancy strategy

- **Pick:** **Shared-schema multi-tenancy with Row-Level Security (RLS) at the Postgres layer.** Every business table carries mandatory `workspace_id`; every RLS policy filters on a session-scoped GUC (`app.workspace_id`).
- **Why:** RLS makes cross-tenant leakage a database-enforced impossibility; cheaper than per-tenant DBs; sufficient for 500+ workspaces on a single Postgres node.
- **Rejected:** schema-per-tenant (migration cost, connection waste); database-per-tenant (right at enterprise scale, not now — kept as escape hatch); app-layer filtering only (one missing `WHERE` becomes a breach).
- **Escape hatch:** at Future SaaS scale, workspace-region routing lets enterprise tenants migrate to dedicated DBs.

### 3.8 Auth

- **Pick:** **Supabase Auth** with email + password (mandatory verification), Google OAuth, and magic-link sign-in.
- **Why:** solves verification, sessions, refresh tokens, OAuth, and password-hash policy. JWT carries `workspace_id` custom claim for RLS.
- **Rejected:** Auth.js (owns too much of the surface), Clerk (cost scales badly, not tied to our Postgres).
- **Escape hatch:** identities live in Supabase `auth` schema; migration to self-hosted GoTrue possible without re-auth.

### 3.9 File storage

- **Pick:** **Supabase Storage** with per-workspace signed URLs.
- **Why:** integrated with Supabase Auth; RLS-style bucket policies; cheap.
- **Rejected:** S3 direct (adds AWS account and IAM surface).
- **Escape hatch:** Supabase Storage is S3-compatible; migration is `aws s3 sync` + policy port.

### 3.10 Background jobs / durable execution

- **Pick:** **Inngest** as the durable-execution runtime for the Agency Event Bus. ✅
- **Why:** website audits (30–90s), outreach sequences (multi-day), enrichment fan-out — all need real durability, retries with state, cron, and dashboards. Vercel serverless functions cannot deliver. Inngest's step functions + typed events + observability fit exactly.
- **Rejected:** Vercel Cron (no durability); Trigger.dev (comparable, either defensible — Inngest chosen for typed event schemas + cleaner Next.js integration); Temporal (heavy ops); BullMQ+Redis (self-hosted queue = ops burden).
- **Escape hatch:** all jobs are typed events dispatched through a thin `platform-jobs/` layer; migrating to Temporal or self-hosted Inngest is a runtime swap, not a code rewrite.

### 3.11 AI Model Router

- **Pick:** custom TypeScript module. Feature code calls capabilities (`draftOutreach`, `scoreLead`, `auditWebsite`, `extractProposalFields`), never vendor SDKs.
- **Providers:** **Anthropic Claude Sonnet 5** primary for reasoning + drafting; **OpenAI GPT-class** for structured extraction + JSON-schema-strict outputs. **Both providers funded at MVP.** ✅ Open-weight (Groq-hosted Llama or similar) reserved as cost-fallback for large-volume enrichment.
- **Why:** AI-PROV-001 hard requirement. Provider outages, price changes, and capability shifts must not touch feature code.
- **Rejected:** LangChain/LlamaIndex (heavy abstractions, obscure debugging); Vercel AI SDK only (great streaming, but not a router — we use its `streamText`/`generateObject` inside our router).
- **Escape hatch:** adding a provider is one adapter file.

### 3.12 AI Memory substrate

- **Pick:** **pgvector** in Supabase Postgres, with structured metadata alongside vectors, RLS-isolated by `workspace_id`.
- **Why:** one data store; RLS gives the workspace-isolation guarantee (FR-MEM-005, AI-MEM-006) at the DB layer.
- **Rejected:** Pinecone, Weaviate, Turbopuffer (operational surface + second query layer at MVP; kept as escape hatch).
- **Escape hatch:** MemoryStore is a typed interface. Documented swap trigger: >10M vectors OR >300ms P95 similarity search.

### 3.13 Web scraping (Website Auditor)

- **Pick:** **Browserless.io** (managed headless Chrome) called from Inngest jobs, with a small Playwright wrapper in our codebase.
- **Why:** Playwright on Vercel serverless is not viable (memory, cold start, no persistent Chrome). Self-hosting Playwright at MVP is ops burden. Browserless is priced per session and reliable.
- **Rejected:** BrightData/Apify (scraping-at-scale tooling, not on-demand audits); self-hosted Playwright at MVP (better economics at high volume, unnecessary now).
- **Escape hatch:** Playwright wrapper is generic; swap URL from Browserless to self-hosted at ~$1500/mo threshold.

### 3.14 Email

- **Pick:**
  - **Resend** for system + transactional email (verification, magic link, notifications, reminders) with dedicated Verocrest OS domain (SPF/DKIM/DMARC configured).
  - **Gmail API** (via each member's OAuth grant) for **outreach** sends. Each user sends from their own inbox. **Verocrest agency will use a dedicated Google Workspace for outreach hygiene.** ✅
- **Why:** transactional needs deliverability + templates; outreach needs the user's actual inbox (deliverability + reply threading). Dedicated Google Workspace isolates outreach reputation from personal mail and lets us manage SPF/DKIM per domain properly.
- **Rejected:** Postmark (comparable to Resend, either works); SendGrid (legacy, worse DX); Instantly/Smartlead direct at MVP (Phase 2 — MVP is Gmail because reputation warm-up is not needed).
- **Escape hatch:** `OutboundEmailAdapter` interface separates channel from feature. Adding Instantly/Smartlead in Phase 2 is one adapter file.

### 3.15 Payments

- **Pick (MVP):** none in-product. Deposit invoices sent as a **Stripe hosted Payment Link** generated outside the OS. Status tracked manually inside the deal.
- **Pick (Phase 2):** Stripe (Payments + Invoicing) fully integrated.
- **Why:** MVP goal is "close the deal," not "run the books." Adding Stripe integration at MVP is a week that shifts nothing on the acquisition side.
- **Escape hatch:** Stripe SDK will slot behind an `InvoicingProvider` interface in Phase 2.

### 3.16 Hosting & CDN

- **Pick:** **Vercel** (Frontend + Server Actions + Route Handlers) with Edge caching, plus **Supabase** as the data plane. Both regions: US-East.
- **Why:** minimal ops; global CDN; git-integrated deploys; preview URLs per PR.
- **Rejected:** Fly.io/Railway (great for containers, we don't have any yet); AWS Amplify (worse Next.js integration).
- **Escape hatch:** when serverless cold-starts or per-invocation pricing hurt, move AI-heavy routes to Fly.io/Modal workers.

### 3.17 Observability

- **Pick:** ✅
  - **Axiom** — structured log ingestion (JSON), long retention.
  - **Sentry** — error tracking (frontend + backend).
  - **Vercel Analytics + Speed Insights** — Core Web Vitals + traffic.
  - **Inngest built-in dashboard** — job + event traceability.
- **Why:** cover logs + errors + perf + async execution; free/cheap tiers sufficient at MVP.
- **Rejected:** Datadog, New Relic (overkill, expensive); Better Stack (fine consolidated option — Sentry+Axiom preferred for best-in-class per surface).
- **Escape hatch:** structured-log format is vendor-agnostic; migrating to Datadog is an ingest change.

### 3.18 CI / CD

- **Pick:** GitHub Actions for CI (typecheck, unit tests, prompt regression tests, tenancy fuzzer, security scan) → Vercel handles CD (preview per PR, production on `main`).
- **Rejected:** CircleCI, Buildkite (unnecessary).

### 3.19 Secrets management

- **Pick:** Vercel Environment Variables for runtime secrets; Supabase Vault for per-workspace encrypted OAuth tokens (Gmail, Calendar).
- **Rejected:** Doppler (fine alternative; adopt if secret count grows unmanageable).

### 3.20 Monorepo tool

- **Pick:** **Turborepo** with pnpm workspaces. ✅
- **Why:** caching wins even at solo scale; deterministic task graphs; excellent Vercel + Next.js integration; free tier is generous.
- **Rejected:** plain pnpm workspaces (works, but Turbo's cache pays for itself in the first week); Nx (heavier, more opinionated than we need).
- **Escape hatch:** Turbo is thin; removing it is a one-day migration to plain pnpm.

---

## 4. Multi-Tenancy Deep Dive

Because RLS is load-bearing, the model is spelled out here.

### 4.1 Identity & workspace claim

- A `user` (Supabase auth entity) may belong to one or more `workspaces` via a `workspace_members` join table with `role` (`owner` | `member` in MVP).
- On sign-in, the client requests an *active workspace* via a session-scoped cookie (`vc_active_workspace`).
- The Server Action / Route Handler validates the user is a member of that workspace, then sets a Postgres session variable (`SET LOCAL app.workspace_id = ...`) at the start of every request. RLS policies read this variable.

### 4.2 RLS policy shape (representative)

Every business table has a policy of the form:

```sql
CREATE POLICY workspace_isolation ON <table>
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);
```

Plus a superuser bypass for admin ops (guarded by a dedicated service role, never used from the app).

### 4.3 Storage isolation

- File paths: `workspace/<workspace_id>/<entity>/<file_id>`.
- Signed-URL generation only occurs after verifying membership at the application layer AND enforcing a Storage policy mirroring the RLS pattern.

### 4.4 Cache & AI isolation

- Any cache key includes `workspace_id` as a prefix.
- Vector similarity queries always filter `WHERE workspace_id = ...` in SQL before the vector operator.
- The Model Router refuses to run without a workspace context; no "global" AI call exists.
- Memory Service reads and writes are RLS-scoped and additionally include `workspace_id` in every embedding metadata payload for defence-in-depth.

### 4.5 Automated verification

- A dedicated integration test suite ("Tenancy Fuzzer") issues requests as workspace A with tokens for workspace B (and vice versa) across every business endpoint. Any 200 response is a build-blocking failure.

---

## 5. Module Boundaries in the Monolith

We ship a monolith, but organize it as if we might split it later. Each module has a stable public interface and does not reach into others' internals.

```
/apps/web                        (Next.js app)
  /app                           (routes, layouts, server actions)
  /components                    (shared UI primitives)

/packages/
  /domain-auth                   (identity, workspaces, sessions, members)
  /domain-contacts               (contacts core)
  /domain-relationship           (relationship_profile — read/writer for LIE)
  /domain-leads                  (lead ingestion, dedup)
  /domain-scoring                (fit + readiness + opportunity score)  ← LIE
  /domain-website-intelligence   (audit engine, delta analysis)         ← LIE
  /domain-personalization        (outreach drafting, Loom scripts)
  /domain-outreach-queue         (next-best-action ranking)             ← LIE
  /domain-sales                  (deals, pipeline, proposals)
  /domain-reminders              (reminders + snooze)
  /domain-dashboard              (widgets, aggregations)
  /domain-memory                 (MemoryStore, retrieval, redaction)    ← LIE
  /platform-ai-router            (Model Router, prompts, streaming, agent primitives)
  /platform-event-bus            (Inngest events, typed contracts, subscribers)
  /platform-integrations         (Google, Browserless, Resend adapters)
  /platform-observability        (logger, request-id, metrics helpers)
  /platform-db                   (Drizzle schema + repositories base)
  /platform-tenancy              (workspace guard, GUC setter, RLS helpers)
  /ui-kit                        (shadcn primitives + tokens)
  /config                        (env schema, feature flags)
```

**Enforcement:**
- ESLint rule: modules may import from `/platform-*` and `/ui-kit` and `/config` freely; **cross-domain imports are forbidden** (`domain-sales` cannot import from `domain-leads`; they communicate via events on `platform-event-bus`, or via query DTOs exposed at the `apps/web` layer).
- Every module exposes an `index.ts` public surface. Internal folders are private.
- Every module has a `README.md` and an owner (currently: founder).

**LIE-tagged modules** (marked `← LIE` above) compose the Lead Intelligence Engine — see §6. They still respect module boundaries, but they share an implicit contract: emit events on state change, read/write through interfaces, honor per-workspace policy.

**Why this shape:** if a module ever needs to become a service (e.g. Website Auditor at scale), the extraction is a physical move, not a semantic redesign.

---

## 6. Lead Intelligence Engine (LIE)

The Lead Intelligence Engine is the **primary differentiator** of Verocrest OS and the reason Version 0.1 is called "Core Engine First." It is **not a module** — it is a **subsystem** that composes five modules into a coherent intelligence layer.

### 6.1 Composition

| Component | Role | Module | Data primitives |
|---|---|---|---|
| **Website Intelligence** | Audits target websites; produces graded findings + prescriptions; tracks deltas over time | `domain-website-intelligence` | `audits`, `audit_findings`, `audit_deltas` |
| **Relationship Intelligence** | Tracks per-contact engagement, sentiment, cadence, readiness | `domain-relationship` (writer) + `domain-contacts` (consumer) | `relationship_profile`, `activity_timeline` |
| **AI Memory** | Durable workspace-scoped context across all AI operations | `domain-memory` + `platform-ai-router` | `memory_vectors`, `memory_metadata` |
| **Opportunity Scoring** | Fit score (ICP match) + Readiness score (timing) → Opportunity Score | `domain-scoring` | `lead_scores`, `score_history`, `scoring_rubrics` |
| **Outreach Queue** | Prioritized queue of leads ready for the next best action | `domain-outreach-queue` | `outreach_queue_items`, `next_best_action` |

### 6.2 Why a subsystem, not five features

Every one of these components reads from and writes to the others. They form a closed loop:

```
        Website Intelligence
              │  audit findings
              ▼
      Opportunity Scoring ──▶ Outreach Queue
              ▲                     │
              │ score signals       │ selects lead
              │                     ▼
      Relationship Intelligence ◀── Outreach drafted / sent / replied
              ▲                     │
              │ interactions        │ result
              │                     ▼
              └──────── AI Memory ◀─
```

Modeling them as scattered features leads to duplicated pipelines, inconsistent state, and lost context. Modeling them as a subsystem gives us:
- One shared data plane (§6.3)
- One event contract (Agency Event Bus, §8)
- One AI substrate consumer — all LIE components call the Model Router + Memory Service, never their own LLM SDK
- One place to reason about tenancy, cost, and observability

### 6.3 Shared data plane

All LIE components share:
- The same Postgres schema (RLS-enforced by workspace)
- The same vector store (pgvector, same DB)
- The same Action Log for reproducibility
- The same event bus for asynchronous chaining

Nothing in LIE is siloed. A change to Relationship Intelligence recomputes an Opportunity Score, which re-ranks the Outreach Queue, which surfaces a new "Today's Gold Lead" on the Dashboard — all via events, all traceable end-to-end.

### 6.4 Opportunity Scoring: fit + readiness

Opportunity Scoring is **distinct from raw lead scoring**. It is a composite:

- **Fit Score (0–100)** — how well this contact matches the workspace's ICP rubric (industry, size, geography, tech stack, Website Intelligence findings).
- **Readiness Score (0–100)** — how *ready* this contact is to receive outreach right now (engagement recency, sentiment, cadence rules, outreach cooldowns, Memory signals like "corrected once — do not repeat this pitch").
- **Opportunity Score** — a workspace-configurable function of Fit × Readiness (default: `sqrt(fit * readiness)`, capped at 100). This is the number that ranks the Outreach Queue.

**Rationale.** A high-fit but cold contact should not be at the top of today's queue; a warm but medium-fit contact often should. Splitting fit and readiness reflects how agencies actually decide who to reach out to today, and gives us two independent signals to tune.

**FR mapping.** Extends FR-LEAD-003 (Lead Score) to explicitly track fit + readiness + composite. `04_Database_Design.md` will represent these as three columns on `lead_scores`, not one.

### 6.5 Outreach Queue

The Outreach Queue is a **materialized, ranked list** of leads with a computed **Next Best Action** (draft email / draft DM / send Loom / schedule follow-up / disqualify).

- Refreshed on any relevant event (score change, activity, cooldown expiry) via the Agency Event Bus
- Filtered by workspace, owner, channel, and score threshold
- The primary source of `FR-DASH-001` (Today's Gold Leads)
- The primary subscription surface for the future **Outreach Agent** (§7.6)

The queue is a materialized view backed by a table (not a live query) because dashboard reads must be sub-100ms.

### 6.6 Boundary against feature modules

- Feature modules (Contacts, Leads, Pipeline, Dashboard) *consume* LIE outputs.
- LIE components emit events on state change; features subscribe.
- **No feature module writes directly to `relationship_profile`, `lead_scores`, `outreach_queue_items`, or `memory_vectors`** — all writes go through LIE services.
- This boundary is enforced by ESLint import rules per §5 and by database-column ownership documented in `04_Database_Design.md`.

### 6.7 Future-proofing for the Agent Layer

Every LIE component is designed to be **agent-friendly** from day one:
- Deterministic reads with stable interfaces
- Standardized event emissions on state change (§8)
- Idempotent write operations with reversibility flags
- Confidence + explainability payloads on every AI-derived value

**This means when the Lead Research Agent, Website Audit Agent, and Outreach Agent come online (Phase 3+), they consume the same interfaces humans do today.** No parallel plumbing.

### 6.8 Observability specific to LIE

- Every LIE state change is a bus event (see §8.3 catalogue).
- Every scoring recomputation logs input signals + rubric version + resulting delta.
- Every audit run logs Browserless session, LLM calls, and total cost.
- Every Memory read/write logs scope, subject, and calling capability.
- LIE-specific dashboard: **Lead-to-Meeting funnel** (leads ingested → scored → in queue → outreached → replied → meeting booked).

---

## 7. AI Substrate & Agent Layer

The AI substrate is the single most important architectural surface in Verocrest OS. Detailed prompt engineering, chain topology, and evaluation live in `09_AI_Architecture.md`; the load-bearing pieces below.

### 7.1 Model Router

- **Input:** capability name (`draftOutreach`, `scoreLead`, `auditWebsite`, `extractProposalFields`), inputs, workspace context, calling agent id (nullable).
- **Output:** streamed text or structured object; always with a metadata envelope (model, cost, latency, prompt version, confidence).
- **Responsibilities:** provider selection, prompt-template versioning, retry, timeout, budget check, cost + latency logging, fallback on provider error.
- **Providers:** Anthropic Claude Sonnet 5 (primary), OpenAI GPT-class (fallback + structured), optional Groq/Llama (bulk enrichment).

### 7.2 Prompt Registry

- Prompts live in `platform-ai-router/prompts/` as versioned TypeScript modules.
- Each prompt has: id, version, capability, template, expected output schema, examples, changelog, evaluation set reference.
- Feature and agent code refers to prompts by id + version; upgrades are explicit and version-pinned.

### 7.3 Memory Service

- Backed by pgvector + structured metadata table (see §11).
- Every AI call must read Memory first and write to it after — enforced via the Router's `withMemory({ scope, filters })` wrapper.
- Workspace isolation is RLS-enforced (§4.4).
- **Agent-attributed writes** carry `agent_id` in metadata (nullable when the actor is human) so Phase 3 agents can partition their own memory scope without breaking human context.

### 7.4 Cost management

- Each capability declares an expected model + expected token band.
- Router refuses (with graceful degrade) if the workspace has exceeded its monthly AI budget.
- Every call logs `{workspace_id, capability, model, input_tokens, output_tokens, cost_usd, latency_ms, agent_id?}`.

### 7.5 Safety & Human-in-the-Loop

- **MVP is 100% Assist tier**: every AI output is a draft; no autonomous send.
- Every AI output carries a self-reported `confidence` field (per prompt design).
- Every AI output stores inputs, prompt version, model, and retrieval hits — reproducible after the fact.
- No agent action is executed at Automate or Autonomous tier in v0.1 (Vision §4.6 endgame; tier promotion is Phase 2/3 gated on empirical safety data).

### 7.6 AI Agent Layer (architected in v0.1, activated later)

Version 0.1 is 100% human-in-the-loop. But the *architecture* to run specialized agents must exist from day one, because retrofitting agent primitives after the fact is a rewrite. Vision §4.6 makes this a requirement.

#### 7.6.1 Agent roles on the roadmap

| Agent | Consumes | Produces | Ships | Autonomy at ship |
|---|---|---|---|---|
| **Lead Research Agent** | Sourced leads (CSV, form, API) | Enriched + scored leads with Website audit + Relationship signals | Phase 3 | Assist |
| **Website Audit Agent** | Target URLs (from events or schedules) | Full audits with findings + prescriptions + confidence | Phase 3 | Assist → Automate |
| **Outreach Agent** | Outreach Queue items | Personalized drafts with citations + tone controls | Phase 3 | Assist |
| **Follow-up Agent** | Reply events + cadence rules | Next-step drafts + reminder schedules | Phase 3 | Assist → Automate |
| **Proposal Agent** | Won discovery call + audit + brief | Draft proposal ready for edit | Phase 2 (extends FR-SALES-004) | Assist |

Note: the "Proposal Agent" is the first true agent to ship, in Phase 2, as an extension of the AI Proposal Generator. It reuses all agent primitives listed below.

#### 7.6.2 Agent primitives (must exist in v0.1)

Retrofitting these later is a rewrite. Building them in v0.1 costs single-digit percent of build effort now.

1. **Agent identity + policy envelope.** Every agent action is attributed to an `agent_id`, executed inside a `workspace_id`, and constrained by a policy envelope (budget/day, tone rules, blocked domains, business-hours only, approval thresholds). Table `agent_policy_envelopes` exists in v0.1 even though empty in production.
2. **Standardized events.** Agents subscribe to Agency Event Bus events; they never poll. Every meaningful business action emits a typed event (§8).
3. **Memory read/write hooks.** Every agent action goes through Memory Service; no agent has its own memory store. Memory metadata carries `agent_id`.
4. **Model Router as the sole LLM entrypoint.** Agents never import Anthropic/OpenAI SDKs. Router accepts an `agent_context` field on every call.
5. **Action Log with reversibility flag.** Every agent-executed action is logged with input, decision, output, cost, and whether it can be reversed. Reversibility is a first-class column so Autonomous-tier actions (Phase 3+) can be automatically un-done on human veto.
6. **Autonomy tier gate.** Every action class declares a minimum tier; the runtime refuses to execute above the agent's current tier. Tier column exists on `agent_policy_envelopes`.
7. **Escalation surface.** Every agent has a canonical "ask a human" primitive that opens a review item in the workspace inbox. In v0.1 the inbox exists (as the Notifications surface) but has no agent items yet.

#### 7.6.3 How the Agent Layer plugs into existing infrastructure

```
Feature (or Event Bus)
        │
        ▼
Agent Runtime  ──▶  Policy Envelope (check tier, budget, envelope)
        │                   │
        ▼                   ▼
Memory Service  ──▶  Model Router  ──▶  Action Log
        │                   │                │
        │                   ▼                │
        │            Provider (Claude/GPT)   │
        │                                    │
        ▼                                    ▼
        Event Bus (emit result + follow-ups) │
```

#### 7.6.4 What we build in v0.1 so Agents are not a rewrite later

- ✅ Model Router with `agent_context` field on every call (unused in v0.1)
- ✅ Memory Service with `agent_id` metadata on every read/write (nullable in v0.1)
- ✅ Action Log with `agent_id`, `reversibility`, and `autonomy_tier_at_execution` columns (agent columns nullable in v0.1)
- ✅ Standardized event emissions (§8) with agent-compatible payload shapes
- ✅ `agent_policy_envelopes` table (empty for MVP, referenced by every future agent action)
- ✅ Notifications surface that can carry escalation items (unused escalation category in v0.1)

#### 7.6.5 Deferred to `09_AI_Architecture.md`

- Agent orchestration patterns (single-agent vs. multi-agent handoff)
- Long-running conversation state model
- Human-approval queue UI patterns
- Cross-agent shared context vs. isolation
- Prompt versioning strategy for agent chains
- Agent evaluation harness

---

## 8. Agency Event Bus

The Agency Event Bus is the **connective tissue** of Verocrest OS. Every meaningful business action emits a standardized event; every consumer (features, automations, future agents, integrations) subscribes to what it needs. Runtime is Inngest (§3.10).

### 8.1 Design principle

**Standardize the events, not the consumers.** The same `lead.scored` event fires whether the trigger was a manual score, a rubric change, a bulk import, or a future Lead Research Agent. Every subscriber sees the same shape.

**Emitters never know who is listening.** Adding a new subscriber (a new dashboard widget, a new automation, a future agent) never requires touching the emitter. This is what makes the bus a moat: extending the product is additive.

### 8.2 Event envelope contract

Every event on the bus has this envelope:

```typescript
{
  id: string;                    // ULID; idempotency key
  name: EventName;               // e.g. "lead.scored"
  version: number;               // schema version, monotonically increasing
  workspace_id: UUID;            // mandatory; used for isolation
  actor: {                       // who caused this
    type: "user" | "agent" | "system" | "integration";
    id: string;
  };
  subject: {                     // what the event is about
    type: "lead" | "contact" | "deal" | "audit" | ...;
    id: UUID;
  };
  payload: T;                    // event-specific typed payload
  occurred_at: ISO8601;          // when it happened (source of truth for ordering)
  emitted_at: ISO8601;           // when we serialized it
  correlation_id?: string;       // ties multi-step flows together
  causation_id?: string;         // the event that caused this one (chain traceability)
}
```

### 8.3 Standard business events (v0.1 catalogue)

Every action listed emits a versioned event. Adding a subscriber never requires touching the emitter.

| Event | Emitter | Payload shape (summary) |
|---|---|---|
| `lead.ingested` | Import flows, form, API | `{source, raw_data, dedupe_key}` |
| `lead.enriched` | Enrichment worker | `{enrichment_provider, added_fields}` |
| `lead.scored` | Scoring service | `{fit_score, readiness_score, opportunity_score, top_signals}` |
| `contact.updated` | Any contact write | `{changed_fields}` |
| `relationship.profile.recomputed` | Relationship Intelligence | `{prev, next, delta}` |
| `website.audit.requested` | User action, scheduler | `{url, depth, audit_config}` |
| `website.audit.completed` | Website Auditor | `{audit_id, overall_grade, category_grades, findings_count}` |
| `website.audit.delta` | Auditor (scheduled re-audits) | `{prev_audit_id, next_audit_id, deltas}` |
| `outreach.draft.generated` | Personalization service | `{channel, draft_id, model, citations}` |
| `outreach.sent` | Gmail integration or manual mark-sent | `{channel, message_id, contact_id}` |
| `outreach.opened` | (Phase 2 tracking) | `{message_id, opened_at}` |
| `outreach.reply.received` | Gmail push webhook | `{message_id, sentiment, classification}` |
| `outreach.queue.updated` | Outreach Queue service | `{added, removed, reordered}` |
| `meeting.booked` | Calendar / booking link | `{meeting_id, deal_id?, contact_id, scheduled_at}` |
| `meeting.completed` | User or calendar sync | `{meeting_id, notes_present}` |
| `proposal.drafted` | Proposal generator | `{proposal_id, deal_id}` |
| `proposal.sent` | User action | `{proposal_id, recipients}` |
| `proposal.viewed` | Vendor webhook (Phase 2) | `{proposal_id, viewer_id}` |
| `proposal.signed` | E-sign vendor webhook or manual mark | `{proposal_id, signed_at}` |
| `deal.stage.changed` | Pipeline UI, automation | `{deal_id, prev_stage, next_stage}` |
| `deal.won` | User action | `{deal_id, close_value, currency}` |
| `deal.lost` | User action | `{deal_id, reason}` |
| `reminder.created` | User or automation | `{reminder_id, entity_type, due_at}` |
| `reminder.due` | Scheduler | `{reminder_id, entity_type, due_at}` |
| `reminder.completed` | User action | `{reminder_id, completed_at}` |
| `ai.output.produced` | Model Router | `{capability, model, cost_usd, latency_ms}` |
| `agent.action.executed` | Agent Runtime (dormant in v0.1) | `{agent_id, tier, action_type, reversibility}` |

**Naming convention:** `<domain>.<subject>.<past-tense-action>`. Domain-first grouping makes bus dashboards readable.

### 8.4 Versioning

- Event schemas are semver-tagged; increments are additive-only where possible.
- Emitters may emit multiple versions during a migration window.
- Subscribers declare which version(s) they accept.
- The bus warns on unhandled versions in dev, drops silently in prod (with metrics).

### 8.5 Subscribers in v0.1

| Subscriber | Events consumed | Purpose |
|---|---|---|
| **Scoring service (LIE)** | `lead.enriched`, `website.audit.completed`, `contact.updated` | Recompute Opportunity Score |
| **Relationship Intelligence (LIE)** | `outreach.sent`, `outreach.reply.received`, `meeting.completed`, `proposal.viewed` | Update Relationship Profile |
| **Outreach Queue (LIE)** | `lead.scored`, `relationship.profile.recomputed`, `outreach.sent` | Re-rank queue, apply cooldowns |
| **Memory Service (LIE)** | Every AI-relevant event | Persist context |
| **Notifications** | `reminder.due`, `outreach.reply.received`, `proposal.signed`, `deal.won` | In-app + email |
| **Dashboard denormalization** | `deal.stage.changed`, `deal.won`, `outreach.sent`, `outreach.reply.received`, `meeting.booked` | Update widget summary tables |
| **Action Log** | *all* | Append-only audit trail |
| **Cost aggregator** | `ai.output.produced` | Roll up per-workspace AI spend |

### 8.6 Subscribers in future phases

- **Phase 2:** Client Portal, Automation rule engine (user-defined trigger → condition → action), n8n outgoing webhooks, Proposal Agent (first agent)
- **Phase 3:** All remaining specialized agents (Lead Research, Website Audit, Outreach, Follow-up)
- **Future SaaS:** public webhook subscriptions for third-party integrators, marketplace apps

### 8.7 Delivery guarantees

- **At-least-once** delivery (Inngest primitive). Subscribers must be idempotent — enforced via the envelope `id` (ULID) as idempotency key.
- **Ordering** within a `(workspace_id, subject_id)` scope is preserved via Inngest step ordering; global ordering is not guaranteed.
- **Backpressure** — subscribers that fall behind trigger alerts; the emitter never blocks on subscriber lag.
- **Replay** — the last 30 days of events are replayable to a specific subscriber via Inngest console (dev/staging) or a scripted CLI (prod, with audit).

### 8.8 Why the Event Bus is itself a moat

Every serious competitor eventually needs an event bus to enable automations and agents. Verocrest OS has one from day one, with a stable versioned contract. When we add the Outreach Agent in Phase 3, it subscribes to `lead.scored` and `outreach.queue.updated` — no plumbing work. When a customer wants a Zapier-style integration in Future SaaS, `webhook.subscribe` is a wrapper around the same bus.

### 8.9 Cron and scheduled work

All scheduled work emits events on the same bus rather than performing side effects directly.

- **Nightly:** score decay for stale leads, memory compaction, cost aggregation, dashboard denormalization refresh
- **Hourly:** reminder-window sweep (emits `reminder.due` events)
- **Weekly (Phase 2):** scheduled website re-audits emit `website.audit.requested`

### 8.10 Event journal in Postgres

Every event emitted is *also* written to an `event_journal` table in Postgres (workspace-scoped, RLS-enforced) as durable history independent of Inngest retention. This gives us:
- Replay beyond Inngest's 30-day window
- Cross-workspace audit and analytics (via service role)
- A migration path off Inngest if we ever swap the runtime

The journal is append-only and pruned per DATA-006 retention rules.

---

## 9. Integrations Layer

Each integration is a **thin adapter** with a stable typed interface consumed by domain modules. Adapters live in `/platform-integrations/*`.

| Integration | Purpose (MVP) | Auth | Interface |
|---|---|---|---|
| **Google OAuth** | Sign-in, Gmail send (dedicated Verocrest Workspace), Calendar read/create | OAuth 2.0 (offline) | `IdentityProvider`, `EmailSender`, `CalendarProvider` |
| **Browserless** | Headless Chrome for audits | API key (server-side) | `BrowserSession` |
| **Resend** | System + transactional email | API key | `TransactionalEmailSender` |
| **Anthropic** | LLM (via Router) | API key | `LlmProvider` |
| **OpenAI** | LLM (via Router) | API key | `LlmProvider` |

**Rules for every integration:**
1. All secrets stored via Vercel env (system-wide) or Supabase Vault (per-workspace OAuth tokens); never in code.
2. All external calls are wrapped in the Router or an adapter — feature code never talks to a vendor directly.
3. All calls are logged with request id, latency, and outcome.
4. All adapters degrade gracefully (feature is gated with a clear error, not a silent failure) per INT-009.
5. All adapters emit an `integration.<name>.error` event on failure so subscribers (dashboards, alerts) can react.

---

## 10. Security Architecture (summary)

Detail lives in `15_Security.md`. Architectural non-negotiables:

- TLS 1.3 everywhere (Vercel + Supabase enforce)
- All at-rest data encrypted (AES-256; Supabase-managed)
- RLS on every business table (§4)
- Per-workspace encryption of OAuth tokens (Supabase Vault, workspace-derived key)
- Rate limits enforced at Route Handler level and per-workspace via the AI Router
- Structured, tamper-evident Action Log (append-only table + row checksum)
- Vulnerability scanning (Snyk or GitHub Dependabot) on every PR
- CSP + secure cookie flags + SameSite=Lax
- Passwords: Argon2id via Supabase Auth defaults, breach check via HIBP API
- Every integration secret has a documented rotation runbook

---

## 11. Data Model Overview

Full schema is in `04_Database_Design.md`. Architectural rules that apply here:

- Every business table has `id` (UUID v4), `workspace_id` (UUID, indexed, RLS filter), `created_at`, `updated_at`, `deleted_at` (soft delete)
- Every mutation writes a row to `action_log` with `actor_user_id` or `actor_agent_id`, `action_type`, `subject_id`, `metadata` (JSONB), `checksum`
- Every event on the bus is mirrored to `event_journal` (workspace-scoped, RLS-enforced, append-only)
- Vectors live in a `memory_vectors` table (`id`, `workspace_id`, `scope` enum, `subject_id`, `agent_id?`, `content_hash`, `embedding vector(1536)`, `metadata` JSONB, `created_at`)
- `agent_policy_envelopes` table exists in v0.1 (empty in production; referenced by all future agent code paths)
- Money is stored as `numeric(18,4)` with `currency` (ISO 4217) alongside — never `float`
- Timestamps are `timestamptz`, stored UTC
- Enums are Postgres enums for closed sets (stage, status), text with a check constraint for evolving sets
- LIE-owned tables (`relationship_profile`, `lead_scores`, `outreach_queue_items`, `memory_*`, `audits*`) have write ACLs at the Postgres role level: only LIE services (via a dedicated Postgres role) may INSERT/UPDATE. Feature modules can only SELECT via views.

---

## 12. Performance & Scalability Plan

MVP targets are stated in NFR-PERF and NFR-SCL. Architectural approach:

- **Reads**: heavy use of RSC + server-side data fetching + Postgres indexes on `(workspace_id, ...common filters)`. Dashboard widgets are backed by summary tables refreshed via nightly jobs + realtime tick.
- **Writes**: single Postgres primary. Write throughput is not the bottleneck at MVP (~10K writes/day realistic).
- **Long AI work**: always in Inngest, never in the request path. UI polls or subscribes via Supabase Realtime.
- **N+1 avoidance**: repository methods use joins/CTEs; explicit code review checklist item.
- **Caching**: `unstable_cache` (Next.js) on read-heavy, workspace-scoped queries with short TTL; Postgres query cache does the rest.
- **Outreach Queue**: materialized table refreshed on relevant events, indexed on `(workspace_id, opportunity_score DESC)` — a sub-100ms hot path.

**Load ceiling estimate (single Supabase Pro instance):**
- ~500 workspaces
- ~5M contacts total across workspaces
- ~1M memory vectors
- P95 read latency under 250ms

Beyond that: escape hatches in §13.

---

## 13. Scaling Roadmap — Documented Escape Hatches

Each trigger below is measured continuously in production. When a trigger fires, the corresponding swap plan kicks in.

| Trigger | Swap | Effort |
|---|---|---|
| Supabase RLS query P95 > 300ms sustained | Move to self-hosted Postgres + PgBouncer + read replicas | Medium (schema portable; auth stays on Supabase or migrates to self-hosted GoTrue) |
| pgvector similarity P95 > 300ms OR > 10M vectors | Move Memory to Turbopuffer or Weaviate | Small (MemoryStore interface swap) |
| Website audit throughput bottlenecks on Browserless | Self-hosted Playwright pool on Fly.io | Small (adapter swap) |
| Vercel serverless cold-starts hurt LLM streaming | Move AI Router routes to Fly.io or Modal container | Medium (route rewrite in one module) |
| Inngest cost / SLA insufficient | Self-hosted Inngest OR migrate to Temporal | Medium (typed events port; step semantics may differ) |
| Multi-region residency required | Add EU Supabase project, workspace-region routing at the app layer | Large (Phase 3+) |
| A single module (e.g. Website Auditor) outgrows the monolith | Extract to a dedicated service behind the same interface | Medium (facilitated by module boundaries §5 and Event Bus §8) |
| Event volume exceeds Inngest replay window | Fall back to `event_journal` (§8.10) replay CLI | Small |

**Principle:** we do not prematurely trigger any of these. We measure, then move.

---

## 14. Environments, Deploy & Rollback

- **Preview per PR** — automatic on Vercel with a shared dev DB (or Supabase branch when the feature is available in our tier)
- **Staging** — a persistent `staging.verocrest.app` on `main` with a dedicated Supabase project
- **Production** — deployed from a tagged release commit on `main`; US-East region
- **Rollback** — Vercel instant rollback + Supabase point-in-time recovery (7-day window)
- **Migrations** — every migration is forward-only + backward-compatible for one release (add column → deploy → backfill → deploy → drop old). No destructive migrations tied to a code deploy.
- **Event schema migrations** — additive-only within a version; new versions require a deployed subscriber before the emitter switches.

---

## 15. Observability & Telemetry

- **Request ID** generated at edge middleware; propagated through logs, Inngest events, and AI calls
- **AI cost telemetry** — every Router call records `{workspace_id, capability, model, provider, input_tokens, output_tokens, cost_usd, latency_ms, request_id, agent_id?}`. Aggregated into `ai_usage_daily` summary table
- **Business telemetry** — dashboard widgets have shadow tables that log each read to power adoption metrics
- **Event traceability** — every event carries `correlation_id` and `causation_id`; Inngest dashboard + `event_journal` table give full replay + investigation
- **Alerts** — Sentry pages the founder on error rate > 1% or P95 latency > 2× SLO; Axiom alerts on AI cost > 2× rolling average

---

## 16. Testing Strategy (overview)

Full plan in `17_Testing.md`. Load-bearing pieces:

- **Unit** — domain logic, especially scoring rubric evaluation, Opportunity Score composition, Relationship Profile computation
- **Integration** — Supabase local + Playwright for critical flows (sign-in, lead ingest → score → draft outreach → send)
- **Tenancy Fuzzer** — automated cross-workspace probe (§4.5)
- **Prompt regression** — golden inputs → expected structure + assertion on key fields; run on every AI-touching PR
- **Event contract tests** — subscribers verify against fixed emitter payloads; version drift caught in CI
- **Load** — k6 scripts targeting NFR-PERF thresholds; run nightly against staging

---

## 17. Assumptions

| ID | Assumption | If false |
|---|---|---|
| ASM-ARCH-001 | Supabase supports pgvector 0.7+ on Pro tier at MVP launch | Enable pgvector via extension; verified |
| ASM-ARCH-002 | Vercel Server Actions in Next.js 15 are production-stable | Fallback to Route Handlers; interface identical |
| ASM-ARCH-003 | Inngest starter/standard tier suffices for MVP volume (< 100 concurrent jobs) | Bump plan; validate at 30-day mark |
| ASM-ARCH-004 | Anthropic + OpenAI both available in US-East region we deploy to | Confirmed |
| ASM-ARCH-005 | Browserless plan tier is enough at MVP; audits are queued anyway | Bump plan when needed |
| ASM-ARCH-006 | Dedicated Google Workspace for Verocrest can be spun up with proper SPF/DKIM in week 1 | Fallback to founder's existing Workspace at MVP; migrate later |

---

## 18. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Supabase outage** | Total downtime | Status page + user comms; migration plan pre-drafted |
| **LLM provider throttling** | AI features degrade | Router falls back to secondary provider; degraded UX message; queued retry |
| **RLS misconfigured on a new table** | Cross-tenant leak | Tenancy Fuzzer runs pre-deploy; migration linter checks every new table has a policy |
| **Event contract drift between emitter and subscriber** | Silent data loss | Event contract tests in CI; envelope version validation at subscriber |
| **Vercel serverless cold-start on streaming AI** | Perceived latency | Warm-up ping + Edge runtime where possible; escape hatch to Fly.io documented |
| **Browserless per-session cost balloons** | Margin pressure | Cost dashboard; queue backpressure; self-host trigger documented |
| **Agent primitives cost more than they save** | Wasted MVP effort | Effort is scoped small (column additions + one table); no runtime overhead until agents ship |
| **LIE cross-component coupling becomes tight** | Refactor cost | Event Bus enforces async loose coupling; module boundaries + write ACLs enforce isolation |

---

## 19. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | Next.js 15 (App Router, RSC, Server Actions) as the sole application framework | Solo-founder velocity; collapses FE/BE; Vercel-native |
| 2026-07-01 | Monolith with strict module boundaries; no microservices at MVP | Premature service split is the #1 killer of small-team velocity |
| 2026-07-01 | Supabase Postgres + pgvector as sole primary data store | Minimum moving parts; RLS enforces tenancy; portable if we outgrow Supabase |
| 2026-07-01 | Row-Level Security is the tenancy boundary — not application-layer filtering | Application-layer filtering is one review-miss from a breach |
| 2026-07-01 | Drizzle ORM over Prisma | Thinner runtime; better serverless/pooling; SQL-shaped |
| 2026-07-01 | Browserless for MVP web scraping; self-host trigger at ~$1500/mo | Buy time now; keep the exit door open |
| 2026-07-01 | Model Router mandatory; feature code never imports vendor SDKs directly | AI-PROV-001 hard requirement |
| 2026-07-01 | AI Memory backed by pgvector in the primary Postgres; interface allows swap | Simplicity at MVP; migration path preserved |
| 2026-07-01 | Gmail API for outreach send; Resend for transactional | Deliverability + no warm-up requirement at MVP; adapter interface separates concerns |
| 2026-07-01 | Payments deferred to Phase 2; MVP uses external Stripe Payment Links | MVP goal is close the deal, not run the books |
| 2026-07-01 (rev 2) | **Primary region: US-East** ✅ | Target ICP is US/UK/AU-heavy; lowest latency to Anthropic + OpenAI |
| 2026-07-01 (rev 2) | **Inngest as durable workflow engine** ✅ | Typed events, dashboards, Next.js integration; also serves as Agency Event Bus runtime |
| 2026-07-01 (rev 2) | **Anthropic + OpenAI dual providers, both funded at MVP** ✅ | Router-level failover; capability specialization (reasoning vs. structured extraction) |
| 2026-07-01 (rev 2) | **Dedicated Google Workspace for Verocrest outreach** ✅ | Deliverability isolation from personal mail; clean SPF/DKIM per domain |
| 2026-07-01 (rev 2) | **Sentry + Axiom for observability** ✅ | Best-in-class per surface; cheap tiers at MVP |
| 2026-07-01 (rev 2) | **Turborepo + pnpm workspaces as monorepo tool** ✅ | Cache wins even at solo scale; Vercel/Next.js first-class support |
| 2026-07-01 (rev 2) | **Lead Intelligence Engine as first-class subsystem (§6)** | Elevates the differentiator from scattered features to a coherent architectural layer; enables agent-friendliness later |
| 2026-07-01 (rev 2) | **AI Agent Layer primitives built in v0.1 (§7.6) even though no agents ship** | Retrofitting agent primitives after the fact is a rewrite; building them now is cheap |
| 2026-07-01 (rev 2) | **Agency Event Bus (§8) with standardized versioned business events** | Turns extensibility from a plumbing project into a subscription; foundation for automations, agents, and future public webhooks |
| 2026-07-01 (rev 2) | **event_journal Postgres mirror for durable replay independent of Inngest** | Runtime-swap escape hatch; multi-year audit history |
| 2026-07-01 (rev 2) | **Opportunity Score = f(Fit Score, Readiness Score)** as three columns, not one | Reflects real agency decision logic; independently tunable signals |
| 2026-07-01 (rev 2) | **LIE-owned tables have write-role restriction at the Postgres level** | Belt-and-braces on top of ESLint boundaries; prevents feature code from corrupting intelligence data |

---

## 20. Open Questions

All open questions from rev 1 are resolved or accepted by the approved decisions above. New questions surfaced by the LIE / Agent Layer / Event Bus additions:

1. **Opportunity Score composition function** — default `sqrt(fit × readiness)` proposed; workspace-configurable. Confirm the default or specify an alternative before `04_Database_Design.md` locks columns.
2. **Event journal retention** — default proposal: 24 months in the `event_journal` table, pruned nightly. Alternative: 12 months to save storage. Confirm.
3. **Agent identity naming** — should `agent_id` be a UUID or a stable slug (`sdr-agent-v1`)? Recommendation: stable slug for readability, `agent_registry` table maps slug → capabilities. Confirm.
4. **Should the Outreach Queue also drive the Follow-ups Due widget** (FR-DASH-002), or should reminders remain a separate primitive? Recommendation: separate — reminders are date-triggered; Outreach Queue is score-triggered. Confirm.
5. **Do we want the `event_journal` to also feed a future public webhook API in Future SaaS** (single source), or a separate outbound webhook system? Recommendation: single source, with a webhook subscription layer that reads from the journal. Confirm the intent.

---

## 21. What This Enables Next

With these architectural decisions locked, the next documents can be built on solid ground:

- `04_Database_Design.md` will produce concrete DDL against Postgres 16 + pgvector + Supabase Auth schemas, with RLS policies on every table, LIE-owned columns, `agent_policy_envelopes`, `event_journal`, and Opportunity Score columns.
- `05_User_Flows.md` will assume Server Actions + Realtime + Event Bus patterns.
- `06_Feature_Modules.md` will map each module's public interface to the boundaries in §5, and reference the LIE subsystem contracts.
- `09_AI_Architecture.md` will detail the Model Router, Prompt Registry, Memory service, and Agent Layer specifics.
- `11_Integrations.md` will document each adapter's contract.
- `15_Security.md` will build on the RLS + Vault + Action Log foundation.
- `16_Deployment.md` will spell out the exact Vercel + Supabase (US-East) + Inngest project setup.

---

*End of 03_System_Architecture.md*

---

**Next up: `04_Database_Design.md` — proceeding now.**

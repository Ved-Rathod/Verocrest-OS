# VEROCREST OS — BUILD ROADMAP

**Document type:** Execution roadmap (NOT architecture — all design decisions live in `/docs/01–12`, which are frozen)
**Product:** Verocrest OS Version 0.1 (Core Engine First)
**Team:** 1 founder-engineer (~30 h/week per PRD ASM-005), AI-assisted development
**Status:** Awaiting founder approval — **no code is written until this document is approved**
**Last updated:** 2026-07-01

---

## 1. Project Overview

### 1.1 What we are building

Verocrest OS v0.1 — a client acquisition engine for the Verocrest agency, per the frozen blueprint:

- **6 core modules** (PRD §10.2): Authentication, Lead Intelligence, AI Website Auditor, AI Personalization, Sales CRM, Dashboard
- **3 platform substrates** (Arch §6–8): Lead Intelligence Engine, AI Substrate (Model Router + Memory + Prompt Registry), Agency Event Bus
- **7 live integrations** (Doc 11): Supabase, Anthropic, OpenAI, Browserless, Gmail, Google Calendar, Resend

### 1.2 The single acceptance test (PRD §10.4)

> **The founder signs at least one paying international agency client end-to-end inside Verocrest OS** — lead ingested → enriched → scored → audited → personalized outreach sent → reply logged → meeting booked → proposal drafted, sent, signed → deal won.

Everything in this roadmap exists to pass that test. Anything that doesn't serve it is out.

### 1.3 Execution rules

1. Build one sprint at a time; never parallelize sprints.
2. Every feature ships production-ready, tested, modular, and blueprint-exact.
3. Deploy to production from Sprint 1 (walking skeleton); features land dark behind flags until their sprint's DoD passes.
4. If a blueprint contradiction or gap is discovered mid-sprint: **stop, document it, ask** — never improvise architecture.
5. A sprint is done when its Definition of Done checklist is 100% green — not when the code "works."

### 1.4 Deviation from the example sprint order (flagged for approval)

The example structure provided placed *Website Intelligence* before the *AI Router*. Per frozen `09` §2, the auditor's LLM analysis step executes **through** the Model Router — the Router must exist first. This roadmap therefore builds the AI substrate (Sprint 5) before Website Intelligence (Sprint 8). Additionally, the Knowledge layer (ICPs, Offers, KB) precedes Lead Intelligence scoring because ICP match is 60% of the fit score (`04` §5.3). These are dependency corrections, not scope changes.

---

## 2. Development Phases

| Phase | Sprints | Outcome | Target duration |
|---|---|---|---|
| **Phase A — Foundation** | 1–3 | Deployed walking skeleton: auth, tenancy, schema, app shell, CI/CD, observability | ~4 weeks |
| **Phase B — Data & Intelligence Substrate** | 4–7 | CRM entities + Event Bus + AI Router + Memory + Knowledge layer + Lead Intelligence Engine scoring | ~6 weeks |
| **Phase C — Acquisition Workflows** | 8–11 | Website Auditor, Outreach Engine, Sales CRM, Proposal Engine — the end-to-end acquisition loop | ~7 weeks |
| **Phase D — Surface, Hardening & Launch** | 12–14 | Live Dashboard, performance/security hardening, production launch + founder dogfood migration | ~4 weeks |

**Total: 14 sprints, ~21 weeks (~5 months) at solo-founder pace.** The 90-day vision (`01` §4.5) is met at the end of Sprint 9 (scoring + auditor + one outreach channel live in production, founder using daily), with the full MVP acceptance test achievable from Sprint 11 onward.

---

## 3. Feature Dependency Graph

```
S1 Foundation ──▶ S2 Data/Auth/Tenancy ──▶ S3 App Shell
                          │                     │
                          ▼                     │
                  S4 CRM Core ◀────────────────┘
                          │
                          ▼
                  S5 Event Bus + AI Substrate (Router, Prompts, Memory, Cost)
                          │
                          ▼
                  S6 Knowledge Layer (ICP, Offers, KB) + Onboarding
                          │
                          ▼
                  S7 Lead Intelligence Engine (scoring, relationship, queue)
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
   S8 Website Intelligence    S9 Outreach Engine (Gmail, drafts, replies)
              │                       │
              └───────────┬───────────┘
                          ▼
                  S10 Sales CRM (pipeline, deals, meetings, booking)
                          │
                          ▼
                  S11 Proposal Engine
                          │
                          ▼
                  S12 Dashboard & Reporting (consumes ALL event streams)
                          │
                          ▼
                  S13 Hardening ──▶ S14 Launch + Dogfood
```

**Hard dependencies (cannot invert):**
- Router (S5) before any AI feature (S7, S8, S9, S11)
- ICPs (S6) before scoring (S7) — ICP match is 60% of fit score
- Scoring (S7) before Outreach Queue consumption (S9) and Gold Leads widget (S12)
- Contacts/Companies (S4) before everything downstream
- Event Bus (S5) before any cross-module reaction

---

## 4. Milestones

| # | Milestone | Sprint | Proof |
|---|---|---|---|
| M1 | Walking skeleton live at verocrest.app | S1 | Health checks green in production; CI/CD pipeline exercised end-to-end |
| M2 | Auth + tenancy verified | S2 | Tenancy Fuzzer passes on all tables; founder signs in with Google |
| M3 | First AI call through the Router | S5 | `ai_usage_events` row with cost + prompt hash; `ai.output.produced` event in journal |
| M4 | First lead scored end-to-end | S7 | CSV import → enrich → ICP match → fit/readiness/opportunity → queue rank, all via events |
| M5 | First website audit completed | S8 | Real dental-clinic URL audited < 90s with graded findings + screenshots |
| M6 | First outreach sent from the product | S9 | Gmail send with citations + auto-created follow-up reminder; reply detected via Pub/Sub |
| M7 | First proposal generated and exported | S11 | AI draft → edit → offer snapshot → PDF |
| M8 | Feature-complete dashboard | S12 | All six widgets live with real data + realtime refresh |
| M9 | Hardened | S13 | NFR-PERF budgets met; a11y audit passes; restore drill completed; runbooks written |
| M10 | **Production launch + dogfood** | S14 | Founder's acquisition workflow runs 100% in Verocrest OS; external tools cancelled |
| — | **MVP ACCEPTANCE** | post-S14 | One paying international client signed end-to-end inside the product (PRD §10.4) |

---

## 5. Sprint Breakdown

Complexity scale: **S** (≤ 2 days) / **M** (3–5 days) / **L** (1–1.5 weeks) / **XL** (split it — no XL sprint items allowed; anything estimated XL gets decomposed before the sprint starts).

---

### SPRINT 1 — Foundation & Walking Skeleton

**Objective:** A deployable, observable, CI-gated monorepo with a "hello workspace" page live in production. Everything after this sprint ships onto rails built here.

**Features / work items:**
1. Turborepo + pnpm monorepo scaffold with the package layout from Arch §5 (`apps/web`, `packages/domain-*` stubs, `platform-*`, `ui-kit`, `config`) — M
2. Next.js 15 App Router app with TypeScript strict, Tailwind, shadcn/ui init — S
3. ESLint ruleset: module-boundary rule (no cross-domain imports), SDK-import restrictions (Doc 11 §2), no-console rule — M
4. GitHub Actions CI: all 12 stages scaffolded (Doc 12 §4.2), with placeholder tests green — M
5. Vercel projects (prod + staging + preview) with environment scopes; Cloudflare DNS; domains wired — S
6. Supabase projects (local Docker + staging + prod, US-East); connection via Drizzle + Supavisor transaction mode — M
7. Observability skeleton: `platform-observability` logger (structured JSON → Axiom), Sentry init, request-ID middleware — M
8. `GET /api/health` + `GET /api/ready` endpoints; external uptime probe configured — S
9. `.env` schema validation in `packages/config` (Zod-validated env at boot) — S

**Blueprint refs:** `03` §2–3, §5; `12` §2–5, §7, §10
**Dependencies:** none (first sprint)
**Modules/files touched:** repo root, `apps/web`, all `packages/*` skeletons, `.github/workflows`, `infra/state`
**Definition of Done:**
- [ ] `pnpm build && pnpm test && pnpm lint` green locally and in CI
- [ ] PR → preview deploy → merge → staging deploy → tag → production deploy exercised once end-to-end
- [ ] `verocrest.app` serves a page over TLS; health + ready endpoints return 200
- [ ] Request-ID visible in Axiom for a production request; a thrown test error appears in Sentry
- [ ] ESLint boundary rule proven: a deliberate cross-domain import fails CI
- [ ] Secrets pulled via `vercel env pull`; nothing sensitive in repo (gitleaks green)

**Testing checklist:** CI pipeline self-test; health-probe assertion test; env-schema rejection test (boot fails on missing var)
**Risks:** Vercel/Supabase account setup friction (low impact); Turborepo cache misconfiguration silently slowing CI (verify remote cache hit rate)

---

### SPRINT 2 — Data Plane, Auth & Tenancy

**Objective:** The complete frozen schema deployed with RLS enforced, plus working authentication and workspace creation. After this sprint, cross-tenant leakage is *provably* impossible.

**Features / work items:**
1. Full Drizzle schema for all v0.1 tables per `04` (47 tables incl. `companies`, `icps`, `offers`, `knowledge_documents`, `prompt_library`, agent primitives, `event_journal`, `idempotency_records`, `rate_limit_buckets`) — L
2. Migrations with RLS enable + tenancy policy on every business table; `app_role_features` / `app_role_lie` / `app_role_admin` roles + LIE write-locks (`04` §21) — M
3. `drizzle-check-rls` CI lint (every new table must have workspace_id + RLS + policy) — S
4. Tenancy middleware: session → active workspace → `SET LOCAL` GUCs on every request (`03` §4.1, `10` §2.8) — M
5. Supabase Auth: email/password (+ verification via Resend template), Google OAuth, magic link (`10` §5) — M
6. Workspace creation + switch endpoints, `workspace_members`, niche-preset ICP seeding stub (`05` §2) — M
7. `action_log` write path with checksum chain + nightly integrity verification job stub — M
8. Tenancy Fuzzer test suite (cross-workspace probes; CI build-blocker) — M
9. Session management: cookie policy, 12h/30d expiry, sign-out invalidation — S

**Blueprint refs:** `04` (all), `03` §4, `10` §2, §5, §9; `05` §2
**Dependencies:** S1
**Modules touched:** `platform-db`, `platform-tenancy`, `domain-auth`, `apps/web/middleware.ts`, migrations
**Definition of Done:**
- [ ] All migrations apply cleanly to fresh local + staging DBs; schema matches `04` exactly (no additions, no omissions)
- [ ] Tenancy Fuzzer green across every business table
- [ ] RLS lint blocks a deliberately policy-less test table
- [ ] Founder can sign up (email verify via Resend), sign in with Google, create workspace, switch workspace
- [ ] Every auth event + workspace mutation appears in `action_log` with valid checksum chain
- [ ] LIE write-lock proven: `app_role_features` INSERT on `lead_scores` fails at Postgres level

**Testing checklist:** unit (checksum chain, GUC setter), integration (auth flows × 3 modes), Tenancy Fuzzer, migration idempotency (apply twice = no-op)
**Risks:** RLS + Supavisor transaction-mode GUC interaction (validate `SET LOCAL` scoping early — this is the sprint's landmine); Google OAuth redirect config per environment

---

### SPRINT 3 — App Shell, Design System & Settings

**Objective:** The visual and navigational skeleton every feature renders inside: sidebar, top bar, command palette, design tokens, dark/light modes, settings shell, notifications surface, onboarding checklist shell.

**Features / work items:**
1. `ui-kit` tokens: full CSS custom-property set from `08` §2–7 (colors both modes, type, spacing, radius, shadows, motion) — M
2. Core components per `08` §15: Button, Input, Card, Dialog, Toast, Badge/Pill, Tooltip, Skeleton, Banner, Empty state — L
3. Global shell per `07` §3: sidebar (fixed 11-item order), top bar, breadcrumbs, workspace switcher, user menu — M
4. Command palette (⌘K) with navigate/create/search sections; `/api/search` endpoint stub — M
5. Dark/light via `data-theme`, SSR-resolved, system default (`08` §13) — S
6. Settings shell + Profile/Security/Workspace pages (`06` §8.1 subset buildable now) — M
7. Notifications: table wiring, bell + list page, `notification_preferences` (`04` §14) — M
8. Onboarding checklist shell with presence-probe completion logic (`05` §3, items render; item flows land in later sprints) — M
9. Keyboard shortcuts framework + cheatsheet overlay (`07` §13) — S
10. Feature-flag service (server-side eval, 30s cache) per `12` §12 — S

**Blueprint refs:** `07` (all), `08` (all), `06` §2.10, §8; `12` §12
**Dependencies:** S2 (auth/session for shell context)
**Modules touched:** `ui-kit`, `apps/web/app` layouts, `domain-auth` (onboarding progress), notifications
**Definition of Done:**
- [ ] Shell renders authenticated with sidebar/topbar/palette; all 11 nav targets route (to placeholders where the module isn't built)
- [ ] Both themes pass automated contrast checks (`08` §2.4 pairs)
- [ ] ⌘K opens < 50ms, keyboard-only navigable; `G`-prefix shortcuts work
- [ ] Every ui-kit component has all 7 states from `08` §9 (visual regression snapshots)
- [ ] `prefers-reduced-motion` verified (transitions collapse to crossfade)
- [ ] Onboarding checklist shows 7 items with live completion detection (items complete as later sprints land)

**Testing checklist:** component state snapshots, axe-core a11y scan on shell + settings, keyboard-nav E2E (Playwright), theme-switch persistence
**Risks:** Design-token sprawl if components hardcode values (enforce semantic-token-only via stylelint); command palette scope creep (build only §4.2 sections, no AI commands — those are Phase 3+)

---

### SPRINT 4 — CRM Core: Companies, Contacts, Import, Reminders

**Objective:** The entity foundation — every downstream intelligence feature operates on data created here.

**Features / work items:**
1. Companies CRUD + list + detail + dedupe on domain + merge (`06` §3, `10` §6.1) — M
2. Contacts CRUD + list + detail + email dedupe + company linking (`10` §6.2) — M
3. Async company resolution worker (name-fuzzy + email-domain match) + Company Suggestions review UI (`04` §4.6) — M
4. CSV import: 3-step wizard (upload → map → dry-run → commit), `ingest_batches`, per-row processing stub emitting `lead.ingested` (event bus arrives S5 — emit to `event_journal` only for now, replayed in S5) — L
5. Activity timeline (append feed + UI on contact/company detail) — M
6. Leads entity: create-on-ingest, status enum, disqualify (`10` §6.3) — S
7. Reminders: CRUD + complete/snooze + due-sweep cron stub (`06` §6, FR-REM) — M
8. Contact/company custom-fields rendering from `custom_field_definitions` (definitions seeded manually; editor UI is P1) — S

**Blueprint refs:** `04` §4–5, `05` §3.7, §6 (entity parts), `06` §3, `10` §6.1–6.3, §6.12
**Dependencies:** S2 (schema), S3 (shell + components)
**Modules touched:** `domain-contacts`, `domain-leads`, `domain-reminders`, `apps/web` routes
**Definition of Done:**
- [ ] 1,000-row CSV imports with dedupe, error reporting, and ≥ 70% auto company-resolution on realistic data
- [ ] Ambiguous matches land in Company Suggestions; accept/reject/merge all function
- [ ] Contact detail shows timeline, profile placeholders, reminders
- [ ] All list views: cursor pagination, search, filters, keyboard nav per `07` §6.1
- [ ] Every mutation in `action_log`; every state change writes `event_journal` rows (bus consumption comes in S5)
- [ ] All F-CSV-*, F-ENRICH-002 failure states render their `08` §14 copy

**Testing checklist:** import edge cases (duplicate emails in-file, malformed rows, 50MB reject), dedupe idempotency (same CSV twice = zero new rows), merge integrity (contacts/deals/audits move), timeline ordering
**Risks:** Fuzzy company matching quality (tune thresholds against real dental-clinic test data — budget half a day for calibration); import performance on large files (batch inserts, not row-by-row)

---

### SPRINT 5 — Agency Event Bus & AI Substrate

**Objective:** The two most load-bearing platform layers: typed event bus on Inngest with journal replay, and the Model Router with prompts, memory, embeddings, and cost controls. **First AI call happens this sprint (M3).**

**Features / work items:**
1. Inngest setup (envs per `12` §3); typed event catalogue + envelope from `03` §8.2–8.3; transactional `event_journal` write + post-commit emit + nightly reconciliation (`10` §11.3) — L
2. Replay of S4's journal-only events through the now-live bus — S
3. Model Router: 10-step pipeline (`09` §2.3) — capability config, prompt resolution, budget check, memory retrieval, assembly, provider selection, execution, structured-output parse, logging, memory write — L
4. Anthropic + OpenAI adapters implementing `LlmProvider` with retry/failover/circuit-breaker (`11` §4–5) — M
5. Prompt Registry: three-tier resolution, code baselines for all 17 capabilities, `prompt_library` global seed script (`09` §3) — M
6. Memory Service: `withMemory` wrapper, scope allow-lists, pgvector HNSW retrieval, annotation filtering, fire-and-forget writes (`09` §4) — M
7. Embeddings service: `text-embedding-3-small`, 500/100 chunker, batch API (`09` §5) — M
8. Cost controls: estimation-before-dispatch, budget gating, `ai_usage_events` + `ai_usage_daily`, 80% warning notification (`09` §6) — M
9. SSE streaming Route Handler pattern (`10` §7.4) with one demo capability wired — S
10. Prompt-regression test harness (fixtures + mocked Router assertions) in CI — S

**Blueprint refs:** `03` §8, `09` (all), `10` §7, §11; `11` §4–5
**Dependencies:** S2 (schema incl. memory/prompt/usage tables), S4 (entities to reference)
**Modules touched:** `platform-event-bus`, `platform-jobs`, `platform-ai-router`, `platform-integrations/{anthropic,openai}`
**Definition of Done:**
- [ ] `lead.ingested` from a CSV import fans out through Inngest to a logging subscriber; journal + Inngest agree
- [ ] A capability call streams via SSE with start/token/complete frames and full metadata envelope
- [ ] Provider kill test: block Anthropic egress → call transparently completes via OpenAI; failover logged
- [ ] Budget test: workspace at cap → call refused pre-dispatch with `AI_BUDGET_EXCEEDED`
- [ ] Memory round-trip: write → retrieve by scope with workspace isolation proven by Fuzzer extension
- [ ] Every call logs cost, tokens, latency, prompt hash; `ai_usage_daily` rolls up
- [ ] Structured-output failure path proven (malformed fixture → retry → fallback → typed error)

**Testing checklist:** unit (envelope, resolution chain, cost math, chunker boundaries), integration (real staging providers, cost-capped), event contract tests, mock-mode verification for offline dev
**Risks:** **Highest-complexity sprint.** Router scope creep (build exactly `09`, nothing speculative); pgvector HNSW ops on Supabase (verify index build early); SSE on Vercel serverless (validate streaming + abort in staging week 1 of sprint — this is the escape-hatch trigger to watch)

---

### SPRINT 6 — Knowledge Layer & Onboarding Completion

**Objective:** The content that feeds AI Memory — ICPs, Offers, Knowledge Documents — with chunk-and-embed indexing, completing the onboarding checklist.

**Features / work items:**
1. ICP editor + list (narrative, criteria JSON, geographies/industries/size, disqualifiers, activate) + `icp.upserted → icp.indexed` flow (`05` §3.3) — M
2. Offer editor + list (pricing models, deliverables, guarantees, ROI, activate) + indexing (`05` §3.4, `04` §10.6) — M
3. Knowledge Documents: markdown editor, doc types, tags, linked entities + two-phase chunk swap indexing (`05` §3.5, `04` §7.3–7.5) — M
4. Knowledge Indexer subscriber (chunk → embed → `memory_vectors` + `knowledge_document_chunks`; delete-after-insert swap) — M
5. Google integration connect surface (Settings → Integrations): OAuth for Gmail + Calendar scopes, Vault-encrypted token storage (`11` §7.3, §8.3, §11) — M
6. Revenue target dialog + `workspace_targets` (`05` §3.6) — S
7. Onboarding checklist: all 7 items now completable; `workspace.onboarded` event + quiet celebration (`07` §9.5) — S
8. Prompt Library read-only viewer (Settings → AI) (`06` §5.10) — S
9. Settings → AI Usage cost dashboard (`09` §6.6) — S

**Blueprint refs:** `04` §5.7, §7, §10.6; `05` §3; `06` §3, §5.10, §6.10–6.11; `11` §7, §8, §11
**Dependencies:** S5 (embeddings, bus, Router), S3 (settings shell)
**Modules touched:** `domain-memory` (indexer), new ICP/Offer/KB surfaces in respective domains, `platform-integrations/google-*`
**Definition of Done:**
- [ ] Founder completes all 7 onboarding items on a fresh workspace in < 60 minutes
- [ ] Editing a KB doc re-indexes with zero retrieval gap (two-phase swap proven under concurrent retrieval test)
- [ ] Memory retrieval returns ICP narrative for scope `icp`, offer positioning for `offer`, KB chunks for `knowledge_doc` — all workspace-isolated
- [ ] Google OAuth grants stored Vault-encrypted; disconnect revokes at provider and flips status
- [ ] `workspace.onboarded` fires exactly once; celebration animation per `07` §9.5 (no confetti)

**Testing checklist:** indexing idempotency (unchanged hash = no-op), chunk boundary correctness on real SOP-length docs, OAuth token refresh + revocation, checklist presence-probe accuracy
**Risks:** Google OAuth verification requirements for Gmail scopes (start the Google verification/app-review paperwork **this sprint** — it can take weeks and blocks S9 if late — mitigate with internal-user test-mode meanwhile)

---

### SPRINT 7 — Lead Intelligence Engine

**Objective:** The differentiator: every ingested lead auto-enriches, matches against ICPs, scores on fit × readiness, and ranks in the Outreach Queue with a Next Best Action. **M4 lands here.**

**Features / work items:**
1. Enrichment worker (email-domain enrichment baseline per PRD §10.3; provider adapter interface for Phase 2 expansion) — M
2. ICP matching: criteria evaluation + `icp_match_score` + plain-language hit/miss signals (`04` §5.7–5.9) — M
3. Scoring service (LIE role): fit = 0.6·ICP + 0.2·website + 0.2·enrichment; readiness from relationship signals; opportunity = √(fit·readiness); rubric versioning; explainability card; score history (`04` §5.3–5.5, capability `score-lead`) — L
4. Relationship Intelligence: profile recompute on interaction events (engagement, sentiment placeholder, readiness enum, cadence) (`04` §4.3) — M
5. Outreach Queue: materialized ranking, NBA computation, recommended-offer via `recommend-offer` capability, cooldowns, event-driven refresh (`04` §8, `03` §6.5) — M
6. Event chain wiring: `lead.ingested → lead.enriched → lead.scored → outreach.queue.updated` with correlation IDs — S
7. `/queue` browsable surface + lead-score card on contact detail (explainability, ICP match, top signals) — M
8. Pre-ICP fallback rubric (F-SCORE-001) + `scoring_error` handling (F-SCORE-002) — S

**Blueprint refs:** `03` §6; `04` §4.3, §5, §8; `05` §6; `06` §3; `09` §4.3, §11
**Dependencies:** S5 (Router/Memory/Bus), S6 (ICPs/Offers), S4 (leads/contacts)
**Modules touched:** `domain-scoring`, `domain-relationship`, `domain-outreach-queue`, LIE service role paths
**Definition of Done:**
- [ ] 200-lead CSV: every lead scored < 60s P95 from ingest (NFR-PERF-006), full event chain in journal with shared correlation IDs
- [ ] Explainability card cites top 3–5 signals in plain language; ICP hit/miss visible
- [ ] Queue ranks by opportunity score; NBA + recommended offer populated; cooldown after outreach honored
- [ ] All LIE writes go through `app_role_lie` (feature-role write attempt fails)
- [ ] Score history preserved on re-score; rubric version recorded
- [ ] Lead-to-queue funnel numbers reconcile (ingested = scored + errored)

**Testing checklist:** scoring determinism on fixture leads (golden set), rubric-change re-score, readiness transitions from simulated events, queue re-rank on each trigger event, cold-workspace (no ICP) fallback
**Risks:** Score quality vs. founder intuition (calibrate on 50 real historical leads the founder can hand-rank — budget explicit calibration time); LLM cost per scored lead (verify $0.002–0.008 band from `09` §11 holds)

---

### SPRINT 8 — Website Intelligence (AI Website Auditor)

**Objective:** Full audit pipeline — Browserless render, multimodal LLM analysis, graded findings, deltas, Loom scripts. **M5 lands here.**

**Features / work items:**
1. Browserless adapter: CDP sessions via playwright-core, dual-viewport render, screenshots → Storage, DOM extraction, vitals, concurrency semaphore (`11` §6) — M
2. Audit orchestrator (Inngest): request → render → `audit-website` capability (multimodal, structured findings) → persist → deltas → re-score cascade (`05` §7) — L
3. Findings persistence: per-category grades, severity, evidence (selector, bbox, metric), confidence — M
4. Audit deltas on re-audit of same URL — S
5. Audit UI: list, run dialog, detail (grade tiles, findings by category, screenshots, delta panel) per `06` §4.10 — M
6. Loom Script Generator: `generate-loom-script` capability + surface (≤ 200 words, hook/findings/recommendation/CTA) — S
7. Auto-audit trigger on lead-scored when URL present + no audit < 30 days (`05` §6.1) — S
8. Browserless webhook receiver + audit summary card embed on contact/company/lead detail — S
9. All F-AUDIT-* failure paths with `08` §14 copy — M

**Blueprint refs:** `05` §7; `06` §4; `09` §11 (audit-website, generate-loom-script); `10` §6.7, §8.4; `11` §6
**Dependencies:** S5 (Router), S7 (re-score cascade), S4 (entity attach)
**Modules touched:** `domain-website-intelligence`, `platform-integrations/browserless`, audit routes
**Definition of Done:**
- [ ] 10 real dental/coach websites audited: < 90s P95, 5–15 findings each, grades plausible on founder review
- [ ] Findings cite concrete evidence (selector or metric); screenshots render in detail view
- [ ] Re-audit produces deltas; lead fit score updates via cascade event
- [ ] Loom script ≤ 200 words, references actual audit findings
- [ ] Bot-blocked site (Cloudflare-protected test target) fails gracefully with F-AUDIT-003 copy
- [ ] Cost per audit within $0.05–0.20 band

**Testing checklist:** mock-mode fixtures for CI, nightly real audit against stable target, timeout/retry paths, screenshot upload failure isolation (F-AUDIT-005), concurrent-audit semaphore behavior
**Risks:** Audit quality is the product's first impression — budget a full day of prompt iteration against real sites with founder review; Browserless flakiness on JS-heavy sites (measure failure rate early; < 5% target)

---

### SPRINT 9 — Outreach Engine (AI Personalization)

**Objective:** The flywheel's edge: grounded, cited, editable outreach drafts sent via Gmail (or copied for DMs), with reply detection closing the loop. **M6 lands here; 90-day vision satisfied.**

**Features / work items:**
1. Draft dialog: channel → tone/offer/attachments → SSE-streamed draft → edit → send/copy (`07` §8.1, `06` §5.10) — L
2. `draft-outreach-{email,ig-dm,linkedin-dm}` capabilities with full memory retrieval per `09` §4.3 scope lists + citations — M
3. AI Trace panel: model, sources (clickable), confidence, cost, reasoning (`07` §8.3; expanded-first-time behavior) — M
4. Gmail send: RFC-5322 build, threading headers, per-user quota bucket (`11` §7.4, §7.7) — M
5. DM copy-paste flow: mark-as-sent + persistent dashboard nudge (`07` §10.4) — S
6. Reply detection: Pub/Sub watch registration + webhook + history fetch + 5-min polling fallback + nightly watch renewal (`11` §7.5–7.6) — L
7. `classify-reply` capability → sentiment/intent → relationship recompute → queue re-rank → reminder auto-complete (`05` §9) — M
8. Auto follow-up reminder (3-day default) on send; `outreach.draft.rejected` on 3+ regenerations — S
9. `/outreach` history browser + unmatched-replies review surface — M
10. Unsubscribe enforcement (F-SEND-004) + all F-SEND-*/F-REPLY-* paths — S

**Blueprint refs:** `05` §8–9; `06` §5; `07` §8, §10.4; `09` §4.3, §11; `10` §6.8, §7.4, §8.1; `11` §7
**Dependencies:** S5 (Router/SSE), S6 (Gmail OAuth + offers/KB in memory), S7 (queue/relationship), S8 (audit citations)
**Modules touched:** `domain-personalization`, `platform-integrations/google-gmail`, outreach routes + webhook
**Definition of Done:**
- [ ] Draft generated < 15s P95, first token < 1.5s; citations resolve to real audit findings + KB docs + ICP
- [ ] Founder sends a real outreach email from the product; reply detected < 60s via Pub/Sub; sentiment classified; profile + queue updated; pending reminder auto-completed
- [ ] Trace panel complete and reproducible from `ai_usage_events` + citations
- [ ] DM copy flow: nudge persists until confirmed; bulk-dismiss works
- [ ] Unsubscribed contact blocks drafting with clear copy
- [ ] Polling fallback proven by disabling the webhook in staging

**Testing checklist:** draft grounding evals (golden leads → drafts must cite ≥ 2 sources), Gmail mock integration tests, real send/reply round-trip nightly in staging Workspace, thread-matching edge cases, orphan reply handling
**Risks:** **Google app verification for Gmail scopes must be complete by now** (started S6; internal test-mode is the fallback for dogfood-only usage); reply-rate quality is the business bet — schedule founder review of 20 drafts before calling DoD; Pub/Sub setup complexity (one-time GCP config, documented as it's built)

---

### SPRINT 10 — Sales CRM: Pipeline, Deals, Meetings, Booking

**Objective:** The middle of the funnel: kanban pipeline, deals with stage automations, meeting logging, and the public booking page wired to Google Calendar.

**Features / work items:**
1. Pipelines: default seed, stages JSONB editor, stage automations (notify + create reminder) (`06` §6.10) — M
2. Deals: CRUD, kanban (optimistic drag + keyboard grab/move/drop per `07` §6.4), list + forecast views, deal detail — L
3. Auto-deal-creation on lead → `meeting_booked` (`05` §11.1) — S
4. Deal won/lost flows: `is_client` flips, `deal.won`/`deal.lost` events, win dialog (`05` §11.3) — S
5. Meetings: log/complete, `summarize-meeting` capability on notes, meetings list — M
6. Booking links: editor (availability grid, buffers) + management — M
7. Public booking page: branded, free/busy via Calendar, slot pick, booking POST with idempotency + rate limit, confirmation email via Resend, Meet link creation (`10` §6.5, `11` §8) — L
8. Calendar webhook (`events.watch`) + nightly channel renewal + `pending_sync` recovery — M
9. Booking → meeting → lead status → deal stage chain with events — S

**Blueprint refs:** `05` §10–11.1; `06` §6; `07` §6.4; `10` §6.4–6.6; `11` §8
**Dependencies:** S4 (contacts), S6 (Calendar OAuth), S7 (lead status), S3 (shell)
**Modules touched:** `domain-sales`, `platform-integrations/google-calendar`, booking public routes
**Definition of Done:**
- [ ] Kanban drag: zero perceived round-trip (NFR-PERF-007); rollback-with-toast on server reject; keyboard drag works
- [ ] External prospect books via public link on a real calendar: event created with Meet link, meeting row linked to lead/deal, confirmation email delivered, lead advances to `meeting_booked`, deal auto-created
- [ ] Double-booking race returns SLOT_TAKEN with alternatives (concurrency test)
- [ ] Calendar revoked → booking page 503 + owner reconnect banner (F-CAL-001)
- [ ] Stage automations fire (notification + reminder on configured transitions)
- [ ] Deal won flips `is_client` on company + primary contact; event emitted

**Testing checklist:** booking concurrency (parallel bookings on one slot), availability math across timezones + buffers, webhook channel renewal, optimistic-UI rollback, pipeline stage-key integrity
**Risks:** Timezone bugs in availability (test AU/UK/US-Pacific prospect against IST/local founder calendar explicitly); public page abuse (rate limit verified under scripted load)

---

### SPRINT 11 — Proposal Engine

**Objective:** The closing tool: AI-drafted proposals grounded in audits + offers + case studies, edited in a rich-text editor, snapshot-locked, exported to PDF. **M7 lands here; MVP acceptance becomes possible.**

**Features / work items:**
1. `draft-proposal` capability: section-by-section streamed generation (8 sections per `05` §11.1), tiptap JSON output, full memory retrieval — L
2. Proposal editor: tiptap with section nav, per-section regenerate, preview mode, autosave PATCH, AI Trace per section (`06` §6.10) — L
3. Offer snapshot on send (immutable `offer_snapshot`), `offer_version` locking at deal creation, F-PROP-003 pause warning — M
4. PDF export: workspace-branded render → Storage → signed URL (`10` §6.4.10) — M
5. Send flow: status transitions (draft→sent→viewed→signed), manual mark-signed (external e-sign per frozen scope), deal stage advance, follow-up reminder auto-create — M
6. Proposal status tile on deal detail; F-PROP-* failure paths incl. section-by-section fallback for oversized drafts — S

**Blueprint refs:** `05` §11; `06` §6.9–6.10; `09` §11 (draft-proposal); `10` §6.4.6–6.4.10
**Dependencies:** S10 (deals/meetings), S8 (audit grounding), S6 (offers/KB), S5 (Router)
**Modules touched:** `domain-sales` (proposals), PDF export route, editor components
**Definition of Done:**
- [ ] Proposal generated from a real deal (discovery notes + audit + offer) in < 90s; all 8 sections grounded with citations
- [ ] Per-section regenerate replaces only the target section
- [ ] Snapshot proven: change offer price after send → sent proposal + PDF unchanged; nightly integrity check passes
- [ ] PDF renders branded, paginated, typography-correct on 3-page and 12-page proposals
- [ ] Full chain: proposal signed (manual mark) → deal stage advances → won flow available
- [ ] Autosave never loses edits (kill-tab test mid-edit)

**Testing checklist:** tiptap JSON schema validation, snapshot immutability, PDF golden-file comparison, streaming section framing, concurrent proposal generation on one deal
**Risks:** PDF rendering fidelity on Vercel serverless (choose approach early in sprint — react-pdf vs. Browserless-print — both blueprint-compatible; decide by day 2); proposal quality needs founder-voice calibration (one real historical proposal as the golden reference)

---

### SPRINT 12 — Dashboard & Reporting

**Objective:** The daily surface goes live: six widgets with real data, realtime refresh, exports, Flywheel Cycle Time. **M8: feature-complete.**

**Features / work items:**
1. Denormalization workers: `dashboard_metrics_daily` nightly + on-event refresh for all counters (`04` §13.1) — M
2. Widgets 1–6 per FR-DASH-001–006: Gold Leads, Follow-ups Due (inline complete/snooze), Upcoming Meetings, Pipeline Value, Reply Rate, Revenue Target (pace indicator) — L
3. Flywheel Cycle Time tile (FR-RPT-007) — S
4. Supabase Realtime subscriptions + staggered pulse refresh + data-age indicators + poll fallback (`07` §9.8, resolved motion decision) — M
5. Filter bar (date/owner/currency) + per-widget empty/degraded states — M
6. CSV export per widget + print-stylesheet PDF export (`10` §6.13) — S
7. Widget keyboard shortcuts (1–6) + dashboard swaps in when onboarding hits 100% — S

**Blueprint refs:** `02` §4.24; `04` §13; `06` §7; `07` §6.5, §9.8; `10` §6.13
**Dependencies:** ALL prior sprints (dashboard consumes every event stream)
**Modules touched:** `domain-dashboard`, denorm workers, realtime client wiring
**Definition of Done:**
- [ ] Dashboard TTI < 1s cold / < 100ms warm (NFR-PERF-001/004) measured on production
- [ ] Every widget updates via realtime < 5s after its trigger event (send outreach → Reply Rate + queue reflect; book meeting → Meetings widget)
- [ ] Numbers reconcile against direct SQL for a seeded workspace (no drift between denorm and source of truth)
- [ ] Empty, filtered-empty, degraded, and stale states all render per `07` §9
- [ ] Multi-currency grouping behaves per `07` §7.12 edge case

**Testing checklist:** denorm correctness suite (event → counter assertions), realtime reconnect/fallback, widget query performance under 5k-lead seed, export correctness
**Risks:** Denorm drift bugs (build the SQL-reconciliation test first, then the workers); realtime subscription lifecycle leaks (profile subscription count in dev tools)

---

### SPRINT 13 — Hardening: Performance, Testing, Security

**Objective:** Close every NFR before launch. No new features — verification, tightening, and operational readiness.

**Work items:**
1. Performance pass: P95 budgets verified per NFR-PERF (API reads < 400ms, writes < 600ms, TTI < 2s on 4G); k6 load scripts against staging (NFR + `03` §16) — M
2. Full a11y audit: WCAG 2.2 AA on every surface (axe + manual keyboard + screen-reader pass on the 5 core flows) — M
3. Security verification: header regression tests, rate-limit behavior under load, CSRF paths, signed-URL expiry, secrets scan, dependency audit clean, access review — M
4. Failure-state coverage audit: every `05` §14 code reachable in staging renders its `08` §14 copy (scripted fault injection per `12` §14.3) — M
5. Canary suite finalized (7 checks) + wired as deploy gate (`11` §16.5, `12` §4.3) — S
6. All 11 runbooks written and one rehearsed (`12` §16); restore drill executed and timed (< 4h target) — M
7. Backup automation live: weekly external encrypted dump + storage mirror verified (`12` §8) — S
8. Alert wiring complete per `12` §6.2 consolidated table; test-fire each Page alert — S
9. AI eval baseline: golden-set evals recorded for all 17 capabilities (regression floor for future prompt changes) — M
10. Prompt-library global seed finalized + `prompt_library_seed.sql` versioned — S
11. **Lint infrastructure (deferred from Sprint 2.3 audit, 2026-07-03):** `pnpm lint` is currently a monorepo-wide no-op — no ESLint config, no per-package `lint` scripts, no `next lint`, and `tsconfig.base.json` omits `noUnusedLocals`/`noUnusedParameters` (so there is no automated dead-code detection). Stand up ESLint + per-package `lint` scripts, enable the TS dead-code flags, and add the cross-domain import-boundary rule the architecture intends (`03` §5). Then fix whatever it surfaces repo-wide. (Sprint 2.3 Leads code was manually verified clean under these flags — 0 violations — so this is scaffold debt, not feature debt.) — M

**Blueprint refs:** `02` NFR-*, `05` §14, `08` §14, `11` §16, `12` (all), `03` §5
**Dependencies:** S12 (feature-complete system to harden)
**Definition of Done:**
- [ ] k6 run meets every NFR-PERF number; results archived
- [ ] Zero axe violations; keyboard-only completion of: onboard, import→score, audit, draft→send, proposal→won
- [ ] Restore drill completed with documented time-to-restore
- [ ] Every Page alert fired once and received on founder's phone
- [ ] Tenancy Fuzzer, RLS lint, prompt regression, event contract, canary — all green in one final full-pipeline run
- [ ] All runbooks merged to `docs/runbooks/`
- [ ] `pnpm lint` runs real ESLint across all packages (incl. cross-domain import-boundary rule) and is green; TS dead-code flags enabled — deferred lint-infrastructure item closed

**Testing checklist:** this sprint IS the testing checklist — exit criteria above
**Risks:** Hardening reveals perf debt requiring rework (buffer: this sprint may stretch; do not compress it to hit a date — `01` guardrails over calendar)

---

### SPRINT 14 — Production Launch & Dogfood Migration

**Objective:** Verocrest OS becomes the founder's real acquisition system. **M10.**

**Work items:**
1. Production data seed: real ICPs (dental + coaches), real offers, real KB docs (SOPs, case studies, testimonials), revenue targets — M
2. Founder's live lead list imported; historical context entered as KB/memory where valuable — M
3. Dedicated Verocrest Google Workspace connected (per frozen `03` §3.14 decision); SPF/DKIM/DMARC verified on sending domains — S
4. Booking link published and embedded in founder's channels — S
5. External tool cutover: acquisition workflows in prior tools (sheets/Notion CRM equivalents) frozen read-only; cancellation checklist per `01` §12.1 tool-kill metric — S
6. Two-week supervised dogfood: founder runs daily acquisition in-product; issues triaged daily as `bug` (fix now) / `friction` (backlog) / `phase-2` (park) — L
7. Launch checklist execution (§8 below) — S
8. Begin MVP acceptance pursuit: real outreach → real meetings → real proposals, tracked to the first in-product client signature — ongoing

**Blueprint refs:** `01` §4.4–4.5, §12.1; `02` §10.4
**Dependencies:** S13 complete
**Definition of Done:**
- [ ] Founder completes 5 consecutive business days of acquisition work with zero fallback to external tools
- [ ] ≥ 50 real leads scored; ≥ 10 real audits; ≥ 20 real outreach sends; ≥ 1 real meeting booked through the product
- [ ] All launch-checklist items green (§8)
- [ ] Weekly Active Workflows Completed (North Star) being measured and reported on the dashboard
- [ ] MVP acceptance clock running: first end-to-end client signature is the exit condition for Act I v0.1

**Risks:** Dogfood reveals workflow friction invisible in testing (expected — the daily triage discipline is the mitigation); founder time split between building and selling (this sprint IS selling — the product either carries the work or the blueprint learns why)

---

## 6. Testing Requirements (cross-sprint standing policy)

Per `02` NFR-MNT-002/003 and `12` §4.2 — enforced from Sprint 1, not retrofitted:

| Layer | Tool | Gate |
|---|---|---|
| Unit (domain logic) | Vitest | Every PR; no feature merges without happy-path coverage |
| Integration (DB + adapters mocked) | Vitest + local Supabase + MSW | Every PR |
| Tenancy isolation | Tenancy Fuzzer | Every PR — build-blocker |
| RLS presence | drizzle-check-rls | Every migration — build-blocker |
| Prompt regression | Golden fixtures vs mocked Router | Every AI-touching PR |
| Real-provider integration | Staging suite | Nightly |
| E2E (critical flows) | Playwright | Every PR from S3 onward (flows added as built) |
| Visual regression (ui-kit states) | Snapshot | Every PR from S3 |
| A11y | axe-core automated + manual pass | Every PR (automated); S13 (manual) |
| Load | k6 | Nightly from S12; gate at S13 |
| Canary (production) | 7-check suite | Every production deploy — rollback trigger |

---

## 7. Risk Register (project-level)

| Risk | Likelihood | Impact | Mitigation | Owner sprint |
|---|---|---|---|---|
| Google OAuth app verification delays Gmail scopes | Medium | High (blocks S9 sends) | Start verification in S6; internal test-mode covers dogfood | S6 |
| Sprint 5 (AI substrate) complexity overrun | Medium | High (critical path) | Strictest scope discipline; SSE-on-Vercel validated in week 1 | S5 |
| Audit/draft quality below founder bar | Medium | High (product's core promise) | Explicit calibration days with real data in S7, S8, S9, S11 | S7–S11 |
| RLS × Supavisor GUC scoping issue | Low | Critical | Proven in S2 before anything is built on it | S2 |
| AI cost outside modeled bands | Low | Medium | Cost bands asserted in each AI sprint's DoD; budget gating live from S5 | S5+ |
| Solo-founder capacity (30 h/wk assumption breaks) | Medium | Medium | Sprint scope is cut, never quality; phase gates move, DoD doesn't | all |
| Scope creep from dogfood enthusiasm | High | Medium | Frozen blueprint + `bug/friction/phase-2` triage discipline | S14 |
| Browserless reliability on protected sites | Medium | Low | Failure-rate measurement from S8; manual-audit UX path exists | S8 |
| PDF rendering approach dead-ends | Low | Medium | Decision forced by day 2 of S11; two viable options | S11 |

---

## 8. Deployment Milestones & Launch Checklist

### 8.1 Deployment milestones

| When | Deployment state |
|---|---|
| End S1 | Production live (walking skeleton), full CI/CD exercised |
| S2–S12 | Continuous: every sprint's features deployed to production **dark behind feature flags**, enabled for the Verocrest workspace when sprint DoD passes |
| End S9 | 90-day-vision feature set enabled in production (founder daily use begins in parallel with S10+ builds) |
| End S13 | Hardened release tagged; canary gate + rollback proven |
| S14 | Flags fully enabled; dogfood cutover; launch checklist executed |

### 8.2 Launch checklist (executed in S14; every box required)

**Infrastructure**
- [ ] Production env vars complete + rotated fresh; no dev keys in prod scope
- [ ] Uptime probes active from 3 regions; status page live at status.verocrest.app
- [ ] Weekly external backup verified restorable (drill result on file)
- [ ] All Page-severity alerts test-fired to founder's phone
- [ ] DNS + TLS + security headers verified (SSL Labs A grade or equivalent)

**Data & AI**
- [ ] Global prompt seed applied; all 17 capabilities resolve prompts in prod
- [ ] Workspace AI budget configured; 80% warning verified
- [ ] Memory retrieval returning workspace content (ICP/offers/KB indexed)
- [ ] Tenancy Fuzzer green against production schema

**Integrations**
- [ ] Google OAuth verified app status (or documented test-mode limitation accepted for dogfood)
- [ ] Gmail watch registered + renewal cron confirmed; reply round-trip tested in prod
- [ ] Calendar booking round-trip tested with a real external booking
- [ ] SPF/DKIM/DMARC verified on notifications.verocrest.app; test email inbox-placement checked
- [ ] Browserless production key + concurrency configured

**Product**
- [ ] Onboarding checklist completes on the production workspace
- [ ] All six dashboard widgets live with real data
- [ ] Every `05` §14 failure state spot-checked in production configuration
- [ ] `action_log` checksum chain verification job green
- [ ] Canary suite green on the launch deploy

**Business**
- [ ] North Star (WAWC) + secondary metrics (`01` §13.3) rendering on dashboard
- [ ] External acquisition tools frozen read-only; cancellation dates set
- [ ] MVP acceptance test criteria posted where the founder sees them daily

---

## 9. What Happens After Approval

1. You approve this roadmap (or request revisions).
2. We begin **Sprint 1, feature by feature** — starting with the monorepo scaffold.
3. Each feature is delivered as: implementation → tests → verification against DoD → your review.
4. At each sprint boundary: DoD walkthrough, next-sprint confirmation, no skipping ahead.
5. Any blueprint contradiction discovered stops work and comes to you as a decision item.

---

## 10. Roadmap Execution Notes

Execution-time deviations from the sprint plan, recorded for traceability. These are
scheduling/sequencing decisions — NOT blueprint changes (which live in `BLUEPRINT_AMENDMENTS.md`).

| # | Date | Note |
|---|---|---|
| RN-001 | 2026-07-16 | **SPRINT 5 DoD bullet 3 (OpenAI provider-kill/failover test) deferred to SPRINT 7.** SPRINT 5 was delivered as sub-sprints 3.1–3.4 (Event Bus, AI Router, Memory+Embeddings). The OpenAI *chat* adapter (SPRINT 5 item 4) was deferred (Sprint 3.3 decision #4) because no live capability is OpenAI-primary until `score-lead`/`recommend-offer` in SPRINT 7. Building it in an isolated sub-sprint would add unused infrastructure. It — and the provider-kill acceptance test — are implemented in SPRINT 7 alongside their first genuine consumer (which also needs OpenAI's native structured-output mode, `09` §2.7). Anthropic + Mock chat providers are unchanged and remain the live path. Founder-approved 2026-07-16. |

---

*End of BUILD_ROADMAP.md — awaiting founder approval. No code will be written until approved.*

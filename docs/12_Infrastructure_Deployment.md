# 12 — Infrastructure & Deployment

**Document:** Production Infrastructure — Hosting, Environments, CI/CD, Secrets, Monitoring, Backups, Disaster Recovery, Release Process, Migrations, Scaling, Security Hardening, Runbooks
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint — Core Engine First)
**Status:** Draft for approval
**Owner:** Founder / CTO / DevOps Architect
**Depends on (frozen):** `01_Vision.md` through `11_External_Integrations.md`
**Last updated:** 2026-07-01

---

## 0. How to read this document

This document defines **everything required to deploy and operate Verocrest OS in production**. It is the operational contract for engineers who ship, monitor, and recover the system.

- **No new product functionality.** Every infrastructure choice serves the architecture frozen in `01–11`.
- **Naming note:** documents `01–11` reference deployment content as `16_Deployment.md` (the original folder plan). By founder instruction, that content lives **here**, as `12_Infrastructure_Deployment.md`. Every upstream reference to "16_Deployment.md" resolves to this document. No frozen content changes; only the document number moved.
- **Managed-first.** Per architecture Principle 2 (`03` §1): Vercel + Supabase + Inngest + Browserless replace a DevOps team. This document specifies exactly how those managed services are configured, monitored, and recovered — and when we would leave them (escape hatches, `03` §13).
- **Runbooks are part of the contract.** §16 contains the operational runbooks referenced throughout `03`, `10`, and `11`. An incident without a runbook is a design gap.

If a downstream implementation contradicts what is written here, this document wins until formally amended.

---

## 1. Infrastructure Principles

Seven principles, ordered. Earlier ones win in conflict.

1. **Managed over self-hosted until it hurts.** We operate zero servers in v0.1. Every service is a managed platform with an SLA and a documented exit.
2. **Environments are isolated, not shared.** Production, staging, preview, and local never share databases, secrets, OAuth clients, or provider keys.
3. **Every deploy is reversible in under five minutes.** Vercel instant rollback + backward-compatible migrations make rollback a button, not a project.
4. **Migrations never break the running version.** Forward-only, expand-contract. The previous deploy must tolerate the new schema.
5. **Secrets never touch git, logs, or client bundles.** Enforced by tooling, not discipline.
6. **If it isn't monitored, it isn't in production.** Every service has health checks, alerts, and a dashboard before it takes traffic.
7. **Recovery is rehearsed, not assumed.** Backup restore and provider-outage drills are scheduled events, not aspirations.

---

## 2. Hosting Topology

### 2.1 Production stack (all managed, per `03` §3)

| Layer | Provider | Plan (v0.1) | Region |
|---|---|---|---|
| Application (Next.js 15, Server Actions, Route Handlers) | **Vercel** | Pro | US-East (iad1 primary) |
| Database, Auth, Storage, Realtime, Vault | **Supabase** | Pro | US-East (aws us-east-1) |
| Durable execution / Agency Event Bus runtime | **Inngest** | Starter → Standard | US (cloud) |
| Headless Chrome (audits) | **Browserless.io** | Starter (6 concurrent) | US |
| Transactional email | **Resend** | Pro | Global (US send infra) |
| LLM providers | **Anthropic + OpenAI** | API (pay-as-you-go) | US endpoints |
| Error tracking | **Sentry** | Team | US |
| Log ingestion + metrics | **Axiom** | Team | US |
| DNS + domain | **Cloudflare** (DNS only, no proxy in v0.1) | Free | Global |
| Source control + CI | **GitHub + GitHub Actions** | Team | — |

**Region rationale:** US-East is the frozen decision (`03` §3.5, Decision Log). Vercel functions and Supabase Postgres are co-located in US-East to keep the app→DB round trip < 5ms.

### 2.2 Domains

| Domain | Purpose | TLS |
|---|---|---|
| `verocrest.app` | Production application | Vercel-managed (Let's Encrypt) |
| `staging.verocrest.app` | Staging | Vercel-managed |
| `*.vercel.app` preview URLs | Per-PR previews (access-protected) | Vercel-managed |
| `notifications.verocrest.app` | Resend transactional sending domain (`11` §9.4) | SPF/DKIM/DMARC records in Cloudflare DNS |

DNS is hosted at Cloudflare in **DNS-only mode** (no orange-cloud proxy) — Vercel terminates TLS and manages certificates. Cloudflare proxy is a Phase 3+ consideration (WAF), not v0.1.

### 2.3 Network boundaries

- **Public ingress:** Vercel edge only. Supabase Postgres is not exposed publicly except via Supavisor with TLS + password; direct DB access restricted to CI (migrations) and founder workstation (allowlisted via Supabase dashboard network restrictions when available on plan).
- **Egress:** Vercel functions + Inngest workers call providers over TLS 1.3. No VPC peering in v0.1 (managed plans don't require it).
- **Webhook ingress:** all receivers signature-verified per `11` §13.2; unauthenticated surfaces limited to the endpoints enumerated in `10` §4.

---

## 3. Environments

Per `03` §2.3, four environments. Nothing is shared between them.

| | local | preview | staging | production |
|---|---|---|---|---|
| **Purpose** | Founder development | Per-PR validation | Pre-prod integration | Live |
| **App** | `next dev` on localhost | Vercel preview deploy per PR | Vercel `staging` branch deploy | Vercel production (tagged release on `main`) |
| **Database** | Supabase local (Docker) | Shared dev Supabase project (per-PR schema prefix) or Supabase Branching when available on tier | Dedicated Supabase staging project | Dedicated Supabase prod project (US-East) |
| **Inngest** | Inngest dev server (local) | Inngest branch environments | Inngest staging env | Inngest production env |
| **Provider mode** | All mocks (`11` §16.1) | Mocks by default; sandbox keys opt-in | Real providers, sandbox credentials, cost caps (`11` §16.2) | Real providers, production keys |
| **Access** | Founder machine | Vercel preview protection (team-only) | Team-only (Vercel password protection) | Public |
| **Secrets** | `.env.local` (gitignored) from Vercel `development` scope | Vercel `preview` scope | Vercel `preview` scope (staging-specific vars) + staging Supabase | Vercel `production` scope |

**Environment invariants:**

- Separate Google OAuth clients per environment (`11` §11.7)
- Separate Anthropic/OpenAI keys with monthly cost caps on non-production ($10 each, `11` §16.2)
- Separate Resend domains (sandbox subdomain for staging)
- Production Supabase service-role key exists **only** in Vercel production scope and the CI migration step — never on developer machines

---

## 4. CI/CD Pipeline

### 4.1 Repository layout

- Single **Turborepo + pnpm workspaces** monorepo (`03` §3.20), GitHub-hosted
- Branch model: trunk-based — short-lived feature branches → PR → squash-merge to `main`
- `main` is always deployable; releases are tagged commits on `main`

### 4.2 CI (GitHub Actions) — on every PR

Pipeline stages, all required to merge (Turborepo remote caching keeps the full run under ~5 minutes):

1. **Install + cache** — pnpm with lockfile-frozen install
2. **Typecheck** — `tsc --noEmit` across all packages
3. **Lint** — ESLint including the module-boundary rules (`03` §5), SDK-import restrictions (`11` §2), and no-`console.log` production rule (`NFR-OBS-002`)
4. **Unit tests** — Vitest; domain logic, scoring composition, envelope shapes
5. **Integration tests** — against local Supabase (Docker service container); all provider adapters in mock mode (`11` §16.4)
6. **Tenancy Fuzzer** — cross-workspace probes on every business endpoint (`03` §4.5); any 200 on a cross-tenant probe fails the build
7. **RLS lint** — `drizzle-check-rls` verifies every new business table has `workspace_id`, RLS enabled, and a tenancy policy (`04` §27)
8. **Prompt regression tests** — golden-input fixtures against mocked Router for every AI-touching change (`NFR-MNT-003`); real-provider evals run nightly, not per-PR (`11` §16.4)
9. **Event contract tests** — subscribers validated against fixed emitter payload fixtures (`03` §16)
10. **Secret scanning** — GitHub push protection + gitleaks step
11. **Dependency audit** — `pnpm audit` + Dependabot alerts gate on critical CVEs (`NFR-SEC-013`)
12. **Build** — `next build` via Turborepo; bundle-size budget check (warn > 10% growth)

### 4.3 CD (Vercel) — deployment flow

```
PR opened ──▶ Vercel preview deploy (automatic)
                 │  reviewer validates on preview URL
                 ▼
Squash-merge to main ──▶ staging deploy (staging.verocrest.app)
                 │  nightly real-provider integration suite runs here
                 ▼
Tag release (vX.Y.Z) ──▶ production deploy
                 │
                 ├─ 1. CI migration step applies pending migrations to prod DB
                 ├─ 2. Vercel builds + promotes the tagged commit
                 ├─ 3. Synthetic canary suite runs (7 checks, `11` §16.5)
                 │      └─ any canary failure ⇒ automatic rollback (§9.4)
                 └─ 4. Release notes posted; Sentry release created for source maps
```

- **Preview:** every PR; database is shared-dev (mock providers)
- **Staging:** continuous from `main`; real sandbox providers
- **Production:** explicit tag only — never auto-deploy on merge. The founder (or release owner) cuts the tag deliberately.

### 4.4 Deploy cadence

- Act I target: multiple production deploys per week; no deploy freeze windows except during an active incident
- Migrations decoupled from code deploys where possible (§13); schema-first, code-second sequencing

---

## 5. Secrets Management

### 5.1 Storage locations (per `10` §9.9, `11` §13.1)

| Secret class | Location | Access |
|---|---|---|
| System-wide provider keys (Anthropic, OpenAI, Resend, Browserless, Google OAuth client, Supabase keys) | Vercel Environment Variables, scoped per environment | Vercel team members; runtime only |
| Per-workspace OAuth tokens (Gmail, Calendar) | Supabase Vault-encrypted columns (`04` §19, `11` §3.8) | Adapter code only, via Vault decryption |
| CI-only secrets (prod `DATABASE_URL` for migrations, Supabase service-role) | GitHub Actions encrypted secrets, environment-protected (`production` environment requires review) | The migration job only |
| Local dev secrets | `.env.local` pulled via `vercel env pull` (development scope only) | Founder machine |

### 5.2 Rules (enforced, not advisory)

- No secret in git — GitHub push protection + gitleaks CI step block the commit
- No secret in client bundles — no `NEXT_PUBLIC_` prefix on any credential; CI greps built client chunks for known key patterns
- No secret in logs — logger wrapper redacts known-sensitive keys (`10` §13.1)
- Production service-role key never on developer machines (§3 invariant)

### 5.3 Rotation (per `11` §11.8, §14.3)

| Secret | Cadence | Method |
|---|---|---|
| Provider API keys (Anthropic, OpenAI, Resend, Browserless) | Quarterly | Dual-key overlap window (24h): add new key → verify canaries → remove old |
| Google OAuth client secrets | Annually or on suspected compromise | Provider console rotation, no downtime |
| Supabase service-role / anon keys | On compromise only (Supabase-managed) | Dashboard regeneration + env update + redeploy |
| Vault encryption keys | Supabase-managed, transparent | — |
| Webhook signing secrets (Resend, Browserless, Pub/Sub token) | Annually | Dual-secret verification window |

Rotation events logged to `action_log` where workspace-scoped, and to the ops changelog otherwise.

---

## 6. Monitoring & Alerting

### 6.1 Monitoring surfaces (per `03` §15, `09` §9, `10` §13, `11` §15)

| Surface | Tool | What it watches |
|---|---|---|
| Errors (FE + BE) | Sentry | Exceptions, release health, error rate per endpoint |
| Structured logs + metrics | Axiom | Every request, AI call, adapter call, job run |
| Web performance | Vercel Analytics + Speed Insights | Core Web Vitals, TTI (NFR-PERF-003/004) |
| Async jobs + events | Inngest dashboard | Function runs, retries, dead-letters, event throughput |
| Database | Supabase dashboard + Axiom-shipped pg metrics | Connections, slow queries, RLS latency, storage growth |
| Uptime | External probe (Checkly or UptimeRobot) hitting `/api/health` + `/api/ready` every 60s from 3 regions | Availability (NFR-AVL-001) |
| AI cost | `ai_usage_daily` + Axiom dashboards | Spend per capability/workspace vs budget |

### 6.2 Consolidated alert table

All alert thresholds from `03` §15, `09` §9.6, `10` §13.6, `11` §14.5, in one place. Severity: **Page** = immediate notification to founder (phone-level), **Warn** = Slack-equivalent/email channel.

| Signal | Threshold | Severity |
|---|---|---|
| API 5xx rate | > 1% over 5 min | Page |
| API P95 latency | > 2× SLO for any endpoint | Page |
| Router (AI) error rate | > 1% over 5 min | Page |
| AI provider failover rate | > 10% over 5 min | Page |
| Structured-output failure per capability | > 3% | Warn |
| AI cost per workspace | > 2× rolling 7-day average | Warn |
| Cost anomaly per capability | today's median > 2× 30-day median | Warn |
| Webhook failure rate | > 5% over 15 min | Page |
| Webhook 4xx rate | > 5% | Warn |
| Circuit breaker open | > 5 min continuous | Page |
| Provider error rate | > 5% / > 10% over 5 min | Warn / Page |
| Uptime probe | 2 consecutive failures from 2+ regions | Page |
| DB slow queries | P95 > 500ms sustained | Warn |
| DB connections | > 80% of pool | Warn |
| Storage usage | > 80% of plan | Warn |
| Inngest dead-letter arrivals | any | Warn |
| Reminder sweep / cron missed | any scheduled job absent > 2× its interval | Page |
| Gmail quota consumption | > 80% | Warn |
| Resend bounce rate | > 2% / complaint > 0.1% | Warn / Page |
| Idempotency replay rate per endpoint | > 20% | Warn |
| Rate-limit rejection rate per workspace | > 5% | Warn |
| Action-log checksum chain break (nightly verify) | any | Page |

### 6.3 On-call

Act I: founder is the on-call. Paging channel: Sentry mobile push + phone escalation. Every Page-severity alert has a runbook entry in §16. Post-Act-I (team growth) introduces a rotation — deferred.

---

## 7. Logging

Per `NFR-OBS-001/002`, `10` §13.1, `11` §15.1:

- **Format:** structured JSON only; no bare `console.log` in production paths (ESLint-enforced)
- **Sink:** Axiom, via `packages/platform-observability/` logger
- **Mandatory fields:** `requestId`, `level`, `message`, `endpoint`/`operation`; plus `workspaceId`, `userId` where in context
- **PII policy:** no email bodies, message contents, tokens, passwords, or full phone numbers; redaction in the logger wrapper, backed by a lint rule
- **Retention:** 90 days hot in Axiom (Team plan); monthly export of aggregates for long-term trend analysis
- **Correlation:** `correlation_id` on event chains (`10` §13.5) enables reconstruction of a full user action across API → Bus → subscribers
- **Audit trail:** the `action_log` table (`04` §15) is the tamper-evident business audit; Axiom is the operational log. They are different systems with different guarantees — never conflate them.

---

## 8. Backups & Data Durability

### 8.1 Database

| Mechanism | Coverage | Frequency | Retention |
|---|---|---|---|
| Supabase automated backups | Full Postgres | Daily | Per Pro plan |
| Point-in-time recovery (PITR) | WAL-level | Continuous | 7 days (`NFR-AVL-004`, `04` §25) |
| Logical dump to external storage | `pg_dump` of full schema + data, encrypted, to a separate cloud bucket (Cloudflare R2 or Backblaze B2) **outside Supabase** | Weekly (Sunday 02:00 UTC via GitHub Actions cron) | 8 weekly + 6 monthly |

The external logical dump is the guard against provider-level failure (Supabase account compromise or regional disaster). It is encrypted with a key held outside Supabase (GitHub Actions secret + offline copy).

### 8.2 Storage (files)

- Supabase Storage buckets replicated by provider
- Weekly `rclone` sync of `proposals` and `audits` buckets (the legally-relevant artifacts: signed proposal PDFs, audit evidence) to the same external bucket
- `imports` and `attachments` follow retention rules in `04` §25; not externally mirrored in v0.1 (recoverable from source or acceptable loss)

### 8.3 Configuration & infrastructure state

- Vercel project settings, Inngest function configuration, and Supabase config are exported to a `infra/state/` directory in the repo monthly (scripted snapshot) — infrastructure-as-code is deliberately light in v0.1 (managed platforms), but the settings snapshot makes reconstruction deterministic
- DNS zone file exported quarterly

### 8.4 Restore verification

**A backup that has never been restored is a hypothesis.** Quarterly drill (§16.9): restore the latest weekly logical dump into a scratch Supabase project, run the Tenancy Fuzzer and a smoke suite against it, record the time-to-restore. Target: < 4 hours to a working restore.

---

## 9. Deployment Strategy & Release Process

### 9.1 Release unit

A release is a **tagged commit on `main`** (`vX.Y.Z`, semver-ish: minor for features, patch for fixes; major reserved for Act II milestones). Every release has:

- A changelog entry (auto-generated from PR titles, human-edited)
- A Sentry release (source maps uploaded)
- A migration manifest (which migrations it expects to be applied)

### 9.2 Deployment sequence (production)

1. **Migrations first** (§13) — CI job applies pending migrations; the *currently running* version must tolerate the new schema (expand-contract)
2. **Deploy** — Vercel builds and atomically promotes; zero-downtime by platform design (new lambdas take traffic when ready)
3. **Canary suite** — 7 synthetic checks per `11` §16.5 (< 3 minutes)
4. **Bake** — 30-minute observation window on Sentry release health + Axiom error dashboards before the release is declared healthy

### 9.3 Progressive delivery

- v0.1 has no traffic-splitting canary deploys (single-tenant Act I usage doesn't justify it). Progressive rollout is achieved with **feature flags** (§12) instead: deploy dark, enable per-workspace.
- Phase 2+ (multi-workspace SaaS) revisits percentage rollouts via Vercel's skew protection + flag-based cohorts.

### 9.4 Rollback

| Failure point | Action | Time |
|---|---|---|
| Canary suite fails post-deploy | Automatic: Vercel instant rollback to previous deployment; alert founder | < 2 min |
| Regression discovered during bake | Manual: one-click Vercel rollback | < 5 min |
| Bad migration (schema) | **Never roll back schema.** Roll forward with a corrective migration. Code rollback is safe because migrations are backward-compatible for one release (§13.2) | varies |
| Bad data from a code bug | Restore affected rows from PITR into a scratch instance, repair via scripted UPDATE with `action_log` entries | runbook §16.8 |

### 9.5 Deploy freeze

Only during an active Sev-1 incident. No calendar-based freezes in Act I.

---

## 10. Health Checks

Per `10` §13.7:

- `GET /api/health` — liveness: process is up. Used by uptime probes.
- `GET /api/ready` — readiness: checks DB connectivity (`SELECT 1` through Supavisor), Supabase Auth JWKS reachability, and primary AI provider reachability (cheap HEAD-equivalent). Returns 503 with a component breakdown if any check fails.
- Inngest functions carry their own heartbeat: the reminder-sweep cron writes a `heartbeat` row; a meta-monitor alerts if the heartbeat is stale > 2× interval (catches "silent cron death").

---

## 11. Scaling Strategy

### 11.1 v0.1 load envelope

Per `03` §12: ~500 workspaces, ~5M contacts, ~1M vectors, P95 reads < 250ms on a single Supabase Pro instance. Act I actual load is one workspace — the envelope is headroom, not a target.

### 11.2 Scaling levers (in order of use)

1. **Vercel:** automatic — serverless scales horizontally with traffic; no action needed until cold-start latency on AI streams hurts (escape hatch: move AI routes to Fly.io/Modal, `03` §13)
2. **Supabase compute:** vertical bump (Pro → larger compute add-on) when CPU > 70% sustained or connection pressure appears
3. **Read replicas:** Supabase read replicas for dashboard/report reads when read latency degrades (`NFR-SCL-004`)
4. **pgvector:** partition `memory_vectors` by workspace or move to dedicated vector store at > 10M vectors / > 300ms P95 similarity (`03` §13, `09` §4.7)
5. **Browserless:** plan bump at concurrency saturation; self-hosted Playwright pool at ~$1500/mo spend (`11` §6.14)
6. **Inngest:** plan bump; self-host or Temporal at cost/SLA trigger (`03` §13)
7. **Postgres exit:** self-hosted Postgres + PgBouncer when RLS P95 > 300ms sustained (`03` §13)

### 11.3 What we deliberately do not build in v0.1

No Kubernetes, no Terraform-managed VPCs, no Redis, no CDN beyond Vercel's, no message broker beyond Inngest, no multi-region. Each has a documented trigger in `03` §13; none has fired.

---

## 12. Feature Flags

Per `04` §20.2 (`feature_flags` + `feature_flag_defaults` tables — already frozen schema):

- **Evaluation:** server-side only, in the Service Layer; flags resolved per workspace with global-default fallback. No third-party flag SaaS (`03` §3 decision).
- **Caching:** flags cached in-process 30s; a `feature_flag.updated` bus event busts the cache.
- **Use cases in v0.1:**
  - Dark-launching a module surface before enabling it for the Verocrest workspace
  - Kill switches for AI capabilities (flag off = capability returns `FEATURE_NOT_AVAILABLE` cleanly) — the operational complement to budget gating
  - Phase 2/3 module gating (Client Portal etc. ship dark behind flags before their phase trigger)
- **Hygiene:** every flag has an owner and an intended-removal milestone recorded in `feature_flag_defaults.description`; quarterly flag review removes dead flags.
- **Client exposure:** the client receives only the resolved boolean surface it needs (via RSC props), never the full flag table.

---

## 13. Database Migrations

Per `04` §27 (frozen) — operationalized here.

### 13.1 Tooling & flow

- `drizzle-kit` generates SQL migrations from schema diffs; migrations are reviewed as plain SQL in the PR
- Applied via Supabase CLI in a dedicated GitHub Actions job (`production` environment, review-gated)
- Migration state tracked in the standard drizzle migrations table; CI fails if prod has unapplied migrations older than the deploying release expects

### 13.2 Expand-contract sequencing (the one rule that matters)

Every schema change ships so the **previous** deploy keeps working:

```
add column (nullable/defaulted) → deploy code writing it → backfill → deploy code reading it → drop old column in a LATER release
```

- Destructive steps (drops, renames) are separate, tagged, and never bundled with the code deploy that depends on them
- Enum changes are append-only (`04` §22); value removal is a two-step data migration
- RLS lint runs on every migration (§4.2 step 7)

### 13.3 Long-running migrations

- Backfills run as Inngest jobs in batches (not in the migration transaction) — migrations themselves must complete in < 30s to avoid lock pressure
- Index builds use `CREATE INDEX CONCURRENTLY`; HNSW builds on `memory_vectors` scheduled off-peak

### 13.4 Migration rollback posture

Schema is never rolled back (§9.4). A bad migration gets a corrective forward migration. This is why backward compatibility for one release is non-negotiable.

---

## 14. Security Hardening

Consolidates the operational side of `10` §9, `11` §13, and `15_Security.md`'s future detail (the security *design* doc remains in the doc plan; this section is the *operational* hardening checklist).

### 14.1 Platform hardening

- **Vercel:** deployment protection on production (only `main` tags deploy); preview deployments password-protected; Vercel team 2FA mandatory
- **Supabase:** MFA on the Supabase dashboard account; network restrictions on direct DB access where plan supports; service-role key confined per §5
- **GitHub:** branch protection on `main` (required CI checks, no force-push, signed commits encouraged); Dependabot + secret scanning + push protection on; `production` environment requires manual approval for the migration job
- **Google Cloud (OAuth + Pub/Sub):** dedicated project per environment; owner access limited to founder account with 2FA/passkey

### 14.2 Application hardening (deployed configuration)

- Security headers set at `next.config` / middleware: `Strict-Transport-Security` (2y, preload), `Content-Security-Policy` (script-src self + Vercel analytics; frame-ancestors none), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal
- Cookies: httpOnly, Secure, SameSite=Lax throughout (`10` §2.6)
- Rate limits live per `10` §9.3; CSRF per `10` §9.7; CORS same-origin per `10` §9.8
- Dependency policy: critical CVE = merge-blocking; high = 7-day fix SLA; Renovate/Dependabot auto-PRs weekly

### 14.3 Verification cadence

| Check | Cadence |
|---|---|
| Tenancy Fuzzer | Every PR (CI) |
| Action-log checksum chain verification | Nightly job |
| Dependency audit | Every PR + weekly sweep |
| Secret scan | Every push |
| Security-header regression test | Every PR (integration test asserts headers) |
| Access review (Vercel/Supabase/GitHub/Google members + keys) | Quarterly |
| Restore drill | Quarterly (§8.4) |
| Provider scope review | Quarterly (`11` §13.7) |
| External penetration test | Pre-SaaS-launch gate (Act II), not v0.1 |

---

## 15. Disaster Recovery

### 15.1 Objectives

| Metric | Target (v0.1) |
|---|---|
| **RPO** (max data loss) | ≤ 5 minutes (PITR WAL granularity) for DB; ≤ 1 week for externally-mirrored files |
| **RTO** (time to restore service) | ≤ 4 hours for full-provider-loss scenarios; ≤ 15 minutes for app-layer incidents |

These are honest Act I targets for a managed-stack solo operation — not enterprise SLAs. They tighten in Act II.

### 15.2 Scenario matrix

| Scenario | Response | Runbook |
|---|---|---|
| Bad deploy | Vercel instant rollback | §16.1 |
| Vercel regional outage | Wait (managed multi-AZ) or emergency-deploy to a secondary Vercel region; status page comms | §16.2 |
| Supabase outage | Degraded banner + status comms; app is read-broken by design (no DB = no app); escalate via Supabase support; if extended (> 4h), evaluate PITR restore to new project | §16.3 |
| Supabase data corruption / bad data bug | PITR restore to scratch project → surgical repair → replay | §16.8 |
| Total Supabase loss (account/region) | Restore weekly external logical dump into fresh Postgres (new Supabase project or self-hosted); re-point `DATABASE_URL`; re-run storage sync; accept RPO up to 1 week for files, PITR-window for data if partial | §16.9 |
| AI provider outage (one) | Automatic Router failover (`09` §2.5); no action | — |
| AI provider outage (both) | AI features degrade gracefully (`NFR-AVL-002`); queued drafts retry; comms if > 1h | §16.4 |
| Gmail/Calendar API outage | Outreach send + booking degrade with clear UX (`05` §14); polling fallback for replies | §16.5 |
| Inngest outage | Events buffered in `event_journal` (transactional write survives, `10` §11.3); reconciliation cron replays on recovery | §16.6 |
| Domain/DNS incident | Cloudflare DNS rollback from exported zone file | §16.7 |
| Secrets compromise | Rotate per §5.3 immediately; audit `action_log` + Axiom for abuse window; force session invalidation | §16.10 |

### 15.3 Communication

- Status page: a simple hosted status page (Instatus/BetterStack free tier) at `status.verocrest.app`, updated manually during incidents
- Act I audience is internal + a handful of clients via the founder directly; formal SLA comms are an Act II concern

---

## 16. Operational Runbooks

Each runbook: symptoms → diagnosis → action → verification. Kept in `docs/runbooks/` in the repo; summarized here as the canonical index.

### 16.1 Bad deploy / elevated error rate

1. **Symptoms:** Sentry page (5xx > 1% or new release error spike)
2. **Diagnose:** Sentry release comparison — is the spike release-correlated?
3. **Act:** Vercel dashboard → Rollback to previous deployment (or `vercel rollback` CLI). Do **not** revert migrations.
4. **Verify:** canary suite green; error rate back to baseline within 10 min
5. **Follow-up:** root-cause on the reverted commit before re-release

### 16.2 Vercel platform incident

1. Check status.vercel.com; if platform-wide, post status update and wait (functions are multi-AZ)
2. If isolated to our project: redeploy the same tag (forces fresh build/promotion)
3. If regional and extended: change project region + redeploy (accept cold caches)

### 16.3 Supabase outage

1. `GET /api/ready` shows DB component failing; confirm status.supabase.com
2. Post status page update ("degraded — data plane provider incident")
3. Nothing self-serve fixes a provider outage: open a Supabase support ticket (Pro SLA)
4. At the 4-hour mark, convene the §16.9 decision: restore-elsewhere vs continue waiting (weigh RPO loss vs downtime)

### 16.4 Both AI providers down

1. Router alerts (failover > 10% then both failing)
2. Verify provider status pages; confirm circuit breakers open
3. Enable the AI kill-switch flag (clean `FEATURE_NOT_AVAILABLE` UX instead of retry loops)
4. Queued jobs (audits, classifications) remain in Inngest with backoff — no action
5. On recovery: disable kill switch; watch cost dashboard for retry-burst anomaly

### 16.5 Gmail send failures / reply detection stalled

1. Alert: send failure rate > 5% or push-to-poll fallback engaged > 15 min
2. Check Google Workspace status; check OAuth token health in `integration_connections`
3. Token-level failure → connection flips `expired`; owner reconnects via Settings banner
4. Pub/Sub failure → confirm polling fallback is running (Inngest cron logs); replies delayed, not lost
5. Watch-expiry storm → run the re-registration job manually

### 16.6 Inngest outage / event backlog

1. Inngest status page; dashboard shows stalled functions
2. **No data loss:** `event_journal` has every event transactionally (`10` §11.3)
3. On recovery: run the reconciliation job (replays journal events missing from Inngest since last cursor)
4. Verify: dead-letter queue empty; dashboard denorm freshness recovered

### 16.7 DNS incident

1. Symptoms: domain unreachable, cert errors
2. Cloudflare dashboard → verify records against the exported zone file in `infra/state/`
3. Restore records; TTLs are 300s so propagation is fast

### 16.8 Bad data from a code bug (surgical repair)

1. Identify affected rows + time window from `action_log` + `event_journal` (correlation IDs)
2. PITR-restore the pre-bug state into a **scratch** Supabase project
3. Write a repair script that diffs scratch vs prod for affected rows and applies corrections as normal Service-Layer writes (so `action_log` records the repair)
4. Never bulk-UPDATE prod directly without an action-log trail
5. Post-repair: verify checksum chain integrity job passes

### 16.9 Full restore drill / total-provider-loss recovery

1. Create fresh Supabase project (scratch for drills; real for disaster)
2. Restore latest external logical dump (`pg_restore`); apply any migrations newer than the dump
3. Run Tenancy Fuzzer + smoke suite against the restore
4. For real disaster: update `DATABASE_URL` + Supabase keys in Vercel env, redeploy, run canaries, sync storage buckets back from external mirror
5. Record time-to-restore; drill target < 4h

### 16.10 Secrets compromise

1. Identify scope (which key, exposure window)
2. Rotate immediately per §5.3 (dual-key window skipped in emergencies — accept brief errors)
3. For Supabase keys: regenerate + redeploy; force-invalidate all sessions if auth material was exposed
4. Audit: Axiom + `action_log` + provider dashboards for the exposure window; document findings
5. If workspace OAuth tokens were exposed: revoke via provider, mark connections `revoked`, notify affected users to reconnect

### 16.11 Cost runaway (AI or Browserless)

1. Axiom cost-anomaly alert fires
2. Check `ai_usage_events` for the offending capability × workspace; check for a regeneration loop or prompt regression
3. Immediate containment: lower the workspace AI budget (gates at Router) or flip the capability kill-switch flag
4. Root-cause before re-enabling; check `outreach.draft.rejected` rates for prompt-quality regressions

---

## 17. Cost Envelope (operational forecast)

Consistent with the MVP cost model presented at architecture approval:

| Item | Monthly (v0.1) |
|---|---|
| Vercel Pro | $20 |
| Supabase Pro | $25 + compute/storage growth |
| Inngest | $0–50 |
| Browserless | $50–200 |
| Resend | $0–20 |
| Anthropic + OpenAI | $100–500 (budget-gated) |
| Sentry + Axiom | $0–50 |
| Uptime probe + status page | $0–15 |
| External backup storage (R2/B2) | $1–5 |
| Domains + DNS | ~$2 |
| **Total** | **~$250–900/month** |

Reviewed monthly against the internal ROI metrics in `01` §12.1.

---

## 18. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | Deployment/infra content lives at `12_Infrastructure_Deployment.md`; upstream references to `16_Deployment.md` resolve here | Founder-directed document reordering; no frozen content changed |
| 2026-07-01 | Cloudflare DNS-only (no proxy) in v0.1 | Vercel owns TLS + edge; double-proxying adds failure modes without WAF need at Act I scale |
| 2026-07-01 | Production deploys on explicit tag only; staging continuous from `main` | Deliberate releases with migration sequencing; trunk stays always-deployable |
| 2026-07-01 | Canary-failure ⇒ automatic rollback | The 7-check suite (`11` §16.5) is a deploy gate, not a report |
| 2026-07-01 | No traffic-split canary deploys in v0.1; feature flags provide progressive delivery | Single-workspace Act I usage; flags are cheaper and already in schema (`04` §20.2) |
| 2026-07-01 | Schema never rolls back; forward-only corrective migrations | Expand-contract makes code rollback safe; schema rollback is where data loss lives |
| 2026-07-01 | Weekly encrypted logical dump to storage **outside Supabase** | PITR doesn't survive provider/account-level loss; independent copy is the last line |
| 2026-07-01 | Quarterly restore drills with recorded time-to-restore | An unrestored backup is a hypothesis |
| 2026-07-01 | External uptime probe from 3 regions on `/api/health` + `/api/ready` | Self-monitoring can't see its own outage |
| 2026-07-01 | Founder is on-call in Act I; every Page alert has a runbook | Honest solo-operator model; runbooks make 03:00 incidents tractable |
| 2026-07-01 | Backfills via Inngest batches, never inside migration transactions; `CREATE INDEX CONCURRENTLY` | Keeps migrations < 30s; avoids lock storms |
| 2026-07-01 | AI kill-switch feature flags as the operational complement to budget gating | Clean degradation beats retry storms during provider incidents |
| 2026-07-01 | RPO ≤ 5 min (DB) / RTO ≤ 4 h (provider loss) as honest v0.1 targets | Enterprise DR theater would be fiction at this stage; these are achievable and rehearsed |
| 2026-07-01 | Monthly scripted snapshot of Vercel/Inngest/Supabase settings + quarterly DNS export to `infra/state/` | Light-touch IaC substitute appropriate to a managed stack |
| 2026-07-01 | Status page (Instatus/BetterStack free) at `status.verocrest.app` | Minimal, honest incident comms surface for Act I |
| 2026-07-01 | External penetration test deferred to Act II pre-SaaS gate | Aligns with CMP-005 SOC 2 timeline; Tenancy Fuzzer + hardening checks cover Act I risk profile |

---

## 19. Resolved Decisions

1. **Hosting matrix** → §2.1 table (all managed, US-East)
2. **DNS** → Cloudflare DNS-only; Vercel TLS
3. **Environment isolation** → four environments, zero sharing (§3)
4. **CI gate list** → 12 required stages (§4.2)
5. **Deploy trigger** → tag-only production; continuous staging (§4.3)
6. **Secrets locations + rotation cadence** → §5
7. **Alert table** → §6.2 consolidated thresholds and severities
8. **Log retention** → 90 days hot in Axiom
9. **Backup layers** → PITR (7d) + daily provider backup + weekly external encrypted dump (§8)
10. **Restore drill cadence** → quarterly, < 4h target
11. **Rollback rules** → app instant; schema never (§9.4)
12. **Progressive delivery** → feature flags, not traffic splitting (§9.3, §12)
13. **Flag system** → in-schema tables, server-side evaluation, 30s cache (§12)
14. **Migration sequencing** → expand-contract, < 30s migrations, Inngest backfills (§13)
15. **Hardening checklist + cadences** → §14
16. **DR objectives** → RPO ≤ 5 min DB / RTO ≤ 4 h (§15.1)
17. **Runbook set** → 11 runbooks indexed in §16, maintained in `docs/runbooks/`
18. **On-call model** → founder, Page/Warn two-tier severity (§6.3)

No open questions remain on infrastructure and deployment.

---

## 20. Approval Gate

To move to the next blueprint document, the founder must sign off on:

1. **Hosting topology** (§2) — all-managed stack, US-East co-location, Cloudflare DNS-only.
2. **Four-environment model with zero sharing** (§3), including separate OAuth clients and cost-capped sandbox keys.
3. **CI pipeline** (§4.2) — all 12 stages required to merge, including Tenancy Fuzzer and RLS lint as build-blockers.
4. **Tag-only production deploys** with migration-first sequencing and automatic rollback on canary failure (§4.3, §9).
5. **Secrets management** (§5) — locations, enforcement rules, rotation cadences.
6. **Consolidated alert table and severities** (§6.2) with founder as Act I on-call (§6.3).
7. **Backup architecture** (§8) — PITR + provider backups + weekly external encrypted dump + quarterly restore drills.
8. **Rollback doctrine** (§9.4) — instant app rollback; schema forward-only.
9. **Feature flags as the progressive-delivery mechanism** (§12) including AI kill switches.
10. **Migration operations** (§13) — expand-contract, concurrent indexes, Inngest backfills.
11. **Security hardening checklist and verification cadences** (§14), with external pen-test deferred to the Act II pre-SaaS gate.
12. **DR objectives and scenario matrix** (§15) — RPO ≤ 5 min / RTO ≤ 4 h as honest v0.1 targets.
13. **The 11 operational runbooks** (§16) as a required deliverable before production launch.
14. **Cost envelope** (§17) — ~$250–900/month operational forecast.
15. **Document-numbering note** — upstream references to `16_Deployment.md` resolve to this document.

---

*End of 12_Infrastructure_Deployment.md*

---

**Should I continue to the next blueprint document?**

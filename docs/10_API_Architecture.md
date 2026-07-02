# 10 — API Architecture

**Document:** Internal APIs, Public Endpoints, External Webhooks, Error Model, Security, Event Integration, Performance, Observability
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint — Core Engine First)
**Status:** Draft for approval
**Owner:** Founder / CTO
**Depends on (frozen):** `01_Vision.md`, `02_Product_Requirements.md`, `03_System_Architecture.md`, `04_Database_Design.md`, `05_User_Flows.md`, `06_Feature_Modules.md`, `07_UI_UX_System.md`, `08_Design_System.md`, `09_AI_Architecture.md`
**Last updated:** 2026-07-01

---

## 0. How to read this document

This document defines **every API surface** in Verocrest OS Version 0.1: how the UI talks to the server, how modules talk to each other, how external systems reach us, and how we reach them.

- **No new product functionality is introduced.** Every endpoint, action, or webhook here powers a feature already scoped in `06_Feature_Modules.md`.
- **Zero contradictions with `01–09`.** Where an implementation choice is required that upstream did not specify (rate-limit numbers, retry counts, envelope shape), the choice is made here with rationale and logged in §15.
- **Production-grade.** Contracts include HTTP method, path, auth, request/response body, validation, errors, rate limits, and dependencies.
- **Password reset** is documented (§5.4) as a Supabase-Auth-managed flow implicit in FR-IDT-001; it is not a new feature.
- **Invite acceptance** is documented (§5.9) as a **Phase 3-reserved stub** — the endpoint shape is fixed so Phase 3 has a landing pad, but no live v0.1 surface exists.

If a downstream implementation contradicts what is written here, this document wins until formally amended.

---

## 1. Purpose

### 1.1 Role of the API layer

The API layer is the **contract boundary** between everything that talks and everything that stores or acts. It exists to:

- Translate typed UI intentions into validated, RLS-scoped state changes
- Preserve the module boundaries in `03` §5 (no cross-domain reaches; only the API can compose across modules)
- Enforce security invariants uniformly (auth, tenancy GUC, rate limits, CSRF, audit log)
- Route asynchronous work to the Agency Event Bus (`03` §8) and long-running work to Inngest
- Absorb external events (webhooks) from Google, Stripe (future), e-sign vendors (future) with signature verification and idempotency
- Provide observability hooks (request ID propagation, structured logging, metrics)

### 1.2 How the layer connects things (no changes to `01–09`)

```
┌──────────────────────┐
│      Frontend        │ Next.js RSC + client components
│  (React components)  │
└──────────┬───────────┘
           │
           │ (a) Server Action call        (b) fetch /api/*
           │      (typed RPC, CSRF-free)         (SSE, webhooks, public)
           ▼
┌──────────────────────┐          ┌──────────────────────┐
│   Server Actions     │          │   Route Handlers     │
│  packages/domain-*   │          │   apps/web/app/api   │
└──────────┬───────────┘          └──────────┬───────────┘
           │                                 │
           │        Both call:               │
           ▼                                 ▼
┌────────────────────────────────────────────────────────┐
│                  Service Layer                          │
│         packages/domain-* + platform-*                  │
│  (repositories, use-case handlers, cross-cutting logic) │
└────┬──────────────┬───────────────┬────────────────────┘
     │              │               │
     ▼              ▼               ▼
┌──────────┐  ┌───────────┐  ┌──────────────┐
│ Postgres │  │ AI Router │  │  Event Bus   │
│ (RLS)    │  │ (§9 of 09)│  │  (Inngest)   │
└──────────┘  └───────────┘  └──────┬───────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │  Inngest Functions   │
                        │  (async, durable,    │
                        │   retry with state)  │
                        └──────────────────────┘

External systems:
  ↔ Google (OAuth) — Gmail send + push + Calendar
  ↔ Anthropic + OpenAI (Router-scoped only)
  ↔ Browserless (Router-scoped only)
  ↔ Resend (transactional email out)
  ↔ Supabase (auth + storage + realtime + DB)
```

Nothing in this diagram changes `01–09`. The API layer is the wiring between the boxes those documents already defined.

---

## 2. API Principles

### 2.1 Philosophy

- **RPC-shaped, not REST-shaped, for internal work.** Server Actions are the default; Route Handlers exist only for surfaces that require an HTTP endpoint (webhooks, SSE, unauthenticated public pages, file downloads).
- **Types are the contract.** Zod schemas at every boundary; TypeScript inference downstream. If it can't be typed, it isn't shipped.
- **Auth is a middleware invariant.** Every mutation runs through the same session guard; skipping is a build-time error via ESLint rules.
- **Idempotency by default on mutations.** Every state-changing operation accepts an idempotency key; the key is honored server-side.
- **Events over cross-module calls.** When Module A needs Module B to react, A emits an event; A does not call B.
- **Never expose internals.** Provider identifiers, prompt strings, and internal enums are not returned to the client unless they serve a user-visible purpose.
- **Errors are values.** No thrown exceptions cross the API boundary; the response envelope carries an `error` field.

### 2.2 Naming conventions

| Surface | Convention | Example |
|---|---|---|
| Server Action | `verbNounCamelCase` | `draftOutreach`, `createContact`, `markDealWon` |
| Route Handler | `/api/<domain>/<resource>[/<id>][/<action>]` — lowercase, hyphenated | `/api/contacts`, `/api/contacts/:id/timeline` |
| Webhook receiver | `/api/webhooks/<provider>` (POST only) | `/api/webhooks/gmail`, `/api/webhooks/google-calendar` |
| Public unauth | `/book/<slug>/<slug>`, `/signup`, `/verify` | `/book/verocrest/discovery` |
| SSE stream | `/api/ai/stream/<capability>` (GET, EventSource) | `/api/ai/stream/draft-outreach-email` |
| Server-rendered file | `/api/exports/<type>/<id>` (GET, signed URL redirect) | `/api/exports/proposal-pdf/:id` |

**Domain segments** in URLs align with `06_Feature_Modules.md` module ownership (`contacts`, `companies`, `leads`, `deals`, `proposals`, `meetings`, `audits`, `outreach`, `kb`, `offers`, `icps`, `dashboard`, `settings`).

### 2.3 Versioning strategy

- **Internal endpoints (Server Actions, Route Handlers used by the app):** unversioned. Signatures evolve with the codebase; consumers (RSC + client components) always match server version.
- **Webhook receivers:** version pinned per provider (Gmail, Calendar). Providers dictate their payload; we adapt.
- **Event Bus schemas:** semver per event, per `03` §8.4 (already frozen).
- **Public API surface for third parties:** **Not shipped in v0.1.** Reserved namespace `/api/public/v1/*` documented but unused. Future SaaS ships it under semver with deprecation policy.
- **AI capability catalogue:** capabilities are stable identifiers (`09` §11); model + prompt versions evolve independently and are logged per call.

### 2.4 Idempotency

Every mutation that could reasonably be double-invoked accepts an `idempotencyKey` (client-generated ULID). The server:

1. Looks up `(workspace_id, endpoint, idempotency_key)` in the last 24h
2. If found → replay the recorded response
3. If not → execute, record `(key, response, expires_at = now + 24h)` in Postgres `idempotency_records` (a small in-repo table — see §2.4.1)
4. Concurrent requests with the same key are serialized via `SELECT ... FOR UPDATE`

Mandatory on: `sendOutreach`, `sendProposal`, `markProposalSigned`, `markDealWon`, `markDealLost`, `bookViaLink`, `runAudit`, `importContactsCsv` (per-batch), all webhook receivers (dedupe by provider message id).

Optional on: read operations, draft creation (regeneration replaces prior draft).

#### 2.4.1 `idempotency_records` (schema addendum — implementation-only, no new product data)

```sql
-- Ships as part of platform-db in a v0.1 migration; not user-visible
CREATE TABLE idempotency_records (
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  endpoint         text NOT NULL,
  idempotency_key  text NOT NULL,
  response_hash    text NOT NULL,
  response         jsonb NOT NULL,
  status_code      integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, endpoint, idempotency_key)
);

CREATE INDEX idx_idempotency_records_expiry ON idempotency_records (expires_at);
```

**Note:** this is not a new product feature; it's the implementation of idempotency for the endpoints already scoped. No user surface. Nightly cron purges expired rows.

### 2.5 Error handling

Every response — success or failure — uses the envelope in §10. Errors are typed by `code` (stable string), classified by `category` (validation / auth / authz / business / rate_limit / integration / ai / database / internal), and carry `requestId` for correlation.

Server Actions return the same envelope shape; the client's response handler is uniform across Server Actions and Route Handlers.

### 2.6 Authentication

All mutating endpoints require an authenticated Supabase session:

- **Session cookie:** `sb-access-token` (httpOnly, Secure, SameSite=Lax) — set by Supabase Auth
- **JWT:** carries `sub` (user id), `email`, custom claim `app_metadata.workspace_ids[]`, exp, iat
- **Active workspace:** additional cookie `vc_active_workspace` (httpOnly) selects which workspace the request runs under
- **Middleware** (`apps/web/middleware.ts`): verifies JWT signature, resolves user + active workspace, sets Postgres session GUCs (`app.workspace_id`, `app.actor_user_id`, `app.request_id`) before any query fires

**Sessions expire** after 12h inactivity, 30 days absolute (`NFR-SEC-011`). Refresh via Supabase's refresh token, transparent to the app.

### 2.7 Authorization

Two-layer model:

1. **Workspace membership** — the user must have an active row in `workspace_members` for the active workspace; otherwise `401`.
2. **Row-Level Security** — every query runs under the workspace GUC; Postgres enforces (`03` §4, `04` §21).

**Role checks in v0.1** — only `owner` vs `member`; enforced in the Service Layer for owner-only operations (integration connect, workspace settings write, offer/ICP delete). Documented per endpoint.

### 2.8 Request lifecycle

Per request:

1. **Edge middleware** — set request ID, propagate to logs
2. **Auth middleware** — verify session, resolve workspace, set GUCs
3. **Rate limit check** — per §9.3
4. **CSRF check** (Route Handlers only) — verify `X-CSRF-Token` matches session cookie
5. **Idempotency check** (if header present) — see §2.4
6. **Zod validation** on input
7. **Business logic** — Service Layer + Repository → Postgres / AI Router / Event Bus
8. **Response assembly** — envelope (§10)
9. **Audit log** — write `action_log` if state-changing (`04` §15)
10. **Structured log** — Axiom sink
11. **Metric** — timing histogram per endpoint

### 2.9 Response standards

- **Success:** `{ data: T, error: null, requestId, meta? }`
- **Error:** `{ data: null, error: E, requestId }`
- **Streaming (SSE):** `Content-Type: text/event-stream`, `data:` frames per §7.4; final frame includes error field if any
- **File download:** `302 Redirect` to a Supabase Storage signed URL (see §9.11)
- **Realtime subscription:** not an HTTP response — client subscribes via Supabase Realtime SDK

Response times honor `NFR-PERF-001, 002, 005, 006` (§12).

---

## 3. Internal APIs

Internal APIs are the mechanisms by which the app's own code talks to itself. Four categories: Server Actions, Route Handlers, Service Layer, Event Bus. Each has a distinct use case.

### 3.1 Server Actions

**When used:** the default for **mutations initiated by the UI** — form submits, inline edits, button clicks. Also used for reads that require server-only credentials or complex composition.

**Ownership:** each module exports its Server Actions from `packages/domain-<name>/actions.ts`. `apps/web` imports them into React components.

**Contract shape (typed, per §2.9):**

```typescript
// packages/domain-contacts/actions.ts
export async function upsertContact(input: UpsertContactInput): Promise<ApiResult<Contact>>;

// apps/web/app/contacts/page.tsx (Server Component)
'use server';
import { upsertContact } from '@verocrest/domain-contacts/actions';
```

**Guarantees:**
- CSRF-safe by Next.js default (Server Actions verify request origin)
- Auth-guarded by a shared `withSession()` wrapper applied at the top of every action
- Automatically envelope-wrapped: throws are caught → error envelope
- Idempotency-key aware when the action declares `idempotency: 'required' | 'optional'`

**Rules:**
- No cross-domain imports (ESLint enforced): `domain-contacts` cannot import from `domain-sales`
- All mutations write to `action_log`
- Async side effects (memory writes, denorm updates) go through the Event Bus, not sync calls

### 3.2 Route Handlers

**When used** — Route Handlers are the escape hatch for surfaces Server Actions can't cover:

- **Webhooks** from external providers (Gmail push, Calendar sync, future Stripe / e-sign)
- **Public unauthenticated pages' data** (public booking page free/busy read)
- **Streaming AI responses** via Server-Sent Events (see §7.4)
- **File downloads** (proposal PDFs, audit exports) — redirect to signed Storage URLs
- **CSV exports** (background-generated, downloaded via signed URL)
- **Health probes** (`/api/health`, `/api/ready`)
- **OAuth callbacks** (Google) — Supabase Auth handles most; we handle post-callback workspace routing

**Ownership:** in `apps/web/app/api/*/route.ts`; thin — they parse, delegate to a Service Layer function, and format the response.

**Contract:**
- HTTP verbs: `GET` for reads, `POST` for creates + actions, `PATCH` for partial updates, `DELETE` for archives, `PUT` unused
- Same auth middleware as Server Actions (except explicit public endpoints)
- CSRF: required for state-changing verbs on authenticated Route Handlers (see §9.7)
- Content-type: `application/json` request + response; SSE endpoints use `text/event-stream`

### 3.3 Service Layer

**When used:** the shared business-logic layer that both Server Actions and Inngest jobs call. Contains repositories (DB access), use-case handlers (business logic), cross-cutting helpers (tenancy, memory, event emission).

**Ownership:** in `packages/domain-*/services/*` and `packages/platform-*`.

**Contract:**
- Pure TypeScript functions; no framework leakage (Next.js not imported here)
- Every function accepts `SessionContext` explicitly (no ambient globals)
- Every function returns typed data or throws typed errors (which the caller — Server Action / Route Handler / Inngest — converts to the envelope)

**Rule:** Server Actions and Route Handlers **must not** contain business logic. They validate, delegate to Service Layer, format the response. This keeps the same logic testable from unit tests + reusable from Inngest jobs.

### 3.4 Event Bus (Inngest)

**When used:** for **asynchronous work** that shouldn't block the request path — long-running (audits), delayed (reminders), fanout (memory writes), cross-module reactions (Outreach Queue re-rank on `lead.scored`).

**Ownership:** in `packages/platform-event-bus/` (typed event definitions + subscribers). Feature code emits via `bus.emit(eventName, payload)`; subscribers register via Inngest functions in `packages/platform-jobs/`.

**Contract:** envelope + delivery guarantees per `03` §8.2 and §8.7. Never `await` an event emission for its side effect; if a caller needs synchronous confirmation, it must call the Service Layer function directly.

**Emit + persist together:** every emit also writes to `event_journal` (per `04` §16) transactionally with the state change that caused it.

### 3.5 When to use which

| Situation | Use |
|---|---|
| React form submits contact update | Server Action `upsertContact` |
| React component fetches contacts list on load | Server Component (`await service.listContacts()`), not a Route Handler |
| Streaming an AI draft to the browser | Route Handler `/api/ai/stream/draft-outreach-email` (SSE) |
| Long-running website audit | Server Action `requestAudit` (returns `{auditId}`) + Inngest function subscribed to `website.audit.requested` |
| Gmail push notification arrives | Route Handler `/api/webhooks/gmail` |
| Company Suggestion resolution after CSV import | Inngest function subscribed to `lead.ingested` (calls Service Layer) |
| Downloading a proposal PDF | Route Handler `/api/exports/proposal-pdf/:id` → 302 to signed Storage URL |
| Realtime dashboard refresh | Supabase Realtime SDK on the client; no API involved |

---

## 4. Public Endpoints — Index

The complete list of HTTP endpoints in v0.1. Each has a detailed spec in §5–§8. **Public** here means "has an HTTP surface" — not "unauthenticated."

| Route | Method | Auth | Purpose | Section |
|---|---|---|---|---|
| `/api/auth/session` | GET | Session | Return current session state | §5.1 |
| `/api/auth/signup` | POST | None | Create account (email/password) | §5.2 |
| `/api/auth/signin` | POST | None | Sign in (email/password OR magic link OR OAuth start) | §5.3 |
| `/api/auth/signout` | POST | Session | Invalidate session | §5.7 |
| `/api/auth/password/reset-request` | POST | None | Request reset email | §5.4 |
| `/api/auth/password/reset-confirm` | POST | Reset token | Set new password | §5.4 |
| `/api/auth/verify` | GET | Verify token | Confirm email | §5.5 |
| `/api/auth/google/callback` | GET | Google state | OAuth callback | §5.6 |
| `/api/workspaces` | POST | Session | Create workspace | §5.8 |
| `/api/workspaces/:id/switch` | POST | Session, member | Switch active workspace | §5.8 |
| `/api/workspaces/invites/accept` | POST | Invite token | (reserved — Phase 3) | §5.9 |
| `/api/companies` | GET, POST | Session, ws | List / create | §6.1 |
| `/api/companies/:id` | GET, PATCH, DELETE | Session, ws | Read / update / archive | §6.1 |
| `/api/companies/:id/suggestions/resolve` | POST | Session, ws | Resolve suggestion | §6.1 |
| `/api/companies/merge` | POST | Session, ws, owner | Merge two companies | §6.1 |
| `/api/contacts` | GET, POST | Session, ws | List / create | §6.2 |
| `/api/contacts/:id` | GET, PATCH, DELETE | Session, ws | Read / update / archive | §6.2 |
| `/api/contacts/import` | POST | Session, ws | Start CSV import | §6.2 |
| `/api/contacts/:id/timeline` | GET | Session, ws | Activity timeline | §6.2 |
| `/api/leads` | GET, POST | Session, ws | List / create | §6.3 |
| `/api/leads/:id/rescore` | POST | Session, ws | Trigger rescoring | §6.3 |
| `/api/leads/:id/disqualify` | POST | Session, ws | Disqualify | §6.3 |
| `/api/queue` | GET | Session, ws | Outreach Queue | §6.3 |
| `/api/deals` | GET, POST | Session, ws | List / create | §6.4 |
| `/api/deals/:id` | GET, PATCH, DELETE | Session, ws | Read / update / archive | §6.4 |
| `/api/deals/:id/stage` | POST | Session, ws | Move stage | §6.4 |
| `/api/deals/:id/won` | POST | Session, ws | Mark won | §6.4 |
| `/api/deals/:id/lost` | POST | Session, ws | Mark lost | §6.4 |
| `/api/proposals` | POST | Session, ws | Generate draft | §6.4 |
| `/api/proposals/:id` | GET, PATCH | Session, ws | Read / update | §6.4 |
| `/api/proposals/:id/send` | POST | Session, ws | Snapshot + send | §6.4 |
| `/api/proposals/:id/mark-signed` | POST | Session, ws | Manual mark | §6.4 |
| `/api/exports/proposal-pdf/:id` | GET | Session, ws | 302 → signed URL | §6.4 |
| `/api/meetings` | GET, POST | Session, ws | List / log | §6.5 |
| `/api/meetings/:id` | GET, PATCH | Session, ws | Read / update | §6.5 |
| `/api/meetings/:id/complete` | POST | Session, ws | Mark complete + AI summary | §6.5 |
| `/api/booking-links` | GET, POST | Session, ws | List / create | §6.5 |
| `/api/booking-links/:id` | GET, PATCH, DELETE | Session, ws | Read / update / archive | §6.5 |
| `/api/pipelines` | GET, POST | Session, ws | List / create | §6.6 |
| `/api/pipelines/:id` | GET, PATCH | Session, ws | Read / update | §6.6 |
| `/api/audits` | GET, POST | Session, ws | List / request | §6.7 (also §7.2) |
| `/api/audits/:id` | GET | Session, ws | Full audit | §6.7 |
| `/api/audits/:id/deltas` | GET | Session, ws | Delta list | §6.7 |
| `/api/audits/:id/loom` | POST | Session, ws | Generate Loom script | §6.7 (also §7.7) |
| `/api/outreach` | GET | Session, ws | Outreach history | §6.8 |
| `/api/outreach/:id` | GET, PATCH | Session, ws | Read / update draft | §6.8 |
| `/api/outreach/:id/send` | POST | Session, ws | Send via Gmail | §6.8 |
| `/api/outreach/:id/mark-sent` | POST | Session, ws | Manual mark (DM path) | §6.8 |
| `/api/outreach/:id/discard` | POST | Session, ws | Discard draft | §6.8 |
| `/api/kb` | GET, POST | Session, ws | List / create doc | §6.9 |
| `/api/kb/:id` | GET, PATCH, DELETE | Session, ws | Read / update / archive | §6.9 |
| `/api/kb/:id/reindex` | POST | Session, ws | Force reindex | §6.9 |
| `/api/offers` | GET, POST | Session, ws | List / create | §6.10 |
| `/api/offers/:id` | GET, PATCH, DELETE | Session, ws, owner | Read / update / retire | §6.10 |
| `/api/icps` | GET, POST | Session, ws | List / create | §6.11 |
| `/api/icps/:id` | GET, PATCH, DELETE | Session, ws, owner | Read / update / archive | §6.11 |
| `/api/reminders` | GET, POST | Session, ws | List / create | §6.12 |
| `/api/reminders/:id/complete` | POST | Session, ws | Complete | §6.12 |
| `/api/reminders/:id/snooze` | POST | Session, ws | Snooze | §6.12 |
| `/api/dashboard/snapshot` | GET | Session, ws | Dashboard data | §6.13 |
| `/api/dashboard/export.csv` | GET | Session, ws | CSV export | §6.13 |
| `/api/search` | GET | Session, ws | Command palette search | §6.14 |
| `/api/notifications` | GET | Session, ws | List | §6.15 |
| `/api/notifications/:id/read` | POST | Session, ws | Mark read | §6.15 |
| `/api/settings/*` | GET, PATCH | Session, ws | Settings surfaces | §6.16 |
| `/api/settings/prompt-library` | GET | Session, ws | Read-only viewer | §6.16 |
| `/api/ai/score-lead` | POST | Session, ws | Sync scoring | §7.1 |
| `/api/ai/audit-website` | POST | Session, ws | Kick off audit | §7.2 |
| `/api/ai/stream/draft-outreach-:channel` | GET (SSE) | Session, ws | Stream draft | §7.4 |
| `/api/ai/stream/draft-proposal` | GET (SSE) | Session, ws | Stream proposal | §7.5 |
| `/api/ai/stream/regenerate-proposal-section` | GET (SSE) | Session, ws | Stream section | §7.5 |
| `/api/ai/classify-reply` | POST | Session, ws | Reply classify | §7.6 |
| `/api/ai/summarize-thread` | POST | Session, ws | Thread summary | §7.6 |
| `/api/ai/summarize-meeting` | POST | Session, ws | Meeting summary | §7.6 |
| `/api/ai/recommend-offer` | POST | Session, ws | Offer suggestion | §7.7 |
| `/api/ai/generate-loom-script` | POST | Session, ws | Loom script | §7.7 |
| `/api/ai/memory/retrieve` | POST | Session, ws | Memory query (internal) | §7.8 |
| `/api/webhooks/gmail` | POST | HMAC | Push notification | §8.1 |
| `/api/webhooks/google-calendar` | POST | HMAC | Sync channel | §8.2 |
| `/api/webhooks/resend` | POST | HMAC | Delivery events | §8.3 |
| `/api/webhooks/browserless` | POST | HMAC | Session events | §8.4 |
| `/api/webhooks/stripe` | POST | Signature | (Phase 2 reserved) | §8.5 |
| `/api/webhooks/esign` | POST | Signature | (Phase 2 reserved) | §8.6 |
| `/book/:workspaceSlug/:linkSlug` | GET | None | Public booking page | §6.5 |
| `/book/:workspaceSlug/:linkSlug/availability` | GET | None | Free/busy read | §6.5 |
| `/book/:workspaceSlug/:linkSlug/book` | POST | None (rate-limited by IP) | Create booking | §6.5 |
| `/api/health` | GET | None | Health probe | §13 |
| `/api/ready` | GET | None | Readiness probe | §13 |

---

## 5. Authentication APIs

### 5.1 `GET /api/auth/session`

- **Purpose:** return current session state; used by shell to determine sign-in state without a full render.
- **Auth:** session cookie optional
- **Request:** none
- **Response 200:**
  ```json
  {
    "data": {
      "authenticated": true,
      "user": { "id": "uuid", "email": "founder@example.com", "displayName": "Ved" },
      "activeWorkspace": { "id": "uuid", "slug": "verocrest", "role": "owner" },
      "workspaces": [ { "id": "uuid", "slug": "verocrest", "role": "owner" } ]
    },
    "error": null,
    "requestId": "01H..."
  }
  ```
- **Response 200 (unauthenticated):** `{ "data": { "authenticated": false }, "error": null, ... }`
- **Validation:** none
- **Errors:** `INTERNAL` only
- **Rate limit:** 60 rpm per IP
- **Dependencies:** Supabase Auth

### 5.2 `POST /api/auth/signup`

- **Purpose:** Create new account with email + password. Triggers verification email.
- **Auth:** none
- **Request:** `{ email, password, displayName?, marketingOptIn? }`
- **Response 201:** `{ data: { userId, verificationRequired: true }, error: null, requestId }`
- **Validation:** `email` valid, `password` ≥ 12 chars with breach-check per NFR-SEC-009
- **Errors:**
  - `AUTH_EMAIL_EXISTS` (F-ONB-001) → 409
  - `AUTH_PASSWORD_WEAK` → 422
  - `AUTH_PASSWORD_BREACHED` → 422
  - `RATE_LIMITED` → 429
- **Rate limit:** 5 rpm per IP + 20/day per IP
- **Dependencies:** Supabase Auth, Resend (verification email via our template), HIBP (breach check)

### 5.3 `POST /api/auth/signin`

- **Purpose:** initiate sign-in. Three modes: password, magic link, OAuth (Google → returns redirect URL).
- **Auth:** none
- **Request (password mode):** `{ mode: "password", email, password }`
- **Request (magic link):** `{ mode: "magic_link", email }`
- **Request (OAuth start):** `{ mode: "google" }`
- **Response 200 (password):** sets session cookie; body `{ data: { user, activeWorkspaceId | null } }` — `null` when user has no workspace yet
- **Response 200 (magic link):** `{ data: { emailSent: true } }`
- **Response 200 (OAuth):** `{ data: { redirectUrl } }` — client navigates
- **Validation:** per mode
- **Errors:**
  - `AUTH_INVALID_CREDENTIALS` → 401
  - `AUTH_EMAIL_UNVERIFIED` → 403 (F-ONB-003 path)
  - `RATE_LIMITED` → 429
- **Rate limit:** 10 rpm per IP + 30/hour per email
- **Dependencies:** Supabase Auth, Resend (magic link)

### 5.4 Password reset — implicit Supabase flow with our template

Password reset is not a new feature; it is the standard flow implicit in FR-IDT-001 (email + password auth) and referenced in `05` §14 F-ONB-001 as a recovery. Supabase Auth ships the token generation and expiry; Resend delivers the message using our template.

#### 5.4.1 `POST /api/auth/password/reset-request`

- **Purpose:** email a reset link.
- **Auth:** none
- **Request:** `{ email }`
- **Response 200 (always):** `{ data: { sent: true } }` — do not disclose whether the email exists
- **Validation:** `email` valid
- **Errors:** `RATE_LIMITED` → 429; other errors are silent (return success to avoid enumeration)
- **Rate limit:** 5 rpm per IP + 5/day per email address (silent throttle)
- **Dependencies:** Supabase Auth (`resetPasswordForEmail`), Resend

#### 5.4.2 `POST /api/auth/password/reset-confirm`

- **Purpose:** set new password using the reset token.
- **Auth:** reset token (query param `token`)
- **Request:** `{ token, newPassword }`
- **Response 200:** `{ data: { updated: true } }` — establishes a new session
- **Validation:** `newPassword` ≥ 12 chars with breach-check
- **Errors:** `AUTH_RESET_TOKEN_INVALID` → 401; `AUTH_RESET_TOKEN_EXPIRED` → 401; `AUTH_PASSWORD_WEAK` → 422
- **Rate limit:** 5 rpm per IP
- **Dependencies:** Supabase Auth

### 5.5 `GET /api/auth/verify?token=...`

- **Purpose:** email verification landing.
- **Auth:** verify token in query
- **Response:** 302 redirect to `/onboarding` (verified) or `/signin?verified=1` (verified but no active session)
- **Errors:** `AUTH_VERIFY_TOKEN_INVALID` → 302 to `/signin?error=verify_failed`
- **Rate limit:** 30 rpm per IP
- **Dependencies:** Supabase Auth

### 5.6 `GET /api/auth/google/callback`

- **Purpose:** OAuth callback receiver.
- **Auth:** none (Google-signed `state` verified server-side against session cookie)
- **Behavior:** Supabase Auth handles the code exchange; we then:
  - If user has no workspace → 302 `/onboarding/create-workspace`
  - Else → 302 `/`
- **Errors:** `AUTH_OAUTH_DENIED` (F-ONB-002 / F-INT-001) → 302 `/signin?error=oauth_denied`
- **Rate limit:** 30 rpm per IP
- **Dependencies:** Supabase Auth, Google OAuth

### 5.7 `POST /api/auth/signout`

- **Purpose:** invalidate session server-side + clear cookies.
- **Auth:** session cookie
- **Request:** none
- **Response 200:** `{ data: { signedOut: true } }`
- **Validation:** none
- **Errors:** `INTERNAL` only
- **Rate limit:** 60 rpm per user
- **Dependencies:** Supabase Auth

### 5.8 Workspace creation + switching

#### 5.8.1 `POST /api/workspaces`

- **Purpose:** create workspace (first workspace after signup, or an owner creates additional).
- **Auth:** session
- **Request:** `{ name, slug, timezone, defaultCurrency, niche?: "dental" | "coaches" | "other" }`
- **Response 201:**
  ```json
  {
    "data": {
      "workspaceId": "uuid",
      "slug": "verocrest",
      "seededIcp": { "id": "uuid", "name": "Dental Clinics – Primary" } | null
    },
    ...
  }
  ```
- **Validation:** slug unique (case-insensitive), timezone IANA, currency ISO 4217, niche in enum
- **Errors:** `WORKSPACE_SLUG_TAKEN` (F-ONB-004) → 409 with suggested alternates
- **Rate limit:** 10/day per user
- **Dependencies:** Postgres; emits `workspace.created` per `03` §8.3

#### 5.8.2 `POST /api/workspaces/:id/switch`

- **Purpose:** change active workspace on the session cookie.
- **Auth:** session; user must be a `workspace_members` row for `:id`
- **Response 200:** `{ data: { activeWorkspace: { id, slug, role } } }`
- **Errors:** `WORKSPACE_NOT_MEMBER` → 403
- **Rate limit:** 60 rpm per user

### 5.9 `POST /api/workspaces/invites/accept` (Phase 3 reserved — not active in v0.1)

- **Purpose:** accept a workspace invite. Reserved endpoint shape so Phase 3 lands cleanly on the existing `workspace_invites` table (`04` §3.3).
- **Auth:** invite token
- **Status in v0.1:** endpoint exists and returns `501 Not Implemented` with body `{ error: { code: "FEATURE_NOT_AVAILABLE_V0_1", ... } }`
- **Rationale for reserving:** `04` §3.3 documented the table; keeping the URL shape stable prevents route reshuffles in Phase 3.
- **Rate limit:** 10 rpm per IP

---

## 6. CRM APIs

Payload shapes are indicative — the source of truth is the Zod schemas per module. Fields not shown but present in `04` are omitted for brevity.

### 6.1 Companies

#### 6.1.1 `GET /api/companies`

- **Purpose:** list companies with filters + pagination.
- **Auth:** session, ws
- **Query params:** `search`, `industry`, `size` (one or many), `tag` (one or many), `isClient`, `ownerUserId`, `cursor`, `pageSize` (default 50, max 200), `sort` (`created_at:desc` default; also `name:asc`, `updated_at:desc`)
- **Response 200:**
  ```json
  {
    "data": {
      "items": [ { "id", "name", "domain", "industry", "size", "isClient", "createdAt" } ],
      "nextCursor": "eyJ..." | null,
      "totalEstimate": 512
    }
  }
  ```
- **Cursor pagination:** opaque cursor over `(created_at, id)` for stable ordering
- **Errors:** `VALIDATION_ERROR` → 422
- **Rate limit:** 120 rpm per user

#### 6.1.2 `POST /api/companies`

- **Purpose:** create company.
- **Auth:** session, ws
- **Idempotency:** optional
- **Request:** `{ name, domain?, industry?, size?, location?, description?, tags?, customFields?, isClient?, sourceBatchId? }`
- **Response 201:** `{ data: { id, ... } }`
- **Validation:** `name` required; `domain` valid host if present; dedupe check on `(workspace_id, domain_normalized)` — returns `COMPANY_DOMAIN_TAKEN` with the existing id
- **Errors:** `COMPANY_DOMAIN_TAKEN` → 409; `VALIDATION_ERROR` → 422
- **Rate limit:** 60 rpm per user

#### 6.1.3 `GET /api/companies/:id`

- **Purpose:** company detail (includes contacts count, deals count, latest audit summary).
- **Auth:** session, ws (RLS)
- **Response 200:** `{ data: { ...company, counts: { contacts, deals, audits }, latestAudit } }`
- **Errors:** `NOT_FOUND` → 404

#### 6.1.4 `PATCH /api/companies/:id`

- **Purpose:** update fields.
- **Auth:** session, ws
- **Idempotency:** optional
- **Request:** partial company fields
- **Response 200:** `{ data: company }`
- **Errors:** `NOT_FOUND` → 404; `VALIDATION_ERROR` → 422

#### 6.1.5 `DELETE /api/companies/:id`

- **Purpose:** soft delete (per `04` §1.8).
- **Auth:** session, ws
- **Response 200:** `{ data: { deleted: true } }`
- **Behavior:** sets `deleted_at`; associated contacts remain (their `company_id` stays but `company_name` cache is preserved as text fallback)

#### 6.1.6 `POST /api/companies/:id/suggestions/resolve`

- **Purpose:** Company Suggestions review — accept, reject, or merge a candidate match (per `06` §3.10).
- **Auth:** session, ws
- **Request:** `{ candidateCompanyId, action: "accept" | "reject" | "merge_into", mergeTargetId? }`
- **Response 200:** `{ data: { resolvedContacts: number } }`
- **Errors:** `VALIDATION_ERROR` → 422

#### 6.1.7 `POST /api/companies/merge`

- **Purpose:** merge two companies (owner-only).
- **Auth:** session, ws, owner
- **Idempotency:** required
- **Request:** `{ sourceCompanyId, targetCompanyId }`
- **Response 200:** `{ data: { targetCompanyId, movedContacts, movedDeals, movedAudits } }`
- **Errors:** `COMPANY_MERGE_CONFLICT` → 409 (source and target both have current deals in different stages that need owner review); `NOT_FOUND` → 404

### 6.2 Contacts

#### 6.2.1 `GET /api/contacts`

- **Query params:** `search`, `companyId`, `isLead` (true/false), `readiness` (`cold | warming | ready | avoid`), `owner`, `tag`, `source`, `cursor`, `pageSize`, `sort`
- **Response:** same shape as Companies list
- **Rate limit:** 120 rpm per user

#### 6.2.2 `POST /api/contacts`

- **Idempotency:** optional
- **Request:** `{ firstName, lastName, primaryEmail?, phones?, companyId? | companyName?, roleTitle?, source?, tags?, customFields? }`
- **Response 201:** `{ data: contact }`
- **Behavior:**
  - Dedupe on `(workspace_id, primary_email_normalized)`; returns `CONTACT_EMAIL_TAKEN` with existing id + a `merge` hint
  - If `companyId` provided → link; else if `companyName` provided → best-effort async resolution via `contact.linked_to_company` event
- **Errors:** `CONTACT_EMAIL_TAKEN` → 409; `VALIDATION_ERROR` → 422

#### 6.2.3 `GET /api/contacts/:id`

- **Response:** `{ data: { ...contact, relationshipProfile, latestLeadScore, activeReminders } }`
- **Errors:** `NOT_FOUND` → 404

#### 6.2.4 `PATCH /api/contacts/:id`

- Standard patch semantics.

#### 6.2.5 `DELETE /api/contacts/:id`

- Soft delete. Activity timeline entries preserved (per `05` §11.3 rules).

#### 6.2.6 `POST /api/contacts/import`

- **Purpose:** start CSV import (per `05` §3.7 3-step wizard's step-3 commit).
- **Auth:** session, ws
- **Idempotency:** required (per-batch)
- **Request:** `{ fileStoragePath, columnMap: { csvColumn -> targetField }, dryRun: false, tagAll?, sourceLabel? }`
- **Response 202 (accepted async):**
  ```json
  {
    "data": {
      "ingestBatchId": "uuid",
      "status": "running",
      "estimatedRows": 200,
      "pollUrl": "/api/contacts/import/:batchId"
    }
  }
  ```
- **Errors:** `CSV_MALFORMED` (F-CSV-001) → 422; `CSV_TOO_LARGE` (F-CSV-002) → 413; `VALIDATION_ERROR` → 422
- **Rate limit:** 5 concurrent per workspace
- **Async:** Inngest processes rows; each success emits `lead.ingested`

#### 6.2.7 `GET /api/contacts/import/:batchId`

- **Purpose:** poll import batch status.
- **Response:** `{ data: { status, rowCount, successCount, errorCount, errors: [...] } }`

#### 6.2.8 `GET /api/contacts/:id/timeline`

- **Query params:** `cursor`, `pageSize`, `types` (comma-separated activity_type_enum values)
- **Response:** paginated timeline events

### 6.3 Leads + Queue

#### 6.3.1 `GET /api/leads`

- **Query params:** `status`, `owner`, `minScore`, `icpId`, `companyId`, `cursor`, `pageSize`
- **Note:** in v0.1 lead views are surfaced primarily via `/contacts` filters (per `06` §3.10); this endpoint exists for programmatic access and command palette

#### 6.3.2 `POST /api/leads`

- **Purpose:** create a lead row for an existing contact (advancing a contact to lead status).
- **Request:** `{ contactId, source?, ownerUserId? }`
- **Response 201:** `{ data: { leadId, status: "new" } }`
- **Behavior:** emits `lead.ingested`
- **Errors:** `LEAD_EXISTS_FOR_CONTACT` → 409

#### 6.3.3 `POST /api/leads/:id/rescore`

- **Purpose:** force rescoring.
- **Idempotency:** optional
- **Response 202:** `{ data: { status: "queued" } }`
- **Async:** LIE scoring pipeline emits `lead.scored` when done

#### 6.3.4 `POST /api/leads/:id/disqualify`

- **Request:** `{ reason }`
- **Response 200:** `{ data: lead }`
- **Errors:** `VALIDATION_ERROR` → 422

#### 6.3.5 `GET /api/queue`

- **Purpose:** Outreach Queue (materialized) — powers `/queue` route and Dashboard `Today's Gold Leads` widget.
- **Query params:** `channel`, `owner`, `minScore` (default 80 for Gold Leads), `cursor`, `pageSize`
- **Response:**
  ```json
  {
    "data": {
      "items": [
        {
          "leadId", "contactId", "companyId?",
          "opportunityScore", "nextBestAction",
          "recommendedOfferId?",
          "reasoning": { "topSignals": [...] },
          "expiresAt"
        }
      ],
      "nextCursor": "..."
    }
  }
  ```
- **Sort:** priority_rank ASC (materialized order per `04` §8.1)

### 6.4 Deals + Proposals

#### 6.4.1 `GET /api/deals`

- **Query params:** `pipelineId?`, `stage`, `owner`, `companyId`, `minValue`, `expectedCloseFrom`, `expectedCloseTo`, `cursor`, `pageSize`

#### 6.4.2 `POST /api/deals`

- **Purpose:** create deal (auto-created on lead reaching `meeting_booked` per `05` §11.1, or manually).
- **Request:** `{ name, pipelineId?, primaryContactId?, companyId?, ownerUserId?, value?, currency?, offerId?, sourceContext? }`
- **Response 201:** `{ data: deal }`
- **Behavior:** if `offerId` present, snapshot `offer_version` from current `offers` row

#### 6.4.3 `POST /api/deals/:id/stage`

- **Request:** `{ toStageKey }`
- **Response 200:** `{ data: deal }`
- **Behavior:** emits `deal.stage.changed`; runs stage automations per FR-PIPE-006

#### 6.4.4 `POST /api/deals/:id/won`

- **Idempotency:** required
- **Request:** `{ closeValue, currency, wonReason? }`
- **Response 200:** `{ data: deal }`
- **Behavior:**
  - Flips `companies.is_client = true`, primary contact `is_client = true`
  - Emits `deal.won`

#### 6.4.5 `POST /api/deals/:id/lost`

- **Idempotency:** required
- **Request:** `{ reason }`
- **Response 200:** `{ data: deal }`
- **Behavior:** emits `deal.lost`

#### 6.4.6 `POST /api/proposals`

- **Purpose:** initiate proposal draft (kicks off `draft-proposal` capability streaming).
- **Auth:** session, ws
- **Request:** `{ dealId, offerId, discoveryNotes?, includeAuditSummary?, toneOverride? }`
- **Response 201:**
  ```json
  {
    "data": {
      "proposalId": "uuid",
      "streamUrl": "/api/ai/stream/draft-proposal?proposalId=..."
    }
  }
  ```
- **Errors:** `PROPOSAL_MISSING_OFFER` (F-PROP-004) → 422

#### 6.4.7 `PATCH /api/proposals/:id`

- **Request:** `{ title?, content? (tiptap JSON), value?, currency? }`
- **Response 200:** `{ data: proposal }`
- **Behavior:** autosave-friendly; may be called every few seconds during editing

#### 6.4.8 `POST /api/proposals/:id/send`

- **Idempotency:** required
- **Response 200:** `{ data: { proposal, pdfUrl: "/api/exports/proposal-pdf/:id" } }`
- **Behavior:**
  - Snapshots `offer_snapshot` at click time from current `offers` row
  - Advances `proposals.status` to `sent`
  - Advances deal stage per pipeline config
  - Emits `proposal.sent`, `deal.stage.changed`

#### 6.4.9 `POST /api/proposals/:id/mark-signed`

- **Idempotency:** required
- **Response 200:** `{ data: proposal }`
- **Behavior:** manual mark (v0.1 e-sign is external per `06` §6.4). Emits `proposal.signed`.

#### 6.4.10 `GET /api/exports/proposal-pdf/:id`

- **Auth:** session, ws
- **Response:** `302` redirect to signed Supabase Storage URL (TTL 1h)
- **Errors:** `PROPOSAL_PDF_UNAVAILABLE` → 404 (PDF generation still in progress); poll with backoff

### 6.5 Meetings + Booking Links

#### 6.5.1 `GET /api/meetings`

- **Query params:** `from`, `to`, `status`, `owner`, `dealId`, `contactId`
- **Response:** list

#### 6.5.2 `POST /api/meetings`

- **Purpose:** log meeting manually.
- **Idempotency:** optional
- **Request:** `{ title, scheduledAt, durationMinutes?, contactId?, dealId?, notes?, provider?: "manual" | "google_calendar" }`
- **Response 201:** `{ data: meeting }`

#### 6.5.3 `POST /api/meetings/:id/complete`

- **Request:** `{ notes? }`
- **Response 200:** `{ data: { meeting, aiSummaryStreamUrl?: "/api/ai/summarize-meeting?meetingId=..." } }`
- **Behavior:** if `notes` provided, `aiSummaryStreamUrl` returned; UI can invoke to populate `meetings.ai_summary`
- **Events:** `meeting.completed`

#### 6.5.4 `POST /api/booking-links`

- **Request:** `{ slug, title, durationMinutes, bufferMinutes?, availability: {...} }`
- **Response 201:** `{ data: link }`
- **Errors:** `BOOKING_SLUG_TAKEN` → 409

#### 6.5.5 Public booking (unauthenticated)

- `GET /book/:workspaceSlug/:linkSlug` — server-rendered HTML page (workspace-branded)
- `GET /book/:workspaceSlug/:linkSlug/availability?month=YYYY-MM` — read free/busy from Google Calendar; returns available slots
- `POST /book/:workspaceSlug/:linkSlug/book` — create meeting
  - **Rate limit:** 20 rpm per IP + CAPTCHA if abuse pattern detected (Phase 2)
  - **Request:** `{ scheduledAt, name, email, phone?, note?, utm? }`
  - **Response 201:** `{ data: { meetingId, confirmationSent: true } }`
  - **Errors:**
    - `SLOT_TAKEN` (F-CAL-002) → 409
    - `CALENDAR_DISCONNECTED` (F-CAL-001) → 503
    - `RATE_LIMITED` → 429
  - **Events:** `meeting.booked`

### 6.6 Pipelines

Standard CRUD on `pipelines` table. Owner-only for structural writes.

### 6.7 Audits

#### 6.7.1 `GET /api/audits`

- **Query params:** `status`, `companyId`, `leadId`, `dealId`, `since`

#### 6.7.2 `POST /api/audits`

- **Purpose:** request an audit (also invocable directly per §7.2).
- **Idempotency:** required
- **Request:** `{ url, attachTo?: { type: "contact" | "lead" | "company" | "deal", id: string }, auditConfig? }`
- **Response 202:** `{ data: { auditId, status: "pending" } }`
- **Async:** Inngest audit orchestrator processes → emits `website.audit.completed`

#### 6.7.3 `GET /api/audits/:id`

- **Response:** `{ data: { audit, findings, deltaSummary? } }`

#### 6.7.4 `GET /api/audits/:id/deltas`

- **Response:** delta list vs prior audits for the same URL

#### 6.7.5 `POST /api/audits/:id/loom`

- **Purpose:** generate a Loom script for the audit.
- **Request:** `{ toneVariant?, ctaVariant?, contactId?, companyId? }`
- **Response 201:** `{ data: { loomScriptId, script, wordCount } }`
- **Behavior:** invokes AI capability `generate-loom-script` (§7.7)

### 6.8 Outreach

#### 6.8.1 `GET /api/outreach`

- **Query params:** `contactId`, `companyId`, `leadId`, `dealId`, `channel`, `status`, `sentiment`, `from`, `to`, `cursor`, `pageSize`

#### 6.8.2 `PATCH /api/outreach/:id`

- **Purpose:** edit a `draft` outreach message before send.
- **Request:** `{ subject?, body?, tone? }`
- **Response 200:** `{ data: message }`
- **Behavior:** allowed only when `status = 'draft'`

#### 6.8.3 `POST /api/outreach/:id/send`

- **Purpose:** send via Gmail integration (email channel only).
- **Idempotency:** required
- **Response 200:** `{ data: { messageId, providerMessageId, sentAt } }`
- **Errors:**
  - `GMAIL_DISCONNECTED` (F-SEND-001) → 424
  - `GMAIL_RATE_LIMITED` (F-SEND-002) → 429 (transient; auto-retry)
  - `RECIPIENT_INVALID` (F-SEND-003) → 422
  - `CONTACT_UNSUBSCRIBED` (F-SEND-004) → 403
- **Events:** `outreach.sent`, then auto-created reminder emits `reminder.created`

#### 6.8.4 `POST /api/outreach/:id/mark-sent`

- **Purpose:** for IG/LinkedIn DM copy-paste flow.
- **Idempotency:** required
- **Response 200:** `{ data: message }`
- **Events:** `outreach.sent` (no `providerMessageId`)

#### 6.8.5 `POST /api/outreach/:id/discard`

- **Response 200:** `{ data: { discarded: true } }`
- **Behavior:** soft-deletes the draft; retained for prompt evaluation

### 6.9 Knowledge Base

Standard CRUD on `knowledge_documents`. Special:

- `POST /api/kb/:id/reindex` — force re-embed (idempotent by content hash — no-op if unchanged)

### 6.10 Offers

Standard CRUD on `offers`. Special:

- Owner-only for delete/retire
- Save-and-activate transitions status to `active` and emits `offer.upserted` for indexing

### 6.11 ICPs

Standard CRUD on `icps`. Special:

- Owner-only for delete
- Save-and-activate emits `icp.upserted`

### 6.12 Reminders

- `POST /api/reminders` → `{ entityType, entityId, note, dueAt, ownerUserId? }`
- `POST /api/reminders/:id/complete`
- `POST /api/reminders/:id/snooze` → `{ snoozedUntil }`

### 6.13 Dashboard

#### 6.13.1 `GET /api/dashboard/snapshot`

- **Purpose:** compute all six widgets in one call for a snapshot render.
- **Query params:** `from`, `to`, `ownerUserId?`, `currency?`
- **Response:** matches `getDashboardSnapshot` return in `06` §7.9
- **Cache:** private, `Cache-Control: max-age=15` — realtime deltas via Supabase subscription
- **Rate limit:** 60 rpm per user

#### 6.13.2 `GET /api/dashboard/export.csv`

- **Query params:** `section`, `from`, `to`, `ownerUserId?`
- **Response:** `text/csv` streamed

### 6.14 Search

#### 6.14.1 `GET /api/search`

- **Purpose:** powers Command Palette (`07` §4).
- **Query params:** `q` (required), `types` (comma-separated: `contact,company,deal,kb,offer,icp,audit,meeting`), `limit` (default 20)
- **Response:**
  ```json
  {
    "data": {
      "results": [
        { "type": "contact", "id": "uuid", "primaryLabel": "Sarah Chen", "secondaryLabel": "clinic.com", "badge": "score:82" }
      ]
    }
  }
  ```
- **Sort:** relevance × recency × queue-priority (per `07` §4.4)
- **Rate limit:** 240 rpm per user

### 6.15 Notifications

- `GET /api/notifications` — `{ status: "unread" | "all", cursor, pageSize }`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/mark-all-read`

### 6.16 Settings

Categorized reads + patches under `/api/settings/*`. Owner-only writes for workspace-scoped settings. Read-only for prompt library:

#### 6.16.1 `GET /api/settings/prompt-library`

- **Response:**
  ```json
  {
    "data": {
      "capabilities": [
        {
          "capability": "draft-outreach-email",
          "activePrompt": { "id", "version", "source": "workspace|global|code" },
          "modelHint": "anthropic:claude-sonnet-5"
        }
      ]
    }
  }
  ```

#### 6.16.2 `GET /api/settings/prompt-library/:capability`

- **Response:** full resolution chain per capability (workspace override → global default → code baseline) including template, system message, expected schema — read-only per `07` §8

---

## 7. AI APIs

All AI APIs are thin adapters over the Model Router (`09` §2). Feature code / UI never touches provider SDKs directly. Every AI response includes the metadata envelope from `09` §2.2.

### 7.1 `POST /api/ai/score-lead`

- **Purpose:** synchronously compute lead score (usually the LIE scoring pipeline calls this internally via the Service Layer, but this endpoint is exposed for the `POST /api/leads/:id/rescore` path and admin tooling).
- **Auth:** session, ws
- **Idempotency:** optional
- **Request:** `{ leadId }`
- **Response 200:** `{ data: { leadScore, aiMetadata } }`
- **Errors:** per §10 AI category
- **Rate limit:** subject to workspace AI budget

### 7.2 `POST /api/ai/audit-website`

- **Purpose:** kick off audit; alias of `POST /api/audits` (same handler).
- **Response 202:** `{ data: { auditId, status: "pending" } }`
- **Async:** processing per `05` §7

### 7.3 Prompt resolution

Prompts are resolved server-side inside the Router (`09` §3.4). **No public endpoint** returns a resolved prompt to the client — this is a defense-in-depth against prompt exfiltration. The read-only Prompt Library viewer (§6.16.2) surfaces template metadata, not the fully assembled prompt.

### 7.4 `GET /api/ai/stream/draft-outreach-:channel` (SSE)

- **Channels:** `email`, `ig-dm`, `linkedin-dm`
- **Purpose:** stream personalized outreach draft.
- **Auth:** session, ws
- **Query params:** `leadId`, `tone`, `offerId?`, `includeAuditSummary?`, `includeLoomScriptId?`, `regenerateOf?`
- **Response:** `Content-Type: text/event-stream`

**SSE frames:**

```
event: start
data: { "requestId": "01H...", "outreachMessageId": "uuid" }

event: token
data: { "delta": "Hi Sarah," }

event: token
data: { "delta": " I noticed" }

...

event: complete
data: {
  "outreachMessageId": "uuid",
  "aiMetadata": {
    "provider": "anthropic",
    "model": "claude-sonnet-5",
    "promptId": "draft-outreach-email-v3",
    "promptVersion": 3,
    "memoryHits": [ ... ],
    "confidence": "high",
    "costUsd": 0.0182,
    "latencyMs": 4213
  }
}

event: error
data: { "code": "AI_PROVIDER_UNAVAILABLE", "message": "Try again in 60s" }
```

- **Cancellation:** client closes EventSource → server aborts provider call
- **Timeout budget:** capability-specific per `09` §11.1

### 7.5 Proposal streaming

- `GET /api/ai/stream/draft-proposal?proposalId=...` — full proposal streaming, section-by-section
- `GET /api/ai/stream/regenerate-proposal-section?proposalId=...&sectionKey=...` — single section

Frames analogous to §7.4, with `section` field on `token` frames identifying which section the delta belongs to.

### 7.6 Non-streaming AI

- `POST /api/ai/classify-reply` — request `{ outreachMessageId, replyBody, threadContext? }` → `{ sentiment, intent, aiMetadata }`
- `POST /api/ai/summarize-thread` — request `{ contactId, since? }` → `{ summary, aiMetadata }`
- `POST /api/ai/summarize-meeting` — request `{ meetingId, notes }` → `{ summary, aiMetadata }`

Idempotency optional; all subject to budget gating (`09` §6).

### 7.7 Recommendations + scripts

- `POST /api/ai/recommend-offer` — request `{ leadId, k?: number }` → `{ recommendations: [ { offerId, confidence, reasoning } ], aiMetadata }`
- `POST /api/ai/generate-loom-script` — request `{ auditId, toneVariant?, ctaVariant?, contactId?, companyId? }` → `{ loomScriptId, script, wordCount, aiMetadata }`

### 7.8 `POST /api/ai/memory/retrieve` (internal only)

- **Purpose:** memory retrieval endpoint — **used only by the Router internally** (§09.4). Exposed as an internal callable so future services (Phase 3+ agents) can hit it uniformly. Not called from browser code.
- **Auth:** session, ws (service-role auth for internal calls)
- **Request:** `{ capability, scopes, subjectIds?, queryText?, topK?, minSimilarity? }`
- **Response:** `{ hits: MemoryHit[] }`
- **Rate limit:** none (internal); protected by service-role guard

---

## 8. External Webhooks

Every webhook receiver: HMAC-verified, replay-protected, idempotent, always returns `2xx` fast (< 200ms) and processes work asynchronously.

### 8.1 `POST /api/webhooks/gmail`

- **Verification:** Google Pub/Sub push validation via signed JWT in `Authorization` header
- **Purpose:** receive push notifications when Gmail messages change on watched mailboxes; per `05` §9
- **Payload:** `{ message: { data: <base64 JSON>, messageId, publishTime } }` — base64 decodes to `{ emailAddress, historyId }`
- **Behavior:**
  - Ack (200) immediately
  - Async: fetch history since last-known historyId → identify new inbound messages on threads we sent on → persist as `outreach_messages` (direction=inbound) → emit `outreach.reply.received`
- **Idempotency:** dedupe on `(workspace_id, provider_message_id)`
- **Retries:** Google retries up to 24h with backoff on non-2xx
- **Security:** JWT audience must match our configured Pub/Sub subscription; issuer must be Google
- **Failure handling:** F-REPLY-001 (invalid signature) → 401 + log
- **Rate limit:** none (Google-throttled upstream)

### 8.2 `POST /api/webhooks/google-calendar`

- **Verification:** channel token match + `X-Goog-Channel-ID` header
- **Purpose:** receive change notifications on watched calendars
- **Behavior:** ack fast; async sync free/busy state; if a new event corresponds to one of our `booking_links` slots that failed to sync, mark `meetings.status='scheduled'`
- **Idempotency:** dedupe on `X-Goog-Message-Number`
- **Retries:** Google's channel semantics
- **Security:** channel renewal every 7 days; expired channels rejected 410

### 8.3 `POST /api/webhooks/resend`

- **Verification:** Resend signing secret via `Svix-Signature` header
- **Purpose:** track transactional email delivery (bounce, complaint) for system emails (verification, reset, digests)
- **Behavior:** ack fast; async update `notifications.emitted_via` and, for bounces on user email, flag the user account
- **Idempotency:** dedupe on Svix message id
- **Retries:** Resend follows Svix retry ladder

### 8.4 `POST /api/webhooks/browserless`

- **Verification:** shared secret in `X-Browserless-Signature` header
- **Purpose:** session lifecycle events (session started, timed out, crashed) for pending audits
- **Behavior:** ack; async update `audits.browserless_session_id`, `status`, `error` fields
- **Idempotency:** dedupe on session id + event type
- **Retries:** vendor-configurable; we accept single-fire and reconcile via cron

### 8.5 `POST /api/webhooks/stripe` (Phase 2 reserved)

- **Status:** reserved endpoint shape; returns `501` in v0.1
- **Verification (Phase 2):** Stripe signature via `Stripe-Signature` header
- **Purpose (Phase 2):** payment events for FR-FIN-*
- **Reserved for shape stability, not new v0.1 functionality**

### 8.6 `POST /api/webhooks/esign` (Phase 2 reserved)

- **Status:** reserved (DocuSign / Adobe Sign)
- **Purpose (Phase 2):** update `proposals.status` to `signed` on vendor completion event
- Returns `501` in v0.1; UI mark-signed (§6.4.9) is the v0.1 path

### 8.7 Webhook lifecycle contract (all receivers)

- **Timeouts:** receivers ack within 2s or the provider retries. Business logic runs async via Inngest.
- **Retry protection:** we dedupe on provider message id or content hash for 7 days
- **Poison-pill queue:** repeated failures on a single message move it to `webhook_dead_letter` table (implementation detail; not a product surface) for manual review
- **Failure alerts:** `> 5%` webhook failure rate over 15 minutes → Sentry page

---

## 9. API Security

Layered defense. Each layer covers a different threat surface; no single layer is sufficient alone.

### 9.1 Authentication

Covered in §2.6. Session cookies httpOnly + Secure + SameSite=Lax. JWT verified server-side. No credential handling in client code.

### 9.2 Authorization

Two-layer per §2.7. Every mutation logs to `action_log` per `04` §15.

### 9.3 Rate limiting

Enforced at the Route Handler middleware. Token bucket per key, backed by an in-Postgres `rate_limit_buckets` table (small implementation-only table; no product surface). Bucket keys:

| Scope | Key | Limit | Refill |
|---|---|---|---|
| Per-IP global | `ip:<ip>` | 300 rpm | 5/s |
| Per-user global | `user:<user_id>` | 240 rpm | 4/s |
| Per-workspace global | `workspace:<workspace_id>` | 1200 rpm | 20/s |
| Auth signup | `signup:<ip>` | 5 rpm, 20/day | narrow bucket |
| Auth signin (password) | `signin_pw:<ip>` + `signin_pw:<email>` | 10 rpm per IP + 30/hr per email | narrow |
| Password reset request | `pw_reset:<ip>` + `pw_reset:<email>` | 5 rpm per IP + 5/day per email | narrow |
| Public booking | `book:<ip>` | 20 rpm | 1/3s |
| Search | `search:<user_id>` | 240 rpm | 4/s |
| AI capability | budget-gated (per `09` §6), no throughput limit | — | — |

Excess → `429 Too Many Requests` with `Retry-After` header + envelope `error.code = "RATE_LIMITED"`.

Escape hatch for internal system calls: `service-role` JWT bypasses per-user + per-workspace limits (used by Inngest functions).

### 9.4 Request validation

Every input validated at the boundary via Zod. Unknown fields **rejected** (`unknownKeysStrategy: "strict"`) — no silent field drop.

### 9.5 Input sanitization

- **HTML in rich text (proposals, KB docs):** tiptap sanitizes at parse; server re-sanitizes via DOMPurify-equivalent (server-side jsdom + rehype-sanitize) before persisting
- **URLs:** validated (protocol allow-list: `https:`, `http:`) and normalized
- **File uploads:** MIME-type whitelist per bucket (`04` §26); scanned via signed-URL upload flow — never accept multipart bodies directly on `/api/*`
- **User-generated strings persisted then rendered:** always escaped at the render layer (React defaults); this is defense-in-depth for XSS

### 9.6 Replay protection

- **Session cookies:** rotated on privilege escalation (workspace switch, role change)
- **Webhooks:** deduped by provider message id (§8.7)
- **Idempotency keys:** stored 24h (§2.4.1)
- **CSRF tokens:** single-use where feasible (`X-CSRF-Token` matches a random secret in the session cookie; secret rotates on every 200 response)

### 9.7 CSRF

- **Server Actions:** protected by Next.js origin check + `same-origin` fetch requirement (no CSRF token needed)
- **Authenticated Route Handlers (state-changing):** `X-CSRF-Token` header must match a value derived from the session; missing / mismatched → 403
- **Public unauthenticated Route Handlers:** exempt (no session to protect)
- **Webhooks:** exempt (verified via HMAC signature instead)

### 9.8 CORS

- **Same-origin default:** the app is served from `verocrest.app` (staging: `staging.verocrest.app`; local: `localhost:3000`). No cross-origin API calls from the browser in v0.1.
- **Public booking page**: server-rendered HTML; no CORS needed for its API calls (same origin).
- **CORS headers**: not set on `/api/*` in v0.1 (implicit same-origin only). When Future SaaS launches a public API, `/api/public/v1/*` will explicitly set `Access-Control-Allow-Origin` per tenant configuration.

### 9.9 Secrets

- **Storage:** Vercel Environment Variables for system-wide secrets; Supabase Vault for per-workspace encrypted OAuth tokens (Gmail refresh tokens, Calendar tokens)
- **Never in code, never in git.** `.env` files gitignored; secrets scanning via GitHub push protection
- **Rotation:** documented runbook per provider (§13); no automated rotation in v0.1 (Phase 3+ SOC 2 prep)

### 9.10 JWT handling

- **Verification:** on every request, Supabase JWT verified against Supabase JWKS (cached with 1h TTL)
- **Custom claims used:** `app_metadata.workspace_ids` — set on signup + workspace-membership change; NOT `active_workspace_id` (that's cookie-based, mutable without JWT roll)
- **Signing keys:** managed by Supabase; not exposed to app code
- **Refresh:** transparent via Supabase client SDK; refresh token httpOnly cookie
- **Never surface JWT to client JS** — the Supabase client uses cookie-based auth; no `localStorage` tokens

### 9.11 Signed URLs (Supabase Storage)

- **TTL by use case:**
  - Immediate downloads (view a screenshot inline): **60s**
  - User-initiated exports (proposal PDF download): **1h**
  - Shareable proposal PDF link (`proposals.pdf_url` used in outreach): **24h**, workspace-configurable up to 7 days (Phase 2 config)
- **Path:** always workspace-scoped `workspace/<workspace_id>/...`
- **Authorization at generation:** service-role auth confirms workspace membership before generating the signed URL; RLS also protects the underlying row
- **Never generate a signed URL on the client** — always via a Route Handler that runs the membership check

---

## 10. Error Model

Every API response uses this envelope:

```typescript
type ApiResult<T> = {
  data: T | null;
  error: ApiError | null;
  requestId: string;
  meta?: Record<string, unknown>;
};

type ApiError = {
  code: string;                    // stable string, e.g. "AUTH_INVALID_CREDENTIALS"
  category: ErrorCategory;
  message: string;                 // human-readable, voice-per-08 §14
  details?: Record<string, unknown>;
  retryable: boolean;
  retryAfterMs?: number;
  fieldErrors?: Record<string, string>;  // validation-only
};

type ErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'business'
  | 'rate_limit'
  | 'integration'
  | 'ai'
  | 'database'
  | 'internal';
```

### 10.1 HTTP status codes

| Category | Status codes |
|---|---|
| Validation | 422 |
| Authentication (missing / invalid session) | 401 |
| Authorization (session valid, action forbidden) | 403 |
| Not found | 404 |
| Conflict (dedupe, slug collision, merge conflict) | 409 |
| Business rule violation | 422 or 400 (case-by-case) |
| Rate limit | 429 |
| Integration dependency down | 424 or 503 |
| Idempotency replay | replays the original status |
| Server error | 500 |

### 10.2 Canonical error codes

Not exhaustive; grouped by category. Every code has a matching UI string from `08` §14.

- **Validation:** `VALIDATION_ERROR`
- **Auth:** `AUTH_INVALID_CREDENTIALS`, `AUTH_EMAIL_UNVERIFIED`, `AUTH_EMAIL_EXISTS`, `AUTH_PASSWORD_WEAK`, `AUTH_PASSWORD_BREACHED`, `AUTH_RESET_TOKEN_INVALID`, `AUTH_RESET_TOKEN_EXPIRED`, `AUTH_VERIFY_TOKEN_INVALID`, `AUTH_OAUTH_DENIED`, `AUTH_SESSION_EXPIRED`
- **Authz:** `WORKSPACE_NOT_MEMBER`, `ROLE_INSUFFICIENT`
- **Business:**
  - Contacts / Companies: `CONTACT_EMAIL_TAKEN`, `COMPANY_DOMAIN_TAKEN`, `COMPANY_MERGE_CONFLICT`, `LEAD_EXISTS_FOR_CONTACT`
  - CSV: `CSV_MALFORMED`, `CSV_TOO_LARGE`
  - KB: `KB_CONTENT_TOO_LONG`
  - Outreach: `GMAIL_DISCONNECTED`, `GMAIL_RATE_LIMITED`, `RECIPIENT_INVALID`, `CONTACT_UNSUBSCRIBED`
  - Calendar / booking: `CALENDAR_DISCONNECTED`, `SLOT_TAKEN`
  - Proposals: `PROPOSAL_MISSING_OFFER`, `PROPOSAL_PDF_UNAVAILABLE`, `OFFER_PAUSED_AT_SEND`
  - Workspace: `WORKSPACE_SLUG_TAKEN`
  - Booking link: `BOOKING_SLUG_TAKEN`
- **Rate limit:** `RATE_LIMITED`
- **Integration:** `INTEGRATION_DOWN`, `INTEGRATION_UNAUTHORIZED`
- **AI:** `AI_BUDGET_EXCEEDED`, `AI_PROVIDER_UNAVAILABLE`, `AI_STRUCTURED_OUTPUT_FAILED`, `AI_TIMEOUT`, `AI_MEMORY_EMPTY_CONTEXT`, `AI_INDEX_FAILED`, `AUDIT_UNREACHABLE`, `AUDIT_BLOCKED`, `AUDIT_TIMEOUT`
- **Database:** `DB_CONNECTION_ERROR`, `DB_CONFLICT`, `DB_INTEGRITY_ERROR`
- **Internal:** `INTERNAL`, `FEATURE_NOT_AVAILABLE_V0_1`

### 10.3 Retry guidance

- `retryable: true` → client MAY retry (transient); use `retryAfterMs` if present
- `retryable: false` → client must not retry the same operation (permanent)
- `RATE_LIMITED` always retryable with `retryAfterMs`
- `AI_PROVIDER_UNAVAILABLE` retryable after 60s
- `AI_BUDGET_EXCEEDED` NOT retryable (until budget resets)
- `VALIDATION_ERROR` NOT retryable
- `CONTACT_UNSUBSCRIBED`, `SLOT_TAKEN` NOT retryable (state changed)

### 10.4 Field errors

For `VALIDATION_ERROR`, `fieldErrors` maps input field path → user-facing message:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "category": "validation",
    "message": "Some fields need attention.",
    "retryable": false,
    "fieldErrors": {
      "email": "Email format is invalid",
      "password": "Must be at least 12 characters"
    }
  }
}
```

### 10.5 Error mapping to UI

Per `07` §17, error codes map to UI treatments. Per `08` §14, each code has a canonical user-facing string. This document establishes the wire format; those documents establish the presentation.

---

## 11. Event Integration

Every API that produces a state change emits at least one event onto the Agency Event Bus. Events are emitted transactionally with the state change (per `03` §8.10 — `event_journal` is a Postgres mirror; both write in the same transaction).

### 11.1 Emission per endpoint (summary)

| Endpoint | Events emitted |
|---|---|
| `POST /api/workspaces` | `workspace.created` |
| `POST /api/workspaces/oauth complete Google connect` | `integration.google.connected` |
| Onboarding hit 100% | `workspace.onboarded` |
| `POST /api/companies` | `contact.updated` if a linked contact gains company_id |
| `POST /api/contacts` | `contact.updated` (v1) |
| `POST /api/contacts/import` completed | `lead.ingested` × N |
| `POST /api/leads` | `lead.ingested` |
| `POST /api/leads/:id/rescore` completed | `lead.enriched` → `lead.scored` |
| `POST /api/audits` completed | `website.audit.completed` (+ `website.audit.delta` when applicable) |
| `POST /api/ai/stream/draft-outreach-*` completed | `outreach.draft.generated`, `ai.output.produced` |
| Regeneration loop hits threshold | `outreach.draft.rejected` |
| `POST /api/outreach/:id/send` | `outreach.sent` → `reminder.created` (auto follow-up) |
| `POST /api/outreach/:id/mark-sent` | `outreach.sent` |
| Gmail webhook processed | `outreach.reply.received` |
| Reply classified | `outreach.reply.received` (v2) |
| `POST /api/deals` | (no event) |
| `POST /api/deals/:id/stage` | `deal.stage.changed` |
| `POST /api/deals/:id/won` | `deal.won` |
| `POST /api/deals/:id/lost` | `deal.lost` |
| `POST /api/proposals` | `proposal.drafted` |
| `POST /api/proposals/:id/send` | `proposal.sent` |
| `POST /api/proposals/:id/mark-signed` | `proposal.signed` |
| `POST /book/.../book` | `meeting.booked` |
| `POST /api/meetings/:id/complete` | `meeting.completed` |
| `POST /api/reminders` | `reminder.created` |
| `POST /api/reminders/:id/complete` | `reminder.completed` |
| Reminder scheduler cron | `reminder.due` |
| `POST /api/kb` (activate) | `knowledge_doc.upserted` → `knowledge_doc.indexed` |
| `POST /api/kb/:id/reindex` | `knowledge_doc.upserted` (content_hash unchanged → no-op indexer) |
| `POST /api/offers` (activate) | `offer.upserted` → `offer.indexed` |
| `POST /api/icps` (activate) | `icp.upserted` → `icp.indexed` |
| `POST /api/workspace/targets` (any settings PATCH that sets target) | `target.set` |
| Every AI call from any endpoint | `ai.output.produced` |
| Every agent action (dormant in v0.1) | `agent.action.executed` |
| Google OAuth successful callback | `integration.google.connected` |

### 11.2 Subscribers (summary)

Per `03` §8.5, subscribers to these events include: Scoring service, Relationship Intelligence, Outreach Queue, Memory Service, Notifications, Dashboard denormalization, Action Log, Cost aggregator. Each subscriber is a typed Inngest function in `packages/platform-jobs/`.

### 11.3 Transactional emission

Emission mechanic:

```typescript
await db.transaction(async (tx) => {
  // 1. State change
  const message = await tx.update(outreachMessages).set({ status: 'sent' })...;

  // 2. event_journal write in same transaction
  await tx.insert(eventJournal).values({
    id: ulid(),
    workspaceId,
    name: 'outreach.sent',
    version: 1,
    actorType: 'user',
    actorId: userId,
    subjectType: 'outreach_message',
    subjectId: message.id,
    payload: { channel, messageId, contactId },
    occurredAt: now,
    emittedAt: now,
  });
});

// 3. Inngest emission — fire and forget after commit
inngest.send({
  name: 'outreach.sent',
  data: { ... },
  ts: now,
});
```

If the Inngest emission fails after commit, a nightly reconciliation cron reads `event_journal` for the last hour and re-emits any events that didn't reach Inngest (identified via a lightweight cursor). This is the primary safeguard for guaranteed delivery.

---

## 12. Performance

### 12.1 Caching

- **Client-side (browser):** TanStack Query cache for reads; invalidation on mutations
- **Server-side (Route Handlers):** `Cache-Control` headers per endpoint — most authenticated reads are `private, max-age=0, must-revalidate` (no shared caching); dashboard snapshot uses `private, max-age=15`
- **Realtime deltas** via Supabase Realtime replace polling — dashboard updates within seconds without repeated GET calls
- **Router-side memory retrieval cache** per `09` §4.7 (query embedding cached 5 min)
- **Prompt resolution cache** per `09` §2.9 (LRU 60s)
- **No response caching on AI endpoints** — every call fresh (`09` §2.9)

### 12.2 Streaming

- **AI streams:** SSE per §7.4 with cursor / delta / complete / error framing
- **CSV exports:** `Content-Type: text/csv` streamed row-by-row using `ReadableStream` — no full-buffer materialization

### 12.3 Pagination

- **Cursor-based** for entity lists (contacts, companies, deals, outreach, audits, etc.). Cursor is an opaque base64-encoded `(sort_key, id)` tuple; server-signed to prevent tampering.
- **Page sizes:** default 50, max 200 per request
- **Total count:** returned as `totalEstimate` (approximate, from Postgres `pg_class.reltuples` for very large workspaces; exact for < 10k rows)
- **Offset pagination** used only for admin exports (never user-facing) to avoid performance cliffs

### 12.4 Timeouts

- **Route Handler request timeout:** 30s default (Vercel serverless limit); overridden per endpoint
- **AI SSE streams:** capability-specific per `09` §11.1 (up to 120s for proposal)
- **Downstream calls:**
  - Postgres query: 10s statement timeout
  - Supabase Storage: 15s
  - Google API: 20s
  - Model Router provider call: `09` §11.1
  - Browserless: 60s
- **Inngest functions:** 5 minutes default (extendable per step)

### 12.5 Retry strategy

- **Idempotent retries at the client (browser):** TanStack Query mutation `retry: 1` for network errors only; never for 4xx
- **Idempotent retries at the Server Action / Route Handler layer:** none (responses are envelope-typed, no exceptions propagate; client decides)
- **Downstream retries:**
  - Postgres transient (5xx-equivalent): 1 retry with 100ms backoff
  - Provider APIs: per §10.3 and `09` §11.2
  - Webhook receivers ack fast; retries are by the provider
- **Inngest retries:** default 3 attempts with exponential backoff; step-level `NonRetriableError` for permanent failures

### 12.6 Connection pooling

- **Supabase Postgres:** app connects via Supavisor (transaction-pool mode) — no long-lived per-request connections; pool sized to `max_client_connections = 200` at Supabase Pro
- **Prisma / Drizzle:** Drizzle uses `postgres.js` driver, which is compatible with Supavisor transaction mode
- **Prepared statements:** disabled at the driver level (incompatible with transaction pool); parameterized queries used throughout

### 12.7 Compression

- **Vercel Edge:** brotli (or gzip fallback) auto-applied on responses > 1KB with a compressible `Content-Type`
- **SSE:** compression **disabled** (streaming semantics conflict with buffered compression); text framed at capability-appropriate chunk size

---

## 13. Observability

### 13.1 Logging

- **Structured JSON** per `NFR-OBS-002`
- **Every log line carries:** `requestId`, `workspaceId?`, `userId?`, `endpoint`, `level`, `message`, plus context-specific fields
- **Sink:** Axiom via a lightweight logger wrapper in `packages/platform-observability/`
- **PII policy:** no email bodies, passwords, tokens, phone numbers, or full customer names in logs — replace with hashed identifiers or truncate; enforced by a lint rule on `console.*` and via the logger wrapper (which redacts known-sensitive keys)

### 13.2 Tracing

- **Request-scoped trace** via `requestId` propagated through every layer (§2.8)
- **Distributed tracing** (OpenTelemetry) — **not shipped in v0.1**; scaffolding via env-controlled OTLP exporter reserved for Phase 3+ SOC 2 prep
- **AI Router calls** attached to the request trace via `requestId`, per `09` §9.3

### 13.3 Metrics

- Endpoint request rate + P50 / P95 / P99 latency + error rate — recorded via Vercel Analytics + Axiom
- Per-endpoint dashboard in Axiom
- AI cost + latency per capability + workspace — from `ai_usage_daily` (`04` §18.2)

### 13.4 Request IDs

- **Format:** ULID (26 chars)
- **Ingress:** middleware generates on every request; also honors an inbound `X-Request-ID` (from Vercel Edge) if present
- **Propagation:** set as HTTP response header `X-Request-ID`; passed to Inngest events (`correlation_id`); logged everywhere

### 13.5 Correlation IDs

- **Correlation across events:** `correlation_id` in event envelope per `03` §8.2
- **A single user action** (e.g., "send outreach → auto-create reminder → refresh queue → update dashboard") produces multiple events sharing one `correlation_id`
- **Reconstruction:** join `event_journal` on `correlation_id` for a full user-action audit trail

### 13.6 Monitoring + alerts

Alerts (Sentry + Axiom) per `03` §15 and `09` §9.6, plus API-specific:

- **API 5xx rate > 1%** in 5-min window → Sentry page
- **API P95 latency > 2× SLO** for any endpoint → Sentry page
- **Webhook failure rate > 5%** over 15-min → Sentry page (§8.7)
- **Idempotency-replay rate > 20%** on a given endpoint → warn (potential client bug)
- **Rate-limit rejection rate > 5%** for a workspace → warn (potential abuse)

### 13.7 Health probes

- `GET /api/health` — liveness (returns 200 if the process is running)
- `GET /api/ready` — readiness (checks DB connectivity, Router primary provider reachability; returns 503 if any check fails)

Used by Vercel + external monitors.

---

## 14. Failure Catalogue

Every API failure code from §10, mapped to recovery + fallback. This is the wire-level analog to `05` §14 (which is UX-facing) and `09` §10 (which is AI-specific).

| Code | HTTP | Retryable | Client action | Server fallback |
|---|---|---|---|---|
| `VALIDATION_ERROR` | 422 | No | Show field errors | — |
| `AUTH_INVALID_CREDENTIALS` | 401 | No | Prompt re-entry | — |
| `AUTH_EMAIL_UNVERIFIED` | 403 | No | Resend verification | — |
| `AUTH_EMAIL_EXISTS` | 409 | No | Offer sign-in / reset | — |
| `AUTH_PASSWORD_WEAK` | 422 | No | Show strength meter | — |
| `AUTH_PASSWORD_BREACHED` | 422 | No | Show breach explanation | — |
| `AUTH_RESET_TOKEN_INVALID` | 401 | No | Request new link | — |
| `AUTH_RESET_TOKEN_EXPIRED` | 401 | No | Request new link | — |
| `AUTH_OAUTH_DENIED` | 401 | No | Explain permissions | — |
| `AUTH_SESSION_EXPIRED` | 401 | No | Sign in again | — |
| `WORKSPACE_NOT_MEMBER` | 403 | No | Redirect to workspace picker | — |
| `ROLE_INSUFFICIENT` | 403 | No | Show role-required message | — |
| `NOT_FOUND` | 404 | No | Navigate elsewhere | — |
| `CONTACT_EMAIL_TAKEN` | 409 | No | Offer merge | — |
| `COMPANY_DOMAIN_TAKEN` | 409 | No | Offer merge or use existing | — |
| `COMPANY_MERGE_CONFLICT` | 409 | No | Owner review | — |
| `LEAD_EXISTS_FOR_CONTACT` | 409 | No | Open existing lead | — |
| `CSV_MALFORMED` | 422 | No | Show line errors | — |
| `CSV_TOO_LARGE` | 413 | No | Split file | — |
| `KB_CONTENT_TOO_LONG` | 422 | No | Split doc | — |
| `GMAIL_DISCONNECTED` | 424 | No | Reconnect Gmail; draft preserved | — |
| `GMAIL_RATE_LIMITED` | 429 | Yes (retryAfter) | Automatic retry | Server auto-retries once |
| `RECIPIENT_INVALID` | 422 | No | Fix email | — |
| `CONTACT_UNSUBSCRIBED` | 403 | No | Explain, offer archive | — |
| `CALENDAR_DISCONNECTED` | 503 (booking page) | Yes | Owner reconnect | Booking page shows fallback |
| `SLOT_TAKEN` | 409 | No | Offer alternate slots | — |
| `PROPOSAL_MISSING_OFFER` | 422 | No | Force offer pick | — |
| `PROPOSAL_PDF_UNAVAILABLE` | 404 | Yes (backoff) | Poll after 2s | Async PDF gen in progress |
| `OFFER_PAUSED_AT_SEND` | 200 (warning banner, not error) | — | — | Snapshot proceeds |
| `WORKSPACE_SLUG_TAKEN` | 409 | No | Suggest alternates | Server generates suggestions |
| `BOOKING_SLUG_TAKEN` | 409 | No | Try another | — |
| `RATE_LIMITED` | 429 | Yes (retryAfter) | Wait & retry | — |
| `INTEGRATION_DOWN` | 503 | Yes | Show status page link | Auto-retry per §12.5 |
| `INTEGRATION_UNAUTHORIZED` | 424 | No | Reconnect | — |
| `AI_BUDGET_EXCEEDED` | 402 | No | Show top-up dialog | — |
| `AI_PROVIDER_UNAVAILABLE` | 503 | Yes (60s) | Show retry-in-60s message | Router failover attempted |
| `AI_STRUCTURED_OUTPUT_FAILED` | 500 | Yes (once) | Show blank template option | Router retried + fallback tried |
| `AI_TIMEOUT` | 504 | Yes | Show retry | — |
| `AI_MEMORY_EMPTY_CONTEXT` | 200 (warning) | — | Show "limited context" note | Proceed with less grounding |
| `AI_INDEX_FAILED` | 202 (soft) | Yes | Show retry banner | Auto-retry via Inngest |
| `AUDIT_UNREACHABLE` | 200 (audit marked failed) | Yes | Show "try again" | — |
| `AUDIT_BLOCKED` | 200 (audit marked failed) | No | Suggest manual audit | — |
| `AUDIT_TIMEOUT` | 200 (audit marked failed) | Yes | Show retry | Server retried once |
| `DB_CONNECTION_ERROR` | 503 | Yes | Show retry | — |
| `DB_CONFLICT` | 409 | Yes | Reload state | — |
| `DB_INTEGRITY_ERROR` | 500 | No | Report bug | — |
| `INTERNAL` | 500 | Yes | Show generic error + request ID | Sentry-captured |
| `FEATURE_NOT_AVAILABLE_V0_1` | 501 | No | UI hides feature | — (Phase 2/3 unblocks) |

---

## 15. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | Server Actions are the default; Route Handlers are the escape hatch | RPC shape fits typed, CSRF-free React mutations; Route Handlers reserved for HTTP-required surfaces (webhooks, SSE, public unauth, downloads) |
| 2026-07-01 | Cursor pagination for entity lists; server-signed opaque cursor | Stable ordering, tamper-proof, avoids offset performance cliffs |
| 2026-07-01 | Idempotency mandatory on state-changing endpoints (send, sign, won, book, audit, import); optional elsewhere | Prevents double-fire on retries; storage overhead trivial |
| 2026-07-01 | `idempotency_records` implementation table (not a product surface) | Required infra for §2.4; consistent with "implementation not new feature" boundary |
| 2026-07-01 | Password reset documented as Supabase-managed flow with Resend template | Implicit in FR-IDT-001; not a new product feature; ships with the auth choice |
| 2026-07-01 | Invite acceptance endpoint reserved with 501 in v0.1 | `06` §2.13 marks FR-IDT-009 as Phase 3; URL shape reserved to prevent Phase 3 route reshuffle |
| 2026-07-01 | Public API namespace `/api/public/v1/*` reserved but not implemented | Future SaaS lands here; keeps namespace contract clean |
| 2026-07-01 | Rate-limit defaults per §9.3 (300/240/1200 rpm for IP/user/workspace globals) | Fits founder-solo Act I with headroom; per-workspace bucket enables multi-tenant SaaS later without redesign |
| 2026-07-01 | Webhooks ack < 2s with async processing via Inngest | Required by every provider's retry semantics; also isolates failure surface |
| 2026-07-01 | Envelope uniform for Server Actions and Route Handlers | Client handler is uniform; error handling is the same regardless of surface |
| 2026-07-01 | Error `code` is stable, `message` is human, `category` classifies | Stable codes enable client branching; category enables UI-level grouping (`07` §17) |
| 2026-07-01 | AI capability endpoints as thin adapters over Router; no provider bypass path | Enforces `AI-PROV-001` at the HTTP boundary; no client can force a specific provider |
| 2026-07-01 | Streaming AI via SSE (not WebSocket) | HTTP-friendly, EventSource native support, cancellation semantics clean, matches Vercel serverless model |
| 2026-07-01 | Server Actions never contain business logic; Service Layer is the shared substrate | Enables Inngest jobs to reuse the same logic without duplication |
| 2026-07-01 | Transactional event emission via `event_journal` write; Inngest emission after commit; nightly reconciliation cron | Guarantees at-least-once delivery even if Inngest emission fails post-commit |
| 2026-07-01 | Signed URL TTLs: 60s inline / 1h user export / 24h shareable proposal | Balances usability vs exposure; shareable-link TTL configurable in Phase 2 |
| 2026-07-01 | CORS not set on `/api/*` in v0.1 (same-origin only) | Simpler security posture; Future SaaS public API adds explicit CORS config |
| 2026-07-01 | No OpenTelemetry distributed tracing in v0.1 | Overkill at MVP scale; scaffolding reserved for Phase 3+ SOC 2 prep |
| 2026-07-01 | `service-role` JWT bypasses per-user/workspace rate limits (Inngest only) | Internal system calls must not be throttled against user-scoped budgets |
| 2026-07-01 | Prompt-resolved templates are never returned to the client | Defense in depth against prompt exfiltration; Prompt Library viewer surfaces metadata only |
| 2026-07-01 | Webhook signature verification per §8 for each provider | Non-negotiable; unsigned webhook is a public write endpoint |
| 2026-07-01 | `PATCH /api/proposals/:id` allows autosave-frequency calls | Editor UX requires frequent saves; endpoint sized accordingly |

---

## 16. Resolved Decisions

Every question that could remain open is decided here:

1. **API topology default** → Server Actions for UI mutations; Route Handlers for webhooks, SSE, public unauth, downloads (§3.5)
2. **Rate-limit numeric defaults** → §9.3 table
3. **Pagination style** → cursor with signed opaque cursors, 50 default / 200 max (§12.3)
4. **Idempotency window** → 24h; `idempotency_records` implementation table (§2.4)
5. **Password reset endpoint shape** → §5.4 (Supabase + Resend template)
6. **Invite acceptance in v0.1** → reserved endpoint with `501 FEATURE_NOT_AVAILABLE_V0_1` (§5.9)
7. **Public API for third parties** → not in v0.1; namespace reserved `/api/public/v1/*`
8. **CSRF strategy** → Server Actions built-in; authenticated Route Handlers require `X-CSRF-Token` (§9.7)
9. **Signed URL TTLs** → 60s / 1h / 24h per use case (§9.11)
10. **CORS policy** → same-origin only in v0.1 (§9.8)
11. **JWT custom claims** → `app_metadata.workspace_ids[]` only (§9.10)
12. **Streaming transport** → SSE (§7.4)
13. **Streaming vs non-streaming decision per capability** → matches `09` §11 (drafts stream; classifications don't)
14. **Error envelope shape** → §10
15. **Retry guidance semantics** → §10.3
16. **Distributed tracing** → not in v0.1 (§13.2)
17. **Webhook ack SLA** → < 2s, async processing after (§8.7)
18. **Public booking abuse control** → 20 rpm per IP; CAPTCHA deferred to Phase 2 if abuse detected (§6.5)
19. **`/api/ai/memory/retrieve` visibility** → internal-only (service-role) (§7.8)
20. **PII in logs** → never; enforced by logger redaction + lint rule (§13.1)

No open questions remain on the API architecture. Any new ambiguity discovered during `11_Integrations.md` will surface there.

---

## 17. Approval Gate

To move to `11_Integrations.md`, the founder must sign off on:

1. **API topology** (§3): Server Actions default; Route Handlers for HTTP-required surfaces; Service Layer as shared substrate; Event Bus for async.
2. **Endpoint index (§4)** as the complete v0.1 surface. Nothing extra.
3. **Naming conventions** (§2.2) and **unversioned internal APIs** (§2.3).
4. **Idempotency mechanism** including the implementation-only `idempotency_records` table (§2.4).
5. **Password reset** as an implicit Supabase-managed flow (§5.4).
6. **Invite acceptance endpoint reserved with 501** in v0.1 (§5.9).
7. **CRM APIs** (§6) as documented, including cursor pagination + owner-only writes on structural surfaces.
8. **AI APIs** as thin Router adapters (§7); streaming via SSE; internal-only memory retrieval.
9. **Webhook receivers** (§8) with signature verification, fast ack + async processing, and Phase 2 stubs for Stripe + e-sign.
10. **Security posture** (§9): rate-limit numbers, CSRF, CORS same-origin, JWT claims, signed-URL TTLs, PII policy.
11. **Unified error envelope** (§10) and canonical code catalogue.
12. **Event emission per endpoint** (§11) with transactional `event_journal` write.
13. **Performance guarantees**: cursor pagination, SSE streaming, `Cache-Control` conventions, downstream timeouts, connection pooling via Supavisor (§12).
14. **Observability**: request IDs, correlation IDs, structured logs to Axiom, alert thresholds (§13).
15. **Failure catalogue** as the wire-level authority for retry/fallback (§14).

Once signed off, `11_Integrations.md` will produce the integration layer: exact contracts and configuration for Google (Gmail send + Pub/Sub push + Calendar), Browserless, Resend, Anthropic + OpenAI, Supabase Storage, plus the Phase 2 stubs for Stripe, ESP providers, Xero + QuickBooks, and n8n webhooks.

---

*End of 10_API_Architecture.md*

---

**Should I continue to the next blueprint document (`11_Integrations.md`)?**

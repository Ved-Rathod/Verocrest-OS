# 06 — Feature Modules

**Document:** Module-level specifications for Version 0.1
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint — Core Engine First)
**Status:** Draft for approval
**Owner:** Founder / CTO / PM
**Depends on (frozen):** `01_Vision.md`, `02_Product_Requirements.md`, `03_System_Architecture.md`, `04_Database_Design.md`, `05_User_Flows.md`
**Last updated:** 2026-07-01

---

## 0. How to read this document

This document turns the six approved MVP modules from PRD §10.2 into **module-level specifications** that a senior engineer could implement without re-interviewing the founder.

**Frozen upstream — this document conforms.** If anything here appears to contradict `01–05`, the upstream doc wins and this document is wrong. Report the contradiction so it can be corrected.

**No new functionality is introduced.** Every UI surface, table reference, and event emission is anchored to an approved specification. The only latitude taken is *where* an approved capability is surfaced (module ownership) — those ownership calls are logged in §12.

Each module section follows the same 13-part template (§1). Modules with a large surface area (Module 2, Module 5) are longer than the smaller modules (Module 1, Module 6).

---

## 1. Module Spec Template

Every module below uses this structure. Non-applicable sections are marked `N/A` rather than omitted.

1. **Purpose** — one-sentence definition
2. **Business Value** — which Vision principle(s) it satisfies (§7 of `01_Vision.md`)
3. **Primary User Story** — the golden path in one sentence
4. **Requirements Coverage** — traceability to FR / NFR / AI / DATA IDs from `02_Product_Requirements.md`
5. **Inputs** — user + system inputs the module consumes
6. **Outputs** — what the module produces (data + events + UI states)
7. **Workflow References** — pointer to `05_User_Flows.md` sections
8. **Database Tables** — tables from `04_Database_Design.md` this module owns or reads
9. **Public Interface** — how other modules call in (typed contract summary)
10. **UI Components / Screens** — logical surfaces, not pixel-level (details in `07_UI_UX_System.md`)
11. **Events Emitted / Consumed** — Agency Event Bus interactions (§8 of `03_System_Architecture.md`)
12. **Edge Cases + Failure States** — references to `05_User_Flows.md` §14
13. **Dependencies + Success Metrics + Future Improvements** — what this module needs, how we measure it, what we defer

---

## 2. Module 1 — Authentication (+ Workspace + Onboarding)

### 2.1 Purpose

Provide identity, session, workspace scaffolding, and the first-session onboarding checklist that converts a new workspace from empty to Dashboard-ready.

### 2.2 Business Value

- Vision Principle 7 (Build for SaaS from day one — multi-tenancy) — this module owns the tenancy boundary at the identity layer.
- Vision Principle 10 (The founder must use it daily) — the onboarding checklist reduces first-value time to under one session.

### 2.3 Primary User Story

> As a new Verocrest OS user, I can sign up, create a workspace, complete a seven-item checklist, and reach a Dashboard populated with real data in under 60 minutes.

### 2.4 Requirements Coverage

- **FR-IDT-001, 002, 003, 005, 006, 007, 008, 011** — auth, tenancy partition, roles (owner + member), auth-event logging, session invalidation
- **FR-WS-001, 002, 003, 005** — workspace CRUD, uniqueness, role scoping, brand assets
- **NFR-SEC-003, 011** — RLS enforcement, session lifetime
- **Cross-cutting:** FR-SET-002 (member settings surface)
- **Explicitly excluded from MVP** (per PRD §10.6): FR-IDT-004 MFA, FR-IDT-009 invites, FR-IDT-010 SSO, FR-IDT-012 session revocation UI, FR-WS-004 custom roles, FR-WS-006 soft-delete UI

### 2.5 Inputs

- Email + password (Supabase Auth)
- Google OAuth grant (Supabase Auth)
- Magic-link click (Supabase Auth)
- Workspace name, timezone, currency, niche selection (form)
- Onboarding checklist selections (see `05` §3)

### 2.6 Outputs

- Authenticated session (Supabase JWT + `vc_active_workspace` cookie)
- Populated `workspaces` + `workspace_members` rows
- Session-scoped `app.workspace_id` + `app.actor_user_id` Postgres GUCs (set by middleware per architecture §4.1)
- Onboarding progress state (derived from workspace flags + presence of related rows)
- Emitted events (§2.11)

### 2.7 Workflow References

- `05` §2 — New user signup + auth path
- `05` §3 — Onboarding checklist (7 items)
- `05` §14 — F-ONB-001 through F-ONB-005 failure states

### 2.8 Database Tables

**Owned (writes + reads):**
- `workspaces` (04 §3.1)
- `workspace_members` (04 §3.2)
- `workspace_invites` (04 §3.3) — structural in v0.1, unused surface

**Reads only (owned by other modules):**
- Presence probes on `icps`, `offers`, `knowledge_documents`, `workspace_targets`, `leads`, `audits` — used to compute checklist completion state

**Uses:**
- `auth.users` (Supabase)
- `integration_connections` (04 §19) — Google OAuth grant recorded here; primary owner is a cross-cutting Settings surface

### 2.9 Public Interface

```typescript
// Consumed by all other modules via middleware
type SessionContext = {
  workspaceId: string;
  actorUserId: string;
  role: 'owner' | 'member';
  requestId: string;
};

// Guard used at the top of every Server Action and Route Handler
function requireSession(): Promise<SessionContext>;

// Onboarding progress read by Module 6 (Dashboard) to decide checklist visibility
type OnboardingProgress = {
  workspaceOnboarded: boolean;
  items: Array<{
    key: 'google' | 'icp' | 'offer' | 'kb' | 'target' | 'leads' | 'audit';
    status: 'not_started' | 'in_progress' | 'done';
    completedAt?: string;
  }>;
};
function getOnboardingProgress(): Promise<OnboardingProgress>;
```

### 2.10 UI Components / Screens

- **`/signup`** — email + password + Google OAuth entrypoint
- **`/signin`** — same, plus magic-link
- **`/verify`** — email verification landing
- **`/oauth/callback/google`** — post-Google callback + workspace-creation prompt if first sign-in
- **`/onboarding`** — checklist shell (also embedded as the Dashboard home surface until 100% complete)
- **`/settings/profile`** — member profile (name, timezone override, avatar)
- **`/settings/security`** — password change, connected accounts (view + revoke)
- **`/settings/workspace`** — workspace name, timezone, default currency, brand assets (logo/primary color/favicon)
- **`/switch-workspace`** — surface for owners belonging to multiple workspaces
- **Sign-out control** — global header

### 2.11 Events Emitted / Consumed

Emitted:
- `workspace.created` (v1)
- `integration.google.connected` (v1) — [new in `05` §16; adds to architecture §8.3 catalogue]
- `workspace.onboarded` (v1) — [new; fires when checklist hits 100%]

Consumed:
- None directly. Reads only from other modules' entity tables to compute checklist state.

### 2.12 Edge Cases + Failure States

- Duplicate email at signup → `F-ONB-001` → redirect to sign-in
- OAuth denied → `F-ONB-002` → return with permission explanation
- Verification email undelivered → `F-ONB-003` → resend action, spam guidance
- Workspace slug collision → `F-ONB-004` → suggest variants
- Supabase outage → `F-ONB-005` → status link + retry
- User is member of multiple workspaces but active cookie references a workspace they were removed from → force workspace picker
- Session expiry mid-workflow → prompt reauth without losing in-progress form state (localStorage snapshot)
- Verified email changed externally → session invalidated; forced sign-in

### 2.13 Dependencies + Success Metrics + Future Improvements

**Dependencies:**
- Supabase Auth
- Resend (verification + magic-link emails)
- Google OAuth (INT-001)

**Success Metrics:**
- Time from `/signup` submit → onboarding 100% (target: < 60 min for Verocrest workspace)
- % of new workspaces that complete onboarding within 24h (target: 100% during Act I; > 80% in Act II)
- Onboarding item completion order (measured; informs Act II UX changes)
- Sign-in failure rate (target: < 2%)

**Future improvements (deferred, not designed here):**
- MFA (FR-IDT-004) — Phase 3
- SSO / SAML (FR-IDT-010) — Future SaaS
- Custom roles (FR-WS-004) — Phase 3
- Invite flow at scale (FR-IDT-009) — Phase 3
- Session revocation UI (FR-IDT-012) — Phase 3
- Workspace soft-delete + recovery UI (FR-WS-006) — Phase 3

**Future AI Agents** (aligned with Vision §4.6 AI Workforce endgame; all run on the primitives already scaffolded in architecture §7.6 — `agent_registry`, `agent_policy_envelopes`, agent-attributed Memory + Action Log, Model Router `agent_context` field; **no v0.1 MVP functionality**):

- **Onboarding Agent** (Phase 3, Assist tier) — proactively guides new workspace owners through the seven-item checklist, suggests niche-appropriate ICP starter templates, answers setup questions, monitors first-session drop-off and drafts recovery outreach. Subscribes to `workspace.created`, `workspace.onboarded`; envelope: workspace-owner-only interactions, first-session cost cap.
- **Workspace Hygiene Agent** (Phase 3, Assist tier) — surfaces inactive members, expiring OAuth grants, integration failures, brand-asset gaps; drafts owner nudges. Reads `workspace_members.last_active_at`, `integration_connections.status`; envelope: notification-only, no destructive actions.

---

## 3. Module 2 — Lead Intelligence

The largest module. It exposes the **Lead Intelligence Engine** subsystem (architecture §6) as a product surface, plus the configuration surfaces that feed it (ICPs, Knowledge Documents) and the entity data model at its foundation (Companies, Contacts, Leads).

### 3.1 Purpose

Store, enrich, score, and continuously understand every prospect, contact, company, and their relationship to the workspace — and make that understanding available to every other module and (later) to AI agents.

### 3.2 Business Value

- Vision Principle 11 (Relationship Intelligence is a first-class primitive) — this module *is* the primitive.
- Vision Principle 12 (Websites as living systems) — audits attach to companies here and drive scoring.
- Vision Principle 13 (Memory compounds) — AI Memory lives inside this module.
- Vision §10 (Moats): the operator moat, vertical data moat, and memory moat all compound in this module.

### 3.3 Primary User Story

> As an agency owner, when I import 200 dental clinic leads, within minutes each one is enriched, matched against my ICP, audited, scored on fit and readiness, and ranked in a queue with a Next Best Action — so I can focus on the five leads most likely to close this week.

### 3.4 Requirements Coverage

- **FR-CNT-001–005, 007, 009** — contacts + Relationship Profile + timeline + CSV import + linking
- **FR-LEAD-001–006, 008, 010** — lead ingest + enrichment + score + rubric + explainability + idempotency + audit surfacing
- **FR-WSI-001–004 (primitive)** — audit engine primitives (surface in Module 3)
- **FR-MEM-001–005** — AI Memory substrate
- **AI-HITL-002 (confidence surfacing)**, **AI-XPL-001 (score explainability)**, **AI-MEM-001–006** — memory constraints
- **DATA-001, 002** — personal data inventory + consent
- **New surfaces required by frozen `04` + `05` (not FR-numbered but approved):**
  - Companies CRUD (`04` §4.5)
  - Company Suggestions review (`05` Q6)
  - ICP editor + narrative + criteria (`05` §3.3, `04` §5.7)
  - Knowledge Document editor + list (`05` §3.5, `04` §7.3) — narrow surface, not the Phase 3 KB module (FR-KB-*)

### 3.5 Inputs

- CSV upload with column mapping (FR-LEAD-001)
- Manual contact/lead entry
- Web form submission (public endpoint per FR-LEAD-001)
- Enrichment provider responses (INT-007)
- Audit completion events from Module 3
- Reply / meeting / proposal events from Modules 4 and 5 (update Relationship Profile)
- User actions: mark disqualified, edit contact, merge companies, edit ICP, edit KB doc, annotate memory

### 3.6 Outputs

- Contact rows + `relationship_profiles` (LIE-owned)
- Company rows
- Lead rows + `lead_scores` (fit, readiness, opportunity) + explainability
- ICP rows + vectorized narrative in `memory_vectors`
- Knowledge Document rows + chunks in `memory_vectors`
- Outreach Queue items with Next Best Action + recommended Offer
- Memory read-service consumed by Modules 3, 4, 5 (never called from feature code — always via Model Router `withMemory`)
- Emitted events per §3.11

### 3.7 Workflow References

- `05` §3.3 ICP editor
- `05` §3.5 Knowledge Document editor
- `05` §3.7 CSV import
- `05` §6 Lead ingest → qualification pipeline (headline flow)
- `05` §9 Reply handling (updates Relationship Profile)
- `05` §14 F-CSV-001, 002; F-KB-001; F-AI-INDEX-001; F-ENRICH-001, 002; F-SCORE-001, 002

### 3.8 Database Tables

**Owned (LIE-write-locked to `app_role_lie` per `04` §2.2):**
- `relationship_profiles` (04 §4.3)
- `lead_scores` (04 §5.3)
- `lead_score_history` (04 §5.4)
- `outreach_queue_items` (04 §8.1)
- `memory_vectors` (04 §7.1)
- `knowledge_document_chunks` (04 §7.4)

**Owned (user-editable, `app_role_features` writes):**
- `companies` (04 §4.5)
- `contacts` (04 §4.1)
- `contact_emails` (04 §4.2)
- `activity_timeline` (04 §4.4)
- `leads` (04 §5.1)
- `ingest_batches` (04 §5.6)
- `scoring_rubrics` (04 §5.2)
- `icps` (04 §5.7)
- `knowledge_documents` (04 §7.3)
- `memory_annotations` (04 §7.2)

**Consumed (read):**
- `audits`, `audit_findings`, `audit_deltas` (owned by Module 3 as a surface; the LIE writer runs inside this module's Website Intelligence primitive)
- `offers` (read for Outreach Queue recommended_offer_id)
- `custom_field_definitions` (04 §20.1) — read to render custom fields

**Special note on Website Intelligence primitive:** the audit *engine* (Browserless orchestration, LLM analysis, findings persistence, delta computation) is a Lead Intelligence Engine responsibility per architecture §6.1. The *product surface* for auditing (browser, run-audit dialog, findings visualization) is Module 3. To preserve the LIE write-lock, Module 3's UI dispatches audit-requested events; the LIE processes them; Module 3 reads the results.

### 3.9 Public Interface

```typescript
// Companies
type CompanyRef = { id: string; name: string; domain?: string };
function upsertCompany(input): Promise<CompanyRef>;
function searchCompanies(query, filters): Promise<Company[]>;
function suggestCompanyForContact(contactId): Promise<CompanySuggestion[]>;
function mergeCompanies(sourceId, targetId): Promise<CompanyRef>;

// Contacts
function upsertContact(input): Promise<Contact>;
function importContactsCsv(batch): Promise<IngestBatchStatus>;
function getContactWithProfile(id): Promise<ContactWithRelationshipProfile>;

// Leads
function ingestLead(input): Promise<Lead>;
function getLeadScore(leadId): Promise<LeadScore | null>;
function rescoreLead(leadId): Promise<LeadScore>;                // triggers scoring pipeline

// ICPs (read + write)
function listActiveIcps(): Promise<Icp[]>;
function upsertIcp(input): Promise<Icp>;
function activateIcp(id): Promise<void>;

// Knowledge Docs (read + write; chunks are read-only externally)
function upsertKnowledgeDocument(input): Promise<KnowledgeDocument>;
function listKnowledgeDocuments(filters): Promise<KnowledgeDocument[]>;

// Memory retrieval — the only public read path for memory
function retrieveMemory(
  request: { scopes: MemoryScope[]; subjectIds?: string[]; queryEmbedding: number[]; topK: number }
): Promise<MemoryHit[]>;
// Called only by platform-ai-router `withMemory` wrapper; not by feature code directly.

// Outreach Queue
function getOutreachQueue(filters): Promise<OutreachQueueItem[]>;
function refreshOutreachQueueForLead(leadId): Promise<void>;
```

### 3.10 UI Components / Screens

**Contacts + Companies**
- `/contacts` — searchable, filterable list (email, name, company, tags)
- `/contacts/:id` — detail: header (name, company, relationship score card), timeline (activity_timeline), profile (relationship_profile), notes, custom fields, actions (edit, disqualify, add reminder, draft outreach)
- `/companies` — list
- `/companies/:id` — detail: contacts at this company, deals, audits, timeline, custom fields
- `/companies/suggestions` — review surface for ambiguous CSV → company matches (accept, reject, edit, merge)
- `/contacts/import` — 3-step CSV import (upload → map → dry-run → import) per `05` §3.7

**Leads**
- ~~Lead list is a scoped filter over `/contacts`; no dedicated `/leads` route in v0.1~~ **AMENDED (Amendment 002, 2026-07-03):** Verocrest OS ships a dedicated Leads surface — `/leads` (list), `/leads/new`, `/leads/:id` (detail), `/leads/:id/edit` — with a sidebar entry after Queue. See `BLUEPRINT_AMENDMENTS.md`.
- Lead score card is embedded in Contact detail (unchanged; LIE lands Sprint 7)

**ICPs**
- `/settings/icps` — list active + inactive
- `/settings/icps/new` and `/settings/icps/:id/edit` — editor with fields per `04` §5.7: name, short description, narrative (long-form; feeds AI Memory), criteria (industries, geographies, size, revenue, signals), disqualifiers, match weights, active + primary flags
- Save actions: "Save as Draft" (active=false) and "Save & Activate" (active=true; triggers `icp.upserted` → indexing)

**Knowledge Documents**
- `/kb` — list grouped by `doc_type` (SOP, case study, testimonial, etc.), filter by tag, `is_indexed` state visible
- `/kb/new` and `/kb/:id/edit` — markdown editor + metadata (doc_type, title, slug, tags, linked_entity, visibility)
- `/kb/:id` — read-only view with chunk-count + last-indexed indicator
- Indexing state indicator + "Reindex now" action for owners

**Memory**
- `/settings/memory` — cross-workspace search (workspace-scoped only), filter by scope, view, annotate ("always apply" / "never apply" per capability), delete
- Memory panel embedded in Contact detail showing retrieved memory hits for that contact
- Memory panel embedded in AI trace (all AI-produced content) — see Module 4 §5.10

**Outreach Queue (browsable surface; primary surface is Dashboard Gold Leads widget)**
- `/queue` — full ranked queue with columns: opportunity_score, next_best_action, recommended_offer, cooldown state
- Click-through to Lead / Contact detail

### 3.11 Events Emitted / Consumed

**Emitted (LIE services):**
- `lead.ingested` (v1)
- `lead.enriched` (v1)
- `lead.scored` (v1)
- `contact.updated` (v1)
- `contact.linked_to_company` (v1) — [new; from `04` §4.6 async resolution]
- `relationship.profile.recomputed` (v1)
- `outreach.queue.updated` (v1)
- `website.audit.requested` (v1) — emitted when auto-triggering an audit on lead-scored (§6.1 in `05`)
- `icp.upserted` (v1), `icp.indexed` (v1) — [new in `05` §16]
- `knowledge_doc.upserted` (v1), `knowledge_doc.indexed` (v1) — [new in `05` §16]

**Consumed:**
- `outreach.sent`, `outreach.reply.received` — update Relationship Profile
- `meeting.completed` — update Relationship Profile
- `website.audit.completed` — re-score leads with fit_score refresh (website_signal component)
- `offer.upserted` — refresh Outreach Queue recommendations
- `proposal.viewed`, `proposal.signed` — update Relationship Profile (positive signal)

### 3.12 Edge Cases + Failure States

- CSV with duplicate emails within the same file → dedupe within the batch by first occurrence; report to user
- CSV with ambiguous company_name (multiple candidates > 0.5 confidence) → surface in Company Suggestions review; do not auto-link
- Contact with no email (phone-only) → allow; no email dedupe; company resolution disabled
- Company with no domain → allow; company dedupe is fuzzy-name only; explicit merge UI available
- Lead ingested without an active ICP → scored with pre-ICP rubric per `05` §6.3 F-SCORE-001
- Scoring model failure → `F-SCORE-002` failover; final failure sets `scoring_error` status
- Knowledge document indexing failure → doc remains `is_indexed=false`; retry banner in `/kb`
- ICP with malformed criteria → validation at API boundary via Zod; UI inline errors
- Two-phase chunk swap race: new chunks inserted before old chunks deleted (per `04` §7.5); no retrieval gap
- Memory annotation of a memory row that has since been deleted → annotation orphan; nightly integrity job removes orphans
- Cross-workspace probe (via Tenancy Fuzzer) — build-blocking test per `03` §4.5

### 3.13 Dependencies + Success Metrics + Future Improvements

**Dependencies:**
- Postgres 16 + pgvector + citext + pg_trgm
- Model Router (architecture §7.1) — score-lead, embed-knowledge, embed-icp, embed-offer, classify-reply capabilities
- Browserless (indirect — Website Intelligence primitive spawns audits)
- Enrichment provider (INT-007) — MVP: minimal domain-based enrichment; extended in Phase 2
- Agency Event Bus (Inngest)

**Success Metrics:**
- **Time from `lead.ingested` → `lead.scored`** (target: P95 < 60s; NFR-PERF-006)
- **Lead-to-Meeting funnel per week** (source metric for FR-DASH-005 and Vision §11.4 Flywheel Cycle Time)
- **% of leads with an ICP match ≥ 60** (health of ICP configuration; low % → nudge to review ICP)
- **AI Memory hit rate** (retrieval returns ≥ K hits with similarity ≥ threshold; low → warmup content missing)
- **Company resolution rate** (auto-linked / total ingested; target: ≥ 70% per ASM-DB-007)
- **Score explainability click-through** (proxy for trust in the score)

**Future improvements (deferred):**
- FR-CNT-006 custom fields (P1)
- FR-CNT-008 bulk export (P1)
- FR-CNT-010 saved segments (P1)
- FR-CNT-011 relationship graph visualization (P2)
- FR-WSI-005 business signals (P1)
- FR-WSI-008 continuous monitoring (P1)
- Company-level relationship profile as stored table (Phase 2) — currently a view per `04` §4.3 note
- Agent-attributed memory writes (Phase 3+) — the column exists; the agents don't yet
- Full KB module with folders + search + rich-text per FR-KB (Phase 3) — v0.1 ships the narrow docs surface only

**Future AI Agents** (all Phase 3+; primitives already exist in `03` §7.6; **no v0.1 MVP functionality**):

- **Lead Research Agent** (per Vision §4.6, Assist tier at launch) — enriches new leads beyond the base pipeline, resolves ambiguous Company Suggestions autonomously within a policy envelope (auto-link only above a workspace-configured confidence threshold), suggests ICP tuning based on top-of-queue conversion patterns. Subscribes to `lead.ingested`, `contact.linked_to_company`; envelope: per-lead cost cap, no external API writes, read-only on production data outside its scope.
- **Data Steward Agent** (Assist → Automate tier progression) — proactively deduplicates contacts and companies, merges obvious duplicates (Automate tier only, always reversible), flags stale KB documents, prunes low-signal memory. Writes via LIE service surface only, always with reversibility flag set.
- **Memory Curator Agent** (Assist tier) — annotates memory entries as `always_apply` / `never_apply` based on observed correction patterns (`outreach.draft.rejected` signals), escalates contradictions between KB documents, drafts memory-retention recommendations. Writes only to `memory_annotations`.
- **ICP Tuner Agent** (Assist tier) — analyzes which fit-signals actually predicted `deal.won` in the workspace's history and recommends ICP criteria + weight adjustments; never edits ICPs autonomously.

---

## 4. Module 3 — AI Website Auditor

### 4.1 Purpose

Provide the product surface for running, browsing, and interpreting Website Intelligence audits — plus the Loom Script Generator that turns an audit into a talking-points script.

### 4.2 Business Value

- Vision Principle 12 (Websites as living systems) — this is the product face of the principle.
- Vision §10 (vertical data moat) — every audit compounds the dataset of what actually converts in the workspace's niche.

### 4.3 Primary User Story

> As an owner reviewing a Gold Lead, I paste their website URL, get a graded audit with prioritized fixes and a 90-second Loom script within two minutes, and attach both to the lead so my personalized outreach cites specific problems on their site.

### 4.4 Requirements Coverage

- **FR-WSI-001, 002, 003, 004** — audit categories, grades + prioritized findings, schedulable re-runs (structural in v0.1; scheduler wired but re-runs manual), attachability to entities
- **FR-LOOM-001, 002** — Loom script generation + word-count constraint
- **AI-XPL-002** — findings cite the specific page element / metric
- **NFR-PERF-006** — audit completes P95 < 90s with streamed progress
- **Explicitly excluded from MVP** (per PRD §10.3, §10.5): FR-WSI-005 business signals, FR-WSI-006 branded PDF export, FR-WSI-007 video walkthrough (covered by FR-LOOM instead), FR-WSI-008 continuous monitoring, FR-LOOM-003 hook variants, FR-LOOM-004 teleprompter view

### 4.5 Inputs

- URL to audit (user paste)
- Optional attachment target: contact / lead / company / deal / standalone
- Optional depth (single-page in v0.1; multi-page = Phase 2)
- `website.audit.requested` event emitted by Module 2 on lead scoring

### 4.6 Outputs

- `audits` row with overall grade + `category_grades`
- `audit_findings` rows (typically 5–15 per audit)
- `audit_deltas` rows (when a prior audit for the same URL exists)
- Screenshot(s) in Supabase Storage `audits` bucket
- `loom_scripts` row (on demand)
- Emitted events (§4.11)

### 4.7 Workflow References

- `05` §7 — Website Audit flow
- `05` §14 — F-AUDIT-001 through 006

### 4.8 Database Tables

**Reads only in Module 3 (writes owned by Module 2's LIE layer):**
- `audits` (04 §6.1)
- `audit_findings` (04 §6.2)
- `audit_deltas` (04 §6.3)

**Owned (feature-role writable):**
- `loom_scripts` (04 §9.3)

### 4.9 Public Interface

```typescript
// From feature code (Module 3 UI actions)
function requestAudit(input: {
  url: string;
  attachTo?: { type: 'contact' | 'lead' | 'company' | 'deal'; id: string };
  auditConfig?: Partial<AuditConfig>;
}): Promise<{ auditId: string; status: 'pending' }>;

function getAudit(auditId: string): Promise<AuditFull>;
function listAudits(filters): Promise<AuditSummary[]>;
function getAuditDelta(prev: string, next: string): Promise<AuditDelta>;

function generateLoomScript(auditId: string, options: {
  toneVariant?: 'friendly' | 'professional' | 'bold';
  ctaVariant?: 'book_call' | 'reply_yes' | 'send_dm';
  contactId?: string;
  companyId?: string;
}): Promise<LoomScript>;
```

### 4.10 UI Components / Screens

- **`/audits`** — list of audits (workspace-scoped) with columns: URL, attached entity, overall grade, status, run date; filter by status + entity type
- **`/audits/new`** — run-audit dialog (from onboarding step 7 or ad-hoc)
- **`/audits/:id`** — audit detail:
  - Header: URL, run date, overall grade, category grade tiles
  - Findings list, grouped by category (cta / booking / mobile / trust / conversion / performance / seo / forms / brand / accessibility), sorted by severity
  - Each finding: title, severity pill, description, recommendation, evidence (selector, metric, screenshot bbox), confidence
  - Full-page screenshot (mobile + desktop toggle)
  - Delta panel (if prior audit exists): what improved / regressed since
  - Actions: "Generate Loom script", "Attach to lead", "Copy findings to outreach draft"
- **`/audits/:id/loom`** — Loom Script Generator surface: shows generated script, word count, regenerate button (tone + CTA variants). Copy-to-clipboard action.
- **Audit summary card** embedded in Lead/Contact/Company/Deal detail (from Module 2 / 5) linking to full audit detail

### 4.11 Events Emitted / Consumed

**Emitted:**
- `website.audit.requested` (v1) — from UI action (auto-triggered version is emitted by Module 2's scoring pipeline)
- `website.audit.completed` (v1)
- `website.audit.delta` (v1)
- `loom.script.generated` (v1) — [new; add to architecture §8.3 catalogue on next revision]

**Consumed:**
- `website.audit.requested` — the orchestrator subscribes to run the audit pipeline

### 4.12 Edge Cases + Failure States

- Malformed URL → validate at input; F-AUDIT-001
- Browserless timeout / site rejects headless → F-AUDIT-002 / F-AUDIT-003 → mark failed with clear reason + manual audit suggestion
- LLM structured-output mismatch → F-AUDIT-004 → retry with secondary provider
- Screenshot upload fails → F-AUDIT-005 → persist audit sans screenshot
- Cost cap exceeded → F-AUDIT-006 → gate audit, prompt top-up
- Re-audit of the same URL within 60 seconds → dedupe (return existing pending/running audit id)
- Audit finding count > 50 → cap findings at 50 and note truncation (very rare; indicates a poorly-configured site)
- Loom script exceeds 200 words → regenerate with tighter prompt; if second attempt exceeds, truncate + warn
- Audit for a URL whose company was later deleted → `audits.company_id` becomes NULL via ON DELETE SET NULL; audit remains browsable standalone

### 4.13 Dependencies + Success Metrics + Future Improvements

**Dependencies:**
- Browserless.io (or Playwright-on-Fly.io if escape hatch triggered)
- Model Router (capability `audit-website`, `generate-loom-script`)
- Supabase Storage (screenshots)
- Module 2's LIE layer (writes audit rows on our behalf via the AI Router; Module 3 UI dispatches, LIE persists)

**Success Metrics:**
- **Audit completion time P95** (target: < 90s per NFR-PERF-006)
- **Audit failure rate** (target: < 5% excluding user-error URLs)
- **Loom scripts generated per week** (Vision §11 flywheel: audits → outreach)
- **Findings-per-audit distribution** (median target: 8–12; consistent quality signal)
- **Attach rate**: % of audits attached to a lead/deal/company vs. standalone (target: > 80%; standalone audits are less flywheel-productive)

**Future improvements (deferred):**
- FR-WSI-005 business signals (Phase 3)
- FR-WSI-006 branded PDF export (Phase 3)
- FR-WSI-008 continuous scheduled monitoring (Phase 2) — cron infra already exists, UI to subscribe to a URL is what's deferred
- Multi-page crawl depth (Phase 2)
- FR-LOOM-003 hook variants A/B (Phase 3)
- FR-LOOM-004 teleprompter view (Phase 3)

**Future AI Agents** (Phase 3+; primitives already exist in `03` §7.6; **no v0.1 MVP functionality**):

- **Website Audit Agent** (per Vision §4.6, Assist → Automate tier progression) — proactively audits new prospects' websites without owner request, monitors subscribed URLs on the cadence enabled by Phase 2 continuous monitoring (FR-WSI-008), drafts regression alerts when a client's audit has slipped since last run. Subscribes to `lead.scored`, `contact.updated`, cron; envelope: per-day audit budget, blocked-domains list, business-hours only in Automate tier.
- **Loom Coach Agent** (Assist tier) — generates hook + CTA A/B variants (FR-LOOM-003) driven by reply-rate outcomes, suggests script edits when a specific hook underperforms within the workspace's ICP. Reads `loom_scripts` outcomes and `outreach_messages.sentiment` on messages that referenced a given script.
- **Audit Trend Analyst Agent** (Assist tier) — aggregates finding patterns across the workspace's audits ("70% of dental clinics in AU have a booking-CTA below the fold") and feeds insights back to the Sales CRM for use in proposal ROI narratives and outreach hooks.

---

## 5. Module 4 — AI Personalization

### 5.1 Purpose

Turn a scored lead + audit + relationship signals into a channel-appropriate, editable outreach draft — email, Instagram DM, or LinkedIn DM — grounded in the workspace's ICP, offers, and knowledge base. Track replies. Surface (read-only) the prompts driving the drafts.

### 5.2 Business Value

- Vision §11 Flywheel — this is the "outreach" edge; reply rate is measured here
- Vision Principle 2 (AI is a substrate, not a sidebar) — every draft is grounded in memory, cited, and reproducible
- Vision Principle 11 + 13 (Relationship Intelligence + Memory) — drafts read from and write to both

### 5.3 Primary User Story

> As an owner reviewing a Gold Lead with a completed audit, I click "Draft outreach," pick channel + tone, and get a personalized message in under 15 seconds that cites specific audit findings and matches my ICP-recommended offer — I edit, send via Gmail (or copy for DM), and a follow-up reminder is auto-created 3 days out.

### 5.4 Requirements Coverage

- **FR-OUT-001, 002, 003, 004** — cold email / IG DM / LinkedIn DM drafts, grounded, editable, tone control
- **FR-OUT-005** — sequences (structural; MVP UX is "draft next step" only)
- **FR-OUT-006** — send via Gmail integration (v0.1 constraint); DM channels are copy-to-clipboard
- **FR-OUT-007** — reply status tracking (Gmail path in v0.1)
- **FR-LOOM (attachment side)** — attach a Loom script generated in Module 3 to an outreach draft
- **AI-XPL-003** — drafts cite Relationship Profile fields + audit findings they used
- **AI-HITL-001, 002, 003** — every draft is human-approved; confidence + reasoning surfaced; inputs traceable
- **AI-PROV-001, 003** — Model Router used; no direct SDK imports
- **AI-MEM-001–006** — memory read/write on every draft
- **NFR-PERF-005, 006** — first token < 1.5s; complete < 15s single-step, < 90s multi-step
- **Explicitly excluded from MVP:** FR-OUT-010 (Automate-tier auto-send), FR-OUT-005 automated drip sequencing (structural only), FR-OUT-006 for Instantly/Smartlead/Lemlist (Phase 2)

### 5.5 Inputs

- Lead / Contact context (from Module 2)
- Selected channel (email / IG DM / LinkedIn DM)
- Selected tone (`friendly` / `professional` / `bold` / `casual`)
- Selected offer (defaulted from `outreach_queue_items.recommended_offer_id`, overrideable)
- Include-audit-summary toggle
- Include-Loom-script toggle
- Regenerate action inputs (change tone / offer / model)
- Gmail OAuth grant (from Module 1 via Settings)

### 5.6 Outputs

- `outreach_messages` rows (draft → sent → replied)
- Citations (which memory hits + audit findings + knowledge docs were referenced)
- Reply classification + sentiment (via Model Router `classify-reply`)
- Emitted events per §5.11
- Follow-up reminders auto-created on send (delegates to Module 5's reminder service)

### 5.7 Workflow References

- `05` §8 — Personalization + send flow
- `05` §9 — Reply handling
- `05` §14 — F-AI-DRAFT-001/002/003; F-SEND-001/002/003/004; F-REPLY-001/002/003

### 5.8 Database Tables

**Owned:**
- `outreach_messages` (04 §9.1)
- `outreach_sequences` (04 §9.2) — structural; single-step in v0.1 UX
- `outreach_sequence_enrollments` (04 §9.2) — structural
- Reads: `loom_scripts` (owned by Module 3)

**Reads only:**
- `prompt_library` (04 §18.3) — read-only viewer in Settings > AI
- `contacts`, `leads`, `companies`, `relationship_profiles`, `lead_scores`, `outreach_queue_items`, `audits`, `audit_findings`, `offers`, `icps`, `memory_vectors`, `knowledge_documents` (via Model Router `withMemory` retrieval)

### 5.9 Public Interface

```typescript
function draftOutreach(input: {
  leadId: string;
  channel: 'email' | 'ig_dm' | 'linkedin_dm';
  tone: 'friendly' | 'professional' | 'bold' | 'casual';
  offerId?: string;                 // defaults from Outreach Queue recommendation
  includeAuditSummary?: boolean;
  includeLoomScript?: boolean;
  loomScriptId?: string;
}): Promise<OutreachDraft>;

function regenerateOutreach(draftId: string, overrides): Promise<OutreachDraft>;

function sendOutreach(draftId: string): Promise<{ status: 'sent'; providerMessageId?: string }>;
function markAsSent(draftId: string): Promise<{ status: 'sent' }>;   // for IG/LinkedIn copy-paste path

function listOutreachHistory(filters: {
  contactId?: string; companyId?: string; leadId?: string; status?: OutreachStatus[];
  from?: string; to?: string;
}): Promise<OutreachMessage[]>;

// Prompt Library read-only (Settings > AI)
function listPromptLibrary(): Promise<PromptLibrarySummary[]>;
function getPromptResolutionChain(capability: string): Promise<{
  workspaceOverride?: PromptEntry;
  globalDefault?: PromptEntry;
  codeBaseline: PromptEntry;
  active: PromptEntry;
}>;
```

### 5.10 UI Components / Screens

- **Draft dialog** (opened from Lead / Contact / Outreach Queue / Dashboard)
  - Step 1: pick channel
  - Step 2: pick tone, offer (dropdown with recommended pre-selected), attachments (audit summary, Loom script)
  - Step 3: streamed generation → editable draft
- **Draft editor**
  - Editable subject (email only) + body
  - AI Trace panel (collapsible): model + provider + prompt id + version, memory citations (linked to Contact / Company / Audit / KB doc / ICP / Offer), confidence indicator, cost + latency
  - Actions: Regenerate (with variant dropdowns), Send (email) / Copy to clipboard + Mark as sent (DM), Discard
- **Send confirmation**
  - Preview final message
  - Confirm sender identity (which Gmail account, if multiple grants exist)
  - Post-send: auto-created 3-day follow-up reminder shown as confirmation toast (via Module 5's reminder service)
- **DM copy-paste mode**
  - Persistent nudge on Dashboard until user confirms "Marked as sent" per `05` §17 ASM-FLOW-004 + §20 Q2 (persistent nudge until confirmed)
- **`/outreach`** — outreach history browser
  - Filters: channel, status (draft/sent/replied/bounced/etc.), sentiment, contact, company, date range
  - Columns: recipient, subject/first line, sent date, status, sentiment
  - Click through to Contact detail with the specific outreach highlighted
- **Reply detail** (embedded in Contact timeline + `/outreach` detail)
  - Shows full thread; classification badge (positive/objection/neutral/negative/unsubscribe)
- **Settings > AI — Prompt Library viewer** (read-only per user selection this session)
  - `/settings/ai/prompts` — list prompts grouped by capability
  - Each row: capability name, active source (workspace / global / code), version, last-updated
  - Click to open a modal showing full template + system message + expected schema + resolution chain (workspace override → global default → code baseline)
  - No editing UI in v0.1
- **Settings > AI — Cost & usage**
  - Rolling monthly spend by capability + model
  - Budget cap indicator + warnings at 80%
  - Sourced from `ai_usage_daily` (04 §18.2)

### 5.11 Events Emitted / Consumed

**Emitted:**
- `outreach.draft.generated` (v1)
- `outreach.draft.rejected` (v1) — [new per `05` §20 Q4 approved recommendation; fires on 3+ regenerations without send or explicit discard]
- `outreach.sent` (v1)
- `outreach.reply.received` (v1) — from Gmail webhook route handler (or polling fallback per ASM-FLOW-001)
- `ai.output.produced` (v1) — emitted by Model Router for every AI call

**Consumed:**
- `outreach.queue.updated` — refreshes Draft dialog's recommended-offer default
- `outreach.reply.received` — feeds reply detail surface

### 5.12 Edge Cases + Failure States

- Regeneration with same inputs → different output allowed (temperature > 0); Regeneration counter tracked for `outreach.draft.rejected` heuristic
- Contact `unsubscribed=true` (from prior reply) → Draft dialog refuses to open; UI explains reason
- Gmail token expired mid-send → F-SEND-001 → reconnect prompt; draft preserved
- Gmail rate limit → F-SEND-002 → retry with backoff; if permanent, mark `failed` and surface
- Recipient email invalid → validated at input; F-SEND-003
- Provider outage mid-stream → partial content preserved as draft; F-AI-DRAFT-001 offers retry
- Zero memory retrieval hits (cold workspace, no KB, no ICP) → proceed with lower grounding; UI notes "limited context" per F-AI-DRAFT-003
- Reply arrives for a thread with no matching outbound → orphan reply per F-REPLY-002 → Unmatched review surface (link from `/outreach`)
- Reply classification failure → sentiment='neutral' fallback per F-REPLY-003
- Gmail Pub/Sub webhook signature invalid → F-REPLY-001 → 401 + log; polling fallback picks up eventually
- Very long thread (> 20 replies) → summarize prior context for classification; do not stream full thread into every classifier call
- IG/LinkedIn "Marked as sent" persistent nudge never dismissed → dashboard shows count; user can bulk-dismiss

### 5.13 Dependencies + Success Metrics + Future Improvements

**Dependencies:**
- Module 2 (memory + relationship + audit context)
- Module 3 (Loom script attachment)
- Model Router (capabilities `draft-outreach-<channel>`, `classify-reply`, `summarize-thread`)
- Gmail API (INT-001) + Gmail Pub/Sub for reply detection
- Agency Event Bus

**Success Metrics:**
- **Reply Rate** (positive replies / sent, rolling 30d) — FR-DASH-005; Vision §13.3 target > 8%
- **Time from Draft click → Send** (median target: < 2 min including edits)
- **Regenerations per accepted draft** (target: < 1.5; > 2.5 = prompt quality issue)
- **AI cost per sent message** (target: < $0.03)
- **DM "Marked as sent" confirmation rate** (target: > 90% within 24h — informs whether the copy-paste UX works)

**Future improvements (deferred):**
- Automated drip sequences with delays (Phase 2)
- FR-OUT-006 Instantly / Smartlead / Lemlist integrations (Phase 2)
- FR-OUT-010 Automate-tier auto-send with policy envelope (Year 2+)
- Prompt Library editor (Phase 2) — v0.1 is read-only per session decision
- Outreach engagement analytics (opens, click-tracking) beyond Gmail-native (Phase 2)

**Future AI Agents** (Phase 3+; primitives already exist in `03` §7.6; **no v0.1 MVP functionality**):

- **Outreach Agent** (per Vision §4.6, Phase 3 Assist → Year 2+ Automate tier) — drafts and queues outreach for Gold Leads without waiting for owner click; at Automate tier, sends within a policy envelope (max messages/day, tone rules, blocked domains, business-hours window). Subscribes to `outreach.queue.updated`, `outreach.draft.rejected` (to learn from rejections). Never sends outside the envelope; every send is reversible via retract-and-apology template.
- **Follow-up Agent** (per Vision §4.6, Phase 3 Assist → Phase 3 Automate tier) — subscribes to `outreach.reply.received`, drafts next-step responses per reply sentiment (positive → meeting suggestion, objection → objection-handling reply from KB, neutral → nurture drip), reschedules reminders based on new engagement patterns. Envelope: cannot send in response to `negative` or `unsubscribe` classifications.
- **Reply Triage Agent** (Assist tier) — classifies incoming replies beyond sentiment into intents (meeting-request, price question, brush-off, warm-handoff, referral) and routes to the appropriate downstream handler (Follow-up Agent, Meeting Prep Agent in Module 5, or human escalation). Provides confidence + escalation path on every route.
- **Personalization Coach Agent** (Assist tier) — analyzes which prompt variants + memory retrievals correlate with positive replies and drafts recommendations for the Prompt Library (which becomes editable in Phase 2). Never edits prompts autonomously; produces review-ready diffs only.

---

## 6. Module 5 — Sales CRM

### 6.1 Purpose

Own the sales pipeline (leads → deals → won), the proposal generation and status tracking, meeting logistics (booking links + manual meetings), the follow-up reminder system, and the Offers catalogue that both AI Personalization and Proposals draw from.

### 6.2 Business Value

- Vision §11 Flywheel (meetings → proposals → clients → case studies) — this module owns the middle-to-close arc
- Vision Principle 3 (Own the workflow, not just the data) — deal auto-creation on `meeting_booked`, follow-up reminders on send, proposal draft from AI

### 6.3 Primary User Story

> As an owner who had a discovery call this morning, I open the deal (auto-created when the meeting was booked), click "Generate proposal," pick the offer, review the AI-drafted proposal grounded in my audit + case studies, export as PDF, and send — the deal advances to `proposal_sent` and a follow-up reminder appears on my Dashboard in 3 days.

### 6.4 Requirements Coverage

- **FR-PIPE-001, 002, 003, 004, 006** — kanban + views + logging + stage automation
- **FR-SALES-001, 002, 003** — deals CRUD + views + auto-logging
- **FR-SALES-004, 005** — AI proposal generator + editor
- **FR-SALES-008** — PDF export
- **FR-CAL-001, 002, 003** — Google Calendar OAuth + booking link + booking → meeting record
- **FR-REM-001, 002, 003** — reminders CRUD (contact/lead/deal/company entities, per rev-2 enum extension)
- **FR-NOT-001, 002** — in-app + email notifications; category preferences (FR-NOT-004 Slack deferred)
- **New surfaces required by frozen `04` + `05`:**
  - Offers CRUD (`04` §10.6, `05` §3.4)
- **Explicitly excluded from MVP:** FR-SALES-006 (in-house e-signature — external tool used), FR-SALES-007 (engagement analytics), FR-SALES-009 (templates + variants), FR-CAL-004 (post-call auto-sequence), FR-CAL-005 (unified team calendar), FR-REM-004 (automation-created reminders — pipeline-stage automations do create reminders, but full automation rules engine is Phase 2), FR-NOT-004 (Slack)

### 6.5 Inputs

- Pipeline configuration (stages jsonb)
- Manual deal creation + edit
- Meeting log (manual or via calendar sync)
- Prospect booking via booking link (external, unauthenticated form)
- Offer definitions (name, pricing, deliverables, guarantees, ROI)
- Discovery call notes (paste)
- User actions: draft proposal, edit sections, send, mark viewed/signed, mark won/lost, snooze reminder, complete reminder

### 6.6 Outputs

- `deals` rows + stage transitions logged to `action_log`
- `proposals` rows with `offer_snapshot` at send time
- `meetings` rows
- `booking_links` config
- `calendar_connections` state
- `reminders` (pending / snoozed / completed)
- `offers` rows (triggering LIE indexing to memory_vectors)
- PDF artifact in Supabase Storage `proposals` bucket
- Notifications delivered via cross-cutting Notifications surface
- Emitted events per §6.11

### 6.7 Workflow References

- `05` §3.4 — Offer editor (onboarding)
- `05` §10 — Meeting flow (booking link + manual log)
- `05` §11 — Proposal flow (discovery → draft → send → sign → won)
- `05` §14 — F-CAL-001/002/003; F-PROP-001/002/003/004/005

### 6.8 Database Tables

**Owned:**
- `pipelines` (04 §10.1)
- `deals` (04 §10.2)
- `deal_contacts` (04 §10.3)
- `proposals` (04 §10.4)
- `meetings` (04 §10.5)
- `booking_links` (04 §11.1)
- `calendar_connections` (04 §11.2) — shared write ownership with Module 1's Settings surface; primary owner Module 5 for meeting-related grants
- `reminders` (04 §12)
- `offers` (04 §10.6)

**Reads only:**
- `contacts`, `companies`, `leads`, `lead_scores`, `audits`, `audit_findings`, `icps`, `knowledge_documents`, `memory_vectors`, `outreach_messages`

### 6.9 Public Interface

```typescript
// Pipeline
function listPipelines(): Promise<Pipeline[]>;
function upsertPipeline(input): Promise<Pipeline>;

// Deals
function createDeal(input): Promise<Deal>;                 // auto-called on lead → meeting_booked
function updateDealStage(dealId, stageKey): Promise<Deal>;
function markDealWon(dealId, closeValue): Promise<Deal>;
function markDealLost(dealId, reason): Promise<Deal>;
function listDealsForPipeline(pipelineId, filters): Promise<Deal[]>;

// Proposals
function generateProposal(input: {
  dealId: string;
  offerId: string;
  discoveryNotes?: string;
  includeAuditSummary?: boolean;
  toneOverride?: string;
}): Promise<Proposal>;                                     // status='draft', offer_version snapshot at read time
function updateProposal(proposalId, patch): Promise<Proposal>;
function sendProposal(proposalId): Promise<Proposal>;      // captures offer_snapshot; UPDATE status='sent'
function markProposalViewed(proposalId): Promise<Proposal>;
function markProposalSigned(proposalId): Promise<Proposal>;
function exportProposalPdf(proposalId): Promise<{ storagePath: string; signedUrl: string }>;

// Meetings
function logMeeting(input): Promise<Meeting>;
function completeMeeting(meetingId, notes?): Promise<Meeting>;

// Booking Links
function upsertBookingLink(input): Promise<BookingLink>;
function getBookingLinkPublic(workspaceSlug, linkSlug): Promise<BookingLinkPublic>;
function bookViaLink(input): Promise<{ meetingId: string; confirmationSent: boolean }>;

// Offers
function upsertOffer(input): Promise<Offer>;
function listActiveOffers(filters): Promise<Offer[]>;
function retireOffer(offerId): Promise<void>;

// Reminders
function createReminder(input): Promise<Reminder>;
function completeReminder(reminderId): Promise<Reminder>;
function snoozeReminder(reminderId, until): Promise<Reminder>;
function listRemindersDue(): Promise<Reminder[]>;         // powers FR-DASH-002
```

### 6.10 UI Components / Screens

**Pipeline + Deals**
- **`/pipeline`** — kanban of active pipeline: stages as columns, deal cards with value, owner, primary contact, days-in-stage
- **`/pipeline?view=list`** — list view with sort/filter
- **`/pipeline?view=forecast`** — forecast view (sum by expected close date)
- **`/deals/:id`** — deal detail:
  - Header: name, value, currency, stage, owner, expected close, offer (from `offer_id`)
  - Left: contacts (from `deal_contacts`), company (from `companies`), attached audit
  - Center: activity timeline (meetings, outreach, notes, stage changes)
  - Right: Next Action panel (draft proposal, log meeting, add reminder, mark won/lost)
- **Stage change** — drag or keyboard reorder; logged to `action_log`; automation triggers evaluated

**Pipeline stage automations (FR-PIPE-006 — narrow scope in v0.1)**
- **`/settings/pipelines/:id/automations`** — per-stage: on-enter → notify owner, create reminder (N days out). Extended automation (Phase 2) uses full FR-AUTO rule engine.

**Proposals**
- Proposal generation dialog (from deal detail): offer picker, include-audit toggle, discovery notes textarea, tone
- **`/proposals/:id/edit`** — rich-text editor (tiptap) with section navigation:
  - Cover, Understanding, Solution, Deliverables, Investment, Guarantees, ROI, Terms
  - Per-section regenerate action
  - Preview mode (rendered as client will see it)
  - AI Trace panel (same as Module 4)
- **Send dialog** — export PDF + copy email template; snapshots offer at click time; UPDATE proposals SET status='sent'
- **Proposal status tile** on deal detail: draft / sent / viewed / signed / declined / expired with timestamps
- **PDF viewer** — served via Supabase Storage signed URL

**Meetings + Calendar**
- **`/meetings`** — list of upcoming + past
- **Meeting detail modal** — title, scheduled_at, contact, deal, notes textarea, AI summary (if notes present)
- **`/settings/booking-links`** — list + create booking link
- **Booking link editor** — slug, title, duration, buffer, availability (weekly grid), active toggle
- **Public booking page** — `verocrest.app/book/<workspace-slug>/<link-slug>` (unauthenticated); prospect enters name + email (required) + phone (optional) + note; captures UTM silently
- **Calendar connect surface** — under `/settings/integrations` (cross-cutting); Google OAuth for Calendar

**Offers**
- **`/offers`** — list active + draft + paused + retired
- **`/offers/new`** and **`/offers/:id/edit`** — editor per `04` §10.6:
  - Name, slug, short description, positioning
  - Target ICP (dropdown), target company sizes (multi), target industries (multi)
  - Pricing model (fixed / tiered / retainer / performance / custom), price, currency, cadence
  - Deliverables (structured list editor)
  - Guarantees (structured list editor)
  - ROI narrative + metrics (structured)
  - Onboarding steps + requirements
- **Save actions:** "Save as Draft" (status='draft') and "Save & Activate" (status='active' → triggers `offer.upserted` → indexing)

**Reminders**
- Reminder creation from any entity (Contact, Lead, Deal, Company) — quick action
- Reminder complete / snooze (1d / 3d / 1w / custom) actions from Dashboard Follow-ups Due widget (Module 6) and from entity detail

### 6.11 Events Emitted / Consumed

**Emitted:**
- `deal.stage.changed` (v1)
- `deal.won` (v1)
- `deal.lost` (v1)
- `proposal.drafted` (v1)
- `proposal.sent` (v1)
- `proposal.viewed` (v1) — mostly Phase 2; MVP fires only on manual mark
- `proposal.signed` (v1) — MVP fires on manual mark or external e-sign webhook
- `proposal.declined` (v1) — [new; add to §8.3 catalogue on next revision]
- `meeting.booked` (v1)
- `meeting.completed` (v1)
- `reminder.created` (v1)
- `reminder.due` (v1) — emitted by scheduler; consumed by cross-cutting Notifications
- `reminder.completed` (v1)
- `offer.upserted` (v1) — [new in `05` §16]
- `offer.indexed` (v1) — emitted by LIE Knowledge Indexer after chunking + memory insertion

**Consumed:**
- `outreach.sent` — auto-create 3-day follow-up reminder (default)
- `outreach.reply.received` — if a pending reminder exists for the responding contact, mark completed
- `lead.status='meeting_booked'` (from Module 2's status transition) — auto-create Deal
- `deal.won` → flip `companies.is_client = true`, `contacts.is_client = true` (per `05` §11.3)

### 6.12 Edge Cases + Failure States

- Prospect books a slot that a concurrent booking just filled → F-CAL-002 → return "no longer available"; suggest alternative slots
- Google Calendar revoked externally → F-CAL-001 → booking page 503 + owner reconnect prompt
- Booking succeeds but external event creation fails → F-CAL-003 → retry job; if fails, owner manually adds
- Deal has no offer at proposal-generation time → F-PROP-004 → force offer selection; block generation if none exist
- Offer paused mid-flight (between deal creation and proposal send) → F-PROP-003 → warn owner; snapshot proceeds
- AI proposal draft malformed → F-PROP-001 → retry via secondary provider; fallback to blank template
- PDF export fails → F-PROP-002 → offer HTML export; retry PDF async
- Very large proposal (> 20k output tokens) → F-PROP-005 → section-by-section generation
- Reminder due for a deleted entity → mark reminder dismissed; log integrity issue
- Deal `won_at` set with `value = 0` → warn but allow (some deals are won pro-bono / referrals)
- Two proposals concurrently generated for the same deal → allow (versioning by created_at); latest one is the "active" reference for send
- Booking link with all-invalid availability windows → prospect sees "no times available"; owner warned
- Contact linked to multiple companies over time (job change) → v0.1: contact stays with current company; historical company inferred from timeline. Full support (contact-company history) is Phase 3

### 6.13 Dependencies + Success Metrics + Future Improvements

**Dependencies:**
- Google Calendar API (via `calendar_connections` OAuth)
- Model Router (capabilities `draft-proposal`, `summarize-meeting`)
- Supabase Storage (`proposals` bucket)
- Module 2 (memory retrieval + audit + offer context for proposal)
- Module 4 (AI Trace UI pattern)
- Cross-cutting Notifications

**Success Metrics:**
- **Meetings Booked** (per week) — FR-DASH-003; Vision §13.3 secondary metric; target 3× baseline within 6 months
- **Median time from `meeting_completed` → `proposal.sent`** (target: < 24h)
- **Proposal signed rate** (proposals signed / proposals sent)
- **Median deal cycle time** (lead.ingested → deal.won)
- **Reminder completion rate** (completed / created) — target > 80%; low rate = follow-up discipline issue
- **Offer attach rate** (deals with offer_id set / total deals) — target > 90% by MVP acceptance

**Future improvements (deferred):**
- FR-SALES-006 in-house e-signature (Phase 2)
- FR-SALES-007 proposal engagement analytics (opens, section reads) (Phase 2)
- FR-SALES-009 proposal templates + variants (Phase 2)
- FR-CAL-004 post-call auto-sequence (Phase 2)
- FR-CAL-005 unified team calendar view (Phase 2)
- Full FR-AUTO-* rules engine (Phase 2)
- FR-NOT-004 Slack (Phase 2)
- FR-FIN-* invoicing + payments (Phase 2)
- FR-PORTAL-* Client Portal (Phase 2) — the `is_client` flip on `deal.won` (per `05` §11.3) is the hook Phase 2 subscribes to

**Future AI Agents** (primitives already exist in `03` §7.6; **no v0.1 MVP functionality**):

- **Proposal Agent** (per Vision §4.6, **first agent to ship — Phase 2** as an extension of FR-SALES-004, Assist tier at launch) — takes discovery notes + audit + selected offer → produces a review-ready proposal, drafts objection-handling appendices sourced from KB, updates ROI projections from current audit trend data. Envelope: cannot send; only drafts. Consumes `meeting.completed` events to auto-queue proposal drafts on discovery calls.
- **Deal Health Agent** (Phase 3, Assist tier) — monitors deal velocity, days-in-stage, communication cadence; flags at-risk deals; drafts owner nudge messages ("this deal hasn't moved in 12 days — here's a save-message that might help"). Reads across `deals`, `outreach_messages`, `meetings`, `activity_timeline`. Envelope: notifications-only, no autonomous outreach.
- **Meeting Prep Agent** (Phase 3, Assist tier) — 30 minutes before every scheduled meeting, produces a briefing: contact + company context, prior audit summary, recent outreach + reply thread, recommended offer, likely objections from KB. Delivered via cross-cutting Notifications surface (§8.2). Never writes to `meetings.notes` — output is briefing-only.
- **Client Success Agent** (per Vision §4.6, Phase 3+, Assist tier) — activates on `deal.won`; monitors post-signature engagement (Phase 2 Client Portal is the substrate); drafts check-in messages, upsell signals, retention nudges. Envelope: only companies with `is_client=true`; blocked from touching prospects.
- **Offer Optimizer Agent** (Phase 3, Assist tier) — analyzes which offers close at what rate against which ICPs, drafts recommendations for offer positioning + pricing tests (never edits offers autonomously). Reads `deals` + `proposals` + `offers` outcomes; produces review-ready recommendations only.
- **Pipeline Automation Agent** (Phase 3, Assist → Automate tier) — the eventual home of FR-AUTO's advanced rules engine reformulated as an agent: infers useful stage-triggered automations from workspace patterns, drafts automation configurations for owner approval, later (Automate tier) manages the rule set within a policy envelope.

---

## 7. Module 6 — Dashboard

### 7.1 Purpose

Surface the six named widgets — Today's Gold Leads, Follow-ups Due, Upcoming Meetings, Pipeline Value, Reply Rate, Revenue Target — plus the Flywheel Cycle Time metric, in a fast, keyboard-navigable view that is the founder's daily starting point.

### 7.2 Business Value

- Vision §11 Flywheel (single-glance visibility of the flywheel state)
- Vision Principle 5 (Fast beats featureful — sub-100ms perceived interaction)
- Vision Principle 10 (Founder must use it daily — Dashboard is the daily surface)
- PRD §10.4 MVP acceptance test — the Dashboard is where the founder sees the acquisition workflow succeed end-to-end

### 7.3 Primary User Story

> As the owner opening my laptop at 9am, I sign in, see six widgets that tell me exactly who to contact today, what follow-ups are overdue, my week's meetings, my open pipeline value, my reply rate trend, and how far I am from my revenue target — I click a Gold Lead and I'm in flow within 30 seconds.

### 7.4 Requirements Coverage

- **FR-DASH-001** through **FR-DASH-006** — six named widgets
- **FR-RPT-001, 002, 003** — dashboard surface + filters + CSV/PDF export
- **FR-RPT-007** — Flywheel Cycle Time as first-class metric
- **NFR-PERF-001, 004, 007** — read latency, perceived instantaneity, no-round-trip drag
- **Explicitly excluded from MVP:** FR-DASH-007 export from widgets (P1), FR-DASH-008 per-user customization (P1), FR-RPT-004 scheduled reports (Phase 2), FR-RPT-005 client-facing reports (Phase 2), FR-RPT-006 custom report builder (Phase 3)

### 7.5 Inputs

- Session context (workspace + user) from Module 1
- Denormalized data from `dashboard_metrics_daily` and `outreach_queue_items` (fast reads)
- Filters (date range, owner, source) applied client-side over pre-loaded windows
- Onboarding progress from Module 1 (if < 100%, show checklist instead)

### 7.6 Outputs

- Rendered widget states
- Filter state persisted per user (`localStorage`)
- Click-through navigation to other modules
- CSV export (FR-RPT-003)
- PDF export (FR-RPT-003; leverages a print stylesheet in v0.1, not a rendered PDF endpoint)

### 7.7 Workflow References

- `05` §4 — Daily use — Owner
- `05` §5 — Daily use — Member (same as Owner in v0.1)
- `05` §14 — F-DASH-001 (stale denorm), F-DASH-002 (empty state)

### 7.8 Database Tables

**Reads only (heavy):**
- `dashboard_metrics_daily` (04 §13.1) — powers Reply Rate, Revenue Target, Pipeline Value, Meetings Booked history
- `workspace_targets` (04 §13.2) — powers Revenue Target
- `outreach_queue_items` (04 §8.1) — powers Today's Gold Leads
- `reminders` (04 §12) — powers Follow-ups Due
- `meetings` (04 §10.5) — powers Upcoming Meetings
- `deals` (04 §10.2) — powers Pipeline Value real-time refresh

**Consumed events for realtime updates** (via Supabase Realtime subscription):
- `outreach.queue.updated` → refresh Gold Leads
- `reminder.created / .completed / .due` → refresh Follow-ups Due
- `meeting.booked / .completed` → refresh Upcoming Meetings
- `deal.stage.changed / .won / .lost` → refresh Pipeline Value + Revenue Target
- `outreach.sent / .reply.received` → refresh Reply Rate

**Owned:**
- Widget order + visibility per user (deferred to FR-DASH-008, Phase 2) — v0.1 has fixed widget order

### 7.9 Public Interface

Dashboard is a consumer, not a producer. It exposes:

```typescript
function getDashboardSnapshot(filters: {
  from: string; to: string;
  ownerUserId?: string;
  currency?: string;
}): Promise<{
  goldLeads: OutreachQueueItem[];
  followupsDue: Reminder[];
  upcomingMeetings: Meeting[];
  pipelineValue: { byStage: Record<string, number>; totalOpen: number; currency: string };
  replyRate: { rolling30d: number; delta: number };
  revenueTarget: { period: 'monthly' | 'quarterly'; target: number; actual: number; pace: 'ahead' | 'on_track' | 'behind'; currency: string };
  flywheelCycleTime: { medianDays: number; sample: number };
}>;

function exportDashboardCsv(section: DashboardSection, filters): Promise<string>;
```

### 7.10 UI Components / Screens

- **`/`** (workspace root) — Dashboard home
  - If onboarding < 100% → render Onboarding Checklist (from Module 1) instead
  - Else → render six widgets in fixed order:
    1. Today's Gold Leads (top 5 by opportunity_score, readiness='ready', no outreach in last 7d)
    2. Follow-ups Due (reminders due today or overdue; one-click complete / snooze)
    3. Upcoming Meetings (next 7 days; linked deal value + stage inline)
    4. Pipeline Value (sum of open deal values by stage; filter by owner + date range)
    5. Reply Rate (rolling 30d; delta vs prior 30d)
    6. Revenue Target (monthly + quarterly; progress bar + pace indicator)
- **Flywheel Cycle Time** tile — displayed below the six widgets or in a dedicated "Health" strip
- **Filter bar** at top — date range, owner (self-only when non-owner), currency (defaults to workspace default)
- **Keyboard shortcuts** — `g`, `f`, `m`, `p`, `r`, `t` to jump to widgets; `enter` opens the highlighted item; per Vision Principle 5 + NFR-PERF-004
- **Empty states per widget** — instructive nudges (F-DASH-002) linking back to the workflow that produces the data
- **Data-age indicator** — subtle "Updated <n>s ago" per widget; force-refresh action (F-DASH-001)
- **Export** — top-right menu: "Export CSV" (per widget) and "Export PDF (print)" (whole dashboard)

### 7.11 Events Emitted / Consumed

**Emitted:**
- None (reads only)

**Consumed:**
- All events listed in §7.8 for realtime refresh

### 7.12 Edge Cases + Failure States

- Denorm lag > 60s → data-age banner + force-refresh (F-DASH-001)
- Empty workspace (no leads yet) → widgets render nudge states, not zeros (F-DASH-002)
- Filter produces zero results → widget-specific empty message
- Realtime subscription drops → automatic reconnect via Supabase Realtime; fallback to poll every 30s until subscription recovers
- Multi-currency deals with no default set → group by currency; widget explains why aggregation isn't done
- Revenue Target undefined for the current period → widget shows "Set target" CTA
- Widget content overflows viewport → each widget scrolls internally; page scroll never engages within a widget
- User signs in on the day their workspace crosses onboarding = 100% → Dashboard swaps in real-time from checklist to widgets

### 7.13 Dependencies + Success Metrics + Future Improvements

**Dependencies:**
- All other five modules (Dashboard consumes their data)
- Supabase Realtime
- `dashboard_metrics_daily` refresh worker (Inngest nightly + on-event)

**Success Metrics:**
- **Dashboard TTI** (target: < 1s cold, < 100ms warm; NFR-PERF-001, 004)
- **% of daily sessions where Dashboard is the first surface loaded** (target: > 90%)
- **Median time on Dashboard before first click-through** (target: 15–45s; too long = signal isn't clear enough)
- **Widget interaction distribution** — informs whether all six widgets earn their place; a widget with < 5% interaction is a candidate for demotion in Phase 2

**Future improvements (deferred):**
- FR-DASH-007 per-widget CSV export (P1)
- FR-DASH-008 per-user widget order + visibility customization (P1)
- FR-RPT-004 scheduled email dashboard digest (Phase 2)
- FR-RPT-005 client-facing performance reports (Phase 2)
- FR-RPT-006 custom report builder (Phase 3)
- Widget on Flywheel Cycle Time trend chart (Phase 2 — v0.1 shows the number, not the trend)

**Future AI Agents** (Phase 3+; primitives already exist in `03` §7.6; **no v0.1 MVP functionality**):

- **Executive Dashboard Agent** (per user's list, Phase 3, Assist tier) — narrates the daily dashboard state in plain language ("You have 5 Gold Leads today, 2 in AU dental, 3 in coaches. Reply rate is up 12% week-over-week. You are on pace for revenue target — $18K to go with 9 days left"), generates weekly + monthly written briefings, surfaces anomalies (widget delta beyond expected variance) via Notifications. Consumes all major business events; writes only to `notifications`.
- **Insights Agent** (Phase 3, Assist tier) — proactively surfaces patterns invisible from single-widget reads: cohort analyses (which ICP is converting fastest), correlation signals (which KB doc drives the highest reply rate), Flywheel bottleneck detection (which edge of the Vision §11 loop is slowest this month). Drafts summary reports and posts to `/notifications` for owner review. Never edits denormalization tables.
- **Anomaly Detector Agent** (Phase 3, Assist tier) — watches `dashboard_metrics_daily` for statistically unusual swings (reply rate collapse, meeting-booked spike, pipeline-value drop) and drafts owner alerts with likely-cause hypotheses drawn from Memory + recent Action Log entries.

---

## 8. Cross-Cutting Concerns

Surfaces that touch multiple modules but do not belong to any single one. Enumerated here so nothing falls through the cracks.

### 8.1 Settings Shell

- **`/settings`** — settings landing with categories:
  - **Profile** (Module 1) — name, timezone override, avatar
  - **Security** (Module 1) — password change, connected accounts
  - **Workspace** (Module 1) — name, timezone, default currency, brand assets
  - **Integrations** (cross-module) — Google (Gmail + Calendar), Resend domain, Browserless, Anthropic + OpenAI keys (masked); manage `integration_connections` (04 §19). Owner-only writes; members read where they own a connection (Gmail).
  - **AI** (Module 4) — cost + budget view; Prompt Library read-only viewer (per user selection this session)
  - **ICPs** (Module 2 surface, linked from Settings for discoverability)
  - **Offers** (Module 5 surface, linked from Settings for discoverability)
  - **Knowledge Base** (Module 2 surface, linked from Settings)
  - **Pipelines** (Module 5 surface, linked from Settings)
  - **Booking Links** (Module 5 surface, linked from Settings)
  - **Notifications** — per-category in-app + email + digest frequency (FR-NOT-002; `notification_preferences` 04 §14.1)
  - **AI Usage** — cost dashboard (`ai_usage_daily` 04 §18.2)
  - **Data** — workspace revenue target editor (Module 6 owns visualization); workspace hard-delete (owner-only; deferred UI per PRD §10.6)

FR-SET-001, FR-SET-002, FR-SET-003 covered here.

### 8.2 Notifications system

- Cross-cutting; primary rendering owned by a shared header bell + `/notifications` page
- Consumes: `reminder.due`, `outreach.reply.received`, `proposal.signed`, `deal.won`, `agent.escalation` (structural; no producers in v0.1), `system` (release notes, etc.)
- Delivered via: in-app (always), email (subject to `notification_preferences`)
- Slack deferred to Phase 2 (FR-NOT-004)
- Every notification row (04 §14) has `emitted_via` recording which channels succeeded

### 8.3 Action Log surface

- Cross-cutting audit trail (04 §15)
- Read surface: `/settings/audit` (owner-only)
- Shows recent 100 actions with filters (actor, action_type, subject) per NFR-SEC-010
- Row-level tamper-evidence via checksum chain per `04` §15; integrity re-verification is a nightly worker, not a UI action
- Every writing module MUST log to `action_log`; enforced at the repository layer

### 8.4 Realtime subscriptions

- Supabase Realtime powers: Dashboard widget refresh (§7.11), Contact detail activity timeline refresh, Pipeline drag-updates broadcast
- Per-workspace channel: `workspace:<workspace_id>:changes`
- Subscription lifecycle managed at the app-shell level, not per-widget, to avoid churn

### 8.5 Command palette

- Not a required MVP module per PRD, but Vision Principle 5 (Fast beats featureful) and Vision reference apps (Linear, Raycast) argue for a `Cmd-K` command palette in v0.1
- Actions available: navigate to any workspace surface, quick-add contact / lead / reminder, search contacts + companies + deals, jump to a Gold Lead
- Owned by a shared shell (not a module); implementation deferred to `07_UI_UX_System.md`

---

## 9. Deferred Modules (enumerated only)

Per PRD §10.5, the following modules exist in the roadmap but are **not designed in this document**. When their phase triggers fire, each gets its own module spec.

**Phase 2:**
- Client Portal (FR-PORTAL-*)
- Project Management + Tasks (FR-PROJ-*)
- Full Calendar (FR-CAL-004, 005 extension)
- Invoices + Payments (FR-FIN-*)
- Advanced Automation rules engine (FR-AUTO-004 + broader FR-AUTO-* rules)
- Continuous Website Monitoring (FR-WSI-008)
- Extended Reports (FR-RPT-004, 005)
- ESP integrations (Instantly, Smartlead, Lemlist)
- Proposal enhancements — in-house e-signature (FR-SALES-006), engagement analytics (FR-SALES-007), templates + variants (FR-SALES-009)
- Slack notifications (FR-NOT-004)
- Reminders automation (FR-REM-004 automation-created reminders extend the narrow v0.1 stage-automation surface)

**Phase 3:**
- Team Management + Custom Roles + MFA (FR-IDT-004, 009, 012; FR-WS-004)
- Knowledge Base full module (FR-KB-*) — v0.1 ships the narrow Knowledge Docs surface only, in Module 2
- AI Chat Assistant (FR-AI-CHAT-*)
- Specialized AI Agents (Lead Research, Website Audit, Outreach, Follow-up) at Assist tier (FR-AGT-006)
- Website Intelligence Business Signals (FR-WSI-005)
- Branded PDF audit exports (FR-WSI-006)
- Loom Script advanced (FR-LOOM-003, 004)
- Accounting integrations (FR-FIN-006)
- Data export tooling (DATA-005)
- Custom report builder (FR-RPT-006)

**Future SaaS (Act II):**
- Multi-tenant billing + subscriptions
- Public API + Webhooks
- Marketplace (FR-FUT-001)
- SSO / SAML (FR-IDT-010)
- Advanced Agent tiers (Automate + Autonomous per Vision §4.6)
- QA + Ops Agents (FR-AGT-007)
- Native mobile (FR-FUT-002)
- Multi-region residency
- SOC 2 audit (CMP-005)
- White-labeling (FR-FUT-003)

---

## 10. Cross-Module Dependency Map

```
Module 1 (Auth)
    │ provides session + workspace context to all
    │
    ├──> Module 2 (Lead Intelligence)
    │       │  emits: lead.ingested → .enriched → .scored, contact.updated,
    │       │         relationship.profile.recomputed, outreach.queue.updated,
    │       │         icp.upserted/.indexed, knowledge_doc.upserted/.indexed
    │       │  reads audits (owned surface by M3), offers (M5)
    │       │
    │       ├──> Module 3 (AI Website Auditor)
    │       │       emits: website.audit.requested/.completed/.delta, loom.script.generated
    │       │       reads memory + KB context via M2's LIE for audit prompts
    │       │
    │       ├──> Module 4 (AI Personalization)
    │       │       emits: outreach.draft.generated/.rejected, outreach.sent,
    │       │              outreach.reply.received (webhook-driven), ai.output.produced
    │       │       reads memory (M2), audit (M3), offer (M5), Loom script (M3)
    │       │
    │       └──> Module 5 (Sales CRM)
    │               emits: deal.stage.changed/.won/.lost, proposal.drafted/.sent/.viewed/.signed,
    │                      meeting.booked/.completed, reminder.created/.due/.completed,
    │                      offer.upserted (LIE then indexes)
    │               reads memory, audit, ICP, KB, contacts, companies, leads, lead_scores
    │
    └──> Module 6 (Dashboard) — consumer of ALL above
            emits: none; subscribes for realtime refresh
```

The Agency Event Bus (architecture §8) is the connective tissue. Direct cross-module calls are minimized; state changes flow via events wherever possible.

---

## 11. Interface Contracts Summary

Every module exposes a stable public interface (§X.9 of each module). Enforcement:

1. **Module-boundary ESLint rule** — `packages/domain-*` cannot import from another `packages/domain-*`. Cross-domain reads use query DTOs at the `apps/web` layer; cross-domain reactions use the Agency Event Bus.
2. **Zod validation** at every public function boundary — inputs and outputs are schema-checked.
3. **Interface stability** — breaking changes require an event-schema version bump (Bus) or a module-version change (function signature). Cross-module callers pin to a signature; upgrades are explicit.
4. **Test contract** — every module ships contract tests that its consumers can run to verify integration expectations before deploying.

---

## 12. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | Module 2 (Lead Intelligence) owns the ICPs, KB Documents, Companies, Contacts, Leads, LIE substrate, Website Intelligence primitive, AI Memory | These are all consumed together as the LIE subsystem; single ownership avoids fragmented state |
| 2026-07-01 | Module 3 owns the *product surface* for audits; Module 2's LIE owns the *writer* | Preserves LIE write-lock per `04` §21.3; UI dispatches events, LIE persists |
| 2026-07-01 | Loom Script generation lives in Module 3 (audit-driven); attachment to outreach lives in Module 4 | Follows the natural data ownership: script is a projection of an audit; its use is an outreach concern |
| 2026-07-01 | Offers management surface lives in Module 5 (Sales CRM) | Offers are sales primitives (linked to deals + proposals); vectorization happens in LIE but ownership stays with Sales |
| 2026-07-01 | Prompt Library gets a **read-only** viewer under Settings > AI in v0.1 (per user selection this session) | Editing UI is Phase 2; v0.1 prompts are managed via seed scripts + admin |
| 2026-07-01 | Onboarding checklist lives in Module 1 as the first-session product surface | It is auth-adjacent (post-signup) and touches every subsequent module's state via presence probes |
| 2026-07-01 | Company Suggestions review UI ships in v0.1 (Module 2) | Required by `04` §4.6 async company resolution + `05` §20 Q6 (approved) |
| 2026-07-01 | Command palette (`Cmd-K`) is shell-owned, not a module | Cross-module search + navigation; not a discrete feature area |
| 2026-07-01 | Dashboard has a fixed widget order in v0.1 | FR-DASH-008 per-user customization is P1, deferred |
| 2026-07-01 | Pipeline stage automations in Module 5 are narrow (notify owner + create reminder); full FR-AUTO rule engine is Phase 2 | Matches PRD §10.5 phased scope |
| 2026-07-01 | Notifications is cross-cutting (§8.2), not owned by a single module | Multiple emitters; single delivery surface |
| 2026-07-01 | Action Log surface is cross-cutting (§8.3), read at Settings > Audit; every module writes to it via repository layer | Auditable trail with tamper-evidence, owner-only view |
| 2026-07-01 (rev) | Every module documents its **Future AI Agents** roadmap in its Future Improvements section | Keeps architecture aligned with Vision §4.6 AI Workforce endgame; agents plug into existing primitives (`03` §7.6) so scaffolding does not need retrofit. v0.1 MVP remains fully human-in-the-loop; agents are all Phase 3+ with the sole exception of the Proposal Agent (Phase 2, extends FR-SALES-004). |

---

## 13. Open Questions

None open at this time. The single gap identified pre-writing (Prompt Library UI scope) was resolved via user selection: **Read-only viewer**. All other surfaces cleanly trace to approved requirements or approved recommendations (via frozen `05`).

If a downstream document (`07` UI/UX, `08` Design System, `09` AI Architecture, ...) surfaces a genuine ambiguity that requires a new module-level decision, this section will be extended and re-approved.

---

## 14. Approval Gate

To move to `07_UI_UX_System.md`, the founder must sign off on:

1. **Six-module scope** as defined (§2–§7), including the ownership calls in §12.
2. **Module 2's ownership of ICPs, KB Documents, Companies, Contacts, Leads, LIE substrate, Website Intelligence primitive, and AI Memory** as one cohesive module.
3. **Module 3 owns the audit product surface; LIE owns the audit writer** (per §12 decision, matches `04` §21.3 write-lock).
4. **Loom Script generation in Module 3; attachment/use in Module 4.**
5. **Offers management in Module 5; vectorization by LIE.**
6. **Prompt Library read-only viewer in Settings > AI (Module 4)** in v0.1 (per user selection).
7. **Onboarding checklist as a Module 1 first-session surface.**
8. **Company Suggestions review ships in v0.1** (Module 2).
9. **Fixed widget order on Dashboard in v0.1** (FR-DASH-008 deferred to Phase 2).
10. **Cross-cutting Settings shell, Notifications, Action Log surface** as designed in §8.
11. **New events surfaced in §16 of `05` and referenced here** (`icp.upserted/.indexed`, `offer.upserted/.indexed`, `knowledge_doc.upserted/.indexed`, `integration.google.connected`, `target.set`, `workspace.onboarded`, `outreach.draft.rejected`, `contact.linked_to_company`, `loom.script.generated`, `proposal.declined`) will be added to architecture §8.3 event catalogue in the next revision of `03_System_Architecture.md`.
12. **All Phase 2 / Phase 3 / Future SaaS modules** are explicitly deferred (§9); their FR IDs remain valid but no design is produced in v0.1.

Once signed off, `07_UI_UX_System.md` will produce the UX system: information architecture, navigation model, screen taxonomy, interaction patterns, motion, accessibility, keyboard shortcuts, empty states, and error patterns — all conforming to the module specs above.

---

*End of 06_Feature_Modules.md*

---

**Should I continue to the next blueprint document (`07_UI_UX_System.md`)?**

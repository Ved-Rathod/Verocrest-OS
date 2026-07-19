# Blueprint Amendments Register

**Purpose:** Documents 01–12 are frozen. This register is the *only* sanctioned mechanism for
changing them (per `01_Vision.md` §17 change control). Every amendment records: the trigger,
the decision, the exact changes, the documents touched, and the downstream consequences.
An amendment is binding once its status is **Approved**; the affected documents are edited
in place with an `AMENDED (Amendment NNN)` marker pointing back here.

**Process:**
1. A contradiction or gap is discovered during implementation → work STOPS.
2. Options + recommendation are presented to the founder.
3. Founder approves a resolution → it is recorded here as an amendment.
4. Affected blueprint documents are edited with amendment markers.
5. Implementation resumes against the amended blueprint.

---

## Amendment 001 — Lead columns + contact-required affirmation

| | |
|---|---|
| **Status** | Approved |
| **Date** | 2026-07-03 |
| **Approved by** | Founder |
| **Trigger** | Sprint 2.3 (Leads module) requirements specified fields not present on the frozen `leads` table, and an optional contact link contradicting frozen `contact_id NOT NULL`. Work stopped per protocol; founder resolved. |
| **Documents changed** | `04_Database_Design.md` (§5.1, §22, §30, header) |
| **Documents evaluated and NOT changed** | 01, 02, 03, 05–12 — see "Impact analysis" below |

### Decision 1 (approved option 1A) — Six new columns on `leads`

The following are now official columns of the `leads` table. They must be proper database
columns — **not** `custom_fields` entries (per `04` §1.5: filtered/sorted fields must be columns).

| Column | Type | Constraint |
|---|---|---|
| `priority` | `lead_priority_enum` (**new enum**: `low`, `medium`, `high`) | nullable (unset = no priority) |
| `estimated_value` | `numeric(18,4)` | nullable |
| `currency` | `char(3)` | nullable; `CHECK (currency ~ '^[A-Z]{3}$')` when present; required by app when `estimated_value` is set (money convention `04` §1.2) |
| `expected_close_date` | `date` | nullable |
| `notes` | `text` | nullable |
| `tags` | `text[]` | `NOT NULL DEFAULT '{}'` |

**New indexes** (workspace-first per `04` §23 convention):
- `idx_leads_ws_priority ON leads (workspace_id, priority) WHERE deleted_at IS NULL`
- `idx_leads_ws_tags ON leads USING gin (workspace_id, tags)`

**New enum registered in the catalogue (`04` §22):** `lead_priority_enum` — low, medium, high.
Append-only evolution rule applies.

**Rationale:** The founder requires manual prioritization and pipeline-forecast inputs at the
lead stage, before the Deals module exists. Value/close-date conceptually belong to `deals`
(frozen `04` §10.2), but the acquisition workflow needs early estimates on the lead itself.

**Downstream consequences (binding):**
- **Sprint 10 (Deals):** when a deal is auto-created from a lead (`05` §11.1), `estimated_value`,
  `currency`, and `expected_close_date` **seed** the new deal's `value`, `currency`, and
  `close_date_expected`. The deal becomes authoritative from that point; lead estimates are
  not back-synced.
- **Sprint 7 (LIE):** lead `priority` is a *manual* signal, distinct from the AI opportunity
  score. Both may coexist on lead surfaces; neither overwrites the other.
- Lead `notes`/`tags` are lead-scoped and do not replace contact-level notes/tags.

### Decision 2 (approved option 2A) — `contact_id` remains REQUIRED

The frozen design is **affirmed** (no schema change): every lead belongs to a contact
(`contact_id NOT NULL`, one active lead per contact, `company_id` denormalized from the
contact). Recorded here because the requirement was formally contested and resolved.

**Flow-level addition (binding on the Leads UI):** the lead-creation flow must allow
- selecting an existing contact, **or**
- creating a new contact inline (contact is created first, then the lead),

and the lead's company **derives automatically from the selected contact**.

This is consistent with frozen `05` §3.7 ("Quick Add Lead" creates contact + lead together);
no `05` text change is required.

### Impact analysis — why other documents are unchanged

- **01 (Vision), 03 (Architecture):** no principle or subsystem boundary touched; LIE contracts
  key off `contact_id`, which is unchanged.
- **02 (PRD):** FR-LEAD-001–010 do not enumerate lead columns; no requirement contradicted.
  The new fields are additive UX, covered by the existing CRUD requirement surface.
- **05 (User Flows):** manual lead entry already creates contact + lead together (§3.7);
  inline creation is an implementation of that flow, not a change to it.
- **06 (Feature Modules):** Module 2 owns leads; field lists there are illustrative, not
  exhaustive; ownership and interfaces unchanged.
- **07/08 (UX/Design):** new form fields use existing components and patterns.
- **09–12:** untouched (no AI, API-shape, integration, or infra semantics changed — the lead
  endpoints were already specified generically in `10` §6.3).

---

## Amendment 002 — Dedicated Leads surface + sidebar item

| | |
|---|---|
| **Status** | Approved (founder-directed via Sprint 2.3 instructions; flagged for ratification in the 2.3 report) |
| **Date** | 2026-07-03 |
| **Approved by** | Founder (explicit Sprint 2.3 requirements: leads list, lead detail page, sidebar connection) |
| **Trigger** | Frozen `06` §3.10 specified "no dedicated /leads route in v0.1" (leads surfaced as a filter over /contacts) and `07` §2.1's fixed 11-item sidebar has no Leads entry. The founder's Sprint 2.3 spec explicitly requires a dedicated Leads list, detail pages, and sidebar navigation. |
| **Documents changed** | `06_Feature_Modules.md` (§3.10), `07_UI_UX_System.md` (§2.1) |

### Decision

- Verocrest OS ships a **dedicated Leads surface**: `/leads` (list), `/leads/new`, `/leads/:id` (detail), `/leads/:id/edit`.
- The sidebar gains a **Leads** item, inserted after **Queue** (both are lead-centric surfaces), making the fixed primary order 12 items.
- The lead-as-contact data model is unchanged (Amendment 001, Decision 2); this amendment is routing/navigation only.

### Impact

- `06` §3.10's "lead list is a scoped filter over /contacts" is superseded; contact surfaces remain contact-centric, lead surfaces lead-centric.
- `07` §2.1 fixed order becomes: Dashboard, Queue, **Leads**, Contacts, Companies, Pipeline, Audits, Outreach, Meetings, KB, Offers, Settings.
- No schema, API-architecture, or LIE contract changes.

---

## Amendment 003 — Dedicated Reminders surface + sidebar item

| | |
|---|---|
| **Status** | Approved |
| **Date** | 2026-07-03 |
| **Approved by** | Founder (explicit Sprint 2.4 decision) |
| **Trigger** | Sprint 2.4 builds the Reminders module (roadmap SPRINT 4 item 7; `04` §12; `06` §6, FR-REM-001/002/003) as a self-contained vertical with list/detail/create/edit routes. But frozen `07` §2.1's fixed 12-item sidebar has no Reminders entry, and the blueprint's intended access paths — the Dashboard "Follow-ups Due" widget (`06` §7, Module 6, Sprint 12) and entity-detail "add reminder" quick actions — do not exist yet. With neither entry point built, `/reminders` would be unreachable from the UI. Work stopped per protocol; founder resolved. |
| **Documents changed** | `07_UI_UX_System.md` (§2.1) |
| **Documents evaluated and NOT changed** | 01–06, 08–12 — see "Impact analysis" below |

### Decision

- Verocrest OS ships a **dedicated Reminders surface**: `/reminders` (list), `/reminders/new`, `/reminders/:id` (detail), `/reminders/:id/edit`.
- The sidebar gains a **Reminders** item, inserted immediately **after Companies**, making the fixed primary order **13 items** — following the precedent set by Amendment 002 (Leads).
- The polymorphic reminder data model (`04` §12) is unchanged; this amendment is routing/navigation only.

### Rationale

The founder requires reminders to be a first-class, reachable surface now, without waiting for the Dashboard widget (Sprint 12) or cross-module entity quick-actions. Placement after Companies groups it with the daily-operator CRM cluster (Leads, Contacts, Companies). This is the same routing/navigation exception ratified for Leads in Amendment 002, applied to Reminders.

### Impact analysis

- **`07` §2.1** fixed order becomes: Dashboard, Queue, Leads, Contacts, Companies, **Reminders**, Pipeline, Audits, Outreach, Meetings, KB, Offers, Settings (13 items).
- **`06` §6 (Module 5 / reminders):** unchanged. Reminders CRUD/complete/snooze is implemented in the `domain-reminders` package (per BUILD_ROADMAP SPRINT 4 "Modules touched" + Sprint 1.1 scaffold), which physically separates the reminder surface from `domain-sales`; the feature ownership and service contract (`06` §6 `createReminder`/`completeReminder`/`snoozeReminder`/`listRemindersDue`) are honored. The Dashboard "Follow-ups Due" widget and entity quick-actions remain the blueprint's *additional* entry points, to be wired in their own sprints.
- **`04` §12:** schema used verbatim; no change. The `deal` value of `reminder_entity_enum` stays in the enum but is **not selectable in the v0.1 create UI** (Deals land Sprint 10) — a forward-compatible deferral, not a schema change.
- **No schema, API-architecture, AI, or LIE contract changes.** Reminder events (`reminder.created/.due/.completed`, `06` §6) and the due-sweep scheduler are Event-Bus/S5 concerns and are **not** pulled forward; the module ships without event emission or cron wiring.

---

## Amendment 004 — CRM Event Catalogue Expansion

| | |
|---|---|
| **Status** | Approved |
| **Date** | 2026-07-07 |
| **Approved by** | Founder |
| **Trigger** | Sprint 3.1 requires every successful Companies, Contacts, Leads, and Reminders mutation to persist exactly one domain event atomically. The frozen v0.1 catalogue did not define lifecycle events for every existing CRM write path. |
| **Documents changed** | `03_System_Architecture.md` (§8.3), `10_API_Architecture.md` (§11.1) |

### Decision

Expand the CRM event catalogue additively. Existing event names and payloads remain unchanged.
Every successful CRM mutation emits exactly one event in the same database transaction as
the entity mutation. The application constructs the typed envelope; a dedicated Postgres RPC
atomically persists the entity change and `event_journal` row. Database triggers and an ORM
are prohibited.

| Domain operation | Event | Payload shape (v1) |
|---|---|---|
| Company create | `company.created` | `{company_id}` |
| Company update | `company.updated` | `{company_id, changed_fields}` |
| Company archive | `company.archived` | `{company_id, archived_at}` |
| Company merge | `company.merged` | `{source_company_id, target_company_id}` |
| Contact create | `contact.created` | `{contact_id}` |
| Contact update | `contact.updated` (retained) | `{changed_fields}` |
| Contact archive | `contact.archived` | `{contact_id, archived_at}` |
| Lead create | `lead.ingested` (retained) | `{source, raw_data, dedupe_key}` |
| Lead update without status change | `lead.updated` | `{lead_id, changed_fields}` |
| Lead update with status change | `lead.status_changed` | `{lead_id, previous_status, next_status}` |
| Lead archive | `lead.archived` | `{lead_id, archived_at}` |
| Reminder create | `reminder.created` (retained) | `{reminder_id, entity_type, due_at}` |
| Reminder update | `reminder.updated` | `{reminder_id, changed_fields}` |
| Reminder complete | `reminder.completed` (retained) | `{reminder_id, completed_at}` |
| Reminder snooze | `reminder.snoozed` | `{reminder_id, snoozed_until}` |
| Reminder archive | `reminder.archived` | `{reminder_id, archived_at}` |

### Concurrency and compatibility rules

- Event schema version is `1` for every new event.
- `contact.updated`, `lead.ingested`, `reminder.created`, and `reminder.completed` retain their
  frozen names and payload contracts.
- A lead edit emits `lead.status_changed` instead of `lead.updated` when status changes; never both.
- Lead status comparison is protected by an optimistic expected-status condition inside the RPC,
  preventing a stale application read from producing an incorrect event.
- RPCs remain `SECURITY INVOKER`; workspace-scoped RLS remains the tenancy backstop.
- Inngest delivery, dispatch, reconciliation, and workers remain Sprint 3.2 scope.

### Impact

- `03` §8.3 gains the additive lifecycle events.
- `10` §11.1 maps current CRM mutations to exactly one event.
- `04` §16 `event_journal` schema is unchanged.
- No product workflow, UI, AI capability, or CRM schema is changed.

---

## Amendment 005 — `ai.output.produced` Emission Contract

| | |
|---|---|
| **Status** | Approved |
| **Date** | 2026-07-16 |
| **Approved by** | Founder |
| **Trigger** | Sprint 3.3 implements the Model Router, whose pipeline step 9 (`09` §2.3) logs to `ai_usage_events` and emits `ai.output.produced`. The event exists in the frozen catalogue (`03` §8.3) but was outside Amendment 004's CRM-only implemented set, and its subject binding was unspecified. |
| **Documents changed** | none (additive implementation of an already-frozen event) |

### Decision

Implement `ai.output.produced` (v1) through the existing Event Bus pipeline:

- **Payload** (frozen, `03` §8.3): `{capability, model, cost_usd, latency_ms}`.
- **Subject binding**: `subject_type = 'ai_call'`, `subject_id = ai_usage_events.id` — the event
  points at the usage row that fully describes the call (tokens, prompt hash, status).
- **Atomicity**: same transactional pattern as the CRM writes — a `log_ai_usage_with_event(p_usage, p_event)`
  RPC inserts the `ai_usage_events` row and the `event_journal` row in one transaction
  (`10` §11.3); the Router then fire-and-forgets `publishToBus` post-commit (Sprint 3.2 decision #2).
- **Actor**: `user` (the requesting user) in v0.1; `agent` reserved for Phase 3+.

### Impact

- Event catalogue grows to 17 implemented events; schema version 1; no existing event names change.
- `event_journal` schema unchanged; append-only unchanged.
- Cost aggregator (`03` §8.5) subscribes to this event to maintain `ai_usage_daily`.

---

## Amendment 006 — `integration.google.disconnected` lifecycle event

| | |
|---|---|
| **Status** | Approved |
| **Date** | 2026-07-19 |
| **Approved by** | Founder (Sprint 4.5 PHASE 2 decision D3) |
| **Trigger** | Sprint 4.5 (Google OAuth Foundation) journals the connection lifecycle. `integration.google.connected` is already referenced in the frozen event ledger (`10` §11 lines "Google OAuth successful callback → `integration.google.connected`"), so it is a catalogue **sync**, not a change. Its symmetric counterpart `integration.google.disconnected` is **not** present anywhere in `01–12`; journaling it (D3) introduces a new event name and therefore requires an amendment. |
| **Documents changed** | `03` §8.3 catalogue (additive) via next-revision sync; `04`/`10`/`11` unchanged |

### Decision

Add `integration.google.disconnected` (v1) as a journaled business event, symmetric to the
already-frozen `integration.google.connected`:

- **Payload:** `{connection_id, provider}`.
- **Subject binding:** `subject_type = 'integration'`, `subject_id = integration_connections.id`.
- **Actor:** `user` (the workspace member performing the disconnect).
- **Atomicity:** same transactional pattern as CRM writes — `disconnect_google_with_event(p_id, p_workspace, p_event)` flips the row to `revoked` and inserts the `event_journal` row in one transaction; `publishToBus` fans out post-commit.
- `integration.google.connected` is implemented as a **sync** of the frozen ledger entry (no amendment); it is listed here only for context.

### Impact

- Event catalogue grows by two names to 25 (`connected` sync + `disconnected` new); schema version 1; no existing event names change.
- `event_journal` schema unchanged; append-only unchanged.
- No product workflow, AI capability, or CRM schema changes. Subscribers are free to react later (none in v0.1).

---

## Amendment 007 — Version 0.1 onboarding completion = implemented setup steps

| | |
|---|---|
| **Status** | Approved |
| **Date** | 2026-07-19 |
| **Approved by** | Founder (Sprint 4.6 PHASE 2) |
| **Trigger** | Sprint 4.6 (Founder Onboarding) implements the `05` §3 checklist. Two of the seven frozen items — **Revenue Target** (`workspace_targets`, SPRINT 6 item 6) and **Website Audit** (SPRINT 8) — have no built surface, so `05` §3.9 ("all 7 Done → `workspace.onboarded`") is unreachable in v0.1. Founder ruled these two are non-blocking. |
| **Documents changed** | `05` §3.1/§3.9 (completion semantics), `03` §8.3 catalogue sync (`workspace.onboarded`) |

### Decision

1. **v0.1 onboarding completion is based on the currently implemented setup steps.** The required, completion-counting steps are the six with shipped surfaces: **Connect Google, Create first Company, Configure ICP, Add Offer, Upload Knowledge Documents, Import Leads.** When all six are Done, the workspace is onboarded: `onboarded_at` is stamped and `workspace.onboarded` fires once.
2. **Revenue Target and Website Audit remain visible as `Coming Soon` items** in the checklist but do **not** block completion. When their sprints land they convert to required, completing the frozen 7-item intent.
3. **"Create first Company"** is added as a required onboarding step (it was not represented among the frozen seven); it reuses the existing Companies surface.
4. `workspace.onboarded` (payload `{completed_steps}`, subject_type `workspace`) is added to the catalogue as a **sync** of the frozen `05` §3.9 event.

### Impact

- Completion is **derived** from presence-probes (no per-item stored state → automatic resume). Only `workspaces.onboarded_at` + `workspaces.onboarding_dismissed_at` persist (additive columns).
- Event catalogue grows to **26** (adds `workspace.onboarded`); schema version 1; no existing names change.
- No redesign of the reused ICP/Offer/KB/Leads/Companies/Integrations surfaces; the checklist only deep-links to them.
- `05` §3.9's 7/7 celebration + `workspace.onboarded` intent is preserved and simply re-scoped to the implemented steps for v0.1; the two deferred items light up as their sprints land.

---

*Next amendment: 008.*

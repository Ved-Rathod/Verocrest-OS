# 04 — Database Design

**Document:** Database Design (schema, indexes, RLS, roles, lifecycle)
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint — Core Engine First, rev 2)
**Status:** Approved with revisions
**Owner:** Founder / CTO / Database Architect
**Depends on:** `01_Vision.md`, `02_Product_Requirements.md`, `03_System_Architecture.md`
**Last updated:** 2026-07-01

---

## 0. How to read this document

This document is the **schema contract** of Verocrest OS. Every table, column, index, and policy that ships in v0.1 is defined here.

- All DDL targets **Postgres 16 with `pgvector`, `citext`, `pg_trgm`, `unaccent` extensions**, hosted on Supabase (US-East).
- Column types are shown in raw Postgres SQL for clarity and portability. In code, they are declared via **Drizzle ORM** (§3.6 of architecture doc); the SQL is authoritative when in doubt.
- Every business table follows the conventions in §1 and carries the RLS policy pattern in §21. When a table deviates, the deviation is called out inline.
- `04a_DDL.sql` (to be generated after approval) will contain the exact executable DDL. This document is the design intent behind that file.

**This revision (rev 2) adds five entities** that reshape the AI substrate and the B2B data model:

- **Companies** (§4.5) — parent entity for Contacts; matches real agency B2B sales.
- **Ideal Customer Profiles / ICPs** (§5.7) — workspace-configurable profiles; feed the Fit component of Opportunity Score.
- **Knowledge Documents** (§7.3) — SOPs, case studies, testimonials, offers, playbooks; chunked and vectorized into AI Memory.
- **Offers** (§10.6) — service offers with pricing, deliverables, guarantees, ROI; linked to Deals and Proposals; recommendable by AI.
- **Prompt Library** (§18.3) — prompts as versioned, editable data with workspace overrides.

Existing tables are extended (not replaced) with FKs to the new entities. No existing architecture is removed.

If a downstream migration contradicts what is written here, this document wins until it is formally amended.

---

## 1. Conventions

Every table in this schema — unless explicitly noted — obeys these rules.

### 1.1 Column conventions

| Column | Type | Meaning |
|---|---|---|
| `id` | `uuid` (v4, generated `gen_random_uuid()`) | Primary key |
| `workspace_id` | `uuid NOT NULL` | Tenancy key. Foreign key to `workspaces(id)`. RLS filter column. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | Row creation timestamp (UTC) |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | Auto-updated via trigger `set_updated_at` |
| `deleted_at` | `timestamptz` | Soft delete marker. `NULL` = active. |
| `created_by` | `uuid` (FK → `auth.users(id)`) | Human actor who created the row. Nullable for system-created rows. |

**Exceptions**: `action_log`, `event_journal`, `lead_score_history`, `memory_vectors`, `ai_usage_events`, `knowledge_document_chunks` are **append-only** — no `updated_at`, no `deleted_at`.

### 1.2 Money

Always stored as `numeric(18,4)` alongside a `currency char(3) NOT NULL` column with a check constraint validating ISO 4217. **Never `float`, never `int cents`.**

### 1.3 Timestamps

- All timestamps: `timestamptz`, stored UTC.
- All dates without time: `date` (used for pipeline forecasts, targets).
- Client renders in the user's timezone based on `workspace_members.timezone` fallback to `workspaces.timezone`.

### 1.4 Enums

- Closed sets (statuses, stages, channels) use **Postgres enums** — see §22.
- Open sets (tags, sources) use `text` + optional check constraint. Sources are validated by application layer against a workspace-configurable list.

### 1.5 JSONB

Used for:
- Workspace-configurable metadata (custom fields, brand assets, tone rules, ICP criteria)
- Denormalized snapshots (rubric definitions, prompt inputs, offer snapshots)
- AI outputs (explainability, evidence, citations)
- Never used as a substitute for a proper relation. If we filter/sort/join on a field, it becomes a column.

Every JSONB column has a documented shape (in this doc or the module doc that owns it) enforced by Zod at the application boundary.

### 1.6 Foreign keys

- Cross-workspace foreign keys are impossible by construction (all references honor `workspace_id`).
- `ON DELETE` behavior:
  - `RESTRICT` by default when the referenced row must not disappear.
  - `SET NULL` when the reference is convenience (activity timeline pointing to a since-deleted lead).
  - `CASCADE` only within an aggregate root (e.g., `audit_findings` cascade with their parent `audit`, `knowledge_document_chunks` cascade with their `knowledge_documents`).

### 1.7 Naming

- `snake_case` for tables and columns.
- Table names are **plural** (`contacts`, `deals`, `offers`, `icps`).
- Junction tables use `_` between the two entities alphabetically (`deal_contacts`).
- Enum types are `snake_case_enum` (e.g., `deal_stage_enum`).
- Indexes are `idx_<table>_<columns>`, unique indexes `uq_<table>_<columns>`.

### 1.8 Soft delete semantics

- `deleted_at IS NOT NULL` = the row is archived; excluded from all default reads.
- All queries include `AND deleted_at IS NULL` at the repository layer.
- After the retention window (§25), a nightly job hard-deletes soft-deleted rows.

---

## 2. Extensions & Roles

### 2.1 Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";        -- case-insensitive text (emails, slugs, domains)
CREATE EXTENSION IF NOT EXISTS "vector";        -- pgvector for AI Memory
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- trigram search on names/companies/domains
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- accent-insensitive text search
```

### 2.2 Postgres roles

| Role | Purpose | Grants |
|---|---|---|
| `app_role_features` | Default runtime role for feature modules | SELECT/INSERT/UPDATE/DELETE on their own domain tables. **SELECT-only on LIE-owned tables.** |
| `app_role_lie` | Used by Lead Intelligence Engine services when writing LIE tables | INSERT/UPDATE on LIE-owned tables. Elevated via `SET LOCAL ROLE` inside LIE service functions. |
| `app_role_admin` | Break-glass admin ops; used by service-role code paths (backups, migrations, tenancy-fuzzer setup, prompt library global writes) | Full access. Bypasses RLS. Never used from the app runtime path. |

**LIE-owned tables** (write-locked to `app_role_lie`): `relationship_profiles`, `lead_scores`, `outreach_queue_items`, `memory_vectors`, `knowledge_document_chunks`, `audits`, `audit_findings`, `audit_deltas`.

This is a belt-and-braces layer *on top* of the ESLint import boundaries (architecture §5).

### 2.3 The workspace GUC

Every request sets a session variable used by RLS:

```sql
SET LOCAL app.workspace_id = '<uuid>';
SET LOCAL app.actor_user_id = '<uuid>';
SET LOCAL app.request_id = '<ulid>';
```

Middleware sets these at the start of every Server Action, Route Handler, and Inngest step.

---

## 3. Auth & Tenancy

Supabase's `auth.users` is the identity table. Our tables reference it via `auth.users(id)`.

### 3.1 `workspaces`

```sql
CREATE TABLE workspaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            citext NOT NULL UNIQUE,
  name            text NOT NULL,
  timezone        text NOT NULL DEFAULT 'UTC',
  default_currency char(3) NOT NULL DEFAULT 'USD',
  locale          text NOT NULL DEFAULT 'en',
  brand           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { logo_url, primary_color, favicon_url, ... }
  plan            text NOT NULL DEFAULT 'internal',
  ai_budget_monthly_usd numeric(12,2) NOT NULL DEFAULT 200,
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT ck_workspaces_currency CHECK (default_currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX uq_workspaces_slug_active ON workspaces (slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_workspaces_deleted_at ON workspaces (deleted_at);
```

### 3.2 `workspace_members`

```sql
CREATE TYPE workspace_role_enum AS ENUM ('owner', 'admin', 'member', 'guest');
-- MVP: only 'owner' and 'member' active. 'admin' and 'guest' reserved for Phase 3.

CREATE TABLE workspace_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            workspace_role_enum NOT NULL,
  timezone        text,
  invited_by      uuid REFERENCES auth.users(id),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  last_active_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE UNIQUE INDEX uq_workspace_members_ws_user_active
  ON workspace_members (workspace_id, user_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_workspace_members_user ON workspace_members (user_id) WHERE deleted_at IS NULL;
```

### 3.3 `workspace_invites` (Phase 3 reserved, structure defined now)

```sql
CREATE TABLE workspace_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email           citext NOT NULL,
  role            workspace_role_enum NOT NULL DEFAULT 'member',
  token_hash      text NOT NULL,
  invited_by      uuid NOT NULL REFERENCES auth.users(id),
  expires_at      timestamptz NOT NULL,
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_workspace_invites_token ON workspace_invites (token_hash);
CREATE INDEX idx_workspace_invites_ws_email ON workspace_invites (workspace_id, email);
```

---

## 4. Companies, Contacts & Relationship Intelligence

The relationship shape in v0.1 is: **Company (1) → (N) Contacts**. A contact may exist without a company (personal-brand coaches, freelancers); when a company exists, all its contacts share company-level context.

### 4.1 `contacts`

```sql
CREATE TABLE contacts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  company_id               uuid,                              -- FK added in §4.5 after companies is defined
  first_name               text,
  last_name                text,
  primary_email            citext,
  primary_email_normalized citext GENERATED ALWAYS AS (lower(trim(primary_email))) STORED,
  phones                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  company_name             text,                              -- retained for display cache + imports without a resolved company_id
  role_title               text,
  seniority                text,                              -- 'ic', 'manager', 'director', 'vp', 'c_suite', 'owner'
  is_decision_maker        boolean NOT NULL DEFAULT false,
  website_url              text,
  linkedin_url             text,
  location                 jsonb,
  source                   text,
  source_batch_id          uuid,
  tags                     text[] NOT NULL DEFAULT '{}',
  custom_fields            jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes                    text,
  is_client                boolean NOT NULL DEFAULT false,
  created_by               uuid REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz
);

CREATE UNIQUE INDEX uq_contacts_ws_email_active
  ON contacts (workspace_id, primary_email_normalized)
  WHERE primary_email_normalized IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_contacts_ws_name_trgm ON contacts USING gin
  (workspace_id, (first_name || ' ' || last_name) gin_trgm_ops);

CREATE INDEX idx_contacts_ws_company_name_trgm ON contacts USING gin
  (workspace_id, company_name gin_trgm_ops);

CREATE INDEX idx_contacts_ws_tags ON contacts USING gin (workspace_id, tags);
CREATE INDEX idx_contacts_ws_source ON contacts (workspace_id, source) WHERE deleted_at IS NULL;
```

### 4.2 `contact_emails`

```sql
CREATE TABLE contact_emails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  email         citext NOT NULL,
  label         text,
  verified      boolean NOT NULL DEFAULT false,
  bounced       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_contact_emails_ws_email ON contact_emails (workspace_id, email);
CREATE INDEX idx_contact_emails_contact ON contact_emails (contact_id);
```

### 4.3 `relationship_profiles` (LIE — write-locked)

One-to-one with `contacts`.

```sql
CREATE TYPE outreach_readiness_enum AS ENUM ('cold', 'warming', 'ready', 'avoid');

CREATE TABLE relationship_profiles (
  workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id             uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  engagement_score       smallint NOT NULL DEFAULT 0 CHECK (engagement_score BETWEEN 0 AND 100),
  sentiment_score        smallint CHECK (sentiment_score BETWEEN -100 AND 100),
  relationship_score     smallint NOT NULL DEFAULT 0 CHECK (relationship_score BETWEEN 0 AND 100),
  outreach_readiness     outreach_readiness_enum NOT NULL DEFAULT 'cold',
  cadence_target_days    smallint,
  last_interaction_at    timestamptz,
  last_positive_at       timestamptz,
  next_action_recommended_at timestamptz,
  signals                jsonb NOT NULL DEFAULT '{}'::jsonb,
  recomputed_at          timestamptz NOT NULL DEFAULT now(),
  version                integer NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, contact_id)
);

CREATE INDEX idx_relationship_profiles_ws_readiness
  ON relationship_profiles (workspace_id, outreach_readiness);

CREATE INDEX idx_relationship_profiles_ws_next_action
  ON relationship_profiles (workspace_id, next_action_recommended_at)
  WHERE next_action_recommended_at IS NOT NULL;
```

**Note:** company-level relationship signals (aggregate engagement across all contacts at a company) are derived on read in v0.1 via a view (`vw_company_relationship_signals`) rather than a stored table. Promoted to a stored table in Phase 2 if read cost warrants.

### 4.4 `activity_timeline`

Append-only feed. **Extended in rev 2 with `company_id` for company-level activity threading.**

```sql
CREATE TYPE activity_type_enum AS ENUM (
  'email_sent', 'email_replied', 'email_opened', 'email_bounced',
  'dm_sent', 'dm_replied',
  'call_logged',
  'meeting_scheduled', 'meeting_completed', 'meeting_cancelled',
  'note_added',
  'audit_run',
  'proposal_sent', 'proposal_signed',
  'stage_changed',
  'lead_scored',
  'offer_presented', 'offer_recommended',
  'reminder_created', 'reminder_completed',
  'kb_document_referenced',
  'agent_action'
);

CREATE TYPE actor_type_enum AS ENUM ('user', 'agent', 'system', 'integration');

CREATE TABLE activity_timeline (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  company_id    uuid,                                          -- FK added in §4.5
  contact_id    uuid REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id       uuid,                                          -- FK added after §10
  activity_type activity_type_enum NOT NULL,
  actor_type    actor_type_enum NOT NULL,
  actor_id      text NOT NULL,
  subject       text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_timeline_ws_contact_time
  ON activity_timeline (workspace_id, contact_id, occurred_at DESC);

CREATE INDEX idx_activity_timeline_ws_deal_time
  ON activity_timeline (workspace_id, deal_id, occurred_at DESC)
  WHERE deal_id IS NOT NULL;

CREATE INDEX idx_activity_timeline_ws_company_time
  ON activity_timeline (workspace_id, company_id, occurred_at DESC)
  WHERE company_id IS NOT NULL;
```

### 4.5 `companies` (rev 2 — new)

```sql
CREATE TYPE company_size_enum AS ENUM (
  'solo',        -- 1
  'micro',       -- 2-9
  'small',       -- 10-49
  'medium',      -- 50-249
  'large',       -- 250-999
  'enterprise'   -- 1000+
);

CREATE TABLE companies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  legal_name            text,
  domain                citext,
  domain_normalized     citext GENERATED ALWAYS AS (lower(regexp_replace(COALESCE(domain, ''), '^www\.', ''))) STORED,
  website_url           text,
  industry              text,
  sub_industry          text,
  size                  company_size_enum,
  employee_count        integer,
  annual_revenue        numeric(18,4),
  revenue_currency      char(3),
  location              jsonb,                              -- { country, region, city, timezone }
  linkedin_url          text,
  description           text,                                -- long-form; feeds ICP matching + Memory
  tags                  text[] NOT NULL DEFAULT '{}',
  custom_fields         jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_client             boolean NOT NULL DEFAULT false,
  primary_owner_user_id uuid REFERENCES auth.users(id),
  source                text,
  source_batch_id       uuid,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CONSTRAINT ck_companies_currency CHECK (revenue_currency IS NULL OR revenue_currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX uq_companies_ws_domain_active
  ON companies (workspace_id, domain_normalized)
  WHERE domain_normalized <> '' AND deleted_at IS NULL;

CREATE INDEX idx_companies_ws_name_trgm ON companies USING gin
  (workspace_id, name gin_trgm_ops);

CREATE INDEX idx_companies_ws_industry ON companies (workspace_id, industry) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_ws_size ON companies (workspace_id, size) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_ws_tags ON companies USING gin (workspace_id, tags);
CREATE INDEX idx_companies_ws_is_client ON companies (workspace_id, is_client) WHERE deleted_at IS NULL;
```

**Backfill FKs for tables defined before `companies`:**

```sql
ALTER TABLE contacts
  ADD CONSTRAINT fk_contacts_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX idx_contacts_ws_company
  ON contacts (workspace_id, company_id) WHERE company_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE activity_timeline
  ADD CONSTRAINT fk_activity_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
```

**Design decisions specific to companies:**

- **`company_name` remains on `contacts` as a display cache** — imports frequently arrive with a company string but no matched company row; the app resolves and links to `companies` asynchronously.
- **Companies are the natural website audit subject** — `audits.company_id` is added in §6 for this reason.
- **Companies are the primary ICP-matching subject** — matches happen at the company level; contact-level fit signals modulate the score.
- **Deduplication** is by `(workspace_id, domain_normalized)` — companies without domains cannot be de-duped automatically; the app offers a review-and-merge UI.

### 4.6 Contact-Company link maintenance

- On contact create: if `contacts.company_name` is present and `company_id` is null, an Inngest job attempts to match against `companies.name` (fuzzy) or resolve a domain from `contacts.primary_email`.
- On email-domain match: link contact to company; emit `contact.linked_to_company`.
- Unresolved linkages remain in `contacts` with `company_id = NULL` and appear in a **Company Suggestions** review surface.

---

## 5. Leads, Opportunity Scoring & ICPs (LIE)

A `lead` is a `contact` under sales consideration. Not every contact is a lead; every lead is a contact.

### 5.1 `leads`

```sql
CREATE TYPE lead_status_enum AS ENUM (
  'new', 'enriching', 'scored', 'ready',
  'contacted', 'engaged', 'nurturing',
  'meeting_booked', 'meeting_held',
  'proposal_sent', 'won', 'lost',
  'disqualified', 'unsubscribed'
);

CREATE TABLE leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id        uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id        uuid REFERENCES companies(id) ON DELETE SET NULL,   -- denormalized from contact for query perf
  status            lead_status_enum NOT NULL DEFAULT 'new',
  owner_user_id     uuid REFERENCES auth.users(id),
  source            text,
  ingestion_batch_id uuid,
  first_ingested_at timestamptz NOT NULL DEFAULT now(),
  qualified_at     timestamptz,
  disqualified_at   timestamptz,
  disqualified_reason text,
  custom_fields    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE UNIQUE INDEX uq_leads_ws_contact_active
  ON leads (workspace_id, contact_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_leads_ws_status ON leads (workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_ws_owner ON leads (workspace_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_ws_company ON leads (workspace_id, company_id) WHERE company_id IS NOT NULL;
```

`company_id` is denormalized from `contacts` for query performance (Gold Leads by industry, by company size). Kept consistent by an event subscriber on `contact.updated`.

### 5.2 `scoring_rubrics`

```sql
CREATE TABLE scoring_rubrics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  version       integer NOT NULL,
  definition    jsonb NOT NULL,
  active        boolean NOT NULL DEFAULT false,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE UNIQUE INDEX uq_scoring_rubrics_ws_name_version
  ON scoring_rubrics (workspace_id, name, version) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_scoring_rubrics_ws_active
  ON scoring_rubrics (workspace_id) WHERE active = true AND deleted_at IS NULL;
```

### 5.3 `lead_scores` (LIE — extended with ICP tracking)

```sql
CREATE TABLE lead_scores (
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id            uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  fit_score          smallint NOT NULL CHECK (fit_score BETWEEN 0 AND 100),
  readiness_score    smallint NOT NULL CHECK (readiness_score BETWEEN 0 AND 100),
  opportunity_score  smallint NOT NULL CHECK (opportunity_score BETWEEN 0 AND 100),
  icp_id             uuid REFERENCES icps(id),                        -- rev 2: which ICP was matched
  icp_match_score    smallint CHECK (icp_match_score BETWEEN 0 AND 100),
  icp_match_signals  jsonb,                                            -- plain-language ICP hit/miss cards
  rubric_id          uuid NOT NULL REFERENCES scoring_rubrics(id),
  rubric_version     integer NOT NULL,
  top_signals        jsonb NOT NULL,
  explainability     jsonb NOT NULL,
  model              text NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT now(),
  computed_by_agent  text,
  PRIMARY KEY (workspace_id, lead_id)
);

CREATE INDEX idx_lead_scores_ws_opportunity
  ON lead_scores (workspace_id, opportunity_score DESC);

CREATE INDEX idx_lead_scores_ws_readiness
  ON lead_scores (workspace_id, readiness_score DESC);

CREATE INDEX idx_lead_scores_ws_icp
  ON lead_scores (workspace_id, icp_id) WHERE icp_id IS NOT NULL;
```

**Fit score composition (revised for ICP integration):**

```
fit_score = round(
  0.6 * icp_match_score          -- ICP match dominates
  + 0.2 * website_intelligence_signal
  + 0.2 * enrichment_signals
)
```

Workspace-configurable via `scoring_rubrics.definition.fit_composition`. When no active ICP exists, `fit_score` falls back to the pre-ICP rubric (all enrichment + website signals).

**Opportunity score composition (unchanged):** default `opportunity_score = round(sqrt(fit_score * readiness_score))`.

### 5.4 `lead_score_history` (append-only, extended)

```sql
CREATE TABLE lead_score_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL,
  lead_id            uuid NOT NULL,
  fit_score          smallint NOT NULL,
  readiness_score    smallint NOT NULL,
  opportunity_score  smallint NOT NULL,
  icp_id             uuid,
  icp_match_score    smallint,
  rubric_id          uuid NOT NULL,
  rubric_version     integer NOT NULL,
  top_signals        jsonb NOT NULL,
  model              text NOT NULL,
  computed_at        timestamptz NOT NULL DEFAULT now(),
  computed_by_agent  text
);

CREATE INDEX idx_lead_score_history_ws_lead_time
  ON lead_score_history (workspace_id, lead_id, computed_at DESC);
```

### 5.5 `scoring_rubrics.definition` shape (updated for ICP)

```json
{
  "fit_composition": {
    "icp_match_weight": 0.6,
    "website_signal_weight": 0.2,
    "enrichment_weight": 0.2
  },
  "readiness_rules": [
    { "signal": "recent_engagement_days", "op": "<=", "value": 30, "boost": 20 },
    { "signal": "positive_sentiment_streak", "op": ">=", "value": 2, "boost": 15 },
    { "signal": "unsubscribed", "op": "==", "value": true, "cap": 0 }
  ],
  "opportunity_formula": "sqrt(fit * readiness)",
  "disqualifiers": [
    { "signal": "industry", "op": "in", "values": ["adult", "gambling"] }
  ]
}
```

### 5.6 `ingest_batches`

```sql
CREATE TABLE ingest_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source        text NOT NULL,
  file_name     text,
  requested_by  uuid REFERENCES auth.users(id),
  row_count     integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  error_count   integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'pending',
  errors        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
```

### 5.7 `icps` — Ideal Customer Profiles (rev 2 — new)

Workspace-configurable profiles describing "who we sell to." Every workspace can have multiple ICPs (e.g., "Dental clinics AU/NZ", "High-ticket coaches US"). One may be marked primary; others are matched in parallel and the highest-match wins for a lead.

```sql
CREATE TABLE icps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name              text NOT NULL,
  short_description text,
  narrative         text NOT NULL,                              -- long-form; feeds AI Memory vectorization
  criteria          jsonb NOT NULL,                              -- see §5.8 shape
  match_weights     jsonb NOT NULL DEFAULT '{}'::jsonb,          -- per-criterion weight overrides
  disqualifiers     jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_geographies text[] NOT NULL DEFAULT '{}',               -- ISO country codes
  target_industries text[] NOT NULL DEFAULT '{}',
  target_size       company_size_enum[] NOT NULL DEFAULT '{}',
  target_revenue_min numeric(18,4),
  target_revenue_max numeric(18,4),
  target_revenue_currency char(3),
  active            boolean NOT NULL DEFAULT true,
  is_primary        boolean NOT NULL DEFAULT false,
  version           integer NOT NULL DEFAULT 1,
  is_indexed        boolean NOT NULL DEFAULT false,              -- vectorized into memory_vectors
  last_indexed_at   timestamptz,
  content_hash      text NOT NULL,                                -- SHA-256 of (narrative + criteria)
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE UNIQUE INDEX uq_icps_ws_primary_active
  ON icps (workspace_id) WHERE is_primary = true AND active = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX uq_icps_ws_name_version
  ON icps (workspace_id, name, version) WHERE deleted_at IS NULL;

CREATE INDEX idx_icps_ws_active ON icps (workspace_id, active) WHERE deleted_at IS NULL;
CREATE INDEX idx_icps_ws_industries ON icps USING gin (workspace_id, target_industries);
CREATE INDEX idx_icps_ws_geographies ON icps USING gin (workspace_id, target_geographies);
```

### 5.8 `icps.criteria` shape (documented)

```json
{
  "company": {
    "industries": { "must_match_one": ["dental", "orthodontics"], "boost": 30 },
    "sub_industries": ["cosmetic_dentistry"],
    "size": { "in": ["small", "medium"], "weight": 10 },
    "geographies": { "in": ["AU", "NZ"], "weight": 20 },
    "annual_revenue_min": 500000,
    "signals": [
      { "type": "website_has_booking", "weight": 15 },
      { "type": "website_has_reviews_widget", "weight": 5 },
      { "type": "google_ads_detected", "weight": 10 }
    ]
  },
  "contact": {
    "seniority": { "in": ["owner", "c_suite"], "weight": 15 },
    "is_decision_maker": { "prefer": true, "weight": 10 },
    "roles_include": ["owner", "clinic manager", "practice manager"]
  },
  "notes": "Dental clinics with 2-5 practitioners; owner-operator ideal. High spend on Google Ads = fast-close signal."
}
```

Shape is enforced by Zod at the API boundary.

### 5.9 ICP matching flow

- On `contact.created`, `contact.updated`, `company.updated`, `website.audit.completed`, or `lead.enriched` → the Scoring service (LIE) enumerates active ICPs in the workspace, computes a match score against each, picks the best, and records `icp_id` + `icp_match_score` on `lead_scores`.
- The ICP narrative is also vectorized (see §7.1 `memory_scope_enum` value `'icp'`) so an AI capability like "explain why this lead is a strong fit" can retrieve ICP context alongside company + contact context.

---

## 6. Website Intelligence (LIE)

### 6.1 `audits` (extended with `company_id`)

```sql
CREATE TYPE audit_status_enum AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE audits (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url_original          text NOT NULL,
  url_normalized        text NOT NULL,
  requested_by_user_id  uuid REFERENCES auth.users(id),
  requested_by_agent    text,
  company_id            uuid REFERENCES companies(id) ON DELETE SET NULL,   -- rev 2
  contact_id            uuid REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id               uuid REFERENCES leads(id) ON DELETE SET NULL,
  deal_id               uuid,                                                -- FK added after §10
  status                audit_status_enum NOT NULL DEFAULT 'pending',
  overall_grade         smallint CHECK (overall_grade BETWEEN 0 AND 100),
  category_grades       jsonb,
  findings_count        integer,
  browserless_session_id text,
  screenshot_url        text,
  full_render_url       text,
  model                 text,
  cost_usd              numeric(10,4),
  latency_ms            integer,
  started_at            timestamptz,
  completed_at          timestamptz,
  error                 jsonb,
  audit_config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audits_ws_status ON audits (workspace_id, status);
CREATE INDEX idx_audits_ws_url ON audits (workspace_id, url_normalized);
CREATE INDEX idx_audits_ws_company ON audits (workspace_id, company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_audits_ws_contact ON audits (workspace_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_audits_ws_completed_at ON audits (workspace_id, completed_at DESC) WHERE completed_at IS NOT NULL;
```

### 6.2 `audit_findings`

```sql
CREATE TYPE finding_category_enum AS ENUM (
  'cta', 'booking', 'mobile', 'trust', 'conversion',
  'performance', 'seo', 'forms', 'brand', 'accessibility'
);

CREATE TYPE finding_severity_enum AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE audit_findings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audit_id          uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  category          finding_category_enum NOT NULL,
  severity          finding_severity_enum NOT NULL,
  title             text NOT NULL,
  description       text NOT NULL,
  recommendation    text NOT NULL,
  evidence          jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence        smallint CHECK (confidence BETWEEN 0 AND 100),
  position          integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_findings_audit ON audit_findings (audit_id, position);
CREATE INDEX idx_audit_findings_ws_category ON audit_findings (workspace_id, category);
CREATE INDEX idx_audit_findings_ws_severity ON audit_findings (workspace_id, severity);
```

### 6.3 `audit_deltas`

```sql
CREATE TABLE audit_deltas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  prev_audit_id     uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  next_audit_id     uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  category          finding_category_enum,
  change_summary    text NOT NULL,
  delta_score       smallint,
  findings_added    integer NOT NULL DEFAULT 0,
  findings_resolved integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_deltas_ws_next ON audit_deltas (workspace_id, next_audit_id);
```

---

## 7. AI Memory Substrate & Knowledge (LIE)

### 7.1 `memory_vectors` (extended `memory_scope_enum`)

```sql
CREATE TYPE memory_scope_enum AS ENUM (
  'workspace',
  'company',        -- rev 2
  'contact',
  'lead',
  'deal',
  'project',
  'audit',
  'knowledge_doc',  -- rev 2: chunk of a knowledge_documents row
  'offer',          -- rev 2: full offer as a memory unit
  'icp'             -- rev 2: ICP narrative as a memory unit
);

CREATE TABLE memory_vectors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope         memory_scope_enum NOT NULL,
  subject_id    uuid,                                    -- NULL when scope = 'workspace'
  agent_id      text,                                    -- NULL in v0.1
  content_hash  text NOT NULL,
  content       text NOT NULL,
  embedding     vector(1536) NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,      -- { source, prompt_id, capability, chunk_index?, doc_title?, always_apply, never_apply }
  ttl_at        timestamptz,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_vectors_ws_scope_subject
  ON memory_vectors (workspace_id, scope, subject_id);

CREATE INDEX idx_memory_vectors_ws_hash
  ON memory_vectors (workspace_id, content_hash);

CREATE INDEX idx_memory_vectors_ttl
  ON memory_vectors (ttl_at) WHERE ttl_at IS NOT NULL;

CREATE INDEX idx_memory_vectors_embedding_hnsw
  ON memory_vectors USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Canonical query (unchanged):**

```sql
SELECT id, content, metadata, scope, subject_id, 1 - (embedding <=> $1::vector) AS similarity
FROM memory_vectors
WHERE workspace_id = current_setting('app.workspace_id')::uuid
  AND scope = ANY($2)
  AND (subject_id = ANY($3) OR subject_id IS NULL)
  AND (ttl_at IS NULL OR ttl_at > now())
ORDER BY embedding <=> $1::vector
LIMIT $4;
```

Callers filter by scope to control retrieval breadth. Example: outreach drafting for a lead retrieves scopes `['contact','company','knowledge_doc','offer','icp']` with subject filter on the lead's contact and company.

### 7.2 `memory_annotations`

```sql
CREATE TABLE memory_annotations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  memory_id     uuid NOT NULL REFERENCES memory_vectors(id) ON DELETE CASCADE,
  annotation    text NOT NULL,                          -- 'always_apply', 'never_apply', 'boost', 'suppress'
  capability    text,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

### 7.3 `knowledge_documents` (rev 2 — new)

The persistent, editable source of truth for SOPs, case studies, offers narratives, pricing notes, testimonials, FAQs, onboarding docs, and sales playbooks. Each document is chunked into `memory_vectors` for retrieval.

```sql
CREATE TYPE knowledge_doc_type_enum AS ENUM (
  'sop',
  'offer_narrative',      -- long-form supporting content for an offer (offer structural data lives in `offers`)
  'pricing_note',
  'case_study',
  'testimonial',
  'faq',
  'onboarding',
  'sales_playbook',
  'brand_voice',
  'legal_terms',
  'objection_handling',
  'other'
);

CREATE TYPE knowledge_doc_visibility_enum AS ENUM ('internal', 'client_shareable');

CREATE TABLE knowledge_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  doc_type              knowledge_doc_type_enum NOT NULL,
  title                 text NOT NULL,
  slug                  citext,
  summary               text,                                     -- one-paragraph AI-generated
  content               text NOT NULL,                            -- markdown or plaintext
  content_rich          jsonb,                                    -- optional tiptap/prosemirror tree
  tags                  text[] NOT NULL DEFAULT '{}',
  linked_entity_type    text,                                     -- 'offer' | 'icp' | 'company' | 'client_case' | NULL
  linked_entity_id      uuid,
  visibility            knowledge_doc_visibility_enum NOT NULL DEFAULT 'internal',
  version               integer NOT NULL DEFAULT 1,
  is_indexed            boolean NOT NULL DEFAULT false,
  last_indexed_at       timestamptz,
  content_hash          text NOT NULL,                             -- SHA-256; changes invalidate the chunk index
  author_user_id        uuid REFERENCES auth.users(id),
  active                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX idx_knowledge_documents_ws_type_active
  ON knowledge_documents (workspace_id, doc_type) WHERE active = true AND deleted_at IS NULL;

CREATE INDEX idx_knowledge_documents_ws_tags
  ON knowledge_documents USING gin (workspace_id, tags);

CREATE UNIQUE INDEX uq_knowledge_documents_ws_slug
  ON knowledge_documents (workspace_id, slug) WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_knowledge_documents_ws_content_hash
  ON knowledge_documents (workspace_id, content_hash);

CREATE INDEX idx_knowledge_documents_ws_linked
  ON knowledge_documents (workspace_id, linked_entity_type, linked_entity_id)
  WHERE linked_entity_id IS NOT NULL;
```

### 7.4 `knowledge_document_chunks` (LIE — append-only, write-locked)

Every knowledge document is chunked (typically 400–800 tokens per chunk with 100-token overlap) and each chunk becomes a `memory_vectors` row. This table tracks the mapping so re-indexing can invalidate old chunks precisely.

```sql
CREATE TABLE knowledge_document_chunks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  knowledge_document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index           integer NOT NULL,
  content               text NOT NULL,
  char_start            integer NOT NULL,
  char_end              integer NOT NULL,
  memory_vector_id      uuid REFERENCES memory_vectors(id) ON DELETE SET NULL,
  content_hash          text NOT NULL,
  doc_version_at_index  integer NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_knowledge_document_chunks_doc_idx
  ON knowledge_document_chunks (knowledge_document_id, chunk_index);

CREATE INDEX idx_knowledge_document_chunks_ws_doc
  ON knowledge_document_chunks (workspace_id, knowledge_document_id);
```

### 7.5 Vectorization workflow (knowledge_documents → memory_vectors)

Emitted events + subscriber flow:

1. User creates or edits a `knowledge_document`. `content_hash` changes.
2. `knowledge_doc.upserted` event fires on the Agency Event Bus.
3. LIE subscriber (**Knowledge Indexer**) chunks the content, produces embeddings via the Model Router (capability `embed-knowledge`), and:
   - Upserts `knowledge_document_chunks` (one row per chunk).
   - Inserts corresponding `memory_vectors` rows (`scope = 'knowledge_doc'`, `subject_id = knowledge_document_id`, metadata includes `chunk_index`, `doc_title`, `doc_type`).
   - Sets `is_indexed = true` and `last_indexed_at`.
4. If a prior version's chunks exist, they are hard-deleted (chunks + their memory_vectors) after the new version is indexed. Two-phase index swap prevents retrieval gaps.
5. `knowledge_doc.indexed` event fires; dashboards + audit trail update.

### 7.6 What the AI retrieves for a lead outreach draft

Illustrative — actual retrieval strategy lives in `09_AI_Architecture.md`:

- **Lead + Contact scope** — recent interactions, sentiment, corrections
- **Company scope** — company description, prior audits, prior deals
- **Website audit findings** — top 3–5 issues, categorized
- **ICP scope** — matched ICP narrative (why this fits our target)
- **Offer scope** — most likely offer(s) for this ICP + this company size
- **Knowledge doc scope** — case studies matching industry, testimonials from adjacent verticals, brand voice, objection-handling playbook
- **Workspace scope** — global preferences (tone rules, banned phrases)

All filtered by `workspace_id` at the DB layer + a top-K similarity threshold.

---

## 8. Outreach Queue (LIE — materialized, write-locked)

### 8.1 `outreach_queue_items`

```sql
CREATE TYPE next_best_action_enum AS ENUM (
  'draft_email', 'draft_ig_dm', 'draft_linkedin_dm',
  'send_loom', 'schedule_followup', 'wait_cooldown',
  'present_offer',                                       -- rev 2: proactive offer surfacing
  'disqualify'
);

CREATE TABLE outreach_queue_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id               uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contact_id            uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id            uuid REFERENCES companies(id) ON DELETE SET NULL,     -- rev 2
  recommended_offer_id  uuid REFERENCES offers(id),                            -- rev 2: AI-suggested offer
  opportunity_score     smallint NOT NULL,
  next_best_action      next_best_action_enum NOT NULL,
  reasoning             jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel_preference    text,
  cooldown_until        timestamptz,
  computed_at           timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  priority_rank         integer NOT NULL
);

CREATE UNIQUE INDEX uq_outreach_queue_items_ws_lead
  ON outreach_queue_items (workspace_id, lead_id);

CREATE INDEX idx_outreach_queue_items_ws_rank
  ON outreach_queue_items (workspace_id, priority_rank);

CREATE INDEX idx_outreach_queue_items_ws_score
  ON outreach_queue_items (workspace_id, opportunity_score DESC);

CREATE INDEX idx_outreach_queue_items_ws_offer
  ON outreach_queue_items (workspace_id, recommended_offer_id)
  WHERE recommended_offer_id IS NOT NULL;
```

---

## 9. Outreach & Personalization

### 9.1 `outreach_messages`

```sql
CREATE TYPE outreach_channel_enum AS ENUM ('email', 'ig_dm', 'linkedin_dm', 'sms', 'call');
CREATE TYPE outreach_direction_enum AS ENUM ('outbound', 'inbound');
CREATE TYPE outreach_status_enum AS ENUM (
  'draft', 'queued', 'sent', 'opened', 'replied',
  'bounced', 'unsubscribed', 'failed'
);
CREATE TYPE outreach_sentiment_enum AS ENUM ('positive', 'neutral', 'negative', 'objection', 'unsubscribe');

CREATE TABLE outreach_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id            uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id            uuid REFERENCES companies(id) ON DELETE SET NULL,     -- rev 2
  lead_id               uuid REFERENCES leads(id) ON DELETE SET NULL,
  deal_id               uuid,                                                  -- FK added after §10
  sequence_enrollment_id uuid,
  offer_id              uuid REFERENCES offers(id),                            -- rev 2: offer positioned in this message
  channel               outreach_channel_enum NOT NULL,
  direction             outreach_direction_enum NOT NULL,
  status                outreach_status_enum NOT NULL DEFAULT 'draft',
  subject               text,
  body                  text NOT NULL,
  tone                  text,
  model                 text,
  prompt_id             text,                                                  -- resolves to code registry OR prompt_library
  prompt_version        integer,
  citations             jsonb,                                                 -- what facts the AI referenced (kb_doc_ids, audit_finding_ids, memory_ids)
  sender_user_id        uuid REFERENCES auth.users(id),
  sender_agent          text,
  provider_message_id   text,
  provider_thread_id    text,
  sent_at               timestamptz,
  replied_at            timestamptz,
  sentiment             outreach_sentiment_enum,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX idx_outreach_messages_ws_contact_time
  ON outreach_messages (workspace_id, contact_id, created_at DESC);

CREATE INDEX idx_outreach_messages_ws_status
  ON outreach_messages (workspace_id, status);

CREATE INDEX idx_outreach_messages_ws_company_time
  ON outreach_messages (workspace_id, company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

CREATE INDEX idx_outreach_messages_ws_provider_thread
  ON outreach_messages (workspace_id, provider_thread_id)
  WHERE provider_thread_id IS NOT NULL;
```

### 9.2 `outreach_sequences`

```sql
CREATE TABLE outreach_sequences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  channel       outreach_channel_enum NOT NULL,
  steps         jsonb NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TABLE outreach_sequence_enrollments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sequence_id    uuid NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  contact_id     uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  current_step   integer NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'active',
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  exited_reason  text
);

CREATE UNIQUE INDEX uq_outreach_enrollments_ws_seq_contact_active
  ON outreach_sequence_enrollments (workspace_id, sequence_id, contact_id)
  WHERE status = 'active';
```

### 9.3 `loom_scripts`

```sql
CREATE TABLE loom_scripts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audit_id      uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES contacts(id) ON DELETE SET NULL,
  company_id    uuid REFERENCES companies(id) ON DELETE SET NULL,   -- rev 2
  script        text NOT NULL,
  word_count    integer NOT NULL,
  hook_variant  text,
  cta_variant   text,
  model         text,
  prompt_version integer,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
```

---

## 10. Sales — Deals, Pipelines, Proposals, Meetings, Offers

### 10.1 `pipelines`

```sql
CREATE TABLE pipelines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  stages        jsonb NOT NULL,
  is_default    boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE UNIQUE INDEX uq_pipelines_ws_default
  ON pipelines (workspace_id) WHERE is_default = true AND deleted_at IS NULL;
```

### 10.2 `deals` (extended with `company_id`, `offer_id`, `offer_version`)

```sql
CREATE TABLE deals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pipeline_id          uuid NOT NULL REFERENCES pipelines(id),
  stage_key            text NOT NULL,
  primary_contact_id   uuid REFERENCES contacts(id) ON DELETE SET NULL,
  company_id           uuid REFERENCES companies(id) ON DELETE SET NULL,      -- rev 2
  owner_user_id        uuid REFERENCES auth.users(id),
  offer_id             uuid REFERENCES offers(id),                              -- rev 2
  offer_version        integer,                                                 -- rev 2: snapshot version of the offer at deal creation
  name                 text NOT NULL,
  value                numeric(18,4) NOT NULL DEFAULT 0,
  currency             char(3) NOT NULL,
  probability          smallint CHECK (probability BETWEEN 0 AND 100),
  close_date_expected  date,
  source               text,
  custom_fields        jsonb NOT NULL DEFAULT '{}'::jsonb,
  won_at               timestamptz,
  lost_at              timestamptz,
  lost_reason          text,
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  CONSTRAINT ck_deals_currency CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX idx_deals_ws_pipeline_stage ON deals (workspace_id, pipeline_id, stage_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_ws_owner ON deals (workspace_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_ws_won ON deals (workspace_id, won_at) WHERE won_at IS NOT NULL;
CREATE INDEX idx_deals_ws_expected_close ON deals (workspace_id, close_date_expected) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_ws_company ON deals (workspace_id, company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_deals_ws_offer ON deals (workspace_id, offer_id) WHERE offer_id IS NOT NULL;
```

### 10.3 `deal_contacts`

```sql
CREATE TABLE deal_contacts (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deal_id       uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, deal_id, contact_id)
);
```

### 10.4 `proposals` (extended with `offer_id`, `offer_version`, `offer_snapshot`)

```sql
CREATE TYPE proposal_status_enum AS ENUM ('draft', 'sent', 'viewed', 'signed', 'declined', 'expired');

CREATE TABLE proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deal_id       uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  offer_id      uuid REFERENCES offers(id),                              -- rev 2
  offer_version integer,                                                  -- rev 2
  offer_snapshot jsonb,                                                   -- rev 2: full offer snapshot at send time (immutable record)
  title         text NOT NULL,
  content       jsonb NOT NULL,
  status        proposal_status_enum NOT NULL DEFAULT 'draft',
  value         numeric(18,4),
  currency      char(3),
  sent_at       timestamptz,
  viewed_at     timestamptz,
  signed_at     timestamptz,
  declined_at   timestamptz,
  expired_at    timestamptz,
  pdf_url       text,
  model         text,
  prompt_id     text,
  prompt_version integer,
  external_esign_provider text,
  external_esign_id text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX idx_proposals_ws_deal ON proposals (workspace_id, deal_id);
CREATE INDEX idx_proposals_ws_status ON proposals (workspace_id, status);
CREATE INDEX idx_proposals_ws_offer ON proposals (workspace_id, offer_id) WHERE offer_id IS NOT NULL;
```

**Why snapshot the offer:** offer definitions evolve (pricing changes, guarantees updated). A signed proposal must reflect the offer *as sent*, not the current offer row. The snapshot is legal-grade evidence and displayed on Client Portal (Phase 2) exactly as sent.

### 10.5 `meetings`

```sql
CREATE TYPE meeting_status_enum AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

CREATE TABLE meetings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deal_id               uuid REFERENCES deals(id) ON DELETE SET NULL,
  contact_id            uuid REFERENCES contacts(id) ON DELETE SET NULL,
  company_id            uuid REFERENCES companies(id) ON DELETE SET NULL,   -- rev 2
  organizer_user_id     uuid REFERENCES auth.users(id),
  title                 text,
  description           text,
  scheduled_at          timestamptz NOT NULL,
  duration_minutes      integer,
  provider              text NOT NULL,
  external_event_id     text,
  meeting_url           text,
  status                meeting_status_enum NOT NULL DEFAULT 'scheduled',
  notes                 text,
  ai_summary            text,
  booking_link_id       uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX idx_meetings_ws_time ON meetings (workspace_id, scheduled_at);
CREATE INDEX idx_meetings_ws_deal ON meetings (workspace_id, deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX idx_meetings_ws_organizer ON meetings (workspace_id, organizer_user_id);
CREATE INDEX idx_meetings_ws_company ON meetings (workspace_id, company_id) WHERE company_id IS NOT NULL;
```

**Deferred FK backfill:**

```sql
ALTER TABLE activity_timeline ADD CONSTRAINT fk_activity_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
ALTER TABLE outreach_messages ADD CONSTRAINT fk_outreach_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
ALTER TABLE audits            ADD CONSTRAINT fk_audits_deal   FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
```

### 10.6 `offers` (rev 2 — new)

Service offers with pricing, deliverables, guarantees, ROI narrative. Linked to Deals + Proposals. Recommendable by AI (`outreach_queue_items.recommended_offer_id`).

```sql
CREATE TYPE offer_pricing_model_enum AS ENUM (
  'fixed',        -- single price
  'tiered',       -- price bands
  'retainer',     -- recurring
  'performance',  -- outcome-based
  'custom'        -- quoted per deal
);

CREATE TYPE offer_status_enum AS ENUM ('draft', 'active', 'paused', 'retired');

CREATE TABLE offers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug                 citext NOT NULL,
  name                 text NOT NULL,
  short_description    text,
  positioning          text,                                    -- brand-facing narrative
  target_icp_id        uuid REFERENCES icps(id),                 -- primary ICP this offer serves
  target_company_size  company_size_enum[] NOT NULL DEFAULT '{}',
  target_industries    text[] NOT NULL DEFAULT '{}',
  pricing_model        offer_pricing_model_enum NOT NULL DEFAULT 'fixed',
  price                numeric(18,4),
  price_max            numeric(18,4),                            -- for 'tiered' and ranges
  currency             char(3),
  billing_cadence      text,                                     -- 'one_time', 'monthly', 'quarterly', 'annual'
  deliverables         jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{ title, description, quantity, timeline_days }]
  guarantees           jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{ type, description, conditions, refund_terms }]
  roi_narrative        text,                                     -- long-form ROI story
  roi_metrics          jsonb NOT NULL DEFAULT '{}'::jsonb,       -- { expected_lift_pct, payback_months, evidence_kb_doc_ids: [...] }
  onboarding_steps     jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{ order, title, description }]
  requirements         jsonb NOT NULL DEFAULT '[]'::jsonb,       -- what the client must provide
  status               offer_status_enum NOT NULL DEFAULT 'draft',
  version              integer NOT NULL DEFAULT 1,
  is_indexed           boolean NOT NULL DEFAULT false,
  last_indexed_at      timestamptz,
  content_hash         text NOT NULL,
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  CONSTRAINT ck_offers_currency CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX uq_offers_ws_slug_active
  ON offers (workspace_id, slug) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_offers_ws_name_version
  ON offers (workspace_id, name, version) WHERE deleted_at IS NULL;

CREATE INDEX idx_offers_ws_status ON offers (workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_offers_ws_icp ON offers (workspace_id, target_icp_id) WHERE target_icp_id IS NOT NULL;
CREATE INDEX idx_offers_ws_industries ON offers USING gin (workspace_id, target_industries);
```

### 10.7 Offer vectorization

Same pattern as knowledge_documents:

- On `offer.upserted`, LIE Indexer chunks `positioning + roi_narrative + deliverables + guarantees` and produces embeddings.
- Stored as `memory_vectors` rows with `scope = 'offer'`, `subject_id = offers.id`, metadata `{ offer_name, offer_version, section }`.
- Retrieval: when scoring recommends an offer, the top matches are considered against ICP + company + audit context.
- **Offer recommendation** capability (`recommend-offer`) is a Model Router capability that returns `{ offer_id, confidence, reasoning }`.

### 10.8 Offer → Deal → Proposal flow

- Deal creation may reference an `offer_id` (offer picked from a shortlist).
- On deal creation with `offer_id`, `offer_version` snaps to the current `offers.version` for the deal's lifetime.
- On proposal generation, `offer_snapshot` is populated with the full offer JSON at that moment. The proposal ships from the snapshot, not the live offer.
- If the deal's offer is intentionally replaced (product changed mid-cycle), both `offer_id` and `offer_version` update; historical `proposals` remain snapshot-immutable.

---

## 11. Calendar

### 11.1 `booking_links`

```sql
CREATE TABLE booking_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id     uuid NOT NULL REFERENCES auth.users(id),
  slug              citext NOT NULL,
  title             text NOT NULL,
  description       text,
  duration_minutes  integer NOT NULL,
  buffer_minutes    integer NOT NULL DEFAULT 15,
  availability      jsonb NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE UNIQUE INDEX uq_booking_links_ws_slug ON booking_links (workspace_id, slug) WHERE deleted_at IS NULL;
```

### 11.2 `calendar_connections`

```sql
CREATE TABLE calendar_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider              text NOT NULL,
  external_account_email citext NOT NULL,
  external_calendar_id  text NOT NULL,
  encrypted_access_token bytea NOT NULL,
  encrypted_refresh_token bytea NOT NULL,
  token_expires_at      timestamptz,
  scopes                text[] NOT NULL DEFAULT '{}',
  status                text NOT NULL DEFAULT 'active',
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_calendar_connections_ws_user_provider
  ON calendar_connections (workspace_id, user_id, provider) WHERE status = 'active';
```

---

## 12. Reminders

```sql
CREATE TYPE reminder_entity_enum AS ENUM ('contact', 'lead', 'deal', 'company');   -- rev 2: added 'company'
CREATE TYPE reminder_status_enum AS ENUM ('pending', 'completed', 'snoozed', 'dismissed');
CREATE TYPE reminder_source_enum AS ENUM ('manual', 'automation', 'agent');

CREATE TABLE reminders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id  uuid NOT NULL REFERENCES auth.users(id),
  entity_type    reminder_entity_enum NOT NULL,
  entity_id      uuid NOT NULL,
  note           text,
  due_at         timestamptz NOT NULL,
  snoozed_until  timestamptz,
  status         reminder_status_enum NOT NULL DEFAULT 'pending',
  source         reminder_source_enum NOT NULL DEFAULT 'manual',
  automation_id  uuid,
  agent_id       text,
  completed_at   timestamptz,
  completed_by   uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE INDEX idx_reminders_ws_owner_due
  ON reminders (workspace_id, owner_user_id, due_at)
  WHERE status = 'pending' AND deleted_at IS NULL;

CREATE INDEX idx_reminders_ws_entity
  ON reminders (workspace_id, entity_type, entity_id);
```

---

## 13. Dashboard Denormalization

### 13.1 `dashboard_metrics_daily`

```sql
CREATE TABLE dashboard_metrics_daily (
  workspace_id            uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  day                     date NOT NULL,
  revenue_generated       numeric(18,4) NOT NULL DEFAULT 0,
  revenue_currency        char(3) NOT NULL,
  hours_saved_estimate    numeric(8,2) NOT NULL DEFAULT 0,
  ai_tasks_completed      integer NOT NULL DEFAULT 0,
  meetings_booked         integer NOT NULL DEFAULT 0,
  outreach_sent           integer NOT NULL DEFAULT 0,
  outreach_positive       integer NOT NULL DEFAULT 0,
  reply_rate              numeric(5,2),
  pipeline_value_open     numeric(18,4) NOT NULL DEFAULT 0,
  deals_won               integer NOT NULL DEFAULT 0,
  deals_lost              integer NOT NULL DEFAULT 0,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, day)
);
```

### 13.2 `workspace_targets`

```sql
CREATE TYPE target_period_enum AS ENUM ('monthly', 'quarterly', 'annual');

CREATE TABLE workspace_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period        target_period_enum NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  revenue_target numeric(18,4) NOT NULL,
  currency      char(3) NOT NULL,
  meetings_target integer,
  reply_rate_target numeric(5,2),
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE UNIQUE INDEX uq_workspace_targets_ws_period_range
  ON workspace_targets (workspace_id, period, period_start)
  WHERE deleted_at IS NULL;
```

---

## 14. Notifications

```sql
CREATE TYPE notification_category_enum AS ENUM (
  'mention', 'assignment', 'reminder_due',
  'reply_received', 'proposal_signed', 'deal_won',
  'agent_escalation', 'system',
  'offer_recommendation'                                  -- rev 2
);

CREATE TABLE notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id),
  category       notification_category_enum NOT NULL,
  subject_type   text,
  subject_id     uuid,
  title          text NOT NULL,
  body           text,
  cta_url        text,
  read_at        timestamptz,
  dismissed_at   timestamptz,
  emitted_via    text[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_ws_recipient_unread
  ON notifications (workspace_id, recipient_user_id, created_at DESC)
  WHERE read_at IS NULL AND dismissed_at IS NULL;

CREATE INDEX idx_notifications_ws_category
  ON notifications (workspace_id, category);
```

### 14.1 `notification_preferences`

```sql
CREATE TABLE notification_preferences (
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category          notification_category_enum NOT NULL,
  in_app_enabled    boolean NOT NULL DEFAULT true,
  email_enabled     boolean NOT NULL DEFAULT true,
  digest_frequency  text NOT NULL DEFAULT 'immediate',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, category)
);
```

---

## 15. Action Log (append-only, tamper-evident)

```sql
CREATE TYPE autonomy_tier_enum AS ENUM ('assist', 'automate', 'autonomous', 'n_a');
CREATE TYPE reversibility_enum AS ENUM ('reversible', 'irreversible', 'n_a');

CREATE TABLE action_log (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_type               actor_type_enum NOT NULL,
  actor_user_id            uuid REFERENCES auth.users(id),
  actor_agent_id           text,
  action_type              text NOT NULL,
  subject_type             text NOT NULL,
  subject_id               uuid,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id               text,
  autonomy_tier_at_execution autonomy_tier_enum NOT NULL DEFAULT 'n_a',
  reversibility            reversibility_enum NOT NULL DEFAULT 'n_a',
  reversed_by_action_id    uuid REFERENCES action_log(id),
  prev_row_checksum        text,
  row_checksum             text NOT NULL,
  occurred_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_log_ws_time ON action_log (workspace_id, occurred_at DESC);
CREATE INDEX idx_action_log_ws_subject ON action_log (workspace_id, subject_type, subject_id);
CREATE INDEX idx_action_log_ws_actor ON action_log (workspace_id, actor_type, actor_user_id, actor_agent_id);
```

---

## 16. Event Journal

```sql
CREATE TABLE event_journal (
  id              text PRIMARY KEY,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL,
  version         integer NOT NULL,
  actor_type      actor_type_enum NOT NULL,
  actor_id        text NOT NULL,
  subject_type    text NOT NULL,
  subject_id      uuid,
  payload         jsonb NOT NULL,
  correlation_id  text,
  causation_id    text,
  occurred_at     timestamptz NOT NULL,
  emitted_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_journal_ws_name_time ON event_journal (workspace_id, name, occurred_at DESC);
CREATE INDEX idx_event_journal_ws_subject ON event_journal (workspace_id, subject_type, subject_id);
CREATE INDEX idx_event_journal_correlation ON event_journal (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_event_journal_ws_time_pruning ON event_journal (workspace_id, emitted_at);
```

Retention: 24 months. Pruned nightly.

---

## 17. Agent Primitives

### 17.1 `agent_registry` (global)

```sql
CREATE TABLE agent_registry (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  description     text NOT NULL,
  default_capabilities jsonb NOT NULL,
  minimum_tier    autonomy_tier_enum NOT NULL,
  reversibility_default reversibility_enum NOT NULL,
  active          boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### 17.2 `agent_policy_envelopes`

```sql
CREATE TABLE agent_policy_envelopes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id             text NOT NULL REFERENCES agent_registry(id),
  tier                 autonomy_tier_enum NOT NULL DEFAULT 'assist',
  budget_usd_daily     numeric(10,2),
  budget_usd_monthly   numeric(10,2),
  allowed_channels     text[] NOT NULL DEFAULT '{}',
  blocked_domains      text[] NOT NULL DEFAULT '{}',
  business_hours       jsonb,
  tone_rules           jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_threshold   integer,
  active               boolean NOT NULL DEFAULT false,
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_agent_policy_envelopes_ws_agent
  ON agent_policy_envelopes (workspace_id, agent_id);
```

---

## 18. AI Usage, Cost & Prompt Library

### 18.1 `ai_usage_events` (append-only)

```sql
CREATE TABLE ai_usage_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  request_id     text NOT NULL,
  capability     text NOT NULL,
  provider       text NOT NULL,
  model          text NOT NULL,
  input_tokens   integer NOT NULL,
  output_tokens  integer NOT NULL,
  cost_usd       numeric(12,6) NOT NULL,
  latency_ms     integer NOT NULL,
  caller_module  text NOT NULL,
  agent_id       text,
  prompt_id      text,
  prompt_version integer,
  prompt_library_id uuid,                                  -- rev 2: link to prompt_library if resolved from DB
  status         text NOT NULL,
  error          jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_events_ws_time ON ai_usage_events (workspace_id, occurred_at DESC);
CREATE INDEX idx_ai_usage_events_ws_capability ON ai_usage_events (workspace_id, capability, occurred_at DESC);
CREATE INDEX idx_ai_usage_events_ws_agent ON ai_usage_events (workspace_id, agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_ai_usage_events_ws_prompt ON ai_usage_events (workspace_id, prompt_library_id) WHERE prompt_library_id IS NOT NULL;
```

### 18.2 `ai_usage_daily`

```sql
CREATE TABLE ai_usage_daily (
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  day               date NOT NULL,
  total_calls       integer NOT NULL DEFAULT 0,
  total_cost_usd    numeric(12,4) NOT NULL DEFAULT 0,
  total_input_tokens bigint NOT NULL DEFAULT 0,
  total_output_tokens bigint NOT NULL DEFAULT 0,
  by_capability     jsonb NOT NULL DEFAULT '{}'::jsonb,
  by_model          jsonb NOT NULL DEFAULT '{}'::jsonb,
  by_agent          jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, day)
);
```

### 18.3 `prompt_library` (rev 2 — new)

Prompts as editable, versioned data. Global defaults (`workspace_id IS NULL`) ship with the product; workspaces may override.

```sql
CREATE TABLE prompt_library (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid REFERENCES workspaces(id) ON DELETE CASCADE,   -- NULL = global product default
  key                  citext NOT NULL,                                     -- stable slug (e.g. 'draft-outreach-email')
  version              integer NOT NULL,
  capability           text NOT NULL,                                       -- Model Router capability id
  template             text NOT NULL,                                       -- user prompt template
  system_message       text,                                                -- optional system prompt
  variables            jsonb NOT NULL DEFAULT '[]'::jsonb,                  -- [{ name, type, required, description }]
  expected_schema      jsonb,                                               -- JSON Schema for structured output
  examples             jsonb NOT NULL DEFAULT '[]'::jsonb,                  -- [{ input, output }]
  model_hint           text,                                                -- 'anthropic:claude-sonnet-5' | 'openai:gpt-5-mini' | ...
  provider_hint        text,                                                -- override router provider selection
  temperature          numeric(3,2),
  max_output_tokens    integer,
  reasoning_effort     text,                                                -- 'low' | 'medium' | 'high' (Claude/OpenAI reasoning-mode hint)
  notes                text,
  changelog            text,
  active               boolean NOT NULL DEFAULT false,
  is_default           boolean NOT NULL DEFAULT false,                      -- one active default per (workspace-or-global, key)
  overrides_prompt_library_id uuid REFERENCES prompt_library(id),           -- workspace prompt overriding a global default
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

-- Uniqueness across (workspace-or-global, key, version). Uses COALESCE trick so NULL workspace_id counts as 'global'.
CREATE UNIQUE INDEX uq_prompt_library_scope_key_version
  ON prompt_library (COALESCE(workspace_id::text, 'global'), key, version)
  WHERE deleted_at IS NULL;

-- One active default per (scope, key)
CREATE UNIQUE INDEX uq_prompt_library_scope_key_active_default
  ON prompt_library (COALESCE(workspace_id::text, 'global'), key)
  WHERE active = true AND is_default = true AND deleted_at IS NULL;

CREATE INDEX idx_prompt_library_capability
  ON prompt_library (capability, active) WHERE deleted_at IS NULL;

CREATE INDEX idx_prompt_library_key
  ON prompt_library (key) WHERE active = true AND deleted_at IS NULL;
```

**Resolution rule (used by the Model Router):**

Given a `capability` and current `workspace_id`:

1. If a workspace-scoped `prompt_library` row exists where `workspace_id = current`, `capability = X`, `active = true`, `is_default = true` → use it.
2. Else, fall back to global default (`workspace_id IS NULL`, `active = true`, `is_default = true`) for the same capability.
3. Else, fall back to the code-embedded default in `platform-ai-router/prompts/` (last-resort baseline).

This lets the product ship with global defaults (curated by us) while allowing workspaces to fine-tune without a code deploy.

**RLS on prompt_library (special-case):**

- Rows with `workspace_id IS NOT NULL`: standard workspace-isolation policy.
- Rows with `workspace_id IS NULL` (global): visible to all authenticated members via a special SELECT policy; writable only by `app_role_admin`.

```sql
CREATE POLICY prompt_library_workspace_isolation ON prompt_library
  FOR ALL TO app_role_features, app_role_lie
  USING (workspace_id IS NULL OR workspace_id = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);   -- writes must be workspace-scoped
```

Global rows are read-through, write-restricted to the admin role.

---

## 19. Integrations

```sql
CREATE TABLE integration_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provider              text NOT NULL,
  external_account_id   text,
  external_account_email citext,
  encrypted_access_token bytea NOT NULL,
  encrypted_refresh_token bytea,
  token_expires_at      timestamptz,
  scopes                text[] NOT NULL DEFAULT '{}',
  status                text NOT NULL DEFAULT 'active',
  last_used_at          timestamptz,
  last_error_at         timestamptz,
  last_error            jsonb,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  revoked_at            timestamptz
);

CREATE UNIQUE INDEX uq_integration_connections_ws_user_provider
  ON integration_connections (workspace_id, user_id, provider)
  WHERE status = 'active' AND user_id IS NOT NULL;

CREATE INDEX idx_integration_connections_ws_provider_status
  ON integration_connections (workspace_id, provider, status);
```

---

## 20. Custom Fields & Feature Flags

### 20.1 `custom_field_definitions`

```sql
CREATE TYPE custom_field_entity_enum AS ENUM ('contact', 'lead', 'deal', 'company');   -- rev 2: added 'company'
CREATE TYPE custom_field_type_enum AS ENUM (
  'text', 'long_text', 'number', 'currency', 'date', 'datetime',
  'boolean', 'url', 'email', 'single_select', 'multi_select'
);

CREATE TABLE custom_field_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type   custom_field_entity_enum NOT NULL,
  field_key     citext NOT NULL,
  field_label   text NOT NULL,
  field_type    custom_field_type_enum NOT NULL,
  options       jsonb,
  required      boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE UNIQUE INDEX uq_custom_field_definitions_ws_entity_key
  ON custom_field_definitions (workspace_id, entity_type, field_key) WHERE deleted_at IS NULL;
```

### 20.2 `feature_flags`

```sql
CREATE TABLE feature_flags (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key           text NOT NULL,
  enabled       boolean NOT NULL,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, key)
);

CREATE TABLE feature_flag_defaults (
  key           text PRIMARY KEY,
  enabled       boolean NOT NULL,
  description   text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

---

## 21. Row-Level Security — Uniform Pattern

Every business table gets the same RLS treatment. Applied via a migration helper.

### 21.1 Enable and default-deny

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
```

### 21.2 Standard policy

```sql
CREATE POLICY tenancy_isolation ON <table>
  FOR ALL
  TO app_role_features, app_role_lie
  USING  (workspace_id = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);
```

### 21.3 LIE-only write ACL (on LIE-owned tables)

```sql
REVOKE INSERT, UPDATE, DELETE ON <lie_table> FROM app_role_features;
GRANT  INSERT, UPDATE          ON <lie_table> TO   app_role_lie;
GRANT  SELECT                  ON <lie_table> TO   app_role_features;
```

Applies to: `relationship_profiles`, `lead_scores`, `outreach_queue_items`, `memory_vectors`, `knowledge_document_chunks`, `audits`, `audit_findings`, `audit_deltas`.

**Not LIE-locked (rev 2 clarification):** `knowledge_documents`, `offers`, `icps`, `prompt_library` are user-editable (feature-role writes) — the *chunk* / vectorization outputs are LIE-owned, but the source documents are content.

### 21.4 Global tables (no workspace_id)

`agent_registry`, `feature_flag_defaults`, `prompt_library (workspace_id IS NULL)` — read-open, write-restricted to `app_role_admin`.

### 21.5 Verification

- Every migration adding a new business table is linted for: `workspace_id` column present + `ENABLE ROW LEVEL SECURITY` + policy defined.
- Tenancy Fuzzer probes every table with cross-workspace tokens (architecture §4.5).

---

## 22. Enum Type Catalogue

- `workspace_role_enum` — owner, admin, member, guest
- `outreach_readiness_enum` — cold, warming, ready, avoid
- `activity_type_enum` — email_sent, email_replied, ... (see §4.4; rev 2 added: `offer_presented`, `offer_recommended`, `kb_document_referenced`)
- `actor_type_enum` — user, agent, system, integration
- `company_size_enum` (**rev 2**) — solo, micro, small, medium, large, enterprise
- `lead_status_enum` — see §5.1
- `audit_status_enum` — pending, running, completed, failed
- `finding_category_enum` — cta, booking, mobile, trust, conversion, performance, seo, forms, brand, accessibility
- `finding_severity_enum` — low, medium, high, critical
- `memory_scope_enum` (**rev 2 extended**) — workspace, company, contact, lead, deal, project, audit, knowledge_doc, offer, icp
- `knowledge_doc_type_enum` (**rev 2**) — sop, offer_narrative, pricing_note, case_study, testimonial, faq, onboarding, sales_playbook, brand_voice, legal_terms, objection_handling, other
- `knowledge_doc_visibility_enum` (**rev 2**) — internal, client_shareable
- `offer_pricing_model_enum` (**rev 2**) — fixed, tiered, retainer, performance, custom
- `offer_status_enum` (**rev 2**) — draft, active, paused, retired
- `next_best_action_enum` (**rev 2 extended**) — draft_email, draft_ig_dm, draft_linkedin_dm, send_loom, schedule_followup, wait_cooldown, present_offer, disqualify
- `outreach_channel_enum` — email, ig_dm, linkedin_dm, sms, call
- `outreach_direction_enum` — outbound, inbound
- `outreach_status_enum` — draft, queued, sent, opened, replied, bounced, unsubscribed, failed
- `outreach_sentiment_enum` — positive, neutral, negative, objection, unsubscribe
- `proposal_status_enum` — draft, sent, viewed, signed, declined, expired
- `meeting_status_enum` — scheduled, completed, cancelled, no_show
- `reminder_entity_enum` (**rev 2 extended**) — contact, lead, deal, company
- `reminder_status_enum` — pending, completed, snoozed, dismissed
- `reminder_source_enum` — manual, automation, agent
- `notification_category_enum` (**rev 2 extended**) — mention, assignment, reminder_due, reply_received, proposal_signed, deal_won, agent_escalation, system, offer_recommendation
- `target_period_enum` — monthly, quarterly, annual
- `autonomy_tier_enum` — assist, automate, autonomous, n_a
- `reversibility_enum` — reversible, irreversible, n_a
- `custom_field_entity_enum` (**rev 2 extended**) — contact, lead, deal, company
- `custom_field_type_enum` — see §20.1

Enum evolution rule: append-only in migrations. Removing an enum value requires a data migration + rename.

---

## 23. Indexes Catalogue

**High-value composite indexes (from the sections above):**

- `contacts (workspace_id, primary_email_normalized)` UNIQUE where active
- `contacts (workspace_id, company_id)` — company-by-company contact lookup
- `companies (workspace_id, domain_normalized)` UNIQUE where domain non-empty and active
- `companies (workspace_id, name)` trigram gin — fuzzy company match on import
- `leads (workspace_id, status)` where active
- `leads (workspace_id, company_id)` — leads-per-company reporting
- `lead_scores (workspace_id, opportunity_score DESC)` — Gold Leads hot path
- `lead_scores (workspace_id, icp_id)` — ICP performance reporting
- `outreach_queue_items (workspace_id, priority_rank)` — Gold Leads materialized
- `outreach_queue_items (workspace_id, recommended_offer_id)` — offer-recommendation coverage
- `outreach_messages (workspace_id, contact_id, created_at DESC)` — activity feed
- `outreach_messages (workspace_id, company_id, created_at DESC)` — company-level outreach view
- `deals (workspace_id, pipeline_id, stage_key)` — pipeline view
- `deals (workspace_id, company_id)` — company deals
- `deals (workspace_id, offer_id)` — offer attach rate reporting
- `proposals (workspace_id, offer_id)` — proposal per offer analytics
- `meetings (workspace_id, scheduled_at)` — Upcoming Meetings widget
- `meetings (workspace_id, company_id)` — company meetings
- `reminders (workspace_id, owner_user_id, due_at)` where pending — Follow-ups Due
- `memory_vectors` HNSW on embedding + `(workspace_id, scope, subject_id)` — retrieval hot path
- `knowledge_documents (workspace_id, doc_type)` where active — KB browsing
- `knowledge_document_chunks (knowledge_document_id, chunk_index)` UNIQUE — index rebuilds
- `offers (workspace_id, status)` where active — offer browsing
- `offers (workspace_id, target_industries)` gin — offer discovery by industry
- `icps (workspace_id, active)` — active ICP enumeration
- `prompt_library (capability, active)` — Router resolution
- `event_journal (workspace_id, name, occurred_at DESC)` — replay + analytics
- `action_log (workspace_id, occurred_at DESC)` — audit browsing

---

## 24. Entity Relationship (text ERD)

```
workspaces (1) ────< workspace_members >──── auth.users
     │
     ├──< companies                                                     [ ← rev 2]
     │       │
     │       ├──< contacts >──1:1── relationship_profiles         [LIE]
     │       │       │
     │       │       ├──< contact_emails
     │       │       ├──< activity_timeline (also links company_id, deal_id)
     │       │       ├──1:1── leads (denormalizes company_id)
     │       │       │           │
     │       │       │           ├──1:1── lead_scores >── icps   [LIE, rev 2]
     │       │       │           │                        \
     │       │       │           │                         ────< lead_score_history
     │       │       │           └──1:1── outreach_queue_items >── offers [LIE, rev 2]
     │       │       │
     │       │       ├──< outreach_messages >── offers                  [rev 2]
     │       │       ├──< outreach_sequence_enrollments >── outreach_sequences
     │       │       ├──< reminders (polymorphic — now includes company)
     │       │       └──< deal_contacts >── deals
     │       │                                │
     │       │                                ├──< proposals >── offers [rev 2]
     │       │                                ├──< meetings
     │       │                                ├──< outreach_messages (denorm)
     │       │                                └── offers                [rev 2 — deals.offer_id]
     │       │
     │       ├──< audits >── audit_findings                             [LIE]
     │       │        └──< audit_deltas
     │       ├──< meetings
     │       └──< loom_scripts
     │
     ├──< icps                                                          [rev 2]
     ├──< offers                                                        [rev 2]
     ├──< knowledge_documents >── knowledge_document_chunks             [rev 2, LIE chunks]
     │
     ├──< memory_vectors >── memory_annotations                         [LIE]
     ├──< pipelines
     ├──< booking_links
     ├──< calendar_connections
     ├──< scoring_rubrics
     ├──< custom_field_definitions
     ├──< feature_flags
     ├──< workspace_targets
     ├──< dashboard_metrics_daily
     ├──< notifications
     ├──< notification_preferences
     ├──< integration_connections
     ├──< ingest_batches
     ├──< action_log             (append-only)
     ├──< event_journal          (append-only)
     ├──< ai_usage_events        (append-only)
     ├──< ai_usage_daily
     ├──< prompt_library         (workspace-scoped + global rows)       [rev 2]
     └──< agent_policy_envelopes >── agent_registry (global)
```

---

## 25. Data Lifecycle & Retention

| Data | Retention | Deletion mechanism |
|---|---|---|
| Business rows (contacts, companies, leads, deals, ...) | Indefinite while workspace active; 30-day soft delete → hard delete | Nightly job |
| `knowledge_documents`, `offers`, `icps` — soft delete | 30 days → hard delete + cascade chunk/vector purge | Nightly job |
| `knowledge_document_chunks` + related `memory_vectors` | Deleted when parent knowledge_doc is hard-deleted OR on re-index | Cascade / two-phase swap |
| Workspace hard-delete | Immediate on owner action; 30-day recoverable | Cascade + purge job |
| `action_log` | Indefinite while workspace active; export before workspace hard-delete | With workspace |
| `event_journal` | 24 months | Nightly prune by (workspace_id, emitted_at) |
| `ai_usage_events` | 13 months | Nightly prune |
| `ai_usage_daily` | Indefinite (small volume) | With workspace |
| `memory_vectors` with `ttl_at` | Until `ttl_at` | Nightly TTL job |
| `memory_vectors` without TTL | Indefinite while workspace active | With workspace |
| `outreach_queue_items` past `expires_at` | Purged nightly | Nightly job |
| `prompt_library` — workspace rows | Kept indefinitely; superseded versions kept for reproducibility | Manual archive |
| `prompt_library` — global rows | Kept indefinitely | Product ops |
| Screenshots and audit artifacts (Storage) | 12 months uncited; indefinite if attached to won deal | Storage lifecycle |
| Point-in-time backups | 7 days rolling (Supabase default) | Automatic |

DSAR handling: manual runbook in v0.1; tooling in Phase 3 (PRD DATA-005).

---

## 26. Storage Layout (Supabase Storage)

| Bucket | Path template | Purpose |
|---|---|---|
| `workspace-assets` | `workspace/<workspace_id>/brand/<file>` | Logos, favicons, brand assets |
| `audits` | `workspace/<workspace_id>/audits/<audit_id>/<file>` | Screenshots, exports |
| `proposals` | `workspace/<workspace_id>/proposals/<proposal_id>/<file>` | PDF exports, attachments |
| `knowledge` | `workspace/<workspace_id>/knowledge/<knowledge_document_id>/<file>` | KB uploads (PDFs, images) — rev 2 |
| `offers` | `workspace/<workspace_id>/offers/<offer_id>/<file>` | Offer imagery, brochures, case-study PDFs — rev 2 |
| `attachments` | `workspace/<workspace_id>/attachments/<entity_type>/<entity_id>/<file>` | User uploads on contacts, deals, companies |
| `imports` | `workspace/<workspace_id>/imports/<batch_id>.csv` | Raw import files |

All uploads go through signed-URL flow gated on workspace membership.

---

## 27. Migration Strategy

- **Tool:** `drizzle-kit` for schema generation + Supabase CLI for applying migrations.
- **Forward-only + backward-compatible.**
- **Zero destructive migrations tied to a code deploy.**
- **RLS lint** in CI verifies every business table has `workspace_id` + RLS + policy.
- **Enum evolution:** append-only.
- **Point-in-time recovery** is the safety net.

**Migration order note for rev 2:** `companies` must be created before the FK backfill onto `contacts`; `icps` before `offers` (offers reference icp); both before `knowledge_documents`; `knowledge_document_chunks` after `memory_vectors`.

---

## 28. Assumptions

| ID | Assumption | If false |
|---|---|---|
| ASM-DB-001 | pgvector 0.7+ available on Supabase Pro (US-East) | Fallback: IVFFlat if HNSW not ready |
| ASM-DB-002 | Single Postgres primary sufficient to 500 workspaces / 5M contacts | Escape hatch in architecture §13 |
| ASM-DB-003 | JSONB shapes < ~64KB per row for hot custom-field paths | Promote to columns |
| ASM-DB-004 | `text-embedding-3-small` (1536 dims) default embedder | Model swap requires migration + full re-embed |
| ASM-DB-005 | Supabase Vault production-ready for OAuth token encryption | Fallback: AES-GCM at app layer |
| ASM-DB-006 | Global prompt_library rows can be seeded pre-launch via `app_role_admin` | Fallback: bootstrap script |
| ASM-DB-007 | Companies can be domain-resolved from ~70% of contact emails at import | Manual match UI handles the rest |

---

## 29. Risks

| Risk | Mitigation |
|---|---|
| HNSW index build cost as memory grows | Partition `memory_vectors` by workspace once >1M vectors |
| Enum drift between DB and TypeScript | Generated types via drizzle-kit; CI verifies |
| RLS bypass via forgotten GUC | Middleware always sets GUC; Tenancy Fuzzer |
| JSONB abuse as ad-hoc table | Design review: if filtered/sorted/joined, promote to column |
| `event_journal` growth | Monthly partitioning past 50M rows |
| Cross-workspace FK by accident | RLS blocks; code review checklist |
| `knowledge_document_chunks` orphans on re-index race | Two-phase swap (new chunks inserted before old chunks deleted) |
| **Offer snapshot drift** — client receives an unsnapshotted offer | `offer_snapshot` populated on proposal send is enforced; nightly integrity check |
| **Prompt Library global-vs-workspace confusion** — workspace edits a global prompt accidentally | Global rows only writable by admin role; UI clearly labels source |
| **ICP proliferation** — workspace creates 30 ICPs, scoring cost balloons | Soft cap at 5 active ICPs per workspace (UI warning); no hard DB limit |

---

## 30. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | UUID v4 as universal primary key; ULID for events only | UUIDs give clean FK semantics; ULIDs give sortable idempotency keys where ordering matters |
| 2026-07-01 | Soft delete + 30-day retention → hard delete | Undo-ability without indefinite dead-row bloat |
| 2026-07-01 | `citext` for emails and slugs; case-insensitive uniqueness | Prevents duplicates from case-varying emails |
| 2026-07-01 | RLS uses a session GUC (`app.workspace_id`), not a JWT claim | Works for user-driven and system-driven (Inngest steps) contexts |
| 2026-07-01 | `pipelines.stages` as JSONB, deals reference `stage_key` | Reordering is JSONB edit; deals do not need FK to stage row |
| 2026-07-01 | LIE tables have Postgres-role write ACLs on top of ESLint boundaries | Belt-and-braces isolation |
| 2026-07-01 | Opportunity Score = f(Fit, Readiness) as three columns | Independent signals + composite |
| 2026-07-01 | Score history append-only; latest in `lead_scores` PK (ws, lead) | Fast latest-read + full audit |
| 2026-07-01 | Memory embeddings via pgvector; `agent_id` column exists in v0.1 | Agent Layer primitive present from day one |
| 2026-07-01 | Money as `numeric(18,4)` + `char(3)` currency | No FP drift; ISO 4217 explicit |
| 2026-07-01 | Action Log tamper-evidence via SHA-256 checksum chain per workspace | Matches NFR-SEC-006 |
| 2026-07-01 | Event Journal is a Postgres mirror of Inngest | Runtime-swap escape hatch + long-term replay |
| 2026-07-01 | Custom fields via JSONB + `custom_field_definitions` | Avoids EAV bloat |
| 2026-07-01 | `agent_registry` global, `agent_policy_envelopes` workspace-scoped | Agents are product primitives; envelopes are customer config |
| 2026-07-01 | HNSW index on `memory_vectors.embedding` with cosine ops | Best latency at expected vector counts |
| 2026-07-01 | `text-embedding-3-small` (1536 dims) default embedder | Cost/quality trade-off |
| 2026-07-01 (rev 2) | **Companies as parent to Contacts (1:N)** | Matches real agency B2B sales; enables company-level scoring, activity, deals |
| 2026-07-01 (rev 2) | **`contacts.company_name` retained as display cache alongside `company_id`** | Imports arrive with strings; resolution is async |
| 2026-07-01 (rev 2) | **Company-level `relationship_profile` deferred to Phase 2 (view-only in v0.1)** | Company aggregation is derivable; promote to stored table when read cost warrants |
| 2026-07-01 (rev 2) | **ICPs as first-class workspace entity with vectorized narrative** | Feeds AI Memory retrieval + drives Fit score composition |
| 2026-07-01 (rev 2) | **Fit score = 0.6 × ICP match + 0.2 × website signal + 0.2 × enrichment** | ICP match dominates; overrideable per workspace via rubric definition |
| 2026-07-01 (rev 2) | **Knowledge Documents as editable source of truth; chunked into `memory_vectors`** | Owners edit prose in one place; AI Memory rebuilds on hash change |
| 2026-07-01 (rev 2) | **Two-phase chunk swap on re-index** (new chunks inserted before old deleted) | No retrieval gap during re-indexing |
| 2026-07-01 (rev 2) | **Offers as structural entity + vectorized narrative** | AI can recommend offers; structured pricing/deliverables preserved |
| 2026-07-01 (rev 2) | **`proposals.offer_snapshot` — immutable snapshot at send time** | Legal-grade evidence; pricing changes cannot retroactively alter signed proposals |
| 2026-07-01 (rev 2) | **`deals.offer_version` snapshots the offer version at deal creation** | Tracks which iteration of the offer the deal is closing on |
| 2026-07-01 (rev 2) | **Prompt Library with global defaults + workspace overrides** | Prompts become editable data; product ships opinionated defaults; workspaces fine-tune without a deploy |
| 2026-07-01 (rev 2) | **Prompt Library global rows visible to all workspaces but only writable by `app_role_admin`** | Prevents accidental cross-workspace edits while enabling read fallback |
| 2026-07-01 (rev 2) | **Router resolution: workspace default → global default → code-embedded baseline** | Three-tier fallback keeps AI operational even if DB prompt is misconfigured |
| 2026-07-01 (rev 2) | **`memory_scope_enum` extended with company, knowledge_doc, offer, icp** | Explicit scoping lets retrieval filter precisely |
| 2026-07-01 (rev 2) | **`recommended_offer_id` on `outreach_queue_items`** | Offer suggestion is a first-class NBA facet, not a footnote |
| 2026-07-01 (rev 2) | **Soft cap 5 active ICPs per workspace (UI-warning only, no DB constraint)** | Prevents ICP-explosion; leaves room for structural exceptions |

---

## 31. Open Questions

1. **Embedding model choice.** `text-embedding-3-small` (1536) is the default. Confirm.
2. **HNSW vs. partitioned HNSW for `memory_vectors`.** Default: unpartitioned HNSW. Partition trigger: >1M vectors. Confirm.
3. **`event_journal` partitioning strategy.** Monthly range partition past 50M rows. Confirm.
4. **Column-level encryption for `outreach_messages.body`.** Recommendation: no in v0.1; revisit at SOC 2 prep.
5. **`contacts.phones` as table** (Phase 3, when SMS ships). Confirm timing.
6. **Include a `projects` stub in v0.1** so Website Intelligence can attach to a project once Phase 2 lands. Recommendation: yes.
7. **LIE Postgres role name** (`app_role_lie` vs. `app_role_intelligence`). Confirm.
8. **(new) Should `companies` support a `parent_company_id` for group/subsidiary relations?** Recommendation: not in v0.1 — Phase 2 when we encounter it. Confirm.
9. **(new) `knowledge_documents.content_rich` (tiptap JSON) vs. plain markdown source.** Recommendation: markdown as canonical, rich JSON as optional editor state. Confirm.
10. **(new) Chunk size + overlap for KB vectorization.** Default: 500 tokens / 100 overlap. Confirm or delegate.
11. **(new) Global prompt seeding process.** Ship a `prompt_library_seed.sql` fixture per release; workspace ops re-runs on release upgrade. Confirm.
12. **(new) When an offer is superseded, do live deals auto-attach the new version?** Recommendation: no — deals lock to their creation-time `offer_version`; owner explicitly upgrades. Confirm.
13. **(new) Should `icps.narrative` support versioned history like `scoring_rubrics`?** Recommendation: yes — extend `icps.version` semantics + add `icp_history` (Phase 2 nicety, not v0.1). Confirm.

---

## 32. Approval Gate

To move to `05_User_Flows.md`, the founder must sign off on:

1. **Table set as defined** (47 tables in v0.1). New in rev 2: `companies`, `icps`, `knowledge_documents`, `knowledge_document_chunks`, `offers`, `prompt_library`. Extensions to existing tables: `contacts.company_id`, `activity_timeline.company_id`, `leads.company_id`, `audits.company_id`, `outreach_messages.company_id`, `outreach_messages.offer_id`, `meetings.company_id`, `loom_scripts.company_id`, `deals.company_id`, `deals.offer_id`, `deals.offer_version`, `proposals.offer_id`, `proposals.offer_version`, `proposals.offer_snapshot`, `outreach_queue_items.company_id`, `outreach_queue_items.recommended_offer_id`, `lead_scores.icp_id`, `lead_scores.icp_match_score`, `lead_scores.icp_match_signals`.
2. **LIE write-role restrictions** as designed (§2.2, §21.3) — extended to `knowledge_document_chunks`.
3. **Action Log tamper-evidence** via checksum chain.
4. **Event Journal** in Postgres with 24-month retention.
5. **Agent primitives** with `active = false` defaults.
6. **`text-embedding-3-small` at 1536 dims** as default embedder (Q1).
7. **Projects stub in v0.1** (Q6).
8. **Companies-as-parent** model (rev 2) with async resolution of `company_name` → `company_id`.
9. **Fit score composition** = 0.6 × ICP match + 0.2 × website + 0.2 × enrichment (workspace-configurable).
10. **Two-phase chunk swap** on knowledge_document / offer / ICP re-index.
11. **Prompt Library three-tier resolution** (workspace → global → code baseline) with global rows admin-write-only.
12. **Offer snapshot** on proposal send; deals locked to `offer_version` at creation.

Once signed off, `04a_DDL.sql` will be generated from Drizzle schemas as the executable migration for the initial deploy.

---

*End of 04_Database_Design.md*

---

**Next: `05_User_Flows.md` — proceeding now.**

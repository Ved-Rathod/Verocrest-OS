# 05 — User Flows

**Document:** User Journeys, Flow Diagrams, Decision Points & Failure States
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint — Core Engine First)
**Status:** Draft for approval
**Owner:** Founder / CTO / PM / UX
**Depends on:** `01_Vision.md`, `02_Product_Requirements.md`, `03_System_Architecture.md`, `04_Database_Design.md`
**Last updated:** 2026-07-01

---

## 0. How to read this document

This document defines the **behavior contract** between users and Verocrest OS for every load-bearing journey in Version 0.1.

Each flow specifies:

- **Actor** — who initiates it
- **Trigger** — what starts it
- **Preconditions** — what must be true first
- **Happy path** — the golden route, step by step
- **Decision points** — where the user or system chooses a branch
- **Failure states** — every way the flow can break, and the recovery
- **Events emitted** — the Agency Event Bus (§8 of arch) events fired at each stage
- **FR IDs covered** — traceability back to `02_Product_Requirements.md`
- **Screens involved** — logical, not pixel-level (UI details in `07_UI_UX_System.md`)

**Scope of Version 0.1:** flows that support *client acquisition* — signup, workspace setup, ICP/Offer/KB config, lead ingest through signed proposal. Delivery-side flows (Client Portal, projects, invoicing) are marked as Phase 2 hooks where they intersect with acquisition.

If a downstream module contradicts the behavior specified here, this document wins until formally amended.

---

## 1. Flow Conventions

### 1.1 Notation

Flows use a light textual DSL rather than diagram images (which rot):

```
Actor → [Screen] → Action → [System response]
   │
   ├── if <condition> → branch A
   └── else → branch B
```

- `[Screen]` — a named surface the user is looking at
- `Action` — user-initiated (click, type, submit) or system-initiated (event, cron)
- `[System response]` — what the user perceives (or the state the system moves to)
- `▶ event.name` — an Agency Event Bus event emitted at this step
- `⚠ failure: <label>` — a failure state, referenced in §14

### 1.2 Actor roles (v0.1)

| Actor | Definition |
|---|---|
| **Owner** | Founder / agency principal. First member of a workspace. Full permissions. |
| **Member** | Any additional workspace member. In v0.1, near-identical permissions to Owner (roles hardened in Phase 3). |
| **Prospect** | External human interacting with the workspace's booking link or receiving outreach. **Not** a Verocrest OS user. |
| **Client** | Signed customer of the workspace's agency. Not a Verocrest OS user in v0.1 (Client Portal ships Phase 2). |
| **System** | Cron, scheduler, event bus dispatcher. |
| **AI Substrate** | Model Router + Memory + LIE services acting on behalf of a human actor. Not a full "agent" in v0.1 (Agent Layer is Phase 3+). |

### 1.3 State model shorthand

Where a flow references entity state, we use the enums from `04_Database_Design.md`:

- Lead: `new → enriching → scored → ready → contacted → engaged → meeting_booked → meeting_held → proposal_sent → won | lost`
- Outreach: `draft → queued → sent → opened → replied | bounced | unsubscribed`
- Proposal: `draft → sent → viewed → signed | declined | expired`
- Reminder: `pending → completed | snoozed | dismissed`

### 1.4 Event emission convention

Every flow annotates event emissions inline (`▶ lead.scored`). The full catalogue and payload shapes live in `03_System_Architecture.md` §8.3.

---

## 2. New User Onboarding — Owner First Signup

**Actor:** first-time Owner (the founder)
**Trigger:** landing on `verocrest.app/signup` or via an invite link (Phase 3)
**Preconditions:** none

### 2.1 Happy path

```
[Signup screen]
   ↓ owner submits email + password OR clicks "Continue with Google"
   ↓
   ├── Email/password path
   │     ↓ Supabase Auth creates auth.users row
   │     ↓ Verification email sent via Resend
   │     ▶ auth.user.created (system event, not on Agency Bus in v0.1)
   │     ↓ owner clicks verification link
   │     ↓ session established
   │
   └── Google OAuth path
         ↓ Google consent screen
         ↓ callback → session established (no email verification needed)

[Post-auth: Workspace Creation]
   ↓ owner enters workspace name (default slug generated)
   ↓ owner picks timezone (auto-detected from browser)
   ↓ owner picks default currency (default: user's locale)
   ↓ owner picks primary niche: "Dental Clinics" | "High-Ticket Coaches" | "Other"
   ↓
   [System]
     • INSERT workspaces (…)
     • INSERT workspace_members (role='owner', …)
     • Set active workspace cookie (vc_active_workspace)
     • Emit ▶ workspace.created
     • Provision niche-preset:
         - If Dental → seed a "Dental Clinics – Primary" ICP (from templates)
         - If Coaches → seed a "High-Ticket Coaches – Primary" ICP
         - If Other → skip ICP seeding
     • Attach global default prompts (prompt_library workspace_id IS NULL entries visible)
   ↓
[Onboarding Checklist screen]  (§3)
```

### 2.2 Decision points

| Point | Choice | Consequence |
|---|---|---|
| Auth method | Email/password vs Google OAuth | Email/password requires verification click before continuing; Google skips it |
| Niche selection | Dental / Coaches / Other | Seeds a starter ICP + surfaces relevant onboarding templates |
| Workspace slug | Auto-generated or overridden | Slug is used in booking-link URLs (§10); collision is checked live |

### 2.3 Failure states

| Code | Trigger | Recovery |
|---|---|---|
| `F-ONB-001` | Email already registered | Redirect to sign-in; offer password reset |
| `F-ONB-002` | Google OAuth callback fails (denied consent) | Return to signup with a clear "we need X permissions" message |
| `F-ONB-003` | Verification email not received | "Resend verification" action; check spam guidance |
| `F-ONB-004` | Workspace slug collision | Inline validation; suggest slug variants |
| `F-ONB-005` | Supabase down | Show status page link; retry-with-backoff |

### 2.4 Events emitted

`workspace.created` (v1)

### 2.5 FR coverage

FR-IDT-001, 002, 003, 005, 006, 007, 011; FR-WS-001, 002, 003, 005

---

## 3. Workspace Setup — The First-Session Checklist

The Onboarding Checklist is the single most important screen in Verocrest OS Version 0.1 — it converts a new workspace from empty to Gold-Leads-visible in one session.

**Actor:** Owner
**Trigger:** first sign-in after workspace creation, or any time the checklist is < 100% and the user opens it
**Preconditions:** workspace exists, session active

### 3.1 Checklist items (ordered)

1. **Connect Google Workspace** (Gmail + Calendar OAuth)
2. **Configure your first ICP**
3. **Add your first Offer**
4. **Upload core Knowledge Documents** (SOP, case study, testimonial — minimum 1 each)
5. **Set your Revenue Target** (monthly + quarterly)
6. **Import your first leads** (CSV or manual)
7. **Run your first Website Audit**

Each item is a card with a status pill (`Not started` / `In progress` / `Done`) and a primary action.

### 3.2 Item 1 — Connect Google Workspace

**Recommended:** dedicated Verocrest Workspace (not personal Gmail). See architecture §3.14.

```
[Checklist] → click "Connect Google"
   ↓
[Google OAuth consent — Gmail send + Calendar read/create + Profile]
   ↓
   ├── granted → callback → INSERT integration_connections (provider='google_gmail')
   │             + INSERT calendar_connections
   │             ▶ integration.google.connected
   │             → Checklist item → Done
   │
   └── denied → return with reason
                ⚠ failure: F-INT-001
```

### 3.3 Item 2 — Configure your first ICP

If the niche selection in §2 seeded an ICP, this item starts pre-filled but marked "In progress" until the owner reviews and activates it.

```
[Checklist] → click "Configure ICP"
   ↓
[ICP editor]
   • Name
   • Short description
   • Long narrative (this is what feeds AI Memory)
   • Target industries (multi-select)
   • Target geographies (ISO country multi-select)
   • Target company size (multi-select from company_size_enum)
   • Revenue range
   • Signals (structured: website booking present, ad-spend, tech stack, etc.)
   • Disqualifiers
   ↓ owner clicks "Save & Activate"
   ↓
   [System]
     • UPSERT icps (…, active=true, is_primary=true if first)
     • Emit ▶ icp.upserted
     • LIE Knowledge Indexer subscribes → chunks narrative → embeddings → memory_vectors (scope='icp')
     • Emit ▶ icp.indexed on completion
   ↓ Checklist item → Done
```

### 3.4 Item 3 — Add your first Offer

```
[Checklist] → click "Add Offer"
   ↓
[Offer editor]
   • Name + slug
   • Short description + positioning
   • Target ICP (dropdown from active ICPs)
   • Target company size + industries
   • Pricing model (fixed / tiered / retainer / performance / custom)
   • Price + currency + billing cadence
   • Deliverables (structured list)
   • Guarantees (structured list)
   • ROI narrative + metrics
   • Onboarding steps + requirements
   ↓ owner clicks "Save as Draft" or "Save & Activate"
   ↓
   [System]
     • UPSERT offers (…, status='draft' or 'active')
     • If active → LIE Knowledge Indexer chunks the offer narrative
     • Emit ▶ offer.upserted → ▶ offer.indexed
   ↓ Checklist item → Done (once at least one active offer exists)
```

### 3.5 Item 4 — Upload core Knowledge Documents

```
[Checklist] → click "Add Knowledge Documents"
   ↓
[Knowledge Base browser] → click "New Document"
   ↓
[Knowledge Document editor]
   • Doc type (sop | case_study | testimonial | pricing_note | faq | onboarding | sales_playbook | brand_voice | objection_handling | other)
   • Title
   • Content (markdown editor)
   • Tags
   • Linked entity (optional: an offer, an ICP, a company)
   ↓ owner clicks "Save"
   ↓
   [System]
     • INSERT knowledge_documents (…, is_indexed=false)
     • Emit ▶ knowledge_doc.upserted
     • LIE Knowledge Indexer:
        - Chunks content (500 tokens / 100 overlap default)
        - Produces embeddings (Model Router capability 'embed-knowledge')
        - INSERT knowledge_document_chunks (…) + memory_vectors (scope='knowledge_doc', subject_id=doc.id)
        - UPDATE knowledge_documents SET is_indexed=true, last_indexed_at=now()
        - Emit ▶ knowledge_doc.indexed
   ↓ Checklist item → Done (once ≥ 3 knowledge docs across at least 2 doc types are indexed)
```

### 3.6 Item 5 — Set Revenue Target

```
[Checklist] → click "Set Revenue Target"
   ↓
[Target dialog]
   • Monthly revenue target + currency
   • Quarterly revenue target
   • (Optional) meetings target
   • (Optional) reply rate target
   ↓ Save
   ↓
   [System]
     • INSERT workspace_targets (period='monthly', period='quarterly')
     • Emit ▶ target.set
   ↓ Checklist item → Done; FR-DASH-006 (Revenue Target widget) becomes populated
```

### 3.7 Item 6 — Import your first leads

Two paths: CSV upload or manual entry. Manual entry is faster for testing; CSV is the real workflow.

**CSV path:**

```
[Checklist] → click "Import Leads"
   ↓
[CSV Import — Step 1: Upload]
   ↓ owner drops a CSV
   ↓ [System] parses header row + first 5 rows for preview
   ↓
[CSV Import — Step 2: Map columns]
   • Auto-suggests mappings for: first_name, last_name, primary_email, company_name, role_title, phone, website, source
   • Owner adjusts mappings; unmatched columns can be sent to custom_fields
   ↓ Next
   ↓
[CSV Import — Step 3: Dry run]
   • Shows: N rows total, K would create new contacts, D would dedupe on primary_email, X would error
   • Errors are line-specific (invalid email, missing required field)
   ↓ owner clicks "Import"
   ↓
   [System]
     • INSERT ingest_batches (status='running')
     • For each row (async via Inngest):
         - Resolve / create company (fuzzy match on company_name + domain-from-email)
         - UPSERT contact (dedupe on workspace_id + primary_email_normalized)
         - INSERT lead (status='new')
         - Emit ▶ lead.ingested
     • UPDATE ingest_batches (status='completed', success_count, error_count)
   ↓
   [Downstream — automatic per lead]
     ▶ lead.ingested → enrichment worker
        - Enrich via provider (Clearbit/Apollo-class API; MVP: minimal enrichment from email domain)
        - UPDATE contact (fields added)
        - Emit ▶ lead.enriched
     ▶ lead.enriched → scoring worker
        - Match against active ICPs → compute icp_match_score
        - Score fit + readiness + opportunity
        - UPSERT lead_scores + INSERT lead_score_history
        - Emit ▶ lead.scored
     ▶ lead.scored → Outreach Queue refresh
        - Compute next_best_action + recommended_offer
        - UPSERT outreach_queue_items
        - Emit ▶ outreach.queue.updated
   ↓ Checklist item → Done
```

**Manual entry path:**

```
[Checklist] → click "Add Lead"
   ↓
[Quick Add Lead dialog] — name, email, company (or company_id lookup), source
   ↓ Save
   ↓ Same downstream fan-out as CSV path (single-row batch)
```

### 3.8 Item 7 — Run your first Website Audit

Typically the owner runs this on a Gold Lead surfaced from step 6. Detailed flow in §7.

```
[Checklist] → click "Run First Audit"
   ↓
[Audit request dialog]
   • URL (pre-filled if a lead has a website_url)
   • Attach to: (dropdown) — Lead / Company / Contact / Standalone
   ↓ Run
   ↓ Full flow in §7
```

### 3.9 Checklist completion

- The checklist auto-closes when all 7 items are Done.
- A "confetti + welcome" moment marks completion (only chance to use motion; UI details in `07_UI_UX_System.md`).
- Emits `▶ workspace.onboarded`.
- Dashboard widgets from that moment onward will have real data.

### 3.10 Failure states

See §14 for the full catalogue. Relevant to onboarding:

- `F-INT-001` — Google OAuth denied. Checklist item stays open; explain what permissions we need and why.
- `F-CSV-001` — malformed CSV. Line-level errors shown pre-import.
- `F-CSV-002` — > 50MB CSV. Reject with size guidance.
- `F-KB-001` — knowledge doc content too large (> 100k chars). Reject and suggest splitting.
- `F-AI-INDEX-001` — indexing worker fails. Doc remains `is_indexed=false`; retry banner shown.

### 3.11 FR coverage

FR-WS-005, FR-IDT-003, FR-CNT-001–007, FR-LEAD-001–006, FR-WSI-001–004, FR-DASH-006, FR-CAL-001

---

## 4. Daily Use — Agency Owner

The morning routine. This is the most important flow for founder retention.

**Actor:** Owner
**Trigger:** first login of the day
**Preconditions:** workspace onboarded; at least one lead scored

### 4.1 Happy path

```
[Sign in]
   ↓
[Dashboard]                 (FR-DASH-*)
   Widgets in this order:
   1. Today's Gold Leads   (FR-DASH-001) — top 5 by opportunity_score, readiness='ready', not contacted in 7d
   2. Follow-ups Due       (FR-DASH-002) — reminders due today or overdue
   3. Upcoming Meetings    (FR-DASH-003) — next 7 days
   4. Pipeline Value       (FR-DASH-004) — sum of open deal values by stage
   5. Reply Rate           (FR-DASH-005) — rolling 30d with delta
   6. Revenue Target       (FR-DASH-006) — progress toward monthly + quarterly

   ↓ owner clicks a Gold Lead
   ↓
[Lead detail]
   Header: name • company • opportunity score card (fit, readiness, opportunity, ICP match, top signals)
   Left: Relationship Profile • Activity Timeline • Website Audit summary
   Right: Next Best Action panel (from outreach_queue_items) with recommended offer
   ↓ owner clicks "Draft outreach" (or accepts the AI's NBA)
   ↓ → Flow §8 (AI Personalization)
```

### 4.2 Alternative paths

- Owner opens Follow-ups Due first (reminders due today) → snooze / complete / open the entity → possibly branch to §8 or §11.
- Owner opens Upcoming Meetings → prep for meeting → possibly branch to §11 (proposal after meeting).
- Owner opens Reply Rate widget → filter outreach messages by sentiment / time → identify patterns.

### 4.3 Decision points

- Which widget the owner opens first (data-driven UX; will be measured).
- Whether the owner accepts AI's recommended offer or picks a different one.
- Whether the owner drafts + sends now or queues for later.

### 4.4 Failure states

- `F-DASH-001` — dashboard widgets stale (denorm lag > 60s). Show `Data updated <n> minutes ago` banner; force-refresh action.
- `F-DASH-002` — no leads yet. Show "empty state" nudging back to onboarding §3.

### 4.5 Events emitted

Reading events only in this flow (no writes). Downstream flows emit.

### 4.6 FR coverage

FR-DASH-001 through 006; FR-RPT-001, 002; navigation surfaces for FR-CNT, FR-LEAD, FR-PIPE, FR-SALES.

---

## 5. Daily Use — Sales Rep (member)

In v0.1, a `member` has near-identical permissions to `owner`. The main difference: members cannot manage other members or edit workspace settings. Daily flow is the same as §4.

**Phase 3 divergence** (deferred): custom roles + per-module permissions will produce a scoped dashboard (own leads only, own meetings only, etc.).

---

## 6. Lead Ingest → Qualification Flow

This is the LIE's headline flow. Every lead ingested runs through this pipeline.

**Actor:** System (triggered by ingest event)
**Trigger:** `▶ lead.ingested`
**Preconditions:** at least one active ICP; workspace onboarded

### 6.1 Pipeline stages

```
▶ lead.ingested
   ↓
[Enrichment step]
   • Resolve company (fuzzy name match + email domain lookup + optional third-party enrichment provider)
     - If confidence ≥ 0.8 → auto-link company_id
     - If 0.5 ≤ confidence < 0.8 → attach candidate, surface for review
     - If < 0.5 → leave company_id NULL; auto-create a Company row if a clean domain exists
   • Enrich contact fields (linkedin_url, seniority guess, role_title normalization)
   • Update contacts.company_id via event subscriber
   ▶ lead.enriched
   ⚠ failure: F-ENRICH-001, F-ENRICH-002
   ↓
[Scoring step]
   • Enumerate active ICPs in workspace
   • For each ICP, compute icp_match_score against company + contact signals
   • Pick best-matching ICP (highest icp_match_score)
   • Compute fit_score = 0.6 * icp_match + 0.2 * website_signal + 0.2 * enrichment_signal
     - website_signal: if a completed audit exists for the lead's company; otherwise 0 (audit is triggered separately)
   • Compute readiness_score from Relationship Profile signals (cold start = 20)
   • Compute opportunity_score = sqrt(fit * readiness)
   • Populate top_signals + explainability (plain-language)
   • UPSERT lead_scores + INSERT lead_score_history
   • UPDATE leads.status = 'scored'
   ▶ lead.scored
   ↓
[Website Audit trigger — conditional]
   • If lead.company.website_url or contact.website_url exists AND no completed audit within 30 days → enqueue audit
     ▶ website.audit.requested
   • Audit flow runs asynchronously (§7); on completion, re-score
   ↓
[Outreach Queue refresh]
   • Compute next_best_action:
     - If opportunity_score ≥ 80 AND readiness='ready' → draft_email (default) or channel from relationship_profile
     - If a matching offer exists → set recommended_offer_id
     - If readiness='cold' → wait_cooldown or schedule_followup
     - If readiness='avoid' or disqualified → disqualify
   • Rank by opportunity_score DESC
   • UPSERT outreach_queue_items
   ▶ outreach.queue.updated
   ↓
[Dashboard denorm]
   • Update dashboard_metrics_daily counters (leads_ingested_today, leads_scored_today)
   • Update "Today's Gold Leads" widget (FR-DASH-001) via Realtime subscription
```

### 6.2 Decision points

- Which ICP wins the match (auto).
- Whether to auto-trigger an audit (auto — cheap, LIE moat compounds).
- What next best action to recommend (auto — owner can override).

### 6.3 Failure states

| Code | Trigger | Recovery |
|---|---|---|
| `F-ENRICH-001` | Enrichment provider timeout | Retry once; if still failing, proceed with base data; lead is still scored (lower fit) |
| `F-ENRICH-002` | Company resolution ambiguous | Leave `company_id NULL`; surface in Company Suggestions review |
| `F-SCORE-001` | No active ICP in workspace | Score with pre-ICP rubric (all enrichment + website); banner in dashboard: "Configure an ICP for better scoring" |
| `F-SCORE-002` | Scoring model call fails | Retry with fallback model via Router; on second failure, mark lead `scoring_error` (a special status) and alert |
| `F-AUDIT-001` | (see §7 failures) | Audit failure does not block scoring; scoring runs without audit signal |

### 6.4 Events emitted

`lead.ingested` → `lead.enriched` → `lead.scored` → `website.audit.requested` → `outreach.queue.updated`

### 6.5 FR coverage

FR-LEAD-001 through 010; FR-CNT-001–005, 007; FR-WSI-001–004 (partial via trigger)

---

## 7. Website Audit Flow

**Actor:** Owner (manual trigger) OR System (auto-trigger from §6)
**Trigger:** `▶ website.audit.requested`
**Preconditions:** URL is provided; Browserless quota available

### 7.1 Happy path

```
▶ website.audit.requested
   ↓
[Inngest: audit orchestrator]
   • INSERT audits (status='pending', requested_by, attached entity)
   • UPDATE audits SET status='running', started_at
   ↓
[Step 1: Browserless render]
   • Spin up headless Chrome via Browserless.io
   • Navigate to URL_normalized
   • Wait for network idle + capture:
     - Full-page screenshot → Supabase Storage
     - HTML DOM snapshot
     - Core Web Vitals (LCP, INP, CLS)
     - Above-the-fold viewport (mobile + desktop)
     - Meta tags, structured data
     - Detected tech stack signals (analytics, ad pixels, chat widgets)
   ⚠ failure: F-AUDIT-002, F-AUDIT-003
   ↓
[Step 2: LLM analysis — Model Router capability 'audit-website']
   • Prompt (resolved via Prompt Library §18.3):
     - system: brand-voice + auditor persona
     - user: HTML excerpts, screenshots (multimodal), vitals metrics
     - retrieved memory: workspace's ICP + relevant KB (SOPs on auditing, brand voice)
   • Output: per-category grades + prioritized findings + recommendations
   ⚠ failure: F-AUDIT-004
   ↓
[Step 3: Persist findings]
   • UPDATE audits SET overall_grade, category_grades, findings_count
   • INSERT audit_findings rows
   • If previous audit exists for the same URL → compute deltas → INSERT audit_deltas
   ▶ website.audit.completed
   • If deltas exist: ▶ website.audit.delta
   ↓
[Step 4: Downstream fan-out]
   • Scoring re-runs for any leads attached to this URL's company (fit_score updates)
   • Loom Script Generator becomes available on this audit
   • Dashboard denorm updates
```

### 7.2 Decision points

- Depth: MVP always runs "full" depth (single page). Multi-page crawl is Phase 2.
- Mobile-first vs desktop-first render: MVP renders both.
- Whether to attach the audit to a specific entity (lead/company/deal) or leave standalone.

### 7.3 Failure states

| Code | Trigger | Recovery |
|---|---|---|
| `F-AUDIT-001` | URL malformed / unreachable | Fail fast; UPDATE audits SET status='failed', error; notify requester |
| `F-AUDIT-002` | Browserless timeout (> 60s) | Retry once with reduced payload; if second failure, mark failed |
| `F-AUDIT-003` | Site blocks headless browsers (403, Cloudflare challenge) | Mark failed with specific error; suggest manual audit |
| `F-AUDIT-004` | LLM returns malformed / unschema'd output | Retry with structured-output enforcement via secondary provider; if still bad, mark failed |
| `F-AUDIT-005` | Screenshot upload to Storage fails | Persist audit without screenshot; retry storage async |
| `F-AUDIT-006` | Cost budget exceeded | Refuse audit with clear "budget cap reached" message; owner tops up |

### 7.4 Events emitted

`website.audit.requested` → `website.audit.completed` (or delta) → `lead.scored` (re-score cascade)

### 7.5 FR coverage

FR-WSI-001, 002, 003, 004; FR-LOOM-001 (downstream availability)

---

## 8. AI Personalization & Outreach Flow

**Actor:** Owner (or member)
**Trigger:** clicks "Draft outreach" on a lead / accepts NBA from Outreach Queue
**Preconditions:** lead scored; audit ideally completed; ≥ 1 active offer; Gmail connected

### 8.1 Happy path

```
[Lead detail] → click "Draft outreach"
   ↓
[Draft Dialog: pick channel]
   • Email (via Gmail)
   • Instagram DM (copy-to-clipboard)
   • LinkedIn DM (copy-to-clipboard)
   ↓ pick channel
   ↓
[Draft Dialog: tone + offer + optional attachments]
   • Tone (friendly / professional / bold / casual — default = ICP's tone_rules)
   • Recommended offer (pre-selected from outreach_queue_items.recommended_offer_id)
   • Toggle: include Loom script? include audit summary link?
   ↓ click "Generate draft"
   ↓
[System: Model Router capability 'draft-outreach-<channel>']
   • Prompt resolution:
     - Workspace-scoped prompt_library row for 'draft-outreach-email' with active=true, is_default=true
     - Else global default
     - Else code baseline
   • Memory retrieval (workspace_id-filtered):
     - scope 'contact' + subject_id = lead.contact_id (interactions, corrections, sentiment)
     - scope 'company' + subject_id = lead.company_id
     - scope 'audit' + subject_id = latest completed audit
     - scope 'icp' + subject_id = matched ICP
     - scope 'offer' + subject_id = recommended_offer_id
     - scope 'knowledge_doc' — top-K similar to (offer positioning + audit findings) for case studies, testimonials, objection handling
     - scope 'workspace' — brand voice, banned phrases
   • Streamed output → UI shows tokens in real time
   • Log ai_usage_events (cost, latency, prompt_library_id if used)
   ▶ ai.output.produced
   ▶ outreach.draft.generated
   ↓
[Draft editor]
   • Editable body + subject
   • Citations panel: which KB doc / audit finding / memory fact was used
   • "Regenerate" button (with tone change / offer change / model change dropdowns)
   • Confidence indicator (from AI Router metadata)
   ↓ owner edits
   ↓ owner clicks "Send" (email) or "Copy" (DM)
   ↓
[Send step — email]
   • Via Gmail API (member's OAuth grant)
   • On success: UPDATE outreach_messages SET status='sent', sent_at, provider_message_id, provider_thread_id
   ▶ outreach.sent
   ⚠ failure: F-SEND-001 through 004
   ↓
[Send step — DM]
   • Copy body to clipboard
   • Show "Marked as sent" button (user manually confirms after posting in IG/LI)
   • On confirm: UPDATE outreach_messages SET status='sent', sent_at (no provider_message_id)
   ▶ outreach.sent
   ↓
[Cascade]
   • Relationship Intelligence subscriber consumes ▶ outreach.sent
     - Update last_interaction_at
     - Recompute engagement + readiness
   ▶ relationship.profile.recomputed
   • Outreach Queue re-ranks (this lead moves down after outreach; cooldown applied)
   ▶ outreach.queue.updated
   • Auto-create reminder (default 3 days for follow-up)
   ▶ reminder.created
```

### 8.2 Decision points

| Point | Choice | Consequence |
|---|---|---|
| Channel | email / IG DM / LI DM | Different send mechanism; email is fully automated, DMs are copy-paste |
| Tone | 4 presets | Different prompt variables |
| Offer | recommended vs override | Different memory retrieval + different pitch |
| Include audit link / Loom script | toggle | Adds attachments / cited content |
| Regenerate | yes / no | Same prompt id, new draft (cost logged) |
| Send now vs queue | send / queue | Queue path Phase 2 (sequences with delays) |

### 8.3 Failure states

| Code | Trigger | Recovery |
|---|---|---|
| `F-AI-DRAFT-001` | Model Router provider outage | Failover to secondary provider automatically; if both fail, offer "try again in 60s" |
| `F-AI-DRAFT-002` | AI cost budget exceeded | Gate generation with clear error; owner tops up budget |
| `F-AI-DRAFT-003` | Memory retrieval returns nothing (cold workspace) | Draft proceeds with less grounding; UI notes "limited context" |
| `F-SEND-001` | Gmail token expired | Prompt reconnect; keep draft |
| `F-SEND-002` | Gmail send fails (400/rate-limit) | Retry with backoff; if permanent, mark `failed` and surface |
| `F-SEND-003` | Recipient email invalid | Reject at draft time (validation) |
| `F-SEND-004` | Contact unsubscribed | Refuse to send; UI shows unsubscribe reason |

### 8.4 Events emitted

`ai.output.produced` → `outreach.draft.generated` → `outreach.sent` → `relationship.profile.recomputed` → `outreach.queue.updated` → `reminder.created`

### 8.5 FR coverage

FR-OUT-001 through 007; FR-MEM-001, 002, 003; AI-XPL-003, AI-HITL-001, 002, 003

---

## 9. Reply Handling & Follow-up Cadence

**Actor:** System (Gmail webhook triggers)
**Trigger:** Gmail push notification → new inbound message on a thread we sent on
**Preconditions:** outreach message previously sent with `provider_thread_id`

### 9.1 Happy path

```
[Gmail push webhook received]
   ↓
[Route Handler /webhooks/gmail]
   • Verify signature
   • Fetch full message via Gmail API
   • Match on provider_thread_id → find prior outreach_messages
   • Determine workspace_id + contact_id from prior message
   ↓
[Persist inbound]
   • INSERT outreach_messages (direction='inbound', status='replied', body, sender extracted)
   • Update outbound message: UPDATE outreach_messages SET status='replied', replied_at
   ▶ outreach.reply.received (payload includes classification pending)
   ↓
[Sentiment + classification — async via Inngest]
   • Model Router capability 'classify-reply'
   • Classify: positive | neutral | negative | objection | unsubscribe
   • Extract intent + entities (e.g., meeting-request, price-question)
   • UPDATE outreach_messages SET sentiment
   ▶ outreach.reply.received (v2 with classification enriched)
   ↓
[Cascade]
   • Relationship Intelligence subscriber:
     - Update sentiment_score, last_positive_at (if positive)
     - Update outreach_readiness (positive → 'ready', negative → 'warming', unsubscribe → 'avoid')
     ▶ relationship.profile.recomputed
   • Outreach Queue re-ranks
     ▶ outreach.queue.updated
   • Notifications:
     - If positive/objection → notify owner (in-app + email)
     ▶ notification created
   • Follow-up reminder logic:
     - If we had a pending reminder for this contact → mark completed (they replied — no more chase)
     - If negative → do not create new reminder
     - If neutral → optional cadence rule may create a reminder
     - If unsubscribe → drop from all sequences; set outreach_readiness='avoid'
```

### 9.2 Manual follow-up flow (when there's no reply)

```
[Dashboard: Follow-ups Due]
   • Shows reminders past due_at
   ↓ owner clicks a reminder
   ↓
[Contact detail]
   • Owner reviews activity_timeline (last outreach, no reply, elapsed time)
   • Owner clicks "Draft follow-up"
   ↓ → §8 (Personalization) with capability 'draft-followup-<channel>'
```

### 9.3 Decision points

- Classification threshold (positive vs objection) — configurable per workspace
- Whether to auto-create a next reminder (cadence rule)

### 9.4 Failure states

| Code | Trigger | Recovery |
|---|---|---|
| `F-REPLY-001` | Gmail webhook signature invalid | Reject 401; log for investigation |
| `F-REPLY-002` | Can't match inbound to prior outbound thread | Store as orphan inbound; surface in a "Unmatched replies" review view |
| `F-REPLY-003` | Sentiment classification fails | Fall back to sentiment='neutral'; log; retry classification |

### 9.5 Events emitted

`outreach.reply.received` → `relationship.profile.recomputed` → `outreach.queue.updated`

### 9.6 FR coverage

FR-OUT-007, FR-REM-001, 002, 003; FR-CNT-003, 004, 005

---

## 10. Meeting Flow

Two entry points: (a) prospect books via a `booking_link`; (b) owner logs a meeting manually.

### 10.1 Prospect books via booking link

**Actor:** Prospect (external)
**Trigger:** loads `verocrest.app/book/<workspace-slug>/<link-slug>`
**Preconditions:** booking link is active; owner has Calendar connected

```
[Public booking page]
   • Prospect picks a slot (available windows read from booking_link.availability + Google Calendar free/busy)
   • Prospect submits: name, email, optional company, optional note
   ↓
[System]
   • Create event on owner's Google Calendar (Calendar API)
   • INSERT meetings (booking_link_id, status='scheduled', external_event_id, provider='google_calendar')
   • Resolve or create contact (dedupe by email)
   • Attempt to link to an existing lead / deal (by contact match)
   ▶ meeting.booked
   • If matched to a lead → UPDATE leads.status='meeting_booked'
   • If matched to a deal → move deal stage forward (per pipeline config)
   ↓
[Confirmation email sent to prospect via Resend]
[Notification to owner in-app + email]
```

### 10.2 Owner logs meeting manually

```
[Contact/Deal detail] → click "Log meeting"
   ↓
[Meeting dialog] — title, scheduled_at (past or future), duration, notes
   ↓ Save
   ↓ INSERT meetings; ▶ meeting.booked (or ▶ meeting.completed if past)
```

### 10.3 Meeting completed

```
[Meetings list / Dashboard: Upcoming Meetings]
   ↓ owner marks a scheduled meeting as completed OR calendar sync detects past time
   ↓ UPDATE meetings SET status='completed', notes (optional)
   ▶ meeting.completed
   ↓
[Optional: AI meeting summary]
   • If owner pastes notes → Router capability 'summarize-meeting' produces ai_summary
   • Not automatic call recording in v0.1
```

### 10.4 Failure states

| Code | Trigger | Recovery |
|---|---|---|
| `F-CAL-001` | Google Calendar auth revoked | Booking page shows "temporarily unavailable"; owner is notified to reconnect |
| `F-CAL-002` | Slot conflict (double booking race) | Return "slot no longer available"; prospect picks another |
| `F-CAL-003` | External event creation fails after booking accepted | Retry; if fails, notify owner to manually add to calendar |

### 10.5 Events emitted

`meeting.booked` → `meeting.completed` (later)

### 10.6 FR coverage

FR-CAL-001, 002, 003

---

## 11. Proposal Flow (Discovery → Draft → Send → Sign → Won)

The critical closing flow. This is where AI Personalization + Offers + Knowledge Docs converge into a signed proposal.

**Actor:** Owner
**Trigger:** meeting completed; deal ready for proposal
**Preconditions:** deal exists (auto-created when lead reaches `meeting_booked`); offer selected; audit completed

### 11.1 Happy path

```
[Deal detail]
   • Deal was auto-created when a lead advanced to meeting_booked
   • Deal has: primary_contact_id, company_id, owner, stage='discovery', offer_id (if picked pre-meeting)
   ↓ owner clicks "Generate proposal"
   ↓
[Proposal generation dialog]
   • Offer (dropdown of active offers, defaults to deal.offer_id)
   • Include audit summary? (yes/no)
   • Discovery call notes (paste from meeting.notes or type)
   • Additional context (tone, urgency, custom pricing)
   ↓ click "Generate"
   ↓
[System: Model Router capability 'draft-proposal']
   • Prompt (from Prompt Library)
   • Memory retrieval:
     - scope 'company' — company profile
     - scope 'contact' — decision-maker context
     - scope 'audit' — latest completed audit findings
     - scope 'offer' — full offer positioning + deliverables + guarantees + ROI narrative
     - scope 'knowledge_doc' — case studies matching industry, testimonials, objection handling
     - scope 'icp' — ICP narrative (helps position value)
   • Structured output: rich-text tree (tiptap JSON) with sections:
     1. Cover
     2. Understanding of your situation (grounded in audit + notes)
     3. Solution overview (grounded in offer + deliverables)
     4. Deliverables + timeline
     5. Investment (grounded in offer.price + pricing_model)
     6. Guarantees (grounded in offer.guarantees)
     7. ROI projection (grounded in offer.roi_narrative + case studies)
     8. Terms
   • INSERT proposals (status='draft', content, offer_id, offer_version snapshotted at read time)
   ▶ proposal.drafted
   ↓
[Proposal editor]
   • Rich-text editor with section navigation
   • Per-section regenerate ("rewrite this section with a stronger hook")
   • Preview mode (renders as the client will see it)
   • PDF export preview
   ↓ owner edits + finalizes
   ↓ owner clicks "Send"
   ↓
[Send dialog]
   • Choose send method:
     - v0.1: Export PDF + copy email template → owner sends manually (or via Gmail integration)
     - Phase 2: In-house e-signature flow
   • Snapshot the offer NOW: proposals.offer_snapshot = full jsonb of offers row at this moment
   • UPDATE proposals SET status='sent', sent_at, pdf_url
   • UPDATE deals SET stage='proposal_sent'
   ▶ proposal.sent
   ▶ deal.stage.changed
   ↓
[Follow-up automation]
   • Auto-create reminder: "Follow up on proposal for <contact>" due 3 days out
   ▶ reminder.created
```

### 11.2 Proposal viewed / signed / declined

```
[External signing platform webhook OR manual mark]
   • On viewed → UPDATE proposals SET status='viewed', viewed_at ▶ proposal.viewed
   • On signed → UPDATE proposals SET status='signed', signed_at ▶ proposal.signed
   • On declined → UPDATE proposals SET status='declined' ▶ proposal.declined (event exists but not v0.1 catalogue; treated as deal.lost signal)
```

### 11.3 Deal won

```
[Deal detail] → owner clicks "Mark as Won" (after proposal signed + deposit collected out-of-product)
   ↓
[Win confirmation dialog]
   • Confirm close_value, currency
   • Add won_reason (optional)
   ↓
   UPDATE deals SET stage='won', won_at, value (final)
   UPDATE companies SET is_client=true
   UPDATE primary contact SET is_client=true
   ▶ deal.won
   ↓
[Cascade]
   • Dashboard Revenue Target updates
   • Case Study candidate flag on the company (nudges owner to create a knowledge_doc case study later — flywheel)
   • Phase 2 hook: Client Portal provisioning fires here
```

### 11.4 Decision points

- Offer at proposal generation (defaults from deal.offer_id but can be overridden)
- Which sections to regenerate
- Send method (external e-sign vs manual email in v0.1)
- When to mark won (deposit paid externally — no automated hook in v0.1)

### 11.5 Failure states

| Code | Trigger | Recovery |
|---|---|---|
| `F-PROP-001` | AI draft returns malformed content structure | Retry via secondary provider; if still bad, owner can start from a blank template |
| `F-PROP-002` | PDF export fails | Retry; owner can also export as HTML |
| `F-PROP-003` | Offer no longer active at send time | Warn owner: "This offer is paused. Snapshot at proposal time will be used" (snapshot proceeds regardless) |
| `F-PROP-004` | Deal has no offer_id | Force owner to pick an offer before generating; block if none exist |
| `F-PROP-005` | Very large proposal (> 20k tokens output) | Section-by-section generation; concatenate |

### 11.6 Events emitted

`proposal.drafted` → `proposal.sent` → `proposal.viewed` → `proposal.signed` → `deal.stage.changed` → `deal.won`

### 11.7 FR coverage

FR-SALES-001, 002, 003, 004, 005, 008; FR-DASH-004, 006

---

## 12. Client Onboarding (Phase 2 Hook)

**In v0.1 this flow does not exist as a first-class product surface.** When a deal is marked won:

1. `▶ deal.won` fires (§11.3)
2. `companies.is_client` flips to `true`
3. `contacts.is_client` flips to `true` on the primary contact
4. Founder handles onboarding in existing tools (Notion, Google Docs, Slack)

**Phase 2 will subscribe to `▶ deal.won` and:**

- Provision a Client Portal subdomain / path
- Create a `projects` row from a template
- Send a branded welcome email via Resend
- Attach onboarding knowledge_documents to the portal

The `▶ deal.won` event is stable; Phase 2 subscribers slot in without any change to §11.

---

## 13. AI Workflow Patterns (cross-cutting)

Every AI touchpoint in v0.1 follows this pattern.

### 13.1 The AI Workflow Contract

```
Feature UI  →  Server Action / Route Handler
                  ↓
              Model Router (capability, workspace context, agent_context=null in v0.1)
                  ↓ (1) Resolve prompt via Prompt Library (§3.19 of arch, §18.3 of DB)
                  ↓ (2) Retrieve memory (workspace_id-filtered)
                  ↓ (3) Assemble final prompt (system + user + retrieved context)
                  ↓ (4) Provider call (Anthropic primary, OpenAI fallback)
                  ↓ (5) Parse structured output (Zod schema per capability)
                  ↓ (6) Log ai_usage_events + emit ▶ ai.output.produced
                  ↓ (7) Write to Memory (learnings, corrections consumed later)
                  ↓
              Return to caller (streamed or awaited)
                  ↓
              Feature persists domain rows (outreach_messages, proposals, ...)
                  ↓
              Emit domain event (▶ outreach.draft.generated, etc.)
```

### 13.2 Explainability

Every AI output surfaces:
- **Confidence** (self-reported by model per prompt design)
- **Citations** (which memory_vectors, which knowledge_documents, which audit_findings)
- **Model + prompt version** (for reproducibility)
- **Cost + latency** (for cost dashboards)

Rendered as an "AI Trace" panel expandable from any AI-produced content.

### 13.3 HITL enforcement

In v0.1:

- **Every** AI-produced content that leaves the workspace (email send, DM copy, proposal PDF) is a *draft* until a human clicks a definitive action ("Send", "Copy", "Export").
- No autonomous action. Period.
- Every draft accept/reject is recorded (via `action_log`).
- `outreach_messages.status='draft'` never auto-transitions to `sent` in v0.1.

### 13.4 Cost gating

- Each capability has a monthly budget (workspace-level).
- When usage crosses 80% → banner warning on dashboard.
- When usage crosses 100% → capability blocked with clear error + link to top up.
- Cost dashboard (§18 of DB) is visible to Owner from Settings → AI Usage.

### 13.5 Failure fallbacks

- Primary provider fails → automatic failover to secondary (Router-managed).
- Both fail → user-facing "AI temporarily unavailable" with retry.
- Bad output (schema mismatch) → retry with structured-output enforcement (typically OpenAI's structured-output mode).

---

## 14. Failure States Catalogue

All failure codes referenced in this doc, with recovery pattern.

| Code | Domain | Trigger | User-facing recovery | System recovery |
|---|---|---|---|---|
| F-ONB-001 | Onboarding | Email already registered | Redirect to sign-in; offer reset | N/A |
| F-ONB-002 | Onboarding | Google OAuth denied | Explain permissions, retry | N/A |
| F-ONB-003 | Onboarding | Verification email not received | Resend action; spam guidance | Retry with new token |
| F-ONB-004 | Onboarding | Workspace slug collision | Suggest variants | N/A |
| F-ONB-005 | Onboarding | Supabase down | Status page link; retry | Backoff |
| F-INT-001 | Integrations | Google OAuth denied | Reconnect prompt | Feature gated with clear error |
| F-INT-002 | Integrations | Provider token revoked externally | Reconnect banner on dashboard | Mark connection status='revoked' |
| F-CSV-001 | Import | Malformed CSV | Line-level errors pre-import | N/A |
| F-CSV-002 | Import | > 50MB CSV | Reject with size guidance | N/A |
| F-KB-001 | Knowledge | Doc > 100k chars | Reject; suggest splitting | N/A |
| F-AI-INDEX-001 | Knowledge | Indexing worker fails | Retry banner | Retry via Inngest with backoff |
| F-DASH-001 | Dashboard | Widget denorm stale (>60s) | Data-age banner + force refresh | Refresh worker |
| F-DASH-002 | Dashboard | No leads yet | Empty state → back to onboarding | N/A |
| F-ENRICH-001 | Lead Intel | Enrichment provider timeout | (silent to user) | Retry once; proceed with base data |
| F-ENRICH-002 | Lead Intel | Company resolution ambiguous | Review surface | N/A |
| F-SCORE-001 | Lead Intel | No active ICP | Dashboard nudge to configure | Score with pre-ICP rubric |
| F-SCORE-002 | Lead Intel | Scoring model fails | (silent; retry) | Failover + `scoring_error` status if both fail |
| F-AUDIT-001 | Audit | URL unreachable | Owner sees error on audit card | Mark failed |
| F-AUDIT-002 | Audit | Browserless timeout | (silent; retry) | Retry once; mark failed on 2nd |
| F-AUDIT-003 | Audit | Site blocks headless | Suggest manual audit | Mark failed |
| F-AUDIT-004 | Audit | LLM malformed output | (silent; retry) | Structured-output enforcement retry |
| F-AUDIT-005 | Audit | Storage upload fails | Persist audit without screenshot | Async retry |
| F-AUDIT-006 | Audit | Cost budget exceeded | Top-up dialog | Gate audit |
| F-AI-DRAFT-001 | AI | Provider outage | "Try again in 60s" | Failover |
| F-AI-DRAFT-002 | AI | Cost budget exceeded | Top-up dialog | Gate capability |
| F-AI-DRAFT-003 | AI | No memory retrieval matches | "Limited context" note | Proceed with less grounding |
| F-SEND-001 | Outreach | Gmail token expired | Reconnect prompt | Keep draft |
| F-SEND-002 | Outreach | Gmail rate limit | Retry with backoff | Auto |
| F-SEND-003 | Outreach | Invalid recipient email | Inline validation at draft time | N/A |
| F-SEND-004 | Outreach | Contact unsubscribed | Refuse to send | N/A |
| F-REPLY-001 | Reply | Webhook signature invalid | Silent | Reject 401; log |
| F-REPLY-002 | Reply | Can't match to prior outbound | Surface in "Unmatched" review | Store as orphan |
| F-REPLY-003 | Reply | Sentiment classification fails | (silent) | Fall back to neutral |
| F-CAL-001 | Calendar | Google Calendar revoked | Booking page 503 + owner reconnect prompt | Feature gated |
| F-CAL-002 | Calendar | Slot double-book | Prospect picks another | N/A |
| F-CAL-003 | Calendar | Event creation fails post-book | Owner manual add | Retry |
| F-PROP-001 | Proposal | AI draft malformed | (silent; retry) | Failover; blank template as fallback |
| F-PROP-002 | Proposal | PDF export fails | Owner exports as HTML | Retry |
| F-PROP-003 | Proposal | Offer paused at send time | Warning; proceed with snapshot | Snapshot regardless |
| F-PROP-004 | Proposal | Deal has no offer | Force offer pick | N/A |
| F-PROP-005 | Proposal | Very large proposal | Section-by-section | Automatic chunking |

**Every failure code above must have** (a) a UI treatment defined in `07_UI_UX_System.md`, (b) telemetry emitted, (c) an entry in the runbook (`16_Deployment.md`).

---

## 15. Cross-Flow State Diagram

```
                 (§2 signup)
                     ↓
              Workspace Created
                     ↓
             (§3 onboarding checklist)
                     ↓
           Workspace Onboarded  ←──────────────────────────┐
                     ↓                                     │
             (§6 lead ingest)                              │ (returning session)
                     ↓                                     │
    lead: new → enriching → scored → ready ────────┐      │
                     ↓                              │      │
              (§7 audit runs — often concurrent)   │      │
                     ↓                              │      │
      lead: ready + audit complete + queue ranked  │      │
                     ↓                              │      │
             (§8 personalization → send)           │      │
                     ↓                              │      │
      lead: contacted → engaged (§9 reply)          │      │
                     ↓                              │      │
             (§10 meeting booked/completed)         │      │
                     ↓                              │      │
      lead: meeting_held ; deal: discovery          │      │
                     ↓                              │      │
             (§11 proposal generated → sent)        │      │
                     ↓                              │      │
      deal: proposal_sent → viewed → signed         │      │
                     ↓                              │      │
             (§11.3 deal won)                       │      │
                     ↓                              │      │
      deal: won ; company/contact: is_client=true  │      │
                     ↓                              │      │
      (§12 Phase 2 hook — not in v0.1)              │      │
                                                    │      │
                                                    └──────┘
                                              (§4 daily use loops)
```

---

## 16. Event Emission Cheat-Sheet by Flow

| Flow | Events emitted (in order) |
|---|---|
| §2 Onboarding | `workspace.created` |
| §3 Setup (per item) | `integration.google.connected`, `icp.upserted`, `icp.indexed`, `offer.upserted`, `offer.indexed`, `knowledge_doc.upserted`, `knowledge_doc.indexed`, `target.set`, `lead.ingested` (×N) |
| §4 Daily use | (reads) |
| §6 Qualification | `lead.ingested` → `lead.enriched` → `lead.scored` → `website.audit.requested` → `outreach.queue.updated` |
| §7 Audit | `website.audit.requested` → `website.audit.completed` (or `.delta`) → cascade `lead.scored` |
| §8 Personalization | `ai.output.produced` → `outreach.draft.generated` → `outreach.sent` → `relationship.profile.recomputed` → `outreach.queue.updated` → `reminder.created` |
| §9 Reply | `outreach.reply.received` → `relationship.profile.recomputed` → `outreach.queue.updated` |
| §10 Meeting | `meeting.booked` → `meeting.completed` |
| §11 Proposal | `proposal.drafted` → `proposal.sent` → `proposal.viewed` → `proposal.signed` → `deal.stage.changed` → `deal.won` |

New events introduced in this document that must be added to the architecture §8.3 catalogue:

- `icp.upserted`, `icp.indexed`
- `offer.upserted`, `offer.indexed`
- `knowledge_doc.upserted`, `knowledge_doc.indexed`
- `integration.google.connected`
- `target.set`

These will be documented in the next revision of `03_System_Architecture.md`. Recording them here so the mapping is complete.

---

## 17. Assumptions

| ID | Assumption | If false |
|---|---|---|
| ASM-FLOW-001 | The founder's Google Workspace supports Gmail Push notifications (Pub/Sub) for reply detection | Fallback: poll Gmail inbox every 5 min via cron |
| ASM-FLOW-002 | Prospects will use a public booking page without login | Confirmed by convention (Cal.com model) |
| ASM-FLOW-003 | Owner is willing to tolerate a 15–60s audit latency (async, dashboarded) | Confirmed by v0.1 UX intent |
| ASM-FLOW-004 | Manual "mark as sent" for IG/LinkedIn DMs is acceptable UX at MVP | Owner accepts; automation is Phase 2 (agents) |
| ASM-FLOW-005 | Owner is willing to run first audit on an owned property before real leads (testing) | Onboarding step 7 is optional in strict sense but strongly nudged |

---

## 18. Risks

| Risk | Mitigation |
|---|---|
| **Onboarding checklist too long** — owner drops off before item 6 | Ordered so items 1–3 (Google + ICP + Offer) show *some* dashboard value early; items 4–7 are unlocked incrementally |
| **AI drafts don't feel personal enough** — reply rate stays low | Prompt Library workspace-scoped tuning; case-study memory retrieval; ongoing evals with golden replies |
| **Audit results are hallucinatory** — damages first impression | Structured-output enforcement + explainability panel citing HTML elements + screenshot bounding boxes |
| **Reply webhook lag** — owner sees an unhandled reply hours late | Notification on receipt; poll fallback per ASM-FLOW-001 |
| **Prospect books a slot but calendar sync fails** — no meeting created | Compensating job retries; owner notified |
| **Proposal snapshot drift** — signed proposal shows stale prices | `offer_snapshot` locked at send; nightly integrity job flags any mismatch |
| **Memory retrieval too broad** — pulls in wrong case studies | Per-capability scope allow-list; top-K threshold; owner can mark "never apply" via memory_annotations |
| **Cost blowup on audits + drafts** — first big month surprises | Cost budget gating + 80% warnings + per-capability caps |

---

## 19. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | Onboarding is a checklist, not a linear wizard | Owner can pick order that suits them; also acts as a homepage until it's complete |
| 2026-07-01 | Auto-enrich + auto-audit + auto-queue on lead ingest | Removes owner cognitive load; the flywheel spins on ingest, not on click |
| 2026-07-01 | Manual "mark as sent" for IG/LinkedIn DMs in v0.1 | No reliable APIs; automation deferred to Phase 2 (agents) with browser-driven flows |
| 2026-07-01 | Every AI output is a draft in v0.1 (HITL) | Vision §4.6 Assist tier; no autonomous sends |
| 2026-07-01 | Deal auto-created when lead reaches `meeting_booked` | Removes duplicate data entry; owner enters at pipeline for the first time only if they want to |
| 2026-07-01 | Proposal offer snapshot at send time (immutable) | Legal-grade evidence; pricing changes cannot retroactively alter signed proposals (matches DB §10.4) |
| 2026-07-01 | Company `is_client` + contact `is_client` flip on deal.won | Enables Phase 2 Client Portal subscription without changing this flow |
| 2026-07-01 | Reply classification triggers Relationship Profile update, which triggers Queue re-rank | Explicit chained emissions preserve auditability |
| 2026-07-01 | Onboarding step 7 (first audit) can be run on the founder's own property for demo before real leads exist | Reduces first-value time |
| 2026-07-01 | Follow-up reminders auto-create on outreach send with 3-day default | Bakes cadence discipline into the tool |
| 2026-07-01 | Owner manually marks deal won (deposit paid externally in v0.1) | Payments deferred to Phase 2; owner is in the loop for the final revenue update |

---

## 20. Open Questions

1. **First-audit content in onboarding step 7** — should we auto-run an audit on the founder's own workspace URL as a demo before real leads exist? Recommendation: yes — surfaces the value of Website Intelligence immediately.
2. **Manual "mark as sent" UX for DMs** — checkbox at draft time, or a persistent "confirm sent" prompt for 24 hours after copy? Recommendation: persistent nudge on dashboard until confirmed or dismissed.
3. **Reply webhook vs. polling default** — start with Gmail Pub/Sub (webhook) and fall back to 5-min polling if setup fails? Recommendation: yes — start with webhook, poll as fallback.
4. **When the owner rejects an AI draft** ("Regenerate 3 times without sending") — should we log a `draft.rejected` event for prompt evaluation? Recommendation: yes, event added to catalogue.
5. **Booking-page prospect data collection** — email required, phone optional, or both required? Recommendation: email only required; phone optional; UTM captured silently.
6. **Should the "Company Suggestions" review UI be part of v0.1** or Phase 2? Recommendation: v0.1 as a small surface (single-page review list) — it's needed the first time an import produces ambiguous matches.
7. **Should we send a summary email to owner** after each Gold Lead is scored? Recommendation: no — dashboard is the surface; email digests are Phase 2.

---

## 21. Approval Gate

To move to `06_Feature_Modules.md`, the founder must sign off on:

1. **Onboarding checklist scope** (7 items in the order specified in §3).
2. **Auto-fan-out on lead ingest** — enrich, score, audit, queue — with no manual owner action needed (§6).
3. **Manual mark-as-sent for IG/LinkedIn DMs in v0.1** (§8, §17 ASM-FLOW-004).
4. **HITL for every AI output** in v0.1 (§13.3, §19).
5. **Auto-deal-creation on lead.meeting_booked** (§11, §19).
6. **Proposal `offer_snapshot` at send time** (§11, §19).
7. **`is_client` flip on deal.won** as the Phase 2 hook (§11.3, §12, §19).
8. **New event names** introduced in §16 (icp.upserted / .indexed, offer.upserted / .indexed, knowledge_doc.upserted / .indexed, integration.google.connected, target.set) — will be added to architecture §8.3 catalogue on next revision.
9. **Failure catalogue** (§14) as the source of truth for user-facing error handling.

Once signed off, `06_Feature_Modules.md` will be produced — mapping each module (Auth, Lead Intelligence, AI Website Auditor, AI Personalization, Sales CRM, Dashboard) to its module-level specification: purpose, inputs, outputs, workflow, UI components, database tables, edge cases, dependencies, success metrics.

---

*End of 05_User_Flows.md*

---

**Should I continue to the next blueprint document (`06_Feature_Modules.md`)?**

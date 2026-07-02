# 02 — Product Requirements

**Document:** Product Requirements Document (PRD)
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint)
**Status:** Draft for approval
**Owner:** Founder / CTO / PM
**Depends on:** `01_Vision.md`
**Last updated:** 2026-07-01

---

## 0. How to read this document

This PRD is the **contract between vision and implementation**. It converts the strategic bets in `01_Vision.md` into requirements that can be tested, prioritized, and traced.

Every requirement in this document has:
- A unique **ID** (e.g. `FR-LEAD-014`) that later documents cite instead of re-describing the requirement.
- A **priority** (`P0 / P1 / P2 / P3`) using the MoSCoW model (see §11).
- A **vision anchor** — the section of `01_Vision.md` that justifies it. If we cannot anchor it, we do not build it.
- A **verifiability rule** — how we will know the requirement is met.

If a downstream document (architecture, database, module spec) implements something that is not in this PRD, the PRD must be amended first. This document is the *source of truth for what the product does*.

---

## 1. Purpose & Scope

### 1.1 Purpose

Define, at the requirement level:

- What Verocrest OS must do (functional requirements)
- How well it must do it (non-functional requirements)
- What constraints govern the AI substrate (AI-specific requirements)
- What data and privacy obligations we accept (data requirements)
- What is explicitly out of scope for v1

### 1.2 Scope

**In scope for this PRD:** all product surfaces (web app, client portal, admin), the AI substrate (agents, memory, intelligence layers), and the platform capabilities that support multi-tenancy from day one.

**Out of scope for this PRD:** implementation details (frameworks, libraries, hosting choices → `03_System_Architecture.md`), schema (→ `04_Database_Design.md`), UI specifics (→ `07_UI_UX_System.md`, `08_Design_System.md`), and sprint breakdown (→ `13_Sprint_Planning.md`).

### 1.3 Audience

- The founder, as final approver
- Any future engineer, designer, or PM joining the project
- Reviewers evaluating whether the product delivers on the Vision

---

## 2. Definitions & Terminology

The vocabulary is intentionally opinionated. Do not substitute synonyms in code or copy.

| Term | Definition |
|---|---|
| **Workspace** | The top-level tenant in the system. In Act I there is one (Verocrest). In Act II there are many. Every row of business data belongs to exactly one workspace. |
| **Member** | A human with credentials to sign in and act inside a workspace. Members have roles. |
| **Client** | A paying customer of the workspace's *agency*, not of Verocrest OS. Clients may have Client Portal access but are not "members." |
| **Contact** | Any human tracked in the system (prospect, lead, client contact, partner, vendor). Contacts have a Relationship Intelligence profile. |
| **Lead** | A Contact who has been evaluated for fit and has a lead score. All leads are contacts; not all contacts are leads. |
| **Deal** | A specific revenue opportunity tied to one or more leads. Deals move through the Sales Pipeline. |
| **Project** | A delivery engagement for a signed client. Projects contain tasks, milestones, deliverables. |
| **Workflow** | An end-to-end process that produces a measurable outcome (e.g. "score → outreach → meeting"). Workflows are the unit of the North Star Metric. |
| **Agent** | An AI actor with a defined role (SDR, PM, CS, QA, Ops) and an autonomy tier (Assist / Automate / Autonomous). |
| **Autonomy Tier** | The level of independence an agent has: `assist` (drafts only), `automate` (executes low-risk reversible actions), `autonomous` (operates within a policy envelope). |
| **Policy Envelope** | The set of workspace-configured rules that bound an agent's autonomous action (budget caps, tone, brand rules, approval thresholds). |
| **Memory** | The durable, workspace-scoped substrate that stores contextual knowledge across interactions. See `09_AI_Architecture.md`. |
| **Intelligence Layer** | A cross-cutting capability that enriches core entities: Relationship Intelligence (contacts), Website Intelligence (websites), Lead Intelligence (leads). |
| **Action Log** | The append-only audit record of every consequential action, human or AI, in a workspace. |

---

## 3. Requirements Taxonomy

Every requirement in this document belongs to exactly one of these categories:

| Prefix | Category | What it constrains |
|---|---|---|
| `FR-` | Functional | What the system does |
| `NFR-` | Non-functional | How well the system does it (performance, security, reliability, etc.) |
| `AI-` | AI-specific | Constraints on AI behavior (safety, HITL, cost, explainability) |
| `DATA-` | Data & privacy | What we may store, retain, share, delete |
| `INT-` | Integration | Boundaries with third-party systems |
| `CMP-` | Compliance | Legal and regulatory obligations |

IDs are stable. If a requirement is deprecated, it is marked `DEPRECATED` but not renumbered — this preserves traceability.

---

## 4. Functional Requirements

Functional requirements are grouped by product domain. Each domain corresponds to one or more modules in `06_Feature_Modules.md`.

### 4.1 Identity, Access & Tenancy (FR-IDT)

| ID | Priority | Requirement | Vision anchor | Verifiability |
|---|---|---|---|---|
| FR-IDT-001 | P0 | The system must support email + password authentication with mandatory email verification. | §7.7 | Automated test: unverified users cannot access protected routes. |
| FR-IDT-002 | P0 | The system must support magic-link (passwordless) sign-in as an alternative. | §7.5 | Manual: sign in with magic link, no password required. |
| FR-IDT-003 | P0 | The system must support Google OAuth sign-in. | §7.5 | Manual: sign in via Google, no separate password created. |
| FR-IDT-004 | P1 | The system must support TOTP-based multi-factor authentication. | §7.7 | Manual: enable MFA, sign-in requires code. |
| FR-IDT-005 | P0 | The system must partition all business data by `workspace_id`. No query may return cross-workspace data. | §7.7 | Automated: RLS test suite covers every table. |
| FR-IDT-006 | P0 | A user must belong to at least one workspace. A user may belong to multiple workspaces and switch between them. | §7.7 | Manual + automated: user in 2 workspaces can switch context; data isolated. |
| FR-IDT-007 | P0 | The system must support role-based access control with the following roles: `owner`, `admin`, `member`, `guest` (client). | §7.7 | Automated: permission matrix test suite. |
| FR-IDT-008 | P0 | The system must log every authentication event (sign-in, sign-out, MFA challenge, password change) to the Action Log. | §15 | Automated: query action log after each event type. |
| FR-IDT-009 | P1 | The system must support inviting members via email, with a signed link that expires after 7 days. | §7.5 | Manual: invite, accept before/after expiry, correct behavior. |
| FR-IDT-010 | P2 | The system must support SAML SSO. | §12.2 (Scale tier) | Deferred to Scale tier. |
| FR-IDT-011 | P0 | On sign-out, the session must be invalidated server-side, not just client-side. | §15 | Automated: attempt to reuse post-signout token → 401. |
| FR-IDT-012 | P1 | The system must support session revocation from a "My Sessions" view. | §15 | Manual: sign in from two devices, revoke one, verify. |

### 4.2 Workspace & Team (FR-WS)

| ID | Priority | Requirement | Vision anchor | Verifiability |
|---|---|---|---|---|
| FR-WS-001 | P0 | An `owner` may create additional workspaces and switch between them. | §7.7 | Manual + test. |
| FR-WS-002 | P0 | Every workspace has a unique slug, display name, timezone, currency, and locale. | §6 | Test on workspace CRUD. |
| FR-WS-003 | P0 | Roles are workspace-scoped. A user may be `owner` in workspace A and `member` in workspace B. | §7.7 | Automated: cross-workspace role test. |
| FR-WS-004 | P1 | A workspace supports custom role definitions with granular permissions (module-level and action-level). | §7.6 | Manual: create custom role, assign, verify capabilities. |
| FR-WS-005 | P0 | A workspace stores brand assets (logo, primary color, favicon) used across Client Portal, proposals, invoices, and reports. | §7.8 | Manual: change asset, verify propagation across surfaces. |
| FR-WS-006 | P1 | Workspaces may be soft-deleted with 30-day recovery. Hard-deletion is a separate, owner-only action. | §15 | Test: soft-delete, recover, hard-delete, verify data purge. |

### 4.3 Contacts & Relationship Intelligence (FR-CNT)

*Anchors: §4.7, §7.11 — Relationship Intelligence is a first-class primitive.*

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-CNT-001 | P0 | The system must store contacts with at minimum: name, email(s), phone(s), company, role, location, source, tags. | Test on contact CRUD. |
| FR-CNT-002 | P0 | Contacts are deduplicated on ingest by primary email. Conflict resolution is UI-driven (merge or keep separate). | Manual: import CSV with duplicates. |
| FR-CNT-003 | P0 | Every contact has a **Relationship Profile** with: engagement history, communication cadence, sentiment (last N interactions), relationship score (0–100), outreach readiness (`cold`/`warming`/`ready`/`avoid`). | Manual + automated: profile updates after interactions. |
| FR-CNT-004 | P0 | The relationship score must recompute automatically whenever a new interaction is logged. | Automated: log interaction, verify score delta. |
| FR-CNT-005 | P0 | Every contact carries a chronological activity timeline (emails, DMs, calls, notes, meetings, audits, agent actions). | Manual: verify timeline populated. |
| FR-CNT-006 | P1 | Contacts support custom fields (text, number, date, single-select, multi-select, url). Field definitions are workspace-scoped. | Manual: create field, populate, filter. |
| FR-CNT-007 | P0 | Contacts must support bulk import via CSV with column mapping, error reporting, and dry-run preview. | Manual: import 1000-row CSV, verify. |
| FR-CNT-008 | P1 | Contacts must support bulk export (CSV, JSON) filtered by segment. | Manual. |
| FR-CNT-009 | P0 | A contact may be linked to one or more Deals, Projects, and Clients. Cascading behavior is explicit (deleting a contact does not delete linked deals). | Test: delete linked contact, verify preservation. |
| FR-CNT-010 | P1 | Contacts support segmentation (saved filters), reusable across modules. | Manual: save segment, use in outreach. |
| FR-CNT-011 | P2 | The system must provide relationship-graph visualization (contact-to-contact links via companies, referrals, shared interactions). | Deferred to v2. |

### 4.4 Lead Intelligence & Scoring (FR-LEAD)

*Anchors: §4.5, §4.7, §10.2 — vertical data moat.*

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-LEAD-001 | P0 | The system must ingest leads from CSV upload, manual entry, web form, and API. | Test on each channel. |
| FR-LEAD-002 | P0 | Every lead ingested triggers automatic enrichment (company, role, website, social profiles) via configured providers. | Manual + integration test. |
| FR-LEAD-003 | P0 | Every lead receives an AI-generated **Lead Score** (0–100) based on ICP fit, engagement signals, and Website Intelligence findings. | Automated: ingest lead, score present within 60s. |
| FR-LEAD-004 | P0 | The scoring rubric must be workspace-configurable (weightings for industry, size, geography, tech stack, website signals). | Manual: change weights, verify rescore. |
| FR-LEAD-005 | P0 | Leads must expose an **Explainability Card**: the top 3–5 signals that produced the score, in plain language. | Manual: open a lead, verify card. |
| FR-LEAD-006 | P0 | Lead ingestion must be idempotent; the same lead ingested twice does not double-score or duplicate the contact. | Automated: ingest same lead twice. |
| FR-LEAD-007 | P1 | Leads support batch scoring (e.g. re-score all leads with new rubric). | Manual: bulk re-score. |
| FR-LEAD-008 | P0 | The Lead Score history is preserved (not overwritten). Score changes are timestamped. | Manual: verify history. |
| FR-LEAD-009 | P1 | Leads may be routed automatically to a pipeline stage based on score thresholds. | Manual: config, ingest, verify routing. |
| FR-LEAD-010 | P0 | Leads must display Website Intelligence summary inline (audit score, top 3 conversion issues, brand hygiene grade). | Manual: verify surfacing. |

### 4.5 Lead Pipeline (FR-PIPE)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-PIPE-001 | P0 | The system provides a kanban-style Lead Pipeline with workspace-configurable stages. | Manual. |
| FR-PIPE-002 | P0 | Stages support drag-and-drop, keyboard reordering, and bulk stage transitions. | Manual + keyboard. |
| FR-PIPE-003 | P0 | Every stage transition is logged to the contact's activity timeline. | Automated. |
| FR-PIPE-004 | P0 | Pipeline supports at least three built-in views: kanban, list, calendar. | Manual. |
| FR-PIPE-005 | P1 | Pipeline supports filtered views (by owner, score, source, tag, date range). | Manual. |
| FR-PIPE-006 | P0 | Every pipeline stage supports at least one automation trigger (e.g. "when moved to `Meeting Booked`, notify owner"). | Manual + test. |

### 4.6 Website Intelligence (FR-WSI)

*Anchors: §4.7, §7.12 — continuous, not one-shot.*

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-WSI-001 | P0 | The system must produce a website audit covering: performance (Core Web Vitals), SEO basics, conversion elements (CTA presence/positioning/copy), brand consistency, trust signals, mobile UX, form UX, page speed. | Manual: audit 3 sample sites, verify coverage. |
| FR-WSI-002 | P0 | Audits produce a numeric grade (0–100) per category plus an overall grade, plus a prioritized list of issues with recommended fixes. | Manual. |
| FR-WSI-003 | P0 | Audits must be re-runnable on a **schedule** (weekly, monthly) with delta reports highlighting changes since last audit. | Manual: run twice, verify delta. |
| FR-WSI-004 | P0 | Audits must be attachable to a Lead, Deal, Client, or Project — the same audit can appear in multiple contexts without duplication. | Test. |
| FR-WSI-005 | P1 | Audits must include a **business-signals** layer: estimated monthly traffic band, ad-spend indicators, tech stack, tracking-pixel presence, competitor overlap. | Manual + integration. |
| FR-WSI-006 | P1 | Audits must produce a **client-friendly PDF export** with the workspace's branding. | Manual: export PDF, verify branding. |
| FR-WSI-007 | P2 | Audits must produce a **video walkthrough script** (feeds Loom Script Generator). | Manual. |
| FR-WSI-008 | P1 | Continuous monitoring: for a subscribed URL, the system must re-audit on a cadence and open an alert on regression beyond a threshold. | Test: simulate regression, verify alert. |

### 4.7 AI Outreach & SDR Agent (FR-OUT)

*Anchors: §4.6 (SDR agent), §11 (flywheel: outreach → meetings).*

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-OUT-001 | P0 | The system must generate personalized outreach drafts for at least: cold email, Instagram DM, LinkedIn DM. | Manual: generate for each channel. |
| FR-OUT-002 | P0 | Every draft is grounded in the contact's Relationship Profile + Website Intelligence audit (specific citations to what the AI referenced). | Manual: verify citations. |
| FR-OUT-003 | P0 | Every draft is editable inline before sending. No draft is auto-sent in Year 1 (Assist tier). | Manual: draft, edit, send. |
| FR-OUT-004 | P0 | Drafts support tone controls: `friendly`, `professional`, `bold`, `casual`. | Manual: regenerate with tone. |
| FR-OUT-005 | P0 | The system must support sequences (multi-step drips) with per-step timing and per-step regeneration. | Manual. |
| FR-OUT-006 | P0 | Sending is executed via integration with the workspace's chosen ESP (Instantly, Smartlead, Gmail). Verocrest OS does not send email directly in v1. | Integration test. |
| FR-OUT-007 | P0 | The system must record reply status (positive / neutral / negative / unsubscribe / bounce) and update the contact's Relationship Profile. | Integration test. |
| FR-OUT-008 | P1 | The SDR agent (Assist tier) must draft the *next* action based on reply sentiment (e.g. "positive reply → draft meeting-booking response"). | Manual. |
| FR-OUT-009 | P1 | Outreach must expose per-workspace reply rate, positive reply rate, and meeting-booked-rate metrics. | Automated dashboard. |
| FR-OUT-010 | P2 | The SDR agent (Automate tier, Year 2+) may auto-send follow-ups within a policy envelope (max messages/day, max variants/week, blocked domains). | Deferred. |

### 4.8 Loom Script Generator (FR-LOOM)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-LOOM-001 | P0 | The system must generate a video-walkthrough script based on a Website Intelligence audit, structured as: hook, 3 findings, recommendation, CTA. | Manual. |
| FR-LOOM-002 | P0 | Scripts must be shorter than 90 seconds when read at normal pace (~200 words). | Manual: word-count check. |
| FR-LOOM-003 | P1 | Scripts must be regeneratable with different hooks and CTAs. | Manual. |
| FR-LOOM-004 | P1 | Scripts must be exportable as a teleprompter view (large text, controllable speed). | Manual. |

### 4.9 Sales Pipeline & Proposals (FR-SALES)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-SALES-001 | P0 | Deals track: contact(s), stage, value, currency, close date, owner, source, custom fields. | Test on deal CRUD. |
| FR-SALES-002 | P0 | Sales Pipeline supports kanban + list + forecast views. | Manual. |
| FR-SALES-003 | P0 | Deals log every meeting, note, proposal, and payment automatically. | Manual: perform each action, verify logging. |
| FR-SALES-004 | P0 | The Proposal Generator produces a first-draft proposal from a discovery-call transcript + Website Intelligence findings. | Manual: generate proposal from mock inputs. |
| FR-SALES-005 | P0 | Proposals are editable rich-text documents with: cover, problem, solution, deliverables, pricing, timeline, terms. | Manual: edit each section. |
| FR-SALES-006 | P0 | Proposals support e-signature. Signed proposals lock the document and trigger client onboarding. | Manual: sign, verify lock and trigger. |
| FR-SALES-007 | P1 | Proposals track opens, section reads (per-scroll), and time-on-section. | Manual: view proposal, verify analytics. |
| FR-SALES-008 | P0 | Signed proposals must be exportable as PDF with the workspace's branding. | Manual. |
| FR-SALES-009 | P1 | Proposals support reusable templates and variant testing. | Manual. |

### 4.10 Client Portal (FR-PORTAL)

*Anchors: §7.8 — Client experience is a first-class product surface.*

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-PORTAL-001 | P0 | Every client has a workspace-branded portal (subdomain or path, with logo, primary color, favicon). | Manual: view portal as client. |
| FR-PORTAL-002 | P0 | Portal surfaces: project status, current milestones, upcoming meetings, unpaid invoices, deliverable review, message thread with the agency team. | Manual: verify all surfaces. |
| FR-PORTAL-003 | P0 | Client authentication is separate from member auth. Clients can sign in with magic link (default) or password. | Manual. |
| FR-PORTAL-004 | P0 | Clients have view-only access unless explicitly granted comment/approval rights. | Automated: RBAC test. |
| FR-PORTAL-005 | P1 | Portal supports client-side approvals on deliverables (approve, request changes with comment). | Manual. |
| FR-PORTAL-006 | P1 | Portal supports file uploads from client (brief, brand assets) with size and MIME restrictions. | Manual + test. |
| FR-PORTAL-007 | P0 | Portal is fully responsive on mobile. | Manual: 375px viewport check. |

### 4.11 Project Management & Delivery (FR-PROJ)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-PROJ-001 | P0 | Every signed proposal generates a Project with default milestones from a template (agency-configurable). | Manual: sign proposal, verify project. |
| FR-PROJ-002 | P0 | Projects contain tasks with: title, owner, due date, priority, dependencies, checklist, comments. | Manual. |
| FR-PROJ-003 | P0 | Tasks support at least three views: list, kanban, calendar. | Manual. |
| FR-PROJ-004 | P1 | Tasks support subtasks (single level), reminders, and recurring cadence. | Manual. |
| FR-PROJ-005 | P0 | Every project shows a Gantt-lite timeline for milestones. | Manual. |
| FR-PROJ-006 | P0 | Time on tasks may be logged manually. | Manual. |
| FR-PROJ-007 | P1 | Time on tasks may be logged via timer (start/stop, resumable). | Manual. |
| FR-PROJ-008 | P0 | Projects publish a status card to the Client Portal (auto-updated). | Manual: change status, verify portal. |
| FR-PROJ-009 | P1 | The PM Agent (Assist tier) drafts weekly client updates from task state deltas. | Manual: run, verify draft. |
| FR-PROJ-010 | P1 | The PM Agent surfaces risk flags (stalled tasks, missed dependencies, overrun estimates). | Manual: create stalled task, verify flag. |

### 4.12 Calendar (FR-CAL)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-CAL-001 | P0 | Members connect Google Calendar and/or Microsoft 365 via OAuth for read + create events. | Integration. |
| FR-CAL-002 | P0 | The system offers booking links per member (Cal.com-style) with configurable availability and buffer times. | Manual: create link, book. |
| FR-CAL-003 | P0 | Bookings via the workspace's link auto-create a Meeting record on the corresponding Deal or Contact. | Manual. |
| FR-CAL-004 | P1 | Bookings trigger a follow-up sequence (confirmation email, reminder, post-call summary draft). | Manual + integration. |
| FR-CAL-005 | P1 | Calendar shows a per-workspace unified view (all members, all bookings). | Manual. |

### 4.13 Invoices & Payments (FR-FIN)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-FIN-001 | P0 | The system generates invoices per project or per milestone, with line items, tax, currency, and due date. | Manual: create invoice. |
| FR-FIN-002 | P0 | Invoices are sendable as email with a hosted payment link. | Manual. |
| FR-FIN-003 | P0 | Payments are collected via Stripe (v1). | Integration. |
| FR-FIN-004 | P0 | Payment status is tracked per invoice: `draft`, `sent`, `viewed`, `paid`, `overdue`, `void`. | Manual: run each transition. |
| FR-FIN-005 | P1 | Overdue invoices auto-generate reminder drafts on a workspace-configured schedule. | Manual. |
| FR-FIN-006 | P1 | The system exports invoice + payment data to Xero and QuickBooks. | Integration. |
| FR-FIN-007 | P0 | Invoices are branded with workspace assets. | Manual. |
| FR-FIN-008 | P0 | The system supports at least these currencies at launch: AUD, CAD, GBP, NZD, EUR, USD, AED. | Manual. |
| FR-FIN-009 | P2 | Multi-currency reconciliation and FX rate history. | Deferred. |

### 4.14 Analytics & Reports (FR-RPT)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-RPT-001 | P0 | The workspace dashboard surfaces the Secondary Metrics defined in Vision §13.3: Revenue Generated, Hours Saved, AI Tasks Completed, Meetings Booked, Reply Rate. | Manual: verify each tile. |
| FR-RPT-002 | P0 | All metrics are filterable by date range, owner, source, segment. | Manual. |
| FR-RPT-003 | P0 | Reports support export to CSV and PDF. | Manual. |
| FR-RPT-004 | P1 | Reports may be scheduled (daily/weekly/monthly) and delivered by email. | Manual. |
| FR-RPT-005 | P1 | Client-facing performance reports (per project) are generated automatically and publishable to the Client Portal. | Manual. |
| FR-RPT-006 | P2 | Custom report builder (drag-drop fields onto tiles). | Deferred. |
| FR-RPT-007 | P0 | Flywheel Cycle Time (Vision §11.4) is a first-class metric on the workspace dashboard. | Manual. |

### 4.15 Automation (FR-AUTO)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-AUTO-001 | P0 | The system supports rule-based automations (trigger → condition → action). | Manual. |
| FR-AUTO-002 | P0 | Triggers include: new lead ingested, stage changed, invoice paid, task overdue, reply received, agent output produced. | Manual per trigger. |
| FR-AUTO-003 | P0 | Actions include: send notification, create task, move stage, run AI workflow, send outreach, log activity, webhook out. | Manual per action. |
| FR-AUTO-004 | P1 | Automations may call an external n8n webhook (bidirectional integration). | Integration. |
| FR-AUTO-005 | P0 | Every automation run is logged with input, output, duration, and error state. | Manual. |
| FR-AUTO-006 | P0 | Automations must be enable/disable-able per rule without deletion. | Manual. |

### 4.16 Notifications (FR-NOT)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-NOT-001 | P0 | Members receive in-app notifications for: mentions, task assignments, stage changes, replies, agent outputs awaiting review. | Manual per event. |
| FR-NOT-002 | P0 | Members may configure per-category email and (v1.1) push preferences. | Manual. |
| FR-NOT-003 | P0 | Notifications are grouped and digestible (no notification spam). | Manual: verify digest behavior. |
| FR-NOT-004 | P1 | The system supports Slack notification per workspace channel. | Integration. |

### 4.17 Knowledge Base & Documents (FR-KB)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-KB-001 | P0 | The workspace has a Knowledge Base with pages (rich-text), folders, and search. | Manual. |
| FR-KB-002 | P0 | Documents may be attached to Contacts, Deals, Projects, Clients. | Manual. |
| FR-KB-003 | P0 | The Knowledge Base is indexed for the AI Chat Assistant (see FR-AI-CHAT). | Automated: query. |
| FR-KB-004 | P1 | Documents support version history and restore. | Manual. |
| FR-KB-005 | P1 | Documents support shared external links with expiry. | Manual. |

### 4.18 AI Chat Assistant (FR-AI-CHAT)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-AI-CHAT-001 | P0 | The workspace has a chat assistant that can answer questions about workspace data (contacts, deals, projects, KB) with citations. | Manual: ask a question, verify citation. |
| FR-AI-CHAT-002 | P0 | Chat responses cite specific records with clickable references. | Manual. |
| FR-AI-CHAT-003 | P0 | Chat sessions are per-member, private by default; may be shared to workspace. | Manual. |
| FR-AI-CHAT-004 | P0 | Chat has access to AI Memory (see AI-MEM). | Automated: prior context is recalled. |
| FR-AI-CHAT-005 | P1 | Chat can trigger actions (draft an email, create a task) with confirmation. | Manual. |

### 4.19 AI Agents (FR-AGT)

*Anchors: §4.6 — the AI Workforce endgame.*

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-AGT-001 | P0 | Every AI agent has a defined role, an autonomy tier, and a policy envelope. | Manual: inspect agent config. |
| FR-AGT-002 | P0 | Every autonomous or automated action taken by an agent is logged with: agent id, tier, input, decision, output, reversibility flag, cost. | Automated. |
| FR-AGT-003 | P0 | Agents must be independently toggleable per workspace. Disabling an agent has no side-effects on other agents. | Manual. |
| FR-AGT-004 | P0 | Every agent surfaces its recent actions in a per-agent activity view with review + rollback controls. | Manual. |
| FR-AGT-005 | P0 | Year-1 launch ships **SDR Agent (Assist tier only)**. All other agents are Assist-tier drafts or deferred. | Manual: verify tier gates. |
| FR-AGT-006 | P1 | Year-2: PM Agent (Assist tier), CS Agent (Assist tier). | Deferred. |
| FR-AGT-007 | P2 | Year-3: QA Agent, Ops Agent. Promotion to Automate/Autonomous tiers gated on empirical safety data. | Deferred. |
| FR-AGT-008 | P0 | Policy envelopes are workspace-configured (budget cap $/day, max autonomous actions/day, allowed channels, tone rules, blocked domains, business-hours only). | Manual: change envelope, verify enforcement. |

### 4.20 AI Memory (AI-MEM cross-referenced) → see §6.5 for constraints (FR-MEM)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-MEM-001 | P0 | The system stores durable Memory scoped to workspace: interactions, corrections, preferences, prior AI outputs, outcomes. | Automated. |
| FR-MEM-002 | P0 | Every AI operation must read from Memory before responding. | Automated: trace query. |
| FR-MEM-003 | P0 | Every AI operation must write to Memory: what was asked, what was answered, what was accepted/rejected. | Automated. |
| FR-MEM-004 | P0 | Members can view, edit, and delete Memory entries scoped to a Contact, Client, or Deal. | Manual. |
| FR-MEM-005 | P0 | Memory is strictly workspace-scoped. No embedding, vector, or context ever crosses workspaces. See NFR-SEC-007. | Automated: cross-workspace probe. |
| FR-MEM-006 | P1 | Members may mark a Memory entry as "always apply" or "never apply." | Manual. |

### 4.21 Settings (FR-SET)

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-SET-001 | P0 | Workspace settings expose: profile, branding, members & roles, integrations, billing (Act II), AI configuration, notifications, data export, deletion. | Manual. |
| FR-SET-002 | P0 | Member settings expose: profile, password, MFA, sessions, connected accounts, notification preferences. | Manual. |
| FR-SET-003 | P0 | All settings changes are logged to the Action Log. | Automated. |

### 4.22 Future Modules (FR-FUT — deferred but reserved)

- FR-FUT-001 (P3): Marketplace — third-party apps, templates, and prompts.
- FR-FUT-002 (P3): Mobile app — read-first companion for iOS/Android.
- FR-FUT-003 (P3): White-label / reseller mode.

These are enumerated so the architecture in `03_System_Architecture.md` does not accidentally preclude them.

### 4.23 Reminders & Follow-ups (FR-REM)

*Anchors: Vision §11 (Flywheel), §13.3 (Meetings Booked / Reply Rate).* Added in MVP revision — reminders are the connective tissue of the acquisition loop.

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-REM-001 | P0 | Contacts, Leads, and Deals support scheduled follow-up reminders (date/time, note, owner). Multiple reminders per entity are permitted. | Manual: create reminder, verify surfaces on due date. |
| FR-REM-002 | P0 | Overdue and due-today reminders surface on the Dashboard "Follow-ups Due" widget (FR-DASH-002). | Manual: create overdue reminder, verify surfacing. |
| FR-REM-003 | P0 | Reminder completion is a one-click action from the Dashboard or the entity's timeline. Completed reminders are logged to the Action Log. | Manual + automated. |
| FR-REM-004 | P1 | Reminders may be auto-created by pipeline-stage automations (e.g. "when moved to Contacted, create follow-up in 3 days"). | Manual. |
| FR-REM-005 | P1 | Reminders support snooze (1 day / 3 days / 1 week / custom). | Manual. |

### 4.24 Dashboard Widgets (FR-DASH)

*Anchors: Vision §11 (Flywheel), §13.3 (Secondary metrics); PRD §10.2 Module 6.* Added in MVP revision — the dashboard is now a first-class module with named widgets.

| ID | Priority | Requirement | Verifiability |
|---|---|---|---|
| FR-DASH-001 | P0 | **Today's Gold Leads** — leads with lead score ≥ configurable threshold (default 80), outreach readiness = `ready`, and no outreach sent in the last 7 days. Sortable, click-through to lead detail. | Manual: seed data, verify list. |
| FR-DASH-002 | P0 | **Follow-ups Due** — all reminders due today or overdue, grouped by entity, with one-click "complete" or "snooze." | Manual. |
| FR-DASH-003 | P0 | **Upcoming Meetings** — next 7 days of calendar events linked to deals or contacts, showing deal value and stage inline. | Manual. |
| FR-DASH-004 | P0 | **Pipeline Value** — sum of open deal values by stage, filterable by owner and date range. | Manual: seed deals, verify sum. |
| FR-DASH-005 | P0 | **Reply Rate** — positive replies / total sent, rolling 30 days, with delta vs. prior 30 days. | Automated: reply data → rate. |
| FR-DASH-006 | P0 | **Revenue Target** — workspace-configured monthly + quarterly revenue target vs. actual closed-won revenue attributed to Verocrest OS workflows. Progress bar + pace indicator (ahead/behind). | Manual: configure target, log closed deals, verify. |
| FR-DASH-007 | P1 | All widgets support export (CSV) and share (permalink to a filtered view). | Manual. |
| FR-DASH-008 | P1 | The dashboard is customizable by widget order and visibility per member. | Manual. |

---

## 5. Non-Functional Requirements

### 5.1 Performance (NFR-PERF)

| ID | Requirement |
|---|---|
| NFR-PERF-001 | P95 API response time for interactive reads must be < 400ms. |
| NFR-PERF-002 | P95 API response time for interactive writes must be < 600ms. |
| NFR-PERF-003 | Page-level Time-to-Interactive (TTI) must be < 2s on a 4G connection, cold. |
| NFR-PERF-004 | Client-side navigation must feel instant: < 100ms perceived latency for cached routes. |
| NFR-PERF-005 | AI-generated outputs (single-step) must return first-token in < 1.5s and complete in < 15s at P95. |
| NFR-PERF-006 | AI multi-step workflows (e.g. full audit) must complete in < 90s at P95, streamed with progress states. |
| NFR-PERF-007 | Pipeline drag-and-drop must have zero server round-trip perceived latency (optimistic UI). |

### 5.2 Scalability (NFR-SCL)

| ID | Requirement |
|---|---|
| NFR-SCL-001 | The system must support 1,000 concurrent workspaces without architectural redesign. |
| NFR-SCL-002 | Each workspace must support at least 1M contacts and 100k active deals without linear query degradation. |
| NFR-SCL-003 | AI job queue must handle 100 concurrent enrichment/audit/generation jobs per workspace with backpressure. |
| NFR-SCL-004 | The database schema and query patterns must support horizontal read-replica scaling. |
| NFR-SCL-005 | No single table may require online DDL (heavy migration) more than once per quarter. |

### 5.3 Availability & Reliability (NFR-AVL)

| ID | Requirement |
|---|---|
| NFR-AVL-001 | Uptime target: 99.9% monthly for the app; 99.5% for AI-dependent flows (external LLM providers). |
| NFR-AVL-002 | The system must degrade gracefully when an AI provider is down: cached results served, drafts queued, users notified. |
| NFR-AVL-003 | Every write must be durable (transactional, replicated) before returning success. |
| NFR-AVL-004 | Point-in-time recovery of the primary database must cover at least 7 days. |
| NFR-AVL-005 | Documented, tested runbook for every P0/P1 incident class. |

### 5.4 Security (NFR-SEC)

*Anchors: §7.7, §15.*

| ID | Requirement |
|---|---|
| NFR-SEC-001 | All data at rest is encrypted (AES-256 or equivalent). |
| NFR-SEC-002 | All data in transit is encrypted (TLS 1.3 or later). |
| NFR-SEC-003 | Row-level security (RLS) is enforced at the database layer for every business table. RLS bypass is impossible from the app layer. |
| NFR-SEC-004 | Secrets are stored in a dedicated secrets store, never in application code or environment files committed to git. |
| NFR-SEC-005 | Third-party API tokens (Stripe, Google, ESP, etc.) are encrypted per-workspace with a workspace-derived key. |
| NFR-SEC-006 | The Action Log is append-only and tamper-evident (per-row signature or checksum). |
| NFR-SEC-007 | AI operations across workspaces are isolated: no shared prompt, embedding, cache, or fine-tune data may leak workspace context. |
| NFR-SEC-008 | Rate limits are enforced per-workspace and per-member. |
| NFR-SEC-009 | Password policy: minimum 12 characters, breach-check against known password lists. |
| NFR-SEC-010 | Every authentication and authorization change is logged (login, MFA, role change, invite accept). |
| NFR-SEC-011 | Session tokens expire after 12 hours of inactivity, 30 days absolute. |
| NFR-SEC-012 | The system must have a documented vulnerability disclosure policy at SaaS launch. |
| NFR-SEC-013 | Dependency scanning (SBOM, CVE alerts) runs on every deploy. |

### 5.5 Observability (NFR-OBS)

| ID | Requirement |
|---|---|
| NFR-OBS-001 | Every HTTP request carries a request id propagated through logs and downstream calls. |
| NFR-OBS-002 | Structured logs (JSON) are the norm; no unstructured `console.log` in production paths. |
| NFR-OBS-003 | Every AI call records: model, provider, prompt hash, token counts (in/out), latency, cost, workspace id, feature id. |
| NFR-OBS-004 | Error rate, P95 latency, and AI cost dashboards exist per environment. |
| NFR-OBS-005 | Alerts fire on: error rate > 1%, P95 latency > 2× SLO, AI cost > 2× rolling average. |

### 5.6 Accessibility (NFR-A11Y)

| ID | Requirement |
|---|---|
| NFR-A11Y-001 | The app targets WCAG 2.2 AA compliance. |
| NFR-A11Y-002 | All interactive elements are keyboard-navigable. |
| NFR-A11Y-003 | Color contrast meets AA thresholds in both light and dark themes. |
| NFR-A11Y-004 | Focus states are always visible; focus order is logical. |
| NFR-A11Y-005 | Screen-reader labels are present on all icons and non-text controls. |

### 5.7 Internationalization (NFR-I18N)

| ID | Requirement |
|---|---|
| NFR-I18N-001 | v1 is English-only in UI. Data (names, emails) is Unicode throughout. |
| NFR-I18N-002 | All dates are stored as UTC; rendered in the user's timezone. |
| NFR-I18N-003 | All currency values are stored with explicit ISO 4217 code; never rendered without a code. |
| NFR-I18N-004 | The UI is architecturally i18n-ready (string keys, ICU message format) even though only English ships in v1. |

### 5.8 Maintainability (NFR-MNT)

| ID | Requirement |
|---|---|
| NFR-MNT-001 | The codebase has a documented style guide (`18_Coding_Standards.md`). |
| NFR-MNT-002 | No feature ships without at least one automated test covering its happy path. |
| NFR-MNT-003 | No AI feature ships without at least one prompt regression test. |
| NFR-MNT-004 | Every module has an owner and an on-call runbook. |
| NFR-MNT-005 | Modules communicate through documented interfaces (types + contracts), not through shared database access from other modules. |

---

## 6. AI-Specific Requirements

*Anchors: §4.6, §4.7, §7.2, §7.11–13.*

### 6.1 Safety & Human-in-the-Loop (AI-HITL)

| ID | Requirement |
|---|---|
| AI-HITL-001 | In Year 1, every AI output that leaves the workspace (to a client, prospect, or vendor) requires explicit human approval. |
| AI-HITL-002 | Every AI output surfaces a **confidence signal** (`high` / `medium` / `low`) and the reasoning basis. |
| AI-HITL-003 | Every AI output is inspectable: which inputs, which retrieval hits, which prompt version. |
| AI-HITL-004 | Autonomy-tier promotion (Assist → Automate → Autonomous) requires: ≥1000 completed actions at the current tier, <2% correction rate, explicit workspace-owner opt-in. |
| AI-HITL-005 | Every autonomous action is reversible; every non-reversible action is Assist-tier-only. |

### 6.2 Explainability (AI-XPL)

| ID | Requirement |
|---|---|
| AI-XPL-001 | Lead scores expose top signals in plain language (see FR-LEAD-005). |
| AI-XPL-002 | Audit findings cite the specific page element / metric behind the finding. |
| AI-XPL-003 | Outreach drafts cite the Relationship Profile fields and audit findings they referenced. |
| AI-XPL-004 | The AI Chat Assistant cites the records used in its answer. |
| AI-XPL-005 | Explainability payloads are stored with the output so audits are reproducible. |

### 6.3 Cost Management (AI-COST)

| ID | Requirement |
|---|---|
| AI-COST-001 | Every AI feature has a cost budget per workspace per month. Exceeding it degrades to cheaper models or queues. |
| AI-COST-002 | The AI substrate must support multiple providers (see AI-PROV). |
| AI-COST-003 | Prompt caching (provider-side and self-managed) is used wherever prompts are reused. |
| AI-COST-004 | Embeddings are cached and reused across a workspace; recomputed only on content change. |
| AI-COST-005 | Cost telemetry is surfaced to the workspace owner. |

### 6.4 Provider Abstraction (AI-PROV)

| ID | Requirement |
|---|---|
| AI-PROV-001 | AI calls are routed through an internal Model Router, never directly to a vendor SDK from feature code. |
| AI-PROV-002 | The router supports at least two production providers at launch (Anthropic + OpenAI) plus one fallback. |
| AI-PROV-003 | Feature code specifies a **capability** (`draft-outreach`, `score-lead`, `audit-website`), not a model. The router picks the model. |
| AI-PROV-004 | Provider selection may be overridden per workspace (e.g. for compliance or preference). |
| AI-PROV-005 | Failover between providers is automatic on error or timeout. |

### 6.5 Memory Substrate (AI-MEM)

| ID | Requirement |
|---|---|
| AI-MEM-001 | Memory is stored in a dedicated store (embedding index + structured store) scoped to `workspace_id`. |
| AI-MEM-002 | Every read from Memory is filtered by workspace at the query layer; no query may span workspaces. |
| AI-MEM-003 | Memory entries have a source (which interaction produced them), a scope (contact / deal / project / workspace), and an optional TTL. |
| AI-MEM-004 | Memory writes are logged. |
| AI-MEM-005 | Memory content is exportable and deletable by the workspace owner. |
| AI-MEM-006 | Memory does not cross customer boundaries in *any* form (no shared embeddings, no cross-workspace fine-tuning). |

### 6.6 Data Contribution to Provider Training (AI-DAT)

| ID | Requirement |
|---|---|
| AI-DAT-001 | No workspace data is used to train any third-party model without workspace-owner opt-in. |
| AI-DAT-002 | Provider integrations must be configured with training-off flags where available. |
| AI-DAT-003 | Opt-in status is per-workspace, logged, and reversible. |

---

## 7. Data & Privacy Requirements

*Anchors: §7.7, §15, §NFR-SEC.*

| ID | Requirement |
|---|---|
| DATA-001 | Personal data (contacts, members, clients) is classified and inventoried. Every field is tagged with a sensitivity label. |
| DATA-002 | Consent is captured and timestamped for any prospect ingested via form or API. |
| DATA-003 | Data subject requests (access, deletion, export) are supported and processed within 30 days. |
| DATA-004 | Deletion is a real deletion. Soft-delete is a UX affordance; hard-delete removes data from primary stores and, on a documented cadence, from backups. |
| DATA-005 | The system supports GDPR- and CCPA-style data export in machine-readable form. |
| DATA-006 | Data retention policies are documented per entity and configurable per workspace. |
| DATA-007 | Data residency: v1 stores all data in a single region (US or EU, TBD in `16_Deployment.md`). Multi-region residency deferred. |

---

## 8. Integration Requirements

*Anchors: §7.3, §8 non-goals — we do not become an ESP or accounting suite.*

| ID | Requirement |
|---|---|
| INT-001 | Google (Gmail, Calendar, Drive) via OAuth. |
| INT-002 | Microsoft 365 (Outlook, Calendar) via OAuth (v1.1). |
| INT-003 | Stripe for payments (v1). |
| INT-004 | ESP integrations: Instantly, Smartlead (v1); Lemlist (v1.1). |
| INT-005 | Accounting: Xero, QuickBooks (v1). |
| INT-006 | Automation: n8n via webhooks (v1). |
| INT-007 | Enrichment providers (e.g. Clearbit, Apollo, or equivalent — evaluated in `11_Integrations.md`). |
| INT-008 | Every integration must be workspace-scoped, revocable, and logged. |
| INT-009 | Every integration must degrade gracefully when disconnected (features that depend on it are visibly gated, not silently broken). |

---

## 9. Compliance Requirements

| ID | Requirement |
|---|---|
| CMP-001 | GDPR-aligned data handling (consent, access, deletion, portability). |
| CMP-002 | CCPA-aligned consumer rights. |
| CMP-003 | CAN-SPAM / anti-spam law compliance in outreach features (unsubscribe honoring, sender identification, no false headers). |
| CMP-004 | Australian Spam Act 2003 compliance (matters for AU-based agencies). |
| CMP-005 | SOC 2 Type I: goal within 12 months of SaaS launch. Type II: within 24 months. |
| CMP-006 | Cookie consent and analytics disclosure on marketing pages. |
| CMP-007 | Terms of Service and Privacy Policy published and versioned. |

---

## 10. MVP Definition — Version 0.1 (Core Engine First)

### 10.1 Revised MVP Goal

> **The founder should be able to acquire, manage, and close international agency clients entirely inside Verocrest OS.**

This is a deliberate scope narrowing from the earlier draft. Everything downstream of a signed proposal + deposit paid — project delivery, client portal, PM, tasks, invoicing at scale, team ops — is Phase 2 or later.

**Version 0.1 is a client acquisition engine. It is not yet a full agency OS.**

**Rationale.** The immediate business need for Verocrest the agency is *international client acquisition*, and no existing tool combines the four differentiators we need (Website Intelligence, Relationship Intelligence, AI Personalization, AI Memory) into one workflow. Delivery and finance operations have adequate stopgaps (Notion, Google Docs, Loom, manual Stripe links). Acquisition tooling with this AI substrate does not exist. Build the differentiator first; ship the rest against real customer pull, not speculation.

**This also aligns with Vision §11 (Flywheel).** The flywheel accelerates on the acquisition side (content → outreach → meetings → clients). The delivery side matters, but a slow delivery layer does not slow the flywheel — a slow acquisition layer does.

### 10.2 The Six Core Modules

Version 0.1 ships exactly these six modules, in priority order.

| # | Module | Purpose | Primary AI Value |
|---|---|---|---|
| 1 | **Authentication** | Signup, login, Google OAuth, workspace scaffolding | — |
| 2 | **Lead Intelligence** | Lead database, contacts, lead scoring, Relationship Intelligence, Website Intelligence, AI Memory | Score, enrich, remember |
| 3 | **AI Website Auditor** | Comprehensive audit: CTA, booking, mobile, trust, conversion recommendations; audit history + deltas | Audit + prescription |
| 4 | **AI Personalization** | Personalized first-line, Instagram DM, cold email, Loom talking points; outreach history | Personalize at scale |
| 5 | **Sales CRM** | Lead pipeline, outreach tracking, follow-up reminders, meeting tracking, proposal status (+ AI proposal generator) | Draft proposals |
| 6 | **Dashboard** | Today's Gold Leads, Follow-ups Due, Upcoming Meetings, Pipeline Value, Reply Rate, Revenue Target | Surface the flywheel |

### 10.3 In-MVP Requirement Traceability

Every ID below is IN MVP. Every ID not listed here is Phase 2 or later (see §10.5).

**Module 1 — Authentication**
- FR-IDT-001, 002, 003, 005, 006, 007 (roles simplified to `owner` + `member` at MVP), 008, 011
- FR-WS-001, 002, 003, 005

**Module 2 — Lead Intelligence**
- FR-CNT-001–005, 007, 009 (contacts + Relationship Profile + timeline + CSV import + entity linking)
- FR-LEAD-001–006, 008, 010 (ingest, enrich, score, configurable rubric, explainability, idempotency, score history, audit surfacing)
- FR-WSI-001–004 (Website Intelligence — audit baseline, delta reports)
- FR-MEM-001–005 (AI Memory substrate — read/write/manage/isolate)

**Module 3 — AI Website Auditor**
- FR-WSI-001–004 (shared with Module 2 — audit is the core primitive that Lead Intelligence consumes)
- **Excluded from MVP:** FR-WSI-005 (business-signals layer), FR-WSI-006 (branded PDF export), FR-WSI-007 (video walkthrough script), FR-WSI-008 (continuous monitoring)

**Module 4 — AI Personalization**
- FR-OUT-001, 002, 003, 004 (drafts across cold email + IG DM + LinkedIn DM, grounded in audit + relationship, editable, tone control)
- FR-OUT-005 (sequences: MVP = manual "draft next step" prompt; automated drip sequencing is Phase 2)
- FR-OUT-006 (send via integration): **MVP = Gmail send integration only.** Instagram DM and LinkedIn DM are copy-to-clipboard in MVP (no reliable public API). Instantly / Smartlead / Lemlist integrations are Phase 2.
- FR-OUT-007 (reply status): MVP covers Gmail replies (via Gmail push notifications); ESP webhook reply tracking is Phase 2.
- FR-LOOM-001, 002 (Loom talking points and script generation)

**Module 5 — Sales CRM**
- FR-PIPE-001, 002, 003, 004, 006 (kanban pipeline + views + logging + stage automations)
- FR-SALES-001, 002, 003 (deals + views + auto-logging)
- FR-SALES-004, 005 (AI proposal generator + rich-text editing) — *strongly recommended for MVP because proposal drafting is the single highest-leverage AI moment in the acquisition cycle. Alternative: defer to Phase 2 and rely on external tools; see §17 Q6.*
- FR-SALES-008 (PDF export)
- **Excluded from MVP:** FR-SALES-006 (in-house e-signature — use external DocuSign/Adobe Sign, track status only in MVP), FR-SALES-007 (engagement analytics), FR-SALES-009 (templates + variants)
- FR-CAL-001 (Google Calendar OAuth read + create)
- FR-CAL-002 (basic booking link — Cal.com-style)
- FR-CAL-003 (bookings auto-create Meeting record on Deal/Contact — needed to power FR-DASH-003)
- **Excluded from MVP:** FR-CAL-004 (post-call auto-sequence), FR-CAL-005 (unified team calendar)
- FR-REM-001, 002, 003 (follow-up reminders — see §4.23)
- FR-NOT-001, 002 (in-app + email notifications; Slack is Phase 2)

**Module 6 — Dashboard**
- FR-DASH-001 through FR-DASH-006 (six named widgets — see §4.24)
- FR-RPT-001, 002, 003 (dashboard surface + filters + CSV/PDF export)
- FR-RPT-007 (Flywheel Cycle Time)

**Cross-cutting (all modules)**
- All **NFR-SEC-*** except -010 (formal audit gate, pre-SaaS) and -012 (vulnerability disclosure policy, pre-SaaS)
- All **NFR-OBS-*** (observability from day one is non-negotiable)
- **NFR-PERF-001 through 005** (baseline performance)
- All **NFR-A11Y-*** (accessibility is not deferrable)
- **NFR-I18N-002, 003, 004** (UTC dates, ISO currency, i18n-ready strings)
- All **NFR-MNT-***
- All **AI-*** (HITL, explainability, cost, provider abstraction, memory constraints, no third-party training)
- All **DATA-*** except DATA-005 (formal machine-readable export tooling — Phase 3)
- **INT-001** (Google), **INT-008, 009** (integrations must be workspace-scoped, revocable, graceful)

### 10.4 MVP Acceptance Test (Go/No-Go)

**The founder signs at least one paying international agency client end-to-end inside Verocrest OS.**

End-to-end means:

1. Lead ingested (CSV / manual / form) →
2. Lead auto-enriched + scored + audited →
3. Personalized outreach drafted (email + DM) →
4. Sent (email via Gmail; DM via copy-paste) →
5. Reply logged; contact's Relationship Profile updated →
6. Meeting booked via booking link, linked to deal →
7. Meeting tracked and completed →
8. Proposal drafted by AI, edited, exported as PDF, sent →
9. Proposal status advanced (draft → sent → viewed → signed) →
10. Deal marked won; deposit invoice sent (Stripe payment link or wire — generated outside OS in MVP).

**No Notion. No external CRM. No external outreach tool.** For the acquisition portion.

Delivery of the client's work (project setup, tasks, invoicing beyond deposit, client portal) is *not* part of MVP acceptance. Those workflows continue in existing tools until Phase 2 replaces them.

### 10.5 Phased Roadmap of Deferred Modules

Modules moved out of MVP are **not deleted**. They retain their FR-* IDs and section text in §4. What changes is *when* they ship.

#### Phase 2 (Months 4–9 after MVP ship)

**Trigger to start Phase 2:** MVP acceptance test passes for at least 3 client acquisitions AND Verocrest weekly acquisition operations happen 100% inside Verocrest OS.

- **Client Portal** — FR-PORTAL-001 through 007
- **Project Management + Tasks** — FR-PROJ-001 through 010
- **Full Calendar module** — FR-CAL-004, 005
- **Invoices + Payments** — FR-FIN-001 through 008 (Stripe live, multi-currency)
- **Advanced automation** — FR-AUTO-004 (n8n webhooks), multi-step chains
- **Continuous Website Monitoring** — FR-WSI-008 (scheduled re-audits + regression alerts)
- **Extended reports** — FR-RPT-004 (scheduled email reports), FR-RPT-005 (client-facing performance reports)
- **ESP integrations beyond Gmail** — FR-OUT-006 extended to Instantly, Smartlead, and Lemlist; FR-OUT-007 extended to ESP webhook reply tracking
- **Proposal enhancements** — FR-SALES-006 (in-house e-signature), FR-SALES-007 (engagement analytics), FR-SALES-009 (templates + variants)
- **Slack notifications** — FR-NOT-004
- **Automated overdue invoice reminders** — FR-FIN-005

#### Phase 3 (Months 9–15 after MVP ship)

- **Team Management with custom roles** — FR-IDT-004 (TOTP MFA), FR-IDT-009 (invite flow at scale), FR-IDT-012 (session revocation UI), FR-WS-004 (custom role definitions)
- **Knowledge Base** — FR-KB-001 through 005
- **AI Chat Assistant** — FR-AI-CHAT-001 through 005
- **PM Agent (Assist tier)** — FR-AGT-006 partial; FR-PROJ-009, 010
- **CS Agent (Assist tier)** — FR-AGT-006 partial
- **Website Intelligence business signals** — FR-WSI-005
- **Client-facing branded PDF audit exports** — FR-WSI-006
- **Loom Script Generator advanced** — FR-LOOM-003, 004
- **Accounting integrations** — FR-FIN-006 (Xero, QuickBooks)
- **Data export tooling** — DATA-005 (machine-readable per DSAR)
- **Custom report builder** — FR-RPT-006

#### Future SaaS — Act II (Month 12+, gated on Act I PMF)

- **Multi-tenant billing** — Stripe subscriptions, tier management, per-seat + AI-credit metering
- **Public API + Webhook system**
- **Marketplace** — FR-FUT-001 (third-party apps, templates, prompts)
- **SSO / SAML** — FR-IDT-010
- **Advanced agent tiers** — Automate + Autonomous per Vision §4.6
- **QA Agent + Ops Agent** — FR-AGT-007
- **Native mobile app** — FR-FUT-002
- **Multi-region residency**
- **SOC 2 Type I audit** — CMP-005
- **White-labeling** — FR-FUT-003 (still deferred per Vision §8; revisit Year 3)

### 10.6 What Version 0.1 Explicitly Does NOT Do

To keep discipline unambiguous, Version 0.1 does **not**:

- Manage post-sale delivery in any form
- Bill or invoice clients (the deposit invoice is generated externally)
- Host client-facing project boards, deliverables, or files
- Track team member time or capacity
- Send automated multi-step drip sequences (single-step drafts only)
- Sign proposals with in-house e-signature (external tools + status tracking only)
- Support member types beyond `owner` + `member`
- Support MFA or SSO
- Publish reports to clients
- Provide a public API or webhooks (internal-only automation)

Every one of these is a legitimate future feature. None is a launch feature.

### 10.7 What Changes vs. the Prior MVP Definition

For traceability, this table records what moved between the earlier draft and this revised MVP.

| Prior MVP inclusion | Revised classification | Rationale |
|---|---|---|
| Client Portal (FR-PORTAL-*) | Phase 2 | Delivery-side; not needed to close deals |
| Project Management (FR-PROJ-*) | Phase 2 | Delivery-side |
| Invoices + Payments (FR-FIN-*) | Phase 2 (deposit invoice sent externally in MVP) | Stripe payment link works outside OS for MVP |
| AI Chat Assistant (FR-AI-CHAT-*) | Phase 3 | Nice-to-have; not blocking acquisition |
| Automations at MVP (FR-AUTO-001–003) | Trimmed: pipeline-stage automations only in MVP; general automation UI in Phase 2 | Bounds surface area |
| Team Management + MFA + custom roles | Phase 3 | Solo-founder use during MVP; team surfaces are Phase 3 |
| Extended reports (FR-RPT-004, 005, 006) | Phase 2/3 | Dashboard widgets suffice for MVP |

---

## 11. Prioritization Model

We use MoSCoW mapped to priority levels:

- **P0 — Must Have.** Blocks MVP. Ship or slip the release.
- **P1 — Should Have.** Ship in v1.x, within 6 months of MVP.
- **P2 — Could Have.** Ship if capacity allows; otherwise deferred.
- **P3 — Won't Have (v1).** Explicitly deferred; documented in backlog.

**Prioritization principles:**
1. Any P0 requirement that a Verocrest team member doesn't touch weekly may be demoted to P1 after Sprint 4.
2. Any P1 requirement that blocks Vision §11 flywheel throughput must be promoted to P0.
3. Any P2 that is not attempted within 12 months of MVP is auto-demoted to P3 with owner approval.

---

## 12. Acceptance Criteria Template

Every module in `06_Feature_Modules.md` must include acceptance criteria in the format below. This is the contract used for QA sign-off.

```
Feature: <Module.Feature name>
Requirement IDs covered: <FR-XXX-YYY, ...>

Given <initial state>
When <action taken>
Then <observable, measurable outcome>
  And <side effects, if any>
  And <negative outcomes that must NOT occur>

Edge cases:
  - <case 1: input, expected behavior>
  - <case 2: input, expected behavior>

Performance:
  - <latency, throughput, or cost target from NFR-PERF>

Security:
  - <RBAC checks, RLS checks, action-log entries>

Telemetry:
  - <metrics that must be emitted>
```

---

## 13. Traceability

Every module document in `06_Feature_Modules.md` must contain a **Requirement Traceability Table**:

| Module Feature | Covers Requirement IDs |
|---|---|
| Lead ingestion (CSV) | FR-LEAD-001, FR-LEAD-006, DATA-002 |
| ... | ... |

The reverse — every requirement in this PRD → one or more module features — is asserted in `20_Project_Checklist.md`. If any requirement has zero coverage at MVP-ship, the release is blocked.

---

## 14. Constraints

| ID | Constraint |
|---|---|
| CON-001 | Team size at MVP: 1 founder-engineer + optional part-time contractor. All requirements are sized against this. |
| CON-002 | Budget for AI substrate must be reconciled monthly. Runaway AI spend > 20% of the internal target requires rollback. |
| CON-003 | No custom infrastructure at MVP. Managed services (Vercel, Supabase, Stripe) only. |
| CON-004 | No white-labeling in v1 (Vision §8). |
| CON-005 | No self-hosted / on-prem option in v1. |

---

## 15. Assumptions

| ID | Assumption | If false, this changes |
|---|---|---|
| ASM-001 | Anthropic and OpenAI APIs remain available at ≤2× current pricing through Year 1. | AI-COST model, pricing hypothesis |
| ASM-002 | Supabase RLS performance is sufficient up to ~500 workspaces. | Scaling plan in `03_System_Architecture.md` |
| ASM-003 | Stripe is available in all seven target countries. | Payments integration timeline |
| ASM-004 | Instantly / Smartlead APIs remain stable and offer webhook-based reply tracking. | Outreach architecture |
| ASM-005 | The founder can dedicate ≥30 hours/week to product build. | Sprint plan velocity |

---

## 16. Out of Scope for Version 0.1

For the phased classification of deferred modules (Phase 2 / Phase 3 / Future SaaS), see **§10.5**. This section lists items that are out of scope across *all* phases until reconsidered.

- White-labeling / reseller mode (deferred per Vision §8; revisit Year 3)
- On-prem / self-hosted deployment
- Freemium tier (Vision §12.3)
- Native site building (Vision §8)
- Full accounting suite (books stay in Xero / QuickBooks)
- SMS as a primary outreach channel (evaluate in Phase 3+)
- Complex e-commerce (subscription products beyond the workspace subscription itself)
- Cryptocurrency payments

Items that are **deferred to a later phase** (not out of scope forever) are catalogued in §10.5. Anything in §10.5 has a defined phase trigger and a home in the roadmap. Anything in this §16 does not.

---

## 17. Open Questions

The following require founder decisions before dependent documents can be finalized. Questions resolved by the Core Engine First MVP revision are marked ✅ or ⏭ (deferred).

| # | Question | Status | Depends on | Blocks |
|---|---|---|---|---|
| Q1 | Confirm: the AI Personalization module (essentially the SDR agent at Assist tier) ships in MVP; no separate agent architecture at MVP. | ✅ Resolved by §10.2 Module 4 | — | — |
| Q2 | Which region hosts data in v1 — US or EU? Affects latency, compliance, integrations. **CTO recommendation: US primary (Supabase US-East), given target ICP is US/UK/AU-heavy and Supabase US region offers lowest Anthropic + OpenAI latency.** | ⏳ Open | Compliance strategy | `16_Deployment.md`, `03_System_Architecture.md` |
| Q3 | Is Anthropic (Claude) the primary LLM at launch, with OpenAI fallback? **CTO recommendation: Anthropic Claude Sonnet 5 primary for reasoning + drafting; OpenAI GPT-4-class for structured extraction + audit parsing; both behind the Model Router.** | ⏳ Open (default assumed) | AI budget analysis | `09_AI_Architecture.md` |
| Q4 | For MFA: TOTP-only v1, or add WebAuthn? | ⏭ Deferred to Phase 3 (solo-founder MVP does not need MFA) | Security posture | `15_Security.md` (Phase 3) |
| Q5 | Client Portal subdomain vs. path model. | ⏭ Deferred to Phase 2 (Client Portal is Phase 2) | Brand strategy | Phase 2 architecture addendum |
| Q6 | Proposal e-signature: in-house vs. vendor. **MVP decision: external vendor (DocuSign/Adobe Sign), status tracked in Verocrest OS. In-house e-signature is Phase 2 (FR-SALES-006).** | ✅ Resolved | — | — |
| Q7 | Memory substrate: pgvector (in-Postgres) or dedicated vector store (Pinecone/Weaviate)? **CTO recommendation: pgvector in Supabase for MVP; documented migration path to dedicated store at ~500 workspaces or ~10M vectors.** | ⏳ Open (recommendation stated) | Scaling plan | `09_AI_Architecture.md`, `04_Database_Design.md` |
| Q8 (new) | Confirm the AI Proposal Generator (FR-SALES-004, 005) is in MVP scope. **CTO recommendation: yes — proposal drafting is the single highest-leverage AI moment in the acquisition cycle.** Alternative: defer to Phase 2 and let founder draft in Google Docs during MVP, using Sales CRM only for status tracking. | ⏳ Open | — | Module 5 scope |
| Q9 (new) | Confirm Gmail is the sole outbound email channel in MVP (FR-OUT-006 constrained). Instantly/Smartlead/Lemlist are Phase 2. | ⏳ Open (default assumed) | Outreach strategy | `11_Integrations.md` |
| Q10 (new) | Confirm the founder's Google Workspace can be used for Gmail send + Calendar OAuth during MVP (i.e., no dedicated ESP domain warm-up needed in v0.1). | ⏳ Open | Deliverability plan | Module 4 |

---

## 18. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | Every requirement carries a stable ID + priority + vision anchor + verifiability rule | Traceability is the spine of the blueprint; without it, downstream drift is silent. |
| 2026-07-01 | MoSCoW mapped to P0/P1/P2/P3 | Common in industry, unambiguous, aligns with sprint planning. |
| 2026-07-01 | MVP acceptance is dogfood-based, not feature-count-based | Consistent with Vision §10 operator moat. |
| 2026-07-01 | SDR Agent is the only agent shipping at MVP; all others deferred | Bounds scope; matches Vision §14 bet #2 (workforce endgame without over-engineering). |
| 2026-07-01 | Memory is a P0 requirement, not deferred | Retrofitting memory is impossible; it must be the substrate from day one (Vision §7.13). |
| 2026-07-01 | AI operations must go through a Model Router; no direct SDK use from feature code | Provider abstraction is a hard requirement (Vision risk register, AI-COST-002). |
| 2026-07-01 (rev) | **Redefine MVP as "Core Engine First" with six focused modules** (Auth, Lead Intelligence, AI Website Auditor, AI Personalization, Sales CRM, Dashboard). | The immediate business need is international client acquisition; no existing tool combines Website + Relationship + Personalization + Memory. Delivery has adequate stopgaps. Build the differentiator first. |
| 2026-07-01 (rev) | Delivery-side modules (Client Portal, PM, Tasks, Invoices, Payments, Knowledge Base, AI Chat, Team Mgmt, advanced Automations) reclassified to Phase 2 / Phase 3 / Future SaaS, **not deleted**. | Preserves traceability; requirement IDs remain valid; when phase triggers fire, they ship on the same rails. |
| 2026-07-01 (rev) | Added FR-REM-* (Reminders) and FR-DASH-* (Dashboard Widgets) as first-class requirement groups. | These are core to the acquisition workflow and were previously implicit; making them explicit closes traceability gaps. |
| 2026-07-01 (rev) | MVP acceptance is defined as "founder signs at least one paying international client end-to-end inside Verocrest OS" (acquisition side only). | Concrete, testable, ties directly to Vision §6.1 and §11 flywheel. |
| 2026-07-01 (rev) | MVP e-signature = external vendor + status tracking; in-house e-sign is Phase 2. | Ships faster, uses proven legal-quality vendor, defers scope. |
| 2026-07-01 (rev) | MVP roles = `owner` + `member` only. Custom roles + MFA + SSO are Phase 3+. | Solo-founder use during MVP; team surfaces have no consumer at MVP. |

---

## 19. Approval Gate

To move to `03_System_Architecture.md`, the founder must sign off on:

1. **MVP definition (§10) as stated** — the "one paying client end-to-end inside Verocrest OS" bar.
2. **The seven open questions (§17)** — even a directional answer is fine; architecture needs guidance.
3. **The AI-MEM constraint** that Memory is P0 and cannot be deferred.
4. **The Model Router abstraction** (AI-PROV-001) — this is a load-bearing architectural constraint.

---

*End of 02_Product_Requirements.md*

---

**Should I continue to the next blueprint document (`03_System_Architecture.md`)?**

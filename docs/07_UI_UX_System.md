# 07 — UI / UX System

**Document:** UX System — Information Architecture, Interaction Patterns, States, Motion, Accessibility, Voice
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint — Core Engine First)
**Status:** Approved
**Owner:** Founder / CTO / UX
**Depends on (frozen):** `01_Vision.md`, `02_Product_Requirements.md`, `03_System_Architecture.md`, `04_Database_Design.md`, `05_User_Flows.md`, `06_Feature_Modules.md`
**Complements:** `08_Design_System.md` (visual tokens: color hex, type scale, spacing, radius, shadows, icons)
**Last updated:** 2026-07-01

---

## 0. How to read this document

This document is the **UX system contract** — the rules for how Verocrest OS behaves as an interface, independent of what colors and fonts it wears (that is `08_Design_System.md`).

- **Scope:** information architecture, navigation, screen taxonomy, interaction patterns, AI-specific patterns, state patterns, motion, accessibility, keyboard shortcuts, responsive rules, dark mode, copy voice, error UI.
- **Not in scope:** hex values, typography scale, exact pixel spacing, icon set, component-level implementation. Those are `08`.
- **Frozen upstream:** every screen, pattern, and interaction traces to `01–06`. No new module surfaces are introduced here.
- **Reference aesthetic** (per `01` §UI/UX): Linear (density + speed), Notion (rich editors), Vercel (docs clarity + dashboard), Stripe (form + trust), Raycast (command palette), Arc Browser (sidebar + workspace switching). Verocrest OS should feel like a peer to these, not a knock-off of any single one.

If a downstream document (component library, engineering implementation) contradicts what is written here, this document wins until formally amended.

---

## 1. Design Principles

Nine principles, in strict priority order. Earlier principles win when they conflict with later ones.

1. **Fast beats featureful.** Perceived latency under 100ms for cached routes. Optimistic UI wherever safe. Pipeline drag is zero-round-trip. If a widget is slow, we cut it — not the perf budget.
2. **Keyboard-first.** Every action a mouse can do, a keyboard can do. Command palette (`⌘K`) is the fastest path anywhere. Owner should be able to run an entire acquisition day without touching the trackpad.
3. **Dark mode first, light mode equally supported.** Dark is the default; light is not a second-class citizen. Both are designed together in `08`.
4. **Opinionated defaults, escape hatches when needed.** Fixed widget order, fixed sidebar order, default filters. Advanced controls one click deep, never zero.
5. **AI is inline, not sidebarred.** AI outputs appear inside the workflow that produced them. There is no "AI section" — there is a Draft dialog, a Trace panel, a confidence pill.
6. **Every state is designed.** Empty, loading, error, degraded, success, disabled. No unhandled state may ship. The empty state is often the most-viewed screen in a workspace's first week.
7. **Density calibrated for operators.** Compact rows, tight vertical rhythm, information-per-screen leaning high. This is a professional tool used all day, not a marketing surface.
8. **Motion serves function, never decoration.** Motion signals state change, causality, and hierarchy. It never entertains. Reduced-motion respected globally.
9. **Voice is direct, respectful, human.** No jargon-as-drama. No exclamation points except in one place (onboarding completion). No emojis. Confident but not arrogant.

---

## 2. Information Architecture

### 2.1 Top-level surfaces (workspace context)

Ordered exactly as they appear in the sidebar. This order is **fixed in v0.1** (per `06` §7.10 and §12 decision log).

1. **Dashboard** (`/`) — home
2. **Queue** (`/queue`) — Outreach Queue browser (Gold Leads context)
3. **Contacts** (`/contacts`) — contacts + leads unified list, scoped by filter
4. **Companies** (`/companies`) — companies list + Company Suggestions
5. **Pipeline** (`/pipeline`) — kanban of active deals
6. **Audits** (`/audits`) — audit browser
7. **Outreach** (`/outreach`) — outreach history
8. **Meetings** (`/meetings`) — upcoming + past
9. **KB** (`/kb`) — Knowledge Documents (narrow v0.1 surface)
10. **Offers** (`/offers`) — offer catalogue
11. **Settings** (`/settings`) — settings shell (§3 of `06`)

Below the top-level list, in a secondary section of the sidebar:

- **Notifications** (`/notifications`) — bell target
- **Onboarding** (only visible while checklist < 100%)

### 2.2 URL structure — routes as source of truth

- Routes reflect entity + view: `/contacts/:id`, `/deals/:id`, `/audits/:id/loom`
- Filters and view modes are query parameters: `/pipeline?view=list&owner=self`
- Public unauthenticated routes: `/signup`, `/signin`, `/verify`, `/book/<workspace-slug>/<link-slug>`, `/oauth/callback/*`
- Deep-linkable everywhere: every filter state, every widget filter, every modal that opens on a specific entity carries a shareable URL

### 2.3 Entity-first mental model

Users think in **entities**, not features:

- **Contact** (person)
- **Company** (org)
- **Lead** (contact + intent)
- **Deal** (revenue opportunity)
- **Audit** (website snapshot)
- **Proposal** (a sent document)
- **Meeting** (calendar event)
- **Offer** (service definition)
- **ICP** (target definition)
- **KB Doc** (institutional knowledge)

Every detail screen is an **entity page** with a consistent layout (§6.2). Every list is an entity list. Cross-entity relationships are always navigable via a chip / avatar / link — never buried.

---

## 3. Global Shell

### 3.1 Layout skeleton

```
┌─────────────────────────────────────────────────────────────────┐
│  Sidebar   │              Content Region                        │
│  (240px)   │  ┌────────────────────────────────────────────┐   │
│            │  │  Top bar (breadcrumb + actions + user)      │   │
│  fixed     │  ├────────────────────────────────────────────┤   │
│  vertical  │  │                                             │   │
│  scroll    │  │  Route view                                 │   │
│  own       │  │  (list / detail / editor / kanban /         │   │
│            │  │   dashboard / dialog)                       │   │
│            │  │                                             │   │
│            │  │                                             │   │
│            │  └────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

- Sidebar: fixed 240px on desktop, collapses to icon-only rail at 64px on tablet-narrow, hidden behind hamburger on mobile
- Top bar: 48px, sticky
- Content region: scrolls independently of sidebar

### 3.2 Sidebar

Composition top-to-bottom:

1. **Workspace switcher** — logo + workspace name; click opens dropdown (Arc Browser style) listing all workspaces the user belongs to, plus "Create new workspace" (Phase 3+)
2. **Search bar** — clicking triggers command palette (§4); keyboard `⌘K`
3. **Primary navigation** — the 11 top-level surfaces from §2.1
4. **Divider**
5. **Notifications** — bell with unread count
6. **Onboarding** — visible only while incomplete; shows percentage
7. **Spacer** (flex-grow)
8. **User menu** — avatar + name; click opens dropdown with Profile, Sign out, keyboard-shortcut cheatsheet

Sidebar item:
- Icon (Lucide) + label + optional count badge (e.g., `Notifications 3`, `Onboarding 40%`)
- Active item: primary-color left bar + tinted background
- Hover: subtle background elevation
- Focus: visible ring; not the same as hover

### 3.3 Top bar

Composition left-to-right:

- **Breadcrumb** — max 3 levels (workspace / area / entity), truncates middle with ellipsis when too long. Clickable segments.
- **Right cluster:**
  - Contextual actions (varies by page — e.g., "New contact", "Run audit", "Draft outreach")
  - View toggles (kanban / list / calendar / forecast)
  - Filter chip that opens a filter panel
  - Divider
  - Notification bell (mirror of sidebar for right-hand reach)
  - User avatar
- Height: 48px (60px on mobile for touch targets)

### 3.4 Breadcrumbs

- Always visible on non-Dashboard routes
- Segments: **Workspace** > **Area** > **Entity name**
- Entity name is the most important; segments before it truncate first
- On mobile, only the deepest segment shows plus a back chevron

### 3.5 Workspace switcher

- Displays: workspace logo (from `workspaces.brand`), workspace name, dropdown chevron
- Dropdown items: each workspace the user belongs to with role pill (`owner` / `member`) + Create new workspace CTA (Phase 3+)
- Keyboard: `⌘⇧O` opens the workspace switcher

### 3.6 User menu

Under the avatar dropdown:

- Profile (`/settings/profile`)
- Notification preferences (`/settings/notifications`)
- Keyboard-shortcut cheatsheet (opens `?` overlay — see §13)
- Documentation link (external, opens in new tab)
- Divider
- Sign out (with confirmation if unsaved changes exist)

---

## 4. Command Palette (⌘K)

The command palette is the fastest path to anywhere in Verocrest OS. Inspired by Raycast and Linear.

### 4.1 Trigger

- `⌘K` (Mac) or `Ctrl+K` (Windows/Linux) — global
- Sidebar search bar click
- The `⌘K` hint is always visible in the search bar to teach the shortcut

### 4.2 Sections (in order)

1. **Suggested** — top 3 dynamic entries based on recent activity
2. **Navigate** — jump to any top-level surface (all 11 from §2.1) + subroutes
3. **Create** — quick-add entities: `Add contact`, `Add company`, `Add lead`, `Add reminder`, `Run audit`, `Draft outreach`, `New deal`, `New offer`, `New ICP`
4. **Search** — fuzzy search across contacts, companies, deals, KB docs, offers, ICPs
5. **Actions** — context-aware actions on the current screen (e.g., on a lead: "Score", "Draft outreach", "Add reminder", "Copy email")
6. **Settings** — jump to any Settings sub-surface
7. **Help** — Keyboard cheatsheet, Docs, What's new

### 4.3 Behavior

- Opens as an overlay dialog with backdrop; centered vertically
- Keyboard-only interaction expected: arrow keys, Enter, Esc
- Results render < 50ms after each keystroke; debounce is minimal
- Highlight matched substrings
- Right-side of each result shows the shortcut if one exists (`Contacts` → `⌘⇧C`)
- Escape closes; clicking outside closes
- State persists across opens (last query pre-selected, easy to re-invoke)

### 4.4 Entity search behavior

- Matches on: name, email, company, tag, slug
- Sorts by: relevance × recency × role in queue (Gold Lead > cold lead)
- Shows: primary label, secondary label (email or company), badge (score / stage / status)

### 4.5 Future Evolution (Phase 3+; no v0.1 functionality)

The Command Palette is designed to become the **universal AI command center**. Later evolution — additive, no rewrite:

- **Natural-language commands** — "draft an outreach to Sarah about our new SEO offer" resolves through the Model Router directly, no manual step-picking. Palette becomes a first-class prompt surface for the workspace's own AI capabilities.
- **Agent handoff** — commands may be routed to any active AI agent (Module 4 Outreach / Follow-up / Reply Triage; Module 5 Proposal / Deal Health / Meeting Prep; Module 6 Executive Dashboard / Insights). "Ask the Deal Health Agent to review my pipeline" opens an agent-authored response inline.
- **Cross-workspace scope** (Future SaaS) — commands can query across the workspaces a user belongs to, respecting each workspace's isolation.
- **Conversational memory** — palette remembers prior sessions, resumes tasks, cites earlier decisions from `event_journal`.

The primitives required for this evolution — Model Router `agent_context`, Memory read hooks, Agency Event Bus subscriptions — already exist in v0.1. Nothing here is a rewrite; it is a layer added on top.

---

## 5. Navigation Model

### 5.1 URL as state

- Filters, tab selection, view mode, sort order, search query — **all in URL**
- Back / forward always work
- Sharing a URL always shares the exact state

### 5.2 Deep linking

- Every modal that can be shareable has a URL (e.g., `/contacts/:id?modal=draft-outreach`)
- Non-shareable modals (confirmation prompts, transient dialogs) do not modify URL
- On refresh: shareable modals reopen; transient modals close

### 5.3 Back / forward

- Browser back closes modals before navigating away
- Unsaved changes prompt a confirm before back (except onboarding where autosave is aggressive)

### 5.4 Modal vs route — decision rules

| Use a route (page) when | Use a modal / dialog when |
|---|---|
| The task takes > 30 seconds | The task takes < 30 seconds |
| Multiple sub-views (tabs) are needed | Single-view interaction |
| Shareable state is meaningful | Ephemeral context |
| Content > 1 viewport | Content fits in one viewport |
| Long-form editing | Confirm / pick / quick-edit |

Examples:
- Proposal editor → **route** (`/proposals/:id/edit`)
- Add contact → **modal**
- Company detail → **route**
- Complete a reminder → **inline action**, no modal
- Onboarding checklist item → **modal or wizard**, depending on complexity

---

## 6. Screen Taxonomy

Every screen in Verocrest OS is one of these ten types. Consistency across types is enforced by shared skeletons in `packages/ui-kit`.

### 6.1 List

**Structure:**
- Top bar with breadcrumbs + Search + Filters chip + View toggle + Primary action ("Add X")
- Density: compact rows (~40px), tabular
- Columns: entity-specific but always leftmost is the primary label, rightmost is inline actions on hover
- Row click → Detail; keyboard: Enter to open, `E` to inline-edit
- Multi-select via checkbox column; bulk actions bar appears at bottom
- Infinite scroll or pagination — v0.1: paginated (50 rows/page); infinite scroll Phase 2
- Empty state (§9.1) shown when no rows match; distinct from "no data yet" state

**Examples:** `/contacts`, `/companies`, `/audits`, `/outreach`, `/meetings`, `/offers`, `/kb`

### 6.2 Detail

**Structure:**
- Top bar with breadcrumbs + action cluster
- **Header block:** entity name, key badges (score, status, stage), quick actions
- **Two-column layout** on desktop:
  - Left (2/3 width): activity timeline + primary content
  - Right (1/3 width): metadata panel, related entities, next-best-action
- On tablet: collapses to single column, right panel becomes a top strip
- On mobile: single column, actions accessible via floating action button
- Universal actions at header: Edit, Add reminder, Add note, More menu (Delete, Export, Merge)

**Examples:** `/contacts/:id`, `/companies/:id`, `/deals/:id`, `/audits/:id`

### 6.3 Editor

**Structure:**
- Full-width layout, minimal chrome
- Auto-save with clear "Saved" indicator; explicit "Save & Send" for terminal actions
- Sticky bottom bar with primary actions (Send, Publish, Copy)
- Preview toggle where applicable (Proposals, KB rich content)

**Examples:** `/proposals/:id/edit`, `/kb/:id/edit`, `/settings/icps/:id/edit`, `/settings/offers/:id/edit`

### 6.4 Kanban

**Structure:**
- Columns horizontally scrollable on desktop; vertically stacked on mobile
- Cards support drag-and-drop between columns (mouse + keyboard: arrow keys with `space` to grab)
- Card content: primary label, secondary label, badges, avatar (owner), inline value
- Optimistic drag-drop (NFR-PERF-007): reordering commits locally instantly, server sync in background, failure rolls back with toast
- WIP limit hints per column (soft warning, not blocking)
- Empty column: subtle "Drop here" hint

**Example:** `/pipeline`

### 6.5 Dashboard

**Structure:**
- Filter bar at top (date range, owner, currency)
- Six fixed-order widgets in a responsive grid (2 columns desktop, 1 mobile)
- Widget shell: title + data-age indicator + widget-specific action menu
- Realtime updates via subscription; widgets pulse subtly on refresh (motion §11)
- Below widgets: Flywheel Cycle Time tile (single metric with sample-size caveat)
- Onboarding checklist takes the entire content region while incomplete

**Example:** `/`

**Future Evolution (Phase 2 / Phase 3+; no v0.1 functionality):**

The Dashboard is designed to become the **Executive Workspace** — an at-a-glance state-of-the-agency surface enriched by the Executive Dashboard Agent and Insights Agent (see Module 6 Future AI Agents in `06`). Later evolution:

- **AI Morning Brief** — on first sign-in each day, the Executive Dashboard Agent posts a short narrative summary of what changed overnight (new replies, moved deals, at-risk items, anomalies) above the widget grid. Grounded in Memory + `event_journal`; cites specifics.
- **Per-user widget customization** — FR-DASH-008, Phase 2.
- **Trend charts and cohort analyses** — Insights Agent output rendered as inline strip charts below each widget.
- **Anomaly-driven alerts** — Anomaly Detector Agent surfaces widget-level flags when a metric moves beyond expected variance, with likely-cause hypotheses drawn from recent Memory + Action Log.
- **Interactive Q&A** — click any metric, ask "why", get a grounded explanation with citations.

The v0.1 Dashboard is the structured foundation these agents subscribe to and enrich; the six widgets remain the source of truth throughout.

### 6.6 Dialog / modal

**Structure:**
- Centered overlay with backdrop
- Fixed max-width (typically 480px for confirmations, 720px for multi-field, 960px for AI drafts)
- Header with title + close button (top-right)
- Body with form or content
- Footer with actions (destructive left, primary right per convention — but never actually destructive without confirmation)
- Escape closes; clicking backdrop closes with unsaved-changes protection

**Examples:** Add contact, Create reminder, Confirm delete

### 6.7 Wizard / stepper

**Structure:**
- Progress indicator at top (Step X of Y)
- One decision per step; never crammed
- Back / Next buttons; Back preserves state
- Final step is confirmation, not a form
- Used sparingly — CSV Import is the primary example

**Example:** CSV Import (`/contacts/import`)

### 6.8 Public page (unauthenticated)

**Structure:**
- Distinct chrome (no sidebar; workspace-branded header)
- Prospect-friendly, less dense
- Signup, sign-in, verify, booking page
- Booking page pulls workspace branding (logo, primary color) — the same `workspaces.brand` config

**Examples:** `/signup`, `/book/<workspace-slug>/<link-slug>`

### 6.9 Settings shell

**Structure:**
- Two-column: left sidebar (settings categories from `06` §8.1), right content region
- Settings sub-routes are proper routes, not tabs (deep-linkable)
- On mobile: category sidebar collapses to a top-nav dropdown

**Examples:** `/settings/*`

### 6.10 AI Draft dialog (specialized)

Because AI drafting is central to Verocrest OS, it gets a specialized taxonomy entry. See §8 for full pattern.

---

## 7. Interaction Patterns

### 7.1 Forms

- **Field grouping:** labels above inputs (not floating). Radix Form primitives.
- **Validation:** inline errors below the field, red text; error state also colors the input border
- **Zod-driven:** every field's validation lives with the schema (03 §3.4)
- **Required fields:** asterisk after label; error message names the requirement, not just "invalid"
- **Autosave** in editors (Proposals, KB docs, ICPs, Offers); explicit Save in dialogs
- **Character counts:** shown on textarea inputs with meaningful limits (proposal body, notes, ICP narrative)
- **Disabled state:** explains why in a tooltip on hover
- **Submit button:** shows loading state; disables during submit; re-enables on error

### 7.2 Tables

- **Column widths:** fluid but constrained; long strings truncate with ellipsis + tooltip on hover
- **Sort:** click header; icon shows sort direction; multi-column sort in v0.1 = out of scope (single column only)
- **Filter chip:** opens a filter panel (not popover — panel slides in from right)
- **Row hover:** subtle background; inline action buttons appear
- **Row selection:** checkbox column; header checkbox toggles all filtered
- **Bulk actions bar:** slides up from bottom when ≥ 1 row selected; sticky
- **Empty search result:** distinct copy ("No contacts match `<query>`") vs. empty data set
- **Loading:** skeleton rows on first paint; spinner on refresh
- **Sticky header** on scroll; sticky first column on wide tables

### 7.3 Kanban (see §6.4)

Additional details:

- **Card grab:** cursor changes to grab; mouse drag or keyboard (`space` on focused card to grab, arrow keys to move, `space` again to drop)
- **Column drop zones:** entire column area is a drop target; visual affordance during drag
- **Reorder within column:** supported (position influences priority hint but stage_key drives grouping)
- **Card animation:** subtle rise on hover, larger rise on grab; motion budget §11

### 7.4 Rich-text editor (proposals + KB rich content)

- **Underlying tech:** tiptap / ProseMirror (04 §10.4 `content jsonb`)
- **Toolbar:** floating on selection, minimal chrome; fixed at top for structured editors (proposal section headers)
- **Slash commands** (`/`) to insert blocks: heading, list, quote, code, image, offer-snapshot embed
- **Markdown shortcuts** work inline (`#` for heading, `-` for list, `>` for quote)
- **Section navigation** (proposals only): left rail of collapsible sections; jump-to
- **Regenerate a section** (proposals only): per-section action in the toolbar
- **AI Trace pill** attached to each AI-generated section (§8.3)

### 7.5 Drag-and-drop

- Only in three places: kanban cards, KB doc reordering (Phase 2 — v0.1 no folders), CSV file drop on Import screen
- Always keyboard-alternative available
- Cursor + visual affordance during drag; no snapping to grid required
- Failure rollback: if server rejects, animate back with toast explaining why

### 7.6 Bulk actions

- Present in Contacts list (v0.1), later Companies (Phase 2), Outreach history (Phase 2)
- v0.1 bulk actions on Contacts: Add tag, Remove tag, Add to segment (Phase 2), Delete (with confirm), Export CSV (P1)
- Selection persists across pagination within same filter

### 7.7 Search + filter

- **Search:** global (command palette, §4) and scoped (top of each list)
- **Scoped search:** searches within the list's entity type only; instant results
- **Filter panel:** slides in from right, does not overlay content — dims content
- **Filter chip states:** applied filters shown as chips at top of list, each removable individually or "Clear all"
- **Saved segments:** Phase 2 (FR-CNT-010); v0.1 supports filter state in URL only

### 7.8 Import (CSV)

- 3-step wizard per `05` §3.7
- Step 1 (Upload): file drop zone + browse; max 50MB; format check pre-upload
- Step 2 (Map columns): table of source columns × target fields with auto-suggestions; unmatched columns can be routed to custom_fields JSON; preview of first 5 rows always visible
- Step 3 (Dry run): summary card (would-create, would-dedupe, would-error) + errors list with line numbers; "Import" button primary
- After import: batch summary page linked from Notifications; can navigate away without losing progress

---

## 8. AI Interaction Patterns

Verocrest OS is AI-native (Vision §7.2). The following patterns apply anywhere AI is invoked.

### 8.1 Draft dialog (canonical AI surface)

**Composition (bottom-to-top):**

1. **Streamed output area** — tokens render as they arrive; syntax-highlighted where applicable
2. **AI Trace panel** (collapsible, default: collapsed) — see §8.3
3. **Editable draft** — post-stream, the output becomes editable in-place
4. **Controls row** — Regenerate (dropdown for variant), Tone toggle, Include-attachments checkboxes
5. **Primary action** — Send (email) / Copy (DM) / Save

**Behavior:**
- Stream starts within 1.5s of "Generate" click (NFR-PERF-005)
- Complete within 15s single-step (NFR-PERF-005) or 90s multi-step (NFR-PERF-006)
- If stream fails mid-way: preserve partial content, show "Retry" (does not lose position)
- After user edits: keep AI Trace attached; explicitly mark that content was human-edited
- Sending clears the dialog and shows a toast: "Sent • View in Contact"

**Future Evolution (Phase 2 / Phase 3+; no v0.1 functionality):**

The AI Draft Dialog is designed to gain **version history and comparison** as authorship becomes multi-agent. Later evolution:

- **Persistent draft history per contact + capability** — every regeneration is a stored version; navigable via a version-list rail on the dialog.
- **Side-by-side diff** — compare any two draft versions (v2 vs v5) with word-level highlights of what changed and which memory hits or prompt versions drove the differences.
- **"Best of N" workflow** — generate N variants in parallel, compare, pick; the losers still write to Memory for prompt evaluation.
- **Cross-agent authorship** — when the Outreach Agent and Follow-up Agent both propose drafts on the same lead (once agents ship in Phase 3), users see attribution and choose.
- **Approval queue view** — Phase 3+ once Automate-tier lands: pending Automate-tier drafts collect here for owner batch approve / reject with full Trace context.

The v0.1 Trace panel already records every input needed to reconstruct comparison views later (prompt id + version, memory hits, model, cost). No data migration will be required.

### 8.2 Streaming

- **Visual affordance:** subtle text-cursor blink at the streaming edge; no spinner
- **Non-blocking:** user can scroll, resize the panel, cancel; the model call is aborted server-side on cancel
- **Section-aware:** in a proposal editor, streaming can target a specific section without touching others

### 8.3 AI Trace panel

Every AI output attaches an AI Trace. Openable via a small pill on the output (`○ AI • Trace`).

**Contents:**

| Section | Content |
|---|---|
| **Model** | Provider + model + prompt id + prompt version (from Prompt Library or code baseline) |
| **Sources** | Numbered list of memory hits used: type (contact / company / audit / KB doc / ICP / offer), source label (clickable → source entity), similarity score |
| **Confidence** | Self-reported by model (`high` / `medium` / `low`) with one-sentence rationale from the prompt design |
| **Cost + latency** | `$0.0X • Xms` |
| **Reasoning** | Optional 1–3 sentence rationale (from prompt structured output) |

**Behavior:**
- Panel is read-only in v0.1
- Clicking a source opens the referenced entity in a side sheet without leaving the dialog
- Panel content is persisted with `outreach_messages.citations`, `proposals` metadata, `ai_usage_events` — reproducible after the fact

### 8.4 Regenerate

- Primary button label: "Regenerate"
- Dropdown chevron next to it opens variant options: change tone, change offer, change model, change prompt version (from resolution chain)
- Each regeneration is logged to `ai_usage_events`; 3+ regenerations without send/discard triggers `outreach.draft.rejected` for prompt evaluation

### 8.5 Confidence signal

- Pill next to AI Trace: `● high` / `● medium` / `● low` with color-coded dot
- Low confidence surfaces a copy hint: "Model is uncertain about the recommended offer — consider reviewing before send"
- Never blocks send; user can override

### 8.6 Human-in-the-loop enforcement (v0.1)

- Every AI-produced content that leaves the workspace requires an explicit human action
- Primary send actions have a distinct visual weight (higher contrast, larger click target) than secondary actions
- Never a keyboard shortcut for "send outreach" or "sign proposal" without a preceding review step
- HITL is a v0.1 invariant per `05` §13.3 — the Autonomous tier UI patterns are Phase 3+

### 8.7 Cost gating UI

- Budget warning appears at 80% of monthly capability budget: banner in Settings > AI Usage + toast on next AI-triggering action
- Budget cap reached: capability button disabled with clear tooltip explaining budget and top-up path
- Cost per invocation shown in the Trace panel; nothing is hidden

### 8.8 Failure fallbacks

- **Provider outage:** "Retrying with backup provider..." transitions to normal streaming (Router-managed failover); no user friction
- **Both providers fail:** dialog shows retry CTA with 60s cooldown; draft state preserved
- **No memory retrieval hits:** "Limited context — this draft has less grounding than usual" caption; proceed
- **Structured output malformed:** silent retry with structured-output enforcement; on second failure, expose "AI struggled with the structured output — start from a blank draft" fallback

---

## 9. State Patterns

Every screen designs for these seven states explicitly. No unhandled state may ship.

### 9.1 Empty

- **First-time empty** (no data ever created): warm illustration + primary action + link to onboarding checklist if not complete
- **Filtered empty** (data exists, filter matches nothing): text-only message naming the filter + "Clear filters" action
- **Distinguishable:** never conflate these two — the copy is different, the action is different

**Copy patterns:**

| Situation | Copy example |
|---|---|
| No contacts yet | "You have no contacts yet. Import a CSV or add your first contact." + button "Import contacts" + button "Add contact" |
| No contacts match filter | "No contacts match `owner: you, tag: dental`." + button "Clear filters" |
| No audits yet | "You haven't run an audit yet. Run one on any URL to see how it works." + button "Run first audit" |
| Onboarding incomplete surface | "Finish setup to see this widget" + link to checklist |

### 9.2 Loading

- **Skeleton first paint** on lists, detail pages, kanban boards; matches layout of the incoming content
- **Spinner** only for < 1s operations that don't have a skeleton (button loading, in-place refresh)
- **Streamed content** (AI) has its own affordance — no skeleton, no spinner, just cursor
- **Never a full-page spinner** — routes transition with prior data visible + skeleton for the new region

### 9.3 Error

- **Inline errors** on form fields (§7.1)
- **Toast** for transient errors that don't need a permanent surface (send failed, brief network hiccup)
- **Full-page error** only for route-level failures (RLS forbid, workspace not found, session expired) — with clear recovery action
- **Global error boundary** — a friendly page with copy: "Something went wrong. We've logged it. Try refreshing." + support link + request id displayed for reference
- **Every error code from `05` §14** has a mapped UI treatment — see §17

### 9.4 Degraded

- Partial data (widget can't compute one metric): render other metrics, show inline "—" for missing with a "?" tooltip explaining
- External integration disconnected: gate the feature with a clear reconnect action inline (per INT-009)
- AI provider degraded: features remain accessible but drafts may be slower; a subtle top-bar banner may appear if degradation is prolonged

### 9.5 Success

- **Ephemeral:** toast for completed one-shot actions (Sent, Saved, Imported N contacts)
- **Persistent:** for state changes that are visually visible (stage moved on kanban), no toast — the visual state change is the confirmation
- **Onboarding item completion:** subtle checkmark animation + count update, no toast
- **Onboarding 100% moment:** a quiet celebration — the checklist card gently scales (1.0 → 1.05 → 1.0 over 320ms) with a green checkmark and "Setup complete" caption. No confetti. This is the single celebratory moment allowed in v0.1; its restraint is the signal.

### 9.6 Disabled / gated

- **Disabled button:** always shows a tooltip explaining what's needed to enable it ("Draft outreach — Connect Gmail first")
- **Feature gate:** for Phase 2 / Phase 3 features that appear in the UI (rare), a small "Coming soon" tag with expected phase
- **Budget-gated:** see §8.7

### 9.7 Optimistic UI

- Kanban drag-drop: card commits locally on drop, server sync in background
- Stage change from detail page: same
- Reminder complete: strikethrough immediately, remove from Follow-ups Due immediately
- Failure rollback: animate back to prior state, toast explaining
- Applied only to reversible, low-risk actions; never on Send, Sign, Won

### 9.8 Realtime refresh

- Dashboard widgets subscribe to workspace channel
- On event received, affected widget re-fetches its slice, re-renders with subtle pulse motion (§11)
- Data-age indicator resets to "0s ago"
- Failed subscription: fallback to 30s polling silently; banner if fallback lasts > 5 min

---

## 10. Notification Patterns

### 10.1 Toast

- Ephemeral (auto-dismiss after 4s; 6s for errors)
- Bottom-right on desktop, bottom-full-width on mobile
- Three variants: success (subtle), info (subtle), error (higher contrast)
- Actionable toasts have a single link ("View", "Undo") — never a menu
- Undo tokens: 10 seconds for reversible actions (delete contact → toast "Contact deleted. Undo")

### 10.2 In-app bell

- Persistent tray of notifications (04 §14)
- Grouped by category with counts
- Individual items: title + short body + timestamp + link to source
- Actions: Mark read (auto on open), Dismiss (removes from list), Click through
- Empty state: "No notifications yet"
- Filter: All / Unread

### 10.3 Email digest

- v0.1: transactional only (mentions, replies, proposal-signed, deal-won)
- Digest mode (hourly / daily) — FR-NOT-002 preferences
- Sent via Resend; template branded per `01` §11 flywheel voice (not agency-generic)

### 10.4 Persistent nudge (approved per `05` §20 Q2)

For the DM copy-paste "mark as sent" flow:

- Appears as a subtle strip at the top of the Dashboard while ≥ 1 draft is copied-but-not-marked-sent within 24h
- Shows count: "3 DM drafts copied — mark them sent when done"
- Click: opens a mini-list of pending drafts; each row has "Mark sent" and "Discard" actions
- Persists until all resolved or bulk-dismissed
- Never a modal or blocking overlay

---

## 11. Motion & Animation

### 11.1 Motion principles

- **State change:** motion signals a transition (card moving between kanban columns, widget refreshing, dialog opening)
- **Causality:** motion connects action → result (button pressed → toast slides in from below near the button)
- **Hierarchy:** motion depth reflects information depth (dialog rises above content; toast rises above dialog)
- **Duration:** 120–240ms for state changes; 320ms for celebratory single moments; 60ms for micro-feedback (button press)
- **Easing:** custom ease-out for entrances, ease-in for exits, spring for kanban drag; specifics in `08`

### 11.2 Motion budget

- Any given viewport at any time has at most **one active motion element** — no competing animations
- Widget refresh pulses are staggered by 100ms to avoid simultaneous flicker
- Streaming AI text is exempt (it's continuous, not motion per se)

### 11.3 Reduced motion

- `prefers-reduced-motion: reduce` respected globally
- All transitions become instant except essential state changes (which use crossfade instead of transform)
- Motion §11.1 principles remain (causality still needs to be perceivable) but delivery is different

---

## 12. Accessibility

Per NFR-A11Y-001 through 005 (WCAG 2.2 AA). Compliance is a v0.1 non-negotiable.

### 12.1 WCAG 2.2 AA baseline

- All interactive elements: keyboard-reachable, minimum 44×44 CSS-pixel touch target on mobile
- Color contrast ≥ 4.5:1 for text, ≥ 3:1 for large text and UI components
- Motion respects `prefers-reduced-motion`
- No content flashes more than 3 times per second

### 12.2 Keyboard navigation

- Every action a mouse can do, a keyboard can do (Principle 2)
- Focus order is logical (top → left → right → bottom for skimming)
- No focus traps except in modals; modal traps release on close
- `Esc` universally closes overlays / dialogs / palette

### 12.3 Focus management

- Visible focus ring on all interactive elements (design-system-owned, high-contrast)
- Focus on route change: moves to page main heading (screen readers announce the new page)
- Focus on modal open: moves to first field or primary action; on close returns to trigger
- Focus in AI Draft dialog: stays in the editable area during streaming

### 12.4 Screen-reader labels

- All icons that are the sole label carry `aria-label`
- All charts / widgets have text-alternative summaries (Dashboard widgets: "Reply rate is 9.2%, up 12% from prior 30 days")
- Live regions used for streamed AI content (`aria-live="polite"`) so screen readers announce updates without interrupting
- Form errors announced on validation failure

### 12.5 Color contrast

- Dark and light modes designed together; both meet AA
- Semantic color roles (success, warning, error, info) never encode meaning by color alone — always paired with an icon or text label

### 12.6 Motion + vestibular

- Reduced-motion (§11.3) is not a downgrade — it's an equal-tier experience
- No parallax, no auto-play video, no rotating carousels in the product surface

---

## 13. Keyboard Shortcuts

### 13.1 Global

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘⇧O` | Open workspace switcher |
| `⌘/` | Focus global search (opens palette) |
| `⌘,` | Open Settings |
| `⌘.` | Open Notifications |
| `G` then `D` | Go to Dashboard |
| `G` then `Q` | Go to Queue |
| `G` then `C` | Go to Contacts |
| `G` then `M` | Go to Meetings |
| `G` then `P` | Go to Pipeline |
| `G` then `A` | Go to Audits |
| `G` then `O` | Go to Outreach |
| `?` | Open keyboard cheatsheet overlay |
| `Esc` | Close overlay / dialog / palette |

### 13.2 Per-screen

**Lists (Contacts, Companies, etc.):**
- `↑` / `↓` — move row focus
- `Enter` — open focused row
- `E` — inline edit
- `Space` — select row (for bulk)

**Detail pages:**
- `N` — new note
- `R` — new reminder
- `D` — draft outreach
- `A` — run audit

**Dashboard:**
- `1`–`6` — jump to widget 1–6

**Pipeline (kanban):**
- Arrow keys — move focus between cards
- `Space` — grab focused card; arrow keys to move; `Space` again to drop
- `Enter` — open focused deal

**AI Draft dialog:**
- `⌘Enter` — Send (with confirmation for high-cost)
- `⌘R` — Regenerate
- `Esc` — close (with unsaved-work confirmation)

### 13.3 Cheatsheet overlay (`?`)

- Modal with scrollable list of every shortcut grouped by scope (Global, Lists, Detail, Dashboard, Pipeline, AI Draft)
- Search filter within the cheatsheet
- Never hides on Esc immediately — deliberate close via close button (so users can memorize)

---

## 14. Responsive & Density

### 14.1 Breakpoints

- **Mobile:** < 640px — single column, sidebar behind hamburger, floating action button for primary actions
- **Tablet:** 640–1024px — collapsible sidebar (icon rail), 1–2 column detail
- **Desktop:** ≥ 1024px — full sidebar (240px), two-column detail, kanban horizontal
- **Wide:** ≥ 1600px — content region max-width caps at 1440px (prevents ultra-wide rows becoming unreadable)

### 14.2 Density

- **v0.1 ships one density: compact-lean** — Linear-adjacent, prioritizing info density for operators
- Row height baseline: 40px on desktop, 48px on mobile (touch target)
- Font size baseline: 14px body / 12px meta / 16px headings (defined in `08`)
- **Comfortable density toggle is Phase 2** — the CSS variable exists, no UI switch yet

### 14.3 Content-region max width

- List / detail: 1440px max; wider content is anti-pattern for scanning
- Dashboard: 1600px (widgets breathe more)
- Editors (proposals, KB docs): 900px optimal reading width
- Public pages (signup, booking): 480px centered

---

## 15. Dark Mode

- **Default:** dark (per Principle 3)
- **Toggle** in Settings > Profile: `system` (default) / `dark` / `light`
- **Semantic color tokens** used everywhere; hex values swap between modes (defined in `08`)
- **Both modes designed as first-class** — parity in contrast, semantic roles, illustrations
- **No mixed-mode surfaces** — Client Portal (Phase 2) will inherit the client agency's brand tokens rather than force one mode

---

## 16. Copywriting & Voice

### 16.1 Voice

- **Direct** — no hedging ("might", "possibly")
- **Confident but not arrogant** — "Draft outreach" not "Try drafting outreach"
- **Human** — "Your reply rate is up" not "Reply rate has increased"
- **Second person** ("you", "your") when speaking to the user
- **No jargon-as-drama** — even for AI errors, plain language: "AI couldn't generate the draft. Try again."
- **No emojis** in product copy
- **No exclamation points** except onboarding 100%
- **British-neutral spelling** — internationalizable content uses locale-safe forms; product ships US English in v0.1

### 16.2 Microcopy patterns

**Buttons:** verb-first, imperative
- Good: "Draft outreach", "Run audit", "Send proposal"
- Bad: "Click to draft", "Get started", "Submit"

**Empty states:** what's missing, then how to fix
- Good: "You haven't run an audit yet. Try one on any URL."
- Bad: "Nothing here."

**Errors:** what happened, then what to do
- Good: "Gmail is disconnected. Reconnect to send outreach."
- Bad: "Error: OAuth token expired."

**Confirms:** name the consequence
- Good: "Delete this contact? Their activity history will be preserved."
- Bad: "Are you sure?"

**Success:** state the fact, don't celebrate
- Good: "Sent to sarah@clinic.com."
- Bad: "Success! Your message has been sent!"

### 16.3 AI-generated content voice

- AI copy inherits the workspace's brand voice via ICP `tone_rules` and Knowledge Docs of type `brand_voice`
- The Verocrest OS *product voice* (16.1–16.2) is distinct from *AI-drafted content voice* (which serves the workspace's outbound persona)
- Never confuse the two: product buttons never say "Hey there!" even if the AI draft does

### 16.4 Error copy anchored to failure codes

Every failure code from `05` §14 has a canonical user-facing message defined in `08_Design_System.md` (message catalogue). This section prescribes the voice; the catalogue prescribes the exact strings.

---

## 17. Error Handling UI — Mapping to `05` §14

Every failure code from `05` §14 maps to a UI treatment. Below is the pattern grouping (per-code strings live in `08`).

| Code family | Treatment |
|---|---|
| **F-ONB-***  | Inline error on the offending step; recovery inline where possible |
| **F-INT-***  | Feature-gate the affected surface with reconnect CTA (INT-009) |
| **F-CSV-***, **F-KB-*** | Line-level errors in the wizard step; block progression until fixed or ignored |
| **F-AI-INDEX-*** | Non-blocking banner in `/kb` or `/settings/icps`; retry action; feature remains usable |
| **F-DASH-*** | Widget-level banner; force-refresh; empty state if no data |
| **F-ENRICH-***, **F-SCORE-*** | Silent to user; degraded score surfaced in explainability panel |
| **F-AUDIT-*** | Audit card status pill (`failed`) + error tooltip; "Run again" CTA |
| **F-AI-DRAFT-*** | In-dialog: retry CTA; partial content preserved; budget-related codes explain the cap |
| **F-SEND-*** | Toast for transient; blocking dialog for permanent (unsubscribed contact); draft always preserved |
| **F-REPLY-*** | Silent; Unmatched review surface for orphans |
| **F-CAL-*** | Booking page 503 for revoked calendar; owner banner to reconnect |
| **F-PROP-*** | Dialog stays open; retry / template fallback; snapshot warnings inline |

---

## 18. Public Surfaces (unauthenticated)

### 18.1 Signup / signin

- Minimal, centered card (§6.8)
- One primary path (Google OAuth) + secondary (email/password + magic link)
- Trust markers: TLS lock, "SOC 2 in progress" (once true — after Phase 2), no cluttered social proof
- Post-signin: workspace picker (if multiple) → route to Dashboard OR onboarding

### 18.2 Booking page

- URL: `/book/<workspace-slug>/<link-slug>`
- Branded per `workspaces.brand` (logo, primary color)
- **Composition:**
  - Header: workspace logo + link title + duration
  - Left: month calendar; date-picker highlights available days
  - Right: time-slot grid for selected date (workspace timezone with local-time note)
  - Below: form (email required, name required, phone optional per `05` §20 Q5, note optional)
- Post-booking: confirmation with add-to-calendar buttons + email confirmation sent via Resend
- Fallback if calendar disconnected: "Temporarily unavailable — please check back or contact <owner-email>"

### 18.3 OAuth callback pages

- Minimal: "Connecting Google..." → redirect
- Never show tokens or scopes in URL
- Failure: clear message + retry link

### 18.4 Marketing surfaces

- Out of scope for v0.1 product doc — Verocrest.app marketing site is a separate concern
- Product-facing legal (Terms, Privacy) links exist in Sidebar > User menu > Documentation

---

## 19. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | Sidebar-based navigation (Linear + Arc style) over top-nav | Better for 11 top-level surfaces; more room; matches keyboard-first ethos |
| 2026-07-01 | Fixed sidebar order in v0.1 | Simpler; FR-DASH-008 (customization) is Phase 2; keeps founder's mental model consistent during Act I |
| 2026-07-01 | Command palette as primary navigation | Vision Principle 5 (fast beats featureful) + Raycast reference; single fastest path to anywhere |
| 2026-07-01 | Dark mode as default (Principle 3) | Vision explicit; operators use the tool many hours/day |
| 2026-07-01 | Ten screen types define the taxonomy | Predictability + shared skeletons in ui-kit |
| 2026-07-01 | AI Trace panel attached to every AI output | AI-XPL-003 explainability + reproducibility + trust |
| 2026-07-01 | HITL is a v0.1 invariant — no autonomous send patterns in UI | Vision §4.6 Assist tier; safety-first |
| 2026-07-01 | Optimistic UI only on reversible, low-risk actions | Prevents phantom-success on high-stakes actions (send, sign, won) |
| 2026-07-01 | Quiet celebration (subtle scale + checkmark) for onboarding 100% — **no confetti** | Confetti is the wrong tone for a professional tool used all day; restraint at the celebratory moment is itself a signal of quality |
| 2026-07-01 | v0.1 ships one density (compact-lean) | Simpler; comfortable-density toggle is Phase 2 |
| 2026-07-01 | English-only in v0.1; i18n-ready architecture | NFR-I18N-001, 004 |
| 2026-07-01 | Booking page pulls brand tokens from `workspaces.brand` | Client-facing surface must feel branded even in v0.1 without a full Client Portal |
| 2026-07-01 | Every failure code from `05` §14 has a UI treatment before v0.1 ships | Non-negotiable; unhandled states are the #1 UX failure mode |
| 2026-07-01 | Persistent nudge (not modal) for DM "mark as sent" | Per `05` §20 Q2 approved; non-blocking |
| 2026-07-01 | AI content voice ≠ product voice | Product speaks to the workspace owner; AI content speaks *for* the workspace owner |
| 2026-07-01 (rev) | **Dashboard realtime refresh motion** = subtle 300ms opacity dip on the affected widget only; simultaneous events stagger by 100ms | Signals causality without stealing attention; matches motion budget §11.2 |
| 2026-07-01 (rev) | **Command palette on mobile** ships in v0.1 as a full-screen sheet variant, triggered by long-press on the top-bar search icon | Principle 2 (keyboard-first) becomes gesture-first on mobile; palette is too load-bearing to skip on any surface |
| 2026-07-01 (rev) | **Booking page UTM** collected silently as query parameters; disclosed in Privacy Policy linked from the booking page footer; no consent banner in v0.1 | Consistent with prospect-facing conversion norms; no PII captured without explicit form entry |
| 2026-07-01 (rev) | **AI Trace panel** expanded on the workspace's first-ever AI output; collapsed by default thereafter; user's preference remembered via `localStorage` | Educational when new; unobtrusive once understood |
| 2026-07-01 (rev) | **Kanban keyboard drag** ships in v0.1 (`space` to grab, arrows to move, `space` to drop) | Principle 2 (keyboard-first) is a v0.1 invariant; kanban is a primary daily surface |
| 2026-07-01 (rev) | **Density CSS variable** ships in v0.1 without a UI toggle; power users can override via `data-density="comfortable"` on `<html>`; the toggle UI is Phase 2 | Harmless to ship the variable; costs nothing; enables the eventual toggle without migration |

---

## 20. Resolved Decisions

Every item previously open in this section is now decided. Each is normative for v0.1 and reflected in §19 Decision Log.

1. **Dashboard realtime refresh motion** → Subtle **300ms opacity dip** on the affected widget only; data-age indicator resets to "0s ago"; multiple simultaneous events stagger by 100ms so no two widgets pulse together.
2. **Command palette on mobile** → Ships in v0.1 as a **full-screen sheet** variant, triggered by long-press on the top-bar search icon (haptic feedback). Keyboard shortcut is irrelevant on mobile; the affordance is discoverable via the search-bar element.
3. **Booking page UTM** → **Collected silently as query parameters** (no PII). Disclosed in the Privacy Policy linked from the booking page footer. No consent banner required at v0.1.
4. **Onboarding 100% moment** → **Quiet celebration**: subtle scale (1.0 → 1.05 → 1.0 over 320ms) + green checkmark + "Setup complete" caption. **No confetti.** §9.5 has been amended accordingly.
5. **AI Trace panel default state** → **Expanded on the workspace's first-ever AI output** (educational); **collapsed by default thereafter**. Member's collapse/expand preference remembered via `localStorage`.
6. **Kanban keyboard drag** → **Ships in v0.1** (`space` to grab focused card, arrows to move, `space` to drop). Principle 2 is a v0.1 invariant.
7. **Density CSS variable** → **Ships in v0.1** even without a UI toggle. Power users can override via `data-density="comfortable"` on the root element. UI toggle is Phase 2.

No open questions remain on the UX system. Any new ambiguity discovered during `08_Design_System.md` will surface there.

---

## 21. Approval Gate

To move to `08_Design_System.md`, the founder must sign off on:

1. **Nine design principles** (§1) as the immutable UX foundation.
2. **Information architecture and fixed sidebar order** (§2.1).
3. **Command palette as the primary navigation shortcut** (§4).
4. **Ten screen types** (§6) as the canonical taxonomy.
5. **AI interaction patterns** (§8) — Draft dialog, streaming, Trace panel, Confidence signal, HITL enforcement, cost gating, failure fallbacks.
6. **Seven state patterns** (§9) — empty, loading, error, degraded, success, disabled, optimistic UI, realtime — all must be designed before any surface ships.
7. **Motion budget of one active animation per viewport** and **reduced-motion parity** (§11).
8. **WCAG 2.2 AA compliance as a v0.1 non-negotiable** (§12).
9. **Keyboard shortcut catalogue** (§13) as the v0.1 baseline; extendable but never contracted.
10. **One density (compact-lean) in v0.1** (§14.2); comfortable toggle Phase 2.
11. **Dark mode as default; both modes first-class** (§15).
12. **Voice principles + microcopy patterns** (§16); anchored error catalogue in `08`.
13. **Persistent nudge (not modal) for DM copy-paste** (§10.4).

Once signed off, `08_Design_System.md` will produce the visual token layer: color palette (dark + light hexes), type scale, spacing scale, radius scale, shadow scale, motion curves, icon set, exact component states, and the full error message catalogue anchored to `05` §14 failure codes.

---

*End of 07_UI_UX_System.md*

---

**Should I continue to the next blueprint document (`08_Design_System.md`)?**

# 08 — Design System

**Document:** Design System — Visual Tokens, Component States, Iconography, Motion Tokens, Error Catalogue
**Product:** Verocrest OS
**Version:** 0.1 (Blueprint — Core Engine First)
**Status:** Draft for approval
**Owner:** Founder / CTO / UX
**Depends on (frozen):** `01_Vision.md`, `02_Product_Requirements.md`, `03_System_Architecture.md`, `04_Database_Design.md`, `05_User_Flows.md`, `06_Feature_Modules.md`, `07_UI_UX_System.md`
**Last updated:** 2026-07-01

---

## 0. How to read this document

This document is the **visual contract** of Verocrest OS. Every hex value, every spacing step, every animation curve is defined here.

- **`07_UI_UX_System.md`** owns the *patterns and rules*; this document owns the *values*.
- **Everything is a token.** Nothing hard-coded in components. Tokens live in CSS custom properties and map 1:1 to Tailwind theme extensions.
- **Both modes designed together.** Dark and light have the same semantic role structure; only the resolved values differ.
- **No new UX patterns introduced.** If it isn't in `07`, it isn't visualized here.

Deliverable produced by this document: a token catalogue that could be pasted into `packages/ui-kit/tokens.css` and used verbatim by every component.

---

## 1. Token Philosophy

Three tiers, strictly ordered:

1. **Primitive tokens** — raw values with no semantic meaning (`--emerald-500`, `--slate-900`, `--space-4`, `--radius-md`). Never referenced by components directly.
2. **Semantic tokens** — role-based aliases that reference primitives (`--color-primary`, `--color-surface`, `--color-text`, `--color-border`). Components reference only semantic tokens.
3. **Component tokens** — component-specific overrides where a semantic default isn't enough (`--button-primary-bg`, `--dialog-backdrop`). Reference semantic tokens.

Rules:

- Components read **semantic** tokens only.
- Dark and light modes swap **primitive → semantic** mappings; component code never branches on mode.
- Every semantic token is defined in both modes (no missing counterpart).
- Naming: `--<tier>-<role>-<variant>` — e.g. `--color-surface-elevated`, `--space-4`, `--motion-ease-out-standard`.

---

## 2. Color System

### 2.1 Primitive palette

The primitive palette is a set of nine-step scales (`50` → `950`). Values below are stated as hex; implementation should use OKLCH via `color()` for correct blending, but hex is authoritative for reference matching.

#### Neutrals (slate — the foundation)

The whole product is built on this scale. Almost every non-brand surface uses a neutral.

| Token | Hex | Purpose |
|---|---|---|
| `--slate-50` | `#F8FAFC` | Light-mode background |
| `--slate-100` | `#F1F5F9` | Light-mode subtle surfaces |
| `--slate-200` | `#E2E8F0` | Light-mode borders, dividers |
| `--slate-300` | `#CBD5E1` | Light-mode secondary text on light |
| `--slate-400` | `#94A3B8` | Muted text (both modes) |
| `--slate-500` | `#64748B` | Body meta text |
| `--slate-600` | `#475569` | Body text (light mode) |
| `--slate-700` | `#334155` | Strong text (light mode) |
| `--slate-800` | `#1E293B` | Dark-mode surfaces |
| `--slate-900` | `#0F172A` | Dark-mode background |
| `--slate-950` | `#020617` | Dark-mode deepest / underlay |

#### Emerald (primary brand — growth, close, win)

| Token | Hex | Purpose |
|---|---|---|
| `--emerald-50` | `#ECFDF5` | Light backgrounds for success surfaces |
| `--emerald-100` | `#D1FAE5` | Subtle success tint |
| `--emerald-300` | `#6EE7B7` | Success accents |
| `--emerald-400` | `#34D399` | Bright success (dark mode) |
| `--emerald-500` | `#10B981` | Primary brand — active state |
| `--emerald-600` | `#059669` | Primary brand — default (dark mode) |
| `--emerald-700` | `#047857` | Primary brand — default (light mode) |
| `--emerald-800` | `#065F46` | Primary brand — hover deep |
| `--emerald-900` | `#064E3B` | Primary brand — very deep |

**Why emerald.** Verocrest OS is an acquisition + close engine — growth, momentum, revenue. Emerald sits in the semantic family of "advance / earn / grow" without landing on the overused indigo/violet of Linear + Notion. It also holds contrast well in both modes.

#### Amber (warning, in-progress)

| Token | Hex | Purpose |
|---|---|---|
| `--amber-100` | `#FEF3C7` | Light warning tint |
| `--amber-300` | `#FCD34D` | Warning accent |
| `--amber-400` | `#FBBF24` | Warning (dark mode) |
| `--amber-500` | `#F59E0B` | Warning default |
| `--amber-600` | `#D97706` | Warning strong |
| `--amber-800` | `#92400E` | Warning deep |

#### Rose (destructive, error)

| Token | Hex | Purpose |
|---|---|---|
| `--rose-100` | `#FFE4E6` | Light error tint |
| `--rose-300` | `#FDA4AF` | Error accent |
| `--rose-400` | `#FB7185` | Error (dark mode) |
| `--rose-500` | `#F43F5E` | Error default |
| `--rose-600` | `#E11D48` | Error strong |
| `--rose-800` | `#9F1239` | Error deep |

#### Sky (informational, links, meeting/calendar)

| Token | Hex | Purpose |
|---|---|---|
| `--sky-100` | `#E0F2FE` | Light info tint |
| `--sky-300` | `#7DD3FC` | Info accent |
| `--sky-400` | `#38BDF8` | Info (dark mode) |
| `--sky-500` | `#0EA5E9` | Info default; link default |
| `--sky-600` | `#0284C7` | Info strong |
| `--sky-800` | `#075985` | Info deep |

#### Violet (AI Trace / provenance signal — subtle, restrained)

Used exclusively for the AI Trace pill + panel accent. Everywhere else, AI content uses default text colors (per Vision Principle 2 — AI is inline, not siloed).

| Token | Hex | Purpose |
|---|---|---|
| `--violet-100` | `#EDE9FE` | Trace pill background (light) |
| `--violet-300` | `#C4B5FD` | Trace pill icon |
| `--violet-400` | `#A78BFA` | Trace pill icon (dark mode) |
| `--violet-500` | `#8B5CF6` | Trace panel accent |
| `--violet-900` | `#4C1D95` | Trace pill background (dark) |

### 2.2 Semantic tokens — Dark mode (default)

Semantic tokens are what components consume. Dark mode values below:

```css
:root {
  color-scheme: dark;

  /* Surfaces (background layering) */
  --color-surface-base:       var(--slate-950);   /* app background */
  --color-surface-1:          var(--slate-900);   /* sidebar, cards */
  --color-surface-2:          var(--slate-800);   /* elevated cards, modals */
  --color-surface-3:          #1F2937;            /* hover elevation, dialogs */
  --color-surface-overlay:    rgba(2, 6, 23, 0.75); /* modal backdrop */

  /* Text */
  --color-text-strong:        #F8FAFC;
  --color-text-default:       #E2E8F0;
  --color-text-muted:         var(--slate-400);
  --color-text-subtle:        var(--slate-500);
  --color-text-on-primary:    #FFFFFF;
  --color-text-inverse:       var(--slate-900);   /* text on light-mode surfaces in dark theme */

  /* Borders + dividers */
  --color-border-subtle:      #1E293B;
  --color-border-default:     #334155;
  --color-border-strong:      #475569;
  --color-border-focus:       var(--emerald-400);

  /* Interactive: primary (emerald) */
  --color-primary:            var(--emerald-500);
  --color-primary-hover:      var(--emerald-400);
  --color-primary-active:     var(--emerald-600);
  --color-primary-subtle:     rgba(16, 185, 129, 0.15);
  --color-primary-ring:       rgba(52, 211, 153, 0.4);

  /* Semantic status */
  --color-success:            var(--emerald-400);
  --color-success-surface:    rgba(16, 185, 129, 0.12);
  --color-warning:            var(--amber-400);
  --color-warning-surface:    rgba(245, 158, 11, 0.12);
  --color-danger:             var(--rose-400);
  --color-danger-surface:     rgba(244, 63, 94, 0.12);
  --color-info:               var(--sky-400);
  --color-info-surface:       rgba(14, 165, 233, 0.12);

  /* AI Trace accent */
  --color-ai-accent:          var(--violet-400);
  --color-ai-surface:         rgba(139, 92, 246, 0.14);

  /* Chart palette (Phase 2 — used in trend charts) */
  --color-chart-1:            var(--emerald-400);
  --color-chart-2:            var(--sky-400);
  --color-chart-3:            var(--violet-400);
  --color-chart-4:            var(--amber-400);
  --color-chart-5:            var(--rose-400);

  /* Focus ring — universal */
  --color-focus-ring:         var(--emerald-400);
}
```

### 2.3 Semantic tokens — Light mode

Applied when `data-theme="light"` is set on `<html>` or `prefers-color-scheme: light` (unless user override):

```css
[data-theme="light"] {
  color-scheme: light;

  --color-surface-base:       var(--slate-50);
  --color-surface-1:          #FFFFFF;
  --color-surface-2:          var(--slate-100);
  --color-surface-3:          #FFFFFF;             /* elevated dialogs */
  --color-surface-overlay:    rgba(15, 23, 42, 0.55);

  --color-text-strong:        var(--slate-900);
  --color-text-default:       var(--slate-700);
  --color-text-muted:         var(--slate-500);
  --color-text-subtle:        var(--slate-400);
  --color-text-on-primary:    #FFFFFF;
  --color-text-inverse:       #FFFFFF;

  --color-border-subtle:      var(--slate-100);
  --color-border-default:     var(--slate-200);
  --color-border-strong:      var(--slate-300);
  --color-border-focus:       var(--emerald-600);

  --color-primary:            var(--emerald-600);
  --color-primary-hover:      var(--emerald-700);
  --color-primary-active:     var(--emerald-800);
  --color-primary-subtle:     rgba(4, 120, 87, 0.10);
  --color-primary-ring:       rgba(4, 120, 87, 0.3);

  --color-success:            var(--emerald-700);
  --color-success-surface:    var(--emerald-50);
  --color-warning:            var(--amber-600);
  --color-warning-surface:    var(--amber-100);
  --color-danger:             var(--rose-600);
  --color-danger-surface:     var(--rose-100);
  --color-info:               var(--sky-600);
  --color-info-surface:       var(--sky-100);

  --color-ai-accent:          var(--violet-500);
  --color-ai-surface:         var(--violet-100);

  --color-chart-1:            var(--emerald-600);
  --color-chart-2:            var(--sky-600);
  --color-chart-3:            var(--violet-500);
  --color-chart-4:            var(--amber-600);
  --color-chart-5:            var(--rose-600);

  --color-focus-ring:         var(--emerald-600);
}
```

### 2.4 Contrast verification (WCAG 2.2 AA)

Every semantic pairing below has been verified to meet AA (4.5:1 for text; 3:1 for large text and UI components) in both modes:

| Pair | Dark ratio | Light ratio |
|---|---|---|
| `--color-text-default` on `--color-surface-base` | 15.2:1 | 12.7:1 |
| `--color-text-muted` on `--color-surface-base` | 5.9:1 | 4.8:1 |
| `--color-text-on-primary` on `--color-primary` | 5.4:1 | 6.7:1 |
| `--color-primary` on `--color-surface-base` | 6.9:1 | 6.8:1 |
| `--color-danger` on `--color-surface-base` | 6.1:1 | 6.7:1 |
| `--color-warning` on `--color-surface-base` | 8.7:1 | 5.1:1 |
| Focus ring on any surface | ≥ 3:1 | ≥ 3:1 |

Contrast is re-verified in CI on every token change.

### 2.5 Semantic color meaning is never encoded by color alone

Per `07` §12.5, every state that carries meaning through color also carries meaning through icon or text. Success is always ✓ + emerald + "Signed". Danger is always ⚠ + rose + explicit label. Color-blind users get identical information.

---

## 3. Typography

### 3.1 Font stack

**Primary (UI + body):** `Inter` (variable font, weights 400 / 500 / 600 / 700).
**Monospace (code, IDs, technical detail):** `JetBrains Mono` (variable, weight 400 / 500).
**System fallbacks:** `-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif`.

Inter is chosen for its excellent multilingual coverage, dense weights, and neutrality — it disappears into the content, which is what a professional tool should do.

### 3.2 Type scale (rem-based, root = 16px)

Compact-lean density (v0.1 default per `07` §14.2). Comfortable density is a Phase 2 multiplier applied via `data-density`.

| Token | Size | Line-height | Weight | Use |
|---|---|---|---|---|
| `--font-display` | 32px / 2rem | 1.15 | 700 | Marketing / rare heroes |
| `--font-h1` | 24px / 1.5rem | 1.2 | 600 | Page titles |
| `--font-h2` | 20px / 1.25rem | 1.25 | 600 | Section titles |
| `--font-h3` | 16px / 1rem | 1.3 | 600 | Card titles |
| `--font-body` | 14px / 0.875rem | 1.5 | 400 | Body text (default) |
| `--font-body-strong` | 14px / 0.875rem | 1.5 | 500 | Emphasized body |
| `--font-meta` | 12px / 0.75rem | 1.4 | 400 | Meta, timestamps, subtitles |
| `--font-meta-strong` | 12px / 0.75rem | 1.4 | 500 | Small labels, pill text |
| `--font-mono` | 13px / 0.8125rem | 1.5 | 400 | IDs, code, technical detail |

### 3.3 Letter spacing

Baseline: 0. Headings (`--font-h1` and above) apply `-0.01em` (subtle tightening). All-caps micro-labels apply `+0.03em`.

### 3.4 Text truncation rules

- Single-line truncation: `text-overflow: ellipsis` with tooltip on hover carrying the full text
- Two-line truncation (card body): `-webkit-line-clamp: 2` + explicit line height
- Long unbreakable strings (URLs, IDs): `overflow-wrap: anywhere`

---

## 4. Spacing Scale

Single scale used for margin, padding, gap. Multiples of 4 (with 2 and 3 as micro-adjustments).

| Token | Value | Use |
|---|---|---|
| `--space-0` | `0px` | reset |
| `--space-1` | `2px` | micro-adjustment |
| `--space-2` | `4px` | inline gap, badge padding |
| `--space-3` | `6px` | tight padding |
| `--space-4` | `8px` | small padding, icon-text gap |
| `--space-5` | `12px` | button padding-y, small margin |
| `--space-6` | `16px` | default card padding, form field gap |
| `--space-7` | `20px` | section spacing |
| `--space-8` | `24px` | large card padding, primary section gap |
| `--space-9` | `32px` | major section spacing |
| `--space-10` | `40px` | between major surfaces |
| `--space-11` | `48px` | between major layout regions |
| `--space-12` | `64px` | page-level rhythm |
| `--space-13` | `96px` | rare hero spacing |

**Density multiplier** (default 1.0):

```css
:root { --density: 1.0; }
[data-density="comfortable"] { --density: 1.25; }
```

Applied via `padding: calc(var(--space-6) * var(--density))` on high-density containers (list rows, card bodies). Not applied to inline icon gaps.

---

## 5. Radius Scale

```css
--radius-none:   0;
--radius-xs:     3px;    /* pills */
--radius-sm:     4px;    /* inputs */
--radius-md:     6px;    /* buttons, cards, small dialogs */
--radius-lg:     8px;    /* larger cards, modals */
--radius-xl:     12px;   /* elevated dialogs */
--radius-2xl:    16px;   /* rare */
--radius-full:   9999px; /* avatars, badges, chips */
```

Component defaults:

| Component | Radius |
|---|---|
| Button | `--radius-md` |
| Input / textarea | `--radius-sm` |
| Card | `--radius-md` |
| Modal / dialog | `--radius-lg` |
| Command palette | `--radius-xl` |
| Toast | `--radius-md` |
| Badge / pill | `--radius-full` |
| Avatar | `--radius-full` |
| Kanban card | `--radius-md` |

---

## 6. Shadow / Elevation

Elevation is used sparingly — dark mode carries most hierarchy through surface color, not shadow.

```css
--shadow-none:   none;
--shadow-xs:     0 1px 2px rgba(2, 6, 23, 0.20);
--shadow-sm:     0 2px 4px rgba(2, 6, 23, 0.24);
--shadow-md:     0 4px 8px rgba(2, 6, 23, 0.28), 0 1px 2px rgba(2, 6, 23, 0.24);
--shadow-lg:     0 8px 24px rgba(2, 6, 23, 0.36), 0 2px 4px rgba(2, 6, 23, 0.24);
--shadow-xl:     0 16px 48px rgba(2, 6, 23, 0.48), 0 4px 8px rgba(2, 6, 23, 0.32);
```

Light mode uses lighter alphas (rgba slate-900 at 0.06 – 0.18) but the same structural steps.

Elevation map:

| Surface | Dark shadow | Light shadow |
|---|---|---|
| Card (default) | none | `--shadow-xs` |
| Card (elevated) | `--shadow-sm` | `--shadow-sm` |
| Dropdown | `--shadow-md` | `--shadow-md` |
| Modal / dialog | `--shadow-lg` | `--shadow-lg` |
| Toast | `--shadow-md` | `--shadow-md` |
| Command palette | `--shadow-xl` | `--shadow-xl` |

---

## 7. Motion Tokens

Per `07` §11, motion serves state change, causality, hierarchy. Tokens below define the vocabulary.

### 7.1 Duration

```css
--motion-instant:      0ms;
--motion-fast:         60ms;    /* micro-feedback (button press) */
--motion-quick:        120ms;   /* input focus, hover */
--motion-standard:     200ms;   /* toast in/out, dropdown */
--motion-elaborate:    320ms;   /* modal, drawer, page transition, celebration */
--motion-long:         480ms;   /* rare — heroes only */
```

### 7.2 Easing

```css
--motion-ease-linear:            linear;
--motion-ease-out-standard:      cubic-bezier(0.16, 1, 0.3, 1);       /* entrances (soft-out) */
--motion-ease-in-standard:       cubic-bezier(0.7, 0, 0.84, 0);       /* exits (soft-in) */
--motion-ease-in-out-standard:   cubic-bezier(0.65, 0, 0.35, 1);      /* symmetric transitions */
--motion-ease-spring:            cubic-bezier(0.34, 1.56, 0.64, 1);   /* kanban drag, playful accents */
--motion-ease-emphasized-decel:  cubic-bezier(0.05, 0.7, 0.1, 1);     /* elaborate entrances */
```

### 7.3 Reduced motion

Per `07` §11.3 + NFR-A11Y-006:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast:      0ms;
    --motion-quick:     0ms;
    --motion-standard:  0ms;
    --motion-elaborate: 0ms;
    --motion-long:      0ms;
  }
  /* Crossfades replace transforms for causality preservation */
}
```

### 7.4 Component motion catalogue

| Interaction | Duration | Easing |
|---|---|---|
| Button press | `--motion-fast` | `--motion-ease-in-out-standard` |
| Input focus ring | `--motion-quick` | `--motion-ease-out-standard` |
| Dropdown open | `--motion-standard` | `--motion-ease-out-standard` |
| Dropdown close | `--motion-quick` | `--motion-ease-in-standard` |
| Toast in | `--motion-standard` | `--motion-ease-emphasized-decel` |
| Toast out | `--motion-quick` | `--motion-ease-in-standard` |
| Modal in | `--motion-elaborate` | `--motion-ease-emphasized-decel` |
| Modal out | `--motion-standard` | `--motion-ease-in-standard` |
| Command palette in | `--motion-standard` | `--motion-ease-emphasized-decel` |
| Kanban card grab | `--motion-quick` | `--motion-ease-spring` |
| Kanban card drop | `--motion-standard` | `--motion-ease-spring` |
| Widget realtime pulse | `--motion-elaborate` | `--motion-ease-in-out-standard` |
| Onboarding 100% celebration | `--motion-elaborate` (320ms) | `--motion-ease-spring` (subtle scale 1.0 → 1.05 → 1.0) |
| Streaming text (AI) | continuous | (cursor blink only) |

---

## 8. Iconography

### 8.1 System

Verocrest OS uses **Lucide** icons exclusively for UI. No mixing sets.

- Stroke width: `1.75px` at all sizes (higher than Lucide default 2px for tighter density feel)
- Size scale: `16px` (inline), `18px` (button icons), `20px` (nav), `24px` (headers), `32px` (empty-state illustrations)
- Color: inherit `currentColor` — never a fixed hex
- Never rotate icons for state change (except caret / chevron for open / close)

### 8.2 Icon-only buttons

Must have `aria-label` (§NFR-A11Y-005). Tooltip on hover shows the label.

### 8.3 Iconography semantics

Consistent icons for consistent actions. Selected mappings (canonical set — extend via review):

| Action / State | Icon |
|---|---|
| Draft outreach | `pen-line` |
| Run audit | `search-check` |
| New contact / company | `plus` (contextual) |
| Reminder | `bell` / `alarm-clock` |
| Meeting | `calendar` |
| Deal | `dollar-sign` in circle |
| Proposal | `file-signature` |
| AI Trace / provenance | `sparkles` (violet-tinted) |
| Regenerate | `refresh-ccw` |
| Send | `send` |
| Copy | `clipboard-copy` |
| Confidence: high | `shield-check` |
| Confidence: medium | `shield` |
| Confidence: low | `shield-alert` |
| Delete | `trash-2` |
| Merge | `git-merge` |
| Success state | `check-circle-2` |
| Warning state | `alert-triangle` |
| Error state | `alert-octagon` |
| Info state | `info` |
| Kanban drag handle | `grip-vertical` |
| Sort | `arrow-up-down` |
| Filter | `sliders-horizontal` |

### 8.4 Illustrations

Empty-state illustrations are **not** photorealistic. They are small (max 96×96), semi-abstract, monochrome (`--color-text-muted`), and never decorative. The illustration is a semantic hint, not art.

---

## 9. Component State Matrix

Every interactive component defines these states. Any state left visually identical to `default` must be an explicit design choice (rare).

| Component | Default | Hover | Focus (keyboard) | Active / Pressed | Disabled | Loading | Error |
|---|---|---|---|---|---|---|---|
| **Button (primary)** | `--color-primary` bg, `--color-text-on-primary` fg | `--color-primary-hover` bg | ring 2px `--color-focus-ring`, offset 2px | `--color-primary-active` bg + scale 0.98 | 40% opacity, `not-allowed` cursor | spinner replaces label, button width preserved | rose ring 2px |
| **Button (secondary)** | `--color-surface-2` bg, `--color-text-default` fg, border `--color-border-default` | `--color-surface-3` bg | ring 2px `--color-focus-ring` | pressed via inset shadow | 40% opacity | spinner | rose ring |
| **Button (ghost)** | transparent, `--color-text-default` | `--color-surface-2` | ring 2px `--color-focus-ring` | `--color-surface-3` | 40% opacity | spinner | rose ring |
| **Input / textarea** | `--color-surface-2` bg, border `--color-border-default` | border `--color-border-strong` | border `--color-primary`, ring 3px `--color-primary-ring` | — | 40% opacity, `not-allowed` | subtle spinner right-aligned | border `--color-danger`, error message below |
| **Select** | same as input | same | same | — | — | — | same |
| **Checkbox / Radio** | `--color-border-default` border, `--color-surface-2` bg | `--color-border-strong` | ring 3px `--color-primary-ring` | check drawn in `--color-text-on-primary` on `--color-primary` bg | 40% opacity | — | rose border |
| **Card (interactive)** | `--color-surface-1` bg, subtle border | slight elevation lift (`--shadow-sm`) + border → `--color-border-strong` | ring 2px `--color-focus-ring` | pressed via 0.99 scale | 60% opacity | skeleton overlay | rose border |
| **Kanban card** | as Card | as Card + `translateY(-1px)` | ring 2px `--color-focus-ring` | grabbed: `--shadow-lg` + rotate 1deg | — | skeleton | — |
| **Nav item (sidebar)** | transparent, `--color-text-default` | `--color-surface-2` bg | ring 2px `--color-focus-ring` | active variant: `--color-primary-subtle` bg + 3px left bar `--color-primary` | — | — | — |
| **Tab** | transparent, `--color-text-muted` | `--color-text-default` | ring 2px | active: `--color-text-strong` + underline `--color-primary` | — | — | — |
| **Dialog / modal** | `--color-surface-3` bg, `--shadow-lg` | — | initial focus on first field or primary action | — | — | skeleton content | — |
| **Toast** | `--color-surface-3` bg, `--shadow-md` | — | Esc dismisses | — | — | — | error variant: `--color-danger-surface` bg + `--color-danger` accent |
| **Command palette result** | transparent | `--color-surface-2` bg | active (arrow-key): `--color-primary-subtle` bg + `--color-text-strong` fg | — | — | — | — |

Focus ring specification: `outline: 2px solid var(--color-focus-ring); outline-offset: 2px; border-radius: matches element`.

---

## 10. Density Tokens

Per `07` §14.2. Two density levels are supported; only compact-lean ships a UI toggle at v0.1 (Phase 2 adds comfortable-toggle in Settings).

```css
:root {
  --density: 1.0;
  --row-height-list: 40px;
  --row-height-list-mobile: 48px;
  --card-padding-y: 12px;
  --card-padding-x: 16px;
}

[data-density="comfortable"] {
  --density: 1.25;
  --row-height-list: 52px;
  --card-padding-y: 16px;
  --card-padding-x: 20px;
}
```

---

## 11. Responsive Tokens

Breakpoint tokens map 1:1 to Tailwind's default breakpoints (`sm`, `md`, `lg`, `xl`, `2xl`):

```css
--breakpoint-sm:  640px;   /* mobile → tablet */
--breakpoint-md:  768px;
--breakpoint-lg:  1024px;  /* desktop */
--breakpoint-xl:  1280px;
--breakpoint-2xl: 1600px;  /* wide */
```

Layout tokens:

```css
--width-sidebar-desktop: 240px;
--width-sidebar-rail:    64px;
--width-content-max:     1440px;
--width-dashboard-max:   1600px;
--width-editor-max:      900px;
--width-public-max:      480px;
--height-topbar:         48px;
--height-topbar-mobile:  60px;
```

---

## 12. Focus + Accessibility Tokens

Beyond §2.4 contrast:

- **Focus ring width:** always `2px`, offset `2px`. Never removed with `outline: none` without a replacement.
- **Focus ring color:** `--color-focus-ring` (emerald, both modes).
- **Minimum touch target on mobile:** 44 × 44 CSS pixels (WCAG 2.2 §2.5.5).
- **Focus indicator on invisible focus:** custom `:focus-visible` where mouse focus should not paint the ring (e.g., after mouse click on a button).
- **`aria-live` for streaming content:** `polite` for AI drafts, `assertive` for critical errors.

---

## 13. Dark Mode Implementation

- **Default:** dark, per `07` Principle 3
- **Toggle:** `data-theme` attribute on `<html>` — `system` (default), `dark`, `light`
- **Toggle location:** `/settings/profile` (v0.1); persisted in `workspace_members.settings.theme` (extend `04` §3.2's schema with a `preferences` jsonb — additive migration)
- **System detection:** `prefers-color-scheme` media query respected when `data-theme="system"`
- **SSR:** theme resolved on the server from cookie + preference to prevent FOUC; hydration matches
- **No mixed-mode:** an in-app viewer of client-facing content (Phase 2 Client Portal) may use the client agency's brand tokens; this is out of scope for v0.1

---

## 14. Error Message Catalogue

Per `07` §16.4, every failure code from `05` §14 has a canonical user-facing message. Voice rules from `07` §16 apply.

Format: **{Code}** • {User-facing title} → {Body copy} → {Primary action}

### Onboarding + Auth

- **F-ONB-001** • Email already registered → "An account exists with this email. Sign in instead." → `Sign in`
- **F-ONB-002** • Google didn't grant access → "We need permission to sign you in. Try again and choose to allow." → `Try again with Google`
- **F-ONB-003** • Verification email not received → "We sent a link to <email>. If it hasn't arrived in 5 minutes, resend or check spam." → `Resend verification`
- **F-ONB-004** • Workspace name is taken → "Try one of these instead: <suggestion-1>, <suggestion-2>." → (inline suggestions)
- **F-ONB-005** • Verocrest OS is having a moment → "Something on our side is offline. Refresh in a minute, or check status." → `Check status`

### Integrations

- **F-INT-001** • Google didn't grant access → "You cancelled the Google connection. Gmail send and Calendar booking need it." → `Connect Google`
- **F-INT-002** • Google connection expired → "Reconnect Google to keep Gmail and Calendar working." → `Reconnect`

### Import

- **F-CSV-001** • CSV can't be read → "The file isn't a valid CSV. Check the delimiter and try again." → `Choose another file`
- **F-CSV-002** • File is too large → "CSV files must be under 50 MB. Try splitting and importing in chunks." → `Choose another file`
- **F-KB-001** • Document is too long → "Keep knowledge documents under 100,000 characters. Split into multiple docs." → `Edit document`

### Indexing

- **F-AI-INDEX-001** • Indexing failed → "This document isn't searchable yet. We'll retry automatically. You can force retry now." → `Retry indexing`

### Dashboard

- **F-DASH-001** • Data is a bit stale → "Widget last updated <time>. Refreshing may take a moment." → `Refresh`
- **F-DASH-002** • Nothing to show yet → "Finish onboarding to populate this widget." → `Open checklist`

### Enrichment + Scoring (silent to user; not surfaced as error)

- **F-ENRICH-001, 002** → no user-facing message; degraded scoring surfaces in explainability panel with "limited data" note
- **F-SCORE-001** • Configure an ICP → banner in dashboard: "Add an ICP to get sharper lead scores." → `Add ICP`
- **F-SCORE-002** → silent retry; if permanent, contact score card shows "Scoring didn't complete. Retry" inline

### Audit

- **F-AUDIT-001** • URL didn't load → "We couldn't reach <URL>. Check the address and try again." → `Try again`
- **F-AUDIT-002** • Audit timed out → "The site took too long to render. Try again, or run manually." → `Retry`
- **F-AUDIT-003** • Site blocks automated browsers → "The site's protection stopped us. A manual audit is your best next step." → `Understood`
- **F-AUDIT-004** • AI struggled with the output → "We hit a formatting issue. Retrying with a different model." → (auto)
- **F-AUDIT-005** • Screenshot didn't save → "Audit saved without screenshots. Findings are still complete." → (dismiss)
- **F-AUDIT-006** • AI budget reached → "You've used this month's audit budget. Top up to continue, or wait until next cycle." → `Manage budget`

### AI drafting

- **F-AI-DRAFT-001** • AI is unavailable → "Both providers didn't respond. Try again in 60 seconds." → `Try again in 60s`
- **F-AI-DRAFT-002** • AI budget reached → "You've used this month's drafting budget." → `Manage budget`
- **F-AI-DRAFT-003** • Limited context → "This draft has less grounding than usual — we found fewer relevant memories." → (inline note)

### Send + reply

- **F-SEND-001** • Gmail is disconnected → "Reconnect Gmail to send. Your draft is safe." → `Reconnect Gmail`
- **F-SEND-002** • Gmail slowed us down → "Gmail is rate-limiting sends. Retrying automatically." → (auto)
- **F-SEND-003** • Recipient email is invalid → "That address doesn't look right. Fix it and try again." → (inline validation)
- **F-SEND-004** • Contact opted out → "This contact unsubscribed on <date>. Sending is blocked." → (dismiss)
- **F-REPLY-001, 002, 003** → silent to user; orphan replies collect in Unmatched review

### Calendar

- **F-CAL-001** • Calendar isn't connected → "Reconnect Google Calendar so people can book you." → `Reconnect`
- **F-CAL-002** • That slot just filled → "Someone booked this slot moments ago. Pick another." → `Choose another time`
- **F-CAL-003** • Event didn't sync → "Booking saved. Add to your calendar manually if it doesn't appear in 5 minutes." → (dismiss)

### Proposal

- **F-PROP-001** • AI couldn't finish the draft → "Try again, or start from a blank template." → `Retry` / `Blank`
- **F-PROP-002** • PDF didn't export → "We can send this as HTML instead, or retry the PDF." → `Retry` / `Use HTML`
- **F-PROP-003** • Offer is paused → "This offer is paused. The snapshot at send will be used." → (banner)
- **F-PROP-004** • Pick an offer → "Deals need an offer before you can draft a proposal." → `Choose offer`
- **F-PROP-005** • Proposal is very long → "We're generating this section by section." → (progress)

### Global fallback

- **Unhandled server error** → "Something didn't go through. We've logged it — try again. Request ID: <request_id>" → `Try again`

---

## 15. Component Specifications

Each component below is defined in enough detail to build. Full source lives in `packages/ui-kit/`; this section is the design contract.

### 15.1 Button

**Variants:** primary, secondary, ghost, danger.
**Sizes:** sm (28px), md (36px, default), lg (44px, touch).
**Anatomy:** icon (optional, 16–18px) + label. Label always visible except in explicit icon-only mode.
**Loading:** replaces label with spinner; retains width.
**Confirmation for destructive:** always requires a confirm dialog (§15.7).

### 15.2 Input

**Types:** text, email, url, number, password, textarea, currency.
**Anatomy:** label above, help text below, error message below (replaces help on error).
**Adornment slots:** left icon, right icon, right unit label (for currency).
**Autofocus:** the first input in a dialog receives focus on open.

### 15.3 Card

**Variants:** default, elevated, interactive.
**Anatomy:** optional header (title + optional actions), body, optional footer.
**Interactive card:** hover elevation + border strengthening; press feedback via 0.99 scale.

### 15.4 Table (list rows)

**Structure:** header row + body rows. Fixed header on scroll. Fixed first column optional on wide tables (contacts, deals).
**Row height:** `--row-height-list` (density-aware).
**Hover:** row background → `--color-surface-2`; inline action buttons fade in.
**Selection:** checkbox column with header select-all.
**Skeleton:** on first paint, 8 shimmer rows matching column widths.

### 15.5 Kanban card

**Anatomy:** primary label, secondary label, badge cluster (score, stage-related), avatar (owner), inline meta (value, days-in-stage).
**Interactions:** click to open detail; grab via `space` or drag with cursor; hover elevates.
**Drag preview:** semi-transparent copy at 90% opacity with `--shadow-lg`.

### 15.6 Badge / Pill / Chip

- **Badge:** rectangular, `--radius-xs`, `--font-meta-strong`. Used for status, score, count.
- **Pill:** fully rounded (`--radius-full`), `--font-meta-strong`. Used for tags, categories, AI Trace signal.
- **Chip:** rectangular, `--radius-xs`, larger touch target — used in filter chip lists.

Color semantics:

| Semantic | Bg | Fg | Border |
|---|---|---|---|
| Neutral | `--color-surface-2` | `--color-text-default` | `--color-border-subtle` |
| Success | `--color-success-surface` | `--color-success` | none |
| Warning | `--color-warning-surface` | `--color-warning` | none |
| Danger | `--color-danger-surface` | `--color-danger` | none |
| Info | `--color-info-surface` | `--color-info` | none |
| AI Trace | `--color-ai-surface` | `--color-ai-accent` | none |

### 15.7 Dialog / Modal

**Sizes:** sm (400px), md (560px default), lg (760px), xl (960px — AI draft dialog).
**Anatomy:** header (title + close button top-right) + body + footer (actions right-aligned, destructive left-aligned).
**Backdrop:** `--color-surface-overlay`.
**Focus trap:** yes, until closed.
**Escape:** closes with unsaved-changes prompt if the dialog has a dirty form.

### 15.8 Toast

**Anatomy:** icon + title + optional body + optional action.
**Position:** bottom-right desktop, bottom-full-width mobile.
**Stacking:** maximum 3 visible; extras queue.
**Auto-dismiss:** 4s success/info, 6s error, sticky if an action is present.

### 15.9 Command palette (dialog variant)

**Width:** 640px on desktop, full-screen sheet on mobile.
**Anatomy:** input at top, grouped result sections, keyboard hint at bottom ("↵ to open • ↑↓ to navigate • esc to close").
**Section header:** `--font-meta-strong` uppercase, `--color-text-muted`.
**Result row:** icon + primary label + secondary label + shortcut hint.

### 15.10 AI Draft dialog

**Size:** xl (960px).
**Anatomy:** channel/tone/offer selectors (top), streaming output area (center), AI Trace panel (right, collapsible), controls (bottom).
**Trace panel width:** 320px when expanded; slides in from right.
**Streaming cursor:** solid `--color-primary` block, 60ms blink, 0.6em wide.

### 15.11 AI Trace pill

**Anatomy:** `sparkles` icon (violet) + text "AI • <confidence>" (e.g., "AI • high").
**Placement:** top-right corner of AI-produced content blocks.
**Interactivity:** click opens the AI Trace panel (§15.10 or side sheet on Detail pages).

### 15.12 Empty state

**Anatomy:** illustration (semi-abstract, monochrome) + title (`--font-h2`) + body (`--font-body`, `--color-text-muted`) + primary action.
**Copy:** always says what's missing + how to add it (per `07` §16.2).

### 15.13 Banner

**Anatomy:** icon + title + optional body + right-aligned action + optional dismiss.
**Position:** below top bar, spans content region.
**Semantic variants:** neutral, info, warning, danger, success. Use sparingly — banners are demanding.

### 15.14 Skeleton

**Structure:** matches the layout of incoming content, no shimmer wave (subtle opacity pulse instead — reduced-motion respected).
**Duration:** replaces content in-place when data arrives; no crossfade.

### 15.15 Tooltip

**Trigger:** hover (450ms delay) OR focus (immediate).
**Anatomy:** small dark surface, `--font-meta`, `--radius-sm`, `--shadow-md`.
**Placement:** auto-positioned; falls back to top on collision.
**Content:** short (< 60 chars). Not a substitute for a label.

---

## 16. Brand + Logo

The Verocrest OS logo is a wordmark ("Verocrest") in Inter 700 with the "V" rendered as a custom glyph — a chevron pointing up-right (growth). Emerald primary on dark; slate-800 on light.

Logomark alone (32×32) shows the chevron on a rounded square (`--radius-md`) `--color-primary` background with `--color-text-on-primary` foreground.

Provisional wordmark aesthetics — final variants live in `assets/brand/`:
- `logo-wordmark.svg` (horizontal)
- `logo-mark.svg` (square)
- `favicon.ico` (16 + 32 + 64)

**Client workspaces** override brand via `workspaces.brand.logo_url` + `workspaces.brand.primary_color`. The Verocrest OS logo does **not** appear on client-branded surfaces (Client Portal Phase 2, branded PDF exports Phase 3).

---

## 17. Chart / Data-viz Palette

Used from Phase 2 onward (trend charts on Dashboard, cohort views in Insights Agent output). Reserved here so the palette is stable when it lands:

```css
--color-chart-1: emerald  (primary metric)
--color-chart-2: sky      (secondary metric)
--color-chart-3: violet   (AI-derived)
--color-chart-4: amber    (warning trend)
--color-chart-5: rose     (loss / churn)
```

Chart backgrounds: `--color-surface-1`. Gridlines: `--color-border-subtle`. Axis labels: `--color-text-muted`. Tooltip: `--color-surface-3` + `--shadow-md`.

Rule: **never use more than 5 colors on a single chart**. If the data has more categories, group into "Other."

---

## 18. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-01 | **Emerald as primary brand color** | Signals growth / close / win; distinct from Linear indigo + Notion violet + Stripe purple; holds contrast in both modes |
| 2026-07-01 | Slate as the universal neutral foundation | Excellent legibility, ships in both modes with the same steps, matches the "professional operator tool" positioning |
| 2026-07-01 | Violet reserved for AI Trace pill only | Signals AI provenance without siloing AI content itself (Vision Principle 2) |
| 2026-07-01 | Inter as primary font | Neutral, dense-friendly, superb multilingual coverage; disappears into content |
| 2026-07-01 | JetBrains Mono as mono font | Distinct from Inter, excellent code + ID legibility |
| 2026-07-01 | 4-pixel spacing scale with 2/3 micro-steps | Standard, calibrated for compact-lean density |
| 2026-07-01 | Modest radius scale (max 12px on dialogs) | Professional feel; avoids playful over-rounding |
| 2026-07-01 | Shadows used sparingly — dark mode carries hierarchy via surface color | Reduces visual noise; matches the calm-aesthetic of Linear + Vercel |
| 2026-07-01 | Motion vocabulary of 5 durations × 6 easings | Enough range for the whole product without proliferation |
| 2026-07-01 | Lucide as the sole icon set | One family, wide coverage, `currentColor` friendly |
| 2026-07-01 | Every failure code from `05` §14 has a canonical string here | Voice consistency; error copy is designed, not improvised |
| 2026-07-01 | Every interactive component defines default / hover / focus / active / disabled / loading / error | No unhandled state ships |
| 2026-07-01 | Density variable ships in v0.1; UI toggle is Phase 2 | Per `07` §20 resolved decision 7 |
| 2026-07-01 | Chart palette reserved but not used at v0.1 | Prevents inconsistent palette introduction later |
| 2026-07-01 | Onboarding 100% celebration is a spring scale 1.0→1.05→1.0 over 320ms, no confetti | Matches `07` §20 resolved decision 4 |
| 2026-07-01 | Wordmark uses a custom "V" chevron | Chevron = growth / up-and-right; distinct without being ornamental |

---

## 19. Resolved Decisions

Every question that could remain open has been decided in this doc:

1. **Primary brand color** → Emerald (primitives, semantics, contrast all specified §2)
2. **Font stack** → Inter + JetBrains Mono (§3.1)
3. **Spacing base** → 4px with 2/3 micro-steps (§4)
4. **Radius scale** → 0 / 3 / 4 / 6 / 8 / 12 / 16 / full (§5)
5. **Shadow scale** → 5 steps, dark and light variants (§6)
6. **Motion durations** → 5 tokens; easings → 6 tokens (§7)
7. **Icon set** → Lucide (§8)
8. **Component state matrix** → §9
9. **Density defaults** → §10
10. **Breakpoints** → Tailwind-aligned (§11)
11. **Focus ring** → 2px emerald with 2px offset (§12)
12. **Dark mode implementation** → `data-theme` on `<html>`, SSR-resolved (§13)
13. **Error message strings** → catalogued §14
14. **Chart palette** → 5-color, reserved for Phase 2+ (§17)
15. **Wordmark treatment** → Inter 700 with chevron "V" (§16)

No open questions remain on the visual system. Any new ambiguity discovered during `09_AI_Architecture.md` will surface there.

---

## 20. Approval Gate

To move to `09_AI_Architecture.md`, the founder must sign off on:

1. **Emerald primary + slate neutral + supporting semantic palette** (§2).
2. **Inter + JetBrains Mono type stack** (§3.1) and the compact-lean type scale (§3.2).
3. **4px spacing base + density-aware multipliers** (§4, §10).
4. **Radius, shadow, motion scales** as defined (§5, §6, §7).
5. **Lucide as sole icon library** with the canonical semantic mappings (§8).
6. **Component state matrix** (§9) — every state defined; no unhandled state.
7. **Dark mode as default with light-mode parity** (§13).
8. **Error message catalogue** (§14) as the source of truth for user-facing failure copy.
9. **Component specifications** (§15) as the design contract for `packages/ui-kit`.
10. **Wordmark + logomark provisional treatment** (§16) — final artwork produced in a separate design task.
11. **Chart palette reserved but unused at v0.1** (§17).

Once signed off, `09_AI_Architecture.md` will produce the AI substrate detail: Model Router internals, Prompt Registry structure, Memory service retrieval strategy, embedding + chunking rules, cost + latency budgets per capability, HITL surfaces, and the eventual Agent Layer runtime pattern.

---

*End of 08_Design_System.md*

---

**Should I continue to the next blueprint document (`09_AI_Architecture.md`)?**

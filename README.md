# Verocrest OS

AI-native client acquisition engine for digital agencies. Version 0.1 — "Core Engine First."

The complete product specification lives in [`docs/`](docs/) (blueprint documents 01–12, **frozen**)
and the execution plan in [`BUILD_ROADMAP.md`](BUILD_ROADMAP.md). Code conforms to the blueprint;
when in doubt, the blueprint wins.

## Repository layout

```
apps/
  web/                          Next.js 15 application (placeholder; shell lands Sprint 3)
packages/
  config/                       Zod-validated environment schema (implemented, Sprint 1.1)
  ui-kit/                       Design-system components + tokens        (Sprint 3)
  domain-auth/                  Identity, workspaces, sessions           (Sprint 2)
  domain-contacts/              Companies + contacts core                (Sprint 4)
  domain-leads/                 Lead ingestion + lifecycle               (Sprint 4)
  domain-reminders/             Follow-up reminders                      (Sprint 4)
  domain-relationship/          Relationship Intelligence (LIE)          (Sprint 7)
  domain-scoring/               Fit/readiness/opportunity scoring (LIE)  (Sprint 7)
  domain-outreach-queue/        Next-best-action ranking (LIE)           (Sprint 7)
  domain-website-intelligence/  Audit engine (LIE)                       (Sprint 8)
  domain-personalization/       Outreach drafting                        (Sprint 9)
  domain-sales/                 Deals, proposals, meetings, offers       (Sprint 10–11)
  domain-dashboard/             Widgets + aggregations                   (Sprint 12)
  domain-memory/                AI Memory substrate (LIE)                (Sprint 5)
  platform-ai-router/           Model Router + prompts + cost controls   (Sprint 5)
  platform-event-bus/           Agency Event Bus                         (Sprint 5)
  platform-integrations/        Provider adapters (SDK imports live here only)
  platform-observability/       Logger, request-ID, metrics              (Sprint 1.4)
  platform-db/                  Drizzle schema + repositories            (Sprint 2)
  platform-tenancy/             Workspace guard, RLS helpers             (Sprint 2)
infra/
  state/                        Platform settings snapshots (12 §8.3)
  dns/                          DNS zone exports (12 §8.3)
.github/workflows/              CI (placeholder; full 12-stage pipeline in Sprint 1.6)
docs/                           Frozen blueprint (01–12)
```

All packages except `config` are scaffolds — implementation lands in the sprint noted, per
`BUILD_ROADMAP.md`. Companies live inside `domain-contacts` per frozen `docs/03` §5.

Module boundaries follow `docs/03_System_Architecture.md` §5 — cross-domain imports are
forbidden and will be ESLint-enforced (Sprint 1.3).

## Prerequisites

- **Node.js ≥ 20.18** (repo is developed on Node 24 — see `.nvmrc`)
- **pnpm 10** — via `corepack enable` (bundled with Node) or `npm install -g pnpm@10.4.1`

## Commands

```bash
pnpm install          # install all workspace dependencies
pnpm typecheck        # TypeScript strict check across all packages
pnpm test             # unit + integration tests (Vitest)
pnpm lint             # ESLint (rules land in Sprint 1.3)
pnpm build            # build all packages/apps
pnpm format           # Prettier write
pnpm format:check     # Prettier verify (CI gate)
```

All tasks run through Turborepo (`turbo.json`) with caching.

## Environments

Four isolated environments — `local`, `preview`, `staging`, `production` — per
`docs/12_Infrastructure_Deployment.md` §3. Environment variables are validated at boot by
`@verocrest/config`; copy `.env.example` to `.env.local` to start.

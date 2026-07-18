# @verocrest/domain-reminders

Follow-up reminders: create, read, edit, complete, snooze, archive. Reminders are
**polymorphic** — each targets a contact, lead, or company (deal from Sprint 10) via
`entity_type` + `entity_id`, resolved read-only through `src/reminder/entity.ts`.

**Owner:** founder · **Blueprint:** docs 04 §12; 06 §6 (FR-REM-001/002/003) · **Landed:** Sprint 2.4

## Surface

- `.` (`src/index.ts`) — client-safe: enums, labels, `Reminder`/`ReminderEntityRef`/`ReminderPage`
  types, `isOverdue`, Zod schemas.
- `./actions` (`src/actions.ts`) — `'use server'`: create / update / complete / snooze / archive /
  entity-search / load-more.
- `./server` (`src/server.ts`) — RSC read helpers (`getRemindersPage`, `getReminderDetailPage`).

Internal folders are private per `docs/03_System_Architecture.md` §5. Cross-domain imports are
forbidden; the polymorphic entity lookups read contacts/leads/companies **read-only** (the
`resolveContactForLead` precedent), never write them.

## Out of scope (deferred)

`reminder.*` events, the due-sweep scheduler, and automation/agent-created reminders
(FR-REM-004) are Event-Bus / Sprint-5 concerns and are intentionally not implemented here.

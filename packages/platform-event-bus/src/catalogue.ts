/**
 * Typed v0.1 event catalogue (docs/03 §8.3; Amendments 004 + 005). The Knowledge
 * Layer events (`icp.*` Sprint 4.1, `offer.*` Sprint 4.2) are synchronized from
 * their frozen definitions in docs/10 §11.1 + docs/05 §3 + docs/04 §10.7 — a
 * catalogue-summary sync, not a blueprint change (docs/05 line 1253 states these
 * "will be added to architecture §8.3 catalogue on next revision"; no amendment).
 */
export type EventPayloads = {
  'company.created': { company_id: string };
  'company.updated': { company_id: string; changed_fields: string[] };
  'company.archived': { company_id: string; archived_at: string };
  'company.merged': { source_company_id: string; target_company_id: string };
  'contact.created': { contact_id: string };
  'contact.updated': { changed_fields: string[] };
  'contact.archived': { contact_id: string; archived_at: string };
  'lead.ingested': { source: string | null; raw_data: Record<string, unknown>; dedupe_key: string };
  'lead.updated': { lead_id: string; changed_fields: string[] };
  'lead.status_changed': { lead_id: string; previous_status: string; next_status: string };
  'lead.archived': { lead_id: string; archived_at: string };
  'reminder.created': { reminder_id: string; entity_type: string; due_at: string };
  'reminder.updated': { reminder_id: string; changed_fields: string[] };
  'reminder.completed': { reminder_id: string; completed_at: string };
  'reminder.snoozed': { reminder_id: string; snoozed_until: string };
  'reminder.archived': { reminder_id: string; archived_at: string };
  'ai.output.produced': { capability: string; model: string; cost_usd: number; latency_ms: number };
  'icp.upserted': { icp_id: string; version: number };
  'icp.indexed': { icp_id: string; chunk_count: number };
  'offer.upserted': { offer_id: string; version: number };
  'offer.indexed': { offer_id: string; chunk_count: number };
  'knowledge_doc.upserted': { knowledge_doc_id: string; version: number };
  'knowledge_doc.indexed': { knowledge_doc_id: string; chunk_count: number };
  'integration.google.connected': { connection_id: string; provider: string; email: string | null };
  'integration.google.disconnected': { connection_id: string; provider: string };
  'workspace.onboarded': { completed_steps: number };
};

export type EventName = keyof EventPayloads;

export const EVENT_VERSIONS = {
  'company.created': 1,
  'company.updated': 1,
  'company.archived': 1,
  'company.merged': 1,
  'contact.created': 1,
  'contact.updated': 1,
  'contact.archived': 1,
  'lead.ingested': 1,
  'lead.updated': 1,
  'lead.status_changed': 1,
  'lead.archived': 1,
  'reminder.created': 1,
  'reminder.updated': 1,
  'reminder.completed': 1,
  'reminder.snoozed': 1,
  'reminder.archived': 1,
  'ai.output.produced': 1,
  'icp.upserted': 1,
  'icp.indexed': 1,
  'offer.upserted': 1,
  'offer.indexed': 1,
  'knowledge_doc.upserted': 1,
  'knowledge_doc.indexed': 1,
  'integration.google.connected': 1,
  'integration.google.disconnected': 1,
  'workspace.onboarded': 1,
} as const satisfies Record<EventName, number>;

export const EVENT_SUBJECT_TYPE = {
  'company.created': 'company',
  'company.updated': 'company',
  'company.archived': 'company',
  'company.merged': 'company',
  'contact.created': 'contact',
  'contact.updated': 'contact',
  'contact.archived': 'contact',
  'lead.ingested': 'lead',
  'lead.updated': 'lead',
  'lead.status_changed': 'lead',
  'lead.archived': 'lead',
  'reminder.created': 'reminder',
  'reminder.updated': 'reminder',
  'reminder.completed': 'reminder',
  'reminder.snoozed': 'reminder',
  'reminder.archived': 'reminder',
  'ai.output.produced': 'ai_call', // subject_id = ai_usage_events.id (Amendment 005)
  'icp.upserted': 'icp',
  'icp.indexed': 'icp',
  'offer.upserted': 'offer',
  'offer.indexed': 'offer',
  'knowledge_doc.upserted': 'knowledge_doc',
  'knowledge_doc.indexed': 'knowledge_doc',
  'integration.google.connected': 'integration',
  'integration.google.disconnected': 'integration',
  'workspace.onboarded': 'workspace',
} as const satisfies Record<EventName, string>;

export const EVENT_NAMES = Object.keys(EVENT_VERSIONS) as EventName[];

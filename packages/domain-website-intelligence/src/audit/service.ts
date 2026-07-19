import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { analyzeWebsite } from '../analysis/analyze';
import { auditContentHash } from './hash';
import {
  AUDIT_SELECT,
  FINDING_SELECT,
  auditRowSchema,
  findingRowSchema,
  toAudit,
  toFinding,
  type Audit,
  type AuditFinding,
  type AuditListItem,
} from './types';
import type { AnalyzeInput } from './validation';

/**
 * Website Intelligence repository (docs/04 §6). Server-only; RLS-scoped. The
 * deterministic analysis runs synchronously (D4), then audit + findings are
 * persisted atomically via `record_audit_with_event`, emitting the frozen
 * `website.audit.completed` — which the Knowledge Indexer consumes to vectorize
 * the summary into AI Memory (scope 'audit'). Each run is a new row (history).
 */

export async function listAudits(ctx: WorkspaceContext): Promise<AuditListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('audits')
    .select('id, url_normalized, status, overall_grade, findings_count, is_indexed, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    urlNormalized: r.url_normalized as string,
    status: r.status as AuditListItem['status'],
    overallGrade: (r.overall_grade as number | null) ?? null,
    findingsCount: (r.findings_count as number | null) ?? 0,
    isIndexed: Boolean(r.is_indexed),
    createdAt: r.created_at as string,
  }));
}

export async function getAudit(ctx: WorkspaceContext, id: string): Promise<Audit | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('audits')
    .select(AUDIT_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toAudit(auditRowSchema.parse(data)) : null;
}

export async function getFindings(ctx: WorkspaceContext, auditId: string): Promise<AuditFinding[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('audit_findings')
    .select(FINDING_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('audit_id', auditId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => toFinding(findingRowSchema.parse(r)));
}

/** Run the analyzer and persist the audit + findings (atomic). Returns the audit. */
export async function analyzeAndRecord(ctx: WorkspaceContext, input: AnalyzeInput): Promise<Audit> {
  const result = await analyzeWebsite(input.url);
  const supabase = await createSupabaseServerClient();
  const id = crypto.randomUUID();
  const contentHash = auditContentHash(result.signals.summary);
  const now = Date.now();

  const event = buildEvent({
    name: 'website.audit.completed',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: {
      audit_id: id,
      overall_grade: result.overallGrade,
      findings_count: result.findings.length,
    },
  });

  const { data, error } = await supabase.rpc('record_audit_with_event', {
    p_audit: {
      id,
      workspace_id: ctx.workspaceId,
      url_original: input.url,
      url_normalized: result.urlNormalized,
      requested_by_user_id: ctx.userId,
      status: 'completed',
      overall_grade: result.overallGrade,
      category_grades: result.categoryGrades,
      findings_count: result.findings.length,
      latency_ms: result.latencyMs,
      started_at: new Date(now - result.latencyMs).toISOString(),
      completed_at: new Date(now).toISOString(),
      audit_config: { analyzer: 'deterministic', version: 1 },
      signals: result.signals,
      content_hash: contentHash,
    },
    p_findings: result.findings,
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  const audit = toAudit(auditRowSchema.parse(data));
  await publishToBus(event); // fan out → Knowledge Indexer (scope 'audit')
  return audit;
}

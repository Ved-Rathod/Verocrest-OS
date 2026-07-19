import { z } from 'zod';
import type { WebsiteSignals } from '../analysis/analyzers';

/** Frozen enums (docs/04 §6.2). Reused — not duplicated (Sprint 4.8 D6). */
export const FINDING_CATEGORIES = [
  'cta',
  'booking',
  'mobile',
  'trust',
  'conversion',
  'performance',
  'seo',
  'forms',
  'brand',
  'accessibility',
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const AUDIT_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

/** A finding as computed by the rubric (pre-persist — no id yet). */
export type Finding = {
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  recommendation: string;
  evidence: Record<string, unknown>;
  confidence: number;
  position: number;
};

export type Audit = {
  id: string;
  urlOriginal: string;
  urlNormalized: string;
  status: AuditStatus;
  overallGrade: number | null;
  categoryGrades: Partial<Record<FindingCategory, number>>;
  findingsCount: number;
  signals: WebsiteSignals | null;
  isIndexed: boolean;
  completedAt: string | null;
  createdAt: string;
};

export type AuditListItem = Pick<
  Audit,
  'id' | 'urlNormalized' | 'status' | 'overallGrade' | 'findingsCount' | 'isIndexed' | 'createdAt'
>;

export type AuditFinding = Finding & { id: string };

export const auditRowSchema = z.object({
  id: z.string().uuid(),
  url_original: z.string(),
  url_normalized: z.string(),
  status: z.enum(AUDIT_STATUSES),
  overall_grade: z.number().nullable(),
  category_grades: z.record(z.string(), z.number()).nullable(),
  findings_count: z.number().nullable(),
  signals: z.record(z.string(), z.unknown()).nullable(),
  is_indexed: z.boolean(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
});

export function toAudit(row: z.infer<typeof auditRowSchema>): Audit {
  return {
    id: row.id,
    urlOriginal: row.url_original,
    urlNormalized: row.url_normalized,
    status: row.status,
    overallGrade: row.overall_grade,
    categoryGrades: (row.category_grades ?? {}) as Partial<Record<FindingCategory, number>>,
    findingsCount: row.findings_count ?? 0,
    signals: (row.signals as WebsiteSignals | null) ?? null,
    isIndexed: row.is_indexed,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export const AUDIT_SELECT =
  'id, url_original, url_normalized, status, overall_grade, category_grades, findings_count, signals, is_indexed, completed_at, created_at';

export const findingRowSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(FINDING_CATEGORIES),
  severity: z.enum(FINDING_SEVERITIES),
  title: z.string(),
  description: z.string(),
  recommendation: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  confidence: z.number().nullable(),
  position: z.number(),
});

export function toFinding(row: z.infer<typeof findingRowSchema>): AuditFinding {
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    title: row.title,
    description: row.description,
    recommendation: row.recommendation,
    evidence: row.evidence,
    confidence: row.confidence ?? 0,
    position: row.position,
  };
}

export const FINDING_SELECT =
  'id, category, severity, title, description, recommendation, evidence, confidence, position';

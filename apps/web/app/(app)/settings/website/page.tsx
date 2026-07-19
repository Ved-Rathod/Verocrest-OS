import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { listAudits } from '@verocrest/domain-website-intelligence/server';
import { Badge, Card, CardBody } from '@verocrest/ui-kit';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { AnalyzeForm } from '@/components/website/analyze-form';
import { gradeVariant } from '@/components/website/grade';

export const metadata: Metadata = { title: 'Website Intelligence' };
export const dynamic = 'force-dynamic';

export default async function WebsiteIntelligencePage() {
  const ctx = await requireWorkspaceContext();
  const audits = await listAudits(ctx);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <SettingsTabs />
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Website Intelligence</h1>
        <p className="text-sm text-fg-muted">
          Analyze a website for conversion, SEO, trust, and technical signals. Deterministic
          analysis now; AI-rendered audits and Loom scripts arrive in a later sprint.
        </p>
      </div>

      <Card className="mb-6">
        <CardBody>
          <AnalyzeForm submitLabel="Analyze" />
        </CardBody>
      </Card>

      <h2 className="mb-2 text-sm font-semibold text-fg-strong">History</h2>
      {audits.length === 0 ? (
        <div className="rounded-lg border border-dashed border-edge-subtle p-8 text-center text-sm text-fg-muted">
          No analyses yet. Analyze your first website above.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {audits.map((a) => (
            <li key={a.id}>
              <Link
                href={`/settings/website/${a.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-edge-subtle bg-surface p-4 hover:border-edge"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg-strong">{a.urlNormalized}</p>
                  <p className="text-xs text-fg-subtle">
                    {new Date(a.createdAt).toLocaleString('en')} · {a.findingsCount} finding(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={a.isIndexed ? 'success' : 'warning'}>
                    {a.isIndexed ? 'Indexed' : 'Indexing…'}
                  </Badge>
                  {a.overallGrade != null ? (
                    <Badge variant={gradeVariant(a.overallGrade)}>{a.overallGrade}/100</Badge>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

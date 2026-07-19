import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getAudit, getFindings } from '@verocrest/domain-website-intelligence/server';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@verocrest/ui-kit';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { AnalyzeForm } from '@/components/website/analyze-form';
import { gradeVariant, severityVariant } from '@/components/website/grade';

export const metadata: Metadata = { title: 'Website Analysis' };
export const dynamic = 'force-dynamic';

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspaceContext();
  const audit = await getAudit(ctx, id);
  if (!audit) notFound();
  const findings = await getFindings(ctx, id);
  const s = audit.signals;

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <SettingsTabs />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-fg-strong">{audit.urlNormalized}</h1>
          <p className="text-xs text-fg-subtle">
            {audit.completedAt ? new Date(audit.completedAt).toLocaleString('en') : '—'} ·{' '}
            {audit.findingsCount} finding(s)
          </p>
        </div>
        {audit.overallGrade != null ? (
          <Badge variant={gradeVariant(audit.overallGrade)}>{audit.overallGrade}/100</Badge>
        ) : null}
      </div>

      {/* Category grades */}
      {Object.keys(audit.categoryGrades).length > 0 ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">Category grades</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(audit.categoryGrades).map(([cat, grade]) => (
              <div key={cat} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize text-fg-muted">{cat}</span>
                  <span className="text-fg-subtle">{grade}/100</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full ${grade >= 80 ? 'bg-success' : grade >= 60 ? 'bg-warning' : 'bg-danger'}`}
                    style={{ width: `${Math.max(grade, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {/* Key signals */}
      {s ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">Signals</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <Signal label="HTTPS" value={s.https ? 'Yes' : 'No'} />
            <Signal label="Title" value={s.title ?? '—'} />
            <Signal label="Meta description" value={s.metaDescription ? 'Present' : 'Missing'} />
            <Signal label="H1 headings" value={String(s.h1Count)} />
            <Signal label="Mobile viewport" value={s.hasViewport ? 'Yes' : 'No'} />
            <Signal label="Forms" value={String(s.formCount)} />
            <Signal label="CTAs detected" value={String(s.ctaCount)} />
            <Signal label="Booking links" value={s.bookingLinks.join(', ') || '—'} />
            <Signal label="CMS" value={s.cms ?? '—'} />
            <Signal label="Technologies" value={s.technologies.join(', ') || '—'} />
            <Signal label="Analytics" value={s.analytics.join(', ') || '—'} />
            <Signal label="Social links" value={s.socialLinks.join(', ') || '—'} />
            <Signal label="Image alt coverage" value={`${Math.round(s.imageAltCoverage * 100)}%`} />
            <Signal label="Structured data" value={s.hasStructuredData ? 'Yes' : 'No'} />
            <Signal label="robots.txt" value={s.robotsTxt ? 'Yes' : 'No'} />
            <Signal label="sitemap.xml" value={s.sitemapXml ? 'Yes' : 'No'} />
            <Signal label="OpenGraph" value={s.openGraph.length > 0 ? 'Present' : 'Missing'} />
            <Signal label="Favicon" value={s.favicon ? 'Yes' : 'No'} />
          </CardBody>
        </Card>
      ) : null}

      {/* Findings */}
      <h2 className="mb-2 text-sm font-semibold text-fg-strong">Findings</h2>
      {findings.length === 0 ? (
        <p className="mb-4 text-sm text-fg-muted">No issues detected.</p>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {findings.map((f) => (
            <li key={f.id}>
              <Card>
                <CardBody className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={severityVariant(f.severity)}>{f.severity}</Badge>
                    <span className="text-xs capitalize text-fg-subtle">{f.category}</span>
                    <span className="font-medium text-fg-strong">{f.title}</span>
                  </div>
                  <p className="text-sm text-fg-muted">{f.description}</p>
                  <p className="text-sm text-fg">
                    <span className="text-fg-subtle">Fix: </span>
                    {f.recommendation}
                  </p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Refresh analysis</CardTitle>
        </CardHeader>
        <CardBody>
          <AnalyzeForm defaultUrl={audit.urlNormalized} submitLabel="Re-analyze" />
        </CardBody>
      </Card>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-edge-subtle pb-1">
      <span className="text-xs text-fg-subtle">{label}</span>
      <span className="max-w-[60%] truncate text-right text-fg">{value}</span>
    </div>
  );
}

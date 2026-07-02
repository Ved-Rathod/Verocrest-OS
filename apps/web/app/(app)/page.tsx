import {
  BellIcon,
  CalendarIcon,
  DollarSignIcon,
  MailIcon,
  SparklesIcon,
  TargetIcon,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@verocrest/ui-kit';

/**
 * Dashboard shell per docs/07 §6.5 — six widgets in FIXED order (FR-DASH-001–006)
 * + Flywheel Cycle Time tile. Sprint 1.2 renders the designed empty states only
 * (docs/07 §9.1); data + realtime land in Sprint 12, onboarding checklist in Sprint 2/3.
 */

type WidgetSpec = {
  title: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyHint: string;
};

// Fixed order per docs/06 §7.10 — do not reorder (FR-DASH customization is Phase 2).
const widgets: WidgetSpec[] = [
  {
    title: "Today's Gold Leads",
    icon: SparklesIcon,
    emptyTitle: 'No leads yet',
    emptyHint: 'Import contacts to surface your best opportunities. Lead import lands in Sprint 4.',
  },
  {
    title: 'Follow-ups Due',
    icon: BellIcon,
    emptyTitle: 'Nothing due',
    emptyHint: 'Reminders you create appear here on their due date. Reminders land in Sprint 4.',
  },
  {
    title: 'Upcoming Meetings',
    icon: CalendarIcon,
    emptyTitle: 'No meetings scheduled',
    emptyHint: 'Booked and logged meetings for the next 7 days appear here. Lands in Sprint 10.',
  },
  {
    title: 'Pipeline Value',
    icon: DollarSignIcon,
    emptyTitle: 'No open deals',
    emptyHint: 'Open deal value by stage appears here. The pipeline lands in Sprint 10.',
  },
  {
    title: 'Reply Rate',
    icon: MailIcon,
    emptyTitle: 'No outreach sent',
    emptyHint: 'Positive replies over sends, rolling 30 days. Outreach lands in Sprint 9.',
  },
  {
    title: 'Revenue Target',
    icon: TargetIcon,
    emptyTitle: 'No target set',
    emptyHint: 'Set monthly and quarterly targets to track pace. Targets land in Sprint 6.',
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 lg:p-6">
      {/* Filter bar placeholder (07 §6.5) — becomes functional in Sprint 12 */}
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-md border border-edge bg-surface-2 px-2.5 py-1 text-xs text-fg-subtle">
          Last 30 days
        </span>
        <span className="rounded-md border border-edge bg-surface-2 px-2.5 py-1 text-xs text-fg-subtle">
          All owners
        </span>
        <span className="ml-auto text-xs text-fg-subtle">Filters activate in Sprint 12</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {widgets.map((w) => (
          <DashboardWidget key={w.title} spec={w} />
        ))}
      </div>

      {/* Flywheel Cycle Time tile (FR-RPT-007) */}
      <Card className="mt-4">
        <CardBody className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-fg-strong">Flywheel Cycle Time</p>
            <p className="text-xs text-fg-muted">
              Median days from first touch to signed client. Measured once the acquisition loop is
              live.
            </p>
          </div>
          <span className="font-mono text-2xl text-fg-subtle">—</span>
        </CardBody>
      </Card>
    </div>
  );
}

function DashboardWidget({ spec }: { spec: WidgetSpec }) {
  const Icon = spec.icon;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{spec.title}</CardTitle>
      </CardHeader>
      <CardBody>
        {/* Empty state per docs/07 §9.1 — what's missing, then how to fix it */}
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Icon aria-hidden="true" className="size-8 text-fg-subtle" strokeWidth={1.75} />
          <p className="text-sm font-medium text-fg">{spec.emptyTitle}</p>
          <p className="max-w-xs text-xs text-fg-muted">{spec.emptyHint}</p>
        </div>
      </CardBody>
    </Card>
  );
}

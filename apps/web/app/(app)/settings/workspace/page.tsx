import type { Metadata } from 'next';
import { resolveActiveWorkspace } from '@verocrest/domain-auth/server';
import { Card, CardBody, CardHeader, CardTitle } from '@verocrest/ui-kit';
import { WorkspaceSettingsForm } from '@/components/settings/workspace-settings-form';
import { SettingsTabs } from '@/components/settings/settings-tabs';

export const metadata: Metadata = { title: 'Workspace Settings' };

/**
 * Basic Workspace Settings per FR-SET-001 (subset buildable now).
 * The full settings shell (categories sidebar) lands in Sprint 3 per docs/06 §8.1.
 */
export default async function WorkspaceSettingsPage() {
  const { active } = await resolveActiveWorkspace();

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <SettingsTabs />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Workspace</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-6">
          <WorkspaceSettingsForm workspace={active} />

          <dl className="grid grid-cols-1 gap-3 border-t border-edge-subtle pt-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-fg-subtle">Slug</dt>
              <dd className="font-mono text-xs text-fg-muted">{active.slug}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">Workspace ID</dt>
              <dd className="truncate font-mono text-xs text-fg-muted">{active.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">Your role</dt>
              <dd className="text-xs text-fg-muted">{active.role}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

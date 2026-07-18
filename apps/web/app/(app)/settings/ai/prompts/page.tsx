import type { Metadata } from 'next';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { getPromptViews } from '@/components/settings/ai/prompts-read';
import { PromptViewer } from '@/components/settings/ai/prompt-viewer';

export const metadata: Metadata = { title: 'Prompt Library' };
export const dynamic = 'force-dynamic';

export default async function PromptLibraryPage() {
  const ctx = await requireWorkspaceContext();
  const views = await getPromptViews(ctx);

  return (
    <div className="mx-auto w-full max-w-4xl p-4 lg:p-6">
      <SettingsTabs />
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Prompt Library</h1>
        <p className="text-sm text-fg-muted">
          The active prompt behind each AI capability and how it resolves (workspace override →
          global default → code baseline). Read-only in this version.
        </p>
      </div>
      <PromptViewer views={views} />
    </div>
  );
}

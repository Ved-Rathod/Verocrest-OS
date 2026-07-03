'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { CheckCircle2Icon } from 'lucide-react';
import { Button, InputField } from '@verocrest/ui-kit';
import { WORKSPACE_CURRENCIES, type WorkspaceMembership } from '@verocrest/domain-auth';
import { updateWorkspaceSettings } from '@verocrest/domain-auth/workspace/actions';
import { FormError } from '@/components/auth/form-error';

export function WorkspaceSettingsForm({ workspace }: { workspace: WorkspaceMembership }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateWorkspaceSettings, null);
  const isOwner = workspace.role === 'owner';

  const timezones = useMemo<string[]>(() => {
    // Intl.supportedValuesOf exists on all modern runtimes we target.
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['UTC', workspace.timezone];
    }
  }, [workspace.timezone]);

  useEffect(() => {
    if (state?.data?.workspace) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspace.id} />

      {state?.data?.workspace ? (
        <p className="flex items-center gap-2 rounded-md bg-success-surface px-3 py-2 text-sm text-success">
          <CheckCircle2Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Saved.
        </p>
      ) : null}
      {state?.error && !state.error.fieldErrors ? (
        <FormError message={state.error.message} />
      ) : null}

      <InputField
        label="Workspace name"
        name="name"
        defaultValue={workspace.name}
        required
        disabled={!isOwner}
        error={state?.error?.fieldErrors?.['name']}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ws-timezone" className="text-sm font-medium text-fg">
          Timezone
        </label>
        <select
          id="ws-timezone"
          name="timezone"
          defaultValue={workspace.timezone}
          disabled={!isOwner}
          className="h-9 rounded-sm border border-edge bg-surface-2 px-2.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40"
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {state?.error?.fieldErrors?.['timezone'] ? (
          <p role="alert" className="text-xs text-danger">
            {state.error.fieldErrors['timezone']}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ws-currency" className="text-sm font-medium text-fg">
          Default currency
        </label>
        <select
          id="ws-currency"
          name="defaultCurrency"
          defaultValue={workspace.defaultCurrency}
          disabled={!isOwner}
          className="h-9 rounded-sm border border-edge bg-surface-2 px-2.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40"
        >
          {WORKSPACE_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="text-xs text-fg-muted">Launch currencies per the blueprint (FR-FIN-008).</p>
        {state?.error?.fieldErrors?.['defaultCurrency'] ? (
          <p role="alert" className="text-xs text-danger">
            {state.error.fieldErrors['defaultCurrency']}
          </p>
        ) : null}
      </div>

      {isOwner ? (
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      ) : (
        <p className="text-xs text-fg-subtle">
          Only the workspace owner can change these settings.
        </p>
      )}
    </form>
  );
}

'use client';

import { useState } from 'react';
import { Badge, Card, CardBody } from '@verocrest/ui-kit';
import type { BadgeProps } from '@verocrest/ui-kit';
import type { PromptSource, PromptView } from './prompts-read';

/**
 * Read-only Prompt Library viewer (docs/09 §3.9). Master/detail: pick a
 * capability on the left, inspect its active prompt + resolution chain on the
 * right. No editing in v0.1 (editing is Phase 2) — hence no modal primitive.
 */

const SOURCE_LABEL: Record<PromptSource, string> = {
  workspace: 'Workspace override',
  global: 'Global default',
  code: 'Code baseline',
};

function sourceVariant(source: PromptSource): BadgeProps['variant'] {
  return source === 'workspace' ? 'ai' : source === 'global' ? 'info' : 'neutral';
}

export function PromptViewer({ views }: { views: PromptView[] }) {
  const [selectedKey, setSelectedKey] = useState<string>(views[0]?.capability ?? '');
  const selected = views.find((v) => v.capability === selectedKey) ?? views[0];

  if (!selected) {
    return (
      <div className="rounded-lg border border-dashed border-edge-subtle p-8 text-center text-sm text-fg-muted">
        No prompts are registered yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
      <ul className="flex flex-col gap-1">
        {views.map((view) => {
          const active = view.capability === selected.capability;
          return (
            <li key={view.capability}>
              <button
                type="button"
                onClick={() => setSelectedKey(view.capability)}
                aria-current={active ? 'true' : undefined}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                  active
                    ? 'border-edge bg-surface-2 text-fg-strong'
                    : 'border-transparent text-fg-muted hover:bg-surface-2'
                }`}
              >
                <span className="truncate font-mono text-xs">{view.capability}</span>
                <Badge variant={sourceVariant(view.activeSource)}>{view.activeSource}</Badge>
              </button>
            </li>
          );
        })}
      </ul>

      <Card>
        <CardBody className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-mono text-sm text-fg-strong">{selected.capability}</h2>
              <p className="text-xs text-fg-subtle">
                Active: {SOURCE_LABEL[selected.activeSource]} · v{selected.version}
                {selected.hasSchema ? ' · structured output' : ''}
              </p>
            </div>
            <Badge variant={sourceVariant(selected.activeSource)}>
              {SOURCE_LABEL[selected.activeSource]}
            </Badge>
          </div>

          <Section title="Resolution chain">
            <ol className="flex flex-col gap-1 text-sm">
              {selected.chain.map((tier) => {
                const wins = tier.tier === selected.activeSource;
                return (
                  <li
                    key={tier.tier}
                    className="flex items-center justify-between gap-2 rounded-sm border border-edge-subtle px-2.5 py-1.5"
                  >
                    <span className="flex items-center gap-2">
                      <span className={wins ? 'font-medium text-fg-strong' : 'text-fg-muted'}>
                        {SOURCE_LABEL[tier.tier]}
                      </span>
                      {wins ? <Badge variant="success">Active</Badge> : null}
                    </span>
                    <span className="text-xs text-fg-subtle">
                      {tier.present
                        ? `present${tier.version != null ? ` · v${tier.version}` : ''}`
                        : '—'}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Section>

          <Section title="System message">
            <Pre>{selected.systemMessage}</Pre>
          </Section>

          <Section title="Template">
            <Pre>{selected.template}</Pre>
          </Section>

          <Section title="Variables">
            {selected.variables.length === 0 ? (
              <p className="text-sm text-fg-muted">None.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selected.variables.map((name) => (
                  <code
                    key={name}
                    className="rounded-sm bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-fg-muted"
                  >
                    {`{{${name}}}`}
                  </code>
                ))}
              </div>
            )}
          </Section>
        </CardBody>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{title}</h3>
      {children}
    </div>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-edge-subtle bg-surface-2 p-3 font-mono text-xs text-fg">
      {children}
    </pre>
  );
}

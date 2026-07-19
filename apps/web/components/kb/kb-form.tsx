'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import {
  createKnowledgeDocAction,
  updateKnowledgeDocAction,
} from '@verocrest/domain-knowledge/actions';
import {
  KNOWLEDGE_DOC_TYPES,
  KNOWLEDGE_DOC_VISIBILITIES,
  type KnowledgeDoc,
} from '@verocrest/domain-knowledge';
import { Button, InputField, TextareaField } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';
import { unmappedFieldErrors } from '@/components/forms/form-errors';

const INLINE_ERROR_KEYS = ['title', 'slug', 'content', 'tags', 'summary'] as const;

type LinkOption = { id: string; name: string; type: 'offer' | 'icp' };
type Props = ({ mode: 'create' } | { mode: 'edit'; doc: KnowledgeDoc }) & { links: LinkOption[] };

const inputCls =
  'h-9 rounded-sm border border-edge bg-surface-2 px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

export function KbForm(props: Props) {
  const action = props.mode === 'create' ? createKnowledgeDocAction : updateKnowledgeDocAction;
  const [state, formAction, pending] = useActionState(action, null);
  const initial = props.mode === 'edit' ? props.doc : undefined;
  const fieldErrors = state?.error?.fieldErrors;
  const bannerErrors = unmappedFieldErrors(fieldErrors, INLINE_ERROR_KEYS);

  // Encode the linked entity as "type:id" in one select for a compact editor.
  const initialLink =
    initial?.linkedEntityType && initial?.linkedEntityId
      ? `${initial.linkedEntityType}:${initial.linkedEntityId}`
      : '';
  const [link, setLink] = useState(initialLink);
  const [linkType, linkId] = link ? link.split(':') : ['', ''];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {props.mode === 'edit' ? <input type="hidden" name="id" value={props.doc.id} /> : null}
      <input type="hidden" name="linkedEntityType" value={linkType} />
      <input type="hidden" name="linkedEntityId" value={linkId} />
      {state?.error && (!fieldErrors || bannerErrors.length > 0) ? (
        <FormError
          message={bannerErrors.length > 0 ? bannerErrors.join(' ') : state.error.message}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Title"
          name="title"
          defaultValue={initial?.title ?? ''}
          error={fieldErrors?.['title']}
          autoFocus
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="docType" className="text-sm font-medium text-fg">
            Type
          </label>
          <select
            id="docType"
            name="docType"
            defaultValue={initial?.docType ?? 'sop'}
            className={inputCls}
          >
            {KNOWLEDGE_DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <InputField
        label="Slug"
        name="slug"
        defaultValue={initial?.slug ?? ''}
        error={fieldErrors?.['slug']}
        help="Auto-generated from title if blank"
      />

      <TextareaField
        label="Content (markdown)"
        name="content"
        rows={16}
        defaultValue={initial?.content ?? ''}
        error={fieldErrors?.['content']}
        help="This is what feeds AI Memory. Markdown is the source of truth."
      />

      <InputField
        label="Tags"
        name="tags"
        defaultValue={initial?.tags.join(', ') ?? ''}
        help="Comma-separated"
        error={fieldErrors?.['tags']}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="visibility" className="text-sm font-medium text-fg">
            Visibility
          </label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={initial?.visibility ?? 'internal'}
            className={inputCls}
          >
            {KNOWLEDGE_DOC_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="linkedEntity" className="text-sm font-medium text-fg">
            Linked entity
          </label>
          <select
            id="linkedEntity"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className={inputCls}
          >
            <option value="">— None —</option>
            {props.links.map((l) => (
              <option key={`${l.type}:${l.id}`} value={`${l.type}:${l.id}`}>
                {l.type}: {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <InputField
        label="Summary"
        name="summary"
        defaultValue={initial?.summary ?? ''}
        help="Optional one-line summary"
        error={fieldErrors?.['summary']}
      />

      <div className="flex items-center justify-end gap-2 border-t border-edge-subtle pt-4">
        <Link href={props.mode === 'edit' ? `/kb/${props.doc.id}` : '/kb'}>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

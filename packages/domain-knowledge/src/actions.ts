'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { z } from 'zod';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, type ActionResult } from '@verocrest/platform-tenancy';
import { createIcp, updateIcp } from './icp/service';
import type { Icp } from './icp/types';
import { icpInputSchema } from './icp/validation';
import { createOffer, updateOffer } from './offer/service';
import type { Offer } from './offer/types';
import { offerInputSchema } from './offer/validation';
import { createKnowledgeDoc, updateKnowledgeDoc } from './kb/service';
import type { KnowledgeDoc } from './kb/types';
import { knowledgeDocInputSchema } from './kb/validation';

/**
 * ICP Server Actions (docs/05 §3.3, docs/10 §3.1). Resolve workspace context
 * (fail-closed), validate, delegate to the service (which emits `icp.upserted`),
 * revalidate the list, and redirect to the ICP on success.
 */

function commaList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function inputFromFormData(formData: FormData): unknown {
  return {
    name: formData.get('name'),
    shortDescription: formData.get('shortDescription') ?? '',
    narrative: formData.get('narrative'),
    targetIndustries: commaList(formData.get('targetIndustries')),
    targetGeographies: commaList(formData.get('targetGeographies')).map((s) => s.toUpperCase()),
    targetSize: formData.getAll('targetSize').filter((v): v is string => typeof v === 'string'),
    targetRevenueMin: optionalNumber(formData.get('targetRevenueMin')),
    targetRevenueMax: optionalNumber(formData.get('targetRevenueMax')),
    targetRevenueCurrency:
      typeof formData.get('targetRevenueCurrency') === 'string' &&
      (formData.get('targetRevenueCurrency') as string).trim() !== ''
        ? formData.get('targetRevenueCurrency')
        : undefined,
    disqualifiers: commaList(formData.get('disqualifiers')),
  };
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    out[key] ??= issue.message;
  }
  return out;
}

const icpErrors = {
  validation: (fieldErrorsMap: Record<string, string>) =>
    fail<{ icp: Icp }>({
      code: 'VALIDATION_ERROR',
      category: 'validation',
      message: 'Please correct the highlighted fields.',
      retryable: false,
      fieldErrors: fieldErrorsMap,
    }),
  unexpected: () =>
    fail<{ icp: Icp }>({
      code: 'INTERNAL',
      category: 'business',
      message: 'Something went wrong. Please try again.',
      retryable: true,
    }),
  unauthorized: () =>
    fail<{ icp: Icp }>({
      code: 'WORKSPACE_NOT_MEMBER',
      category: 'authorization',
      message: 'Please sign in.',
      retryable: false,
    }),
  notFound: () =>
    fail<{ icp: Icp }>({
      code: 'NOT_FOUND',
      category: 'business',
      message: 'ICP not found.',
      retryable: false,
    }),
};

export async function createIcpAction(
  _prev: ActionResult<{ icp: Icp }> | null,
  formData: FormData,
): Promise<ActionResult<{ icp: Icp }>> {
  let icpId: string;
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = icpInputSchema.safeParse(inputFromFormData(formData));
    if (!parsed.success) return icpErrors.validation(fieldErrors(parsed.error));
    const icp = await createIcp(ctx, parsed.data);
    icpId = icp.id;
  } catch (err) {
    if (err instanceof WorkspaceContextError) return icpErrors.unauthorized();
    console.error('[icp] create failed', err);
    return icpErrors.unexpected();
  }
  revalidatePath('/settings/icps');
  redirect(`/settings/icps/${icpId}`, RedirectType.push);
}

export async function updateIcpAction(
  _prev: ActionResult<{ icp: Icp }> | null,
  formData: FormData,
): Promise<ActionResult<{ icp: Icp }>> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id === '') return icpErrors.notFound();
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = icpInputSchema.safeParse(inputFromFormData(formData));
    if (!parsed.success) return icpErrors.validation(fieldErrors(parsed.error));
    const icp = await updateIcp(ctx, id, parsed.data);
    if (!icp) return icpErrors.notFound();
  } catch (err) {
    if (err instanceof WorkspaceContextError) return icpErrors.unauthorized();
    console.error('[icp] update failed', err);
    return icpErrors.unexpected();
  }
  revalidatePath('/settings/icps');
  revalidatePath(`/settings/icps/${id}`);
  redirect(`/settings/icps/${id}`, RedirectType.push);
}

/**
 * Offer Server Actions (docs/05 §3.4, docs/10 §3.1). Structured fields arrive as
 * JSON strings in hidden inputs (the form manages them client-side); the `intent`
 * button decides draft vs activate. Activate emits `offer.upserted` (indexing).
 */

function jsonField(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function offerInputFromFormData(formData: FormData): unknown {
  return {
    name: formData.get('name'),
    slug: formData.get('slug') ?? '',
    shortDescription: formData.get('shortDescription') ?? '',
    positioning: formData.get('positioning') ?? '',
    targetIcpId:
      typeof formData.get('targetIcpId') === 'string' &&
      (formData.get('targetIcpId') as string).trim() !== ''
        ? formData.get('targetIcpId')
        : null,
    targetCompanySize: formData
      .getAll('targetCompanySize')
      .filter((v): v is string => typeof v === 'string'),
    targetIndustries: commaList(formData.get('targetIndustries')),
    pricingModel: formData.get('pricingModel') ?? 'fixed',
    price: optionalNumber(formData.get('price')),
    priceMax: optionalNumber(formData.get('priceMax')),
    currency:
      typeof formData.get('currency') === 'string' &&
      (formData.get('currency') as string).trim() !== ''
        ? formData.get('currency')
        : undefined,
    billingCadence:
      typeof formData.get('billingCadence') === 'string' &&
      (formData.get('billingCadence') as string).trim() !== ''
        ? formData.get('billingCadence')
        : undefined,
    deliverables: jsonField(formData.get('deliverables')) ?? [],
    guarantees: jsonField(formData.get('guarantees')) ?? [],
    roiNarrative: formData.get('roiNarrative') ?? '',
    roiMetrics: jsonField(formData.get('roiMetrics')) ?? {},
    onboardingSteps: jsonField(formData.get('onboardingSteps')) ?? [],
    requirements: jsonField(formData.get('requirements')) ?? [],
  };
}

const offerErrors = {
  validation: (fieldErrorsMap: Record<string, string>) =>
    fail<{ offer: Offer }>({
      code: 'VALIDATION_ERROR',
      category: 'validation',
      message: 'Please correct the highlighted fields.',
      retryable: false,
      fieldErrors: fieldErrorsMap,
    }),
  unexpected: (detail?: string) =>
    fail<{ offer: Offer }>({
      code: 'INTERNAL',
      category: 'business',
      // In development the real Postgres message is surfaced so the failing
      // insert is diagnosable from the UI; production stays generic.
      message: detail
        ? `Something went wrong: ${detail}`
        : 'Something went wrong. Please try again.',
      retryable: true,
    }),
  unauthorized: () =>
    fail<{ offer: Offer }>({
      code: 'WORKSPACE_NOT_MEMBER',
      category: 'authorization',
      message: 'Please sign in.',
      retryable: false,
    }),
  notFound: () =>
    fail<{ offer: Offer }>({
      code: 'NOT_FOUND',
      category: 'business',
      message: 'Offer not found.',
      retryable: false,
    }),
};

/** Structured log of the underlying failure — never swallow it (docs debugging). */
function logOfferFailure(op: 'create' | 'update', err: unknown): string | undefined {
  const e = err as { message?: string; stack?: string; pg?: Record<string, unknown> };
  console.error(`[offer] ${op} failed`, {
    message: e.message,
    pg: e.pg,
    stack: e.stack,
  });
  return process.env.NODE_ENV !== 'production' ? e.message : undefined;
}

export async function createOfferAction(
  _prev: ActionResult<{ offer: Offer }> | null,
  formData: FormData,
): Promise<ActionResult<{ offer: Offer }>> {
  const activate = formData.get('intent') === 'activate';
  let offerId: string;
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = offerInputSchema.safeParse(offerInputFromFormData(formData));
    if (!parsed.success) return offerErrors.validation(fieldErrors(parsed.error));
    const offer = await createOffer(ctx, parsed.data, activate);
    offerId = offer.id;
  } catch (err) {
    if (err instanceof WorkspaceContextError) return offerErrors.unauthorized();
    return offerErrors.unexpected(logOfferFailure('create', err));
  }
  revalidatePath('/settings/offers');
  redirect(`/settings/offers/${offerId}`, RedirectType.push);
}

export async function updateOfferAction(
  _prev: ActionResult<{ offer: Offer }> | null,
  formData: FormData,
): Promise<ActionResult<{ offer: Offer }>> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id === '') return offerErrors.notFound();
  const activate = formData.get('intent') === 'activate';
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = offerInputSchema.safeParse(offerInputFromFormData(formData));
    if (!parsed.success) return offerErrors.validation(fieldErrors(parsed.error));
    const offer = await updateOffer(ctx, id, parsed.data, activate);
    if (!offer) return offerErrors.notFound();
  } catch (err) {
    if (err instanceof WorkspaceContextError) return offerErrors.unauthorized();
    return offerErrors.unexpected(logOfferFailure('update', err));
  }
  revalidatePath('/settings/offers');
  revalidatePath(`/settings/offers/${id}`);
  redirect(`/settings/offers/${id}`, RedirectType.push);
}

/**
 * Knowledge Document Server Actions (docs/05 §3.5). Every save emits
 * `knowledge_doc.upserted` (no draft gating) → the Knowledge Indexer chunks +
 * embeds and maintains knowledge_document_chunks.
 */

function kbInputFromFormData(formData: FormData): unknown {
  const linkedType = formData.get('linkedEntityType');
  const linkedId = formData.get('linkedEntityId');
  const hasLink =
    typeof linkedType === 'string' &&
    linkedType !== '' &&
    typeof linkedId === 'string' &&
    linkedId !== '';
  return {
    docType: formData.get('docType'),
    title: formData.get('title'),
    slug: formData.get('slug') ?? '',
    summary: formData.get('summary') ?? '',
    content: formData.get('content'),
    tags: commaList(formData.get('tags')),
    visibility: formData.get('visibility') ?? 'internal',
    linkedEntityType: hasLink ? linkedType : null,
    linkedEntityId: hasLink ? linkedId : null,
  };
}

const kbErrors = {
  validation: (fieldErrorsMap: Record<string, string>) =>
    fail<{ doc: KnowledgeDoc }>({
      code: 'VALIDATION_ERROR',
      category: 'validation',
      message: 'Please correct the highlighted fields.',
      retryable: false,
      fieldErrors: fieldErrorsMap,
    }),
  unexpected: () =>
    fail<{ doc: KnowledgeDoc }>({
      code: 'INTERNAL',
      category: 'business',
      message: 'Something went wrong. Please try again.',
      retryable: true,
    }),
  unauthorized: () =>
    fail<{ doc: KnowledgeDoc }>({
      code: 'WORKSPACE_NOT_MEMBER',
      category: 'authorization',
      message: 'Please sign in.',
      retryable: false,
    }),
  notFound: () =>
    fail<{ doc: KnowledgeDoc }>({
      code: 'NOT_FOUND',
      category: 'business',
      message: 'Document not found.',
      retryable: false,
    }),
};

export async function createKnowledgeDocAction(
  _prev: ActionResult<{ doc: KnowledgeDoc }> | null,
  formData: FormData,
): Promise<ActionResult<{ doc: KnowledgeDoc }>> {
  let docId: string;
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = knowledgeDocInputSchema.safeParse(kbInputFromFormData(formData));
    if (!parsed.success) return kbErrors.validation(fieldErrors(parsed.error));
    const doc = await createKnowledgeDoc(ctx, parsed.data);
    docId = doc.id;
  } catch (err) {
    if (err instanceof WorkspaceContextError) return kbErrors.unauthorized();
    console.error('[kb] create failed', err);
    return kbErrors.unexpected();
  }
  revalidatePath('/kb');
  redirect(`/kb/${docId}`, RedirectType.push);
}

export async function updateKnowledgeDocAction(
  _prev: ActionResult<{ doc: KnowledgeDoc }> | null,
  formData: FormData,
): Promise<ActionResult<{ doc: KnowledgeDoc }>> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id === '') return kbErrors.notFound();
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = knowledgeDocInputSchema.safeParse(kbInputFromFormData(formData));
    if (!parsed.success) return kbErrors.validation(fieldErrors(parsed.error));
    const doc = await updateKnowledgeDoc(ctx, id, parsed.data);
    if (!doc) return kbErrors.notFound();
  } catch (err) {
    if (err instanceof WorkspaceContextError) return kbErrors.unauthorized();
    console.error('[kb] update failed', err);
    return kbErrors.unexpected();
  }
  revalidatePath('/kb');
  revalidatePath(`/kb/${id}`);
  redirect(`/kb/${id}`, RedirectType.push);
}

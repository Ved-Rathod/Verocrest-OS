import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { offerContentHash } from './hash';
import { OFFER_SELECT, offerRowSchema, toOffer, type Offer, type OfferListItem } from './types';
import { offerInputSchema, slugify, type OfferInput } from './validation';

/**
 * Offer repository (docs/04 §10.6, docs/05 §3.4). Server-only; explicit
 * WorkspaceContext; RLS backstop. Save-as-Draft persists without an event;
 * Save-&-Activate sets status='active' and emits `offer.upserted`, which the
 * Knowledge Indexer consumes to vectorize positioning/ROI (scope 'offer').
 */

export async function listOffers(ctx: WorkspaceContext): Promise<OfferListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('offers')
    .select('id, name, slug, short_description, status, pricing_model, is_indexed, updated_at')
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    shortDescription: (r.short_description as string | null) ?? null,
    status: r.status as OfferListItem['status'],
    pricingModel: r.pricing_model as OfferListItem['pricingModel'],
    isIndexed: Boolean(r.is_indexed),
    updatedAt: r.updated_at as string,
  }));
}

export async function getOffer(ctx: WorkspaceContext, id: string): Promise<Offer | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('offers')
    .select(OFFER_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toOffer(offerRowSchema.parse(data)) : null;
}

/** Unique slug within the workspace; suffixes on collision (excluding self). */
async function uniqueSlug(
  ctx: WorkspaceContext,
  base: string,
  excludeId?: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('offers')
    .select('id, slug')
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null)
    .ilike('slug', `${base}%`);
  if (error) throw error;
  const taken = new Set(
    (data ?? []).filter((r) => r.id !== excludeId).map((r) => (r.slug as string).toLowerCase()),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function offerRowFields(input: OfferInput, slug: string, contentHash: string) {
  return {
    slug,
    name: input.name,
    short_description: input.shortDescription || null,
    positioning: input.positioning || null,
    target_icp_id: input.targetIcpId ?? null,
    target_company_size: input.targetCompanySize,
    target_industries: input.targetIndustries,
    pricing_model: input.pricingModel,
    price: input.price ?? null,
    price_max: input.priceMax ?? null,
    currency: input.currency ?? null,
    billing_cadence: input.billingCadence ?? null,
    deliverables: input.deliverables,
    guarantees: input.guarantees,
    roi_narrative: input.roiNarrative || null,
    roi_metrics: input.roiMetrics,
    onboarding_steps: input.onboardingSteps,
    requirements: input.requirements,
    content_hash: contentHash,
  };
}

export async function createOffer(
  ctx: WorkspaceContext,
  input: OfferInput,
  activate: boolean,
): Promise<Offer> {
  const supabase = await createSupabaseServerClient();
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(ctx, input.slug ? slugify(input.slug) : slugify(input.name));
  const contentHash = offerContentHash(input);

  const event = activate
    ? buildEvent({
        name: 'offer.upserted',
        workspaceId: ctx.workspaceId,
        actor: { type: 'user', id: ctx.userId },
        subjectId: id,
        payload: { offer_id: id, version: 1 },
      })
    : null;
  const { data, error } = await supabase.rpc('create_offer_with_event', {
    p_offer: {
      id,
      workspace_id: ctx.workspaceId,
      ...offerRowFields(input, slug, contentHash),
      status: activate ? 'active' : 'draft',
      version: 1,
      created_by: ctx.userId,
    },
    p_event: event ? journalRowFromEnvelope(event) : null,
  });
  if (error) throw error;
  const offer = toOffer(offerRowSchema.parse(data));
  if (event) await publishToBus(event); // fan out → Knowledge Indexer
  return offer;
}

export async function updateOffer(
  ctx: WorkspaceContext,
  id: string,
  input: OfferInput,
  activate: boolean,
): Promise<Offer | null> {
  const supabase = await createSupabaseServerClient();
  const { data: current, error: readError } = await supabase
    .from('offers')
    .select('content_hash, is_indexed, slug, version')
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) return null;

  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
  const slug =
    baseSlug === (current.slug as string) ? baseSlug : await uniqueSlug(ctx, baseSlug, id);
  const contentHash = offerContentHash(input);
  const contentChanged = contentHash !== (current.content_hash as string);
  // Re-index only when activating with changed indexed content (docs/09 §5.4).
  const isIndexed = activate
    ? contentChanged
      ? false
      : Boolean(current.is_indexed)
    : Boolean(current.is_indexed);

  const event = activate
    ? buildEvent({
        name: 'offer.upserted',
        workspaceId: ctx.workspaceId,
        actor: { type: 'user', id: ctx.userId },
        subjectId: id,
        payload: { offer_id: id, version: current.version as number },
      })
    : null;
  const { data, error } = await supabase.rpc('update_offer_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_offer: {
      ...offerRowFields(input, slug, contentHash),
      status: activate ? 'active' : 'draft',
      is_indexed: isIndexed,
    },
    p_event: event ? journalRowFromEnvelope(event) : null,
  });
  if (error) throw error;
  if (!data) return null;
  const offer = toOffer(offerRowSchema.parse(data));
  if (event) await publishToBus(event);
  return offer;
}

export { offerInputSchema };

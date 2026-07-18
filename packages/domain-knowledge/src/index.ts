// @verocrest/domain-knowledge — client-safe surface (types + validation).
// Server data access is in './server'; Server Actions in './actions'.
export { COMPANY_SIZES, type CompanySize, type Icp, type IcpListItem } from './icp/types';
export { icpInputSchema, buildCriteria, type IcpInput } from './icp/validation';
export {
  PRICING_MODELS,
  OFFER_STATUSES,
  BILLING_CADENCES,
  type PricingModel,
  type OfferStatus,
  type BillingCadence,
  type Deliverable,
  type Guarantee,
  type OnboardingStep,
  type RoiMetrics,
  type Offer,
  type OfferListItem,
} from './offer/types';
export { offerInputSchema, slugify, type OfferInput } from './offer/validation';
export {
  KNOWLEDGE_DOC_TYPES,
  KNOWLEDGE_DOC_VISIBILITIES,
  KNOWLEDGE_LINKED_ENTITY_TYPES,
  type KnowledgeDocType,
  type KnowledgeDocVisibility,
  type KnowledgeLinkedEntityType,
  type KnowledgeDoc,
  type KnowledgeDocListItem,
} from './kb/types';
export { knowledgeDocInputSchema, type KnowledgeDocInput } from './kb/validation';

// @verocrest/domain-personalization — client-safe surface (types + validation).
// Server data access is in './server'; Server Actions in './actions'.
export {
  PERSONALIZATION_COMPONENT_LABELS,
  type Personalization,
  type PersonalizationComponents,
  type PersonalizationCitations,
} from './personalization/types';
export {
  generatePersonalizationInputSchema,
  componentsToPreview,
  type GeneratePersonalizationInput,
} from './personalization/validation';

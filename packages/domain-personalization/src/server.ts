// @verocrest/domain-personalization server surface — RLS-scoped personalization
// data access (docs/04 §9.1, docs/09 §11).
export { generatePersonalization, listPersonalizations } from './personalization/service';
export { assembleGroundingContext, ContactNotFoundError } from './personalization/grounding';
export {
  PERSONALIZATION_SELECT,
  toPersonalization,
  type Personalization,
  type PersonalizationComponents,
} from './personalization/types';

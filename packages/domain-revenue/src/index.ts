// @verocrest/domain-revenue — client-safe surface (types + validation). Server
// data access is in './server'; Server Actions in './actions'.
export {
  TARGET_PERIODS,
  TARGET_PERIOD_LABELS,
  isCurrent,
  type Target,
  type TargetListItem,
  type TargetPeriod,
} from './target/types';
export { targetInputSchema, type TargetInput } from './target/validation';

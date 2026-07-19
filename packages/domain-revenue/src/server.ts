// @verocrest/domain-revenue server surface — RLS-scoped Revenue Target data
// access (docs/04 §13.2, docs/05 §3.6).
export {
  listTargets,
  getTarget,
  getCurrentTargets,
  createTarget,
  updateTarget,
  deleteTarget,
} from './target/service';
export {
  TARGET_SELECT,
  isCurrent,
  toTarget,
  type Target,
  type TargetListItem,
  type TargetPeriod,
} from './target/types';

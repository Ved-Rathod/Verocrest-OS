// @verocrest/domain-integrations server surface — RLS-scoped OAuth connection
// data access (docs/11 §11). No Gmail/Calendar/Drive functionality in v0.1.
export {
  getGoogleConnection,
  beginGoogleConnect,
  completeGoogleConnect,
  disconnectGoogle,
  refreshGoogleIfNeeded,
  type CompleteResult,
} from './connection/service';
export {
  GOOGLE_PROVIDER,
  type ConnectionStatus,
  type GoogleConnectionView,
} from './connection/types';

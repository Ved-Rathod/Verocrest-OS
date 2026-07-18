// @verocrest/domain-knowledge server surface — RLS-scoped data access.
export { listIcps, getIcp, createIcp, updateIcp } from './icp/service';
export type { Icp, IcpListItem } from './icp/types';
export { listOffers, getOffer, createOffer, updateOffer } from './offer/service';
export type { Offer, OfferListItem } from './offer/types';
export {
  listKnowledgeDocs,
  getKnowledgeDoc,
  createKnowledgeDoc,
  updateKnowledgeDoc,
} from './kb/service';
export type { KnowledgeDoc, KnowledgeDocListItem } from './kb/types';

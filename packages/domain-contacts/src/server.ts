// @verocrest/domain-contacts/server — SERVER-ONLY RSC read helpers.
// Server Actions live at '@verocrest/domain-contacts/actions'.
export {
  getCompaniesPage,
  getCompanyById,
  getCompanyDetailPage,
  getCompanyContactsPage,
  CompaniesUnavailableError,
} from './company/queries';
export type { CompaniesUnavailableReason } from './company/queries';
export { getContactsPage, getContactDetailPage } from './contact/queries';
export { getCustomFieldDefinitions } from './custom-fields/queries';

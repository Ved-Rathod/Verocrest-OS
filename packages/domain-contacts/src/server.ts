// @verocrest/domain-contacts/server — SERVER-ONLY RSC read helpers.
// Server Actions live at '@verocrest/domain-contacts/actions'.
export { getCompaniesPage, getCompanyById, CompaniesUnavailableError } from './company/queries';
export type { CompaniesUnavailableReason } from './company/queries';

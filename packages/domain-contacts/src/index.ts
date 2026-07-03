// @verocrest/domain-contacts — Companies + Contacts core (Module 2, docs/06 §3.8).
// Companies are owned HERE (there is no domain-companies package per frozen 03 §5).
// Sprint 2.1 ships the Companies slice; Contacts land in Sprint 4.
//
// This index is the CLIENT-SAFE surface (types, enums, validation, pure utils).
// Server Actions:  @verocrest/domain-contacts/actions
// RSC read helpers: @verocrest/domain-contacts/server
export { COMPANY_SIZES, COMPANY_SIZE_LABELS } from './company/enums';
export type { CompanySize } from './company/enums';
export type { Company, CompanyPage } from './company/types';
export { normalizeDomain } from './company/domain';
export {
  companyInputSchema,
  companyListParamsSchema,
  parseTags,
  toFieldErrors,
} from './company/validation';
export type { CompanyInput, CompanyListParams } from './company/validation';

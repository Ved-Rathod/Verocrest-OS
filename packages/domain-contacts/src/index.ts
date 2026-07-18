// @verocrest/domain-contacts — Companies + Contacts core (Module 2, docs/06 §3.8).
// Companies are owned HERE (there is no domain-companies package per frozen 03 §5).
// Sprint 2.1 shipped Companies; Sprint 2.2 adds Contacts.
//
// This index is the CLIENT-SAFE surface (types, enums, validation, pure utils).
// Server Actions:  @verocrest/domain-contacts/actions
// RSC read helpers: @verocrest/domain-contacts/server

// Companies
export { COMPANY_SIZES, COMPANY_SIZE_LABELS } from './company/enums';
export type { CompanySize } from './company/enums';
export type { Company, CompanyPage, CompanyDetail, CompanyContactRef } from './company/types';
export type { CompanyOption } from './company/service';
export { normalizeDomain } from './company/domain';
export {
  companyInputSchema,
  companyListParamsSchema,
  parseTags,
  toFieldErrors,
} from './company/validation';
export type { CompanyInput, CompanyListParams } from './company/validation';

// Contacts
export { SENIORITY_LEVELS, SENIORITY_LABELS } from './contact/enums';
export type { Seniority } from './contact/enums';
export { displayName } from './contact/types';
export type {
  Contact,
  ContactDetail,
  ContactPage,
  LinkedCompany,
  PhoneEntry,
} from './contact/types';
export { contactInputSchema, contactListParamsSchema } from './contact/validation';
export type { ContactInput, ContactListParams } from './contact/validation';
export type { ContactOption } from './contact/service';

// Custom fields (Sprint 2.6, docs/04 §20.1) — client-safe surface
export { CUSTOM_FIELD_PREFIX, CUSTOM_FIELD_TYPES } from './custom-fields/enums';
export type { CustomFieldType, CustomFieldEntityType } from './custom-fields/enums';
export type { CustomFieldDefinition, CustomFieldValues } from './custom-fields/types';

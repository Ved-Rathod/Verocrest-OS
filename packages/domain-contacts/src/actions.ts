// @verocrest/domain-contacts/actions — Server Actions ('use server' re-export).
export {
  createCompanyAction,
  updateCompanyAction,
  deleteCompanyAction,
  loadCompaniesPageAction,
} from './company/actions';
export {
  createContactAction,
  updateContactAction,
  deleteContactAction,
  loadContactsPageAction,
  searchCompaniesForPickerAction,
} from './contact/actions';

// @verocrest/domain-contacts/actions — Server Actions ('use server' re-export).
export {
  createCompanyAction,
  updateCompanyAction,
  deleteCompanyAction,
  mergeCompaniesAction,
  loadCompaniesPageAction,
} from './company/actions';
export {
  createContactAction,
  updateContactAction,
  deleteContactAction,
  loadContactsPageAction,
  searchCompaniesForPickerAction,
  searchContactsForPickerAction,
} from './contact/actions';

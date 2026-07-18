-- ─────────────────────────────────────────────────────────────────────────────
-- Custom field definitions — MANUAL SEED TEMPLATE (Sprint 2.6)
--
-- v0.1 has no definition-editor UI (FR-CNT-006 is P1). Custom fields are declared
-- by inserting rows here, in the Supabase SQL editor. The app then renders +
-- validates them on contact/company forms and shows them on detail pages. Values
-- live in the existing contacts/companies.custom_fields JSONB (docs/04 §1.5 —
-- display/entry only; not filtered or sorted).
--
-- 1. Find your workspace id:
--      select id, name from public.workspaces where deleted_at is null;
-- 2. Replace :ws below with that uuid (or set it via psql: \set ws '...').
-- 3. Run the inserts you want. `field_key` must be unique per (workspace, entity).
--    `options` is required for single_select / multi_select.
-- ─────────────────────────────────────────────────────────────────────────────

-- Example — contact custom fields
insert into public.custom_field_definitions
  (workspace_id, entity_type, field_key, field_label, field_type, options, required, display_order)
values
  (:ws, 'contact', 'lead_source',  'Lead source',   'single_select',
     '["referral","cold_email","event","inbound"]'::jsonb, false, 10),
  (:ws, 'contact', 'preferred_channels', 'Preferred channels', 'multi_select',
     '["email","phone","linkedin","sms"]'::jsonb, false, 20),
  (:ws, 'contact', 'newsletter_opt_in', 'Newsletter opt-in', 'boolean', null, false, 30)
on conflict do nothing;

-- Example — company custom fields
insert into public.custom_field_definitions
  (workspace_id, entity_type, field_key, field_label, field_type, options, required, display_order)
values
  (:ws, 'company', 'account_tier',   'Account tier',   'single_select',
     '["gold","silver","bronze"]'::jsonb, false, 10),
  (:ws, 'company', 'renewal_date',   'Renewal date',   'date',     null, false, 20),
  (:ws, 'company', 'contract_value', 'Contract value', 'currency', null, false, 30)
on conflict do nothing;

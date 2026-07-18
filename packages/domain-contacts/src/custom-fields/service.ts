import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import type { CustomFieldEntityType } from './enums';
import {
  CUSTOM_FIELD_DEFINITION_SELECT,
  customFieldDefinitionRowSchema,
  toCustomFieldDefinition,
  type CustomFieldDefinition,
} from './types';

/**
 * Read the workspace's ACTIVE custom-field definitions for an entity, in display
 * order (docs/04 §20.1). Server-only; workspace-scoped with RLS backstop. The app
 * never writes definitions in v0.1 (manual SQL seeding — no editor UI).
 */
export async function listCustomFieldDefinitions(
  ctx: WorkspaceContext,
  entityType: CustomFieldEntityType,
): Promise<CustomFieldDefinition[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('custom_field_definitions')
    .select(CUSTOM_FIELD_DEFINITION_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('entity_type', entityType)
    .eq('active', true)
    .is('deleted_at', null)
    .order('display_order', { ascending: true })
    .order('field_label', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => toCustomFieldDefinition(customFieldDefinitionRowSchema.parse(r)));
}

/**
 * Fail-soft variant for WRITE actions: any failure (migration not applied, etc.)
 * resolves to []. This keeps contact/company create/update working when custom
 * fields aren't set up — a missing definitions table must never break the base
 * entity write.
 */
export async function listActiveDefinitionsSafe(
  ctx: WorkspaceContext,
  entityType: CustomFieldEntityType,
): Promise<CustomFieldDefinition[]> {
  try {
    return await listCustomFieldDefinitions(ctx, entityType);
  } catch {
    return [];
  }
}

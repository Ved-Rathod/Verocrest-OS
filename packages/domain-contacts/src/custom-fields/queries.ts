import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import type { CustomFieldEntityType } from './enums';
import { listCustomFieldDefinitions } from './service';
import type { CustomFieldDefinition } from './types';

/**
 * RSC read helper for active custom-field definitions. FAIL-SOFT: any failure
 * (migration not applied → 42P01, no workspace, etc.) resolves to an empty list
 * so contact/company forms + detail pages render exactly as before custom fields
 * existed. Custom fields are additive; they must never break the base entity.
 */
export async function getCustomFieldDefinitions(
  entityType: CustomFieldEntityType,
): Promise<CustomFieldDefinition[]> {
  try {
    const ctx = await requireWorkspaceContext();
    return await listCustomFieldDefinitions(ctx, entityType);
  } catch {
    return [];
  }
}

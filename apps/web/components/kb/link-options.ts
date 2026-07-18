import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { listIcps, listOffers } from '@verocrest/domain-knowledge/server';

export type LinkOption = { id: string; name: string; type: 'offer' | 'icp' };

/** Active offers + ICPs a KB doc can link to (docs/04 §7.3 — v0.1 subset, D7). */
export async function loadLinkOptions(ctx: WorkspaceContext): Promise<LinkOption[]> {
  const [offers, icps] = await Promise.all([listOffers(ctx), listIcps(ctx)]);
  return [
    ...offers.map((o) => ({ id: o.id, name: o.name, type: 'offer' as const })),
    ...icps.map((i) => ({ id: i.id, name: i.name, type: 'icp' as const })),
  ];
}

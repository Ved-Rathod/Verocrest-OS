import type { IcpMatch, MatchSignal } from './types';

/**
 * Deterministic ICP matcher (docs/04 §5.7–5.9, score_version 1). Pure +
 * unit-tested. Evaluates a lead's company + contact against an ICP over four
 * dimensions and returns a 0–100 match plus plain-language hit/miss signals.
 *
 * A dimension is only EVALUABLE when the ICP declares a target for it AND the lead
 * has the corresponding fact — the score is `matched / evaluable`, so absent lead
 * data neither helps nor unfairly penalizes (honest partial evaluation, D4). A
 * disqualifier hit forces the match to 0. LLMs are not involved (D2/D3).
 */

export type CompanyFacts = {
  industry: string | null;
  size: string | null;
  country: string | null;
};

export type ContactFacts = {
  seniority: string | null;
  isDecisionMaker: boolean;
};

export type IcpFacts = {
  id: string;
  name: string;
  targetIndustries: string[];
  targetGeographies: string[];
  targetSize: string[];
  criteria: unknown;
  disqualifiers: unknown;
};

const DIMENSION_WEIGHTS = { industry: 40, geography: 25, size: 20, seniority: 15 } as const;

const norm = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase();
const has = (list: string[], v: string | null): boolean =>
  v !== null && list.map(norm).includes(norm(v));

/** Pull the preferred seniorities from `criteria.contact.seniority.in` if present. */
function preferredSeniorities(criteria: unknown): string[] {
  const c = criteria as { contact?: { seniority?: { in?: unknown } } } | null;
  const arr = c?.contact?.seniority?.in;
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
}

/** Extract disqualifier industry values (strings, or `{industry|value}` objects). */
function disqualifierValues(disqualifiers: unknown): string[] {
  if (!Array.isArray(disqualifiers)) return [];
  return disqualifiers
    .map((d) => {
      if (typeof d === 'string') return d;
      const o = d as { industry?: unknown; value?: unknown };
      if (typeof o.industry === 'string') return o.industry;
      if (typeof o.value === 'string') return o.value;
      return null;
    })
    .filter((x): x is string => typeof x === 'string');
}

export function matchIcp(company: CompanyFacts, contact: ContactFacts, icp: IcpFacts): IcpMatch {
  const signals: MatchSignal[] = [];

  // Disqualifiers dominate (docs/04 §5.5).
  const disq = disqualifierValues(icp.disqualifiers);
  if (disq.length > 0 && has(disq, company.industry)) {
    return {
      icpId: icp.id,
      icpName: icp.name,
      score: 0,
      signals: [
        {
          label: 'Disqualified',
          detail: `Industry "${company.industry}" is on this ICP's disqualifier list.`,
          hit: false,
        },
      ],
    };
  }

  let evaluableWeight = 0;
  let matchedWeight = 0;

  // Industry.
  if (icp.targetIndustries.length > 0 && company.industry) {
    evaluableWeight += DIMENSION_WEIGHTS.industry;
    const hit = has(icp.targetIndustries, company.industry);
    if (hit) matchedWeight += DIMENSION_WEIGHTS.industry;
    signals.push({
      label: 'Industry',
      detail: hit
        ? `Company industry "${company.industry}" matches the ICP.`
        : `Company industry "${company.industry}" is not in the ICP's target industries.`,
      hit,
    });
  }

  // Geography.
  if (icp.targetGeographies.length > 0 && company.country) {
    evaluableWeight += DIMENSION_WEIGHTS.geography;
    const hit = has(icp.targetGeographies, company.country);
    if (hit) matchedWeight += DIMENSION_WEIGHTS.geography;
    signals.push({
      label: 'Geography',
      detail: hit
        ? `Company geography "${company.country}" matches the ICP.`
        : `Company geography "${company.country}" is outside the ICP's target geographies.`,
      hit,
    });
  }

  // Company size.
  if (icp.targetSize.length > 0 && company.size) {
    evaluableWeight += DIMENSION_WEIGHTS.size;
    const hit = has(icp.targetSize, company.size);
    if (hit) matchedWeight += DIMENSION_WEIGHTS.size;
    signals.push({
      label: 'Company size',
      detail: hit
        ? `Company size "${company.size}" matches the ICP.`
        : `Company size "${company.size}" is outside the ICP's target sizes.`,
      hit,
    });
  }

  // Contact seniority (only when the ICP specifies preferred seniorities).
  const preferred = preferredSeniorities(icp.criteria);
  if (preferred.length > 0 && contact.seniority) {
    evaluableWeight += DIMENSION_WEIGHTS.seniority;
    const hit = has(preferred, contact.seniority);
    if (hit) matchedWeight += DIMENSION_WEIGHTS.seniority;
    signals.push({
      label: 'Seniority',
      detail: hit
        ? `Contact seniority "${contact.seniority}" matches the ICP.`
        : `Contact seniority "${contact.seniority}" is not a preferred ICP role.`,
      hit,
    });
  }

  if (evaluableWeight === 0) {
    return {
      icpId: icp.id,
      icpName: icp.name,
      score: 0,
      signals: [
        {
          label: 'Insufficient data',
          detail: 'Not enough company/contact data overlaps this ICP to compute a match.',
          hit: false,
        },
      ],
    };
  }

  const score = Math.round((matchedWeight / evaluableWeight) * 100);
  return { icpId: icp.id, icpName: icp.name, score, signals };
}

/**
 * Match against every active ICP and return the best (highest score; ties keep
 * the first, which callers pass primary-first). Returns null when the workspace
 * has no active ICP (→ pre-ICP fallback, F-SCORE-001).
 */
export function pickBestIcp(
  company: CompanyFacts,
  contact: ContactFacts,
  icps: IcpFacts[],
): IcpMatch | null {
  let best: IcpMatch | null = null;
  for (const icp of icps) {
    const match = matchIcp(company, contact, icp);
    if (best === null || match.score > best.score) best = match;
  }
  return best;
}

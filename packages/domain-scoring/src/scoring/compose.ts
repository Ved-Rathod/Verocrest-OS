import type { FitComponent } from './types';

/**
 * Deterministic score composition (docs/04 §5.3 as amended by Amendment 011).
 * Pure + unit-tested. The engine composes ONLY from components that genuinely
 * exist and renormalizes their weights, so a missing substrate (e.g. enrichment)
 * biases nothing rather than dragging the score toward zero. A dimension with no
 * inputs is never fabricated or replaced by a neutral value.
 */

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

export type FitInput = Omit<FitComponent, 'effectiveWeight'>;

export type FitComposition = {
  /** 0–100, or null when NO component is available (nothing genuine to score on). */
  fitScore: number | null;
  components: FitComponent[];
};

/**
 * Compose the fit score from its components. Weights are renormalized over the
 * components that are available; the effective weights are recorded on each
 * component for explainability. Returns `fitScore: null` when nothing is available.
 */
export function composeFit(inputs: FitInput[]): FitComposition {
  const available = inputs.filter((c) => c.available && c.rawScore !== null);
  const totalBase = available.reduce((sum, c) => sum + c.baseWeight, 0);

  const components: FitComponent[] = inputs.map((c) => ({
    ...c,
    effectiveWeight:
      c.available && c.rawScore !== null && totalBase > 0 ? c.baseWeight / totalBase : 0,
  }));

  if (available.length === 0 || totalBase === 0) {
    return { fitScore: null, components };
  }

  const fit = available.reduce((sum, c) => sum + (c.rawScore ?? 0) * (c.baseWeight / totalBase), 0);
  return { fitScore: clamp(Math.round(fit)), components };
}

/**
 * Opportunity = round(sqrt(fit · readiness)) (docs/04 §5.3, unchanged formula).
 * Requires a GENUINE readiness; returns null while readiness is unavailable
 * (Sprint 4.9 — no Relationship Intelligence). Never substitutes a neutral value.
 */
export function composeOpportunity(
  fitScore: number | null,
  readinessScore: number | null,
): number | null {
  if (fitScore === null || readinessScore === null) return null;
  return clamp(Math.round(Math.sqrt(fitScore * readinessScore)));
}

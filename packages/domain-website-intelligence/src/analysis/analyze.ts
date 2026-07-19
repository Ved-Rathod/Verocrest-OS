import { safeFetch } from './fetch';
import { buildSignals, type AuxProbes, type WebsiteSignals } from './analyzers';
import { evaluate, buildSummary } from './grade';
import type { Finding, FindingCategory } from '../audit/types';

/**
 * Synchronous deterministic website analysis (Sprint 4.8 D1/D4). Fetches the page
 * + auxiliary resources (robots/sitemap/favicon), runs the analyzers, applies the
 * rubric, and assembles the normalized record — no Browserless, no AI.
 */
export type AnalysisResult = {
  urlNormalized: string;
  signals: WebsiteSignals;
  findings: Finding[];
  categoryGrades: Partial<Record<FindingCategory, number>>;
  overallGrade: number;
  latencyMs: number;
};

async function probeOk(url: string): Promise<boolean> {
  try {
    const r = await safeFetch(url, { method: 'GET' });
    return r.ok;
  } catch {
    return false;
  }
}

export async function analyzeWebsite(rawUrl: string): Promise<AnalysisResult> {
  const started = Date.now();
  const page = await safeFetch(rawUrl, { method: 'GET' });
  const origin = new URL(page.finalUrl).origin;

  const [robotsTxt, sitemapXml, favicon] = await Promise.all([
    probeOk(`${origin}/robots.txt`),
    probeOk(`${origin}/sitemap.xml`),
    probeOk(`${origin}/favicon.ico`),
  ]);
  const aux: AuxProbes = { robotsTxt, sitemapXml, favicon };

  const signals = buildSignals(page, aux);
  const evaluation = evaluate(signals);
  signals.summary = buildSummary(signals, evaluation);

  return {
    urlNormalized: page.finalUrl,
    signals,
    findings: evaluation.findings,
    categoryGrades: evaluation.categoryGrades,
    overallGrade: evaluation.overallGrade,
    latencyMs: Date.now() - started,
  };
}

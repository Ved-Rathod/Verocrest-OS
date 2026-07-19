import type { WebsiteSignals } from './analyzers';
import {
  FINDING_CATEGORIES,
  type Finding,
  type FindingCategory,
  type FindingSeverity,
} from '../audit/types';

/**
 * Transparent deterministic grading rubric (Sprint 4.8 D7). Each rule inspects a
 * signal and, if failing, emits a finding (frozen category + severity, D6). A
 * category's grade starts at 100 and loses a fixed penalty per finding by
 * severity; the overall grade is the rounded mean of the evaluated categories.
 * No AI, no randomness — the same site always grades the same.
 */

const SEVERITY_PENALTY: Record<FindingSeverity, number> = {
  critical: 45,
  high: 25,
  medium: 12,
  low: 5,
};

type Rule = {
  category: FindingCategory;
  when: (s: WebsiteSignals) => boolean;
  severity: FindingSeverity;
  title: string;
  description: string;
  recommendation: string;
  confidence: number;
  evidence?: (s: WebsiteSignals) => Record<string, unknown>;
};

const RULES: Rule[] = [
  {
    category: 'trust',
    when: (s) => !s.https,
    severity: 'critical',
    title: 'Site is not served over HTTPS',
    description: 'The page loads over an insecure connection, eroding visitor trust and SEO.',
    recommendation: 'Install a TLS certificate and force HTTPS with a redirect.',
    confidence: 99,
    evidence: (s) => ({ finalUrl: s.finalUrl }),
  },
  {
    category: 'trust',
    when: (s) => !s.hasContactInfo,
    severity: 'medium',
    title: 'No visible contact information',
    description: 'No email, phone, or contact link was found — a trust and conversion signal.',
    recommendation: 'Surface an email, phone number, or contact page in the header or footer.',
    confidence: 80,
  },
  {
    category: 'seo',
    when: (s) => !s.title,
    severity: 'high',
    title: 'Missing page title',
    description: 'The page has no <title>, which hurts search ranking and shareability.',
    recommendation: 'Add a concise, descriptive <title> (50–60 characters).',
    confidence: 95,
  },
  {
    category: 'seo',
    when: (s) => !!s.title && (s.titleLength < 10 || s.titleLength > 70),
    severity: 'low',
    title: 'Page title length is suboptimal',
    description: 'The title is very short or long enough to be truncated in search results.',
    recommendation: 'Aim for roughly 50–60 characters.',
    confidence: 70,
    evidence: (s) => ({ titleLength: s.titleLength }),
  },
  {
    category: 'seo',
    when: (s) => !s.metaDescription,
    severity: 'medium',
    title: 'Missing meta description',
    description: 'No meta description was found, so search engines invent the snippet.',
    recommendation: 'Add a 140–160 character meta description summarizing the page.',
    confidence: 90,
  },
  {
    category: 'seo',
    when: (s) => s.h1Count === 0,
    severity: 'medium',
    title: 'No H1 heading',
    description: 'The page lacks a primary H1 heading that states its purpose.',
    recommendation: 'Add exactly one clear H1 near the top of the page.',
    confidence: 85,
  },
  {
    category: 'seo',
    when: (s) => s.h1Count > 1,
    severity: 'low',
    title: 'Multiple H1 headings',
    description: 'More than one H1 dilutes the page’s primary topic signal.',
    recommendation: 'Use a single H1 and demote the rest to H2/H3.',
    confidence: 75,
    evidence: (s) => ({ h1Count: s.h1Count }),
  },
  {
    category: 'seo',
    when: (s) => !s.robotsTxt,
    severity: 'low',
    title: 'No robots.txt',
    description: 'No robots.txt was found to guide crawler behaviour.',
    recommendation: 'Publish a robots.txt at the site root.',
    confidence: 90,
  },
  {
    category: 'seo',
    when: (s) => !s.sitemapXml,
    severity: 'low',
    title: 'No sitemap.xml',
    description: 'No sitemap was found, slowing search-engine discovery of pages.',
    recommendation: 'Generate and reference a sitemap.xml.',
    confidence: 90,
  },
  {
    category: 'seo',
    when: (s) => !s.hasStructuredData,
    severity: 'low',
    title: 'No structured data (schema.org)',
    description: 'No JSON-LD structured data was found for rich results.',
    recommendation: 'Add relevant schema.org JSON-LD (Organization, LocalBusiness, etc.).',
    confidence: 80,
  },
  {
    category: 'seo',
    when: (s) => s.openGraph.length === 0,
    severity: 'low',
    title: 'No OpenGraph tags',
    description: 'Missing OpenGraph tags produce poor link previews on social platforms.',
    recommendation: 'Add og:title, og:description, and og:image.',
    confidence: 85,
  },
  {
    category: 'mobile',
    when: (s) => !s.hasViewport,
    severity: 'high',
    title: 'No mobile viewport meta tag',
    description: 'Without a viewport meta tag the site will not render well on phones.',
    recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    confidence: 95,
  },
  {
    category: 'accessibility',
    when: (s) => s.imageCount > 0 && s.imageAltCoverage < 0.5,
    severity: 'medium',
    title: 'Low image alt-text coverage',
    description: 'Fewer than half of images have alt text, hurting accessibility and SEO.',
    recommendation: 'Add descriptive alt attributes to meaningful images.',
    confidence: 85,
    evidence: (s) => ({ imagesWithAlt: s.imagesWithAlt, imageCount: s.imageCount }),
  },
  {
    category: 'cta',
    when: (s) => s.ctaCount === 0,
    severity: 'high',
    title: 'No clear call-to-action',
    description: 'No prominent CTA (book, contact, get started, buy) was detected.',
    recommendation: 'Add a clear primary CTA above the fold.',
    confidence: 75,
  },
  {
    category: 'booking',
    when: (s) => s.bookingLinks.length === 0,
    severity: 'medium',
    title: 'No booking or scheduling link',
    description: 'No Calendly/Cal.com/HubSpot-style scheduling link was found.',
    recommendation: 'Add a booking link so prospects can self-schedule.',
    confidence: 80,
  },
  {
    category: 'forms',
    when: (s) => s.formCount === 0,
    severity: 'medium',
    title: 'No lead-capture form',
    description: 'No <form> was found to capture enquiries.',
    recommendation: 'Add a short contact or lead-capture form.',
    confidence: 85,
  },
  {
    category: 'performance',
    when: (s) => s.scriptCount > 40,
    severity: 'medium',
    title: 'Heavy JavaScript load',
    description: 'A large number of script tags suggests slow load and render times.',
    recommendation: 'Audit and defer/remove non-critical scripts.',
    confidence: 65,
    evidence: (s) => ({ scriptCount: s.scriptCount }),
  },
  {
    category: 'performance',
    when: (s) => s.pageBytes > 1_500_000,
    severity: 'low',
    title: 'Large page size',
    description: 'The HTML payload is large, which slows first paint on mobile networks.',
    recommendation: 'Compress markup and lazy-load below-the-fold content.',
    confidence: 60,
    evidence: (s) => ({ pageBytes: s.pageBytes }),
  },
  {
    category: 'brand',
    when: (s) => s.socialLinks.length === 0,
    severity: 'low',
    title: 'No social media links',
    description: 'No links to social profiles were found to reinforce brand presence.',
    recommendation: 'Link to your active social profiles in the footer.',
    confidence: 80,
  },
];

export type Evaluation = {
  findings: Finding[];
  categoryGrades: Partial<Record<FindingCategory, number>>;
  overallGrade: number;
};

export function evaluate(signals: WebsiteSignals): Evaluation {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    if (rule.when(signals)) {
      findings.push({
        category: rule.category,
        severity: rule.severity,
        title: rule.title,
        description: rule.description,
        recommendation: rule.recommendation,
        evidence: rule.evidence ? rule.evidence(signals) : {},
        confidence: rule.confidence,
        position: findings.length,
      });
    }
  }

  // Grade only the categories the rubric actually evaluates.
  const evaluated = new Set(RULES.map((r) => r.category));
  const categoryGrades: Partial<Record<FindingCategory, number>> = {};
  for (const category of FINDING_CATEGORIES) {
    if (!evaluated.has(category)) continue;
    const penalty = findings
      .filter((f) => f.category === category)
      .reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
    categoryGrades[category] = Math.max(0, Math.min(100, 100 - penalty));
  }

  const grades = Object.values(categoryGrades);
  let overallGrade =
    grades.length === 0 ? 100 : Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
  // A single critical issue (e.g. no HTTPS) caps the overall grade — a healthy
  // category average must not mask a disqualifying problem.
  if (findings.some((f) => f.severity === 'critical')) overallGrade = Math.min(overallGrade, 55);

  return { findings, categoryGrades, overallGrade };
}

/** Human-readable summary embedded into AI Memory (answers the 3 target questions). */
export function buildSummary(signals: WebsiteSignals, evaluation: Evaluation): string {
  const tech = [
    ...signals.technologies,
    ...(signals.cms ? [signals.cms] : []),
    ...signals.analytics,
  ];
  const problems = evaluation.findings.filter((f) => f.severity !== 'low').map((f) => f.title);
  const opportunities = evaluation.findings.slice(0, 5).map((f) => f.recommendation);
  return [
    `Website audit for ${signals.finalUrl} — overall grade ${evaluation.overallGrade}/100.`,
    `Technologies: ${tech.length > 0 ? tech.join(', ') : 'none detected'}.`,
    `Problems: ${problems.length > 0 ? problems.join('; ') : 'no significant problems detected'}.`,
    `Opportunities: ${opportunities.length > 0 ? opportunities.join('; ') : 'none'}.`,
  ].join('\n');
}

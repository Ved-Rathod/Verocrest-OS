import type { FetchResult } from './fetch';

/**
 * Deterministic HTML/HTTP analyzers (Sprint 4.8 D1). Pure functions over the
 * fetched page — no Browserless, no AI. Regex/substring extraction is sufficient
 * for these structural signals and keeps the analyzers dependency-free + unit-
 * testable against fixture HTML.
 */

export type WebsiteSignals = {
  url: string;
  finalUrl: string;
  statusCode: number;
  https: boolean;
  httpsUpgraded: boolean;
  redirects: number;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  h1Count: number;
  h1Text: string | null;
  ctaCount: number;
  ctaSamples: string[];
  navLinkCount: number;
  hasContactInfo: boolean;
  socialLinks: string[];
  emails: string[];
  phones: string[];
  bookingLinks: string[];
  formCount: number;
  technologies: string[];
  cms: string | null;
  analytics: string[];
  scriptCount: number;
  stylesheetCount: number;
  imageCount: number;
  pageBytes: number;
  hasViewport: boolean;
  imagesWithAlt: number;
  imageAltCoverage: number;
  hasStructuredData: boolean;
  robotsTxt: boolean;
  sitemapXml: boolean;
  favicon: boolean;
  openGraph: string[];
  summary: string;
};

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1]! : null;
};

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]!) : null;
}

export function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re);
  if (!tag) return null;
  const content = attr(tag[0], 'content');
  return content ? decode(content) : null;
}

export function extractH1s(html: string): string[] {
  return [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    decode(m[1]!.replace(/<[^>]+>/g, ' ')),
  );
}

type Link = { href: string; text: string };
export function extractLinks(html: string): Link[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: attr(`<a ${m[1]}>`, 'href') ?? '',
    text: decode(m[2]!.replace(/<[^>]+>/g, ' ')),
  }));
}

const scriptSrcs = (html: string): string[] =>
  [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => attr(`<script ${m[1]}>`, 'src') ?? '');

const CTA_RE =
  /\b(book(?:\s+a)?(?:\s+(?:call|demo|meeting))?|schedule|get\s+started|start\s+free|sign\s+up|buy\s+now|request\s+a?\s*(?:demo|quote)|contact\s+us|get\s+a\s+quote|free\s+trial|talk\s+to)\b/i;

const SOCIAL: Record<string, RegExp> = {
  facebook: /facebook\.com/i,
  instagram: /instagram\.com/i,
  linkedin: /linkedin\.com/i,
  x: /(twitter\.com|x\.com)/i,
  youtube: /youtube\.com|youtu\.be/i,
  tiktok: /tiktok\.com/i,
  pinterest: /pinterest\./i,
};

const BOOKING: Record<string, RegExp> = {
  calendly: /calendly\.com/i,
  cal_com: /\bcal\.com/i,
  acuity: /acuityscheduling\.com/i,
  hubspot_meetings: /meetings\.hubspot\.com/i,
  savvycal: /savvycal\.com/i,
  youcanbookme: /youcanbook\.me/i,
};

const ANALYTICS: Record<string, RegExp> = {
  google_analytics: /google-analytics\.com|gtag\/js|googletagmanager\.com\/gtag/i,
  gtm: /googletagmanager\.com\/gtm/i,
  plausible: /plausible\.io/i,
  fathom: /usefathom\.com/i,
  hotjar: /hotjar\.com/i,
  segment: /cdn\.segment\.com/i,
  mixpanel: /mixpanel\.com/i,
  clarity: /clarity\.ms/i,
};

const CMS: Record<string, RegExp> = {
  WordPress: /wp-content|wp-includes|generator["'][^>]*wordpress/i,
  Shopify: /cdn\.shopify\.com|shopify/i,
  Wix: /wix\.com|_wix/i,
  Squarespace: /squarespace/i,
  Webflow: /webflow/i,
  Ghost: /ghost/i,
  Drupal: /drupal/i,
};

const TECH: Record<string, RegExp> = {
  React: /react[\w.-]*\.js|_next\/static|__NEXT_DATA__|data-reactroot/i,
  'Next.js': /_next\/static|__NEXT_DATA__/i,
  Vue: /vue(?:\.min)?\.js|data-v-/i,
  Angular: /ng-version|angular/i,
  jQuery: /jquery/i,
  Bootstrap: /bootstrap(?:\.min)?\.(?:css|js)/i,
  Tailwind: /tailwind/i,
};

function matchSet(hay: string, set: Record<string, RegExp>): string[] {
  return Object.entries(set)
    .filter(([, re]) => re.test(hay))
    .map(([k]) => k);
}

export type AuxProbes = { robotsTxt: boolean; sitemapXml: boolean; favicon: boolean };

/** Build the normalized signal record from the fetched page + auxiliary probes. */
export function buildSignals(page: FetchResult, aux: AuxProbes): WebsiteSignals {
  const html = page.body;
  const links = extractLinks(html);
  const hrefs = links.map((l) => l.href);
  const allHref = hrefs.join(' ');
  const scripts = scriptSrcs(html);
  const scriptBlob = `${scripts.join(' ')} ${html}`;

  const title = extractTitle(html);
  const metaDescription = extractMeta(html, 'description');
  const h1s = extractH1s(html);

  const ctas = links.filter((l) => CTA_RE.test(l.text)).map((l) => l.text);
  const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)]
    .map((m) => decode(m[1]!.replace(/<[^>]+>/g, ' ')))
    .filter((t) => CTA_RE.test(t));
  const ctaSamples = [...new Set([...ctas, ...buttons])].slice(0, 8);

  const emails = [
    ...new Set(
      [
        ...hrefs.filter((h) => h.startsWith('mailto:')).map((h) => h.slice(7).split('?')[0]!),
        ...(html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []),
      ].map((e) => e.toLowerCase()),
    ),
  ].slice(0, 10);

  const phones = [
    ...new Set(hrefs.filter((h) => h.startsWith('tel:')).map((h) => h.slice(4).trim())),
  ].slice(0, 10);

  const images = [...html.matchAll(/<img\b([^>]*)>/gi)].map((m) => `<img ${m[1]}>`);
  const imagesWithAlt = images.filter((t) => (attr(t, 'alt') ?? '').trim() !== '').length;

  const og = [...html.matchAll(/<meta[^>]+property\s*=\s*["'](og:[a-z]+)["']/gi)].map((m) =>
    m[1]!.toLowerCase(),
  );

  const generator = extractMeta(html, 'generator');
  const cms =
    matchSet(`${generator ?? ''} ${html}`, CMS)[0] ?? (generator ? generator.split(' ')[0]! : null);

  const technologies = [
    ...new Set([
      ...matchSet(scriptBlob, TECH),
      ...(page.headers['x-powered-by'] ? [page.headers['x-powered-by']] : []),
    ]),
  ];

  const navMatch = html.match(/<nav[\s\S]*?<\/nav>/i);
  const navLinkCount = navMatch ? (navMatch[0].match(/<a\b/gi) ?? []).length : 0;

  const hasContactInfo =
    emails.length > 0 ||
    phones.length > 0 ||
    /href\s*=\s*["'][^"']*contact/i.test(html) ||
    links.some((l) => /contact/i.test(l.text));

  return {
    url: page.requestedUrl,
    finalUrl: page.finalUrl,
    statusCode: page.status,
    https: page.finalUrl.startsWith('https:'),
    httpsUpgraded: page.httpsUpgraded,
    redirects: page.redirects,
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    h1Count: h1s.length,
    h1Text: h1s[0] ?? null,
    ctaCount: ctaSamples.length,
    ctaSamples,
    navLinkCount,
    hasContactInfo,
    socialLinks: matchSet(allHref, SOCIAL),
    emails,
    phones,
    bookingLinks: matchSet(allHref, BOOKING),
    formCount: (html.match(/<form\b/gi) ?? []).length,
    technologies,
    cms,
    analytics: matchSet(scriptBlob, ANALYTICS),
    scriptCount: (html.match(/<script\b/gi) ?? []).length,
    stylesheetCount: (html.match(/<link[^>]+rel\s*=\s*["']stylesheet["']/gi) ?? []).length,
    imageCount: images.length,
    pageBytes: Buffer.byteLength(html, 'utf8'),
    hasViewport: /<meta[^>]+name\s*=\s*["']viewport["']/i.test(html),
    imagesWithAlt,
    imageAltCoverage: images.length === 0 ? 1 : imagesWithAlt / images.length,
    hasStructuredData: /<script[^>]+type\s*=\s*["']application\/ld\+json["']/i.test(html),
    robotsTxt: aux.robotsTxt,
    sitemapXml: aux.sitemapXml,
    favicon: aux.favicon || /<link[^>]+rel\s*=\s*["'][^"']*icon["']/i.test(html),
    openGraph: [...new Set(og)],
    summary: '', // filled by the orchestrator once findings are known
  };
}

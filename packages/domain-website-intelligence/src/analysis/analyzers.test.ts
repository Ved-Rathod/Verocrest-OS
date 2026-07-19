import { describe, expect, it } from 'vitest';
import { buildSignals } from './analyzers';
import { evaluate, buildSummary } from './grade';
import type { FetchResult } from './fetch';

function page(body: string, over: Partial<FetchResult> = {}): FetchResult {
  return {
    requestedUrl: 'https://acme.test',
    finalUrl: 'https://acme.test/',
    status: 200,
    ok: true,
    redirects: 0,
    httpsUpgraded: true,
    headers: {},
    body,
    ...over,
  };
}

const GOOD = `<!doctype html><html><head>
<title>Acme — Fractional CFO Services for Startups</title>
<meta name="description" content="Acme provides fractional CFO services that cut burn and extend runway for venture-backed startups.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="Acme"><meta property="og:description" content="x"><meta property="og:image" content="/o.png">
<meta name="generator" content="WordPress 6.5">
<link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/s.css">
<script type="application/ld+json">{"@type":"Organization"}</script>
<script src="/react.production.min.js"></script>
</head><body>
<nav><a href="/about">About</a><a href="/pricing">Pricing</a><a href="/contact">Contact</a></nav>
<h1>Extend your runway</h1>
<a href="https://calendly.com/acme/intro">Book a call</a>
<a href="mailto:hi@acme.test">Email us</a><a href="tel:+15551234567">Call</a>
<a href="https://linkedin.com/company/acme">LinkedIn</a>
<img src="/a.png" alt="team"><img src="/b.png" alt="office">
<form><input name="email"></form>
<script src="https://www.googletagmanager.com/gtag/js"></script>
</body></html>`;

const BAD = `<html><head></head><body><p>hello</p><img src="/x.png"><img src="/y.png"></body></html>`;

describe('buildSignals (24 analyzers)', () => {
  const s = buildSignals(page(GOOD), { robotsTxt: true, sitemapXml: true, favicon: true });

  it('extracts core SEO + content signals', () => {
    expect(s.https).toBe(true);
    expect(s.title).toContain('Acme');
    expect(s.metaDescription).toContain('fractional CFO');
    expect(s.h1Count).toBe(1);
    expect(s.hasViewport).toBe(true);
    expect(s.openGraph).toEqual(expect.arrayContaining(['og:title', 'og:image']));
    expect(s.hasStructuredData).toBe(true);
    expect(s.favicon).toBe(true);
  });

  it('detects CTA, booking, contact, social, forms', () => {
    expect(s.ctaCount).toBeGreaterThan(0);
    expect(s.bookingLinks).toContain('calendly');
    expect(s.emails).toContain('hi@acme.test');
    expect(s.phones).toContain('+15551234567');
    expect(s.socialLinks).toContain('linkedin');
    expect(s.formCount).toBe(1);
    expect(s.hasContactInfo).toBe(true);
    expect(s.navLinkCount).toBe(3);
  });

  it('detects tech / CMS / analytics + alt coverage', () => {
    expect(s.cms).toBe('WordPress');
    expect(s.technologies).toContain('React');
    expect(s.analytics).toContain('google_analytics');
    expect(s.imageAltCoverage).toBe(1);
  });

  it('grades a healthy site highly with few findings', () => {
    const e = evaluate(s);
    expect(e.overallGrade).toBeGreaterThanOrEqual(85);
    expect(e.findings.every((f) => f.severity !== 'critical')).toBe(true);
  });
});

describe('grading a poor site', () => {
  const s = buildSignals(page(BAD, { finalUrl: 'http://acme.test/', httpsUpgraded: false }), {
    robotsTxt: false,
    sitemapXml: false,
    favicon: false,
  });
  const e = evaluate(s);

  it('flags HTTPS as critical and lowers the grade', () => {
    const titles = e.findings.map((f) => f.title);
    expect(titles).toContain('Site is not served over HTTPS');
    expect(e.findings.find((f) => f.title.includes('HTTPS'))?.severity).toBe('critical');
    expect(e.overallGrade).toBeLessThan(70);
  });

  it('flags missing title, viewport, CTA, meta, alt coverage', () => {
    const titles = e.findings.map((f) => f.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Missing page title',
        'No mobile viewport meta tag',
        'No clear call-to-action',
        'Missing meta description',
        'Low image alt-text coverage',
      ]),
    );
  });

  it('positions are sequential (persist order)', () => {
    e.findings.forEach((f, i) => expect(f.position).toBe(i));
  });

  it('summary names problems + technologies + opportunities', () => {
    const summary = buildSummary(s, e);
    expect(summary).toContain('Problems:');
    expect(summary).toContain('Technologies:');
    expect(summary).toContain('Opportunities:');
    expect(summary).toContain('grade');
  });
});

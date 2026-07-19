import { lookup } from 'node:dns/promises';

/**
 * SSRF-guarded fetch (Sprint 4.8 D8). The deterministic analyzer fetches
 * arbitrary user-supplied URLs server-side, so — unlike the sandboxed Browserless
 * path (docs/11) — every hop is validated: http(s) only, DNS resolved to a PUBLIC
 * address (blocks localhost / private / link-local / CGNAT / reserved), redirects
 * capped and re-validated, hard timeout, and a response-size cap.
 */

export const FETCH_LIMITS = {
  maxRedirects: 3,
  timeoutMs: 8_000,
  maxBytes: 2_000_000,
} as const;

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'UnsafeUrlError';
  }
}

/** Blocklist for IPv4 literals + resolved addresses (pure — unit-tested). */
export function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // not a clean IPv4 → treat as unsafe
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 (reserved/test)
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/** Block obvious non-public IPv6 (loopback, unique-local fc00::/7, link-local fe80::/10). */
export function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) return isBlockedIpv4(lower.slice(7)); // IPv4-mapped
  return false;
}

function isBlockedAddress(address: string, family: number): boolean {
  return family === 6 ? isBlockedIpv6(address) : isBlockedIpv4(address);
}

/** Validate scheme + host, and resolve DNS to confirm a public address. Throws UnsafeUrlError. */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('Enter a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs can be analyzed');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('This host is not publicly reachable');
  }
  const addresses = await lookup(host, { all: true }).catch(() => {
    throw new UnsafeUrlError('This host could not be resolved');
  });
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address, a.family))) {
    throw new UnsafeUrlError('This host resolves to a non-public address');
  }
  return url;
}

export type FetchResult = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  redirects: number;
  httpsUpgraded: boolean;
  headers: Record<string, string>;
  body: string;
};

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      chunks.push(value);
      if (total >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
    .subarray(0, maxBytes)
    .toString('utf8');
}

/**
 * Fetch text following redirects manually, re-validating each hop against SSRF.
 * Returns the final response body (capped) + redirect metadata.
 */
export async function safeFetch(
  rawUrl: string,
  opts: { method?: 'GET' | 'HEAD' } = {},
): Promise<FetchResult> {
  const started = rawUrl;
  let current = rawUrl;
  let redirects = 0;
  let httpsUpgraded = false;

  for (;;) {
    const url = await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_LIMITS.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'VerocrestBot/0.1 (+website-intelligence)' },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (redirects >= FETCH_LIMITS.maxRedirects) {
        throw new UnsafeUrlError('Too many redirects');
      }
      const next = new URL(res.headers.get('location')!, url).toString();
      if (url.protocol === 'http:' && next.startsWith('https:')) httpsUpgraded = true;
      redirects += 1;
      current = next;
      continue;
    }

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const body = opts.method === 'HEAD' ? '' : await readCapped(res, FETCH_LIMITS.maxBytes);
    return {
      requestedUrl: started,
      finalUrl: url.toString(),
      status: res.status,
      ok: res.ok,
      redirects,
      httpsUpgraded: httpsUpgraded || url.protocol === 'https:',
      headers,
      body,
    };
  }
}

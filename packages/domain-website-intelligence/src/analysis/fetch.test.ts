import { describe, expect, it } from 'vitest';
import { isBlockedIpv4, isBlockedIpv6 } from './fetch';

describe('SSRF address guard (docs D8)', () => {
  it('blocks loopback, private, link-local, CGNAT and reserved IPv4', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata endpoint
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      'not-an-ip',
    ]) {
      expect(isBlockedIpv4(ip)).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34']) {
      expect(isBlockedIpv4(ip)).toBe(false);
    }
  });

  it('blocks loopback / unique-local / link-local IPv6 and mapped private', () => {
    expect(isBlockedIpv6('::1')).toBe(true);
    expect(isBlockedIpv6('fe80::1')).toBe(true);
    expect(isBlockedIpv6('fc00::1')).toBe(true);
    expect(isBlockedIpv6('fd12::1')).toBe(true);
    expect(isBlockedIpv6('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIpv6('2606:4700:4700::1111')).toBe(false);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { getEventMetric, recordEventMetric, resetEventMetrics, totalEventMetrics } from './metrics';

afterEach(() => resetEventMetrics());

describe('event metrics sink (subscriber #2)', () => {
  it('counts per event name and totals across names', () => {
    expect(recordEventMetric('contact.created')).toBe(1);
    expect(recordEventMetric('contact.created')).toBe(2);
    recordEventMetric('lead.ingested');
    expect(getEventMetric('contact.created')).toBe(2);
    expect(getEventMetric('lead.ingested')).toBe(1);
    expect(getEventMetric('never.seen')).toBe(0);
    expect(totalEventMetrics()).toBe(3);
  });
});

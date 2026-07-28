import { describe, expect, it } from 'vitest';
import {
  matchIcp,
  pickBestIcp,
  type CompanyFacts,
  type ContactFacts,
  type IcpFacts,
} from './icp-match';

const company: CompanyFacts = { industry: 'dental', size: 'small', country: 'AU' };
const contact: ContactFacts = { seniority: 'owner', isDecisionMaker: true };

const icp = (over: Partial<IcpFacts> = {}): IcpFacts => ({
  id: 'icp-1',
  name: 'Dental AU',
  targetIndustries: ['dental', 'orthodontics'],
  targetGeographies: ['AU', 'NZ'],
  targetSize: ['small', 'medium'],
  criteria: { contact: { seniority: { in: ['owner', 'c_suite'] } } },
  disqualifiers: [],
  ...over,
});

describe('matchIcp', () => {
  it('scores a full match at 100', () => {
    expect(matchIcp(company, contact, icp()).score).toBe(100);
  });

  it('scores partial when some dimensions miss (matched/evaluable)', () => {
    // industry hit(40) + geography miss(0) + size hit(20) + seniority hit(15)
    // evaluable = 40+25+20+15 = 100 → matched 75 → 75.
    const m = matchIcp({ ...company, country: 'US' }, contact, icp());
    expect(m.score).toBe(75);
  });

  it('ignores dimensions the lead has no data for (no unfair penalty)', () => {
    // Only industry evaluable (geography/size null, seniority present+hit).
    const sparse: CompanyFacts = { industry: 'dental', size: null, country: null };
    const m = matchIcp(sparse, contact, icp());
    // evaluable = industry 40 + seniority 15 = 55; matched 55 → 100.
    expect(m.score).toBe(100);
  });

  it('returns 0 with a signal when no dimension is evaluable', () => {
    const m = matchIcp(
      { industry: null, size: null, country: null },
      { seniority: null, isDecisionMaker: false },
      icp(),
    );
    expect(m.score).toBe(0);
    expect(m.signals[0]?.label).toBe('Insufficient data');
  });

  it('disqualifier forces 0', () => {
    const m = matchIcp(company, contact, icp({ disqualifiers: ['dental'] }));
    expect(m.score).toBe(0);
    expect(m.signals[0]?.label).toBe('Disqualified');
  });
});

describe('pickBestIcp', () => {
  it('returns null when there are no active ICPs (pre-ICP fallback)', () => {
    expect(pickBestIcp(company, contact, [])).toBeNull();
  });

  it('picks the highest-scoring ICP', () => {
    const weak = icp({ id: 'icp-weak', name: 'Weak', targetIndustries: ['legal'] });
    const best = pickBestIcp(company, contact, [weak, icp()]);
    expect(best?.icpId).toBe('icp-1');
  });
});

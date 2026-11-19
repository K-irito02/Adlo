import { describe, expect, it } from 'vitest';
import { filterNoticePackages } from './thirdPartyNoticeSearch';
import type { ThirdPartyNoticePackage } from './thirdPartyNoticesTypes';

const pkg = (overrides: Partial<ThirdPartyNoticePackage>): ThirdPartyNoticePackage => ({
  name: 'alpha',
  version: '1.0.0',
  ecosystem: 'npm',
  license: 'MIT',
  licenseIds: ['MIT'],
  texts: [],
  textSource: 'none',
  ...overrides,
});

const packages = [
  pkg({ name: 'alpha', version: '1.0.0' }),
  pkg({ name: 'beta', version: '2.0.0', license: 'Apache-2.0', licenseIds: ['Apache-2.0'] }),
  pkg({
    name: 'gamma',
    version: '3.0.0-beta.1',
    license: 'MIT OR Apache-2.0',
    licenseIds: ['MIT', 'Apache-2.0'],
  }),
];

describe('filterNoticePackages', () => {
  it('returns every package for an empty query, subject to the limit', () => {
    const all = filterNoticePackages(packages, '');
    expect(all.visible).toHaveLength(3);
    expect(all.truncated).toBe(false);

    const limited = filterNoticePackages(packages, '', 2);
    expect(limited.visible).toHaveLength(2);
    expect(limited.matched).toHaveLength(3);
    expect(limited.truncated).toBe(true);
  });

  it('matches name, version, license expression and SPDX id case-insensitively', () => {
    expect(filterNoticePackages(packages, 'ALP').visible.map((p) => p.name)).toEqual(['alpha']);
    expect(filterNoticePackages(packages, '3.0.0-beta').visible.map((p) => p.name)).toEqual([
      'gamma',
    ]);
    expect(filterNoticePackages(packages, 'apache').visible.map((p) => p.name)).toEqual([
      'beta',
      'gamma',
    ]);
    expect(filterNoticePackages(packages, 'MIT').visible.map((p) => p.name)).toEqual([
      'alpha',
      'gamma',
    ]);
  });

  it('trims the query and reports no matches honestly', () => {
    expect(filterNoticePackages(packages, '   ').visible).toHaveLength(3);
    const none = filterNoticePackages(packages, 'zzz');
    expect(none.matched).toHaveLength(0);
    expect(none.visible).toHaveLength(0);
    expect(none.truncated).toBe(false);
  });
});

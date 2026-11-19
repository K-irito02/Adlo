import { describe, expect, it } from 'vitest';
import { THIRD_PARTY_NOTICES_DATA } from './thirdPartyNotices.generated';
import { THIRD_PARTY_NOTICE_NAMES } from './thirdPartyNoticeNames.generated';

describe('generated third-party notices', () => {
  it('covers both ecosystems and keeps totals in sync', () => {
    const { totals, packages } = THIRD_PARTY_NOTICES_DATA;
    expect(packages.length).toBeGreaterThan(0);
    expect(totals.total).toBe(packages.length);
    expect(totals.npm).toBe(packages.filter((pkg) => pkg.ecosystem === 'npm').length);
    expect(totals.cargo).toBe(packages.filter((pkg) => pkg.ecosystem === 'cargo').length);
    expect(totals.npm).toBeGreaterThan(0);
    expect(totals.cargo).toBeGreaterThan(0);
    expect(THIRD_PARTY_NOTICES_DATA.sources.cargoLock).toMatch(/^[0-9a-f]{12}$/);
    expect(THIRD_PARTY_NOTICES_DATA.sources.pnpmLock).toMatch(/^[0-9a-f]{12}$/);
  });

  it('only references license texts that exist', () => {
    for (const pkg of THIRD_PARTY_NOTICES_DATA.packages) {
      expect(pkg.name.length).toBeGreaterThan(0);
      expect(pkg.version.length).toBeGreaterThan(0);
      expect(['cargo', 'npm']).toContain(pkg.ecosystem);
      expect(['package', 'canonical', 'none']).toContain(pkg.textSource);
      for (const ref of pkg.texts) {
        expect(THIRD_PARTY_NOTICES_DATA.licenseTexts[ref.key]?.length ?? 0).toBeGreaterThan(0);
      }
      if (pkg.texts.length === 0) {
        expect(pkg.textSource).toBe('none');
      }
    }
  });

  it('reports unknown licenses and missing texts without inventing values', () => {
    const unknown = THIRD_PARTY_NOTICES_DATA.packages.filter((pkg) => pkg.license === '');
    const missing = THIRD_PARTY_NOTICES_DATA.packages.filter((pkg) => pkg.texts.length === 0);
    expect(unknown).toHaveLength(THIRD_PARTY_NOTICES_DATA.totals.unknownLicense);
    expect(missing).toHaveLength(THIRD_PARTY_NOTICES_DATA.totals.missingText);
  });

  it('generates a unique, sorted names index that matches the full data', () => {
    expect(new Set(THIRD_PARTY_NOTICE_NAMES).size).toBe(THIRD_PARTY_NOTICE_NAMES.length);
    expect([...THIRD_PARTY_NOTICE_NAMES].sort()).toEqual(THIRD_PARTY_NOTICE_NAMES);
    const uniqueFromData = [
      ...new Set(THIRD_PARTY_NOTICES_DATA.packages.map((pkg) => pkg.name)),
    ].sort();
    expect(THIRD_PARTY_NOTICE_NAMES).toEqual(uniqueFromData);
  });
});

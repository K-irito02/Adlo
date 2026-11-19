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
    const cssValue = THIRD_PARTY_NOTICES_DATA.packages.find(
      (pkg) => pkg.name === 'css-value' && pkg.version === '0.0.1',
    );
    expect(cssValue).toBeDefined();
    expect(cssValue?.license).toBe('');
    expect(cssValue?.texts).toHaveLength(0);
    expect(cssValue?.textSource).toBe('none');
    expect(THIRD_PARTY_NOTICES_DATA.totals.unknownLicense).toBeGreaterThanOrEqual(1);
    expect(THIRD_PARTY_NOTICES_DATA.totals.missingText).toBeGreaterThanOrEqual(1);
  });

  it('fills missing license ids from canonical texts for mixed-license packages', () => {
    const byKey = new Map(
      THIRD_PARTY_NOTICES_DATA.packages.map((pkg) => [
        `${pkg.ecosystem}:${pkg.name}@${pkg.version}`,
        pkg,
      ]),
    );
    const expectText = (key: string, refKey: string) => {
      const pkg = byKey.get(key);
      expect(pkg, key).toBeDefined();
      expect(pkg?.texts.map((ref) => ref.key)).toContain(refKey);
    };
    expectText('cargo:ident_case@1.0.1', 'spdx:Apache-2.0');
    expectText('cargo:dunce@1.0.5', 'spdx:MIT-0');
    expectText('cargo:dunce@1.0.5', 'spdx:Apache-2.0');
    expectText('npm:@visx/vendor@4.0.0', 'spdx:ISC');
    expectText('npm:@pkgjs/parseargs@0.11.0', 'spdx:MIT');
    // 随包只有部分许可 / 只有声明（指针）的包也必须补齐。
    expectText('npm:pako@1.0.11', 'spdx:Zlib');
    expectText('cargo:siphasher@1.0.3', 'spdx:MIT');
    expectText('cargo:siphasher@1.0.3', 'spdx:Apache-2.0');
    expectText('cargo:brotli-decompressor@5.0.3', 'spdx:MIT');
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

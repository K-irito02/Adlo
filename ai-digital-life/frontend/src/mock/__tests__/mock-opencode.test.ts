import { describe, expect, it } from 'vitest';
import {
  compareOpencodeSemver,
  mergeOpencodeCatalogs,
  mockOpencode,
  parseOpencodePackument,
} from '../mock-opencode';

describe('mockOpencode', () => {
  it(
    'installs, switches and uninstalls versions with fallback selection',
    { timeout: 30000 },
    async () => {
    const before = await mockOpencode.getVersionStatus();
    expect(before.ok && before.data.currentSelected).toBe('1.19.5');

    const unknown = await mockOpencode.installVersion('9.9.9');
    expect(unknown.ok).toBe(false);

    const installed = await mockOpencode.installVersion('1.19.4');
    expect(installed.ok && installed.data).toBe('1.19.4');

    const afterInstall = await mockOpencode.getVersionStatus();
    expect(afterInstall.ok && afterInstall.data.currentSelected).toBe('1.19.4');
    expect(afterInstall.ok && afterInstall.data.installed).toContain('1.19.5');

    const revertUnknown = await mockOpencode.revert('0.0.1');
    expect(revertUnknown.ok).toBe(false);

    const uninstalled = await mockOpencode.uninstall('1.19.4');
    expect(uninstalled.ok && uninstalled.data).toBe(true);
    const afterUninstall = await mockOpencode.getVersionStatus();
    expect(afterUninstall.ok && afterUninstall.data.currentSelected).toBe('1.19.5');
  });

  it('persists the chosen version source and resolves it', async () => {
    const saved = await mockOpencode.saveVersionSource('system');
    expect(saved.ok).toBe(true);
    const source = await mockOpencode.getSourceStatus();
    expect(source.ok && source.data.versionSource.mode).toBe('system');
    expect(source.ok && source.data.versionSource.effective).toBe('none');
    await mockOpencode.saveVersionSource('auto');
  });
});

describe('parseOpencodePackument', () => {
  it('keeps latest 50 stable and latest 50 beta, excluding legacy 0.1.0-beta3', () => {
    const versions: Record<string, unknown> = {};
    for (let i = 1; i <= 60; i += 1) {
      versions[`1.0.${i}`] = {};
    }
    for (let i = 1; i <= 55; i += 1) {
      versions[`0.0.0-beta-202608${String(i).padStart(4, '0')}`] = {};
    }
    versions['0.1.0-beta3'] = {};
    versions['0.0.0-dev-202610280534'] = {};
    const catalog = parseOpencodePackument({
      'dist-tags': { latest: '1.0.60', beta: '0.0.0-beta-2026080055' },
      versions,
      time: {},
    });
    expect(catalog?.stable).toHaveLength(50);
    expect(catalog?.stable[0].version).toBe('1.0.60');
    expect(catalog?.prerelease).toHaveLength(50);
    expect(catalog?.prerelease[0].version).toBe('0.0.0-beta-2026080055');
    expect(catalog?.prerelease.some((hit) => hit.version === '0.1.0-beta3')).toBe(false);
    expect(catalog?.latestPrerelease).toBe('0.0.0-beta-2026080055');
  });

  it('falls back to bucket head when the beta dist-tag was truncated away', () => {
    const catalog = parseOpencodePackument({
      'dist-tags': { latest: '1.0.2', beta: '0.0.0-beta-200001010000' },
      versions: {
        '1.0.2': {},
        '1.0.1': {},
        '0.0.0-beta-202608110357': {},
        '0.0.0-beta-202608110326': {},
      },
      time: { '1.0.2': '2026-10-28T06:17:11.100Z' },
    });
    expect(catalog?.latestStable).toBe('1.0.2');
    expect(catalog?.latestPrerelease).toBe('0.0.0-beta-202608110357');
    expect(catalog?.stable[0].publishedAt).toBe('2026-10-28T06:17:11.100Z');
  });

  it('returns null for malformed packuments so callers fall back to snapshot', () => {
    expect(parseOpencodePackument(null)).toBeNull();
    expect(parseOpencodePackument({})).toBeNull();
  });
});

describe('mergeOpencodeCatalogs', () => {
  it('merges 1.x and 2.x, keeps semver order and dedupes', () => {
    const merged = mergeOpencodeCatalogs([
      {
        stable: [
          { version: '1.19.5', publishedAt: null },
          { version: '1.19.4', publishedAt: null },
        ],
        prerelease: [{ version: '0.0.0-beta-202608110357', publishedAt: null }],
        latestStable: '1.19.5',
        latestPrerelease: '0.0.0-beta-202608110357',
      },
      {
        stable: [
          { version: '2.2.5', publishedAt: null },
          { version: '2.0.0', publishedAt: null },
          { version: '1.19.5', publishedAt: null },
        ],
        prerelease: [{ version: '0.0.0-beta-19507', publishedAt: null }],
        latestStable: '2.2.5',
        latestPrerelease: '0.0.0-beta-19507',
      },
    ]);
    expect(merged.stable.map((hit) => hit.version)).toEqual(['2.2.5', '2.0.0', '1.19.5', '1.19.4']);
    expect(merged.latestStable).toBe('2.2.5');
    expect(merged.prerelease).toHaveLength(2);
    expect(merged.latestPrerelease).toBe('0.0.0-beta-202608110357');
  });
});

describe('compareOpencodeSemver', () => {  it('orders stable above same-core prerelease and beta by timestamp', () => {
    expect(compareOpencodeSemver('1.19.5', '1.19.5')).toBe(0);
    expect(compareOpencodeSemver('1.19.4', '1.19.5')).toBeLessThan(0);
    expect(compareOpencodeSemver('0.0.0-beta-202608110326', '0.0.0-beta-202608110357')).toBeLessThan(0);
  });
});

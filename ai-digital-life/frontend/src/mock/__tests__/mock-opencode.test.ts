import { describe, expect, it } from 'vitest';
import { mockOpencode } from '../mock-opencode';

describe('mockOpencode', () => {
  it('installs, switches and uninstalls versions with fallback selection', async () => {
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

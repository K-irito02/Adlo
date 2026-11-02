import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import { ToolPathsBlock } from '../ToolPathsBlock';

// 与其它设置组测试同构：Proxy 桩文案（返回 key 本身），口径断言直接断 key 名。
const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function dep(patch: Record<string, unknown> = {}) {
  return {
    mode: 'auto',
    effective: 'host',
    origin: 'path',
    installedVersion: '1.0.0',
    baselineVersion: '1.0.0',
    meetsBaseline: true,
    path: 'C:/hosted/1.0.0/bin.exe',
    customPath: '',
    ...patch,
  };
}

function seedStatuses(envPatch: Record<string, unknown> = {}, source: unknown = 'default') {
  const envStatus = {
    node: dep({ path: 'C:/hosted/node/node.exe' }),
    git: dep({ effective: 'none', installedVersion: null, meetsBaseline: false, path: null }),
    bash: dep({ effective: 'system', installedVersion: null, baselineVersion: '', path: null }),
    webview2: {
      mode: 'auto',
      effective: 'system',
      origin: 'registry',
      installedVersion: '140.0.3485.94',
      baselineVersion: '140.0.0.0',
      meetsBaseline: true,
      path: null,
      customPath: '',
    },
    adlserver: dep({ effective: 'system', installedVersion: null, baselineVersion: '' }),
    netprobe: { registryOk: true, registryLatencyMs: 12, ciTokenConfigured: false },
    task: null,
    dataDir: 'C:/data-root',
    dshReady: false,
    ...envPatch,
  };
  const sourceStatus =
    source === 'default'
      ? {
          system: { path: 'C:/tools/dsh.exe', version: '0.2.0' },
          running: null,
          versionSource: {
            mode: 'auto',
            effective: 'host',
            resolvedByMode: { auto: 'host', host: 'host', system: 'none' },
            hostVersion: '0.2.0',
          },
          config: {
            npm_registry: 'https://registry.npmjs.org',
            dsh_mirror: null,
            source_mode: 'manual',
            version_source: 'auto',
            proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
          },
        }
      : source;
  useAppStore.setState({ envStatus, sourceStatus } as never);
}

const categories = [{ key: 'harnesses', path: 'C:/data/harnesses' }] as never;

function renderBlock() {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <ToolPathsBlock categories={categories} />
    </TCopyProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState({ activeSettingsGroup: 'storage' });
});

afterEach(() => {
  cleanup();
  useAppStore.setState({ envStatus: null, sourceStatus: null } as never);
});

describe('ToolPathsBlock', () => {
  it('renders seven rows under the tool-paths anchor with real paths', () => {
    seedStatuses();
    const { container } = renderBlock();
    expect(container.querySelector('[data-settings-anchor="storage:toolPaths"]')).not.toBeNull();
    for (const marker of [
      'environmentDepNode',
      'environmentDepGit',
      'environmentDepBash',
      'environmentDepWebview2',
      'environmentDepAdlserver',
      'settingsDsh',
      'settingsOpencode',
    ]) {
      expect(container.querySelector(`[data-settings-row="${marker}"]`), marker).not.toBeNull();
    }
    expect(screen.getByText('C:/hosted/node/node.exe')).not.toBeNull();
    expect(screen.getByText('C:/data/harnesses/dsh/versions/installed/0.2.0')).not.toBeNull();
    const opencodeRow = container.querySelector('[data-settings-row="settingsOpencode"]');
    expect(opencodeRow?.textContent).toContain('storageToolPathsUnknown');
  });

  it('falls back path → version → detected → unknown (webview2 version-only case)', () => {
    seedStatuses();
    renderBlock();
    // webview2 后端只记版本不记路径：显示版本行（与环境组同口径）。
    expect(screen.getByText('environmentFieldVersion 140.0.3485.94')).not.toBeNull();
    // bash 仅存在性信号：显示已检测。
    const bashRow = document.querySelector('[data-settings-row="environmentDepBash"]');
    expect(bashRow?.textContent).toContain('environmentStatusDetected');
    // git 无效：显示未知。
    const gitRow = document.querySelector('[data-settings-row="environmentDepGit"]');
    expect(gitRow?.textContent).toContain('storageToolPathsUnknown');
  });

  it('dsh row shows unknown before source status, and no-version when loaded without selection', () => {
    seedStatuses({}, null);
    const { unmount } = renderBlock();
    const dshNull = document.querySelector('[data-settings-row="settingsDsh"]');
    expect(dshNull?.textContent).toContain('storageToolPathsUnknown');
    unmount();
    cleanup();
    seedStatuses(
      {},
      {
        system: null,
        running: null,
        versionSource: {
          mode: 'auto',
          effective: 'none',
          resolvedByMode: { auto: 'none', host: 'none', system: 'none' },
          hostVersion: null,
        },
        config: {
          npm_registry: 'https://registry.npmjs.org',
          dsh_mirror: null,
          source_mode: 'manual',
          version_source: 'auto',
          proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
        },
      },
    );
    renderBlock();
    const dshNone = document.querySelector('[data-settings-row="settingsDsh"]');
    expect(dshNone?.textContent).toContain('storageToolPathsNoVersion');
  });

  it('go-to buttons jump to the owning group', () => {
    seedStatuses();
    renderBlock();
    const buttons = screen.getAllByRole('button', { name: 'storageToolPathsGoTo' });
    expect(buttons.length).toBe(7);
    fireEvent.click(buttons[0]);
    expect(useAppStore.getState().activeSettingsGroup).toBe('environment');
    fireEvent.click(buttons[5]);
    expect(useAppStore.getState().activeSettingsGroup).toBe('dsh');
    fireEvent.click(buttons[6]);
    expect(useAppStore.getState().activeSettingsGroup).toBe('opencode');
  });
});

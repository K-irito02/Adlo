import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { DshSourceStatus } from '@shared/ipc/dsh';
import type { OpencodeSourceStatus } from '@shared/ipc/opencode';
import { ToolPathsBlock } from '../ToolPathsBlock';

// 与其它设置组测试同构：Proxy 桩文案（返回 key 本身），口径断言直接断 key 名。
const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

let opencodeSource: OpencodeSourceStatus | null = null;
vi.mock('../../opencode/opencodeVersionBridge', () => ({
  peekOpencodeSource: () => opencodeSource,
}));

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
          config: baseConfig(),
        }
      : source;
  useAppStore.setState({ envStatus, sourceStatus } as never);
}

function baseConfig() {
  return {
    npm_registry: 'https://registry.npmjs.org',
    dsh_mirror: null,
    source_mode: 'manual' as const,
    version_source: 'auto' as const,
    proxy: {
      mode: 'auto' as const,
      http_proxy: null,
      https_proxy: null,
      no_proxy: null,
    },
  };
}

function dshSource(patch: Partial<DshSourceStatus> = {}): DshSourceStatus {
  return {
    system: { path: 'C:/tools/dsh.exe', version: '0.2.0' },
    running: null,
    versionSource: {
      mode: 'auto',
      effective: 'host',
      resolvedByMode: { auto: 'host', host: 'host', system: 'none' },
      hostVersion: '0.2.0',
    },
    config: baseConfig(),
    ...patch,
  };
}

function opencodeStatus(patch: Partial<OpencodeSourceStatus> = {}): OpencodeSourceStatus {
  return {
    system: { path: 'C:/tools/opencode.exe', version: '2.0.0' },
    versionSource: {
      mode: 'auto',
      effective: 'host',
      resolvedByMode: { auto: 'host', host: 'host', system: 'none' },
      hostVersion: '2.2.5',
    },
    config: {
      version_source: 'auto',
      source_mode: 'manual',
      npm_registry: 'https://registry.npmjs.org',
    },
    terminalInjection: true,
    ...patch,
  };
}

function rowText(marker: string): string {
  return document.querySelector(`[data-settings-row="${marker}"]`)?.textContent ?? '';
}

const categories = [{ key: 'harnesses', path: 'C:/data/harnesses' }] as never;

function renderBlock(categoriesArg: unknown = categories) {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <ToolPathsBlock categories={categoriesArg as never} />
    </TCopyProvider>,
  );
}

beforeEach(() => {
  opencodeSource = null;
  useAppStore.setState({ activeSettingsGroup: 'storage' });
});

afterEach(() => {
  cleanup();
  useAppStore.setState({ envStatus: null, sourceStatus: null } as never);
});

describe('ToolPathsBlock', () => {
  it('renders seven rows under the tool-paths anchor with current version paths', () => {
    opencodeSource = opencodeStatus();
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
    expect(screen.getByText('C:/data/harnesses/opencode/versions/installed/2.2.5')).not.toBeNull();
  });

  it('centers the manage button on every row', () => {
    opencodeSource = opencodeStatus();
    seedStatuses();
    renderBlock();
    const rows = Array.from(document.querySelectorAll('[data-testid="tool-paths-item"]'));
    expect(rows.length).toBe(7);
    for (const row of rows) {
      expect(row.classList.contains('adl-settings-row--center')).toBe(true);
    }
  });

  it('falls back path → version → detected → unknown (webview2 version-only case)', () => {
    seedStatuses();
    renderBlock();
    // webview2 后端只记版本不记路径：显示版本行（与环境组同口径）。
    expect(screen.getByText('environmentFieldVersion 140.0.3485.94')).not.toBeNull();
    // bash 仅存在性信号：显示已检测。
    expect(rowText('environmentDepBash')).toContain('environmentStatusDetected');
    // git 无效：显示未知。
    expect(rowText('environmentDepGit')).toContain('storageToolPathsUnknown');
  });

  it('shows unknown before source status, then no-version when loaded without a selection', () => {
    seedStatuses({}, null);
    const { unmount } = renderBlock();
    expect(rowText('settingsDsh')).toContain('storageToolPathsUnknown');
    unmount();
    cleanup();
    seedStatuses(
      {},
      dshSource({
        versionSource: { ...dshSource().versionSource, effective: 'none', hostVersion: null },
      }),
    );
    renderBlock();
    expect(rowText('settingsDsh')).toContain('storageToolPathsNoVersion');
  });

  it('maps dsh effective source to the matching path', () => {
    seedStatuses({}, dshSource());
    const { unmount } = renderBlock();
    expect(screen.getByText('C:/data/harnesses/dsh/versions/installed/0.2.0')).not.toBeNull();
    unmount();
    cleanup();

    seedStatuses(
      {},
      dshSource({
        versionSource: { ...dshSource().versionSource, effective: 'system', hostVersion: null },
      }),
    );
    const system = render(
      <TCopyProvider t={mockT} locale="en-US">
        <ToolPathsBlock categories={categories} />
      </TCopyProvider>,
    );
    expect(screen.getByText('C:/tools/dsh.exe')).not.toBeNull();
    system.unmount();
    cleanup();

    // 外部手动拉起的 DSH：没有可用路径，未知（不能借宿主托管路径冒充当前来源）。
    seedStatuses(
      {},
      dshSource({
        running: { source: 'external', version: null } as never,
        versionSource: { ...dshSource().versionSource, effective: 'running', hostVersion: '0.2.0' },
      }),
    );
    renderBlock();
    expect(rowText('settingsDsh')).toContain('storageToolPathsUnknown');
  });

  it('uses the running version for a host-spawned dsh instead of the selected version', () => {
    seedStatuses(
      {},
      dshSource({
        running: { source: 'host', version: '0.3.0' } as never,
        versionSource: { ...dshSource().versionSource, effective: 'running', hostVersion: '0.2.0' },
      }),
    );
    renderBlock();
    expect(screen.getByText('C:/data/harnesses/dsh/versions/installed/0.3.0')).not.toBeNull();
    expect(screen.queryByText('C:/data/harnesses/dsh/versions/installed/0.2.0')).toBeNull();
  });

  it('omits version-store and system fallbacks when the harness root is unknown', () => {
    opencodeSource = opencodeStatus();
    seedStatuses();
    renderBlock([]);
    expect(screen.queryByText('C:/data/harnesses/opencode/versions/installed/2.2.5')).toBeNull();
    expect(screen.queryByText('C:/tools/dsh.exe')).toBeNull();
    expect(rowText('settingsDsh')).toContain('storageToolPathsUnknown');
    expect(rowText('settingsOpencode')).toContain('storageToolPathsUnknown');
  });

  it('maps opencode source to installed, system, and no-version displays', () => {
    seedStatuses();
    opencodeSource = opencodeStatus();
    const { unmount } = renderBlock();
    expect(screen.getByText('C:/data/harnesses/opencode/versions/installed/2.2.5')).not.toBeNull();
    unmount();
    cleanup();

    opencodeSource = opencodeStatus({
      versionSource: { ...opencodeStatus().versionSource, effective: 'system', hostVersion: null },
    });
    const system = render(
      <TCopyProvider t={mockT} locale="en-US">
        <ToolPathsBlock categories={categories} />
      </TCopyProvider>,
    );
    expect(screen.getByText('C:/tools/opencode.exe')).not.toBeNull();
    system.unmount();
    cleanup();

    opencodeSource = opencodeStatus({
      versionSource: { ...opencodeStatus().versionSource, effective: 'none', hostVersion: null },
    });
    renderBlock();
    expect(rowText('settingsOpencode')).toContain('storageToolPathsNoVersion');
  });

  it('go-to buttons jump to the owning group', () => {
    opencodeSource = opencodeStatus();
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

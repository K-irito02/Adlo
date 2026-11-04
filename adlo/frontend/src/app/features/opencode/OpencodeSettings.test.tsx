import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act, within } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import type { DshVersionStatus } from '../../../shared/ipc/dsh';
import type { OpencodeSourceStatus } from '../../../shared/ipc/opencode';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { commonZh } from '../../i18n/zh-CN/common';
import { dshZh } from '../../i18n/zh-CN/dsh';
import { harnessVersionZh } from '../../i18n/zh-CN/harnessVersion';
import { opencodeZh } from '../../i18n/zh-CN/opencode';
import { opencodeEn } from '../../i18n/en-US/opencode';
import { harnessVersionEn } from '../../i18n/en-US/harnessVersion';
import { settingsZh } from '../../i18n/zh-CN/settings';
import { useAppStore } from '../../stores/slicedStore';
import { OpencodeSettings } from './OpencodeSettings';
import { resetOpencodeSnapshotCache, createOpencodeVersionBridge } from './opencodeVersionBridge';

vi.mock('@features/preview/openByMethod', () => ({
  openUrlByMethod: vi.fn(),
}));

const testSource = vi.fn();
const saveSourceConfig = vi.fn();

vi.mock('@hooks/useAppActions', () => ({
  useAppActions: () => ({
    testSource: (...args: unknown[]) => testSource(...args),
    saveSourceConfig: (...args: unknown[]) => saveSourceConfig(...args),
  }),
}));

const t = {
  ...commonZh,
  ...settingsZh,
  ...dshZh,
  ...harnessVersionZh,
  ...opencodeZh,
} as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={t} locale="zh-CN">
      {children}
    </TCopyProvider>
  );
}

const ok = <T,>(data: T) => ({ ok: true as const, data });

function makeStatus(overrides: Partial<DshVersionStatus> = {}): DshVersionStatus {
  return {
    currentSelected: '1.0.0',
    installed: ['1.0.0'],
    latestAvailable: '1.1.0',
    hasUpdate: true,
    prereleaseAvailable: '1.2.0-beta',
    hasPrereleaseUpdate: true,
    prereleaseUnknown: false,
    ...overrides,
  };
}

function makeSource(
  mode: 'auto' | 'system' | 'host' = 'auto',
  effective: 'host' | 'system' | 'none' = 'host',
): OpencodeSourceStatus {
  const resolved = effective === 'host' ? 'host' : effective;
  return {
    system: null,
    versionSource: {
      mode,
      effective,
      resolvedByMode: { auto: resolved, host: 'host', system: 'system' },
      hostVersion: '1.0.0',
    },
    config: {
      version_source: mode,
      source_mode: 'auto',
      npm_registry: 'https://registry.npmjs.org',
    },
    terminalInjection: true,
  };
}

function installBridge(source: OpencodeSourceStatus, status: DshVersionStatus) {
  const bridge = {
    getVersionStatus: vi.fn(async () => ok(status)),
    getVersionCatalog: vi.fn(async () =>
      ok({
        stable: [
          { version: '1.1.0', publishedAt: null },
          { version: '1.0.0', publishedAt: null },
        ],
        prerelease: [{ version: '1.2.0-beta', publishedAt: null }],
        latestStable: '1.1.0',
        latestPrerelease: '1.2.0-beta',
      }),
    ),
    getSourceStatus: vi.fn(async () => ok(source)),
    getVersionTask: vi.fn(async () => ok({ task: null })),
    installVersion: vi.fn(async () => ok('1.1.0')),
    update: vi.fn(async () => ok('1.1.0')),
    revert: vi.fn(async () => ok('1.0.0')),
    uninstall: vi.fn(async () => ok(true)),
    reinstall: vi.fn(async () => ok('1.0.0')),
    saveVersionSource: vi.fn(async () => ok(true)),
    setTerminalInjection: vi.fn(async () => ok(true)),
    cancelVersionTask: vi.fn(async () => ok(true)),
  };
  (window as unknown as { digitalLife?: unknown }).digitalLife = { opencode: bridge };
  return bridge;
}

beforeEach(() => {
  resetOpencodeSnapshotCache();
  window.localStorage?.clear();
  useAppStore.setState({
    sourceStatus: null,
    opencodeGroupResetPending: false,
    opencodeBlocksAtDefault: null,
  });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { digitalLife?: unknown }).digitalLife;
  vi.clearAllMocks();
});

describe('OpencodeSettings DSH parity (generic card slots)', () => {
  it('渲染改名后的文案：自动检测/正式版本/预发布版本/检查更新/开关', async () => {
    installBridge(makeSource(), makeStatus({ currentSelected: null, installed: [] }));
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    // 版本来源下拉默认自动检测（新文案）
    expect(await screen.findByText('自动检测')).toBeTruthy();
    expect(screen.getByText('正式版本')).toBeTruthy();
    expect(screen.getByText('预发布版本')).toBeTruthy();
    // 检查更新只显示检查按钮（check 语义，不再是"更新到最新"）
    expect(screen.getByRole('button', { name: '检查更新' })).toBeTruthy();
    expect(screen.queryByText('更新到最新')).toBeNull();
    expect(screen.queryByText('稳定版')).toBeNull();
    // 未安装时只显示未安装，不带生效来源小字
    expect(screen.getByText('未安装')).toBeTruthy();
    expect(screen.queryByText(/当前生效来源/)).toBeNull();
    // 终端开关：新名称 + role=switch（复选框已替换）
    const toggle = screen.getByRole('switch', { name: '新终端窗口自动启用' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    // 官方版本信息行 + 当前下载源卡
    expect(screen.getByText('官方版本信息')).toBeTruthy();
    expect(screen.getByText('npm 包页面')).toBeTruthy();
    expect(screen.getByText('GitHub Releases')).toBeTruthy();
    expect(screen.getByTestId('opencode-source-summary-card')).toBeTruthy();
  });

  it('自动检测解析为宿主托管时显示「当前实际使用：宿主托管」', async () => {
    installBridge(makeSource('auto', 'host'), makeStatus());
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    expect(await screen.findByText('当前实际使用：宿主托管')).toBeTruthy();
  });

  it('自动检测无任何版本时不显示蓝色来源行，缺失由下方提示说明', async () => {
    installBridge(makeSource('auto', 'none'), makeStatus({ currentSelected: null, installed: [] }));
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText(/请在下方安装一个版本/);
    // 蓝色行只表达「来源」，不表达「有没有可用版本」；解析为 none 时它无话可说，不占位。
    expect(screen.queryByText(/当前实际使用/)).toBeNull();
    expect(screen.queryByText(/可切换到/)).toBeNull();
  });

  it('系统安装时隐藏当前版本/检查更新/正式版/预发布版与终端开关，并显示托管说明', async () => {
    const source = makeSource('system', 'system');
    source.system = { path: '/usr/local/bin/opencode', version: null };
    installBridge(source, makeStatus());
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('版本来源');
    expect(screen.queryByText('当前版本')).toBeNull();
    expect(screen.queryByText('检查更新')).toBeNull();
    expect(screen.queryByText('正式版本')).toBeNull();
    expect(screen.queryByText('预发布版本')).toBeNull();
    // 系统安装的 CLI 本来就在 PATH 上，宿主侧注入开关同样隐藏。
    expect(screen.queryByRole('switch', { name: '新终端窗口自动启用' })).toBeNull();
    expect(screen.getByText(/本应用不会修改系统安装的版本/)).toBeTruthy();
  });

  it('钉住系统安装但本机无副本：保留当前版本行并显示「未安装」，不冒充宿主选中版本', async () => {
    const source = makeSource('system', 'none');
    source.system = null;
    source.versionSource.resolvedByMode = { auto: 'none', host: 'host', system: 'none' };
    installBridge(source, makeStatus({ currentSelected: '1.19.5', installed: ['1.19.5'] }));
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('版本来源');
    // 当前版本行保留（本次不是系统安装真实生效），但读数必须是「未安装」。
    const currentRow = document.querySelector('[data-settings-row="当前版本"]');
    expect(currentRow).not.toBeNull();
    expect(document.querySelector('.adl-harness-version__readout')?.textContent).toBe('未安装');
    // 管理行仍按「钉住系统安装」隐藏。
    expect(screen.queryByText('检查更新')).toBeNull();
  });

  it('有新版本时在检查更新行显示「新」徽章', async () => {
    installBridge(makeSource(), makeStatus());
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await waitFor(() =>
      expect(document.querySelector('[data-settings-row="检查更新"]')).not.toBeNull(),
    );
    const updateRow = document.querySelector('[data-settings-row="检查更新"]') as HTMLElement;
    await waitFor(() =>
      expect(updateRow.querySelectorAll('.adl-harness-version__update-badge')).toHaveLength(2),
    );
    const badges = updateRow.querySelectorAll('.adl-harness-version__update-badge');
    expect(badges[0].textContent).toContain('新');
    expect(badges[0].textContent).toContain('正式');
    expect(badges[0].textContent).toContain('1.1.0');
    expect(badges[1].textContent).toContain('预发布');
    expect(badges[1].textContent).toContain('1.2.0-beta');
    // 徽章只属于「检查更新」行，当前版本行保持单值。
    const currentRow = document.querySelector('[data-settings-row="当前版本"]') as HTMLElement;
    expect(currentRow.querySelectorAll('.adl-harness-version__update-badge')).toHaveLength(0);
  });

  it('行级刷新按钮点击触发重新加载（检查更新行不再有刷新）', async () => {
    const bridge = installBridge(makeSource(), makeStatus());
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('正式版本');
    const checkRow = document.querySelector('[data-settings-row="检查更新"]') as HTMLElement;
    expect(within(checkRow).queryByRole('button', { name: /^刷新：/ })).toBeNull();
    const callsBefore = bridge.getVersionCatalog.mock.calls.length;
    const refreshBtn = screen.getByRole('button', { name: '刷新：当前版本' });
    fireEvent.click(refreshBtn);
    await waitFor(() =>
      expect(bridge.getVersionCatalog.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it('块级刷新重载整张版本卡', async () => {
    const bridge = installBridge(makeSource(), makeStatus());
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('正式版本');
    const callsBefore = bridge.getVersionCatalog.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '刷新：OpenCode CLI 版本管理' }));
    await waitFor(() =>
      expect(bridge.getVersionCatalog.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it('侧边栏组级恢复：pending 弹框，确认后写回自动+终端启用', async () => {
    const bridge = installBridge(makeSource('host'), makeStatus({ hasUpdate: false }));
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('正式版本');
    act(() => {
      useAppStore.setState({ opencodeGroupResetPending: true });
    });
    expect(await screen.findByText('恢复 OpenCode CLI 全部默认？')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(bridge.saveVersionSource).toHaveBeenCalledWith('auto'));
    await waitFor(() => expect(bridge.setTerminalInjection).toHaveBeenCalledWith(true));
  });

  it('切组重挂命中快照即瞬显：卸载后重挂不画骨架', async () => {
    installBridge(makeSource(), makeStatus());
    const { unmount } = render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('正式版本');
    unmount();
    // 重挂（模拟切组返回）：快照命中，同步瞬显，无需等待 IPC
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    expect(screen.getByText('正式版本')).toBeTruthy();
    expect(screen.queryByLabelText('状态读取中')).toBeNull();
  });
});

describe('opencode search locate parity', () => {
  // 搜索索引 opencode 块用本域行键做定位文案，卡片 DOM 挂通用文案：
  // 两边取值必须逐字相同，否则跳转落点失效。跨键 3 对在此锁定，同键自洽。
  it('row label values match the generic copy rendered by the card', () => {
    expect(opencodeZh.opencodeCurrentVersion).toBe(harnessVersionZh.harnessVersionCurrent);
    expect(opencodeZh.opencodeUpdate).toBe(harnessVersionZh.harnessVersionUpdate);
    expect(opencodeZh.opencodeSourceTitle).toBe(harnessVersionZh.harnessVersionSourceTitle);
    expect(opencodeEn.opencodeCurrentVersion).toBe(harnessVersionEn.harnessVersionCurrent);
    expect(opencodeEn.opencodeUpdate).toBe(harnessVersionEn.harnessVersionUpdate);
    expect(opencodeEn.opencodeSourceTitle).toBe(harnessVersionEn.harnessVersionSourceTitle);
  });
});

describe('opencode version card layout adjustments', () => {
  it('renders only the baseline rows (no system path, manual version or missing banner)', async () => {
    installBridge(makeSource(), makeStatus({ currentSelected: null, installed: [] }));
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('正式版本');

    const rows = [
      ...document.querySelectorAll(
        '.adl-opencode-settings .adl-harness-version .adl-settings-card > .adl-settings-row',
      ),
    ].map((row) => row.getAttribute('data-settings-row'));
    expect(rows).toEqual([
      '版本来源',
      '新终端窗口自动启用',
      '当前版本',
      '检查更新',
      '正式版本',
      '预发布版本',
      '官方版本信息',
    ]);
  });

  it('places the terminal-injection toggle in a vertically centered row', async () => {
    installBridge(makeSource(), makeStatus());
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('正式版本');

    const row = document.querySelector('[data-settings-row="新终端窗口自动启用"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.className).toContain('adl-harness-version__row--center');
  });
});

describe('opencode source summary session cache', () => {
  it('seeds the summary from the cached source before the bridge load resolves', async () => {
    const source = makeSource();
    // 先填充会话缓存（模拟用户之前进过 OpenCode 组）。
    const warm = createOpencodeVersionBridge({
      bridge: {
        getVersionStatus: async () => ok(makeStatus()),
        getVersionCatalog: async () =>
          ok({ stable: [], prerelease: [], latestStable: null, latestPrerelease: null }),
        getSourceStatus: async () => ok(source),
      } as never,
      toolName: 'OpenCode CLI',
      t,
      testSource: async () => null,
      saveSourceConfig: async () => true,
      notify: () => {},
    });
    await warm.load();

    // 本次挂载的 bridge 永不 resolve：摘要只能来自 peek 缓存。
    const bridge = installBridge(source, makeStatus());
    bridge.getVersionStatus = vi.fn(() => new Promise(() => {}));
    bridge.getVersionCatalog = vi.fn(() => new Promise(() => {}));
    bridge.getSourceStatus = vi.fn(() => new Promise(() => {}));
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );

    const card = await screen.findByTestId('opencode-source-summary-card');
    expect(within(card).getByText(/registry\.npmjs\.org/)).toBeInTheDocument();
    expect(within(card).queryByText(dshZh.dshSourceSummaryUnavailable)).toBeNull();
  });
});

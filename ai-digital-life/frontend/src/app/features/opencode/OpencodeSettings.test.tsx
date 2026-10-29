import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import type { DshVersionCatalog, DshVersionStatus } from '../../../shared/ipc/dsh';
import type { OpencodeSourceStatus } from '../../../shared/ipc/opencode';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { dshZh } from '../../i18n/zh-CN/dsh';
import { opencodeZh } from '../../i18n/zh-CN/opencode';
import { useAppStore } from '../../stores/slicedStore';
import { OpencodeSettings } from './OpencodeSettings';
import { resetOpencodeSettingsCache } from './opencodeStatusCache';

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
  ...dshZh,
  ...opencodeZh,
  settingsResetComplete: 'reset-done',
  settingsResetGroupConfirmTitle: 'confirm {group}',
  settingsResetGroupConfirmMessage: 'confirm {group} message',
  confirm: 'confirm',
  cancel: 'cancel',
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

function makeCatalog(): DshVersionCatalog {
  return {
    stable: [
      { version: '1.1.0', publishedAt: null },
      { version: '1.0.0', publishedAt: null },
    ],
    prerelease: [{ version: '1.2.0-beta', publishedAt: null }],
    latestStable: '1.1.0',
    latestPrerelease: '1.2.0-beta',
  };
}

function makeSource(
  mode: 'auto' | 'system' | 'host' = 'auto',
  effective: 'host' | 'system' | 'none' = 'host',
): OpencodeSourceStatus {
  return {
    system: null,
    versionSource: {
      mode,
      effective,
      resolvedByMode: {
        auto: effective === 'host' ? 'host' : effective,
        system: 'system',
        host: 'host',
      },
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
    getVersionCatalog: vi.fn(async () => ok(makeCatalog())),
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
  resetOpencodeSettingsCache();
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

describe('OpencodeSettings DSH parity', () => {
  it('渲染改名后的文案：自动检测/正式版本/预发布版本/检查更新/开关', async () => {
    installBridge(makeSource(), makeStatus({ currentSelected: null, installed: [] }));
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    // 版本来源下拉默认自动检测（新文案），无旧「自动」选项
    const select = await screen.findByDisplayValue('自动检测');
    expect(select).toBeTruthy();
    expect(screen.getByText('正式版本')).toBeTruthy();
    expect(screen.getByText('预发布版本')).toBeTruthy();
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
    // 每行问号 + 下方小字
    expect(screen.getByText('选择 OpenCode CLI 版本的来源')).toBeTruthy();
    // 官方版本信息行 + 当前下载源卡
    expect(screen.getByText('官方版本信息')).toBeTruthy();
    expect(screen.getByText('npm 包页面')).toBeTruthy();
    expect(screen.getByText('GitHub Releases')).toBeTruthy();
  });

  it('系统安装时隐藏检查更新/正式版/预发布版/指定版本并显示托管说明', async () => {
    const source = makeSource('system', 'system');
    source.system = { path: '/usr/local/bin/opencode', version: null };
    installBridge(source, makeStatus());
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('系统安装位置');
    expect(screen.queryByText('检查更新')).toBeNull();
    // 正式版本/预发布版本行隐藏（标题行级），但来源行仍在
    expect(screen.queryByText('指定版本')).toBeNull();
    expect(screen.getByText(/本应用不会修改它/)).toBeTruthy();
  });

  it('有新版本时当前版本标题下方显示蓝色提示小字', async () => {
    installBridge(makeSource(), makeStatus());
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    expect(await screen.findByText('发现正式版本 1.1.0')).toBeTruthy();
    expect(screen.getByText('发现预发布版本 1.2.0-beta')).toBeTruthy();
  });

  it('刷新按钮点击触发对应腿重新加载', async () => {
    const bridge = installBridge(makeSource(), makeStatus());
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('正式版本');
    const callsBefore = bridge.getVersionCatalog.mock.calls.length;
    const refreshBtn = screen.getByRole('button', { name: '重新加载：正式版本' });
    fireEvent.click(refreshBtn);
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
    expect(await screen.findByText('confirm OpenCode CLI')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() => expect(bridge.saveVersionSource).toHaveBeenCalledWith('auto'));
    await waitFor(() => expect(bridge.setTerminalInjection).toHaveBeenCalledWith(true));
  });

  it('切组重挂命中缓存即瞬显：卸载后重挂不画骨架', async () => {
    installBridge(makeSource(), makeStatus());
    const { unmount } = render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    await screen.findByText('正式版本');
    unmount();
    // 重挂（模拟切组返回）：缓存命中，同步瞬显，无需等待 IPC
    render(
      <TestProvider>
        <OpencodeSettings />
      </TestProvider>,
    );
    expect(screen.getByText('正式版本')).toBeTruthy();
    expect(screen.queryByLabelText('状态读取中')).toBeNull();
  });
});

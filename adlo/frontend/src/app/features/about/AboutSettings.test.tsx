import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import type { AppInfo } from '../../../kernel/types';
import { AboutSettings } from './AboutSettings';

const openUrlByMethod = vi.hoisted(() => vi.fn());

vi.mock('@features/preview/openByMethod', () => ({ openUrlByMethod }));

const aboutT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    switch (key) {
      case 'aboutVersion':
        return '版本 {version}';
      case 'aboutAppNameZh':
        return '安洛';
      case 'aboutTagline':
        return '桌面应用宿主，集成第三方 Agent harness。';
      case 'aboutLicenseLine':
        return '基于 MIT 许可证发布。';
      case 'aboutWebsite':
        return '网站';
      case 'aboutRepository':
        return 'GitHub 仓库';
      case 'aboutIssues':
        return '问题反馈';
      case 'aboutLicense':
        return '许可';
      case 'aboutCredits':
        return '致谢';
      case 'aboutCopyright':
        return '© 2026 K-irito02';
      case 'aboutRuntimeTauri':
        return 'Tauri {version}';
      case 'aboutRuntimeBrowser':
        return '浏览器预览';
      case 'aboutEngine':
        return '渲染引擎';
      case 'aboutSystem':
        return '系统';
      case 'aboutUnknown':
        return '未知';
      case 'aboutOpenLogsDir':
        return '打开日志目录';
      case 'aboutLicenseTitle':
        return '许可';
      case 'aboutLicenseSubtitle':
        return 'Adlo 基于 MIT 许可证发布。';
      case 'aboutCreditsTitle':
        return '致谢';
      case 'aboutCreditsSubtitle':
        return 'Adlo 使用了以下字体、开源组件与外部工具。';
      case 'aboutCreditsFonts':
        return '字体';
      case 'aboutCreditsComponents':
        return '开源组件';
      case 'aboutCreditsTools':
        return '外部工具';
      case 'aboutCreditsInter':
        return '界面字体首选。';
      case 'aboutCreditsHarness':
        return '由各自项目提供并维护。';
      case 'operationFailed':
        return '操作失败';
      case 'close':
        return '关闭';
      default:
        return typeof key === 'string' ? key : '';
    }
  },
}) as unknown as CopyDict;

const openPath = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, data: true })));
const getStatus = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    data: { categories: [{ key: 'logs', path: 'C:/adlo/logs' }] },
  })),
);
const showToast = vi.hoisted(() => vi.fn());

function tauriRuntime(): AppInfo['runtime'] {
  return {
    shell: 'tauri',
    tauriVersion: '2.11.5',
    webviewVersion: '141.0.3537.99',
    os: 'windows',
    arch: 'x86_64',
    logDir: 'C:/repo/.adl-logs',
  };
}

function seedStore(runtime: AppInfo['runtime'] = tauriRuntime()) {
  useAppStore.setState({
    appInfo: {
      appName: 'Adlo',
      version: '0.1.0',
      config: {
        language: 'zh-CN',
        themeMode: 'system',
        resolvedTheme: 'light',
        logLevel: 'info',
        terminalLogMode: 'overwrite',
        debugLogMode: 'overwrite',
        maxRecentWorkspaces: 10,
        modelPreferences: { providers: {} },
        keybinds: {},
        fonts: {},
        maxConcurrentWorkspaces: 6,
        workspacePriorityIds: [],
        workspaceDeferredIds: [],
        workspaceNaturalOrder: [],
        browserInactiveTabSuspendMs: 900_000,
        linkOpenMethod: 'panel',
        fileOpenMethod: 'panel',
        agentLinkIntercept: false,
        agentSiteWhitelist: [],
        browserSuspendWhitelistEnabled: false,
        browserSuspendWhitelist: [],
      },
      currentWorkspace: undefined,
      recentLogs: [],
      runtime,
    } as AppInfo,
    showToast,
  });
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    storage: { getStatus },
    window: { openPath },
  };
}

function renderAbout() {
  return render(
    <TCopyProvider t={aboutT} locale="zh-CN">
      <AboutSettings />
    </TCopyProvider>,
  );
}

describe('AboutSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders version, runtime facts and the license line without inventing values', () => {
    renderAbout();

    expect(screen.getByRole('heading', { level: 2, name: /Adlo · 安洛/ })).toBeTruthy();
    expect(screen.getByText('版本 0.1.0')).toBeTruthy();
    expect(screen.getByText('基于 MIT 许可证发布。')).toBeTruthy();
    expect(screen.getByText(/Tauri 2\.11\.5/)).toBeTruthy();
    expect(screen.getByText(/141\.0\.3537\.99/)).toBeTruthy();
    expect(screen.getByText(/Windows · x64/)).toBeTruthy();
    expect(screen.getByText('© 2026 K-irito02')).toBeTruthy();
  });

  it('does not claim a runtime shell when appInfo.runtime is missing', () => {
    const info = useAppStore.getState().appInfo as AppInfo;
    useAppStore.setState({ appInfo: { ...info, runtime: undefined } as unknown as AppInfo });

    const { container } = renderAbout();

    expect(container.textContent).toContain('未知');
    expect(container.textContent).toContain('系统 未知 · 未知');
    expect(container.textContent).not.toContain('浏览器预览');
  });

  it('does not show a version it does not have', () => {
    seedStore({
      shell: 'browser',
      tauriVersion: null,
      webviewVersion: null,
      os: 'windows',
      arch: 'x86_64',
      logDir: '',
    });
    renderAbout();

    expect(screen.getByText(/浏览器预览/)).toBeTruthy();
    expect(screen.getByText(/渲染引擎 未知/)).toBeTruthy();
  });

  it('opens links through openUrlByMethod with the documented destinations', () => {
    renderAbout();

    fireEvent.click(screen.getByText('网站'));
    fireEvent.click(screen.getByText('GitHub 仓库'));
    fireEvent.click(screen.getByText('问题反馈'));

    expect(openUrlByMethod).toHaveBeenNthCalledWith(1, 'https://www.xiaogans.online/');
    expect(openUrlByMethod).toHaveBeenNthCalledWith(2, 'https://github.com/K-irito02/Adlo');
    expect(openUrlByMethod).toHaveBeenNthCalledWith(3, 'https://github.com/K-irito02/Adlo/issues');
  });

  it('shows the MIT license in its own dialog, separate from credits', () => {
    renderAbout();

    fireEvent.click(screen.getByText('许可'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('MIT License');
    expect(dialog.textContent).toContain('Copyright (c) 2026 K-irito02');
    expect(dialog.textContent).not.toContain('Inter');
    // 弹窗不再有底部「关闭」按钮行；右上角 X 是唯一关闭入口。
    expect(dialog.querySelector('.adl-about-dialog__foot')).toBeNull();
    expect(screen.getAllByRole('button', { name: '关闭' })).toHaveLength(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Tab focus inside the dialog', () => {
    renderAbout();

    fireEvent.click(screen.getByText('许可'));
    const closeButton = screen.getByRole('button', { name: '关闭' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);
  });

  it('shows fonts and external tools in the credits dialog only', () => {
    renderAbout();

    fireEvent.click(screen.getByText('致谢'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Inter');
    expect(dialog.textContent).toContain('JetBrains Mono');
    expect(dialog.textContent).toContain('DSH · OpenCode CLI');
    expect(dialog.textContent).not.toContain('MIT License');
  });

  it('keeps only the logs entry in the support row', () => {
    renderAbout();

    expect(screen.getByText('打开日志目录')).toBeTruthy();
    expect(screen.queryByText('复制诊断信息')).toBeNull();
    expect(screen.queryByText('环境')).toBeNull();
  });

  it('opens the effective log directory reported by the runtime', async () => {
    renderAbout();

    fireEvent.click(screen.getByText('打开日志目录'));

    await waitFor(() => expect(openPath).toHaveBeenCalledWith('C:/repo/.adl-logs'));
    expect(getStatus).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('falls back to the storage logs category when runtime logDir is empty', async () => {
    seedStore({ ...tauriRuntime(), logDir: '' });
    renderAbout();

    fireEvent.click(screen.getByText('打开日志目录'));

    await waitFor(() => expect(openPath).toHaveBeenCalledWith('C:/adlo/logs'));
  });
});

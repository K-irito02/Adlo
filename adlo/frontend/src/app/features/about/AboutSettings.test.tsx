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
        return 'Adlo 使用了以下字体、素材、开源项目与外部工具。';
      case 'aboutCreditsFonts':
        return '字体与排版';
      case 'aboutCreditsAssets':
        return '图标与素材';
      case 'aboutCreditsCharts':
        return '图表与可视化';
      case 'aboutCreditsEditors':
        return '编辑器与预览';
      case 'aboutCreditsFramework':
        return '应用框架与基础设施';
      case 'aboutCreditsTools':
        return '外部工具';
      case 'aboutCreditsInter':
        return '界面字体首选。';
      case 'aboutCreditsReactSymbols':
        return '文件类型图标。';
      case 'aboutCreditsBklit':
        return 'Git 可视化图表。';
      case 'aboutCreditsDevicons':
        return '开发者与技术图标。';
      case 'aboutCreditsDsh':
        return '由 DeepSeek 提供并维护。';
      case 'aboutCreditsOpencode':
        return '由其项目提供并维护。';
      case 'aboutCreditsGeneralThanks':
        return '此外，谨向所有作者、维护者与社区致以诚挚感谢。';
      case 'aboutCreditsTrademarkNote':
        return '文中提及的第三方名称与标识归各自所有者。';
      case 'aboutThirdPartyNotices':
        return '第三方声明';
      case 'aboutThirdPartyNoticesTitle':
        return '第三方声明';
      case 'aboutThirdPartyNoticesSubtitle':
        return '随包分发的素材与移植代码的许可声明。';
      case 'aboutNoticeLicenseText':
        return '许可全文';
      case 'aboutNoticeNoCopyright':
        return '上游许可文件未提供版权行';
      case 'aboutNoticeBklit':
        return 'Git 可视化图表组件；部分代码移植并适配。';
      case 'aboutNoticeReactSymbols':
        return '文件类型图标。';
      case 'aboutNoticeUntitledUi':
        return '文件类型图标素材。';
      case 'aboutNoticeDevicons':
        return '开发者与技术图标。';
      case 'aboutThirdPartyNoticesScope':
        return '本版本收录随包分发的素材与移植代码的许可。';
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
        agentSiteRules: [],
        agentSiteOverrides: [],
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

    fireEvent.click(screen.getByText('GitHub 仓库'));
    fireEvent.click(screen.getByText('问题反馈'));

    expect(openUrlByMethod).toHaveBeenNthCalledWith(1, 'https://github.com/K-irito02/Adlo');
    expect(openUrlByMethod).toHaveBeenNthCalledWith(2, 'https://github.com/K-irito02/Adlo/issues');
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

  it('lists fonts, assets, charts, editors, framework and tools in the credits dialog', () => {
    renderAbout();

    fireEvent.click(screen.getByText('致谢'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Inter');
    expect(dialog.textContent).toContain('JetBrains Mono');
    expect(dialog.textContent).toContain('React Symbols');
    expect(dialog.textContent).toContain('Untitled UI');
    expect(dialog.textContent).toContain('Devicons');
    expect(dialog.textContent).toContain('bklit-ui');
    expect(dialog.textContent).toContain('CodeMirror');
    expect(dialog.textContent).toContain('Tauri');
    expect(dialog.textContent).toContain('DSH');
    expect(dialog.textContent).toContain('OpenCode CLI');
    expect(dialog.textContent).toContain('谨向所有作者、维护者与社区致以诚挚感谢');
    expect(dialog.textContent).toContain('第三方名称与标识归各自所有者');
    expect(screen.getAllByText('MIT').length).toBeGreaterThanOrEqual(3);
    expect(dialog.textContent).not.toContain('MIT License');
  });

  it('shows third-party notices with copyright lines and expandable license text', () => {
    renderAbout();

    fireEvent.click(screen.getByText('第三方声明'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('bklit-ui');
    expect(dialog.textContent).toContain('Copyright (c) 2026 uixmat');
    expect(dialog.textContent).toContain('React Symbols');
    expect(dialog.textContent).toContain('Copyright (c) 2022 Pablo Hernández');
    expect(dialog.textContent).toContain('Untitled UI');
    expect(dialog.textContent).toContain('Copyright (c) 2025 Untitled UI');
    expect(dialog.textContent).toContain('上游许可文件未提供版权行');
    expect(dialog.querySelectorAll('details')).toHaveLength(4);
    expect(screen.getAllByText('许可全文')).toHaveLength(4);
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

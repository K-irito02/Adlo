import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import type { AppInfo } from '../../../kernel/types';
import { AboutSettings } from './AboutSettings';

const openUrlByMethod = vi.hoisted(() => vi.fn());
const loadThirdPartyNoticeData = vi.hoisted(() => vi.fn());
const chooseIssueTrackerUrl = vi.hoisted(() => vi.fn());

vi.mock('@features/preview/openByMethod', () => ({ openUrlByMethod }));
vi.mock('./thirdPartyNoticeData', () => ({ loadThirdPartyNoticeData }));
vi.mock('./issueTracker', () => ({ chooseIssueTrackerUrl }));

const noticeData = {
  schemaVersion: 1 as const,
  sources: { cargoLock: 'cargo-sha', pnpmLock: 'npm-sha' },
  totals: { total: 3, npm: 2, cargo: 1, unknownLicense: 1, missingText: 1 },
  licenseTexts: {
    'spdx:MIT': 'MIT License\n\nPermission is hereby granted…',
    'spdx:Apache-2.0': 'Apache License\n\nVersion 2.0, January 2004…',
  },
  packages: [
    {
      name: 'alpha',
      version: '1.0.0',
      ecosystem: 'npm' as const,
      license: 'MIT',
      licenseIds: ['MIT'],
      url: 'https://example.com/alpha',
      copyright: 'Copyright (c) 2024 Alpha',
      texts: [{ label: 'LICENSE', key: 'spdx:MIT' }],
      textSource: 'package' as const,
    },
    {
      name: 'beta',
      version: '2.0.0',
      ecosystem: 'cargo' as const,
      license: 'MIT OR Apache-2.0',
      licenseIds: ['MIT', 'Apache-2.0'],
      texts: [
        { label: 'LICENSE-MIT', key: 'spdx:MIT' },
        { label: 'LICENSE-APACHE', key: 'spdx:Apache-2.0' },
      ],
      textSource: 'package' as const,
    },
    {
      name: 'gamma',
      version: '3.0.0',
      ecosystem: 'npm' as const,
      license: '',
      licenseIds: [],
      texts: [],
      textSource: 'none' as const,
    },
  ],
};

const canonicalData = {
  ...noticeData,
  packages: [
    ...noticeData.packages,
    {
      ...noticeData.packages[0],
      name: 'delta',
      license: 'MIT',
      licenseIds: ['MIT'],
      texts: [{ label: 'MIT', key: 'spdx:MIT' }],
      textSource: 'canonical' as const,
    },
    {
      ...noticeData.packages[1],
      name: 'epsilon',
      license: 'MIT OR Apache-2.0',
      licenseIds: ['MIT', 'Apache-2.0'],
      texts: [
        { label: 'LICENSE-MIT', key: 'spdx:MIT' },
        { label: 'Apache-2.0', key: 'spdx:Apache-2.0' },
      ],
      textSource: 'package' as const,
    },
  ],
  totals: { ...noticeData.totals, total: 5, npm: 3, cargo: 2 },
};

const truncatedData = {
  ...noticeData,
  totals: {
    ...noticeData.totals,
    total: 201,
    npm: 201,
    cargo: 0,
    unknownLicense: 0,
    missingText: 0,
  },
  packages: Array.from({ length: 201 }, (_, index) => ({
    ...noticeData.packages[0],
    name: `pkg-${index}`,
    version: '1.0.0',
  })),
};

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
        return 'GitHub';
      case 'aboutGiteeRepository':
        return 'Gitee';
      case 'aboutIssues':
        return '问题反馈';
      case 'aboutIssuesChecking':
        return '正在选择…';
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
      case 'aboutCreditsEyebrow':
        return 'A LETTER / 2026';
      case 'aboutCreditsSalutation':
        return '致开源社区';
      case 'aboutCreditsLetterBody':
        return 'Adlo · 安洛 建立在开源社区的工作之上。没有这些基础设施，就没有这个应用。';
      case 'aboutCreditsLetterThanks':
        return '感谢每一位作者、维护者与用户。';
      case 'aboutCreditsSignature':
        return '— Adlo · 安洛';
      case 'aboutCreditsThirdPartyNames':
        return '第三方名称';
      case 'aboutCreditsTrademarkNote':
        return '文中提及的第三方名称与标识归各自所有者。';
      case 'aboutThirdPartyNotices':
        return '第三方声明';
      case 'aboutThirdPartyNoticesTitle':
        return '第三方声明';
      case 'aboutThirdPartyNoticesSubtitle':
        return '随包素材、移植代码与全部 npm / Cargo 依赖的许可声明';
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
      case 'aboutNoticeLucide':
        return '部分动画图标的图标来源。';
      case 'aboutNoticesTotals':
        return '共 {total} 项，{unknown} 项未声明许可证，{missing} 项缺许可全文';
      case 'aboutNoticesSearchPlaceholder':
        return '搜索名称、版本、许可证或说明';
      case 'aboutNoticesNoResults':
        return '没有匹配的条目。';
      case 'aboutNoticesLoading':
        return '正在加载依赖清单…';
      case 'aboutNoticesLoadFailed':
        return '依赖清单加载失败，请关闭后重试。';
      case 'aboutNoticesShowingFirst':
        return '仅显示前 {shown} 项（共 {total} 项），请用搜索缩小范围。';
      case 'aboutNoticesUnknownLicense':
        return '未声明许可证';
      case 'aboutNoticesMissingText':
        return '上游未随包提供许可全文。';
      case 'aboutNoticesCanonicalText':
        return '上游未随包提供许可正文，以下为标准许可正文。';
      case 'aboutNoticesCanonicalTextMixed':
        return '上游未随包提供该许可证的正文，以下为标准许可正文。';
      case 'aboutThirdPartyNoticesScope':
        return '清单来自锁文件（含间接依赖）；许可证按上游声明展示，随包提供正文时照录原文，未提供时改用标准许可正文并在正文上方注明。未随包分发的字体与外部工具不在本清单内。';
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
    loadThirdPartyNoticeData.mockResolvedValue(noticeData);
    chooseIssueTrackerUrl.mockResolvedValue('https://gitee.com/K_irito/Adlo/issues');
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

  it('keeps GitHub and Gitee on one row and the issue tracker on its own row', () => {
    // 结构：两行包裹（删掉任一 `.adl-about__links-row` 即变红）。
    // 居中由 `src/styles/about-settings.test.ts` 的 `justify-content: center` 样式锁负责。
    const { container } = renderAbout();
    const rows = Array.from(container.querySelectorAll('.adl-about__links-row'));
    expect(rows).toHaveLength(2);
    const labelsOf = (row: Element) =>
      Array.from(row.querySelectorAll('button.adl-about__link')).map((b) =>
        (b.textContent ?? '').trim(),
      );
    expect(labelsOf(rows[0]!)).toEqual(['GitHub', 'Gitee']);
    expect(labelsOf(rows[1]!)).toEqual(['问题反馈']);
  });

  it('opens GitHub, Gitee and the network-selected issue tracker', async () => {
    chooseIssueTrackerUrl.mockResolvedValue('https://gitee.com/K_irito/Adlo/issues');
    renderAbout();

    fireEvent.click(screen.getByText('GitHub'));
    fireEvent.click(screen.getByText('Gitee'));
    fireEvent.click(screen.getByText('问题反馈'));

    await waitFor(() =>
      expect(openUrlByMethod).toHaveBeenNthCalledWith(3, 'https://gitee.com/K_irito/Adlo/issues'),
    );
    expect(openUrlByMethod).toHaveBeenNthCalledWith(1, 'https://github.com/K-irito02/Adlo');
    expect(openUrlByMethod).toHaveBeenNthCalledWith(2, 'https://gitee.com/K_irito/Adlo');
    expect(chooseIssueTrackerUrl).toHaveBeenCalledTimes(1);
  });

  it('uses the GitHub issue tracker when the probe selects it', async () => {
    chooseIssueTrackerUrl.mockResolvedValue('https://github.com/K-irito02/Adlo/issues');
    renderAbout();

    fireEvent.click(screen.getByText('问题反馈'));

    await waitFor(() =>
      expect(openUrlByMethod).toHaveBeenCalledWith('https://github.com/K-irito02/Adlo/issues'),
    );
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

  it('shows a thank-you letter and a collapsed third-party name index', () => {
    renderAbout();

    fireEvent.click(screen.getByText('致谢'));
    const dialog = screen.getByRole('dialog');
    const letter = dialog.querySelector('.adl-about-credits__letter');
    expect(letter?.textContent).toContain('致开源社区');
    expect(letter?.textContent).toContain('Adlo · 安洛 建立在开源社区的工作之上');
    expect(letter?.textContent).toContain('感谢每一位作者、维护者与用户');
    expect(letter?.textContent).toContain('— Adlo · 安洛');
    expect(dialog.textContent).toContain('第三方名称与标识归各自所有者');

    const toggle = screen.getByRole('button', { name: /第三方名称/ });
    const names = dialog.querySelector('.adl-about-credits__names-list');
    expect(names?.hasAttribute('hidden')).toBe(true);
    const count = Number(dialog.querySelector('.adl-about-credits__names-count')?.textContent);
    expect(count).toBeGreaterThan(1000);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(names?.hasAttribute('hidden')).toBe(false);
    expect(names?.textContent).toContain('react');
    expect(names?.textContent).toContain('bklit-ui');
    expect(names?.textContent).toContain('Inter');
    expect(names?.textContent).toContain('DSH');
    expect(names?.textContent).toContain(' · ');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(names?.hasAttribute('hidden')).toBe(true);
  });

  it('shows a combined hint, a search over curated + generated entries, and a sticky footer', async () => {
    renderAbout();

    fireEvent.click(screen.getByText('第三方声明'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('bklit-ui');
    expect(dialog.textContent).toContain('Copyright (c) 2026 uixmat');
    expect(dialog.textContent).toContain('Lucide');
    expect(dialog.textContent).toContain('Copyright (c) 2026 Lucide Icons and Contributors');
    expect(dialog.textContent).not.toContain('随包素材与移植代码');
    expect(dialog.querySelectorAll('.adl-about-notices__section > h3')).toHaveLength(0);
    expect(dialog.querySelector('.adl-about-dialog__foot')?.textContent).toContain(
      '清单来自锁文件',
    );

    await waitFor(() => expect(dialog.textContent).toContain('alpha'));
    expect(dialog.textContent).not.toContain('依赖清单');
    expect(dialog.textContent).toContain(
      '随包素材、移植代码与全部 npm / Cargo 依赖的许可声明 · 共 3 项，1 项未声明许可证，1 项缺许可全文',
    );
    expect(dialog.textContent).toContain('MIT OR Apache-2.0');
    const gammaRow = Array.from(dialog.querySelectorAll('.adl-about-notice--dependency')).find(
      (row) => row.textContent?.includes('gamma'),
    );
    expect(gammaRow).toBeTruthy();
    expect(gammaRow?.querySelector('.adl-about-notice__license')?.textContent).toBe('未声明许可证');
    expect(gammaRow?.querySelector('.adl-about-notices__missing')).toBeTruthy();
    expect(dialog.textContent).toContain('上游未随包提供许可全文。');
    expect(dialog.textContent).toContain('上游许可文件未提供版权行');
    expect(dialog.textContent).toContain('Copyright (c) 2024 Alpha');
    // 5 条随包声明（含 Lucide）+ alpha 1 + beta 1（gamma 没有正文）。
    expect(dialog.querySelectorAll('details')).toHaveLength(7);

    const search = screen.getByRole('searchbox');
    const top = dialog.querySelector('.adl-about-notices__top');
    expect(top?.querySelector('.adl-about-notices__intro')).toBeTruthy();
    expect(top?.querySelector('.adl-about-notices__search')).toBeTruthy();
    const firstNotice = dialog.querySelector('.adl-about-notice');
    expect(
      firstNotice && search.compareDocumentPosition(firstNotice) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.change(search, { target: { value: 'bklit' } });
    expect(screen.getByText('bklit-ui')).toBeTruthy();
    expect(screen.queryByText('alpha')).toBeNull();

    fireEvent.change(search, { target: { value: 'beta' } });
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.queryByText('bklit-ui')).toBeNull();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('没有匹配的条目。')).toBeTruthy();
  });

  it('shows a load failure and retries when the dialog is reopened', async () => {
    loadThirdPartyNoticeData.mockRejectedValueOnce(new Error('boom'));
    renderAbout();

    fireEvent.click(screen.getByText('第三方声明'));
    let dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain('依赖清单加载失败，请关闭后重试。'));

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByText('第三方声明'));
    dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain('alpha'));
    expect(loadThirdPartyNoticeData).toHaveBeenCalledTimes(2);
  });

  it('shows the truncation, canonical and missing-copyright degradations', async () => {
    loadThirdPartyNoticeData.mockResolvedValueOnce(truncatedData);
    renderAbout();
    fireEvent.click(screen.getByText('第三方声明'));
    let dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain('仅显示前 200 项（共 201 项）'));

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    loadThirdPartyNoticeData.mockResolvedValueOnce(canonicalData);
    fireEvent.click(screen.getByText('第三方声明'));
    dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain('delta'));
    expect(dialog.textContent).toContain('上游未随包提供许可正文，以下为标准许可正文。');
    expect(dialog.textContent).toContain('上游许可文件未提供版权行');

    // 混源包：来源说明只出现在回退的标准正文那一条，随包原文不加。
    const epsilon = Array.from(dialog.querySelectorAll('.adl-about-notice--dependency')).find(
      (row) => row.textContent?.includes('epsilon'),
    );
    expect(epsilon).toBeTruthy();
    const textBlocks = Array.from(epsilon?.querySelectorAll('.adl-about-notices__text') ?? []);
    const blockFor = (label: string) =>
      textBlocks.find(
        (block) => block.querySelector('.adl-about-notices__text-label')?.textContent === label,
      );
    const mixedNote = blockFor('Apache-2.0')?.querySelector('.adl-about-notices__note');
    expect(mixedNote?.textContent).toContain('该许可证的正文');
    expect(blockFor('LICENSE-MIT')?.querySelector('.adl-about-notices__note')).toBeNull();
  });

  it('shows a busy state while the issue tracker is being selected', async () => {
    let resolveChoice: (url: string) => void = () => {};
    chooseIssueTrackerUrl.mockReturnValue(
      new Promise((resolve) => {
        resolveChoice = resolve;
      }),
    );
    renderAbout();

    const issueButton = screen.getByRole('button', { name: '问题反馈' });
    fireEvent.click(issueButton);

    await waitFor(() => expect(issueButton).toBeDisabled());
    expect(issueButton.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('正在选择…')).toBeTruthy();

    resolveChoice('https://gitee.com/K_irito/Adlo/issues');
    await waitFor(() =>
      expect(openUrlByMethod).toHaveBeenCalledWith('https://gitee.com/K_irito/Adlo/issues'),
    );
    expect(issueButton).not.toBeDisabled();
  });

  it('keeps summary elements in the dialog focus cycle', () => {
    renderAbout();
    fireEvent.click(screen.getByText('第三方声明'));
    const dialog = screen.getByRole('dialog');
    const summary = dialog.querySelector('summary');
    if (!summary) {
      throw new Error('missing summary');
    }
    summary.focus();
    expect(document.activeElement).toBe(summary);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '关闭' }));
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { STORAGE_CATEGORY_KEYS } from '@shared/ipc/storage';
import { formatBytes } from '@root/design-system/html';
import { settingsEn } from '../../../i18n/en-US/settings';
import { settingsZh } from '../../../i18n/zh-CN/settings';
import { CATEGORY_COPY } from '../storageCategoryCopy';
import { StorageSettings } from '../StorageSettings';
import {
  getCachedStorageStatus,
  getCachedTreeStats,
  prefetchStorageSettings,
  resetStorageSettingsCache,
  setCachedStorageStatus,
} from '../storageStatusCache';
import { formatMinutesForUnit, treeTtlMinutesFromCustom } from '../treeCacheTtl';
import { useAppStore } from '@stores/slicedStore';

const status = {
  mode: 'unified' as const,
  root: 'C:/Users/u/AppData/Roaming/app',
  // 与 root 刻意不同：root === defaultRoot 会禁用核心恢复按钮（历史教训）；
  // isWellFormedStatus 要求 defaultRoot 为字符串，故 fixture 必须带合法值。
  defaultRoot: 'D:/AppDefaults/ai-digital-life',
  locatorPath: 'C:/Users/u/AppData/Roaming/ai-digital-life/storage-locator.json',
  categories: STORAGE_CATEGORY_KEYS.map((key) => ({
    key,
    path: `C:/data/${key}`,
    movable: key !== 'downloads_default',
    exists: true,
    bytes: 1024,
    files: 2,
    foreignFiles: [],
  })),
  pending: null,
  lastReport: null,
};

beforeEach(() => {
  // 模块级进场缓存跨用例泄漏会让「首帧加载态」类断言失真：每例冷启动。
  resetStorageSettingsCache();
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    storage: {
      getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
      scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      preflight: vi.fn(),
      setPaths: vi.fn(),
      cancelPending: vi.fn(),
      restartApp: vi.fn(),
      getTreeCacheStats: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          workspaceCount: 0,
          totalBytes: 0,
          oldestCapturedAt: null,
          newestCapturedAt: null,
          enabled: true,
          ttlMinutes: 15,
        },
      }),
      setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// 与其它设置组测试同构：用 Proxy 桩文案（返回 key 本身）避免依赖完整 i18n 词典。
const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function renderSettings(t: CopyDict = mockT) {
  return render(
    <TCopyProvider t={t} locale="en-US">
      <StorageSettings />
    </TCopyProvider>,
  );
}

/** 块上方「恢复 核心数据路径 全部默认」图标按钮。 */
function headerResetButton(): HTMLElement | null {
  return document.querySelector('[data-testid="storage-reset-defaults"]');
}

/** 设置 store 的 appInfo 播种（WorkspaceSettings.test.ts 同构的全量 config 字面量）。 */
function setStoreAppInfo() {
  useAppStore.setState({
    appInfo: {
      appName: 'test',
      version: '0.0.0',
      config: {
        language: 'en-US',
        themeMode: 'system',
        resolvedTheme: 'light',
        logLevel: 'info',
        terminalLogMode: 'overwrite',
        debugLogMode: 'overwrite',
        maxRecentWorkspaces: 5,
        modelPreferences: { providers: {} },
        keybinds: {},
        fonts: { uiFont: '', codeFont: '', terminalFont: '' },
        maxConcurrentWorkspaces: 6,
        workspacePriorityIds: [],
        workspaceDeferredIds: [],
        workspaceNaturalOrder: [],
        browserInactiveTabSuspendMs: 3_600_000,
        linkOpenMethod: 'panel',
        fileOpenMethod: 'panel',
        agentLinkIntercept: false,
        agentSiteWhitelist: [],
      },
      currentWorkspace: undefined,
      recentLogs: [],
    },
  });
}

/** 下载 store 播种（含已加载标记；未知态用例显式覆盖为 false）。 */
function setStoreDownloadSettings(defaultPath: string, autoMigrate: boolean, loaded = true) {
  useAppStore.setState({
    downloadSettings: {
      mode: 'ask',
      default_path: defaultPath,
      auto_migrate_on_path_change: autoMigrate,
    },
    downloadSettingsLoaded: loaded,
  });
}

/** 插值断言专用：加载失败文案带 `{error}` 占位，其余 key 回退为 key 本身。 */
const interpT = new Proxy({} as Record<string, string>, {
  get: (_, key) =>
    key === 'storageStatusLoadFailed' ? 'LOAD FAILED: {error}' : typeof key === 'string' ? key : '',
}) as unknown as CopyDict;

describe('StorageSettings', () => {
  it('lays out loaded content as editorial settings cards', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const cards = document.querySelectorAll('.adl-settings-card');
    expect(cards.length).toBeGreaterThanOrEqual(3);
    // 合并后的「核心数据路径」块：顶部为 恢复默认图标 + 主标题（在块上方的 header 容器内）。
    const header = document.querySelector('.adl-storage-settings > .adl-settings-storage__header');
    expect(header).not.toBeNull();
    expect(header?.querySelector('.adl-settings-header')).not.toBeNull();
    expect(header?.querySelector('[data-testid="storage-reset-defaults"]')).not.toBeNull();
  });

  it('renders the download path block as its own card with a section header', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const downloadHeader = document
      .querySelector('[data-testid="download-path-reset"]')
      ?.closest('.adl-settings-storage__header');
    expect(downloadHeader).not.toBeNull();
    expect(downloadHeader?.classList.contains('adl-settings-storage__header--section')).toBe(true);

    const downloadCard = downloadHeader?.nextElementSibling;
    expect(downloadCard?.classList.contains('adl-settings-card')).toBe(true);
    expect(downloadCard?.querySelector('[data-testid="download-path-row"]')).not.toBeNull();
    expect(downloadCard?.querySelector('[data-testid="download-migrate-row"]')).not.toBeNull();
  });

  it('download path reset opens a confirm dialog reflecting migrate state', async () => {
    // 未更改禁用语义下默认即禁用：播种偏离路径使按钮可用（只改 default_path，
    // 迁移开关保持关闭，断言文案仍为 off 版）。
    const prevDownloadSettings = useAppStore.getState().downloadSettings;
    setStoreDownloadSettings('D:/custom-downloads', false);
    try {
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      fireEvent.click(screen.getByTestId('download-path-reset'));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('storageDownloadResetTitle')).toBeTruthy();
      // 默认未开启迁移 → off 文案。
      expect(within(dialog).getByText('storageDownloadResetConfirmMigrateOff')).toBeTruthy();
      // 确认与「取消」同款 secondary（无品牌蓝填充）。
      const confirmBtn = within(dialog).getByRole('button', {
        name: 'storageDownloadResetConfirmBtn',
      });
      expect(confirmBtn.className).toContain('adl-btn--secondary');
      expect(confirmBtn.className).not.toContain('adl-btn--primary');
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageCancel' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      useAppStore.setState({ downloadSettings: prevDownloadSettings });
    }
  });

  it('download block reset also restores the auto-migrate switch to off', async () => {
    const prevDownloadSettings = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    const prevChangeDownloadPath = useAppStore.getState().changeDownloadPath;
    const prevUpdateDownloadSettings = useAppStore.getState().updateDownloadSettings;
    const changeDownloadPath = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const updateDownloadSettings = vi.fn(async () => ({ ok: true as const, data: undefined }));
    setStoreDownloadSettings('D:/custom-downloads', true);
    useAppStore.setState({ changeDownloadPath, updateDownloadSettings });
    try {
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      fireEvent.click(screen.getByTestId('download-path-reset'));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'storageDownloadResetConfirmBtn' }),
      );
      await waitFor(() => {
        expect(changeDownloadPath).toHaveBeenCalledWith('', true);
      });
      // 开关复位与搬迁解耦：恢复默认同时关闭自动迁移。
      expect(updateDownloadSettings).toHaveBeenCalledWith(undefined, undefined, false);
    } finally {
      useAppStore.setState({
        downloadSettings: prevDownloadSettings,
        downloadSettingsLoaded: prevLoaded,
        changeDownloadPath: prevChangeDownloadPath,
        updateDownloadSettings: prevUpdateDownloadSettings,
      });
    }
  });

  it('download block reset still resets the switch when the move fails and keeps the dialog open', async () => {
    const prevDownloadSettings = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    const prevChangeDownloadPath = useAppStore.getState().changeDownloadPath;
    const prevUpdateDownloadSettings = useAppStore.getState().updateDownloadSettings;
    const changeDownloadPath = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'Internal', message: 'boom' },
    }));
    const updateDownloadSettings = vi.fn(async () => ({ ok: true as const, data: undefined }));
    setStoreDownloadSettings('D:/custom-downloads', true);
    useAppStore.setState({ changeDownloadPath, updateDownloadSettings });
    try {
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      fireEvent.click(screen.getByTestId('download-path-reset'));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'storageDownloadResetConfirmBtn' }),
      );
      await waitFor(() => {
        expect(updateDownloadSettings).toHaveBeenCalledWith(undefined, undefined, false);
      });
      expect(screen.queryByRole('dialog')).not.toBeNull();
    } finally {
      useAppStore.setState({
        downloadSettings: prevDownloadSettings,
        downloadSettingsLoaded: prevLoaded,
        changeDownloadPath: prevChangeDownloadPath,
        updateDownloadSettings: prevUpdateDownloadSettings,
      });
    }
  });

  it('download block reset keeps the dialog open when the switch reset fails', async () => {
    const prevDownloadSettings = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    const prevChangeDownloadPath = useAppStore.getState().changeDownloadPath;
    const prevUpdateDownloadSettings = useAppStore.getState().updateDownloadSettings;
    const changeDownloadPath = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const updateDownloadSettings = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'Internal', message: 'boom' },
    }));
    setStoreDownloadSettings('D:/custom-downloads', false);
    useAppStore.setState({ changeDownloadPath, updateDownloadSettings });
    try {
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      fireEvent.click(screen.getByTestId('download-path-reset'));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'storageDownloadResetConfirmBtn' }),
      );
      await waitFor(() => {
        expect(updateDownloadSettings).toHaveBeenCalledWith(undefined, undefined, false);
      });
      expect(screen.queryByRole('dialog')).not.toBeNull();
    } finally {
      useAppStore.setState({
        downloadSettings: prevDownloadSettings,
        downloadSettingsLoaded: prevLoaded,
        changeDownloadPath: prevChangeDownloadPath,
        updateDownloadSettings: prevUpdateDownloadSettings,
      });
    }
  });

  it('keeps download reset enabled when settings never loaded', async () => {
    const prevDownloadSettings = useAppStore.getState().downloadSettings;
    setStoreDownloadSettings('', false, false);
    try {
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      expect(screen.getByTestId('download-path-reset')).not.toBeDisabled();
    } finally {
      useAppStore.setState({ downloadSettings: prevDownloadSettings });
    }
  });

  it('renders the restore-default trigger with the reset group label', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const refresh = headerResetButton();
    expect(refresh).not.toBeNull();
    // mockT 桩文案回退为 key 本身：aria-label 由 settingsResetGroupToDefault + 标题拼接。
    expect(refresh?.getAttribute('aria-label')).toBe('settingsResetGroupToDefault');
  });

  it('restoring defaults resets drafts and opens the migration flow with a default patch', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const reset = headerResetButton();
    expect(reset).not.toBeNull();
    fireEvent.click(reset as HTMLElement);
    await waitFor(() => {
      expect(preflight).toHaveBeenCalledTimes(1);
    });
    // 恢复默认补丁 = 统一根 + 空根（后端视为默认根）+ 无逐类覆盖 + 不保留源。
    expect(preflight).toHaveBeenCalledWith({
      mode: 'unified',
      root: '',
      categories: {},
      retainSource: false,
    });
    // 草稿已重置：UI 上的数据根目录输入框被清空（后端将空视为默认根）。
    expect(
      (screen.getByRole('textbox', { name: 'storageManualInput' }) as HTMLInputElement).value,
    ).toBe('');
    // 进入迁移对话框（冲突/确认即此对话框，不额外二次确认）。
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('restoring defaults refills the root input with the resolved default after migration', async () => {
    const freshRoot = 'D:/fresh-default-root';
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    const setPaths = vi.fn().mockResolvedValue({
      ok: true,
      data: { preflight: { ok: true }, restartRequired: false },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: { ...status, root: freshRoot } }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths,
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    fireEvent.click(headerResetButton() as HTMLElement);
    await waitFor(() => {
      expect(preflight).toHaveBeenCalledTimes(1);
    });
    const dialog = await screen.findByRole('dialog');
    // 迁移确认键与「取消」同款 secondary（无品牌蓝填充）。
    const migrateNow = within(dialog).getByRole('button', { name: 'storageMigrateNow' });
    expect(migrateNow.className).toContain('adl-btn--secondary');
    expect(migrateNow.className).not.toContain('adl-btn--primary');
    fireEvent.click(migrateNow);
    await waitFor(() => {
      expect(setPaths).toHaveBeenCalledTimes(1);
    });
    // 落盘成功后用后端解析出的默认根回填：输入框不再空显示，对话框关闭。
    await waitFor(() => {
      expect(
        (screen.getByRole('textbox', { name: 'storageManualInput' }) as HTMLInputElement).value,
      ).toBe(freshRoot);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('places the locator card at the very bottom below the immovables block', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 相对断言（后续加卡不脆断，I6）：locator 卡在不可移动卡之后。
    const immovablesCard = screen
      .getAllByTestId('storage-immutable-item')[0]
      ?.closest('.adl-settings-card');
    const locatorCard = screen.getByTestId('storage-locator-card');
    if (!immovablesCard) {
      throw new Error('immovables card not found');
    }
    expect(
      immovablesCard.compareDocumentPosition(locatorCard) & Node.DOCUMENT_POSITION_FOLLOWING,
      'locator card should follow the immovables card',
    ).toBeTruthy();
  });

  it('renders the pending/report block as the first block above the core paths block', () => {
    // 事项 11a：pending 提示 + 上次迁移报告同块上移为第一块，块头带主标题与
    // 装饰性禁用恢复按钮；取消按钮挂专属 class（radius-sm，事项 11b）。
    setCachedStorageStatus({
      ...status,
      defaultRoot: status.root,
      pending: { failed: false, error: null },
      lastReport: {
        at: 1758974400000,
        ok: true,
        switched: true,
        movedFiles: 3,
        movedBytes: 344064,
        removedDirs: [],
        keptDirs: [],
        retained: false,
        error: null,
      },
    });
    renderSettings();
    // 块头主标题（mockT 原样返回 key）与装饰性禁用恢复按钮。
    expect(screen.getByText('storagePendingTaskTitle')).toBeTruthy();
    const pendingReset = document.querySelector('[data-testid="storage-pending-reset"]');
    expect(pendingReset).not.toBeNull();
    expect((pendingReset as HTMLButtonElement).disabled).toBe(true);
    // pending 提示与上次迁移报告同块上移。
    const card = screen.getByTestId('storage-pending-card');
    expect(card.textContent).toContain('storagePendingBanner');
    expect(card.textContent).toContain('storageReportTitle');
    // 相对断言（后续加卡不脆断）：该块在核心数据路径之上，为第一块。
    const coreTitle = screen.getByText('storageCorePathsTitle');
    expect(
      card.compareDocumentPosition(coreTitle) & Node.DOCUMENT_POSITION_FOLLOWING,
      'pending card should precede the core paths block',
    ).toBeTruthy();
    // 取消待迁移按钮使用专属 class（radius-sm，事项 11b）。
    const cancel = screen.getByText('storageCancelPending');
    expect(cancel.className).toContain('adl-settings-pending__cancel');
  });

  it('opens the storage group reset dialog in one step with change list and migrate actions', async () => {
    // 全成功路径：预算/下载/开关写 mock 成功，否则 M5-R 失败保持开框语义会让关框断言落空。
    const prevUpdatePreferences = useAppStore.getState().updatePreferences;
    const prevChangeDownloadPath = useAppStore.getState().changeDownloadPath;
    const prevUpdateDownloadSettings = useAppStore.getState().updateDownloadSettings;
    useAppStore.setState({
      updatePreferences: vi.fn(async () => true),
      changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
      updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
    });
    try {
      const preflight = vi.fn().mockResolvedValue({
        ok: true,
        data: {
          ok: true,
          errors: [],
          warnings: [],
          totalFiles: 0,
          totalBytes: 0,
          freeBytes: 0,
        },
      });
      const setPaths = vi.fn().mockResolvedValue({
        ok: true,
        data: { preflight: { ok: true }, restartRequired: false },
      });
      (window as unknown as { digitalLife: unknown }).digitalLife = {
        storage: {
          getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
          scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
          preflight,
          setPaths,
          cancelPending: vi.fn(),
          restartApp: vi.fn(),
          // 事项 10 后清单逐块过滤：四项都需真实非默认才全部出现 → 树播种非默认。
          getTreeCacheStats: vi.fn().mockResolvedValue({
            ok: true,
            data: {
              workspaceCount: 0,
              totalBytes: 0,
              oldestCapturedAt: null,
              newestCapturedAt: null,
              enabled: false,
              ttlMinutes: 30,
            },
          }),
          setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
          clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        },
      };
      // 真 store 默认即 auto_migrate 关闭 → off 版下载条目；显式未加载态（非默认）。
      useAppStore.setState({
        downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
        downloadSettingsLoaded: false,
      });
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      expect(screen.queryByText('storageGroupResetTitle')).toBeNull();
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('storageGroupResetTitle')).toBeTruthy();
      expect(within(dialog).getByText('storageGroupResetIntro')).toBeTruthy();
      for (const key of [
        'storageGroupResetItemCore',
        'storageGroupResetItemTree',
        'storageGroupResetItemDownloadMigrateOff',
      ]) {
        expect(within(dialog).getByText(key)).toBeTruthy();
      }
      // 预检摘要 + 保留源复选框同框。
      expect(within(dialog).getByText('storageMigrateDialogSummary')).toBeTruthy();
      expect(within(dialog).getByRole('checkbox', { name: 'storageRetainSource' })).toBeTruthy();
      // 三个动作键（取消/下次启动/立即迁移）均为 secondary，无品牌蓝。
      for (const name of ['storageCancel', 'storageMigrateLater', 'storageMigrateNow']) {
        const btn = within(dialog).getByRole('button', { name });
        expect(btn.className).toContain('adl-btn--secondary');
        expect(btn.className).not.toContain('adl-btn--primary');
      }
      // 一步执行：选「下次启动时迁移」，直接落盘（默认补丁 + retain=false + applyNow=false）。
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateLater' }));
      await waitFor(() => {
        expect(setPaths).toHaveBeenCalledTimes(1);
      });
      expect(setPaths).toHaveBeenCalledWith(
        {
          mode: 'unified',
          root: '',
          categories: {},
          retainSource: false,
        },
        false,
      );
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      useAppStore.setState({
        updatePreferences: prevUpdatePreferences,
        changeDownloadPath: prevChangeDownloadPath,
        updateDownloadSettings: prevUpdateDownloadSettings,
      });
    }
  });

  it('group reset migrate-now applies immediately and honors the retain-source checkbox', async () => {
    const prevUpdatePreferences = useAppStore.getState().updatePreferences;
    const prevChangeDownloadPath = useAppStore.getState().changeDownloadPath;
    const prevUpdateDownloadSettings = useAppStore.getState().updateDownloadSettings;
    useAppStore.setState({
      updatePreferences: vi.fn(async () => true),
      changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
      updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
    });
    try {
      const preflight = vi.fn().mockResolvedValue({
        ok: true,
        data: {
          ok: true,
          errors: [],
          warnings: [],
          totalFiles: 0,
          totalBytes: 0,
          freeBytes: 0,
        },
      });
      const setPaths = vi.fn().mockResolvedValue({
        ok: true,
        data: { preflight: { ok: true }, restartRequired: false },
      });
      (window as unknown as { digitalLife: unknown }).digitalLife = {
        storage: {
          getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
          scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
          preflight,
          setPaths,
          cancelPending: vi.fn(),
          restartApp: vi.fn(),
          getTreeCacheStats: vi.fn().mockResolvedValue({
            ok: true,
            data: {
              workspaceCount: 0,
              totalBytes: 0,
              oldestCapturedAt: null,
              newestCapturedAt: null,
              enabled: true,
              ttlMinutes: 15,
            },
          }),
          setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
          clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        },
      };
      useAppStore.setState({
        downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      });
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('checkbox', { name: 'storageRetainSource' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateNow' }));
      await waitFor(() => {
        expect(setPaths).toHaveBeenCalledTimes(1);
      });
      expect(setPaths).toHaveBeenCalledWith(
        {
          mode: 'unified',
          root: '',
          categories: {},
          retainSource: true,
        },
        true,
      );
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      useAppStore.setState({
        updatePreferences: prevUpdatePreferences,
        changeDownloadPath: prevChangeDownloadPath,
        updateDownloadSettings: prevUpdateDownloadSettings,
      });
    }
  });

  it('group reset keeps the dialog open when a leg fails (M5-R)', async () => {
    const showToast = vi.fn();
    const prevShowToast = useAppStore.getState().showToast;
    const prevUpdatePreferences = useAppStore.getState().updatePreferences;
    // 预算写失败 → failed=true：核心落盘成功后只发汇总错误，且对话框保持打开（M5-R）。
    useAppStore.setState({
      showToast,
      updatePreferences: vi.fn(async () => false),
    });
    try {
      const preflight = vi.fn().mockResolvedValue({
        ok: true,
        data: {
          ok: true,
          errors: [],
          warnings: [],
          totalFiles: 0,
          totalBytes: 0,
          freeBytes: 0,
        },
      });
      const setPaths = vi.fn().mockResolvedValue({
        ok: true,
        data: { preflight: { ok: true }, restartRequired: false },
      });
      (window as unknown as { digitalLife: unknown }).digitalLife = {
        storage: {
          getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
          scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
          preflight,
          setPaths,
          cancelPending: vi.fn(),
          restartApp: vi.fn(),
          getTreeCacheStats: vi.fn().mockResolvedValue({
            ok: true,
            data: {
              workspaceCount: 0,
              totalBytes: 0,
              oldestCapturedAt: null,
              newestCapturedAt: null,
              enabled: true,
              ttlMinutes: 15,
            },
          }),
          setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
          clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        },
      };
      useAppStore.setState({
        downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      });
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateLater' }));
      await waitFor(() => {
        expect(setPaths).toHaveBeenCalledTimes(1);
      });
      // 汇总错误已发，且对话框保持打开供检查（不发成功 toast、不关框）。
      await waitFor(() => {
        expect(showToast).toHaveBeenCalledWith('settingsUpdateFailed', 'error');
      });
      expect(showToast).not.toHaveBeenCalledWith('storagePendingBanner', 'success');
      expect(screen.queryByRole('dialog')).not.toBeNull();
    } finally {
      useAppStore.setState({ showToast: prevShowToast, updatePreferences: prevUpdatePreferences });
    }
  });

  it('group reset skips all legs when the core setPaths fails (core-first ordering)', async () => {
    // 核心先行：setPaths 失败即早返，下载搬运等不可逆操作不再执行（closing H-1）。
    const updatePreferences = vi.fn(async () => true);
    const changeDownloadPath = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const updateDownloadSettings = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const setTreeCacheOptions = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const prevUpdatePreferences = useAppStore.getState().updatePreferences;
    const prevChangeDownloadPath = useAppStore.getState().changeDownloadPath;
    const prevUpdateDownloadSettings = useAppStore.getState().updateDownloadSettings;
    useAppStore.setState({ updatePreferences, changeDownloadPath, updateDownloadSettings });
    try {
      const preflight = vi.fn().mockResolvedValue({
        ok: true,
        data: {
          ok: true,
          errors: [],
          warnings: [],
          totalFiles: 0,
          totalBytes: 0,
          freeBytes: 0,
        },
      });
      const setPaths = vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'Internal', message: 'core write rejected' },
      });
      (window as unknown as { digitalLife: unknown }).digitalLife = {
        storage: {
          getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
          scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
          preflight,
          setPaths,
          cancelPending: vi.fn(),
          restartApp: vi.fn(),
          getTreeCacheStats: vi.fn().mockResolvedValue({
            ok: true,
            data: {
              workspaceCount: 0,
              totalBytes: 0,
              oldestCapturedAt: null,
              newestCapturedAt: null,
              enabled: true,
              ttlMinutes: 15,
            },
          }),
          setTreeCacheOptions,
          clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        },
      };
      useAppStore.setState({
        downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: true },
      });
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateLater' }));
      await waitFor(() => {
        expect(setPaths).toHaveBeenCalledTimes(1);
      });
      // 核心失败：预算/树/下载/开关四腿一律不执行，对话框保持打开。
      expect(updatePreferences).not.toHaveBeenCalled();
      expect(changeDownloadPath).not.toHaveBeenCalled();
      expect(updateDownloadSettings).not.toHaveBeenCalled();
      expect(setTreeCacheOptions).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeNull();
    } finally {
      useAppStore.setState({
        updatePreferences: prevUpdatePreferences,
        changeDownloadPath: prevChangeDownloadPath,
        updateDownloadSettings: prevUpdateDownloadSettings,
      });
    }
  });

  it('group reset with failing preflight blocks the migrate actions and shows errors', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: false,
        // 事项 9：结构化 issue；根级问题 category=null → 无分类前缀，原文回退展示。
        errors: [{ category: null, message: 'target unwritable' }],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    const setPaths = vi.fn();
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths,
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    act(() => {
      useAppStore.getState().requestStorageGroupReset();
    });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('target unwritable')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'storageMigrateLater' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'storageMigrateNow' })).toBeDisabled();
    // 取消不落盘（preflight 在开框时已跑一次）。
    fireEvent.click(within(dialog).getByRole('button', { name: 'storageCancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(preflight).toHaveBeenCalledTimes(1);
    expect(setPaths).not.toHaveBeenCalled();
  });

  it('group reset with failing preflight keeps the user draft intact (M1)', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'Internal', message: 'preflight bridge exploded' },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 用户在核心路径块有未保存编辑。
    const rootInput = screen.getByRole('textbox', {
      name: 'storageManualInput',
    }) as HTMLInputElement;
    fireEvent.change(rootInput, { target: { value: 'D:/user-typed-root' } });
    act(() => {
      useAppStore.getState().requestStorageGroupReset();
    });
    await waitFor(() => {
      expect(preflight).toHaveBeenCalledTimes(1);
    });
    // 预检失败：不开组对话框，且用户草稿不被清空（先验后清，M1）。
    expect(screen.queryByText('storageGroupResetTitle')).toBeNull();
    expect(
      (screen.getByRole('textbox', { name: 'storageManualInput' }) as HTMLInputElement).value,
    ).toBe('D:/user-typed-root');
    // pending 已被消费：可再次点击重试。
    expect(useAppStore.getState().storageGroupResetPending).toBe(false);
  });

  it('group reset applies the preflight snapshot patch, not live drafts (M2)', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    const setPaths = vi.fn().mockResolvedValue({
      ok: true,
      data: { preflight: { ok: true }, restartRequired: false },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths,
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    useAppStore.setState({
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
    });
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    act(() => {
      useAppStore.getState().requestStorageGroupReset();
    });
    const dialog = await screen.findByRole('dialog');
    // 对话框无焦点陷阱：后台（DOM 上仍可寻址的）核心路径输入被改动。
    const rootInput = screen.getByRole('textbox', {
      name: 'storageManualInput',
    }) as HTMLInputElement;
    fireEvent.change(rootInput, { target: { value: 'D:/sneaky-edit' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateLater' }));
    await waitFor(() => {
      expect(setPaths).toHaveBeenCalledTimes(1);
    });
    // 落盘仍为开框时预检的默认补丁快照（root:''），不读实时草稿（M2）。
    expect(setPaths).toHaveBeenCalledWith(
      { mode: 'unified', root: '', categories: {}, retainSource: false },
      false,
    );
  });

  it('repeated sidebar signal while the group dialog is open is discarded (H2)', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    useAppStore.setState({
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
    });
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    act(() => {
      useAppStore.getState().requestStorageGroupReset();
    });
    const dialog = await screen.findByRole('dialog');
    expect(preflight).toHaveBeenCalledTimes(1);
    // 已开框时再次点击侧边栏重置：信号被消费丢弃，不重复预检、不并发开框。
    act(() => {
      useAppStore.getState().requestStorageGroupReset();
    });
    await waitFor(() => {
      expect(useAppStore.getState().storageGroupResetPending).toBe(false);
    });
    expect(preflight).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    // 已勾选的保留源不被第二次信号重置。
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'storageRetainSource' }));
    act(() => {
      useAppStore.getState().requestStorageGroupReset();
    });
    await waitFor(() => {
      expect(useAppStore.getState().storageGroupResetPending).toBe(false);
    });
    expect(
      within(screen.getByRole('dialog')).getByRole('checkbox', {
        name: 'storageRetainSource',
      }),
    ).toBeChecked();
    expect(preflight).toHaveBeenCalledTimes(1);
    // 未点迁移键前不得发生任何核心落盘（rev2 I4-N5 要求的 setPaths 断言）。
    expect(
      (window as unknown as { digitalLife: { storage: { setPaths: ReturnType<typeof vi.fn> } } })
        .digitalLife.storage.setPaths,
    ).not.toHaveBeenCalled();
  });

  it('group reset without the storage bridge toasts and does not open the dialog', async () => {
    const showToast = vi.fn();
    const prevShowToast = useAppStore.getState().showToast;
    const prevDigitalLife = (window as unknown as { digitalLife?: unknown }).digitalLife;
    useAppStore.setState({ showToast });
    delete (window as unknown as { digitalLife?: unknown }).digitalLife;
    try {
      renderSettings();
      await waitFor(() => {
        // 无桥：面板进入错误 UI（加载失败），不 hang。
        expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      await waitFor(() => {
        expect(showToast).toHaveBeenCalledWith('storageStatusLoadFailed', 'error');
      });
      expect(useAppStore.getState().storageGroupResetPending).toBe(false);
      expect(screen.queryByText('storageGroupResetTitle')).toBeNull();
    } finally {
      useAppStore.setState({ showToast: prevShowToast });
      (window as unknown as { digitalLife?: unknown }).digitalLife = prevDigitalLife;
    }
  });

  it('falls back to the last known root when refresh fails after group apply (L3)', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    const setPaths = vi.fn().mockResolvedValue({
      ok: true,
      data: { preflight: { ok: true }, restartRequired: false },
    });
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: status })
      .mockResolvedValue({ ok: false, error: { code: 'Internal', message: 'channel closed' } });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus,
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths,
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    useAppStore.setState({
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
    });
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    act(() => {
      useAppStore.getState().requestStorageGroupReset();
    });
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateLater' }));
    await waitFor(() => {
      expect(setPaths).toHaveBeenCalledTimes(1);
    });
    // refresh 失败（第 2 次 getStatus 非 ok）→ 回填上次已知根，不空显示（L3）。
    await waitFor(() => {
      expect(
        (screen.getByRole('textbox', { name: 'storageManualInput' }) as HTMLInputElement).value,
      ).toBe(status.root);
    });
  });

  it('discards the group reset signal while the tree confirm dialog is open (guard regression)', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    useAppStore.setState({
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
    });
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 打开树缓存清除确认框（树确认开着时守卫应丢弃组信号，rev4 A3）。
    fireEvent.click(screen.getByTestId('tree-cache-clear'));
    await screen.findByRole('dialog');
    act(() => {
      useAppStore.getState().requestStorageGroupReset();
    });
    await waitFor(() => {
      expect(useAppStore.getState().storageGroupResetPending).toBe(false);
    });
    // 不重复预检、不叠加组框：仍只有树确认框一个 dialog。
    expect(preflight).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByText('storageGroupResetTitle')).toBeNull();
  });

  // 注：脏条/底部提交区渲染由 IntersectionObserver 决定（bottomCtaVisible）。jsdom 无 IO，
  // effect 早退使 bottomCtaVisible 恒为 false → 脏条恒渲染，因此以下应用/撤回用例在此稳定成立。
  // 真实浏览器中「底部 CTA 可见时脏条隐藏、滚出后显示」属焦点/可布局契约，须用真实浏览器验证，
  // 不以 jsdom 通过即宣称粘性条正确（mandatory-testing）。
  it('shows the sticky dirty bar when paths change and applies on click', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 未修改：不显示脏提交条。
    expect(screen.queryByTestId('storage-dirtybar')).toBeNull();

    // 修改数据根目录 → 出现粘性提交条。
    const rootInput = screen.getByRole('textbox', { name: 'storageManualInput' });
    fireEvent.change(rootInput, { target: { value: 'D:/new-root' } });
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();

    // 点提交条里的「应用」→ 走迁移流程（preflight）。
    fireEvent.click(
      within(screen.getByTestId('storage-dirtybar')).getByRole('button', {
        name: 'storageApply',
      }),
    );
    await waitFor(() => {
      expect(preflight).toHaveBeenCalledTimes(1);
    });
    // 本用例走 unified 流程：patch 带 rootDraft 草稿（既有语义）。
    const sentPatch = preflight.mock.calls[0][0] as { mode: string; root: string | null };
    expect(sentPatch.mode).toBe('unified');
    expect(sentPatch.root).toBe('D:/new-root');
  });

  it('per-category apply sends current applied root in patch (9: no root fallback)', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 切到每类独立 → 改首个分类路径 → 应用。
    fireEvent.click(screen.getByRole('radio', { name: 'storageModePerCategory' }));
    const pathInputs = screen.getAllByRole('textbox', { name: 'storageManualInput' });
    fireEvent.change(pathInputs[0], { target: { value: 'D:/moved/category' } });
    fireEvent.click(
      within(screen.getByTestId('storage-dirtybar')).getByRole('button', {
        name: 'storageApply',
      }),
    );
    await waitFor(() => {
      expect(preflight).toHaveBeenCalledTimes(1);
    });
    // 事项 9：per_category patch 带当前已应用 root（status.root）而非 null——
    // null 会让 to.root 回落默认根（root-inside「互相包含」误报 + locator 自定义根被静默重置）。
    const sentPatch = preflight.mock.calls[0][0] as {
      mode: string;
      root: string | null;
      categories: Record<string, string>;
    };
    expect(sentPatch.mode).toBe('per_category');
    expect(sentPatch.root).toBe(status.root);
    expect(sentPatch.categories.database).toBe('D:/moved/category');
  });

  it('reverts unsaved path changes via the revert button and clears the dirty bar', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const rootInput = screen.getByRole('textbox', { name: 'storageManualInput' });
    fireEvent.change(rootInput, { target: { value: 'D:/changed' } });
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();

    fireEvent.click(
      within(screen.getByTestId('storage-dirtybar')).getByRole('button', {
        name: 'storageRevert',
      }),
    );
    // 撤回后恢复持久化状态：脏条与底部提交区都不再显示，且不触发 preflight。
    await waitFor(() => {
      expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
    });
    expect(screen.queryByTestId('storage-bottom-cta')).toBeNull();
    expect(preflight).not.toHaveBeenCalled();
    expect((rootInput as HTMLInputElement).value).toBe(status.root);
  });

  it('moves hint triggers before their titles for mode, root and locator rows', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 所有 info 触发器（mode/root/category×10/locator）数量 >= 13。
    const infos = Array.from(document.querySelectorAll('.adl-icon-button--info'));
    expect(infos.length).toBeGreaterThanOrEqual(13);
    // 名实相副：凡是位于「标题行 label-text 容器」内的 info 触发器，都必须位于紧随其后的
    // 标题 <span> 之前（前置）。模式/根目录/逐类行均可被该排序断言真实覆盖。
    let titleRowsChecked = 0;
    for (const info of infos) {
      const labelText = info.closest('.adl-settings-row__label-text');
      if (!labelText) {
        continue; // 无 label-text 容器的图标行（如不可移动条目）不参与排序断言。
      }
      // 标题 = label-text 内、按钮外、可见文本非空的 span（避开 HintCardTrigger 的包裹 span）。
      const title = Array.from(labelText.querySelectorAll('span')).find(
        (s) => !s.closest('button') && (s.textContent ?? '').trim().length > 0,
      );
      // label-text 行必带标题：缺失即结构漂移，直接失败，杜绝静默漏判。
      expect(title, 'every titled row must have a title span to assert ordering').not.toBeNull();
      if (!title) {
        continue;
      }
      // compareDocumentPosition：DOCUMENT_POSITION_FOLLOWING 表示 title 在 info 之后。
      expect(
        info.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
        'hint trigger should precede its title',
      ).toBeTruthy();
      titleRowsChecked += 1;
    }
    // 至少 mode/root/逐类等标题行参与排序断言（不为空跑用例）。
    expect(titleRowsChecked).toBeGreaterThan(0);
  });

  it('renders all visible category rows (default download target hidden)', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 每类都必须有说明（spec §6.4 硬性要求）
    expect(screen.getAllByTestId('storage-category-info')).toHaveLength(10);
  });

  it('opens the hint card with the category description when clicking the info trigger', async () => {
    const realStatus = {
      ...status,
      categories: STORAGE_CATEGORY_KEYS.map((key) => ({
        key,
        path: `C:/data/${key}`,
        movable: key !== 'downloads_default',
        exists: true,
        bytes: 1024,
        files: 2,
        foreignFiles: [],
      })),
    };
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: realStatus }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    const infos = await screen.findAllByTestId('storage-category-info');
    const first = infos[0];
    await act(async () => {
      fireEvent.click(first);
    });
    // mockT 桩文案返回 key 本身：第一个分类（database）的 Desc key 应出现在 hint 卡片中
    // （卡片内容 span 含 desc + related 两段文本，用正则匹配 desc 片段）。
    expect(screen.getByText(/storageCategoryDatabaseDesc/)).toBeTruthy();
  });

  it('lists the six immovable entries', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-immutable-item')).toHaveLength(6);
    });
  });

  it('renders immovable entry names, not only descriptions', async () => {
    renderSettings();
    const items = await screen.findAllByTestId('storage-immutable-item');
    const names = [
      'storageImmutableKeyringName',
      'storageImmutableMachineIdName',
      'storageImmutableLocalStorageName',
      'storageImmutableIndexedDbName',
      'storageImmutableWebview2Name',
      'storageImmutableWorkspaceCacheName',
    ];
    expect(items).toHaveLength(names.length);
    for (const [index, item] of items.entries()) {
      expect(item.textContent).toContain(names[index]);
    }
  });

  it('gives immovables their own block header without a reset button', async () => {
    renderSettings();
    const items = await screen.findAllByTestId('storage-immutable-item');
    expect(items).toHaveLength(6);
    const card = items[0].closest('.adl-settings-card');
    expect(card).not.toBeNull();
    // 卡内无合并小标题：标题已提取为块上方主标题。
    expect(card?.querySelector('h4')).toBeNull();
    const header = card?.previousElementSibling;
    expect(header?.classList.contains('adl-settings-storage__header')).toBe(true);
    expect(header?.classList.contains('adl-settings-storage__header--section')).toBe(true);
    expect(header?.querySelector('.adl-settings-header')).not.toBeNull();
    // 块头有稳定 testid（结构重排不靠 previousElementSibling 脆定位）。
    expect(header?.getAttribute('data-testid')).toBe('immovables-block-header');
    // mockT 桩文案返回 key 本身：主标题即 storageImmutableTitle。
    expect(header?.textContent).toContain('storageImmutableTitle');
    // 不可移动由系统/运行时管理：主标题左侧无恢复默认按钮。
    expect(header?.querySelector('.adl-settings-row__reset')).toBeNull();
    expect(card?.querySelector('.adl-settings-row__reset')).toBeNull();
  });

  it('shows an actionable error when storage status cannot be loaded', async () => {
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: false, error: { message: 'boom' } }),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    // 失败时不渲染空的分类行，避免"标题下无内容"的误导。
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
    // 加载态必须清除（不卡 loading）。
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
  });

  it('shows a load-failed (not timeout) error when the status request rejects', async () => {
    // F3：真实拒绝（channel closed）走加载失败路径，仅计时器走超时文案。
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockRejectedValue(new Error('channel closed')),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryByText('storageStatusTimeout')).toBeNull();
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
  });

  it('shows timeout UI when getStatus never settles (fake timers)', async () => {
    vi.useFakeTimers();
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockImplementation(() => new Promise(() => {})),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    expect(screen.getByText('storageStatusLoading')).toBeTruthy();
    // fake-timers 下 `waitFor` 不推进时钟：用 `act` 包裹推进，避免轮询挂死。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByText('storageStatusTimeout')).toBeTruthy();
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
  });

  it('does not hang when the backend returns a malformed failure without error object', async () => {
    // 回归：真实故障是后端返回裸成功值（有 categories、无 ok，如旧后端未包 IpcResult），
    // 前端 !result.ok 为真后曾在 result.error.message 抛错并卡死 loading。
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({
          mode: 'unified',
          root: 'C:/data',
          locatorPath: 'C:/locator.json',
          categories: [],
          pending: null,
          lastReport: null,
        }),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
    // 畸形体必须打 warn 供排查（T3）。
    expect(warnSpy).toHaveBeenCalled();
  });

  it('surfaces load error without hanging on malformed ok:true without categories (F1)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: { mode: 'unified', root: 'x' } }),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('every real category has non-empty Desc + Related copy (Task-5b)', async () => {
    const realStatus = {
      ...status,
      categories: STORAGE_CATEGORY_KEYS.map((key) => ({
        key,
        path: `C:/data/${key}`,
        movable: key !== 'downloads_default',
        exists: true,
        bytes: 1024,
        files: 2,
        foreignFiles: [],
      })),
    };
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: realStatus }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    const infos = await screen.findAllByTestId('storage-category-info');
    // downloads_default 不占展示行（并入「浏览器下载路径」块），渲染 info 数为 总类数-1。
    expect(infos).toHaveLength(STORAGE_CATEGORY_KEYS.length - 1);
    // 渲染出的每个 ⓘ 触发器都必须带出 Desc 文案：缺 copy 时回退为裸 key。
    for (const [index, info] of infos.entries()) {
      const key = STORAGE_CATEGORY_KEYS[index] as string;
      const label = info.getAttribute('aria-label') ?? '';
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(key);
    }
    // 映射层全覆盖：每类在中英词典中都有非空 Desc + Related。
    for (const key of STORAGE_CATEGORY_KEYS) {
      const copy = CATEGORY_COPY[key];
      expect(copy, `missing CATEGORY_COPY for ${key}`).toBeDefined();
      for (const dict of [settingsEn, settingsZh] as const) {
        const desc = (dict as Record<string, unknown>)[copy.desc];
        const related = (dict as Record<string, unknown>)[copy.related];
        expect(typeof desc === 'string' && desc.length > 0, `${key} Desc empty`).toBe(true);
        expect(typeof related === 'string' && related.length > 0, `${key} Related empty`).toBe(
          true,
        );
      }
    }
  });

  it('shows the original message without warn on a well-formed failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: false, error: { message: 'disk-gone' } }),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    // 规范失败体透传原 message，且不打 warn（warn 仅用于畸形体）。
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('interpolates the backend message into the load-failed text', async () => {
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: false, error: { message: 'disk-gone' } }),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings(interpT);
    await waitFor(() => {
      expect(screen.getByText('LOAD FAILED: disk-gone')).toBeTruthy();
    });
  });

  it('retry stays on error for malformed response, then recovers on well-formed response (T1/F4)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { message: 'first' } })
      .mockResolvedValueOnce({ mode: 'unified', root: 'C:/x', locatorPath: '', categories: [] })
      .mockResolvedValueOnce({ ok: true, data: status });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus,
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);

    // 第一次点击重试：后端返回畸形体（无 ok）→ 仍显示错误、不卡 loading。
    fireEvent.click(screen.getByRole('button', { name: 'storageRetry' }));
    await waitFor(() => {
      expect(getStatus).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    // 第二次点击重试：良构成功 → 错误清除、10 行渲染（F4）。
    fireEvent.click(screen.getByRole('button', { name: 'storageRetry' }));
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    expect(screen.queryByText('storageStatusLoadFailed')).toBeNull();
  });
});

describe('StorageSettings 2026-09-27 decisions lock (mode dirty / core-default group reset)', () => {
  /** 核心已默认态：root === defaultRoot（组恢复跳过核心预检的前置条件）。 */
  const statusAtDefault = { ...status, root: status.defaultRoot };
  const defaultTreeStats = {
    ok: true,
    data: {
      workspaceCount: 0,
      totalBytes: 0,
      oldestCapturedAt: null,
      newestCapturedAt: null,
      enabled: true,
      ttlMinutes: 15,
    },
  };

  function mockStorageBridge(
    opts: {
      statusData?: typeof status;
      preflight?: ReturnType<typeof vi.fn>;
      treeResult?: typeof defaultTreeStats;
    } = {},
  ) {
    const bridge = {
      getStatus: vi.fn().mockResolvedValue({ ok: true, data: opts.statusData ?? status }),
      scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      preflight: opts.preflight ?? vi.fn(),
      setPaths: vi.fn(),
      cancelPending: vi.fn(),
      restartApp: vi.fn(),
      getTreeCacheStats: vi.fn().mockResolvedValue(opts.treeResult ?? defaultTreeStats),
      setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    };
    (window as unknown as { digitalLife: unknown }).digitalLife = { storage: bridge };
    return bridge;
  }

  it('switching the path mode alone is not an edit (no dirty bar); editing a path is', async () => {
    mockStorageBridge();
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
    // 决策 2：单选从「统一根」切到「每类独立」——不落盘的模式切换不算修改。
    fireEvent.click(screen.getByRole('radio', { name: 'storageModePerCategory' }));
    expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
    // 改具体路径值才出现粘性提交条（事项 8：分类行逐键提交——change 即出条，
    // 无需等失焦；与统一根输入行为一致）。
    const pathInputs = screen.getAllByRole('textbox', { name: 'storageManualInput' });
    expect(pathInputs.length).toBeGreaterThan(0);
    fireEvent.change(pathInputs[0], { target: { value: 'D:/moved/category' } });
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();
    // 逐键提交后失焦不重复提交（draft === value 时 commit 为 no-op）。
    fireEvent.blur(pathInputs[0]);
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();
  });

  it('does not commit mid-composition keystrokes, commits on composition end (IME, Phase 4 R2-R8-L1)', async () => {
    mockStorageBridge();
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    fireEvent.click(screen.getByRole('radio', { name: 'storageModePerCategory' }));
    const pathInputs = screen.getAllByRole('textbox', { name: 'storageManualInput' });
    const input = pathInputs[0] as HTMLInputElement;
    // 模拟 IME 组词中（isComposing=true）的 input 事件：不触发 onCommit，
    // 父级草稿不变 → 脏条不出现（本地 draft 仍更新，无需断言）。
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    nativeSetter?.call(input, '拼音');
    fireEvent(input, new window.InputEvent('input', { bubbles: true, isComposing: true }));
    expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
    // 组词结束 → 补提交一次 → 脏条出现。
    fireEvent.compositionEnd(input);
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();
  });

  it('group reset with core at default skips preflight and renders the single-confirm dialog (5/6-F1)', async () => {
    // preflight 桩永不 settle：若被调用，开框会挂住 → 断言未调用即可锁定跳过语义。
    const preflight = vi.fn();
    const bridge = mockStorageBridge({ statusData: statusAtDefault, preflight });
    const prevUpdatePreferences = useAppStore.getState().updatePreferences;
    const prevChangeDownloadPath = useAppStore.getState().changeDownloadPath;
    const prevUpdateDownloadSettings = useAppStore.getState().updateDownloadSettings;
    try {
      useAppStore.setState({
        updatePreferences: vi.fn(async () => true),
        changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
        updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
        downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      });
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      // 事项 5：核心已默认 → 不预检（否则 identical 英文错误 + 双确认键全禁）。
      expect(preflight).not.toHaveBeenCalled();
      // 事项 6-F1：无核心清单项 / 迁移摘要 / retain 复选框 / 预检错误区。
      expect(within(dialog).queryByText('storageGroupResetItemCore')).toBeNull();
      expect(within(dialog).queryByText('storageMigrateDialogSummary')).toBeNull();
      expect(within(dialog).queryByRole('checkbox', { name: 'storageRetainSource' })).toBeNull();
      expect(within(dialog).queryByText('storagePreflightErrors')).toBeNull();
      // 事项 10：树缓存已是默认值（fixture enabled+15min）→ 树项整项不出现；
      // 下载（未加载→非默认）仍列示。
      expect(within(dialog).queryByText('storageGroupResetItemTree')).toBeNull();
      expect(within(dialog).getByText('storageGroupResetItemDownloadMigrateOff')).toBeTruthy();
      // footer 退化为 取消 + 单一确认键（无迁移时机双键）。
      expect(within(dialog).getByRole('button', { name: 'storageGroupResetConfirm' })).toBeTruthy();
      expect(within(dialog).queryByRole('button', { name: 'storageMigrateLater' })).toBeNull();
      expect(within(dialog).queryByRole('button', { name: 'storageMigrateNow' })).toBeNull();
      // 事项 5：开框全程不清草稿 → 无脏条残留；取消后同样无残留。
      expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageCancel' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
      expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
      expect(bridge.setPaths).not.toHaveBeenCalled();
    } finally {
      useAppStore.setState({
        updatePreferences: prevUpdatePreferences,
        changeDownloadPath: prevChangeDownloadPath,
        updateDownloadSettings: prevUpdateDownloadSettings,
      });
    }
  });

  it('group reset confirm with core at default applies the other blocks and skips setPaths (6-F1)', async () => {
    const bridge = mockStorageBridge({ statusData: statusAtDefault });
    const prevUpdatePreferences = useAppStore.getState().updatePreferences;
    const prevChangeDownloadPath = useAppStore.getState().changeDownloadPath;
    const prevUpdateDownloadSettings = useAppStore.getState().updateDownloadSettings;
    const prevShowToast = useAppStore.getState().showToast;
    const showToast = vi.fn();
    try {
      useAppStore.setState({
        updatePreferences: vi.fn(async () => true),
        changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
        updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
        showToast,
        downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      });
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageGroupResetConfirm' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
      // 核心跳过：不写路径补丁；成功 toast 用组恢复完成文案（非待迁移横幅）。
      expect(bridge.setPaths).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith('settingsResetComplete', 'success');
      expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
    } finally {
      useAppStore.setState({
        updatePreferences: prevUpdatePreferences,
        changeDownloadPath: prevChangeDownloadPath,
        updateDownloadSettings: prevUpdateDownloadSettings,
        showToast: prevShowToast,
      });
    }
  });

  it('group reset keeps the download-family toast when the tree leg also fails (R9)', async () => {
    // 树与下载同一组恢复内同时失败：聚合裁决取首个失败块（treeCache），但下载家族文案
    // 仍须发出——不得因 failedStep=treeCache 被吞。
    const bridge = mockStorageBridge({
      statusData: statusAtDefault,
      treeResult: {
        ok: true,
        data: {
          workspaceCount: 0,
          totalBytes: 0,
          oldestCapturedAt: null,
          newestCapturedAt: null,
          enabled: true,
          ttlMinutes: 30,
        },
      },
    });
    bridge.setTreeCacheOptions.mockResolvedValue({
      ok: false,
      error: { code: 'Internal', message: 'tree boom' },
    });
    const prevChangeDownloadPath = useAppStore.getState().changeDownloadPath;
    const prevUpdateDownloadSettings = useAppStore.getState().updateDownloadSettings;
    const prevShowToast = useAppStore.getState().showToast;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    const showToast = vi.fn();
    try {
      // 树非默认（ttl 30）→ 该腿可执行且写失败；下载非默认且开迁移 → 路径写失败。
      useAppStore.setState({
        showToast,
        changeDownloadPath: vi.fn(async () => ({
          ok: false as const,
          error: { code: 'Internal' as const, message: 'migrate boom' },
        })),
        updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
        downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: true },
        downloadSettingsLoaded: true,
      });
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageGroupResetConfirm' }));
      // 下载族文案（开框迁移快照 = true → migrate 变体）。
      await waitFor(() => {
        expect(showToast).toHaveBeenCalledWith('storageDownloadMigrateFailed', 'error');
      });
      // 尾部汇总错误也在（树腿自身错误另有独立文案）。
      expect(showToast).toHaveBeenCalledWith('settingsUpdateFailed', 'error');
      // 失败不关框（保持对话框供检查/重试）。
      expect(screen.queryByRole('dialog')).not.toBeNull();
      expect(bridge.setPaths).not.toHaveBeenCalled();
    } finally {
      useAppStore.setState({
        changeDownloadPath: prevChangeDownloadPath,
        updateDownloadSettings: prevUpdateDownloadSettings,
        showToast: prevShowToast,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevLoaded,
      });
    }
  });

  it('localizes structured preflight issues with category prefix and dedupes (9)', async () => {
    // 事项 9：结构化 issue → ［分类名］前缀 + 同（分类,文案）去重 + 未知消息原文回退。
    const prefixT = new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        if (key === 'storagePreflightIssueWithCategory') {
          return '［{category}］{message}';
        }
        if (key === 'storagePreflightIdentical') {
          return 'LOCALIZED_IDENTICAL';
        }
        if (key === 'storageCategoryDatabase') {
          return 'DB';
        }
        if (key === 'storageCategorySiteMetaDb') {
          return 'META';
        }
        if (key === 'storageCategoryTreeCache') {
          return 'TREE';
        }
        if (key === 'storagePreflightNotWritable') {
          return 'LOCALIZED_NOT_WRITABLE';
        }
        return typeof key === 'string' ? key : '';
      },
    }) as unknown as CopyDict;
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: false,
        errors: [
          { category: 'database', message: 'source and target are identical' },
          // 同分类同文案重复 → 去重后只留一条。
          { category: 'database', message: 'source and target are identical' },
          // 不同分类同文案 → 分类名不同 → 不去重，两条都在。
          { category: 'site_meta_db', message: 'source and target are identical' },
          // 根级未知消息 → 无前缀、原文回退。
          { category: null, message: 'raw unknown backend message' },
        ],
        warnings: [{ category: 'tree_cache', message: 'path is not writable' }],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    mockStorageBridge({ preflight });
    renderSettings(prefixT);
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    act(() => {
      useAppStore.getState().requestStorageGroupReset();
    });
    const dialog = await screen.findByRole('dialog');
    // 分类名前缀 + 去重：同分类重复只剩一条；不同分类各一条（前缀区分）。
    expect(within(dialog).getAllByText('［DB］LOCALIZED_IDENTICAL')).toHaveLength(1);
    expect(within(dialog).getAllByText('［META］LOCALIZED_IDENTICAL')).toHaveLength(1);
    // 根级未知消息：无前缀、原文展示。
    expect(within(dialog).getByText('raw unknown backend message')).toBeTruthy();
    // 警告同样带分类名前缀。
    expect(within(dialog).getByText('［TREE］LOCALIZED_NOT_WRITABLE')).toBeTruthy();
    // 英文原文不再出现；预检失败仍禁用迁移动作。
    expect(within(dialog).queryByText('source and target are identical')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'storageMigrateLater' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'storageCancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('keeps the sidebar aggregate after unmount instead of nulling it (7)', async () => {
    mockStorageBridge();
    const prev = useAppStore.getState().storageBlocksAtDefault;
    try {
      const { unmount } = renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      await waitFor(() => {
        expect(useAppStore.getState().storageBlocksAtDefault).not.toBeNull();
      });
      const before = useAppStore.getState().storageBlocksAtDefault;
      expect(typeof before).toBe('boolean');
      unmount();
      // 卸载不再置 null：切出存储组保持最近一次判定。
      expect(useAppStore.getState().storageBlocksAtDefault).toBe(before);
    } finally {
      useAppStore.setState({ storageBlocksAtDefault: prev });
    }
  });

  it('all storage blocks already default → no dialog, info toast instead (10)', async () => {
    mockStorageBridge({ statusData: statusAtDefault });
    const showToast = vi.fn();
    const prevShowToast = useAppStore.getState().showToast;
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    try {
      useAppStore.setState({ showToast });
      // 各块全默认：核心 root===defaultRoot、树 enabled+15、下载已加载且系统默认。
      setStoreAppInfo();
      setStoreDownloadSettings('', false);
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      // 不开对话框（不出空白清单），直接提示无需恢复。
      await waitFor(() => {
        expect(showToast).toHaveBeenCalledWith('storageGroupResetAllDefault', 'success');
      });
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      useAppStore.setState({
        showToast: prevShowToast,
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevLoaded,
      });
    }
  });

  it('group dialog lists only really non-default blocks and picks truthful tree copy (10)', async () => {
    // 树 disabled+TTL=30 → 需"重新开启+恢复时长"（full 变体）；其余块默认 → 整项不出现。
    mockStorageBridge({
      statusData: statusAtDefault,
      treeResult: {
        ok: true,
        data: {
          workspaceCount: 0,
          totalBytes: 0,
          oldestCapturedAt: null,
          newestCapturedAt: null,
          enabled: false,
          ttlMinutes: 30,
        },
      },
    });
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    try {
      setStoreAppInfo();
      setStoreDownloadSettings('', false);
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      // 树非默认 → 出现（且文案与真实形态一致）；核心/下载默认 → 整项不出现。
      expect(within(dialog).getByText('storageGroupResetItemTree')).toBeTruthy();
      expect(within(dialog).queryByText('storageGroupResetItemCore')).toBeNull();
      expect(within(dialog).queryByText('storageGroupResetItemDownloadMigrateOff')).toBeNull();
      expect(within(dialog).queryByText('storageGroupResetItemDownloadMigrateOn')).toBeNull();
      expect(within(dialog).getByRole('button', { name: 'storageGroupResetConfirm' })).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageCancel' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      useAppStore.setState({
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevLoaded,
      });
    }
  });

  it('tree copy matches the real pending change: reenable-only / ttl-only variants (10)', async () => {
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    const openAndAssert = async (treeResult: typeof defaultTreeStats, expectedKey: string) => {
      mockStorageBridge({ statusData: statusAtDefault, treeResult });
      const view = renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(expectedKey)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageCancel' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
      // 连开两次前先卸载，避免两棵组件树叠加（分类行数量翻倍）。
      view.unmount();
    };
    try {
      setStoreAppInfo();
      setStoreDownloadSettings('', false);
      // 仅需重新开启（disabled + TTL 已是 15）→ reenable 变体。
      await openAndAssert(
        {
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: false,
            ttlMinutes: 15,
          },
        },
        'storageGroupResetItemTreeReenable',
      );
      // 仅需恢复保留时长（enabled + TTL≠15）→ ttl 变体。
      await openAndAssert(
        {
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 60,
          },
        },
        'storageGroupResetItemTreeTtl',
      );
    } finally {
      useAppStore.setState({
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevLoaded,
      });
    }
  });

  it('download path already default but migrate switch on → switch-only copy (10)', async () => {
    mockStorageBridge({ statusData: statusAtDefault });
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    try {
      setStoreAppInfo();
      // 路径已是系统默认，仅迁移开关非默认 → 只提示开关恢复，不提路径。
      setStoreDownloadSettings('', true);
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('storageGroupResetItemDownloadSwitchOnly')).toBeTruthy();
      expect(within(dialog).queryByText('storageGroupResetItemDownloadMigrateOn')).toBeNull();
      expect(within(dialog).queryByText('storageGroupResetItemDownloadMigrateOff')).toBeNull();
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageCancel' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      useAppStore.setState({
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevLoaded,
      });
    }
  });

  it('group apply skips legs of already-default blocks (execution mirrors the list) (10)', async () => {
    // 核心/树/下载全默认 → 开框即被空态拦截；这里核心非默认（唯一待恢复腿），
    // 其余块默认 → 确认后仅 setPaths 执行，树/下载写全部跳过。
    const bridge = mockStorageBridge({
      preflight: vi.fn().mockResolvedValue({
        ok: true,
        data: { ok: true, errors: [], warnings: [], totalFiles: 0, totalBytes: 0, freeBytes: 0 },
      }),
      treeResult: {
        ok: true,
        data: {
          workspaceCount: 0,
          totalBytes: 0,
          oldestCapturedAt: null,
          newestCapturedAt: null,
          enabled: true,
          ttlMinutes: 15,
        },
      },
    });
    bridge.setPaths.mockResolvedValue({
      ok: true,
      data: { preflight: { ok: true }, restartRequired: false },
    });
    const prevUpdatePreferences = useAppStore.getState().updatePreferences;
    const prevChangeDownloadPath = useAppStore.getState().changeDownloadPath;
    const prevUpdateDownloadSettings = useAppStore.getState().updateDownloadSettings;
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    const updatePreferences = vi.fn(async () => true);
    const changeDownloadPath = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const updateDownloadSettings = vi.fn(async () => ({ ok: true as const, data: undefined }));
    try {
      useAppStore.setState({
        updatePreferences,
        changeDownloadPath,
        updateDownloadSettings,
      });
      setStoreAppInfo();
      setStoreDownloadSettings('', false);
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      act(() => {
        useAppStore.getState().requestStorageGroupReset();
      });
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateLater' }));
      await waitFor(() => {
        expect(bridge.setPaths).toHaveBeenCalledTimes(1);
      });
      // 已默认的三块不执行恢复腿（执行与清单显示同源）。
      expect(updatePreferences).not.toHaveBeenCalled();
      expect(bridge.setTreeCacheOptions).not.toHaveBeenCalled();
      expect(changeDownloadPath).not.toHaveBeenCalled();
      expect(updateDownloadSettings).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      useAppStore.setState({
        updatePreferences: prevUpdatePreferences,
        changeDownloadPath: prevChangeDownloadPath,
        updateDownloadSettings: prevUpdateDownloadSettings,
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevLoaded,
      });
    }
  });

  it('block-level download confirm uses switch-only copy when path is already default (10)', async () => {
    mockStorageBridge();
    const prevAppInfo = useAppStore.getState().appInfo;
    const prevDownload = useAppStore.getState().downloadSettings;
    const prevLoaded = useAppStore.getState().downloadSettingsLoaded;
    try {
      setStoreAppInfo();
      // 路径系统默认 + 迁移开关开 → 块按钮可用（非默认），确认框只提示关开关。
      setStoreDownloadSettings('', true);
      renderSettings();
      await waitFor(() => {
        expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
      });
      fireEvent.click(screen.getByTestId('download-path-reset'));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('storageDownloadResetConfirmSwitchOnly')).toBeTruthy();
      expect(within(dialog).queryByText('storageDownloadResetConfirmMigrateOn')).toBeNull();
      fireEvent.click(within(dialog).getByRole('button', { name: 'storageCancel' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      useAppStore.setState({
        appInfo: prevAppInfo,
        downloadSettings: prevDownload,
        downloadSettingsLoaded: prevLoaded,
      });
    }
  });
});

describe('StorageSettings tree cache section (T9)', () => {
  const treeStatsData = {
    workspaceCount: 2,
    totalBytes: 1024,
    oldestCapturedAt: 1,
    newestCapturedAt: 2,
    enabled: true,
    ttlMinutes: 15,
  };

  // 真实词典兜底 key 名：treeCache 文案走插值断言，其余行沿用 key 名（locale 可切 zh-CN）。
  function renderTreeSection(
    overrides: {
      statsData?: typeof treeStatsData;
      getTreeCacheStats?: ReturnType<typeof vi.fn>;
      setTreeCacheOptions?: ReturnType<typeof vi.fn>;
      clearTreeCache?: ReturnType<typeof vi.fn>;
      locale?: 'en-US' | 'zh-CN';
    } = {},
  ) {
    const dict = overrides.locale === 'zh-CN' ? settingsZh : settingsEn;
    const t = new Proxy(dict as unknown as Record<string, string>, {
      get: (target, key) => (typeof key === 'string' && key in target ? target[key] : key),
    }) as unknown as CopyDict;
    const getTreeCacheStats =
      overrides.getTreeCacheStats ??
      vi.fn().mockResolvedValue({ ok: true, data: overrides.statsData ?? treeStatsData });
    const setTreeCacheOptions =
      overrides.setTreeCacheOptions ?? vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const clearTreeCache =
      overrides.clearTreeCache ?? vi.fn().mockResolvedValue({ ok: true, data: undefined });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats,
        setTreeCacheOptions,
        clearTreeCache,
      },
    };
    const view = render(
      <TCopyProvider t={t} locale={overrides.locale ?? 'en-US'}>
        <StorageSettings />
      </TCopyProvider>,
    );
    return { getTreeCacheStats, setTreeCacheOptions, clearTreeCache, unmount: view.unmount };
  }

  it('shows tree-cache stats and clears on confirm', async () => {
    const { getTreeCacheStats, clearTreeCache } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    // 主标题 + 横排统计副标题。
    expect(screen.getByText(settingsEn.treeCacheStatsLabel)).toBeTruthy();
    expect(screen.getByText(settingsEn.treeCacheWorkspaces.replace('{count}', '2'))).toBeTruthy();
    expect(
      screen.getByText(settingsEn.treeCacheSize.replace('{size}', formatBytes(1024))),
    ).toBeTruthy();
    const stats = document.querySelector('.adl-tree-cache-stats');
    expect(stats).not.toBeNull();
    expect(stats?.querySelectorAll('.adl-tree-cache-stats__sep')).toHaveLength(2);

    // 标题移出卡片：恢复默认图标 + SettingsHeader 在 header 容器内。
    const header = document.querySelector('[data-testid="tree-cache-reset"]')?.parentElement;
    expect(header?.classList.contains('adl-settings-storage__header')).toBe(true);
    expect(header?.querySelector('.adl-settings-header')).not.toBeNull();

    // 二次确认：点清除先弹对话框，确认后才调用一次。
    fireEvent.click(screen.getByTestId('tree-cache-clear'));
    await screen.findByText(settingsEn.treeCacheClearConfirm);
    expect(clearTreeCache).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    const clearConfirmBtn = within(dialog).getByRole('button', { name: settingsEn.treeCacheClear });
    expect(clearConfirmBtn.className).toContain('adl-btn--secondary');
    expect(clearConfirmBtn.className).not.toContain('adl-btn--primary');
    fireEvent.click(clearConfirmBtn);
    await waitFor(() => {
      expect(clearTreeCache).toHaveBeenCalledTimes(1);
    });
    // 清除后重拉 stats 刷新展示。
    await waitFor(() => {
      expect(getTreeCacheStats).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the enable hint under the tree-cache label', async () => {
    renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    expect(screen.getByText(settingsEn.treeCacheEnabledHint)).toBeTruthy();
  });

  it('unchecking the master switch opens disable confirm then writes and clears', async () => {
    const { setTreeCacheOptions, clearTreeCache } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    const toggle = screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled });
    expect(toggle).toHaveProperty('checked', true);
    fireEvent.click(toggle);
    // 先弹确认框，不直接写。
    await screen.findByText(settingsEn.treeCacheDisableConfirm);
    expect(setTreeCacheOptions).not.toHaveBeenCalled();
    expect(clearTreeCache).not.toHaveBeenCalled();
    // TTL 下拉在确认前仍可用（enabled 尚未写 false）。
    expect(screen.getByRole('button', { name: settingsEn.treeCacheTtl })).not.toBeDisabled();
    const dialog = screen.getByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', {
      name: settingsEn.treeCacheDisableConfirmBtn,
    });
    // 与「取消」同款 secondary：无品牌蓝填充。
    expect(confirmBtn.className).toContain('adl-btn--secondary');
    expect(confirmBtn.className).not.toContain('adl-btn--primary');
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    });
    expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: false, ttlMinutes: 15 });
    await waitFor(() => {
      expect(clearTreeCache).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        (screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled }) as HTMLInputElement)
          .checked,
      ).toBe(false);
    });
    // 确认关闭后 TTL 下拉禁用。
    expect(screen.getByRole('button', { name: settingsEn.treeCacheTtl })).toBeDisabled();
  });

  it('rechecking the master switch enables without a confirm dialog', async () => {
    const { setTreeCacheOptions } = renderTreeSection({
      statsData: { ...treeStatsData, enabled: false },
    });
    await screen.findByTestId('tree-cache-section');
    const toggle = screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled });
    expect(toggle).toHaveProperty('checked', false);
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    });
    expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: true, ttlMinutes: 15 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('changing the TTL calls setTreeCacheOptions with the new value', async () => {
    const { setTreeCacheOptions } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtl }));
    fireEvent.click(screen.getByRole('option', { name: '60 minutes' }));
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    });
    expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: true, ttlMinutes: 60 });
  });

  it('custom TTL converts seconds up to whole minutes within 1..=1440', async () => {
    const { setTreeCacheOptions } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtl }));
    fireEvent.click(screen.getByRole('option', { name: settingsEn.treeCacheTtlCustom }));
    const input = screen.getByRole('spinbutton', {
      name: settingsEn.treeCacheTtlCustom,
    }) as HTMLInputElement;
    expect(input).toBeTruthy();
    // 自定义态控件顺序：数值 → 单位 → 默认选项下拉（默认选项恒在最右）。
    const control = input.closest('.adl-settings-row__control');
    expect(control).not.toBeNull();
    // SettingsSelect 根节点是无 aria-label 的 div，label 在内部 trigger 上。
    const order = Array.from(control!.children).map((el) => {
      if (el instanceof HTMLElement && el.tagName === 'INPUT') {
        return el.getAttribute('aria-label') ?? el.tagName;
      }
      return el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? el.tagName;
    });
    expect(order).toEqual([
      settingsEn.treeCacheTtlCustom,
      settingsEn.treeCacheTtlUnitLabel,
      settingsEn.treeCacheTtl,
    ]);
    // 默认单位为分钟。
    fireEvent.change(input, { target: { value: '90' } });
    await waitFor(
      () => {
        expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: true, ttlMinutes: 90 });
      },
      { timeout: 1500 },
    );

    // 切到秒：30s → 向上取整 1 分钟。
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtlUnitLabel }));
    fireEvent.click(screen.getByRole('option', { name: settingsEn.treeCacheUnitSecond }));
    fireEvent.change(input, { target: { value: '30' } });
    await waitFor(
      () => {
        expect(setTreeCacheOptions).toHaveBeenLastCalledWith({
          enabled: true,
          ttlMinutes: 1,
        });
      },
      { timeout: 1500 },
    );

    // 上限 1 天：2 天 → 钳制 1440（天单位 number input max=1，故此处手输 2 是刻意
    // 绕过原生 max 约束、直测换算钳制函数，而非测 UI 约束本身）。
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtlUnitLabel }));
    fireEvent.click(screen.getByRole('option', { name: settingsEn.treeCacheUnitDay }));
    fireEvent.change(input, { target: { value: '2' } });
    await waitFor(
      () => {
        expect(setTreeCacheOptions).toHaveBeenLastCalledWith({
          enabled: true,
          ttlMinutes: 1440,
        });
      },
      { timeout: 1500 },
    );
  });

  it('reset button restores tree-cache defaults without clearing', async () => {
    const { setTreeCacheOptions, clearTreeCache } = renderTreeSection({
      statsData: { ...treeStatsData, enabled: false, ttlMinutes: 60 },
    });
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByTestId('tree-cache-reset'));
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    });
    expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: true, ttlMinutes: 15 });
    expect(clearTreeCache).not.toHaveBeenCalled();
  });

  it('seeds the custom editor when the backend TTL is not a preset', async () => {
    const { setTreeCacheOptions } = renderTreeSection({
      statsData: { ...treeStatsData, ttlMinutes: 30 },
    });
    await screen.findByTestId('tree-cache-section');
    // 非预设值自动进自定义态：草稿播种 30/分，不写桥。
    await waitFor(() => {
      expect(
        (
          screen.getByRole('spinbutton', {
            name: settingsEn.treeCacheTtlCustom,
          }) as HTMLInputElement
        ).value,
      ).toBe('30');
    });
    expect(setTreeCacheOptions).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: settingsEn.treeCacheTtl }).textContent).toContain(
      settingsEn.treeCacheTtlCustom,
    );
  });

  it.each([['0'], ['-5'], ['']])('does not bridge illegal custom TTL input (%s)', async (value) => {
    const { setTreeCacheOptions } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtl }));
    fireEvent.click(screen.getByRole('option', { name: settingsEn.treeCacheTtlCustom }));
    const input = screen.getByRole('spinbutton', { name: settingsEn.treeCacheTtlCustom });
    // 每个非法值独占一次防抖窗口（连发只有末值真正提交，旧写法恒过测不出分支）。
    fireEvent.change(input, { target: { value } });
    // 超过 500ms 防抖仍不出桥（非法输入静默丢弃），输入框保留草稿。
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(setTreeCacheOptions).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe(value);
  });

  it('keeps the disable dialog open when writing options fails', async () => {
    const setTreeCacheOptions = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { message: 'disk-gone' } });
    const { clearTreeCache } = renderTreeSection({ setTreeCacheOptions });
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled }));
    await screen.findByText(settingsEn.treeCacheDisableConfirm);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: settingsEn.treeCacheDisableConfirmBtn }),
    );
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    });
    // 写失败：不清缓存、不关框、不改勾选。
    expect(clearTreeCache).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(
      (screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it('still closes and reloads when clearing fails after disable', async () => {
    const clearTreeCache = vi.fn().mockResolvedValue({ ok: false, error: { message: 'locked' } });
    const { getTreeCacheStats } = renderTreeSection({ clearTreeCache });
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled }));
    await screen.findByText(settingsEn.treeCacheDisableConfirm);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: settingsEn.treeCacheDisableConfirmBtn }),
    );
    await waitFor(() => {
      expect(clearTreeCache).toHaveBeenCalledTimes(1);
    });
    // 开关已写成功：仍关框 + 重拉 stats（注释承诺的行为）。
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => {
      expect(getTreeCacheStats).toHaveBeenCalledTimes(2);
    });
  });

  it('converts the draft display when switching units without bridging immediately', async () => {
    const { setTreeCacheOptions } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtl }));
    fireEvent.click(screen.getByRole('option', { name: settingsEn.treeCacheTtlCustom }));
    const input = screen.getByRole('spinbutton', {
      name: settingsEn.treeCacheTtlCustom,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '45' } });
    // 切到秒：同一草稿换算为 2700 显示，不立即写桥（仍走防抖）。
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtlUnitLabel }));
    fireEvent.click(screen.getByRole('option', { name: settingsEn.treeCacheUnitSecond }));
    expect(input.value).toBe('2700');
    expect(setTreeCacheOptions).not.toHaveBeenCalled();
    // 防抖到期：2700 秒 → 45 分钟写桥。
    await waitFor(
      () => {
        expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: true, ttlMinutes: 45 });
      },
      { timeout: 1500 },
    );
  });

  it('keeps the clear dialog open and toasts when clearing throws', async () => {
    useAppStore.getState().clearToasts();
    const clearTreeCache = vi.fn().mockRejectedValueOnce(new Error('channel closed'));
    renderTreeSection({ clearTreeCache });
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByTestId('tree-cache-clear'));
    await screen.findByText(settingsEn.treeCacheClearConfirm);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: settingsEn.treeCacheClear }));
    await waitFor(() => {
      expect(clearTreeCache).toHaveBeenCalledTimes(1);
    });
    // 抛错落 toast + 对话框保持打开 + 无未处理拒绝（测试不崩即证）。
    expect(screen.queryByRole('dialog')).not.toBeNull();
    const toasts = useAppStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('channel closed');
  });

  it('does not let a slow older reload overwrite a newer options merge', async () => {
    // 首读即时（挂载），之后重拉全部挂起、由测试按序放行。
    const pendingReads: ((v: { ok: true; data: typeof treeStatsData }) => void)[] = [];
    let reads = 0;
    const getTreeCacheStats = vi.fn().mockImplementation(() => {
      reads += 1;
      if (reads === 1) {
        return Promise.resolve({ ok: true, data: treeStatsData });
      }
      return new Promise<{ ok: true; data: typeof treeStatsData }>((resolve) => {
        pendingReads.push(resolve);
      });
    });
    const { setTreeCacheOptions } = renderTreeSection({ getTreeCacheStats });
    await screen.findByTestId('tree-cache-section');
    // 写 60（重拉挂起），再写 1 天（重拉挂起）。
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtl }));
    fireEvent.click(screen.getByRole('option', { name: '60 minutes' }));
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: true, ttlMinutes: 60 });
    });
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtl }));
    fireEvent.click(screen.getByRole('option', { name: settingsEn.treeCacheTtlDay }));
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: true, ttlMinutes: 1440 });
    });
    expect(pendingReads).toHaveLength(2);
    // 先放新闻（ttl 1440）合并生效，再放旧读（ttl 60）：被序列号守卫丢弃。
    pendingReads[1]({ ok: true, data: { ...treeStatsData, ttlMinutes: 1440 } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: settingsEn.treeCacheTtl }).textContent).toContain(
        settingsEn.treeCacheTtlDay,
      );
    });
    pendingReads[0]({ ok: true, data: treeStatsData });
    await new Promise((resolve) => setTimeout(resolve, 100));
    // 旧读未覆盖：仍显示 1 天，且只写了两次（无回写）。
    expect(screen.getByRole('button', { name: settingsEn.treeCacheTtl }).textContent).toContain(
      settingsEn.treeCacheTtlDay,
    );
    expect(setTreeCacheOptions).toHaveBeenCalledTimes(2);
  });

  it('keeps the disable dialog open when the bridge itself throws', async () => {
    useAppStore.getState().clearToasts();
    const setTreeCacheOptions = vi.fn().mockRejectedValueOnce(new Error('channel closed'));
    renderTreeSection({ setTreeCacheOptions });
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled }));
    await screen.findByText(settingsEn.treeCacheDisableConfirm);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: settingsEn.treeCacheDisableConfirmBtn }),
    );
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    });
    // 抛错落 toast + 对话框保持打开 + 开关不变 + 无未处理拒绝（测试不崩即证）。
    expect(screen.queryByRole('dialog')).not.toBeNull();
    const toasts = useAppStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('channel closed');
    expect(
      (screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it('drops a pending TTL draft when opening the disable confirm', async () => {
    const { setTreeCacheOptions } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    // 自定义态键入（在途 500ms 防抖），随即 500ms 内取消勾选。
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtl }));
    fireEvent.click(screen.getByRole('option', { name: settingsEn.treeCacheTtlCustom }));
    fireEvent.change(screen.getByRole('spinbutton', { name: settingsEn.treeCacheTtlCustom }), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled }));
    await screen.findByText(settingsEn.treeCacheDisableConfirm);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: settingsEn.treeCacheDisableConfirmBtn }),
    );
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    });
    // 只有关闭写；过期草稿未把开关写回 true。
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: false, ttlMinutes: 15 });
  });

  it('locks the dialog close channels while the disable write is busy', async () => {
    let resolveWrite!: (v: { ok: true; data: undefined }) => void;
    const setTreeCacheOptions = vi.fn().mockImplementationOnce(
      () =>
        new Promise<{ ok: true; data: undefined }>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    renderTreeSection({ setTreeCacheOptions });
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled }));
    await screen.findByText(settingsEn.treeCacheDisableConfirm);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: settingsEn.treeCacheDisableConfirmBtn }),
    );
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    });
    // 忙时：Esc 与遮罩点击均不关框，取消键禁用。
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: settingsEn.storageCancel }),
    ).toBeDisabled();
    // 写完成：关框。
    resolveWrite({ ok: true, data: undefined });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('returns focus to the trigger after the clear dialog closes', async () => {
    const { clearTreeCache } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    const clearBtn = screen.getByTestId('tree-cache-clear');
    fireEvent.click(clearBtn);
    await screen.findByText(settingsEn.treeCacheClearConfirm);
    const dialog = screen.getByRole('dialog');
    // 清除确认与「取消」同款 secondary（无品牌蓝填充，产品决策 2026-09-24）。
    const clearConfirmBtn = within(dialog).getByRole('button', { name: settingsEn.treeCacheClear });
    expect(clearConfirmBtn.className).toContain('adl-btn--secondary');
    expect(clearConfirmBtn.className).not.toContain('adl-btn--primary');
    fireEvent.click(clearConfirmBtn);
    await waitFor(() => {
      expect(clearTreeCache).toHaveBeenCalledTimes(1);
    });
    // 关框 effect 回焦点到触发源（waitFor 防调度抖动）。
    await waitFor(() => {
      expect(document.activeElement).toBe(clearBtn);
    });
  });

  it('toggles via the label text', async () => {
    renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    // 纯文本 label 与 checkbox 经 htmlFor/id 关联：点文字即切换（零视觉变更）。
    fireEvent.click(screen.getByText(settingsEn.treeCacheEnabled));
    await screen.findByText(settingsEn.treeCacheDisableConfirm);
  });

  it('formats the cache time with the app locale', async () => {
    const statsData = { ...treeStatsData, newestCapturedAt: Date.UTC(2026, 8, 24, 12, 0, 0) };
    const { unmount } = renderTreeSection({ statsData });
    await screen.findByTestId('tree-cache-section');
    // en-US：月/日/年（只断年月顺序，避开时区日边界）。
    expect(document.querySelector('.adl-tree-cache-stats')?.textContent).toMatch(
      /9\/\d{1,2}\/2026/,
    );
    unmount();
    renderTreeSection({ statsData, locale: 'zh-CN' });
    await screen.findByTestId('tree-cache-section');
    // zh-CN：年/月/日。
    expect(document.querySelector('.adl-tree-cache-stats')?.textContent).toMatch(/2026\/9\//);
  });
});

describe('treeTtlMinutesFromCustom', () => {
  it('rounds fractional units, ceilings seconds, and rejects non-positive input', () => {
    expect(treeTtlMinutesFromCustom(1.4, 'm')).toBe(1);
    expect(treeTtlMinutesFromCustom(1.5, 'm')).toBe(2);
    expect(treeTtlMinutesFromCustom(0.5, 'h')).toBe(30);
    expect(treeTtlMinutesFromCustom(30, 's')).toBe(1);
    expect(treeTtlMinutesFromCustom(0, 'm')).toBeNull();
    expect(treeTtlMinutesFromCustom(-3, 'h')).toBeNull();
    expect(treeTtlMinutesFromCustom(Number.NaN, 's')).toBeNull();
    expect(treeTtlMinutesFromCustom(2, 'd')).toBe(1440);
  });

  it('formatMinutesForUnit converts minutes to the display unit', () => {
    expect(formatMinutesForUnit(45, 's')).toBe('2700');
    expect(formatMinutesForUnit(45, 'm')).toBe('45');
    expect(formatMinutesForUnit(90, 'h')).toBe('1.5');
    expect(formatMinutesForUnit(1440, 'd')).toBe('1');
    // 四位小数保证天单位往返无漂移（2 位时 45 分钟→0.03 天→回算 43 分钟）。
    expect(formatMinutesForUnit(45, 'd')).toBe('0.0313');
    expect(treeTtlMinutesFromCustom(0.0313, 'd')).toBe(45);
    expect(treeTtlMinutesFromCustom(Number(formatMinutesForUnit(45, 'd')), 'd')).toBe(45);
  });
});

describe('StorageSettings reset-disabled (storage-reset-disabled Task 3)', () => {
  const DEFAULT_ROOT = status.root;

  /** 全默认预算/下载 store + 默认布局 status（`defaultRoot === root`）+ 默认树 stats。 */
  function mockResetDisabledBridge(
    opts: {
      statusData?: typeof status & { defaultRoot?: string };
      treeEnabled?: boolean;
      treeTtlMinutes?: number;
      getStatusResult?: unknown;
    } = {},
  ) {
    const statusData = opts.statusData ?? { ...status, defaultRoot: DEFAULT_ROOT };
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi
          .fn()
          .mockResolvedValue(opts.getStatusResult ?? { ok: true, data: statusData }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: opts.treeEnabled ?? true,
            ttlMinutes: opts.treeTtlMinutes ?? 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
  }

  // 本 describe 顺序执行于文件末尾：每个用例显式播种预算/下载 store，
  // 用例后复位，避免跨文件内其它用例泄漏（store 在同文件内常驻）。
  afterEach(() => {
    useAppStore.setState({
      appInfo: undefined,
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      downloadSettingsLoaded: false,
    });
  });

  async function renderLoaded() {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
  }

  it('disables all block resets when everything is at defaults', async () => {
    setStoreAppInfo();
    setStoreDownloadSettings('', false);
    mockResetDisabledBridge();
    await renderLoaded();
    expect(headerResetButton()).toBeDisabled();
    expect(screen.getByTestId('tree-cache-reset')).toBeDisabled();
    expect(screen.getByTestId('download-path-reset')).toBeDisabled();
  });

  it('enables core reset when root differs from defaultRoot', async () => {
    setStoreAppInfo();
    setStoreDownloadSettings('', false);
    mockResetDisabledBridge({
      statusData: { ...status, root: 'D:/custom-root', defaultRoot: DEFAULT_ROOT },
    });
    await renderLoaded();
    expect(headerResetButton()).not.toBeDisabled();
    expect(screen.getByTestId('tree-cache-reset')).toBeDisabled();
    expect(screen.getByTestId('download-path-reset')).toBeDisabled();
  });

  it('enables tree reset when ttl differs', async () => {
    setStoreAppInfo();
    setStoreDownloadSettings('', false);
    mockResetDisabledBridge({ treeTtlMinutes: 30 });
    await renderLoaded();
    expect(headerResetButton()).toBeDisabled();
    expect(screen.getByTestId('tree-cache-reset')).not.toBeDisabled();
    expect(screen.getByTestId('download-path-reset')).toBeDisabled();
  });

  it('enables download reset when path customized', async () => {
    setStoreAppInfo();
    setStoreDownloadSettings('D:/custom-downloads', false);
    mockResetDisabledBridge();
    await renderLoaded();
    expect(headerResetButton()).toBeDisabled();
    expect(screen.getByTestId('tree-cache-reset')).toBeDisabled();
    expect(screen.getByTestId('download-path-reset')).not.toBeDisabled();
  });

  it('keeps resets enabled when status failed to load', async () => {
    // fail-open：status 未知走错误 UI，各块恢复按钮不渲染为 disabled（无禁用态）。
    mockResetDisabledBridge({
      getStatusResult: { ok: false, error: { message: 'disk-gone' } },
    });
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryByTestId('storage-reset-defaults')).toBeNull();
    expect(screen.queryByTestId('tree-cache-reset')).toBeNull();
    expect(screen.queryByTestId('download-path-reset')).toBeNull();
  });

  it('aggregate is false when tree stats fail even if everything else is default', async () => {
    // 树未知不得计为默认：其余块全默认 + 树 stats 失败 → 聚合 false（侧边栏行保持启用）。
    setStoreAppInfo();
    setStoreDownloadSettings('', false);
    mockResetDisabledBridge();
    (
      window as unknown as {
        digitalLife: { storage: { getTreeCacheStats: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage.getTreeCacheStats.mockRejectedValue(new Error('boom'));
    const prevAggregate = useAppStore.getState().storageBlocksAtDefault;
    try {
      await renderLoaded();
      await waitFor(() => {
        expect(useAppStore.getState().storageBlocksAtDefault).toBe(false);
      });
      // 树区段不渲染（无按钮可断言），聚合信号是唯一可观测面。
      expect(screen.queryByTestId('tree-cache-reset')).toBeNull();
    } finally {
      useAppStore.setState({ storageBlocksAtDefault: prevAggregate });
    }
  });
});

describe('StorageSettings entry cache (stale-while-revalidate)', () => {
  // 共享 fixture 是刻意的 partial（桥 mock 无类型）；入缓存需完整 StorageStatus，
  // 这里补齐 defaultRoot（= root，即「核心重置默认可用」语义，与本组断言无关）。
  const cachedStatus = { ...status, defaultRoot: status.root };

  it('缓存命中：首帧即完整内容，不显示加载骨架（无需等待 IPC）', () => {
    setCachedStorageStatus(cachedStatus);
    renderSettings();
    // 同步断言：effect 里的 getStatus 尚未 settle，首帧完全由缓存驱动。
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
    expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
  });

  it('缓存命中后后台再验证：成功即静默更新缓存，全程无加载骨架', async () => {
    setCachedStorageStatus(cachedStatus);
    const fresh = { ...cachedStatus, locatorPath: 'D:/fresh/storage-locator.json' };
    (
      window as unknown as {
        digitalLife: { storage: { getStatus: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage.getStatus.mockResolvedValue({ ok: true, data: fresh });
    renderSettings();
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
    await waitFor(() => {
      expect(getCachedStorageStatus()?.locatorPath).toBe('D:/fresh/storage-locator.json');
    });
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
  });

  it('冷进入（无缓存）：加载成功后写回缓存，供下次进场瞬显', async () => {
    expect(getCachedStorageStatus()).toBeNull();
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    expect(getCachedStorageStatus()?.root).toBe(status.root);
  });

  it('预取静默填充缓存；畸形 status 不入缓存', async () => {
    await prefetchStorageSettings();
    expect(getCachedStorageStatus()?.root).toBe(status.root);

    resetStorageSettingsCache();
    (
      window as unknown as {
        digitalLife: { storage: { getStatus: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage.getStatus.mockResolvedValue({ ok: true, data: { mode: 'bogus' } });
    await prefetchStorageSettings();
    expect(getCachedStorageStatus()).toBeNull();
  });

  it('畸形分类元素不入缓存（信封对但元素错：空 path / 非字符串 key）', async () => {
    const storage = (
      window as unknown as {
        digitalLife: { storage: { getStatus: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage;
    storage.getStatus.mockResolvedValue({
      ok: true,
      data: {
        ...cachedStatus,
        categories: [{ key: 42, path: null }],
      },
    });
    await prefetchStorageSettings();
    expect(getCachedStorageStatus()).toBeNull();
  });

  it('预取冷填充语义：缓存已有值即 no-op，不再发 IPC（新鲜度由挂载再验证提供）', async () => {
    setCachedStorageStatus({ ...status, defaultRoot: status.root });
    const storage = (
      window as unknown as {
        digitalLife: { storage: { getStatus: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage;
    await prefetchStorageSettings();
    expect(storage.getStatus).not.toHaveBeenCalled();
  });

  it('reset 清空缓存后预取重新拉取（去重 latch 随 reset 失效）', async () => {
    const storage = (
      window as unknown as {
        digitalLife: { storage: { getStatus: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage;
    await prefetchStorageSettings();
    expect(storage.getStatus).toHaveBeenCalledTimes(1);
    expect(getCachedStorageStatus()).not.toBeNull();
    resetStorageSettingsCache();
    await prefetchStorageSettings();
    expect(storage.getStatus).toHaveBeenCalledTimes(2);
  });

  it('在途预取在 reset 后放弃写入（epoch 守卫，防跨用例缓存泄漏）', async () => {
    const storage = (
      window as unknown as {
        digitalLife: { storage: { getStatus: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage;
    let release!: (value: unknown) => void;
    storage.getStatus.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const inflight = prefetchStorageSettings();
    resetStorageSettingsCache();
    release({ ok: true, data: { ...status, defaultRoot: status.root } });
    await inflight;
    expect(getCachedStorageStatus()).toBeNull();
  });

  it('draftsDirtyRef 正向：用户编辑草稿后，再验证不回滚（语言切换重取场景）', async () => {
    const perCategory = { ...cachedStatus, mode: 'per_category' as const };
    setCachedStorageStatus(perCategory);
    const storage = (
      window as unknown as {
        digitalLife: { storage: { getStatus: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage;
    storage.getStatus.mockResolvedValue({ ok: true, data: perCategory });
    const view = renderSettings();
    await waitFor(() => expect(screen.getByLabelText('storageModePerCategory')).toBeChecked());
    // 用户切回统一（draftsDirtyRef 置位）。
    fireEvent.click(screen.getByLabelText('storageModeUnified'));
    expect(screen.getByLabelText('storageModeUnified')).toBeChecked();
    // 语言切换（t 身份变化）触发 [t] 再验证：fresh 仍是 per_category ——
    // 若 dirty 保护失效，草稿会被重播种回滚成 per_category。
    const t2 = new Proxy({} as Record<string, string>, {
      get: (_, key) => (typeof key === 'string' ? key : ''),
    }) as unknown as CopyDict;
    view.rerender(
      <TCopyProvider t={t2} locale="en-US">
        <StorageSettings />
      </TCopyProvider>,
    );
    await waitFor(() => expect(storage.getStatus).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('storageModeUnified')).toBeChecked();
    expect(screen.getByLabelText('storageModePerCategory')).not.toBeChecked();
  });

  it('draftsDirtyRef 反向：未编辑时，再验证把草稿重播种为后端最新（缓存收敛）', async () => {
    setCachedStorageStatus(cachedStatus); // mode: unified（缓存快照）
    const perCategory = { ...cachedStatus, mode: 'per_category' as const };
    (
      window as unknown as {
        digitalLife: { storage: { getStatus: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage.getStatus.mockResolvedValue({ ok: true, data: perCategory });
    renderSettings();
    // 挂载再验证（dirty=false）→ 草稿随 fresh 重播种为 per_category（修 rev1-F2 分叉）。
    await waitFor(() => expect(screen.getByLabelText('storageModePerCategory')).toBeChecked());
  });

  it('预取同时填充树缓存快照（双侧冷填充）', async () => {
    await prefetchStorageSettings();
    expect(getCachedStorageStatus()?.root).toBe(status.root);
    expect(getCachedTreeStats()?.ttlMinutes).toBe(15);
  });

  it('旧桥无 getTreeCacheStats 时预取静默成功（仅填 status）', async () => {
    const storage = (
      window as unknown as {
        digitalLife: { storage: { getStatus: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage;
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: { getStatus: storage.getStatus },
    };
    await expect(prefetchStorageSettings()).resolves.toBeUndefined();
    expect(getCachedStorageStatus()).not.toBeNull();
    expect(getCachedTreeStats()).toBeNull();
  });

  it('缓存命中 + 再验证失败时保留快照内容（静默陈旧取舍 pin）', async () => {
    setCachedStorageStatus(cachedStatus);
    const storage = (
      window as unknown as {
        digitalLife: { storage: { getStatus: ReturnType<typeof vi.fn> } };
      }
    ).digitalLife.storage;
    storage.getStatus.mockResolvedValue({ ok: false, error: { message: 'disk-gone' } });
    renderSettings();
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
    await waitFor(() => expect(storage.getStatus).toHaveBeenCalled());
    // 错误页门 `statusError && !status`：status 非空 → 快照内容保留、不切错误页。
    expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
  });
});

describe('事项 13：应用+确认后脏条/CTA 消失（挂起提交快照语义）', () => {
  /** 带挂起迁移的 status（setPaths 成功后后端已登记）。 */
  const pendingStatus = { ...status, pending: { failed: false, error: null } };

  /**
   * 可切后台 pending 态的桥：setPaths 成功即视为后端已登记挂起、cancelPending 成功
   * 即撤销 —— getStatus 按当前后台态返回，不依赖调用次数（冷启动加载 / 成功后
   * refresh / 取消后 refresh 均正确）。
   */
  function makeBridgeWithPendingToggle(
    opts: { restartRequired?: boolean; restartOk?: boolean } = {},
  ) {
    let backendPending = false;
    const bridge = {
      getStatus: vi.fn().mockImplementation(async () => ({
        ok: true,
        data: backendPending ? pendingStatus : status,
      })),
      scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      preflight: vi.fn().mockResolvedValue({
        ok: true,
        data: { ok: true, errors: [], warnings: [], totalFiles: 0, totalBytes: 0, freeBytes: 0 },
      }),
      setPaths: vi.fn().mockImplementation(async () => {
        backendPending = true;
        return {
          ok: true,
          data: { preflight: { ok: true }, restartRequired: opts.restartRequired ?? false },
        };
      }),
      cancelPending: vi.fn().mockImplementation(async () => {
        backendPending = false;
        return { ok: true, data: undefined };
      }),
      restartApp: vi
        .fn()
        .mockImplementation(async () =>
          opts.restartOk === false
            ? { ok: false, error: { message: 'no-host' } }
            : { ok: true, data: undefined },
        ),
      getTreeCacheStats: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          workspaceCount: 0,
          totalBytes: 0,
          oldestCapturedAt: null,
          newestCapturedAt: null,
          enabled: true,
          ttlMinutes: 15,
        },
      }),
      setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    };
    (window as unknown as { digitalLife: unknown }).digitalLife = { storage: bridge };
    return bridge;
  }

  /** 改根路径草稿 → 脏条「应用」→ 对话框「下次启动迁移」→ 等挂起落地（pending 卡出现）。 */
  async function applyViaDialogAndDefer() {
    const rootInput = screen.getByRole('textbox', { name: 'storageManualInput' });
    fireEvent.change(rootInput, { target: { value: 'D:/new-root' } });
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();
    fireEvent.click(
      within(screen.getByTestId('storage-dirtybar')).getByRole('button', { name: 'storageApply' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateLater' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    // refresh 落地：顶部「待迁移任务」块出现（status.pending 非空）。
    await waitFor(() => {
      expect(screen.queryByTestId('storage-pending-card')).toBeTruthy();
    });
    return rootInput;
  }

  it('apply + confirm (defer) hides the dirtybar and bottom CTA; draft keeps the new path', async () => {
    makeBridgeWithPendingToggle();
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const rootInput = await applyViaDialogAndDefer();
    // 修改已提交（挂起待迁移）→ 粘性脏条与块底部 CTA 消失；撤回走「取消待迁移」。
    await waitFor(() => {
      expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
      expect(screen.queryByTestId('storage-bottom-cta')).toBeNull();
    });
    // 方案 2：输入框保留用户提交的新路径（不回跳旧根）。
    expect((rootInput as HTMLInputElement).value).toBe('D:/new-root');
  });

  it('editing the draft while a migration is pending shows the dirtybar again', async () => {
    makeBridgeWithPendingToggle();
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    await applyViaDialogAndDefer();
    await waitFor(() => {
      expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
    });
    // 挂起中再编辑：草稿 ≠ 已提交快照 → 脏条恢复（可再次应用覆盖挂起，方案 2 核心差异）。
    const rootInput = screen.getByRole('textbox', { name: 'storageManualInput' });
    fireEvent.change(rootInput, { target: { value: 'D:/new-root-2' } });
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();
    expect(screen.getByTestId('storage-bottom-cta')).toBeTruthy();
  });

  it('canceling the pending migration restores the dirtybar (snapshot cleared)', async () => {
    const bridge = makeBridgeWithPendingToggle();
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    await applyViaDialogAndDefer();
    await waitFor(() => {
      expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
    });
    // 「待迁移任务」块的「取消待迁移」→ 挂起撤销 → 草稿仍未应用 → 脏条恢复。
    fireEvent.click(screen.getByText('storageCancelPending'));
    await waitFor(() => {
      expect(bridge.cancelPending).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();
      expect(screen.getByTestId('storage-bottom-cta')).toBeTruthy();
    });
  });

  it('per-category apply hides the bar via drafts-map comparison (Phase 4 R4-L1)', async () => {
    // 模式感知相等：per_category 只比分类映射（根输入无关）。
    makeBridgeWithPendingToggle();
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    fireEvent.click(screen.getByRole('radio', { name: 'storageModePerCategory' }));
    const pathInputs = screen.getAllByRole('textbox', { name: 'storageManualInput' });
    fireEvent.change(pathInputs[0], { target: { value: 'D:/moved/category' } });
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();
    fireEvent.click(
      within(screen.getByTestId('storage-dirtybar')).getByRole('button', { name: 'storageApply' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateLater' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('storage-pending-card')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
      expect(screen.queryByTestId('storage-bottom-cta')).toBeNull();
    });
    // 再改同一分类 → 与快照不等 → 脏条恢复。
    fireEvent.change(pathInputs[0], { target: { value: 'D:/moved/category-2' } });
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();
  });

  it('setPaths success + refresh failure keeps the bar (cannot prove pending, Phase 4 R4-M1)', async () => {
    const bridge = makeBridgeWithPendingToggle();
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const rootInput = screen.getByRole('textbox', { name: 'storageManualInput' });
    fireEvent.change(rootInput, { target: { value: 'D:/new-root' } });
    fireEvent.click(
      within(screen.getByTestId('storage-dirtybar')).getByRole('button', { name: 'storageApply' }),
    );
    const dialog = await screen.findByRole('dialog');
    // 确认后的 refresh 失败 → 不记快照（无法证明挂起已登记）。
    bridge.getStatus.mockImplementationOnce(async () => ({
      ok: false,
      error: { message: 'disk-gone' },
    }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateLater' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    // 脏条保持显示（与"无法证明挂起"诚实一致），而非矛盾地消失。
    await waitFor(() => {
      expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();
    });
    expect(screen.queryByTestId('storage-pending-card')).toBeNull();
  });

  it('apply-now with failing restart still hides the bar once pending is confirmed', async () => {
    const bridge = makeBridgeWithPendingToggle({ restartRequired: true, restartOk: false });
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const rootInput = screen.getByRole('textbox', { name: 'storageManualInput' });
    fireEvent.change(rootInput, { target: { value: 'D:/new-root' } });
    fireEvent.click(
      within(screen.getByTestId('storage-dirtybar')).getByRole('button', { name: 'storageApply' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'storageMigrateNow' }));
    await waitFor(() => {
      expect(bridge.restartApp).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('storage-pending-card')).toBeTruthy();
    });
    // 重启失败但挂起已登记（refresh 证实）→ 脏条消失。
    await waitFor(() => {
      expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
      expect(screen.queryByTestId('storage-bottom-cta')).toBeNull();
    });
  });
});

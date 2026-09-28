import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import type { SettingItem, SettingsGroupId } from '@shared/ipc';
import { STORAGE_CATEGORY_KEYS } from '@shared/ipc/storage';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import { buildSettingsItems } from '@utils/settingsViewModel';
import { resetStorageSettingsCache } from '@features/storage-settings/storageStatusCache';
import { WorkspaceSettings } from '@features/workspace-settings/WorkspaceSettings';
import { StorageSettings } from '@features/storage-settings/StorageSettings';
import { BrowserSettings } from '@features/browser-settings/BrowserSettings';
import { DshSettings } from '@features/dsh/DshSettings';
import { KeybindSettings } from './KeybindSettings';
import { SettingsControls } from './SettingsControls';
import { buildSettingsSearchIndex, anchorFor } from './settingsSearchIndex';

// DshSettings 经 useAppActions 触达 IPC：与 DshSettings.test.tsx 同法打桩，
// 只保留渲染所需的最小组件前置条件（挂载拉取 / 自动检测均走静默桩）。
const fetchSourceStatus = vi.fn();
const testSource = vi.fn();
const saveSourceConfig = vi.fn();

vi.mock('@hooks/useAppActions', () => ({
  useAppActions: () => ({
    fetchSourceStatus: (...args: unknown[]) => fetchSourceStatus(...args),
    testSource: (...args: unknown[]) => testSource(...args),
    saveSourceConfig: (...args: unknown[]) => saveSourceConfig(...args),
  }),
}));

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

/** 通用组条目由传入 settings 派生：走应用真实派生路径（buildSettingsItems），
 * 避免测试自造条目与真实「通用」设置项漂移。 */
function buildGeneralItems(): SettingItem[] {
  return buildSettingsItems(mockT, useAppStore.getState().appInfo);
}

function seedStore() {
  useAppStore.setState({
    updatePreferences: vi.fn(async () => true),
    showToast: vi.fn(),
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
        terminalHistoryBudgetBytes: 1 << 30,
      },
      currentWorkspace: undefined,
      recentLogs: [],
    },
    recentWorkspaces: [],
    downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
    downloadSettingsLoaded: true,
    isLoadingSettings: false,
    sourceStatus: null,
  });
}

/** 存储组桥桩（照搬 StorageSettings.test.tsx）：getStatus + tree stats 齐备，
 * 使 corePaths / treeCache / terminalBudget / browserDownload / immutable 五块全渲染。 */
function seedStorageBridge() {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    storage: {
      getStatus: vi.fn().mockResolvedValue({ ok: true, data: storageStatus }),
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
}

const storageStatus = {
  mode: 'unified' as const,
  root: 'C:/Users/u/AppData/Roaming/app',
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

// 六组各一个渲染用例：索引中属于该组的每个锚点都必须在该组渲染容器内命中。
const CASES: { group: SettingsGroupId; render: () => ReturnType<typeof render> }[] = [
  {
    group: 'general',
    render: () =>
      render(
        <TestProvider>
          <SettingsControls items={buildGeneralItems()} onChange={() => {}} />
        </TestProvider>,
      ),
  },
  {
    group: 'workspace',
    render: () =>
      render(
        <TestProvider>
          <WorkspaceSettings />
        </TestProvider>,
      ),
  },
  {
    group: 'shortcuts',
    render: () =>
      render(
        <TestProvider>
          <KeybindSettings />
        </TestProvider>,
      ),
  },
  {
    group: 'browser',
    render: () =>
      render(
        <TestProvider>
          <BrowserSettings />
        </TestProvider>,
      ),
  },
  {
    group: 'dsh',
    render: () =>
      render(
        <TestProvider>
          <DshSettings />
        </TestProvider>,
      ),
  },
  {
    group: 'storage',
    render: () =>
      render(
        <TestProvider>
          <StorageSettings />
        </TestProvider>,
      ),
  },
];

describe('settings search anchors', () => {
  beforeEach(() => {
    resetStorageSettingsCache();
    seedStore();
    seedStorageBridge();
    fetchSourceStatus.mockReset().mockResolvedValue(true);
    testSource.mockReset().mockResolvedValue({ reachable: true, latency_ms: 12, error: null });
    saveSourceConfig.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useAppStore.setState({
      appInfo: undefined,
      recentWorkspaces: [],
      sourceStatus: null,
      toasts: [],
    });
  });

  it('索引中每组的锚点都能在对应组 DOM 命中', async () => {
    // 防空洞通过：用例必须覆盖全部六组，缺组即失败（不允许测试断言为空）。
    expect(CASES).toHaveLength(6);

    const index = buildSettingsSearchIndex({
      t: mockT,
      settings: buildGeneralItems(),
      keybinds: {},
    });

    for (const { group, render: doRender } of CASES) {
      const expected = index
        .filter((entry) => entry.group === group)
        .map((entry) => anchorFor(entry.group, entry.anchorId));
      // 该组在索引中必须确有锚点，否则本组断言恒真（空集）。
      expect(expected.length, `group ${group} has no index entries`).toBeGreaterThan(0);

      const { container, unmount } = doRender();
      await waitFor(() => {
        const present = new Set(
          Array.from(container.querySelectorAll('[data-settings-anchor]')).map((el) =>
            el.getAttribute('data-settings-anchor'),
          ),
        );
        for (const anchor of expected) {
          expect(present.has(anchor), `${group} missing anchor ${anchor}`).toBe(true);
        }
      });
      unmount();
    }
  });
});

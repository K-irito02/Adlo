import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import type { SettingItem, SettingsGroupId } from '@shared/ipc';
import type { EnvStatus } from '@shared/ipc/env';
import { STORAGE_CATEGORY_KEYS } from '@shared/ipc/storage';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import { buildSettingsItems } from '@utils/settingsViewModel';
import { resetStorageSettingsCache } from '@features/storage-settings/storageStatusCache';
import { WorkspaceSettings } from '@features/workspace-settings/WorkspaceSettings';
import { StorageSettings } from '@features/storage-settings/StorageSettings';
import { BrowserSettings } from '@features/browser-settings/BrowserSettings';
import { DshSettings } from '@features/dsh/DshSettings';
import { NetworkSettings } from '@features/network/NetworkSettings';
import { EnvironmentSettings } from '@features/environment/EnvironmentSettings';
import { KeybindSettings } from './KeybindSettings';
import { zhCN } from '@i18n/zh-CN';
import { enUS } from '@i18n/en-US';
import { SettingsControls } from './SettingsControls';
import { buildSettingsSearchIndex, anchorFor, filterSearchIndex } from './settingsSearchIndex';
import { SETTINGS_ROW_ATTRIBUTE } from './settingsRowLocate';

// DshSettings 经 useAppActions 触达 IPC：与 DshSettings.test.tsx 同法打桩，
// 只保留渲染所需的最小组件前置条件（挂载拉取 / 自动检测均走静默桩）。
const fetchSourceStatus = vi.fn();
const testSource = vi.fn();
const saveSourceConfig = vi.fn();
// 版本管理块挂载即拉取版本状态 + 目录；其余版本动作仅由点击处理器调用（本套件不触发），
// 保留以维持 action mock 形状完整。
const fetchDshVersionStatus = vi.fn();
const fetchVersionCatalog = vi.fn();
// 环境组挂载即拉取全量状态 + 启动任务轮询；状态不写 store（本套件不断言行内容，
// loading 态仍带锚点），只保留 mock 形状使挂载 effect 可跑。
const fetchEnvStatus = vi.fn();
const selectEnvSource = vi.fn();
const installEnvDep = vi.fn();
const uninstallEnvDep = vi.fn();
const setEnvCustomPath = vi.fn();
const recheckEnv = vi.fn();
const pollEnvTaskWhileRunning = vi.fn();

vi.mock('@hooks/useAppActions', () => ({
  useAppActions: () => ({
    fetchSourceStatus: (...args: unknown[]) => fetchSourceStatus(...args),
    testSource: (...args: unknown[]) => testSource(...args),
    saveSourceConfig: (...args: unknown[]) => saveSourceConfig(...args),
    fetchDshVersionStatus: (...args: unknown[]) => fetchDshVersionStatus(...args),
    fetchVersionCatalog: (...args: unknown[]) => fetchVersionCatalog(...args),
    fetchDshSettingsSnapshot: vi.fn(async () => true),
    fetchDshRunning: vi.fn(async () => true),
    fetchVersionTask: vi.fn(),
    cancelVersionTask: vi.fn(),
    restartDsh: vi.fn(async () => ({ restarted: false, url: null, failed: true })),
    updateDsh: vi.fn(),
    revertDsh: vi.fn(),
    uninstallDsh: vi.fn(),
    reinstallDsh: vi.fn(),
    installDshVersion: vi.fn(),
    fetchEnvStatus: (...args: unknown[]) => fetchEnvStatus(...args),
    selectEnvSource: (...args: unknown[]) => selectEnvSource(...args),
    installEnvDep: (...args: unknown[]) => installEnvDep(...args),
    uninstallEnvDep: (...args: unknown[]) => uninstallEnvDep(...args),
    setEnvCustomPath: (...args: unknown[]) => setEnvCustomPath(...args),
    recheckEnv: (...args: unknown[]) => recheckEnv(...args),
    pollEnvTaskWhileRunning: (...args: unknown[]) => pollEnvTaskWhileRunning(...args),
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
        linkOpenMethod: 'panel',
        fileOpenMethod: 'panel',
        agentLinkIntercept: false,
        agentSiteWhitelist: [],
        // 挂起白名单行仅开关开时渲染：种子开开关，使行标记恒可断言（同 storageRootLabel 处理）。
        browserSuspendWhitelistEnabled: true,
        browserSuspendWhitelist: [],
      },
      currentWorkspace: undefined,
      recentLogs: [],
    },
    recentWorkspaces: [],
    downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
    downloadSettingsLoaded: true,
    isLoadingSettings: false,
    // 版本管理块的管理行以「偏好解析来源非 system」为显示条件；种子给宿主可用，
    // 使检查更新/正式/预发布行在默认渲染下真实存在（进而参与行定位断言）。
    sourceStatus: {
      system: null,
      running: null,
      versionSource: {
        mode: 'auto',
        effective: 'host',
        resolvedByMode: { auto: 'host', host: 'host', system: 'none' },
        hostVersion: '0.1.0',
      },
      config: {
        npm_registry: 'https://registry.npmjs.org',
        dsh_mirror: null,
        source_mode: 'manual',
        version_source: 'auto',
        proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
      },
    },
  });
}

/** 存储组桥桩（照搬 StorageSettings.test.tsx）：getStatus + tree stats 齐备，
 * 使 corePaths / treeCache / browserDownload / immutable 各块全渲染。 */
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

/** 环境组行标记唯一性夹具：node 缺失（安装）、git 宿主已装（卸载/重装）。 */
function envFixture(): EnvStatus {
  const dep = (patch: Record<string, unknown> = {}) => ({
    mode: 'auto' as const,
    effective: 'host' as const,
    origin: 'path' as const,
    installedVersion: '1.0.0',
    baselineVersion: '1.0.0',
    meetsBaseline: true,
    path: 'C:/hosted/1.0.0/bin.exe',
    ...patch,
  });
  return {
    node: dep({
      effective: 'none',
      installedVersion: null,
      baselineVersion: '22.0.0',
      meetsBaseline: false,
      path: null,
    }),
    git: dep({ installedVersion: '2.52.0', baselineVersion: '2.52.0' }),
    bash: dep({
      mode: 'system',
      effective: 'system',
      installedVersion: null,
      baselineVersion: '',
      path: 'C:/Program Files/Git/bin/bash.exe',
    }),
    webview2: {
      mode: 'auto',
      effective: 'system',
      origin: 'registry',
      installedVersion: '140.0.3485.94',
      baselineVersion: '140.0.0.0',
      meetsBaseline: true,
      path: null,
    },
    adlserver: dep({
      effective: 'system',
      origin: 'bundled',
      installedVersion: null,
      baselineVersion: '',
      path: 'C:/hosted/adlserver/adl-server.exe',
    }),
    netprobe: { registryOk: true, registryLatencyMs: 12, ciTokenConfigured: false },
    task: null,
    dataDir: 'C:/data-root',
    dshReady: false,
  } as EnvStatus;
}

/**
 * 条件渲染的设置行：其 `data-settings-row` 标记只在特定编辑态/数据态下出现，
 * 无法在默认渲染里恒见，故 DOM 断言只要求「登记不滞留」（删行后必须同步删本清单）。
 * 每行给出条件；条件恒真的行**不得**进本清单（那会让守卫失去拦截力）。
 */
const CONDITIONAL_ROW_MARKERS: string[] = [
  // 注意：**默认渲染下真实存在**的条件行不得列入本清单 —— 列进去等于放弃对它的断言。
  // 例：`storageRootLabel` 只在「统一根目录」模式渲染，但测试种子就是 unified，
  // 故它必须留在断言范围内（每类独立模式下它落点回退块锚点，属设计内降级）。
  // 仅下载源为「自定义」时渲染。
  'dshSettingsCustomUrl',
  // 仅代理模式为「手动」时渲染。
  'dshSettingsProxyHttp',
  'dshSettingsProxyHttps',
  'dshSettingsProxyNoProxy',
  // 环境组操作行：仅 EnvironmentSettings 渲染后出现。
  // 登记即约束——组件渲染行时须带同名 `data-settings-row` 标记，否则本守卫失败。
  // 卸载/重装仅在宿主来源且已安装的行渲染（本套件未写 envStatus，故列为条件行）。
  'environmentInstall',
  'environmentSwitch',
  'environmentUninstall',
  'environmentReinstall',
  'environmentRecheck',
  'environmentCopyForAgent',
  // 聚合条仅在环境状态加载后渲染。
  'environmentCopyAllForAgent',
  // 通用版本卡片的已安装版本独立区已随 OpenCode 对齐删除（不再渲染独立卡）；
  // 双通道行由 `manageVisible` 门控、恒渲染（含空态），
  // 因此 `dshOfficialStable` / `dshPrereleaseTitle` 属于默认可见行。
  // 「前往配置」行已随「网络与模型」块删除（该标记只挂在已删除的网络行上）。
];

// 九组各一个渲染用例：索引中属于该组的每个锚点都必须在该组渲染容器内命中。
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
    group: 'openMethod',
    render: () =>
      render(
        <TestProvider>
          <SettingsControls
            items={buildGeneralItems().filter((item) => item.groupId === 'openMethod')}
            onChange={() => {}}
          />
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
    group: 'network',
    render: () =>
      render(
        <TestProvider>
          <NetworkSettings />
        </TestProvider>,
      ),
  },
  {
    group: 'environment',
    render: () =>
      render(
        <TestProvider>
          <EnvironmentSettings />
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
    fetchDshVersionStatus.mockReset().mockResolvedValue(true);
    fetchEnvStatus.mockReset().mockResolvedValue(true);
    selectEnvSource.mockReset().mockResolvedValue(true);
    installEnvDep.mockReset().mockResolvedValue(true);
    uninstallEnvDep.mockReset().mockResolvedValue(true);
    setEnvCustomPath.mockReset().mockResolvedValue(true);
    recheckEnv.mockReset().mockResolvedValue(true);
    pollEnvTaskWhileRunning.mockReset().mockReturnValue(() => {});
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

  it('DSH 版本块的正式版本/预发布版本/升级检索词仍命中', () => {
    const zhT = zhCN as unknown as CopyDict;
    const index = buildSettingsSearchIndex({ t: zhT, settings: [], keybinds: {} });

    for (const query of ['正式版本', '预发布版本', '升级']) {
      const hits = filterSearchIndex(index, query).map((entry) =>
        anchorFor(entry.group, entry.anchorId),
      );
      expect(hits, query).toContain(anchorFor('dsh', 'version'));
    }
  });

  it('索引中每组的锚点都能在对应组 DOM 命中', async () => {
    // 防空洞通过：用例必须覆盖全部九组，缺组即失败（不允许测试断言为空）。
    expect(CASES).toHaveLength(9);

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

  it('索引中每条行文案的定位标记都能在对应组 DOM 命中', async () => {
    const index = buildSettingsSearchIndex({
      t: mockT,
      settings: buildGeneralItems(),
      keybinds: {},
    });
    /** 每条行文案的定位文案（mockT 下即 key 名，与 DOM 属性值同源）。 */
    const locatesOf = (entries: typeof index) =>
      entries.flatMap((entry) =>
        (entry.details ?? []).map((detail) => detail.locate as string),
      ) as string[];

    // 前置契约：索引中所有 detail 必有 locate（blockDetails 对取不到定位文案的行直接
    // 跳过登记）。若该跳过逻辑日后放松，这里给出显式失败，而不是下方守卫抛出
    // `missing row marker undefined` 的混淆信息。
    for (const entry of index) {
      for (const detail of entry.details ?? []) {
        expect(
          detail.locate,
          `${anchorFor(entry.group, entry.anchorId)} has a detail without locate`,
        ).toBeTruthy();
      }
    }

    const registered = new Set(locatesOf(index));
    // 条件清单不得滞留：每条仍必须是登记在册的行（删行后必须同步删清单）。
    for (const key of CONDITIONAL_ROW_MARKERS) {
      expect(registered.has(key), `stale conditional row marker ${key}`).toBe(true);
    }
    // 同一组内**不同块**不得共用同一条行定位文案：`findSettingsRow` 取首个等值命中，
    // 跨块重复会让落点静默落到另一个块的行上（同块内两行同文案由 i18n 文案唯一性保证，
    // 属已知边界 —— 索引是扁平结构，此处无法逐行区分）。
    for (const group of ['workspace', 'storage', 'browser', 'dsh', 'environment'] as const) {
      const locates = index
        .filter((entry) => entry.group === group)
        .flatMap((entry) => [...new Set((entry.details ?? []).map((detail) => detail.locate))]);
      const duplicates = locates.filter((locate, position) => locates.indexOf(locate) !== position);
      expect(duplicates, `${group} has duplicate row markers across blocks`).toEqual([]);
    }

    // mockT 下的 locate 是 **key 名**，只能证明「key 不重复」；落点靠**运行时文案值**
    // 等值匹配，文案随 locale 变化 —— 故对 zh / en 两个 locale 各核对一遍：每个 locate
    // 都能译出文案，且同组内文案值两两不同（单 locale 撞车会让该语言下跳转静默落到
    // 同组第一行，另一 locale 的断言拦不住）。
    const localeCopies: [string, Record<string, string>][] = [
      ['zh-CN', zhCN as unknown as Record<string, string>],
      ['en-US', enUS as unknown as Record<string, string>],
    ];
    for (const [locale, dict] of localeCopies) {
      for (const group of ['workspace', 'storage', 'browser', 'dsh', 'environment'] as const) {
        const texts = index
          .filter((entry) => entry.group === group)
          .flatMap((entry) => [
            ...new Set((entry.details ?? []).map((detail) => detail.locate as string)),
          ])
          .map((locate) => {
            const text = dict[locate];
            expect(text, `${locale}: ${group}/${locate} missing in copy`).toBeTruthy();
            return text;
          });
        const duplicates = texts.filter((text, position) => texts.indexOf(text) !== position);
        expect(duplicates, `${locale}: ${group} has duplicate row copy values`).toEqual([]);
      }
    }

    // 防「静默跳过」：除 general/shortcuts 外至少两组带有块内行文案，否则本用例形同虚设。
    const groupsWithRows = CASES.filter(
      ({ group }) => locatesOf(index.filter((e) => e.group === group)).length > 0,
    );
    expect(groupsWithRows.length).toBeGreaterThanOrEqual(3);

    for (const { group, render: doRender } of CASES) {
      const expected = [
        ...new Set(locatesOf(index.filter((entry) => entry.group === group))),
      ].filter((locate) => !CONDITIONAL_ROW_MARKERS.includes(locate));
      // 通用/快捷键组由 SettingItem / 命令派生（行本身即锚点），没有块内行文案：跳过。
      if (expected.length === 0) {
        continue;
      }
      const { container, unmount } = doRender();
      await waitFor(() => {
        const present = new Set(
          Array.from(container.querySelectorAll(`[${SETTINGS_ROW_ATTRIBUTE}]`)).map((el) =>
            el.getAttribute(SETTINGS_ROW_ATTRIBUTE),
          ),
        );
        for (const locate of expected) {
          expect(present.has(locate), `${group} missing row marker ${locate}`).toBe(true);
        }
      });
      unmount();
    }
  });

  it('环境块每个登记行标记在 DOM 中恰好出现一次（R1-11 唯一性）', async () => {
    // 两块七行：安装/切换/卸载/重装/重测/复制/复制全部各一次；
    // 「网络与模型」块已删除，「前往配置」标记不再存在。
    const status = envFixture();
    fetchEnvStatus.mockImplementation(async () => {
      useAppStore.setState({ envStatus: status });
      return true;
    });
    useAppStore.setState({ envStatus: status });
    const { container, unmount } = render(
      <TestProvider>
        <EnvironmentSettings />
      </TestProvider>,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="env-aggregate"]')).not.toBeNull();
    });
    const markers = [
      'environmentInstall',
      'environmentSwitch',
      'environmentUninstall',
      'environmentReinstall',
      'environmentRecheck',
      'environmentCopyForAgent',
      'environmentCopyAllForAgent',
    ];
    for (const marker of markers) {
      const count = container.querySelectorAll(`[data-settings-row="${marker}"]`).length;
      expect(count, `${marker} occurrences`).toBe(1);
    }
    unmount();
  });
});

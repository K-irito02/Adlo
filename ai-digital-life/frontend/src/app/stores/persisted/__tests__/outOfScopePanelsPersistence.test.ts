import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { persistField } from '../apply';
import { persist } from '../persist';
import { hydrateAll, resetHydrationForTest } from '../hydrate';
import { flushCrossSliceWrites, readJson } from '../../storageHelpers';
import { registry, registryEntries } from '../registry';
import {
  applyRightPanelMode,
  readCachedRightPanelMode,
  readCachedRightPanelLastRestorableWidth,
  resetRightPanelLayoutCacheForTest,
} from '@regions/right-panel/rightPanelLayout';
import {
  applyPersistedScrollTop,
  readCachedScrollTop,
  resetScrollTopCacheForTest,
} from '@hooks/usePersistedScrollTop';

/**
 * Task 29：范围外右侧面板工具的持久化往返（CI / GitHub / 通信 / 系统监控 / 剪贴板 / 右侧布局）。
 *
 * 每条用例都是"写入 → flush（模拟关窗落盘）→ resetHydration（模拟重启）→ 读回一致"。
 * 体积预检结论（node 实测代表性夹具）：ciLogCaches ~336KB、ciSnapshots ~21KB（4 工作区，
 * 约 5KB/工作区，7+ 工作区即超 32KB 同步读准入线）→ 二者 sync:false，构造期跳过、
 * 由 githubSlice 的延迟加载按需读取；ciFolders ~1.2KB、workspaceConfigs ~715B → sync。
 */

// [legacy, registryKey]：V2 盘点（ledger B1）的 15 个未覆盖键 + T22 收编的 2 个布局键，
// 共 17 个遗留键；其中 adl-ui:github-access-token 在生产代码中不存在（仅 mock-ci
// 的一处注释，ledger F 已证伪），无 store 字段、无读写路径可搬迁，故不登记、
// 仅把注释中的示例改为新式键名——此处断言其余 16 个全部已登记。
const RELOCATED: [string, string][] = [
  ['adl-ui:changes-branch', 'adl:changes.branch'],
  ['adl-ui:active-github-section', 'adl:browser.githubSection'],
  ['adl-ui:github-ci-folders', 'adl:browser.ciFolders'],
  ['adl-ui:github-workspace-configs', 'adl:browser.workspaceConfigs'],
  ['adl-ui:ci-access-token', 'adl:browser.ciAccessToken'],
  ['adl-ui:ci-config', 'adl:browser.ciConfig'],
  ['adl-ui:ci-snapshots', 'adl:browser.ciSnapshots'],
  ['adl-ui:ci-log-caches', 'adl:browser.ciLogCaches'],
  ['adl-ui:ci-auto-refresh-on-push', 'adl:browser.ciAutoRefreshOnPush'],
  ['adl-ui:active-communicate-platform', 'adl:ui.communicatePlatform'],
  ['adl-ui:communicate-navigator-collapsed', 'adl:ui.communicateNavigatorCollapsed'],
  ['adl-ui:sysmon-collapsed', 'adl:ui.sysmonCollapsed'],
  ['adl-ui:sysmon-scroll-top', 'adl:ui.sysmonScrollTop'],
  ['adl-ui:clipboard-scroll-top', 'adl:ui.clipboardScrollTop'],
  ['adl-ui:right-panel-mode', 'adl:ui.rightPanelMode'],
  ['adl-ui:right-panel-last-restorable-width', 'adl:ui.rightPanelLastRestorableWidth'],
];

describe('out-of-scope panels persistence (Task 29)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHydrationForTest();
    resetRightPanelLayoutCacheForTest();
    resetScrollTopCacheForTest();
  });

  it('registers every relocated key, so startup cleanup cannot delete it', () => {
    const registered = new Set(registryEntries.map((entry) => entry.key));
    for (const [legacy, key] of RELOCATED) {
      expect(registered, `${legacy} must be registered as ${key}`).toContain(key);
    }
  });

  it('no longer needs the transition keep-list', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/stores/persisted/registry.ts'),
      'utf8',
    );
    expect(source).not.toContain('PERSIST_KEEP_KEYS');
  });

  it('restores changes.branch after a simulated restart', () => {
    persistField('adl:changes.branch', 'feature/x');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.selectedBranch).toBe('feature/x');
  });

  it('restores browser.githubSection after a simulated restart', () => {
    persistField('adl:browser.githubSection', 'workflows');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.activeGitHubSection).toBe('workflows');
  });

  it("rejects the 'logs' section exactly like the previous reader (falls back to overview)", () => {
    localStorage.setItem('adl:browser.githubSection', JSON.stringify('logs'));
    const result = hydrateAll();
    expect(result.patch.activeGitHubSection).toBe('overview');
    expect(result.dirtyKeys).toContain('adl:browser.githubSection');
  });

  it('restores browser.ciFolders after a simulated restart', () => {
    const folders = [
      {
        id: 'f1',
        name: 'folder 1',
        createdAt: 1726800000000,
        ciConfig: {
          owner: 'o',
          repo: 'r',
          branch: 'main',
          workflowId: null,
          accessToken: null,
          configured: true,
        },
      },
    ];
    persistField('adl:browser.ciFolders', folders);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.gitHubCiFolders).toEqual(folders);
  });

  it('restores browser.workspaceConfigs after a simulated restart', () => {
    const configs = {
      'ws-1': {
        owner: 'octocat',
        repo: 'hello',
        branch: 'main',
        workflowId: null,
        accessToken: null,
        configured: true,
      },
    };
    persistField('adl:browser.workspaceConfigs', configs);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.gitHubWorkspaceConfigs).toEqual(configs);
  });

  it('restores browser.ciAccessToken after a simulated restart (browser-mode mirror, as-is)', () => {
    persistField('adl:browser.ciAccessToken', 'ghp_test');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.ciAccessToken).toBe('ghp_test');
  });

  it('round-trips an empty ciAccessToken (clear path writes empty, not removeItem)', () => {
    persistField('adl:browser.ciAccessToken', 'ghp_test');
    flushCrossSliceWrites();
    persistField('adl:browser.ciAccessToken', '');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.ciAccessToken).toBe('');
  });

  it('restores browser.ciConfig after a simulated restart', () => {
    const config = {
      owner: 'octocat',
      repo: 'hello',
      branch: 'main',
      workflowId: null,
      accessToken: null,
    };
    persistField('adl:browser.ciConfig', config);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.ciConfig).toEqual(config);
  });

  it('keeps bulky ciSnapshots out of construction hydration (sync:false, lazy load)', () => {
    expect(registry['adl:browser.ciSnapshots'].sync).toBe(false);
    const snapshots = {
      'ws-1': {
        repo: 'o/r',
        branch: 'main',
        latestRun: null,
        jobs: [],
        logs: null,
        capturedAtMs: 1,
        error: null,
      },
    };
    persist('adl:browser.ciSnapshots', snapshots);
    flushCrossSliceWrites();
    resetHydrationForTest();
    const hydrated = hydrateAll();
    expect((hydrated.patch as Record<string, unknown>).ciSnapshots).toBeUndefined();
    const read = registry['adl:browser.ciSnapshots'].read;
    expect(read?.(readJson('adl:browser.ciSnapshots', undefined))).toEqual(snapshots);
  });

  it('keeps bulky ciLogCaches out of construction hydration (sync:false, lazy load)', () => {
    expect(registry['adl:browser.ciLogCaches'].sync).toBe(false);
    const caches = { 'dir-1': { selectedJobId: 7, logs: { 7: 'line1\nline2\n' } } };
    persist('adl:browser.ciLogCaches', caches);
    flushCrossSliceWrites();
    resetHydrationForTest();
    const hydrated = hydrateAll();
    expect((hydrated.patch as Record<string, unknown>).ciLogCaches).toBeUndefined();
    const read = registry['adl:browser.ciLogCaches'].read;
    expect(read?.(readJson('adl:browser.ciLogCaches', undefined))).toEqual(caches);
  });

  it('restores browser.ciAutoRefreshOnPush after a simulated restart', () => {
    persistField('adl:browser.ciAutoRefreshOnPush', false);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.ciAutoRefreshOnPush).toBe(false);
  });

  it('restores ui.communicatePlatform after a simulated restart', () => {
    persistField('adl:ui.communicatePlatform', 'feishu');
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.activePlatform).toBe('feishu');
  });

  it('restores ui.communicateNavigatorCollapsed after a simulated restart', () => {
    persistField('adl:ui.communicateNavigatorCollapsed', true);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.communicateNavigatorCollapsed).toBe(true);
  });

  it('restores ui.sysmonCollapsed after a simulated restart', () => {
    persistField('adl:ui.sysmonCollapsed', false);
    flushCrossSliceWrites();
    resetHydrationForTest();
    expect(hydrateAll().patch.sysmonCollapsed).toBe(false);
  });

  it('defaults sysmonCollapsed to true when nothing was stored (previous readFlag default)', () => {
    expect(hydrateAll().patch.sysmonCollapsed).toBe(true);
  });

  it('restores ui.sysmonScrollTop into the scroll hook cache', () => {
    persist('adl:ui.sysmonScrollTop', 450);
    flushCrossSliceWrites();
    resetHydrationForTest();
    hydrateAll();
    expect(readCachedScrollTop('adl:ui.sysmonScrollTop')).toBe(450);
  });

  it('restores ui.clipboardScrollTop into the scroll hook cache', () => {
    persist('adl:ui.clipboardScrollTop', 2500);
    flushCrossSliceWrites();
    resetHydrationForTest();
    hydrateAll();
    expect(readCachedScrollTop('adl:ui.clipboardScrollTop')).toBe(2500);
  });

  it('restores ui.rightPanelMode into the layout cache', () => {
    persist('adl:ui.rightPanelMode', 'overlay_full');
    flushCrossSliceWrites();
    resetHydrationForTest();
    hydrateAll();
    expect(readCachedRightPanelMode()).toBe('overlay_full');
  });

  it('restores ui.rightPanelLastRestorableWidth into the layout cache', () => {
    persist('adl:ui.rightPanelLastRestorableWidth', 640);
    flushCrossSliceWrites();
    resetHydrationForTest();
    hydrateAll();
    expect(readCachedRightPanelLastRestorableWidth()).toBe(640);
  });

  it('leaves the restorable-width cache empty when never stored (hook falls back to live width)', () => {
    hydrateAll();
    expect(readCachedRightPanelLastRestorableWidth()).toBeUndefined();
  });

  it('applies layout cache values written by the hook helpers', () => {
    applyRightPanelMode('overlay_partial');
    expect(readCachedRightPanelMode()).toBe('overlay_partial');
    applyPersistedScrollTop('adl:ui.sysmonScrollTop', 77);
    expect(readCachedScrollTop('adl:ui.sysmonScrollTop')).toBe(77);
  });
});

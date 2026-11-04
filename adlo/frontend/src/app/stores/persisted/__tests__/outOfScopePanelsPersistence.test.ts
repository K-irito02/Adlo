import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { persistField } from '../apply';
import { persist } from '../persist';
import { hydrateAll, resetHydrationForTest } from '../hydrate';
import { flushCrossSliceWrites } from '../../storageHelpers';
import { registryEntries } from '../registry';
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
 * 范围外右侧面板工具的持久化往返（变更 / 系统监控 / 剪贴板 / 右侧布局）。
 *
 * CI / GitHub / 通信面板已随分支 remove-communicate-panel 彻底删除，
 * 其登记条目与本文件对应 legacy 映射、用例同步移除；用户本地残留旧键由
 * cleanupUnregisteredKeys 在启动时清理。
 *
 * 每条用例都是"写入 → flush（模拟关窗落盘）→ resetHydration（模拟重启）→ 读回一致"。
 */

// [legacy, registryKey]：V2 盘点（ledger B1） + T22 收编的布局键中保留下来的部分
//（CI / GitHub / 通信的 10 个映射已随删除移除）；此处断言其余 6 个全部已登记。
const RELOCATED: [string, string][] = [
  ['adl-ui:changes-branch', 'adl:changes.branch'],
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

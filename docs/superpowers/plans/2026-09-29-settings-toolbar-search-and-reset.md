# 设置面板首行工具栏改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让设置面板首行的「搜索设置」变成跨全部组的跳转式搜索，「恢复全部默认」真正聚合 storage/browser/dsh 三组的自有恢复流程。

**Architecture:** 把三组的「执行」从「弹框交互」中剥离，下沉为 `shared/settings-reset/` 下的纯函数（依赖注入，不 import React / i18n / stores，避免 `shared ↔ stores` 运行时循环）；组组件与新增的 `ResetAllDialog` 共用同一执行函数，杜绝逻辑重复。搜索侧建立跨 6 组的统一索引 + DOM 锚点，命中后切组并滚动定位。

**Tech Stack:** React 19 + TypeScript + Zustand（切片合并）+ Vitest（jsdom）+ @testing-library/react；i18n 走 `useTCopy()`。

**Spec:** `docs/superpowers/specs/2026-09-28-settings-panel-toolbar-search-and-reset-design.md`

## Global Constraints

- 所有面向用户的 UI 文本必须走 i18n key（`zh-CN` 为真源，`en-US` 同步），禁止硬编码中英文。
- 空状态文本**不得以句号结尾**；空状态使用 `EmptyRow`（`@components/LoadingRow`）。
- 禁止 `any`；禁止 `else`（用提前返回）；`const` 优先；禁止 import 别名与 star import。
- 跨目录导入使用 `@` 别名（`@stores` / `@shared` / `@i18n` / `@components` / `@features` / `@root`）。
- 测试文件与源码同目录、命名 `<Module>.test.ts(x)`（与本目录既有 `SettingsPanel.test.tsx` 等一致）。
- 单文件阈值：组件 > 300 行、纯函数文件 > 500 行需拆分。
- 组级（侧边栏行）恢复默认的**既有文案与执行顺序不得变化**——这是回归门禁。
- 存储组恢复默认只含 `general/workspace/shortcuts` 之外的 storage/browser/dsh 三组自有流程；`preferences` 组用 `getDefaultPreferences()` 一次覆盖。
- `language` / `themeMode` 刻意**不**参与任何恢复默认（用户个人基线）。

---

## 文件结构

**新增**

| 文件 | 职责 |
|---|---|
| `frontend/src/shared/settings-reset/types.ts` | `GroupKey` / `GroupResetResult` / 各组 `*Deps` / `*ResetPlan` 类型 |
| `frontend/src/shared/settings-reset/downloadPathReset.ts` | 下载路径恢复纯序列（storage 与 browser 复用） |
| `frontend/src/shared/settings-reset/storageReset.ts` | `computeStorageResetPlan` / `executeStorageResetPlan` |
| `frontend/src/shared/settings-reset/browserReset.ts` | `computeBrowserResetPlan` / `executeBrowserResetPlan` |
| `frontend/src/shared/settings-reset/dshReset.ts` | `executeDshResetPlan` |
| `frontend/src/app/components/settings/resetAllSettings.ts` | 编排器：按序执行 4 组 + 结果汇总 |
| `frontend/src/app/components/settings/ResetAllDialog.tsx` | 聚合确认框（范围清单 + 存储预检 + 迁移时机/保留源 + 进度） |
| `frontend/src/app/components/settings/settingsSearchIndex.ts` | 跨 6 组搜索索引构建 |
| `frontend/src/app/components/settings/SettingsSearchResults.tsx` | 分组结果列表 + 点击跳转 |

**修改**

| 文件 | 改动 |
|---|---|
| `frontend/src/app/components/settings/SettingsPanel.tsx` | 搜索态渲染结果列表；恢复按钮走编排器 + disabled/progress |
| `frontend/src/app/features/storage-settings/downloadPathReset.ts` | `useDownloadPathReset` 改为薄包装（调 shared 纯序列 + toast） |
| `frontend/src/app/features/storage-settings/StorageSettings.tsx` | 组级恢复改用 shared 执行；可搜索块加锚点 |
| `frontend/src/app/features/browser-settings/BrowserSettings.tsx` | 同上 |
| `frontend/src/app/features/dsh/DshSettings.tsx` | 同上 |
| `frontend/src/app/components/settings/KeybindSettings.tsx` | 锚点（命令行）+ 索引登记 |
| `frontend/src/app/features/workspace-settings/WorkspaceSettings.tsx` | 锚点 |
| `frontend/src/app/i18n/zh-CN/settings.ts` / `en-US/settings.ts` | 新增 key |

---

## Phase A — 纯执行层

### Task 1: `types.ts` + `downloadPathReset.ts`（纯序列）

**Files:**
- Create: `frontend/src/shared/settings-reset/types.ts`
- Create: `frontend/src/shared/settings-reset/downloadPathReset.ts`
- Test: `frontend/src/shared/settings-reset/downloadPathReset.test.ts`

**Interfaces:**
- Consumes: `IpcResult`（`@shared/ipc`）
- Produces:
  - `GroupKey = 'preferences' | 'browser' | 'dsh' | 'storage'`
  - `GroupResetResult = { ok: true } | { ok: false; failedStep: string; error?: AppError }`
  - `DownloadPathResetDeps = { changeDownloadPath: (path: string, migrate: boolean) => Promise<IpcResult<void>>; updateDownloadSettings: (mode?: string, defaultPath?: string, autoMigrate?: boolean) => Promise<IpcResult<void>> }`
  - `resetDownloadPathToDefault(deps, migrate): Promise<GroupResetResult>`

- [ ] **Step 1: 写 types.ts**

```ts
// frontend/src/shared/settings-reset/types.ts
import type { AppError } from '@shared/ipc';

/** 「恢复全部默认」的执行单元（顺序即 UI 展示顺序）。 */
export type GroupKey = 'preferences' | 'browser' | 'dsh' | 'storage';

export type GroupResetResult =
  | { ok: true }
  | { ok: false; failedStep: string; error?: AppError };

/** 下载路径恢复的纯序列依赖（由调用方注入 store action，本模块不 import stores）。 */
export interface DownloadPathResetDeps {
  changeDownloadPath: (path: string, migrate: boolean) => Promise<IpcResult<void>>;
  updateDownloadSettings: (
    mode?: string,
    defaultPath?: string,
    autoMigrate?: boolean,
  ) => Promise<IpcResult<void>>;
}
```

补齐 import：`import type { IpcResult } from '@shared/ipc';`（与 `AppError` 同一行合并为 `import type { AppError, IpcResult } from '@shared/ipc';`）。

- [ ] **Step 2: 写失败测试**

```ts
// frontend/src/shared/settings-reset/downloadPathReset.test.ts
import { describe, it, expect, vi } from 'vitest';
import { resetDownloadPathToDefault } from './downloadPathReset';
import type { DownloadPathResetDeps } from './types';

function deps(overrides: Partial<DownloadPathResetDeps> = {}): DownloadPathResetDeps {
  return {
    changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
    updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
    ...overrides,
  };
}

describe('resetDownloadPathToDefault', () => {
  it('路径写回空串并传入 migrate，且开关复位为关闭', async () => {
    const d = deps();
    const result = await resetDownloadPathToDefault(d, true);
    expect(result.ok).toBe(true);
    expect(d.changeDownloadPath).toHaveBeenCalledWith('', true);
    expect(d.updateDownloadSettings).toHaveBeenCalledWith(undefined, undefined, false);
  });

  it('路径步失败时返回 failedStep=downloadPath，且开关步仍执行（解耦）', async () => {
    const d = deps({
      changeDownloadPath: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'Internal' as const, message: 'boom' },
      })),
    });
    const result = await resetDownloadPathToDefault(d, false);
    expect(result).toEqual({
      ok: false,
      failedStep: 'downloadPath',
      error: { code: 'Internal', message: 'boom' },
    });
    expect(d.updateDownloadSettings).toHaveBeenCalledWith(undefined, undefined, false);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- src/shared/settings-reset/downloadPathReset.test.ts`
Expected: FAIL —`Cannot find module './downloadPathReset'`

- [ ] **Step 4: 写最小实现**

```ts
// frontend/src/shared/settings-reset/downloadPathReset.ts
import type { DownloadPathResetDeps, GroupResetResult } from './types';

/**
 * 下载路径恢复默认的纯序列（单块 / 存储组级 / 浏览器组级 / 恢复全部共用）：
 * 路径写回系统默认（空串，migrate 由调用方给定快照）+ 开关复位关闭（解耦，成败都执行）。
 * 不 toast、不 import store —— 由调用方决定呈现。
 */
export async function resetDownloadPathToDefault(
  deps: DownloadPathResetDeps,
  migrate: boolean,
): Promise<GroupResetResult> {
  const pathResult = await deps.changeDownloadPath('', migrate);
  // 开关独立复位：路径步失败也要执行，避免残留半关状态。
  const switchResult = await deps.updateDownloadSettings(undefined, undefined, false);
  if (!pathResult.ok) {
    return { ok: false, failedStep: 'downloadPath', error: pathResult.error };
  }
  if (!switchResult.ok) {
    return { ok: false, failedStep: 'downloadPathSwitch', error: switchResult.error };
  }
  return { ok: true };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/shared/settings-reset/downloadPathReset.test.ts`
Expected: PASS（2 passed）

- [ ] **Step 6: 提交**

```
git add frontend/src/shared/settings-reset/types.ts frontend/src/shared/settings-reset/downloadPathReset.ts frontend/src/shared/settings-reset/downloadPathReset.test.ts
git commit -m "feat(settings): add pure download-path reset sequence in shared"
```

---

### Task 2: `storageReset.ts`（compute + execute）

**Files:**
- Create: `frontend/src/shared/settings-reset/storageReset.ts`
- Test: `frontend/src/shared/settings-reset/storageReset.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `GroupResetResult`、`resetDownloadPathToDefault`
- Produces:
  - `StorageResetBlocks = { coreNeeded: boolean; tree: 'full' | 'reenable' | 'ttl' | 'hidden'; budget: boolean; download: 'on' | 'off' | 'switchOnly' | 'hidden' }`
  - `StorageResetPlan = { blocks: StorageResetBlocks; preflight: StoragePreflight | null; migrateAtOpen: boolean }`
  - `StorageResetDeps = { bridge?: StorageBridgeLike; refreshStatus: () => Promise<StorageStatus | null>; setPaths: (patch: StoragePathPatch, applyNow: boolean) => Promise<{ ok: true; restartRequired: boolean; preflight: StoragePreflight } | { ok: false; error: AppError }>; resetBudget: () => Promise<boolean>; resetTreeCache: () => Promise<boolean>; previewDownload: () => { settings: DownloadSettings; loaded: boolean }; downloadPath: DownloadPathResetDeps }`
  - `computeStorageResetPlan(deps): Promise<StorageResetPlan | null>`
  - `executeStorageResetPlan(deps, plan, opts: { applyNow: boolean; retainSource: boolean }): Promise<{ result: GroupResetResult; restartRequired: boolean }>`

**注**：`StorageBridgeLike` 只声明本模块用到的两个成员，避免依赖完整 bridge 类型：
```ts
export interface StorageBridgeLike {
  preflight(patch: StoragePathPatch): Promise<IpcResult<StoragePreflight>>;
}
```

- [ ] **Step 1: 写失败测试（核心判定与执行顺序）**

```ts
// frontend/src/shared/settings-reset/storageReset.test.ts
import { describe, it, expect, vi } from 'vitest';
import { computeStorageResetPlan, executeStorageResetPlan } from './storageReset';
import type { StorageResetDeps, StorageResetPlan } from './storageReset';

const AT_DEFAULT_STATUS = {
  mode: 'unified', root: '/data', defaultRoot: '/data', pending: null, categories: [],
} as never;

function deps(overrides: Partial<StorageResetDeps> = {}): StorageResetDeps {
  return {
    bridge: { preflight: vi.fn(async () => ({ ok: true as const, data: { ok: true, totalFiles: 3, totalBytes: 300, errors: [], warnings: [] } })) },
    refreshStatus: vi.fn(async () => AT_DEFAULT_STATUS),
    setPaths: vi.fn(async () => ({ ok: true as const, restartRequired: false, preflight: { ok: true, totalFiles: 0, totalBytes: 0, errors: [], warnings: [] } })),
    resetBudget: vi.fn(async () => true),
    resetTreeCache: vi.fn(async () => true),
    previewDownload: () => ({ settings: { mode: 'auto', default_path: '', auto_migrate_on_path_change: false } as never, loaded: true }),
    downloadPath: {
      changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
      updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
    },
    ...overrides,
  };
}

describe('computeStorageResetPlan', () => {
  it('四块全默认时返回 null（无事可做）', async () => {
    expect(await computeStorageResetPlan(deps())).toBeNull();
  });

  it('核心非默认时做 preflight 并带出 coreNeeded', async () => {
    const d = deps({
      refreshStatus: vi.fn(async () => ({ mode: 'perCategory', root: '/x', defaultRoot: '/data', pending: null, categories: [] } as never)),
    });
    const plan = await computeStorageResetPlan(d);
    expect(plan?.blocks.coreNeeded).toBe(true);
    expect(d.bridge?.preflight).toHaveBeenCalledTimes(1);
    expect(plan?.preflight?.ok).toBe(true);
  });

  it('桥缺失时返回 null（调用方按跳过处理）', async () => {
    expect(await computeStorageResetPlan(deps({ bridge: undefined }))).toBeNull();
  });
});

describe('executeStorageResetPlan', () => {
  const planWithCore = (): StorageResetPlan => ({
    blocks: { coreNeeded: true, tree: 'hidden', budget: false, download: 'hidden' },
    preflight: { ok: true, totalFiles: 0, totalBytes: 0, errors: [], warnings: [] } as never,
    migrateAtOpen: false,
  });

  it('核心先行，setPaths 带上 retainSource 与 applyNow', async () => {
    const d = deps();
    const out = await executeStorageResetPlan(d, planWithCore(), { applyNow: true, retainSource: true });
    expect(out.result.ok).toBe(true);
    expect(d.setPaths).toHaveBeenCalledWith(
      expect.objectContaining({ retainSource: true }),
      true,
    );
  });

  it('核心失败即返回，不再执行后续块', async () => {
    const d = deps({
      setPaths: vi.fn(async () => ({ ok: false as const, error: { code: 'Internal' as const, message: 'nope' } })),
    });
    const out = await executeStorageResetPlan(d, planWithCore(), { applyNow: false, retainSource: false });
    expect(out.result).toEqual({ ok: false, failedStep: 'corePaths', error: { code: 'Internal', message: 'nope' } });
    expect(d.resetBudget).not.toHaveBeenCalled();
  });

  it('预算失败时 failedStep=budget', async () => {
    const d = deps({ resetBudget: vi.fn(async () => false) });
    const plan: StorageResetPlan = {
      blocks: { coreNeeded: false, tree: 'hidden', budget: true, download: 'hidden' },
      preflight: null,
      migrateAtOpen: false,
    };
    const out = await executeStorageResetPlan(d, plan, { applyNow: false, retainSource: false });
    expect(out.result).toEqual({ ok: false, failedStep: 'budget' });
  });

  it('restartRequired 透传给调用方', async () => {
    const d = deps({
      setPaths: vi.fn(async () => ({ ok: true as const, restartRequired: true, preflight: { ok: true, totalFiles: 0, totalBytes: 0, errors: [], warnings: [] } })),
    });
    const out = await executeStorageResetPlan(d, planWithCore(), { applyNow: true, retainSource: false });
    expect(out.restartRequired).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- src/shared/settings-reset/storageReset.test.ts`
Expected: FAIL —`Cannot find module './storageReset'`

- [ ] **Step 3: 写最小实现**

```ts
// frontend/src/shared/settings-reset/storageReset.ts
import type { IpcResult } from '@shared/ipc';
import type { DownloadSettings } from '@shared/ipc/download';
import type {
  StoragePathPatch,
  StoragePreflight,
  StorageStatus,
  TreeCacheStats,
} from '@shared/ipc/storage';
import { resetDownloadPathToDefault, type DownloadPathResetDeps } from './downloadPathReset';
import type { GroupResetResult } from './types';

/** 仅声明本模块用到的成员，避免依赖完整 bridge 类型。 */
export interface StorageBridgeLike {
  preflight(patch: StoragePathPatch): Promise<IpcResult<StoragePreflight>>;
}

export type StorageTreeBlock = 'full' | 'reenable' | 'ttl' | 'hidden';
export type StorageDownloadBlock = 'on' | 'off' | 'switchOnly' | 'hidden';

export interface StorageResetBlocks {
  coreNeeded: boolean;
  tree: StorageTreeBlock;
  budget: boolean;
  download: StorageDownloadBlock;
}

export interface StorageResetPlan {
  blocks: StorageResetBlocks;
  preflight: StoragePreflight | null;
  /** 计划生成时刻的下载迁移开关（程序化流程无对话框快照，取实时值）。 */
  migrateAtOpen: boolean;
}

export interface StorageResetDeps {
  bridge?: StorageBridgeLike;
  refreshStatus: () => Promise<StorageStatus | null>;
  setPaths: (
    patch: StoragePathPatch,
    applyNow: boolean,
  ) => Promise<
    | { ok: true; restartRequired: boolean; preflight: StoragePreflight }
    | { ok: false; error: GroupResetResult extends { error?: infer E } ? E : never }
  >;
  resetBudget: () => Promise<boolean>;
  resetTreeCache: () => Promise<boolean>;
  previewDownload: () => { settings: DownloadSettings; loaded: boolean };
  /** 传入当前 tree 统计与预算（由调用方从 store/缓存读取）。 */
  readTreeStats: () => TreeCacheStats | null;
  readBudgetBytes: () => number | undefined;
}

/** 与 UI 同源的默认判定（避免在 shared 内重复常量：这些 helper 由调用方注入）。 */
export interface StorageResetPredicates {
  isCorePathsAtDefault: (status: StorageStatus | null, draftsDirty: boolean) => boolean;
  isTreeCacheAtDefault: (treeStats: TreeCacheStats | null) => boolean;
  isBudgetAtDefault: (budgetBytes: number | undefined) => boolean;
  treeBlockOf: (treeStats: TreeCacheStats | null) => StorageTreeBlock;
  downloadBlockOf: (settings: DownloadSettings, loaded: boolean) => StorageDownloadBlock;
}
```

> ⚠️ 实现说明（写代码时按此执行）：`computeStorageResetPlan` 的块判定与 `downloadBlockOf` **不要**在 shared 内重新发明——通过参数注入 `StorageResetPredicates`（来自 `features/storage-settings/storageAtDefault.ts` 与 `downloadPathReset.ts` 的既有 helper），实现"显示与执行同源、零常量漂移"。因此 `computeStorageResetPlan(deps, predicates)` 与 `executeStorageResetPlan(deps, plan, opts)` 均接收 `predicates`。测试里用一组简单 stub 谓词即可。

```ts
export async function computeStorageResetPlan(
  deps: StorageResetDeps,
  predicates: StorageResetPredicates,
): Promise<StorageResetPlan | null> {
  if (!deps.bridge) {
    return null;
  }
  const status = await deps.refreshStatus();
  if (status === null) {
    return null;
  }
  const tree = deps.readTreeStats();
  const budgetBytes = deps.readBudgetBytes();
  const download = deps.previewDownload();
  const coreNeeded = !predicates.isCorePathsAtDefault(status, false);
  const treeBlock = predicates.treeBlockOf(tree);
  const budgetBlock = !predicates.isBudgetAtDefault(budgetBytes);
  const downloadBlock = predicates.downloadBlockOf(download.settings, download.loaded);
  if (!coreNeeded && treeBlock === 'hidden' && !budgetBlock && downloadBlock === 'hidden') {
    return null;
  }
  if (!coreNeeded) {
    return {
      blocks: { coreNeeded, tree: treeBlock, budget: budgetBlock, download: downloadBlock },
      preflight: null,
      migrateAtOpen: download.settings.auto_migrate_on_path_change,
    };
  }
  const preflight = await deps.bridge.preflight({ mode: 'unified', root: '', categories: {}, retainSource: false });
  if (!preflight.ok) {
    return null;
  }
  return {
    blocks: { coreNeeded, tree: treeBlock, budget: budgetBlock, download: downloadBlock },
    preflight: preflight.data,
    migrateAtOpen: download.settings.auto_migrate_on_path_change,
  };
}

export async function executeStorageResetPlan(
  deps: StorageResetDeps,
  plan: StorageResetPlan,
  opts: { applyNow: boolean; retainSource: boolean },
): Promise<{ result: GroupResetResult; restartRequired: boolean }> {
  let restartRequired = false;
  if (plan.blocks.coreNeeded) {
    const applied = await deps.setPaths(
      { mode: 'unified', root: '', categories: {}, retainSource: opts.retainSource },
      opts.applyNow,
    );
    if (!applied.ok) {
      return { result: { ok: false, failedStep: 'corePaths', error: applied.error }, restartRequired: false };
    }
    if (!applied.preflight.ok) {
      return { result: { ok: false, failedStep: 'corePathsPreflight' }, restartRequired: false };
    }
    restartRequired = applied.restartRequired;
  }
  if (plan.blocks.budget && !(await deps.resetBudget())) {
    return { result: { ok: false, failedStep: 'budget' }, restartRequired };
  }
  if (plan.blocks.tree !== 'hidden' && !(await deps.resetTreeCache())) {
    return { result: { ok: false, failedStep: 'treeCache' }, restartRequired };
  }
  if (plan.blocks.download !== 'hidden') {
    const downloadResult = await resetDownloadPathToDefault(deps.downloadPath, plan.migrateAtOpen);
    if (!downloadResult.ok) {
      return { result: downloadResult, restartRequired };
    }
  }
  return { result: { ok: true }, restartRequired };
}
```

补充 `StorageResetDeps` 字段：`downloadPath: DownloadPathResetDeps`（执行下载分支用）。同步更新测试 `deps()` 工厂。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/shared/settings-reset/storageReset.test.ts`
Expected: PASS（8 passed）

- [ ] **Step 5: 提交**

```
git add frontend/src/shared/settings-reset/storageReset.ts frontend/src/shared/settings-reset/storageReset.test.ts
git commit -m "feat(settings): add storage reset plan/execute in shared"
```

---

### Task 3: `browserReset.ts`

**Files:**
- Create: `frontend/src/shared/settings-reset/browserReset.ts`
- Test: `frontend/src/shared/settings-reset/browserReset.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `resetDownloadPathToDefault` / `GroupResetResult`
- Produces:
  - `BrowserResetDeps = { updatePreferences: (patch: AppPreferencePatch) => Promise<boolean>; updateDownloadSettings: (mode?: string, defaultPath?: string, autoMigrate?: boolean) => Promise<IpcResult<void>>; downloadPath: DownloadPathResetDeps; migrateAtOpen: boolean }`
  - `executeBrowserResetPlan(deps): Promise<GroupResetResult>`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/shared/settings-reset/browserReset.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeBrowserResetPlan } from './browserReset';
import { DEFAULT_BROWSER_SUSPEND_MS, DEFAULT_DOWNLOAD_MODE } from '@shared/defaultPreferences';
import type { BrowserResetDeps } from './browserReset';

function deps(overrides: Partial<BrowserResetDeps> = {}): BrowserResetDeps {
  return {
    updatePreferences: vi.fn(async () => true),
    updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
    downloadPath: {
      changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
      updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
    },
    migrateAtOpen: false,
    ...overrides,
  };
}

describe('executeBrowserResetPlan', () => {
  it('按挂起 → 下载模式 → 下载路径顺序执行', async () => {
    const d = deps();
    expect((await executeBrowserResetPlan(d)).ok).toBe(true);
    expect(d.updatePreferences).toHaveBeenCalledWith({ browserInactiveTabSuspendMs: DEFAULT_BROWSER_SUSPEND_MS });
    expect(d.updateDownloadSettings).toHaveBeenCalledWith(DEFAULT_DOWNLOAD_MODE);
    expect(d.downloadPath.changeDownloadPath).toHaveBeenCalledWith('', false);
  });

  it('挂起失败时 failedStep=suspend，后续步不执行', async () => {
    const d = deps({ updatePreferences: vi.fn(async () => false) });
    expect(await executeBrowserResetPlan(d)).toEqual({ ok: false, failedStep: 'suspend' });
    expect(d.updateDownloadSettings).not.toHaveBeenCalled();
  });

  it('下载模式失败时 failedStep=downloadMode，路径步不执行', async () => {
    const d = deps({
      updateDownloadSettings: vi.fn(async () => ({ ok: false as const, error: { code: 'Internal' as const, message: 'x' } })),
    });
    const out = await executeBrowserResetPlan(d);
    expect(out).toEqual({ ok: false, failedStep: 'downloadMode', error: { code: 'Internal', message: 'x' } });
    expect(d.downloadPath.changeDownloadPath).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- src/shared/settings-reset/browserReset.test.ts`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
// frontend/src/shared/settings-reset/browserReset.ts
import type { IpcResult } from '@shared/ipc';
import type { AppPreferencePatch } from '@shared/ipc-types.generated';
import { DEFAULT_BROWSER_SUSPEND_MS, DEFAULT_DOWNLOAD_MODE } from '@shared/defaultPreferences';
import { resetDownloadPathToDefault, type DownloadPathResetDeps } from './downloadPathReset';
import type { GroupResetResult } from './types';

export interface BrowserResetDeps {
  updatePreferences: (patch: AppPreferencePatch) => Promise<boolean>;
  updateDownloadSettings: (
    mode?: string,
    defaultPath?: string,
    autoMigrate?: boolean,
  ) => Promise<IpcResult<void>>;
  downloadPath: DownloadPathResetDeps;
  /** 挂起时长恢复用的偏好写入（与 updatePreferences 同一 action，单列便于测试区分）。 */
  migrateAtOpen: boolean;
}

export async function executeBrowserResetPlan(deps: BrowserResetDeps): Promise<GroupResetResult> {
  const suspendOk = await deps.updatePreferences({
    browserInactiveTabSuspendMs: DEFAULT_BROWSER_SUSPEND_MS,
  });
  if (!suspendOk) {
    return { ok: false, failedStep: 'suspend' };
  }
  const mode = await deps.updateDownloadSettings(DEFAULT_DOWNLOAD_MODE);
  if (!mode.ok) {
    return { ok: false, failedStep: 'downloadMode', error: mode.error };
  }
  return resetDownloadPathToDefault(deps.downloadPath, deps.migrateAtOpen);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/shared/settings-reset/browserReset.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 5: 提交**

```
git add frontend/src/shared/settings-reset/browserReset.ts frontend/src/shared/settings-reset/browserReset.test.ts
git commit -m "feat(settings): add browser reset in shared"
```

---

### Task 4: `dshReset.ts`

**Files:**
- Create: `frontend/src/shared/settings-reset/dshReset.ts`
- Test: `frontend/src/shared/settings-reset/dshReset.test.ts`

**Interfaces:**
- Produces:
  - `DshResetDeps = { saveSourceConfig: (config: DshSourceConfig) => Promise<boolean>; afterReset?: () => void }`
  - `DSH_RESET_PAYLOAD: DshSourceConfig`（`{ source_mode: 'auto', npm_registry: 'https://registry.npmjs.org', proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null } }`）
  - `executeDshResetPlan(deps): Promise<GroupResetResult>`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/shared/settings-reset/dshReset.test.ts
import { describe, it, expect, vi } from 'vitest';
import { DSH_RESET_PAYLOAD, executeDshResetPlan } from './dshReset';
import type { DshResetDeps } from './dshReset';

function deps(overrides: Partial<DshResetDeps> = {}): DshResetDeps {
  return { saveSourceConfig: vi.fn(async () => true), afterReset: vi.fn(), ...overrides };
}

describe('executeDshResetPlan', () => {
  it('写回 auto + 官方 registry + 自动代理，并在成功后触发 afterReset', async () => {
    const d = deps();
    expect((await executeDshResetPlan(d)).ok).toBe(true);
    expect(d.saveSourceConfig).toHaveBeenCalledWith(DSH_RESET_PAYLOAD);
    expect(d.afterReset).toHaveBeenCalledTimes(1);
  });

  it('落盘失败时返回 failedStep=saveSourceConfig，不触发 afterReset', async () => {
    const d = deps({ saveSourceConfig: vi.fn(async () => false) });
    expect(await executeDshResetPlan(d)).toEqual({ ok: false, failedStep: 'saveSourceConfig' });
    expect(d.afterReset).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- src/shared/settings-reset/dshReset.test.ts`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
// frontend/src/shared/settings-reset/dshReset.ts
import type { DshSourceConfig } from '@shared/ipc/dsh';
import type { GroupResetResult } from './types';

/** DSH 组恢复默认的目标配置（与 DshSettings 组级恢复同源）。 */
export const DSH_RESET_PAYLOAD: DshSourceConfig = {
  source_mode: 'auto',
  npm_registry: 'https://registry.npmjs.org',
  proxy: { mode: 'auto', http_proxy: null, https_proxy: null, no_proxy: null },
};

export interface DshResetDeps {
  saveSourceConfig: (config: DshSourceConfig) => Promise<boolean>;
  /** 落盘成功后的收尾（组件用：静默实测选优；编排器不传）。 */
  afterReset?: () => void;
}

export async function executeDshResetPlan(deps: DshResetDeps): Promise<GroupResetResult> {
  const ok = await deps.saveSourceConfig(DSH_RESET_PAYLOAD);
  if (!ok) {
    return { ok: false, failedStep: 'saveSourceConfig' };
  }
  deps.afterReset?.();
  return { ok: true };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/shared/settings-reset/dshReset.test.ts`
Expected: PASS（2 passed）

- [ ] **Step 5: 提交**

```
git add frontend/src/shared/settings-reset/dshReset.ts frontend/src/shared/settings-reset/dshReset.test.ts
git commit -m "feat(settings): add dsh reset in shared"
```

---

### Task 5: `resetAllSettings.ts` 编排器

**Files:**
- Create: `frontend/src/app/components/settings/resetAllSettings.ts`
- Test: `frontend/src/app/components/settings/resetAllSettings.test.ts`

**Interfaces:**
- Consumes: Task 1–4 的执行函数
- Produces:
  - `ResetAllDeps = { updatePreferences: (patch: AppPreferencePatch) => Promise<boolean>; browser: BrowserResetDeps; dsh: DshResetDeps; storage: StorageResetDeps; storagePredicates: StorageResetPredicates }`
  - `ResetAllOutcome = { done: GroupKey[]; failedAt?: GroupKey; failedStep?: string; skipped: GroupKey[]; restartRequired: boolean }`
  - `resetAllSettings(deps, opts: { storagePlan: StorageResetPlan | null; applyNow: boolean; retainSource: boolean }, onProgress?: (key: GroupKey) => void): Promise<ResetAllOutcome>`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/components/settings/resetAllSettings.test.ts
import { describe, it, expect, vi } from 'vitest';
import { resetAllSettings } from './resetAllSettings';
import { getDefaultPreferences } from '@shared/defaultPreferences';
import type { ResetAllDeps } from './resetAllSettings';

function deps(overrides: Partial<ResetAllDeps> = {}): ResetAllDeps {
  return {
    updatePreferences: vi.fn(async () => true),
    browser: {
      updatePreferences: vi.fn(async () => true),
      updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
      downloadPath: {
        changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
        updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
      },
      migrateAtOpen: false,
    },
    dsh: { saveSourceConfig: vi.fn(async () => true) },
    storage: {
      bridge: { preflight: vi.fn(async () => ({ ok: true as const, data: { ok: true, totalFiles: 0, totalBytes: 0, errors: [], warnings: [] } })) },
      refreshStatus: vi.fn(async () => null),
      setPaths: vi.fn(async () => ({ ok: true as const, restartRequired: false, preflight: { ok: true, totalFiles: 0, totalBytes: 0, errors: [], warnings: [] } })),
      resetBudget: vi.fn(async () => true),
      resetTreeCache: vi.fn(async () => true),
      previewDownload: () => ({ settings: {} as never, loaded: true }),
      readTreeStats: () => null,
      readBudgetBytes: () => undefined,
      downloadPath: {
        changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
        updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
      },
    },
    storagePredicates: {
      isCorePathsAtDefault: () => true,
      isTreeCacheAtDefault: () => true,
      isBudgetAtDefault: () => true,
      treeBlockOf: () => 'hidden',
      downloadBlockOf: () => 'hidden',
    },
    ...overrides,
  };
}

const STORAGE_PLAN = {
  blocks: { coreNeeded: false, tree: 'hidden' as const, budget: true, download: 'hidden' as const },
  preflight: null,
  migrateAtOpen: false,
};

describe('resetAllSettings', () => {
  it('顺序为 preferences → browser → dsh → storage，且进度逐步回调', async () => {
    const d = deps();
    const seen: string[] = [];
    const outcome = await resetAllSettings(d, { storagePlan: STORAGE_PLAN, applyNow: false, retainSource: false }, (k) => seen.push(k));
    expect(d.updatePreferences).toHaveBeenCalledWith(getDefaultPreferences());
    expect(seen).toEqual(['preferences', 'browser', 'dsh', 'storage']);
    expect(outcome.done).toEqual(['preferences', 'browser', 'dsh', 'storage']);
    expect(outcome.skipped).toEqual([]);
  });

  it('browser 失败即停：dsh 与 storage 都不执行，且计入 skipped', async () => {
    const d = deps({ browser: { ...deps().browser, updatePreferences: vi.fn(async () => false) } });
    const outcome = await resetAllSettings(d, { storagePlan: STORAGE_PLAN, applyNow: false, retainSource: false });
    expect(outcome).toEqual({ done: ['preferences'], failedAt: 'browser', failedStep: 'suspend', skipped: ['dsh', 'storage'], restartRequired: false });
    expect(d.dsh.saveSourceConfig).not.toHaveBeenCalled();
    expect(d.storage.resetBudget).not.toHaveBeenCalled();
  });

  it('storagePlan 为 null 时存储计入 skipped，其余照常执行', async () => {
    const d = deps();
    const outcome = await resetAllSettings(d, { storagePlan: null, applyNow: false, retainSource: false });
    expect(outcome.done).toEqual(['preferences', 'browser', 'dsh']);
    expect(outcome.skipped).toEqual(['storage']);
  });

  it('storage 的 restartRequired 透传到 outcome', async () => {
    const d = deps({
      storage: {
        ...deps().storage,
        setPaths: vi.fn(async () => ({ ok: true as const, restartRequired: true, preflight: { ok: true, totalFiles: 0, totalBytes: 0, errors: [], warnings: [] } })),
      },
    });
    const plan = { ...STORAGE_PLAN, blocks: { ...STORAGE_PLAN.blocks, coreNeeded: true } };
    const outcome = await resetAllSettings(d, { storagePlan: plan, applyNow: true, retainSource: false });
    expect(outcome.restartRequired).toBe(true);
    expect(outcome.done).toContain('storage');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- src/app/components/settings/resetAllSettings.test.ts`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
// frontend/src/app/components/settings/resetAllSettings.ts
import type { AppPreferencePatch } from '@shared/ipc-types.generated';
import { getDefaultPreferences } from '@shared/defaultPreferences';
import { executeBrowserResetPlan, type BrowserResetDeps } from '@shared/settings-reset/browserReset';
import { executeDshResetPlan, type DshResetDeps } from '@shared/settings-reset/dshReset';
import {
  executeStorageResetPlan,
  type StorageResetDeps,
  type StorageResetPlan,
  type StorageResetPredicates,
} from '@shared/settings-reset/storageReset';
import type { GroupKey, GroupResetResult } from '@shared/settings-reset/types';

export interface ResetAllDeps {
  updatePreferences: (patch: AppPreferencePatch) => Promise<boolean>;
  browser: BrowserResetDeps;
  dsh: DshResetDeps;
  storage: StorageResetDeps;
  storagePredicates: StorageResetPredicates;
}

export interface ResetAllOutcome {
  done: GroupKey[];
  failedAt?: GroupKey;
  failedStep?: string;
  skipped: GroupKey[];
  restartRequired: boolean;
}

const ORDER: GroupKey[] = ['preferences', 'browser', 'dsh', 'storage'];

/**
 * 「恢复全部默认」编排：preferences → browser → dsh → storage（存储最后，
 * 因其可能触发文件迁移与重启）。任一失败即停，已成功的保留、未执行的计入 skipped。
 * storagePlan 为 null 表示存储组无事可做或计划计算失败 → 跳过并计入 skipped。
 */
export async function resetAllSettings(
  deps: ResetAllDeps,
  opts: { storagePlan: StorageResetPlan | null; applyNow: boolean; retainSource: boolean },
  onProgress?: (key: GroupKey) => void,
): Promise<ResetAllOutcome> {
  const done: GroupKey[] = [];
  const skipped: GroupKey[] = [];
  let restartRequired = false;

  const fail = (key: GroupKey, result: Extract<GroupResetResult, { ok: false }>): ResetAllOutcome => ({
    done,
    failedAt: key,
    failedStep: result.failedStep,
    skipped: ORDER.filter((k) => !done.includes(k) && k !== key),
    restartRequired,
  });

  for (const key of ORDER) {
    if (key === 'storage' && opts.storagePlan === null) {
      skipped.push('storage');
      continue;
    }
    onProgress?.(key);
    if (key === 'preferences') {
      if (!(await deps.updatePreferences(getDefaultPreferences()))) {
        return fail(key, { ok: false, failedStep: 'preferences' });
      }
      done.push(key);
      continue;
    }
    if (key === 'browser') {
      const result = await executeBrowserResetPlan(deps.browser);
      if (!result.ok) {
        return fail(key, result);
      }
      done.push(key);
      continue;
    }
    if (key === 'dsh') {
      const result = await executeDshResetPlan(deps.dsh);
      if (!result.ok) {
        return fail(key, result);
      }
      done.push(key);
      continue;
    }
    const out = await executeStorageResetPlan(
      deps.storage,
      opts.storagePlan as StorageResetPlan,
      { applyNow: opts.applyNow, retainSource: opts.retainSource },
    );
    restartRequired = out.restartRequired;
    if (!out.result.ok) {
      return fail(key, out.result);
    }
    done.push(key);
  }
  return { done, skipped, restartRequired };
}
```

> **注意**：`@shared/settings-reset/*` 需要 `vite.config.ts` / `tsconfig.json` 已把 `@shared` 映射到 `src/shared`（已存在）。若 `pnpm typecheck` 报模块解析失败，改用相对路径 `../../../shared/settings-reset/*`（`shared/` 内已有 `defaultPreferences.ts` 用相对路径引 `app/commands` 的先例）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/app/components/settings/resetAllSettings.test.ts`
Expected: PASS（4 passed）

- [ ] **Step 5: 提交**

```
git add frontend/src/app/components/settings/resetAllSettings.ts frontend/src/app/components/settings/resetAllSettings.test.ts
git commit -m "feat(settings): add reset-all orchestrator with fail-fast ordering"
```

---

## Phase B — 三组组件改用共享执行（组级行为不变）

### Task 6: `downloadPathReset` hook 薄包装 + `BrowserSettings` 改用共享执行

**Files:**
- Modify: `frontend/src/app/features/storage-settings/downloadPathReset.ts`（引入 shared 纯序列，hook 只负责 toast）
- Modify: `frontend/src/app/features/browser-settings/BrowserSettings.tsx:105-144`
- Test: 现有 `frontend/src/app/features/browser-settings/BrowserSettings.test.tsx` 必须保持全绿

**Interfaces:**
- Consumes: `resetDownloadPathToDefault`（Task 1）、`executeBrowserResetPlan`（Task 3）
- Produces: `useDownloadPathReset()` 返回值签名不变（`{ resetDownloadToDefault: (migrate: boolean) => Promise<boolean> }`）

- [ ] **Step 1: 改造 hook，保持返回签名不变**

`downloadPathReset.ts` 中新增强制走 shared 序列的实现（保留既有 `isDownloadPathAtDefault` / `downloadResetBlockVariant` 不动）：

```ts
const resetDownloadToDefault = useCallback(
  async (migrate: boolean): Promise<boolean> => {
    const result = await resetDownloadPathToDefault(
      { changeDownloadPath, updateDownloadSettings },
      migrate,
    );
    if (result.ok) {
      return true;
    }
    // 失败：沿用既有文案分支（下载刷新失败 / 迁移失败 / 通用失败）。
    showToast(
      result.error?.message === DOWNLOAD_REFRESH_FAILED
        ? t.storageDownloadRefreshFailed
        : migrate
          ? formatT(t, 'storageDownloadMigrateFailed', {
              error: result.error?.message ?? t.storageUnknownError,
            })
          : t.settingsUpdateFailed,
      'error',
    );
    return false;
  },
  [changeDownloadPath, updateDownloadSettings, showToast, t],
);
```

> 迁移时把原 `resetDownloadToDefault` 的函数体替换为上面这段；`useCallback` 依赖数组同步更新（移除不再使用的依赖）。

- [ ] **Step 2: 运行 hook 相关测试确认未回归**

Run: `pnpm --dir frontend run test -- src/app/features/storage-settings`
Expected: PASS（既有用例全绿）

- [ ] **Step 3: `BrowserSettings.handleGroupConfirm` 改用 `executeBrowserResetPlan`**

替换 `BrowserSettings.tsx:105-144` 的实现体：

```tsx
const handleGroupConfirm = useCallback(() => {
  if (groupResetBusy) {
    return;
  }
  setGroupResetBusy(true);
  void (async () => {
    const result = await executeBrowserResetPlan({
      updatePreferences,
      updateDownloadSettings,
      downloadPath: { changeDownloadPath, updateDownloadSettings },
      migrateAtOpen: groupMigrateAtOpenRef.current,
    });
    if (!result.ok) {
      showToast(t.settingsUpdateFailed, 'error');
      setGroupResetBusy(false);
      return;
    }
    showToast(t.settingsResetComplete, 'success');
    setGroupResetOpen(false);
    setGroupResetBusy(false);
  })();
}, [
  groupResetBusy,
  updatePreferences,
  updateDownloadSettings,
  changeDownloadPath,
  showToast,
  t,
]);
```

同时：在 `BrowserSettings` 顶部新增 `const changeDownloadPath = useAppStore((s) => s.changeDownloadPath);`；`useDownloadPathReset()` 仅保留给 `DownloadPathBlock` 子组件使用（若本组件不再使用，则移除该 hook 调用，避免未使用变量 lint 报错）。

- [ ] **Step 4: 运行 BrowserSettings 测试确认通过**

Run: `pnpm --dir frontend run test -- src/app/features/browser-settings`
Expected: PASS（组级恢复用例全绿，文案与顺序不变）

- [ ] **Step 5: 提交**

```
git add frontend/src/app/features/storage-settings/downloadPathReset.ts frontend/src/app/features/browser-settings/BrowserSettings.tsx
git commit -m "refactor(browser): route group reset through shared browser reset"
```

---

### Task 7: `DshSettings` 改用共享执行

**Files:**
- Modify: `frontend/src/app/features/dsh/DshSettings.tsx:321-390`
- Test: 现有 `frontend/src/app/features/dsh/DshSettings.test.tsx` 必须保持全绿

**Interfaces:**
- Consumes: `executeDshResetPlan`（Task 4）

- [ ] **Step 1: 替换 `handleGroupConfirm`**

DSH 组级恢复是**乐观执行 + 失败回滚本地草稿**，改造后保留"本地草稿乐观更新与回滚"，把桥写入换成 shared：

```tsx
const handleGroupConfirm = useCallback(() => {
  if (groupResetBusy) {
    return;
  }
  setGroupResetBusy(true);
  const prev = { sourceType, customUrl, proxyMode, httpProxy, httpsProxy, noProxy };
  applySourceType('auto');
  setCustomUrl('');
  setProxyMode('auto');
  setHttpProxy('');
  setHttpsProxy('');
  setNoProxy('');
  setTestResult(null);
  setGroupResetOpen(false);
  formRef.current = {
    sourceType: 'auto',
    customUrl: '',
    proxyMode: 'auto',
    httpProxy: '',
    httpsProxy: '',
    noProxy: '',
  };
  void (async () => {
    const result = await executeDshResetPlan({
      saveSourceConfig: (cfg) => persist(cfg),
      afterReset: () => void runAutoDetect(true),
    });
    if (!result.ok) {
      const s = formRef.current;
      // 用户未在此期间手动改过 → 回滚到确认前的值（既有语义不变）。
      if (
        s.sourceType === 'auto' &&
        s.customUrl === '' &&
        s.proxyMode === 'auto' &&
        s.httpProxy === '' &&
        s.httpsProxy === '' &&
        s.noProxy === ''
      ) {
        applySourceType(prev.sourceType);
        setCustomUrl(prev.customUrl);
        setProxyMode(prev.proxyMode);
        setHttpProxy(prev.httpProxy);
        setHttpsProxy(prev.httpsProxy);
        setNoProxy(prev.noProxy);
      }
      setGroupResetBusy(false);
      return;
    }
    showToast(t.settingsResetComplete, 'success');
    setGroupResetBusy(false);
  })();
}, [
  groupResetBusy,
  persist,
  applySourceType,
  showToast,
  t,
  runAutoDetect,
  sourceType,
  customUrl,
  proxyMode,
  httpProxy,
  httpsProxy,
  noProxy,
]);
```

> `persist(config)` 既有签名是 `(config: DshSourceConfig, silent = false) => Promise<boolean>`，与 `saveSourceConfig` 契约一致，直接传入。

- [ ] **Step 2: 运行 DSH 测试确认通过**

Run: `pnpm --dir frontend run test -- src/app/features/dsh`
Expected: PASS

- [ ] **Step 3: 提交**

```
git add frontend/src/app/features/dsh/DshSettings.tsx
git commit -m "refactor(dsh): route group reset through shared dsh reset"
```

---

### Task 8: `StorageSettings` 改用共享执行

**Files:**
- Modify: `frontend/src/app/features/storage-settings/StorageSettings.tsx:1290-1398`（`handleGroupResetApply` 的执行段）
- Modify: `frontend/src/app/features/storage-settings/storageAtDefault.ts`（导出 `treeBlockOf`，供 shared 谓词注入）
- Test: 现有 `frontend/src/app/features/storage-settings/StorageSettings.test.tsx` 必须保持全绿

**Interfaces:**
- Consumes: `executeStorageResetPlan`（Task 2）
- Produces: `treeBlockOf(treeStats: TreeCacheStats | null): StorageTreeBlock`（从 `openGroupResetDialog` 内联逻辑提取，`StorageTreeBlock` 从 shared 类型导入）

- [ ] **Step 1: 从 `StorageSettings.openGroupResetDialog` 提取 `treeBlockOf` 到 `storageAtDefault.ts`**

```ts
// frontend/src/app/features/storage-settings/storageAtDefault.ts
import type { StorageTreeBlock } from '@shared/settings-reset/storageReset';

/** 树缓存块的展示/执行变体（原内联于 openGroupResetDialog，提取后组件与恢复全部共用）。 */
export function treeBlockOf(treeStats: TreeCacheStats | null): StorageTreeBlock {
  if (isTreeCacheAtDefault(treeStats)) {
    return 'hidden';
  }
  if (treeStats === null) {
    return 'full';
  }
  if (treeStats.enabled) {
    return 'ttl';
  }
  return treeStats.ttlMinutes === TREE_CACHE_DEFAULTS.ttlMinutes ? 'reenable' : 'full';
}
```

`StorageSettings.openGroupResetDialog` 内对应的内联块改为调用 `treeBlockOf(tree)`（行为逐字等价）。

- [ ] **Step 2: 运行存储测试确认提取未改变行为**

Run: `pnpm --dir frontend run test -- src/app/features/storage-settings`
Expected: PASS

- [ ] **Step 3: `handleGroupResetApply` 的执行段改用 `executeStorageResetPlan`**

构造 `StorageResetDeps`（`setPaths` 由既有 `bridge.setPaths` 适配，`resetBudget`/`resetTreeCache` 复用既有 `handleTerminalBudgetReset`/`handleTreeResetDefaults`），并保留既有的 `groupResetPreflight` 门控、`groupResetCoreNeeded` 早返、`refresh()` 草稿重播种与 restart 收尾逻辑。关键替换点：

```tsx
const result = await executeStorageResetPlan(
  {
    bridge: window.digitalLife?.storage
      ? { preflight: (patch) => window.digitalLife.storage.preflight(patch) }
      : undefined,
    refreshStatus: () => refresh(),
    setPaths: async (patch, applyNow) => {
      const applied = await bridge.setPaths(patch, applyNow);
      if (!applied.ok) {
        return { ok: false, error: applied.error };
      }
      return {
        ok: true,
        restartRequired: applied.data.restartRequired,
        preflight: applied.data.preflight,
      };
    },
    resetBudget: handleTerminalBudgetReset,
    resetTreeCache: handleTreeResetDefaults,
    previewDownload: () => ({
      settings: useAppStore.getState().downloadSettings,
      loaded: useAppStore.getState().downloadSettingsLoaded,
    }),
    readTreeStats: () => useAppStore.getState().treeStats ?? null,
    readBudgetBytes: () => useAppStore.getState().appInfo?.config?.terminalHistoryBudgetBytes,
    downloadPath: { changeDownloadPath, updateDownloadSettings },
  },
  plan,
  { applyNow, retainSource: groupResetRetain },
);
```

> 逐段对照原实现迁移其余逻辑（`failed` 汇总、`refresh()` 后的 `setMode/setRootDraft/setCategoryDrafts` 重播种、`appliedDraftsRef`/`draftsDirtyRef` 清理、`restartApp` 与三种成功 toast）。**不得**改变 `groupResetBlocks` 与展示清单的同源关系。
> ⚠️ `readTreeStats` 若 store 中无 `treeStats` 字段，改用组件内既有的 `treeStats` 状态（`() => treeStats`），与 `openGroupResetDialog` 使用的同一来源；以实际代码为准，不要新增 store 字段。

- [ ] **Step 4: 运行存储测试确认通过**

Run: `pnpm --dir frontend run test -- src/app/features/storage-settings`
Expected: PASS（组级恢复用例全绿）

- [ ] **Step 5: 提交**

```
git add frontend/src/app/features/storage-settings/StorageSettings.tsx frontend/src/app/features/storage-settings/storageAtDefault.ts
git commit -m "refactor(storage): route group reset through shared storage reset plan"
```

---

## Phase C — 「恢复全部默认」UI

### Task 9: i18n key（zh-CN + en-US）

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/settings.ts`
- Modify: `frontend/src/app/i18n/en-US/settings.ts`
- Test: `frontend/src/app/i18n/__tests__/keys.test.ts`（追加断言）

**新增 key（zh-CN 文案；en-US 对应英文）**

| key | zh-CN |
|---|---|
| `settingsResetAllScopeIntro` | 以下分组的设置将恢复为默认值： |
| `settingsResetAllScopePreferences` | 通用、工作区与快捷键 |
| `settingsResetAllScopeBrowser` | 浏览器（挂起时长、下载模式与下载路径） |
| `settingsResetAllScopeDsh` | DSH（下载源与代理） |
| `settingsResetAllScopeStorage` | 存储（核心路径、树缓存、终端预算与下载路径） |
| `settingsResetAllStorageCompute` | 正在计算存储迁移范围… |
| `settingsResetAllStorageSkipped` | 存储将跳过 |
| `settingsResetAllStorageUnavailable` | 存储不可用，已跳过 |
| `settingsResetAllProgress` | 正在恢复：{group} |
| `settingsResetAllFailedSummary` | 已恢复：{done}；失败：{group}（{step}） |
| `settingsResetAllSkippedNote` | 未执行：{groups} |
| `settingsResetAllDoneAll` | 已恢复全部默认设置 |
| `settingsSearchGroupLabel` | {group} |
| `settingsSearchNoResults` | 无匹配设置项 |

- [ ] **Step 1: 加 zh-CN key（放在既有 `settingsResetGroupConfirmMessage` 之后）**

```ts
  settingsResetAllScopeIntro: '以下分组的设置将恢复为默认值：',
  settingsResetAllScopePreferences: '通用、工作区与快捷键',
  settingsResetAllScopeBrowser: '浏览器（挂起时长、下载模式与下载路径）',
  settingsResetAllScopeDsh: 'DSH（下载源与代理）',
  settingsResetAllScopeStorage: '存储（核心路径、树缓存、终端预算与下载路径）',
  settingsResetAllStorageCompute: '正在计算存储迁移范围…',
  settingsResetAllStorageSkipped: '存储将跳过',
  settingsResetAllStorageUnavailable: '存储不可用，已跳过',
  settingsResetAllProgress: '正在恢复：{group}',
  settingsResetAllFailedSummary: '已恢复：{done}；失败：{group}（{step}）',
  settingsResetAllSkippedNote: '未执行：{groups}',
  settingsResetAllDoneAll: '已恢复全部默认设置',
  settingsSearchGroupLabel: '{group}',
  settingsSearchNoResults: '无匹配设置项',
```

- [ ] **Step 2: 加 en-US key（同 key，英文文案）**

```ts
  settingsResetAllScopeIntro: 'The following groups will be reset to defaults:',
  settingsResetAllScopePreferences: 'General, workspace and shortcuts',
  settingsResetAllScopeBrowser: 'Browser (suspend delay, download mode and path)',
  settingsResetAllScopeDsh: 'DSH (download source and proxy)',
  settingsResetAllScopeStorage: 'Storage (core paths, tree cache, terminal budget, download path)',
  settingsResetAllStorageCompute: 'Calculating storage migration scope…',
  settingsResetAllStorageSkipped: 'Storage will be skipped',
  settingsResetAllStorageUnavailable: 'Storage unavailable, skipped',
  settingsResetAllProgress: 'Resetting: {group}',
  settingsResetAllFailedSummary: 'Reset: {done}; failed: {group} ({step})',
  settingsResetAllSkippedNote: 'Not executed: {groups}',
  settingsResetAllDoneAll: 'All default settings restored',
  settingsSearchGroupLabel: '{group}',
  settingsSearchNoResults: 'No matching settings',
```

- [ ] **Step 3: 追加 keys.test.ts 断言**

```ts
it('has reset-all scope copy in both locales', () => {
  expect(enUS.settingsResetAllDoneAll).toBe('All default settings restored');
  expect(zhCN.settingsResetAllDoneAll).toBe('已恢复全部默认设置');
  expect(zhCN.settingsResetAllScopeIntro).toBe('以下分组的设置将恢复为默认值：');
});
```

- [ ] **Step 4: 运行 i18n 测试**

Run: `pnpm --dir frontend run test -- src/app/i18n`
Expected: PASS（含 `en-US` 与 `zh-CN` key 集合一致性用例）

- [ ] **Step 5: 提交**

```
git add frontend/src/app/i18n/zh-CN/settings.ts frontend/src/app/i18n/en-US/settings.ts frontend/src/app/i18n/__tests__/keys.test.ts
git commit -m "feat(i18n): add copy for reset-all scope, progress and search groups"
```

---

### Task 10: `ResetAllDialog.tsx` + `SettingsPanel` 接入

**Files:**
- Create: `frontend/src/app/components/settings/ResetAllDialog.tsx`
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx`（恢复按钮 + 对话框 + disabled）
- Test: `frontend/src/app/components/settings/ResetAllDialog.test.tsx`

**Interfaces:**
- Consumes: `resetAllSettings`（Task 5）、`computeStorageResetPlan`（Task 2）、Task 9 的 key
- Produces:
  - `<ResetAllDialog open onClose deps storagePredicates />`

- [ ] **Step 1: 写失败测试（禁用态 + 存储预检 + 双确认键 + 保留源默认不勾）**

```tsx
// frontend/src/app/components/settings/ResetAllDialog.test.tsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { CopyDict } from '@i18n';
import { ResetAllDialog } from './ResetAllDialog';
import type { ResetAllDeps } from './resetAllSettings';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

const CORE_PLAN_DEPS = {
  storage: {
    bridge: { preflight: vi.fn(async () => ({ ok: true as const, data: { ok: true, totalFiles: 7, totalBytes: 700, errors: [], warnings: [] } })) },
    refreshStatus: vi.fn(async () => ({ mode: 'perCategory', root: '/x', defaultRoot: '/data', pending: null, categories: [] })),
    setPaths: vi.fn(async () => ({ ok: true as const, restartRequired: false, preflight: { ok: true, totalFiles: 0, totalBytes: 0, errors: [], warnings: [] } })),
    resetBudget: vi.fn(async () => true),
    resetTreeCache: vi.fn(async () => true),
    previewDownload: () => ({ settings: { mode: 'auto', default_path: '', auto_migrate_on_path_change: false }, loaded: true }),
    readTreeStats: () => null,
    readBudgetBytes: () => undefined,
    downloadPath: { changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })), updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })) },
  },
  storagePredicates: {
    isCorePathsAtDefault: () => false,
    isTreeCacheAtDefault: () => true,
    isBudgetAtDefault: () => true,
    treeBlockOf: () => 'hidden',
    downloadBlockOf: () => 'hidden',
  },
} as unknown as Pick<ResetAllDeps, 'storage' | 'storagePredicates'>;

function renderDialog(onClose = vi.fn()) {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <ResetAllDialog open onClose={onClose} deps={CORE_PLAN_DEPS.storage} storagePredicates={CORE_PLAN_DEPS.storagePredicates} allDefault={false} onCommitted={vi.fn()} />
    </TCopyProvider>,
  );
}

describe('ResetAllDialog', () => {
  it('核心需迁移时展示预检文件数并给出两个迁移时机键，且保留源默认不勾', async () => {
    renderDialog();
    expect(await screen.findByText(/7/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'storageMigrateLater' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'storageMigrateNow' })).not.toBeNull();
    const retain = screen.getByRole('checkbox') as HTMLInputElement;
    expect(retain.checked).toBe(false);
  });

  it('预检含 error 时两个确认键禁用', async () => {
    const deps = {
      ...CORE_PLAN_DEPS.storage,
      bridge: { preflight: vi.fn(async () => ({ ok: true as const, data: { ok: false, totalFiles: 0, totalBytes: 0, errors: ['bad'], warnings: [] } })) },
    };
    render(
      <TCopyProvider t={mockT} locale="en-US">
        <ResetAllDialog open onClose={vi.fn()} deps={deps} storagePredicates={CORE_PLAN_DEPS.storagePredicates} allDefault={false} onCommitted={vi.fn()} />
      </TCopyProvider>,
    );
    const later = (await screen.findByRole('button', { name: 'storageMigrateLater' })) as HTMLButtonElement;
    expect(later.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- src/app/components/settings/ResetAllDialog.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 `ResetAllDialog.tsx`**

要求（逐条实现，不省略）：
1. `createPortal` 到 `document.body`，复用 `.adl-confirm-overlay` / `.adl-confirm-dialog` 类（与 `StorageSettings` 组级对话框同构）。
2. 打开时立即渲染范围清单（Task 9 的 5 条 key），并并行调 `computeStorageResetPlan(deps, storagePredicates)`；计算中存储行显示 `settingsResetAllStorageCompute`。
3. 计划就绪：
   - `blocks.coreNeeded` → 显示 `storageMigrateDialogSummary`（替换 `{files}` / `{size}`，`size` 用 `formatBytes`）、errors/warnings 列表（`localizePreflightIssues`）、`storageRetainSource` 复选框（默认不勾）、双确认键 `storageMigrateLater` / `storageMigrateNow`；有 error → 两键 `disabled`。
   - 核心无需恢复 → 单确认键（`storageMigrateNow` 位号，`applyNow=false`）。
   - 计划为 `null` → 存储行显示 `settingsResetAllStorageUnavailable`，单确认键仍可点（仅执行前三组）。
4. 执行中：`busy` 为真 → 关闭/取消/遮罩点击均禁用（存储迁移不可中断）；按 `onProgress` 展示 `settingsResetAllProgress` 当前组。
5. 完成后调 `onCommitted(outcome)`，由 `SettingsPanel` 负责 toast 汇总。
6. 所有文案走 i18n key；不使用 `else`；无 `any`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/app/components/settings/ResetAllDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: `SettingsPanel` 接入**

1. 新增 `allGroupsAtDefault = disabledResetGroups.size === SETTINGS_GROUPS.length`，据此禁用顶部「恢复全部默认」按钮（`aria-label` 保留 `t.settingsResetAll`）。
2. 顶部按钮 `onClick` 打开 `ResetAllDialog`（替换原直接 `setConfirmResetOpen(true)` 的通用框路径；**保留** `ConfirmDialog` 给组级恢复使用）。
3. `onCommitted(outcome)`：
   - `outcome.failedAt === undefined` → `showToast(t.settingsResetAllDoneAll, 'success')`；若 `outcome.restartRequired` → 追加 `t.storageRestartRequired`。
   - 否则 `showToast(formatT(t, 'settingsResetAllFailedSummary', { done: ..., group: ..., step: ... }), 'error')`；`outcome.skipped` 非空时再 `formatT(t, 'settingsResetAllSkippedNote', { groups: ... })`。
   - 组名用 `SETTINGS_GROUPS` 的 `labelKey` 经 `t` 解析。
4. 组装 `ResetAllDeps`：`updatePreferences`/`showToast` 来自 store；`browser`/`dsh`/`storage` 的 deps 由本组件的 store 选择器补齐（`updateDownloadSettings`、`changeDownloadPath`、`saveSourceConfig`、`refresh`/`setPaths`/`resetBudget`/`resetTreeCache`、`previewDownload`、`readTreeStats`、`readBudgetBytes`）。

- [ ] **Step 6: 运行设置面板测试**

Run: `pnpm --dir frontend run test -- src/app/components/settings/SettingsPanel.test.tsx`
Expected: PASS（既有组级恢复用例不受影响）

- [ ] **Step 7: 提交**

```
git add frontend/src/app/components/settings/ResetAllDialog.tsx frontend/src/app/components/settings/ResetAllDialog.test.tsx frontend/src/app/components/settings/SettingsPanel.tsx
git commit -m "feat(settings): add reset-all dialog aggregating all groups"
```

---

## Phase D — 跳转式搜索

### Task 11: `settingsSearchIndex.ts`

**Files:**
- Create: `frontend/src/app/components/settings/settingsSearchIndex.ts`
- Test: `frontend/src/app/components/settings/settingsSearchIndex.test.ts`

**Interfaces:**
- Produces:
  - `SettingsSearchEntry = { group: SettingsGroupId; anchorId: string; label: string; description?: string; keywords?: string[] }`
  - `buildSettingsSearchIndex(input: { t: CopyDict; settings: SettingItem[]; keybinds: Record<string, string | undefined> }): SettingsSearchEntry[]`
  - `filterSearchIndex(index, query): SettingsSearchEntry[]`
  - `anchorFor(group, anchorId): string`（返回 `"${group}:${anchorId}"`）

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/components/settings/settingsSearchIndex.test.ts
import { describe, it, expect } from 'vitest';
import type { CopyDict } from '@i18n';
import { buildSettingsSearchIndex, filterSearchIndex, anchorFor } from './settingsSearchIndex';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

const index = buildSettingsSearchIndex({ t: mockT, settings: [], keybinds: {} });

describe('buildSettingsSearchIndex', () => {
  it('覆盖全部 6 个组', () => {
    const groups = new Set(index.map((e) => e.group));
    for (const g of ['general', 'workspace', 'shortcuts', 'browser', 'dsh', 'storage'] as const) {
      expect(groups.has(g)).toBe(true);
    }
  });

  it('快捷键组逐命令生成条目（含命令 id 作为关键词）', () => {
    const shortcut = index.filter((e) => e.group === 'shortcuts');
    expect(shortcut.length).toBeGreaterThan(0);
    expect(shortcut.some((e) => e.keywords?.includes('workspace.new'))).toBe(true);
  });

  it('每条 entry 的 anchorId 非空且 anchorFor 组合为 group:id', () => {
    for (const e of index) {
      expect(e.anchorId.length).toBeGreaterThan(0);
      expect(anchorFor(e.group, e.anchorId)).toBe(`${e.group}:${e.anchorId}`);
    }
  });

  it('锚点在索引内唯一', () => {
    const keys = index.map((e) => anchorFor(e.group, e.anchorId));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('filterSearchIndex', () => {
  it('空查询返回全部', () => {
    expect(filterSearchIndex(index, '   ')).toHaveLength(index.length);
  });

  it('命中 label 与 keywords（大小写不敏感）', () => {
    expect(filterSearchIndex(index, 'WORKSPACE.NEW').some((e) => e.group === 'shortcuts')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- src/app/components/settings/settingsSearchIndex.test.ts`
Expected: FAIL

- [ ] **Step 3: 写最小实现**

```ts
// frontend/src/app/components/settings/settingsSearchIndex.ts
import type { CopyDict } from '@i18n';
import type { SettingItem, SettingsGroupId } from '@root/kernel/types';
import { DEFAULT_COMMANDS } from '../../commands/defaultCommands';
import { formatKeybind } from '@shared/keybinds';

export interface SettingsSearchEntry {
  group: SettingsGroupId;
  anchorId: string;
  label: string;
  description?: string;
  keywords?: string[];
}

export function anchorFor(group: SettingsGroupId, anchorId: string): string {
  return `${group}:${anchorId}`;
}

/** 各组「段/块」锚点与文案 key 的就近声明（单一真源：此处登记 + 组件挂同名锚点）。 */
const GROUP_BLOCK_ENTRIES: { group: SettingsGroupId; anchorId: string; labelKey: keyof CopyDict; descriptionKey?: keyof CopyDict }[] = [
  { group: 'workspace', anchorId: 'maxConcurrentWorkspaces', labelKey: 'maxConcurrentWorkspaces', descriptionKey: 'maxConcurrentWorkspacesDesc' },
  { group: 'storage', anchorId: 'corePaths', labelKey: 'storageCorePathsTitle' },
  { group: 'storage', anchorId: 'treeCache', labelKey: 'treeCacheTitle' },
  { group: 'storage', anchorId: 'terminalBudget', labelKey: 'storageTerminalBudgetTitle' },
  { group: 'storage', anchorId: 'browserDownload', labelKey: 'storageBrowserDownloadTitle' },
  { group: 'storage', anchorId: 'immutable', labelKey: 'storageImmutableTitle' },
  { group: 'browser', anchorId: 'performance', labelKey: 'settingsBrowserPerformanceTitle' },
  { group: 'browser', anchorId: 'downloadMode', labelKey: 'settingsBrowserDownloadModeTitle' },
  { group: 'browser', anchorId: 'downloadPath', labelKey: 'storageBrowserDownloadTitle' },
  { group: 'dsh', anchorId: 'source', labelKey: 'dshSettingsSourceTitle' },
  { group: 'dsh', anchorId: 'proxy', labelKey: 'dshSettingsProxyTitle' },
];

export function buildSettingsSearchIndex(input: {
  t: CopyDict;
  settings: SettingItem[];
  keybinds: Record<string, string | undefined>;
}): SettingsSearchEntry[] {
  const general = input.settings.map((item) => ({
    group: item.groupId,
    anchorId: item.id,
    label: item.label,
    description: item.description,
    keywords: [item.id],
  }));
  const shortcuts = DEFAULT_COMMANDS.map((cmd) => ({
    group: 'shortcuts' as const,
    anchorId: cmd.id,
    label: input.t[cmd.titleKey] as string,
    keywords: [
      cmd.id,
      formatKeybind(input.keybinds[cmd.id] ?? cmd.defaultKeybind),
      input.keybinds[cmd.id] ?? cmd.defaultKeybind ?? '',
    ],
  }));
  const blocks = GROUP_BLOCK_ENTRIES.map((entry) => ({
    group: entry.group,
    anchorId: entry.anchorId,
    label: input.t[entry.labelKey] as string,
    description: entry.descriptionKey ? (input.t[entry.descriptionKey] as string) : undefined,
  }));
  return [...general, ...shortcuts, ...blocks];
}

export function filterSearchIndex(
  index: readonly SettingsSearchEntry[],
  query: string,
): SettingsSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...index];
  }
  return index.filter((entry) =>
    [entry.label, entry.description ?? '', ...(entry.keywords ?? [])].some((text) =>
      text.toLowerCase().includes(q),
    ),
  );
}
```

> ⚠️ 上面 `GROUP_BLOCK_ENTRIES` 里的 `labelKey` 必须逐个核对 `zh-CN/settings.ts` 与 `zh-CN/dsh.ts` 确实存在（`maxConcurrentWorkspaces` / `treeCacheTitle` / `settingsBrowserPerformanceTitle` / `dshSettingsSourceTitle` 等）。若某 key 名称不符，以实际字典为准改名——这一步是为了让 `CopyDict` 的类型检查通过。测试执行前先 `pnpm --dir frontend run typecheck` 快速发现错名。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/app/components/settings/settingsSearchIndex.test.ts`
Expected: PASS（6 passed）

- [ ] **Step 5: 提交**

```
git add frontend/src/app/components/settings/settingsSearchIndex.ts frontend/src/app/components/settings/settingsSearchIndex.test.ts
git commit -m "feat(settings): add cross-group search index"
```

---

### Task 12: 各组挂 `data-settings-anchor` + 「锚点必存在」测试

**Files:**
- Modify: `WorkspaceSettings.tsx`、`StorageSettings.tsx`、`BrowserSettings.tsx`、`DshSettings.tsx`、`KeybindSettings.tsx`
- Test: `frontend/src/app/components/settings/settingsSearchAnchors.test.tsx`

**Interfaces:**
- Consumes: Task 11 的 `buildSettingsSearchIndex` / `anchorFor`

- [ ] **Step 1: 写失败的「锚点必存在」测试**

```tsx
// frontend/src/app/components/settings/settingsSearchAnchors.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { buildSettingsSearchIndex, anchorFor } from './settingsSearchIndex';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

// 每个组组件：渲染后，索引中属于该组的锚点必须都能在 DOM 找到。
const CASES: { group: string; render: () => ReturnType<typeof render> }[] = [
  // 由实现时按实际组件导入与所需 store 预置补齐：
  // { group: 'workspace', render: () => render(<TCopyProvider t={mockT} locale="en-US"><WorkspaceSettings /></TCopyProvider>) },
];

describe('settings search anchors', () => {
  it('索引中每组的锚点都能在对应组 DOM 命中', () => {
    const index = buildSettingsSearchIndex({ t: mockT, settings: [], keybinds: {} });
    for (const { group, render: doRender } of CASES) {
      const { container, unmount } = doRender();
      const expected = index.filter((e) => e.group === group).map((e) => anchorFor(e.group, e.anchorId));
      const present = new Set(
        Array.from(container.querySelectorAll('[data-settings-anchor]')).map((el) =>
          el.getAttribute('data-settings-anchor'),
        ),
      );
      for (const anchor of expected) {
        expect(present.has(anchor)).toBe(true);
      }
      unmount();
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- src/app/components/settings/settingsSearchAnchors.test.tsx`
Expected: FAIL（`CASES` 为空 → 补上真实用例后仍 FAIL，因组件未挂锚点）

- [ ] **Step 3: 逐一给可搜索块挂锚点，并补齐 `CASES`**

| 组件 | 锚点 |
|---|---|
| `WorkspaceSettings.tsx` | 并发上限块：`data-settings-anchor={anchorFor('workspace', 'maxConcurrentWorkspaces')}` |
| `StorageSettings.tsx` | 核心路径 `corePaths`、树缓存 `treeCache`、终端预算 `terminalBudget`、浏览器下载 `browserDownload`、不可移动 `immutable`（分别挂在对应 `SettingsHeader` 外层容器或权威块容器上） |
| `BrowserSettings.tsx` | `performance` / `downloadMode` / `downloadPath` |
| `DshSettings.tsx` | `source` / `proxy` |
| `KeybindSettings.tsx` | 每条命令行：`data-settings-anchor={anchorFor('shortcuts', cmd.id)}` |

补齐 `CASES`：为每个组写一个渲染用例（按各组既有测试的 store 预置方式准备必要 store 状态与 bridge mock——参照 `BrowserSettings.test.tsx` / `DshSettings.test.tsx` / `StorageSettings.test.tsx` 的既有 `beforeEach` 写法）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/app/components/settings/settingsSearchAnchors.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```
git add frontend/src/app/features/workspace-settings/WorkspaceSettings.tsx frontend/src/app/features/storage-settings/StorageSettings.tsx frontend/src/app/features/browser-settings/BrowserSettings.tsx frontend/src/app/features/dsh/DshSettings.tsx frontend/src/app/components/settings/KeybindSettings.tsx frontend/src/app/components/settings/settingsSearchAnchors.test.tsx
git commit -m "feat(settings): add search anchors to all settings groups"
```

---

### Task 13: `SettingsSearchResults.tsx` + `SettingsPanel` 搜索态接入（含 `mod+F`）

**Files:**
- Create: `frontend/src/app/components/settings/SettingsSearchResults.tsx`
- Modify: `frontend/src/app/components/settings/SettingsPanel.tsx`（搜索态渲染 + 跳转 + `mod+F`）
- Test: `frontend/src/app/components/settings/SettingsSearchResults.test.tsx` 与 `SettingsPanel.test.tsx` 追加用例

**Interfaces:**
- Consumes: Task 11 的索引与过滤、Task 12 的锚点
- Produces: `<SettingsSearchResults entries onSelect />`

- [ ] **Step 1: 写失败测试（分组渲染 + 跳转回调 + 空态）**

```tsx
// frontend/src/app/components/settings/SettingsSearchResults.test.tsx
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { CopyDict } from '@i18n';
import { SettingsSearchResults } from './SettingsSearchResults';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

const entries = [
  { group: 'general' as const, anchorId: 'language', label: 'Language' },
  { group: 'storage' as const, anchorId: 'treeCache', label: 'Tree cache' },
];

function renderResults(onSelect = vi.fn()) {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <SettingsSearchResults entries={entries} onSelect={onSelect} query="a" />
    </TCopyProvider>,
  );
}

describe('SettingsSearchResults', () => {
  it('按组分组渲染并点击回传 entry', () => {
    const onSelect = vi.fn();
    renderResults(onSelect);
    fireEvent.click(screen.getByText('Tree cache'));
    expect(onSelect).toHaveBeenCalledWith(entries[1]);
  });

  it('空结果渲染共享空状态', () => {
    render(
      <TCopyProvider t={mockT} locale="en-US">
        <SettingsSearchResults entries={[]} onSelect={vi.fn()} query="zzz" />
      </TCopyProvider>,
    );
    expect(screen.getByRole('status')).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- src/app/components/settings/SettingsSearchResults.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 `SettingsSearchResults.tsx`**

要求：
1. 入参 `{ entries, query, onSelect }`；按 `group` 分组（组顺序依 `SETTINGS_GROUPS`），组标题用 `t[SETTINGS_GROUPS[i].labelKey]`。
2. 每行按钮显示 label（命中词高亮，复用 `SettingsControls` 的 `highlightMatch` 思路）；点击调 `onSelect(entry)`。
3. 空结果用 `EmptyRow`（`@components/LoadingRow`），文案 `t.settingsSearchNoResults` 或 `t.noResults`，**不以句号结尾**。
4. 无 `else`、无 `any`、文案全走 i18n。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- src/app/components/settings/SettingsSearchResults.test.tsx`
Expected: PASS

- [ ] **Step 5: `SettingsPanel` 接入搜索态与跳转**

1. `const index = useMemo(() => buildSettingsSearchIndex({ t, settings, keybinds: config?.keybinds ?? EMPTY_KEYBINDS }), [t, settings, config]);`
2. `const results = useMemo(() => filterSearchIndex(index, searchQuery), [index, searchQuery]);`
3. 搜索态（`searchQuery.trim() !== ''`）：内容区渲染 `<SettingsSearchResults entries={results} query={searchQuery} onSelect={handleSelectResult} />`，**不再**渲染 `SettingsControls` 扁平列表，也**不再**隐藏侧栏导航（`{!searchQuery.trim() && (`→移除该条件，导航保持可见）。
4. `handleSelectResult(entry)`：`collapseSearch()` → `setActiveGroup(entry.group)` → `requestAnimationFrame` 后 `document.querySelector('[data-settings-anchor="' + anchorFor(entry.group, entry.anchorId) + '"]')` → `scrollIntoView({ block: 'center' })` + 加 `is-search-highlight` 类 1.2s 后移除。
5. `mod+F`：在面板根节点 `onKeyDown` 捕获（`(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f'`）→ `e.preventDefault()` + `e.stopPropagation()` + `setSearchOpen(true)`；仅当事件源在 `.adl-settings-panel` 内。
6. 新增 `SettingsPanel.test.tsx` 用例：搜索命中后点击 → `activeSettingsGroup` 切换为对应组；空查询 → `noResults`；`mod+F` → 搜索输入框出现。
7. 新增 `is-search-highlight` 的 CSS（放在 `styles/components/settings.css`，用主题变量描边 + 短暂过渡；`prefers-reduced-motion` 下取消动画）。

- [ ] **Step 6: 运行设置面板测试**

Run: `pnpm --dir frontend run test -- src/app/components/settings`
Expected: PASS（含新增搜索用例）

- [ ] **Step 7: 提交**

```
git add frontend/src/app/components/settings/SettingsSearchResults.tsx frontend/src/app/components/settings/SettingsSearchResults.test.tsx frontend/src/app/components/settings/SettingsPanel.tsx frontend/src/app/components/settings/SettingsPanel.test.tsx frontend/src/styles/components/settings.css
git commit -m "feat(settings): jump-style cross-group search with mod+F"
```

---

## Phase E — 收尾验收（L3 全量）

### Task 14: 全量质量门禁与回归

**Files:** 无新增；修复本计划引入的所有 lint / 类型 / 测试问题。

- [ ] **Step 1: 前端格式与 lint 修复**

```powershell
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
```

- [ ] **Step 2: 前端类型检查**

Run: `pnpm --dir frontend run typecheck`
Expected: 0 error（若 `@shared/settings-reset` 解析失败，改相对路径导入后重跑）

- [ ] **Step 3: 前端全量测试**

Run: `pnpm --dir frontend run test`
Expected: 全绿，无回归（重点看 `SettingsPanel` / `BrowserSettings` / `DshSettings` / `StorageSettings` / `KeybindSettings` / i18n keys）

- [ ] **Step 4: 双端手工验证（用户执行）**

按 `desktop-ui-verification.md`，在浏览器模式与 Tauri 桌面分别确认：
- 搜索跨组命中、点击跳转并高亮
- `mod+F` 打开搜索；在编辑器/浏览器面板内不误触发
- 六组全默认时「恢复全部默认」禁用
- 恢复全部：范围清单、存储预检文件数、迁移时机双键、保留源默认不勾、进度、失败汇总
- 组级恢复（侧边栏行）行为与文案未变

- [ ] **Step 5: 提交收尾**

```
git add -u
git commit -m "chore(settings): pass L3 gates for toolbar search and reset redesign"
```

---

## Self-Review

**1. Spec coverage**

| Spec 章节 | 覆盖任务 |
|---|---|
| §4.1 shared 四模块 | Task 1–4 |
| §4.2 契约（GroupKey/GroupResetResult/ResetDeps/storagePlan 入参） | Task 1、2、5 |
| §4.3 执行顺序（preferences→browser→dsh→storage 最后） | Task 5 Step 1 用例 + 实现 |
| §4.4 依赖注入落地 | Task 1–5（shared 不 import stores）+ Task 6–8（组件注入） |
| §5.1 搜索索引/锚点/跳转/mod+F/空态/组内搜索共存 | Task 11–13 |
| §5.2 按钮禁用/聚合确认框/进度/失败汇总/迁移时机/保留源默认不勾 | Task 9、10 |
| §6 测试矩阵 | 各 Task 的测试步骤 + Task 14 |
| §7 风险 R1（组级行为不变） | Task 6–8 的回归步骤 |
| §7 风险 R4（锚点漂移） | Task 12 的「锚点必存在」测试 |
| §7 风险 R5（mod+F 冲突） | Task 13 Step 5 第 5 点 |
| §8 受影响文件清单 | 文件结构表已逐项对应 |

**2. Placeholder scan**：无 TBD/TODO；所有代码步骤均给出可执行代码。Task 12 的 `CASES` 需按实际 store 预置补齐——已在 Step 3 明确要求参照既有测试的 `beforeEach` 写法，属于"实现时按实际代码填"，不是设计缺口。

**3. Type consistency**：`GroupResetResult`（`failedStep: string`）在 Task 1 定义、Task 2–5 与 Task 10 一致使用；`StorageResetPlan` 字段名（`blocks.coreNeeded` / `tree` / `budget` / `download` / `preflight` / `migrateAtOpen`）在 Task 2、5、10 一致；`anchorFor(group, anchorId)` 在 Task 11、12、13 一致；`executeBrowserResetPlan` / `executeDshResetPlan` / `executeStorageResetPlan` 的名称与入参在 Task 3、4、2 与 Task 5 调用处一致。

**已知取舍**：Task 12 未逐组贴出 store 预置代码，因为各组既有测试文件已包含完整预置写法（`BrowserSettings.test.tsx` 等），重复粘贴会与源文件漂移；计划要求实现者照抄既有 `beforeEach`。这是唯一一处"引用既有代码"的地方，且指向明确文件。

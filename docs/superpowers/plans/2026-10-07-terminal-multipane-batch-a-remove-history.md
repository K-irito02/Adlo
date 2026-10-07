# 终端多窗口改造 · 批次 A（彻底移除只读历史 + 存储预算块）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全链路移除「只读历史」功能与设置面板「终端历史磁盘预算」，把两处终端视图收敛为单一实时终端显示区，为后续多窗口（批次 B/C/D）让位。

**Architecture:** 删除前端归档链（store / collector / budget / DOM 回放组件 / 输出持久化）、Rust `terminal_output` 服务与路由、`terminal_history_budget_bytes` 配置字段，以及所有消费点（运行时单例、Hook、两处视图、持久化登记表、设置组）。批量关闭应用前的落盘链改为仅同步去抖写入（`flushCrossSliceWrites`），不再有历史 flush。

**Tech Stack:** React 19 + Vite + Zustand + TypeScript（前端）；Rust + Tauri 2.x + axum + rusqlite（后端）。

**Spec:** `docs/superpowers/specs/2026-10-07-terminal-multipane-design.md`（§4 删除范围、§13 批次 A）

## Global Constraints

- 未发布产品：**禁止**添加数据格式兼容 / 旧版本迁移代码；旧 `adl:terminal.viewPrefs` / `adl:terminal.regionCollapse` / `adl:terminal.historyIndex` / `terminal_output` 表**直接弃用**，不写迁移。
- 双端一致：Tauri 与浏览器 preview 行为一致；IPC 方法必须在四端（`tauri-bridge` / `preview-bridge` / `httpBridge` / `mock-bridge`）同步增删。
- 可见文案必须走 i18n（`zh-CN` / `en-US` 双份）。
- 完成后必须通过：`pnpm --dir frontend run lint`、`npx tsc --noEmit`、`cargo clippy --workspace --all-targets -- -D warnings`、`cargo test --workspace`、`pnpm --dir frontend run test`。
- 每步结束运行命令验证；每个 Task 结束提交一次。

---

## 文件结构（本批次触及）

**删除（前端）**
- `frontend/src/app/features/terminal/terminalHistoryStore.ts`
- `frontend/src/app/features/terminal/terminalHistoryCollector.ts`
- `frontend/src/app/features/terminal/terminalHistoryBudget.ts`
- `frontend/src/app/features/terminal/terminalOutputStore.ts`
- `frontend/src/app/features/terminal/historyModel.ts`
- `frontend/src/app/features/terminal/terminalRegionCollapse.ts`
- `frontend/src/app/features/terminal/terminalViewPrefs.ts`
- `frontend/src/app/features/terminal/useTerminalViewPrefs.ts`
- `frontend/src/app/components/terminal/TerminalHistoryList.tsx`
- `frontend/src/app/components/terminal/TerminalHistoryRow.tsx`
- `frontend/src/app/features/storage-settings/TerminalHistoryBudgetSection.tsx`
- `frontend/src/shared/ipc/terminal-output.ts`
- 对应 `__tests__`（见各 Task）

**修改（前端）**
- `frontend/src/app/features/terminal/terminalPtyRuntime.ts`
- `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`
- `frontend/src/app/features/terminal/useTerminalTabActions.ts`
- `frontend/src/app/features/terminal/useTerminalPanel.ts`
- `frontend/src/app/features/center/useTerminalView.ts`
- `frontend/src/app/features/center/CenterTerminalView.tsx`
- `frontend/src/app/features/terminal/TerminalPanel.tsx`
- `frontend/src/app/components/terminal/TerminalRegionActions.tsx`
- `frontend/src/app/features/terminal/terminalXtermPool.ts`
- `frontend/src/app/stores/persisted/registry.ts`、`pruneWiring.ts`
- `frontend/src/shared/defaultPreferences.ts`、`frontend/src/shared/preferencesMerger.ts`
- `frontend/src/app/features/storage-settings/storageAtDefault.ts`、`StorageSettings.tsx`
- `frontend/src/app/components/settings/settingsSearchIndex.ts`
- `frontend/src/shared/ipc/digital-life.ts`、`frontend/src/httpBridge.ts`、`frontend/src/preview-bridge/index.ts`、`frontend/src/mock-bridge.ts`
- i18n：`zh-CN/terminal.ts`、`en-US/terminal.ts`、`zh-CN/settings.ts`、`en-US/settings.ts`

**删除 / 修改（Rust）**
- 删除 `crates/server/src/handlers/terminal_output.rs`
- `crates/server/src/handlers/mod.rs`、`crates/server/src/router.rs`、`crates/server/src/engine.rs`
- `crates/migration/src/lib.rs`
- `crates/kernel/src/config.rs`、`crates/kernel/src/config_watcher.rs`
- `crates/types/src/types/config.rs`、`crates/types/src/types/mod.rs`
- `src-tauri/src/commands/app.rs`

---

## Task A1: Rust — 移除 `terminal_output` 服务端与路由

**Files:**
- Delete: `ai-digital-life/crates/server/src/handlers/terminal_output.rs`
- Modify: `ai-digital-life/crates/server/src/handlers/mod.rs:12`
- Modify: `ai-digital-life/crates/server/src/router.rs:143-145`
- Modify: `ai-digital-life/crates/server/src/engine.rs:135`

**Interfaces:**
- Consumes: 无
- Produces: 移除 `/terminal/save`、`/terminal/load`、`/terminal/delete` 三条 HTTP 路由；后续 Task A3 据此删除前端桥接。

- [ ] **Step 1: 删除 handler 文件并移除模块声明**

删除 `crates/server/src/handlers/terminal_output.rs`，并把 `handlers/mod.rs` 中的：

```rust
pub mod terminal_output;
```

整行删除。

- [ ] **Step 2: 删除路由**

在 `crates/server/src/router.rs` 中删除：

```rust
.route("/terminal/save", post(handlers::terminal_output::save))
.route("/terminal/load", post(handlers::terminal_output::load))
.route("/terminal/delete", post(handlers::terminal_output::delete))
```

若 `post` 在删除后不再被其它路由使用，同步移除其 import。

- [ ] **Step 3: 更新 engine.rs 注释**

把 `crates/server/src/engine.rs:135` 附近提及 `terminal_output` 的注释改为不再具名该表，例如：

```rust
    // 运行待处理的 schema 迁移
```

- [ ] **Step 4: 编译验证**

Run: `cargo build -p adl-server`
Expected: 编译成功，无 `terminal_output` 未解析引用。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/server
git commit -m "refactor(terminal): remove terminal_output server handlers and routes"
```

---

## Task A2: Rust — 移除 `terminal_history_budget_bytes` 配置字段与迁移

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/config.rs:27-29,74-75,109`
- Modify: `ai-digital-life/crates/kernel/src/config_watcher.rs:114`
- Modify: `ai-digital-life/crates/types/src/types/config.rs:102-104,141-143,155-157,~200-215`
- Modify: `ai-digital-life/crates/types/src/types/mod.rs:129`
- Modify: `ai-digital-life/src-tauri/src/commands/app.rs:143-147,204-208,259,427-480`
- Modify: `ai-digital-life/crates/migration/src/lib.rs:168-176`

**Interfaces:**
- Consumes: 无
- Produces: `AppConfig` / `AppPreferencePatch` / `ConfigSnapshot` 不再含 `terminal_history_budget_bytes`；`app_update_preferences` 不再处理该 patch；后续 Task A3/A9 据此移除前端字段与设置块。

- [ ] **Step 1: 删除 kernel config 字段**

在 `crates/kernel/src/config.rs` 删除 `default_terminal_history_budget_bytes()` 函数（约 27-29 行）、结构体字段：

```rust
    #[serde(default = "default_terminal_history_budget_bytes")]
    pub terminal_history_budget_bytes: u64,
```

以及 `Default` 实现中的：

```rust
            terminal_history_budget_bytes: default_terminal_history_budget_bytes(),
```

- [ ] **Step 2: 删除 config_watcher 测试夹具字段**

在 `crates/kernel/src/config_watcher.rs:114` 删除 `terminal_history_budget_bytes: 1 << 30,` 行。

- [ ] **Step 3: 删除 types 侧字段与默认函数**

在 `crates/types/src/types/config.rs` 删除 `AppPreferencePatch` 的：

```rust
    /// 只读历史的磁盘预算（字节）；None = 不改。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal_history_budget_bytes: Option<u64>,
```

删除 `ConfigSnapshot` 的：

```rust
    /// 只读历史的磁盘预算（字节）。0 = 跟随磁盘剩余空间。
    #[serde(default = "default_terminal_history_budget_bytes_snapshot")]
    pub terminal_history_budget_bytes: u64,
```

删除 `default_terminal_history_budget_bytes_snapshot()` 函数（155-157 行）。

删除该文件 `#[cfg(test)]` 中引用 `terminal_history_budget_bytes` 的断言（约 208-211 行）；若整个测试函数只测该字段，删除整个函数。

- [ ] **Step 4: 删除 types/mod.rs 夹具字段**

在 `crates/types/src/types/mod.rs:129` 删除 `terminal_history_budget_bytes: 1 << 30,` 行。

- [ ] **Step 5: 删除壳层命令逻辑与测试**

在 `src-tauri/src/commands/app.rs`：
- 删除 `clamp_terminal_history_budget_bytes` 函数（143-147 行）。
- 删除 `app_update_preferences` 中的：

```rust
        // 只读历史磁盘预算：0 = 跟随磁盘剩余空间直通；其余钳制到 1GiB..=2000GiB
        //（与前端 budgetBytesFromCustom 同口径；缺失此分支时前端选择档位/恢复默认会静默失效）。
        if let Some(v) = patch.terminal_history_budget_bytes {
            config.terminal_history_budget_bytes = clamp_terminal_history_budget_bytes(v);
        }
```

- 删除 `build_app_info` 中 `config: ConfigSnapshot { ... terminal_history_budget_bytes: config.terminal_history_budget_bytes, }` 该行。
- 删除测试函数 `clamp_terminal_history_budget_bytes_passes_through_follow_disk`、`clamp_terminal_history_budget_bytes_clamps_out_of_range`（427-438 行附近），以及测试夹具里 `terminal_history_budget_bytes: 1 << 30,`（478 行附近）。

- [ ] **Step 6: 移除迁移条目**

在 `crates/migration/src/lib.rs` 删除 `Migration { version: 9, ... terminal_output ... }` 整个对象（168-176 行）。确认其后没有更高版本迁移（该文件当前以 version 9 结尾）；若存在更高版本，**保留编号连续性**，仅删除该对象并在描述中不引用该表。

- [ ] **Step 7: 编译与测试**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Run: `cargo test -p adl-types -p adl-kernel -p adl-migration`
Expected: 通过。

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/crates ai-digital-life/src-tauri
git commit -m "refactor(terminal): drop terminal history budget config and output migration"
```

---

## Task A3: 前端 IPC — 移除 `TerminalOutputBridge` 四端接线

**Files:**
- Delete: `ai-digital-life/frontend/src/shared/ipc/terminal-output.ts`
- Modify: `ai-digital-life/frontend/src/shared/ipc/digital-life.ts:29,167`
- Modify: `ai-digital-life/frontend/src/httpBridge.ts:1141`
- Modify: `ai-digital-life/frontend/src/preview-bridge/index.ts:263`
- Modify: `ai-digital-life/frontend/src/mock-bridge.ts:136`

**Interfaces:**
- Consumes: Task A1（后端路由已删）
- Produces: `DigitalLifeBridge` 不再含 `terminalOutput`；Task A8 删除 `terminalOutputStore` 后编译通过。

- [ ] **Step 1: 删除桥接接口文件**

删除 `frontend/src/shared/ipc/terminal-output.ts`。

- [ ] **Step 2: 从 DigitalLifeBridge 移除字段**

在 `frontend/src/shared/ipc/digital-life.ts` 删除：

```ts
import type { TerminalOutputBridge } from './terminal-output';
```

与接口成员：

```ts
  terminalOutput: TerminalOutputBridge;
```

- [ ] **Step 3: 移除四端实现**

- `frontend/src/httpBridge.ts`：删除 `terminalOutput: { ... },` 整个对象块（约 1141 行起）。
- `frontend/src/preview-bridge/index.ts`：删除 `terminalOutput: http.terminalOutput,` 行（263）。
- `frontend/src/mock-bridge.ts`：删除 `terminalOutput: { ... },` 整个对象块（约 136 行起）。

- [ ] **Step 4: 类型检查**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Expected: 仅剩 `terminalOutputStore.ts` 一处报错（尚未删除）——若报错列表中出现 `terminalOutputStore.ts` 使用 `window.digitalLife.terminalOutput`，属预期，由 Task A8 消除；其余文件不得报错。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/shared/ipc ai-digital-life/frontend/src/httpBridge.ts ai-digital-life/frontend/src/preview-bridge ai-digital-life/frontend/src/mock-bridge.ts
git commit -m "refactor(ipc): remove terminalOutput bridge from all four adapters"
```

---

## Task A4: 前端运行时 — 剥离 `terminalPtyRuntime` 的历史链路

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/terminalPtyRuntime.ts`

**Interfaces:**
- Consumes: 无（本 Task 只删，不改公开的 PTY 方法签名）
- Produces: 单例仅保留 `ensureStarted / isCreatedSession / hasLiveSession / activateTab / handleXtermData / handleXtermResize / handleKill / handleCreateTab / handleSelectTab / handleCloseTab / handleCloseAllTabs / findTerminalCanvasForHost / selectTerminalTabsToClose`。删除 `subscribeHistory / getHistoryVersion / historySegmentsFor / deleteHistoryForTab / createThrottledRunner`。
- **保留** `beforeunload` 但只调 `flushCrossSliceWrites()`；删除 Tauri 关闭处理（`startTauriClose`）与 `flushAllHistories`。

- [ ] **Step 1: 删除历史相关 import**

删除文件顶部的：

```ts
import { terminalOutputStore } from './terminalOutputStore';
import {
  terminalHistoryStore,
  chunkKey,
  staleChunkRange,
  type TerminalHistoryChunkMeta,
  type TerminalHistorySegment,
} from './terminalHistoryStore';
import { TerminalHistoryCollector, TERMINAL_CAPTURE_THROTTLE_MS } from './terminalHistoryCollector';
import {
  selectSegmentsToEvict,
  effectiveBudgetBytes,
  diskAvailableBytesFrom,
  TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
  TERMINAL_HISTORY_BUDGET_FOLLOW_DISK,
} from './terminalHistoryBudget';
import type { ExtractLine } from './historyModel';
```

保留 `import { flushCrossSliceWrites } from '@stores/storageHelpers';`。

- [ ] **Step 2: 删除历史字段与订阅 API**

删除类中：`collectors / throttled / historyIndex / historyIndexLoaded / historyVersion / historyListeners`、`CLOSE_FLUSH_TIMEOUT_MS` 常量、`EMPTY_HISTORY` 常量、方法 `subscribeHistory / getHistoryVersion / bumpHistory / historySegmentsFor / ensureHistoryIndexLoaded / persistHistoryIndex / collectorFor / deleteChunksForSession / evictStaleChunksForRebuild / settleRebuild / deleteHistoryForTab / deleteSegmentRecords / settleHistoryBudget / upsertHistoryEntry / persistCollectedTail / persistCollectedChunks / persistCheckpoint / collectThrottled / finalizeSegment / finalizeStaleSegments / flushAllHistories`，以及 `createThrottledRunner` 导出函数与 `tabsWithHistory`/相关空数组。

- [ ] **Step 3: 精简 `ensureStarted`**

改为：

```ts
  ensureStarted = (): void => {
    if (this.started) {
      return;
    }
    this.started = true;
    this.startOutputSubscription();
    this.startBeforeUnload();
  };
```

删除 `this.startCheckpoint();`、`this.startTauriClose();`、`this.finalizeStaleSegments();`，并删除 `checkpointTimer`、`tauriCleanup` 字段与 `startCheckpoint`、`startTauriClose` 方法。

- [ ] **Step 4: 精简输出订阅**

在 `startOutputSubscription` 中，`event.terminated` 分支删除 `void this.finalizeSegment(event.sessionId);`（保留 `liveSessionIds.delete` / `ptyDims.delete` / 标签状态更新）；输出分支删除 `this.collectThrottled(event.sessionId);`（保留 OSC 扫描与 `pooled.terminal.write`）。

- [ ] **Step 5: 精简 `startBeforeUnload`**

改为只同步去抖写入：

```ts
  private startBeforeUnload = (): void => {
    if (this.beforeUnloadHandler) {
      return;
    }
    this.beforeUnloadHandler = () => {
      // 同步落盘去抖中的 localStorage 写入（标签等），否则重启后丢失。
      flushCrossSliceWrites();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  };
```

- [ ] **Step 6: 精简 `reset`**

删除 `this.collectors.clear(); this.throttled.clear(); this.historyIndex.clear(); this.historyIndexLoaded = false; this.historyVersion = 0; this.historyListeners.clear();` 与 `this.tauriCleanup?.(); this.tauriCleanup = null;`，保留其余（`unsubPtyOutput`、`beforeUnloadHandler`、`started`、`createdSessionIds`、`liveSessionIds`、`pendingInput`、`activating`、`ptyDims`、`tabCwds`、`oscCarry` 等）。

- [ ] **Step 7: 精简关标签 / 批量关闭**

`handleCloseTab`：删除 `void this.deleteHistoryForTab(tabId);` 与 `void terminalOutputStore.delete(tab.sessionId);`（保留 kill / pool release / cwd 清理 / `terminalCloseTab`）。
`handleCloseAllTabs`：删除 `void this.deleteHistoryForTab(tab.id);` 与 `void terminalOutputStore.delete(tab.sessionId);`。

- [ ] **Step 8: 类型检查**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Expected: `terminalPtyRuntime.ts` 无报错；剩余报错应仅来自尚未清理的 Hook / 视图 / 登记表（Task A5–A8）。

- [ ] **Step 9: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/terminalPtyRuntime.ts
git commit -m "refactor(terminal): strip read-only history pipeline from pty runtime"
```

---

## Task A5: 前端 Hook — 剥离历史 / 折叠 / 视图偏好

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalTabActions.ts`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalPanel.ts`
- Modify: `ai-digital-life/frontend/src/app/features/center/useTerminalView.ts`

**Interfaces:**
- Consumes: Task A4（单例已无历史 API）
- Produces:
  - `useTerminalPtyLifecycle` 返回 `{ xtermRef, handleXtermData, handleXtermResize, handleCreateTab, handleSelectTab, handleCloseTab, handleCloseAllTabs, handleKill }`（无 `historySegments / deleteHistoryForTab`）。
  - `useTerminalPanel` 的 `terminalState` 无 `historySegments / regionCollapse / viewPrefs / viewContainerRef`；`terminalActions` 无 `swapAreas / setViewMode / handleDividerPointerDown / toggleRegionCollapse / deleteHistory`。
  - `useTerminalView` 返回无 `historySegments / regionCollapse / viewPrefs / viewContainerRef / setViewMode / swapAreas / handleDividerPointerDown / toggleRegionCollapse / deleteHistory`。

- [ ] **Step 1: 精简 `useTerminalPtyLifecycle`**

删除 `useSyncExternalStore` 订阅与 `historySegments` useMemo；删除返回项 `historySegments`、`deleteHistoryForTab`。删除 `import { useMemo }`（若不再使用）与 `useSyncExternalStore` import。保留启动激活 effect（仍调用 `terminalPtyRuntime.activateTab`）、主题 MutationObserver、输入/尺寸/kill。

- [ ] **Step 2: 精简 `useTerminalTabActions`**

删除从 `useTerminalPtyLifecycle` 解构与再导出的 `historySegments`、`deleteHistoryForTab`。

- [ ] **Step 3: 精简 `useTerminalPanel`**

删除：
- import `useTerminalViewPrefs`、`useCallback`（若仍被其它逻辑使用则保留）、`terminalRegionCollapse`、`TerminalHistorySegment`、`TerminalViewMode`/`TerminalViewPrefs`、`RegionCollapse`/`RegionName`。
- `UseTerminalPanelReturn.terminalState` 类型字段 `viewContainerRef / viewPrefs / historySegments / regionCollapse`，`terminalActions` 类型字段 `setViewMode / swapAreas / handleDividerPointerDown / toggleRegionCollapse / deleteHistory`。
- 实现：`viewContainerRef` useRef、`useTerminalViewPrefs(...)` 调用、`collapseMap` state + 两个 effect + `regionCollapse` 派生 + `toggleRegionCollapse` + `deleteHistory`；从 `useTerminalTabActions` 解构 `historySegments`、`deleteHistoryForTab`。
- 返回对象中的对应键。

保留：标签列表/活动标签、导航折叠与宽度、拖拽排序、右键菜单、shell 菜单、复制/粘贴/清空/杀进程、`handleCreateTab/SelectTab/CloseTab/CloseAllTabs`。

- [ ] **Step 4: 精简 `useTerminalView`（中心）**

删除 `useTerminalViewPrefs`、`terminalRegionCollapse`、`TerminalViewMode/TerminalViewPrefs`、`TerminalHistorySegment` 的 import 与使用；删除 `UseTerminalViewReturn` 中的 `viewContainerRef / viewPrefs / historySegments / regionCollapse / setViewMode / swapAreas / handleDividerPointerDown / toggleRegionCollapse / deleteHistory`；删除 `regionCollapse` state/effect 与 `prevTabId` 逻辑、`toggleRegionCollapse`、`deleteHistory`；删除 `useState`/`useEffect` import（若不再使用）。返回对象同步收缩。

- [ ] **Step 5: 类型检查**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Expected: 报错集中在两处视图组件（Task A6）与登记表（Task A7）。

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts ai-digital-life/frontend/src/app/features/terminal/useTerminalTabActions.ts ai-digital-life/frontend/src/app/features/terminal/useTerminalPanel.ts ai-digital-life/frontend/src/app/features/center/useTerminalView.ts
git commit -m "refactor(terminal): drop history/collapse/view-prefs from terminal hooks"
```

---

## Task A6: 前端视图 — 重写 `TerminalPanel` 与 `CenterTerminalView` 为纯实时终端

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/terminal/TerminalRegionActions.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/TerminalPanel.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/center/CenterTerminalView.tsx`

**Interfaces:**
- Consumes: Task A5（Hook 已无历史字段）
- Produces: `TerminalRegionActions` 新签名（仅清空）：

```tsx
export interface TerminalRegionActionsProps {
  onClear: () => void;
  titles: { clearLabel: string; clearTitle: string };
  /** 常驻显示（不再依赖 hover） */
  alwaysVisible?: boolean;
}
```

- [ ] **Step 1: 重写 `TerminalRegionActions`**

把组件收敛为单颗「清空」按钮，删除 region/折叠/删除相关 props 与 `IconDelete / IconRegionCollapse / IconRegionExpand` import。保留 `onClear` 的 `aria-label={titles.clearLabel}` 与 `title={titles.clearTitle}`，保留 `IconClearDisplay`：

```tsx
import { IconClearDisplay } from '@icons';

export interface TerminalRegionActionsProps {
  onClear: () => void;
  titles: { clearLabel: string; clearTitle: string };
  alwaysVisible?: boolean;
}

export function TerminalRegionActions({ onClear, titles, alwaysVisible }: TerminalRegionActionsProps) {
  return (
    <div className={`adl-terminal-region-actions${alwaysVisible ? ' is-always-visible' : ''}`}>
      <button
        type="button"
        className="adl-terminal-region-actions__btn"
        aria-label={titles.clearLabel}
        title={titles.clearTitle}
        onClick={onClear}
      >
        <IconClearDisplay size={14} decorative />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 重写 `TerminalPanel` 主显示区**

在 `TerminalPanel.tsx`：
- 删除 import：`TerminalHistoryList`、`readTerminalPalette`、`readTerminalCellMetrics`、`isCollapseButtonVisible/isRegionVisible`、`HISTORY_RATIO_MAX/HISTORY_RATIO_MIN`、`useResolvedTheme`、`useCallback`（若不再使用）、`IconAreaSwap`。
- 删除 `useResolvedTheme()` 调用与 `historyPalette`、`readHistoryCellMetrics`、`hasHistory/isDual/collapse/historyVisible/liveVisible/canCollapse` 派生、`regionActionTitles` 中的 `deleteLabel/deleteTitle/restore/maximize`（仅留 `clear`）。
- 工具栏：删除 `terminalViewLayoutLabel` 分段选择器整块与 `terminalSwapAreas` 按钮块；保留 `TerminalMenuDropdown`。
- 主区改为：

```tsx
        <div className="adl-tool-primary">
          <div
            className={`adl-tool-primary__scroll adl-tool-primary__scroll--terminal${hasActiveTab ? '' : ' is-empty'}`}
          >
            {hasActiveTab ? (
              <>
                <div className="adl-terminal-live">
                  <XtermTerminal
                    ref={xtermRef}
                    sessionId={activeTab?.sessionId ?? null}
                    className="adl-terminal-canvas"
                    onData={terminalActions.handleXtermData}
                    onResize={terminalActions.handleXtermResize}
                  />
                  <TerminalRegionActions
                    onClear={terminalActions.handleClear}
                    titles={{ clearLabel: t.terminalLiveClearLabel, clearTitle: t.terminalLiveClearTitle }}
                    alwaysVisible
                  />
                </div>
                {activeTab?.status === 'terminated' && !activeTab?.sessionId && (
                  <div className="adl-terminal-error-note">
                    <span>{'\u26A0'}</span>
                    <span>{t.terminalShellNotFound}</span>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
```

- 删除 `viewContainerRef` 绑定（该 ref 已不在 Hook 中）。

- [ ] **Step 3: 重写 `CenterTerminalView` 主显示区**

在 `CenterTerminalView.tsx` 的 `CenterTerminalSession` 中：
- 删除 import：`TerminalHistoryList`、`readTerminalCellMetrics`、`readTerminalPalette`、`isCollapseButtonVisible/isRegionVisible`、`HISTORY_RATIO_MAX/HISTORY_RATIO_MIN`、`useResolvedTheme`、`IconAreaSwap`、`useCallback`（若不再使用）。
- 删除主题订阅、`historyPalette`、`readHistoryCellMetrics`、`hasHistory/isDual/collapse/...` 派生、`regionActionTitles` 多余项。
- 工具栏：删除布局分段块与交换按钮块；保留 `TerminalMenuDropdown`。
- 主区改为与 Task A6 Step 2 同构的 `XtermTerminal + TerminalRegionActions(onClear=view.handleClear, alwaysVisible)`。
- `CenterTerminalChooser` 保持不变。

- [ ] **Step 4: 清理死 CSS 选择器**

在 `frontend/src/styles/regions/rightpanel/terminal-panel.css` 中删除仅服务历史的规则（`.adl-terminal-history*`、`.adl-terminal-divider`、`is-dual/is-single/is-history-last`、`.adl-terminal-live.is-solo` 等），保留 `.adl-terminal-live`、`.adl-terminal-canvas`、`.adl-terminal-region-actions`。

- [ ] **Step 5: 类型检查 + 视图测试**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Run: `cd ai-digital-life/frontend && npx vitest run src/app/features/center/__tests__/CenterTerminalView.test.tsx src/app/components/terminal/__tests__/TerminalRegionActions.test.tsx`
Expected: tsc 无报错；两个测试需按新契约更新（见 Task A10 Step 2）。

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/terminal/TerminalRegionActions.tsx ai-digital-life/frontend/src/app/features/terminal/TerminalPanel.tsx ai-digital-life/frontend/src/app/features/center/CenterTerminalView.tsx ai-digital-life/frontend/src/styles/regions/rightpanel/terminal-panel.css
git commit -m "refactor(terminal): render single live terminal, drop history region UI"
```

---

## Task A7: 持久化 — 移除 `viewPrefs` / `regionCollapse` / `historyIndex` 登记与剪枝

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/persisted/registry.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/persisted/pruneWiring.ts`

**Interfaces:**
- Consumes: Task A5/A6（模块消费者已移除）
- Produces: registry 不再含三条键；`applyTabPrune` 不再剪枝这三类存储。

- [ ] **Step 1: 删除 registry 三条登记与 import**

在 `registry.ts` 删除：
- import `terminalViewPrefsStore / normalizeTerminalViewPrefsMap`、`TerminalViewPrefs`、`terminalRegionCollapseStore / normalizeRegionCollapseMap / RegionCollapse`、`terminalHistoryStore / normalizeHistoryIndex / TerminalHistorySegment`。
- 三个 `defineEntry`：`'adl:terminal.viewPrefs'`、`'adl:terminal.regionCollapse'`、`'adl:terminal.historyIndex'`。

- [ ] **Step 2: 删除 pruneWiring 剪枝逻辑**

在 `pruneWiring.ts` 删除 `terminalRegionCollapseStore`、`terminalViewPrefsStore`、`terminalHistoryStore` 的 import 与 `applyTabPrune`/内部函数中对应的 load/prune/save 块（regionCollapse、viewPrefs、historyIndex 三处）；保留 `cwdByTab` 剪枝与 `pruneByTabId`。

- [ ] **Step 3: 更新相关测试**

- `stores/persisted/__tests__/pruneWiring.test.ts`：删除 regionCollapse/historyIndex 断言；保留 cwd 与浏览器侧断言。
- `stores/persisted/__tests__/terminalComposite.test.ts`：删除 `historyIndex loadAll` 测试。
- `stores/persisted/__tests__/hydrate.test.ts`：删除提及 `adl:terminal.historyIndex` 的注释/断言（若有）。
- `stores/slices/__tests__/terminalPersistence.test.ts`：删除 viewPrefs/regionCollapse 写盘测试。

Run: `cd ai-digital-life/frontend && npx vitest run src/app/stores/persisted`
Expected: PASS。

- [ ] **Step 4: 删除已无消费者的模块文件**

确认无引用后删除：`terminalViewPrefs.ts`、`terminalRegionCollapse.ts`、`useTerminalViewPrefs.ts`。
Run: `cd ai-digital-life/frontend && npx tsc --noEmit`（应无报错）。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/persisted ai-digital-life/frontend/src/app/features/terminal
git commit -m "refactor(persisted): drop terminal viewPrefs/regionCollapse/historyIndex keys"
```

---

## Task A8: 前端 — 删除历史 / 输出持久化模块与组件

**Files:**
- Delete: `terminalHistoryStore.ts`、`terminalHistoryCollector.ts`、`terminalHistoryBudget.ts`、`terminalOutputStore.ts`、`historyModel.ts`、`TerminalHistoryList.tsx`、`TerminalHistoryRow.tsx`
- Modify: `terminalXtermPool.ts`
- Delete tests: `terminalHistory*.test.*`、`terminalOutputStore.test.ts`、`components/terminal/__tests__/TerminalHistoryRow.test.tsx`

**Interfaces:**
- Consumes: Task A4–A7（消费者已移除）
- Produces: `terminalXtermPool.ts` 不再导出 `readTerminalPalette` / `readTerminalCellMetrics`。

- [ ] **Step 1: 删除 `terminalXtermPool` 的历史度量**

在 `terminalXtermPool.ts` 删除 `readTerminalPalette`、`readTerminalCellMetrics`、`cachedHistoryPalette`/`cachedHistoryPaletteSig`/`FALLBACK_CELL_WIDTH`/`FALLBACK_CELL_HEIGHT`（若仅度量使用）、`HISTORY_ANSI_DEFAULTS` 引用与 `import type { HistoryPalette } from './historyModel'`。保留 `readTerminalTheme`、`syncTheme`、`acquire/get/release/setBirthDims` 等。

- [ ] **Step 2: 确认无残留引用**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Expected: 无报错（若报 `historyModel`/`terminalHistory*`/`terminalOutputStore` 被引用，说明前序 Task 漏删，先补齐）。

- [ ] **Step 3: 删除模块与组件文件**

删除：`terminalHistoryStore.ts`、`terminalHistoryCollector.ts`、`terminalHistoryBudget.ts`、`terminalOutputStore.ts`、`historyModel.ts`、`TerminalHistoryList.tsx`、`TerminalHistoryRow.tsx`。

- [ ] **Step 4: 删除对应测试**

删除 `frontend/src/app/features/terminal/__tests__/` 下：`terminalHistoryStore.test.ts`、`terminalHistoryCollector.test.ts`、`terminalHistoryBudget.test.ts`、`terminalHistoryEviction.test.ts`、`terminalHistoryList.test.tsx`、`terminalOutputStore.test.ts`；`components/terminal/__tests__/TerminalHistoryRow.test.tsx`。

> `terminalPtyRuntimeSingleton.test.ts` 内的 `terminalOutput` mock 一并删除（该 mock 只为历史采集器存在）。

- [ ] **Step 5: 运行终端特性测试目录**

Run: `cd ai-digital-life/frontend && npx vitest run src/app/features/terminal`
Expected: PASS（仅剩与 PTY/布局无关的失败需逐一修正，见 Task A10）。

- [ ] **Step 6: Commit**

```bash
git add -A ai-digital-life/frontend/src/app/features/terminal ai-digital-life/frontend/src/app/components/terminal ai-digital-life/frontend/src/shared/ipc
git commit -m "refactor(terminal): delete read-only history modules, components and tests"
```

---

## Task A9: 设置 — 移除存储组「终端历史磁盘预算」块与偏好合并

**Files:**
- Delete: `ai-digital-life/frontend/src/app/features/storage-settings/TerminalHistoryBudgetSection.tsx`
- Delete test: `ai-digital-life/frontend/src/app/features/storage-settings/__tests__/TerminalHistoryBudgetSection.test.tsx`
- Modify: `StorageSettings.tsx`、`storageAtDefault.ts`
- Modify: `shared/preferencesMerger.ts`、`shared/defaultPreferences.ts`、`shared/defaultPreferences.test.ts`
- Modify: `components/settings/settingsSearchIndex.ts`（+ 其测试）

**Interfaces:**
- Consumes: Task A2（Rust patch 字段已删）
- Produces: `Preferences` / `AppPreferencePatch` 前端类型与默认不再含 `terminalHistoryBudgetBytes`；存储组不再渲染预算块。

- [ ] **Step 1: 删除设置区块组件与测试**

删除 `TerminalHistoryBudgetSection.tsx` 及其测试文件。

- [ ] **Step 2: 从 `StorageSettings.tsx` 摘除**

删除 import `TerminalHistoryBudgetSection`；删除预算块头部（`data-settings-anchor={anchorFor('storage','terminalBudget')}` 的 `.adl-settings-storage__header--section`）与其 `.adl-settings-card` 内的 `<TerminalHistoryBudgetSection />`；删除相关 state/handler（`budgetAtDefault`、`budgetResetLabel`、`handleTerminalBudgetResetClick`、`budgetBytes` 读取、`isBudgetAtDefault`/`computeStorageBlocksAtDefault` 入参中的 budget 项）。

- [ ] **Step 3: 从 `storageAtDefault.ts` 摘除**

删除 `import { TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES }`、`isBudgetAtDefault`、`StorageBlocksAtDefaultInput.budgetBytes` 字段及 `computeStorageBlocksAtDefault` 中的 `isBudgetAtDefault(...)` 合取项。调用方（`StorageSettings` / `SettingsPanel`）同步删除传入的 `budgetBytes`。

- [ ] **Step 4: 从偏好合并与默认值摘除**

- `shared/preferencesMerger.ts`：删除 `terminalHistoryBudgetBytes` 钳制块。
- `shared/defaultPreferences.ts`：删除 `DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES`、`Preferences` 中该字段与 `mergePreferences`/读取回退中对该字段的处理。
- `shared/defaultPreferences.test.ts`：删除该常量的导入与断言。

- [ ] **Step 5: 更新设置检索索引**

在 `components/settings/settingsSearchIndex.ts` 删除 `storageTerminalBudgetTitle` 条目块（约 138-145 行）及其子项；同步更新 `settingsSearchIndex.test.ts` / `settingsSearchAnchors.test.tsx` 中对该锚点/文案键的断言。

- [ ] **Step 6: 类型检查 + 设置测试**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Run: `cd ai-digital-life/frontend && npx vitest run src/app/features/storage-settings src/app/components/settings src/shared/defaultPreferences.test.ts`
Expected: PASS（`StorageSettings.test.tsx` 中涉及 budget 的用例需删改）。

- [ ] **Step 7: Commit**

```bash
git add -A ai-digital-life/frontend/src/app/features/storage-settings ai-digital-life/frontend/src/app/components/settings ai-digital-life/frontend/src/shared
git commit -m "refactor(settings): remove terminal history disk budget block"
```

---

## Task A10: i18n 清理 + 全量验收

**Files:**
- Modify: `zh-CN/terminal.ts`、`en-US/terminal.ts`、`zh-CN/settings.ts`、`en-US/settings.ts`
- Modify: 断言旧键的测试（`CenterTerminalView.test.tsx`、`TerminalRegionActions.test.tsx`、i18n 相关测试）

**Interfaces:**
- Consumes: Task A4–A9
- Produces: i18n 字典不再含历史/预算/单双列/交换相关键。

- [ ] **Step 1: 删除 i18n 键**

`zh-CN/terminal.ts` + `en-US/terminal.ts` 删除：`terminalViewLayoutLabel`、`terminalViewSingle`、`terminalViewDual`、`terminalSwapAreas`、`terminalDividerLabel`、`terminalHistorySegmentUnavailable`、`terminalHistoryRegionName`、`terminalLiveRegionName`、`terminalRegionRestoreTitle`、`terminalRegionMaximizeTitle`、`terminalHistoryDeleteLabel`、`terminalHistoryDeleteTitle`。保留 `terminalLiveClearLabel`、`terminalLiveClearTitle`（Task B 再改文案为「清空内容」）。

`zh-CN/settings.ts` + `en-US/settings.ts` 删除：`settingsTerminalHistoryBudget*`（9 键）、`storageTerminalBudgetTitle`。

- [ ] **Step 2: 更新受影响测试**

- `features/center/__tests__/CenterTerminalView.test.tsx`：删除只读历史/单双列/交换相关断言与 mock 键；改为断言工具栏只剩菜单、主区只有一个 `.adl-terminal-canvas`。
- `components/terminal/__tests__/TerminalRegionActions.test.tsx`：重写为新签名（仅清空按钮；断言 `aria-label`/`title` 来自 `titles.clearLabel/clearTitle`）。
- i18n 类型检查：`npx tsc --noEmit` 会捕获仍引用已删键之处，逐一修正。

- [ ] **Step 3: 全量前端质量门**

Run: `cd ai-digital-life/frontend && npx eslint .`
Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Run: `pnpm --dir ai-digital-life/frontend run test`
Expected: 0 error；测试全绿。

- [ ] **Step 4: 全量 Rust 质量门**

Run: `cargo clippy --workspace --all-targets -- -D warnings`
Run: `cargo test --workspace`
Expected: 0 warning；测试全绿。

- [ ] **Step 5: 残留引用扫描（防漏删）**

Run: `git grep -n -E "terminalHistory|terminalOutputStore|terminalViewPrefs|terminalRegionCollapse|readTerminalPalette|readTerminalCellMetrics|terminal_history_budget|terminal_output|terminalHistoryBudget" -- ai-digital-life/`
Expected: 无生产代码命中（文档/本 spec 与 plan 除外）。若有命中，补删后再跑 Step 3/4。

- [ ] **Step 6: Commit**

```bash
git add -A ai-digital-life
git commit -m "docs(i18n): clean terminal history keys and finalize batch A removal"
```

---

## Self-Review

- **Spec 覆盖**：§4.1（UI/组件）→ A6/A8；§4.2（运行时）→ A4；§4.3（设置+i18n）→ A9/A10；§4.4（Rust+IPC）→ A1/A2/A3；§13 批次 A「空出实时显示区」→ A6。✅
- **占位符扫描**：无 TBD/TODO；删除步骤给出确切文件/选择器/键名；改写步骤给出代码。✅
- **类型一致性**：`TerminalRegionActionsProps` 新签名在 A6 定义、A10 测试引用一致；Hook 收缩后的返回键在 A5 定义、A6 消费一致。✅

## 执行交接

批次 A 完成后，再据 spec §13 编写批次 B（多窗口数据模型 + PTY per-pane 化 + 「增加终端」按钮）计划。

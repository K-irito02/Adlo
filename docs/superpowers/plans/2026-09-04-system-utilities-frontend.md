# 左侧边栏系统实用工具前端实施计划（剪贴板历史 + 系统监控 + LeftSidebar 重构）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造左侧边栏，移除快速访问区（Skills/MCP）和 WorkspaceList，替换为「剪贴板历史」（主板块，列表）+「系统监控」（底部可折叠，默认折叠展示 CPU+内存）；新增前端 IPC 三桥接（tauri/preview/mock）、Zustand slice、actions、i18n、UI 组件，全部遵循现有项目规范。

**Architecture:** 遵循 `shared/ipc` 按域分文件 → 三桥接分别实现 → Zustand slice 存状态 → IPC actions 桥接后端 → React 组件实现 UI → `LeftSidebar` 重构接入。组件放 `features/` 按领域拆目录。

**Tech Stack:** React 19 + TypeScript + Zustand（slice 模式）+ Tailwind + i18n（`useTCopy()` 上下文）+ 后端 API 由配套后端计划提供。

## Global Constraints

- 所有 UI 文本必须走 i18n（新增 key 到 `zh-CN/utilities.ts` 和 `en-US/utilities.ts`），禁止硬编码。

- 新增 slice 按 `slices/` 目录、actions 按 `actions/` 目录，命名符合既有 pattern。

- 新增 IPC 必须同时更新 tauri-bridge、preview-bridge、mock-bridge 三处实现（三桥一致性）。

- 错误用 `clearError`/`captureTypedError`，加载状态用 `isFetching` 字段。

- 空状态用 `EmptyRow` 组件，文案无句号且居中。

- TypeScript 禁止 `any`，用精确类型。

- CSS 用现有 `adl-*` class 命名，复用设计系统 token，不破坏样式结构。

- 执行完必须过 `pnpm --dir frontend run lint:fix`、`pnpm --dir frontend run format`、`pnpm --dir frontend run typecheck`，全部通过。

- 新增 action/方法必须附带标准 JSDoc（`@reads`/`@writes`/`@see`）。

> ⚠️ 本计划为**前端计划**；后端（Rust crate、数据库表、Tauri command、HTTP handler）见配套向后端计划（`docs/superpowers/plans/2026-09-04-system-utilities-backend.md`）。

***

### Task 1: IPC 接口定义 — clipboard.ts + system\_monitor.ts

**Files:**

- Create: `ai-digital-life/frontend/src/shared/ipc/clipboard.ts`

- Create: `ai-digital-life/frontend/src/shared/ipc/system_monitor.ts`

- Modify: `ai-digital-life/frontend/src/shared/ipc/index.ts`（barrel 导出）

**Interfaces（产出三桥接接口契约，与后端 Task 2 共享类型匹配，`@command`/`@see`** **JSDoc 规范对齐）：**

```ts
// clipboard.ts
import type { IpcResult } from '@ai-digital-life/kernel';
import type { ClipboardItem } from '@ai-digital-life/kernel/types';

/**
 * 系统剪贴板历史桥接能力
 * Tauri 命令: clipboard_list / clipboard_remove / clipboard_clear
 * 浏览器模式: /clipboard/list / /clipboard/remove / /clipboard/clear
 */
export interface ClipboardBridge {
  /**
   * 获取最近剪贴板历史
   * @param limit 最多返回条数
   * @command clipboard_list
   * @see tauri-bridge/index.ts → clipboard.list
   * @see mock-bridge.ts → clipboard.list
   * @see preview-bridge/index.ts → clipboard.list
   */
  list: (limit?: number) => Promise<IpcResult<ClipboardItem[]>>;

  /**
   * 删除单条剪贴板历史
   * @param id 条目 ID
   * @command clipboard_remove
   * @see tauri-bridge/index.ts → clipboard.remove
   * @see mock-bridge.ts → clipboard.remove
   * @see preview-bridge/index.ts → clipboard.remove
   */
  remove: (id: string) => Promise<IpcResult<boolean>>;

  /**
   * 清空全部剪贴板历史
   * @command clipboard_clear
   * @see tauri-bridge/index.ts → clipboard.clear
   * @see mock-bridge.ts → clipboard.clear
   * @see preview-bridge/index.ts → clipboard.clear
   */
  clear: () => Promise<IpcResult<number>>;
}
```

```ts
// system_monitor.ts
import type { IpcResult } from '@ai-digital-life/kernel';
import type { SystemSnapshot } from '@ai-digital-life/kernel/types';

/**
 * 系统状态监控桥接能力
 * Tauri 命令: sysmon_snapshot
 * 浏览器模式: /sysmon/snapshot
 */
export interface SystemMonitorBridge {
  /**
   * 获取最新系统快照（CPU/内存/磁盘/网络/进程 Top-N）
   * @command sysmon_snapshot
   * @see tauri-bridge/index.ts → systemMonitor.snapshot
   * @see mock-bridge.ts → systemMonitor.snapshot
   * @see preview-bridge/index.ts → systemMonitor.snapshot
   */
  snapshot: () => Promise<IpcResult<SystemSnapshot>>;
}
```

然后修改 `index.ts` 追加：

```ts
export * from './clipboard';
export * from './system_monitor';
```

- [ ] **Step 1: Create** **`clipboard.ts`** **如上述**

- [ ] **Step 2: Create** **`system_monitor.ts`** **如上述**

- [ ] **Step 3: Modify** **`index.ts`** **追加两行** **`export`**

- [ ] **Step 4: 类型检查**

```bash
cd ai-digital-life/frontend
pnpm run typecheck
```

Expected: PASS（`ClipboardItem`/`SystemSnapshot` 已通过 kernel 类型导出；若 `@ai-digital-life/kernel/types` 无对应子路径，按现有 `app.ts` 的 import 写法引用）。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/src/shared/ipc
git commit -m "feat(shared): clipboard / system-monitor IPC 接口定义"
```

***

### Task 2: 三桥接实现 — tauri-bridge / preview-bridge / mock-bridge

**Files:**

- Modify: `ai-digital-life/frontend/src/tauri-bridge/index.ts`

- Modify: `ai-digital-life/frontend/src/preview-bridge/index.ts`

- Modify: `ai-digital-life/frontend/src/mock-bridge.ts`（若实际路径在 `src/mock/` 下按现有 barrel 汇入）

**Contracts（来自 Task 1）：** `ClipboardBridge`、`SystemMonitorBridge`

**tauri-bridge/index.ts 追加（仿现有** **`createAppBridge`/域桥的注入方式；若无统一注入，则新增独立导出函数）：**

```ts
const clipboardBridge: ClipboardBridge = {
  async list(limit) {
    return invoke('clipboard_list', [], { limit });
  },
  async remove(id) {
    return invoke('clipboard_remove', [], { id });
  },
  async clear() {
    return invoke('clipboard_clear', []);
  },
};

const systemMonitorBridge: SystemMonitorBridge = {
  async snapshot() {
    return invoke('sysmon_snapshot', []);
  },
};

export const clipboard = clipboardBridge;
export const systemMonitor = systemMonitorBridge;
```

> ⚠️ **实现要求**：`invoke` 的调用方式（位置参数 vs 命名对象、`[]`）+ 域桥是如何挂到 `Bridge` 泛型上的，需先读 `tauri-bridge/index.ts` 里现有方法（如 `getInfo`）的确切写法照抄，不要凭记忆写 `invoke('clipboard_list', [], {limit})` 这种不存在的调用。

**preview-bridge/index.ts 追加（HTTP）：**

```ts
async function list(limit = 100): Promise<IpcResult<ClipboardItem[]>> {
  return httpGet<ClipboardItem[]>(`/clipboard/list?limit=${limit}`);
}
async function remove(id: string): Promise<IpcResult<boolean>> {
  return httpPost<boolean>('/clipboard/remove', { id });
}
async function clear(): Promise<IpcResult<number>> {
  return httpPost<number>('/clipboard/clear', {});
}
async function snapshot(): Promise<IpcResult<SystemSnapshot>> {
  return httpGet<SystemSnapshot>('/sysmon/snapshot');
}
export const clipboard = { list, remove, clear };
export const systemMonitor = { snapshot };
```

> ⚠️ **实现要求**：`httpGet`/`httpPost` 及路由前缀写法需对照 `preview-bridge/index.ts` 现有 HTTP 方法（如一个 GET/POST 示例）照抄实现，不要臆造函数名。

**mock-bridge.ts 追加（mock 数据）：**

```ts
const stubClipboard: ClipboardItem[] = [
  { id: 'm1', kind: 'text', content: '测试剪贴板第一条文本', imagePath: null, thumbPath: null, imageWidth: null, imageHeight: null, sourceApp: null, createdAt: Date.now() - 5000 },
  { id: 'm2', kind: 'text', content: '第二条带换行\n文本示例', imagePath: null, thumbPath: null, imageWidth: null, imageHeight: null, sourceApp: 'test', createdAt: Date.now() - 3000 },
];

export const clipboard: ClipboardBridge = {
  list: async () => ({ ok: true as const, data: stubClipboard }),
  remove: async () => ({ ok: true as const, data: true }),
  clear: async () => ({ ok: true as const, data: 0 }),
};

export const systemMonitor: SystemMonitorBridge = {
  snapshot: async () => ({
    ok: true as const,
    data: {
      cpuTotal: 12.3,
      cpuPerCore: [8, 15],
      memoryUsed: 8388608, memoryTotal: 16777216, swapUsed: 0, swapTotal: 0,
      disks: [], networks: [],
      processes: [{ pid: 1, name: 'system', cpuUsage: 5, memory: 1024 }],
      uptimeSecs: 3600,
    },
  }),
};
```

- [ ] **Step 1: 实现 tauri-bridge/index.ts 两个桥接**（先读现有调用写法再写）

- [ ] **Step 2: 实现 preview-bridge/index.ts 两个桥接**（先读现有 http helper）

- [ ] **Step 3: 实现 mock-bridge.ts 两个桥接**

- [ ] **Step 4: 类型检查**

```bash
pnpm --dir ai-digital-life/frontend run typecheck
```

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/src/tauri-bridge ai-digital-life/frontend/src/preview-bridge ai-digital-life/frontend/src/mock*
git commit -m "feat(ipc): 剪贴板/系统监控三桥接实现"
```

***

### Task 3: 新增图标 — 剪贴板 / CPU / 内存

**Files:**

- Modify: `ai-digital-life/frontend/src/app/icons/status.tsx`

- Modify: `ai-digital-life/frontend/src/app/icons/index.ts`

按 svg-icon-domain-split-organization 模式用 `make()` 工厂。在 `status.tsx` 末尾追加（可自行选用更优的 Heroicons/Mingcute 风格 SVG path；以下为占位示例，落地时用合法 path）：

```tsx
// 剪贴板
export const IconClipboard = make(
  <path d="M8 5h8M9.5 8.5h5M9.5 11.5h5M8 14.5h8M6.5 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-2.2a1.5 1.5 0 0 0-2.8 0H6.5Z" />,
);
// CPU
export const IconCpu = make(
  <path d="M12 3l-1.5 2m3 0L12 3M6 6l-2 1.5m0 3L6 12m-2 1.5L4 15m8 6l1.5-2m-3 0L12 21m6-15l2-1.5m0 3L18 12m2-1.5V15M4 9v6m14-6v6" />,
);
// 内存
export const IconMemory = make(
  <rect x="3" y="7" width="18" height="10" rx="1" /><path d="M7 7v10M11 7v10M15 7v10M19 7v10" />,
);
```

- [ ] **Step 1:** 在 status.tsx 追加三个图标（clipboard/cpu/memory，`make()` 工厂）。落地时用真实合法 SVG path（可参考 lucide/mingcute 的开源图标 path），替换上面示例 path —— 示例仅示意 `make(<path/>)` 用法，不允许 Lint 报错。

- [ ] **Step 2:** index.ts 导出这三个图标

- [ ] **Step 3:** 类型检查 + ESLint

```bash
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run lint:fix
```

- [ ] **Step 4: 提交**

```bash
git add ai-digital-life/frontend/src/app/icons
git commit -m "feat(icons): 剪贴板/CPU/内存图标"
```

***

### Task 4: i18n — 新增 utilities.ts（剪贴板 + 系统监控文案）

**Files:**

- Create: `ai-digital-life/frontend/src/app/i18n/zh-CN/utilities.ts`

- Create: `ai-digital-life/frontend/src/app/i18n/en-US/utilities.ts`

- Modify: `ai-digital-life/frontend/src/app/i18n/index.ts`（barrel 导出）

**zh-CN/utilities.ts：**

```ts
export default {
  clipboardHistory: '剪贴板历史',
  clipboardClearAll: '清空全部',
  clipboardClearConfirm: '确定清空全部剪贴板历史？此操作不可恢复',
  clipboardDeleteOne: '删除本条',
  clipboardEmpty: '暂无剪贴板历史',
  clipboardLocalNote: '剪贴板数据仅本地存储，可随时清空',
  clipboardSearchPlaceholder: '搜索剪贴板',
  systemMonitor: '系统监控',
  sysCpu: 'CPU',
  sysMemory: '内存',
  sysDisks: '磁盘',
  sysNetwork: '网络',
  sysProcesses: '进程',
  sysProcessTopN: 'CPU 占用 Top-25',
  sysUptime: '开机时长',
} as const;
```

**en-US/utilities.ts：**

```ts
export default {
  clipboardHistory: 'Clipboard History',
  clipboardClearAll: 'Clear all',
  clipboardClearConfirm: 'Clear all clipboard history? This cannot be undone',
  clipboardDeleteOne: 'Delete',
  clipboardEmpty: 'No clipboard history',
  clipboardLocalNote: 'Clipboard data is stored locally and can be cleared anytime',
  clipboardSearchPlaceholder: 'Search clipboard',
  systemMonitor: 'System Monitor',
  sysCpu: 'CPU',
  sysMemory: 'Memory',
  sysDisks: 'Disks',
  sysNetwork: 'Network',
  sysProcesses: 'Processes',
  sysProcessTopN: 'CPU Top-25',
  sysUptime: 'Uptime',
} as const;
```

**i18n/index.ts 追加（按现有 barrel 方式挂载）：**

```ts
export { default as utilitiesZh } from './zh-CN/utilities';
export { default as utilitiesEn } from './en-US/utilities';
```

- [ ] **Step 1/V2/V3:** create zh + en + update barrel

- [ ] **Step 4: 类型检查**

```bash
pnpm --dir ai-digital-life/frontend run typecheck
```

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/src/app/i18n
git commit -m "feat(i18n): 剪贴板历史 / 系统监控 中英文文案"
```

***

### Task 5: Zustand — 新增 clipboardHistorySlice + systemMonitorSlice 与 actions

**Files:**

- Create: `ai-digital-life/frontend/src/app/stores/slices/clipboardHistorySlice.ts`

- Create: `ai-digital-life/frontend/src/app/stores/slices/systemMonitorSlice.ts`

- Modify: `ai-digital-life/frontend/src/app/stores/slices/index.ts`

- Create: `ai-digital-life/frontend/src/app/stores/actions/utilitiesActions.ts`

- Modify: `ai-digital-life/frontend/src/app/stores/actions/index.ts`

- Modify: `ai-digital-life/frontend/src/app/stores/slicedStore.ts`

**Interfaces（由 Task 1 + kernel types）：** `ClipboardItem`、`SystemSnapshot`。

**clipboardHistorySlice.ts：**

```ts
import type { StoreState } from '../StoreState';
import type { ClipboardItem } from '@ai-digital-life/kernel/types';

export interface ClipboardHistorySlice {
  clipboardHistory: ClipboardItem[];
  clipboardHistoryLoading: boolean;
  clipboardHistoryError: string | null;
  clipboardSearch: string;
  setClipboardHistory: (items: ClipboardItem[]) => void;
  clearClipboardHistory: () => void;
  removeClipboardHistoryItem: (id: string) => void;
  setClipboardSearch: (query: string) => void;
}

export const createClipboardHistorySlice = (
  set: (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): ClipboardHistorySlice => ({
  clipboardHistory: [],
  clipboardHistoryLoading: false,
  clipboardHistoryError: null,
  clipboardSearch: '',
  setClipboardHistory: (items) => set({ clipboardHistory: items }),
  clearClipboardHistory: () => set({ clipboardHistory: [] }),
  removeClipboardHistoryItem: (id) =>
    set((s) => ({ clipboardHistory: s.clipboardHistory.filter((i) => i.id !== id) })),
  setClipboardSearch: (query) => set({ clipboardSearch: query }),
});
```

**systemMonitorSlice.ts：**

```ts
import type { StoreState } from '../StoreState';
import type { SystemSnapshot } from '@ai-digital-life/kernel/types';

export interface SystemMonitorSlice {
  sysmonSnapshot: SystemSnapshot | null;
  sysmonCollapsed: boolean;
  sysmonLoading: boolean;
  setSysmonSnapshot: (snap: SystemSnapshot | null) => void;
  toggleSysmonCollapsed: () => void;
}

export const createSystemMonitorSlice = (
  set: (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): SystemMonitorSlice => ({
  sysmonSnapshot: null,
  sysmonCollapsed: true, // 默认折叠
  sysmonLoading: false,
  setSysmonSnapshot: (snap) => set({ sysmonSnapshot: snap }),
  toggleSysmonCollapsed: () => set((s) => ({ sysmonCollapsed: !s.sysmonCollapsed })),
});
```

**utilitiesActions.ts（须带 JSDoc** **`@reads/@writes/@see`，遵循 store-action-jsdoc 规则；调用经** **`getBridge()`** **或现有桥接获取实例，写法对齐现有 actions）：**

```ts
import type { StoreState } from '../StoreState';
import { clearError, captureTypedError, captureError } from '../cacheHelpers';
import { fromIpcErrorCode } from '@/shared/typedErrors';
import { getBridge } from '@/shared/ipc';

const SCOPE = 'utilities';

/**
 * [fetchClipboardHistory - 获取剪贴板历史列表]
 * @reads 无
 * @writes clipboardHistorySlice.clipboardHistory, clipboardHistorySlice.clipboardHistoryLoading
 * @see shared/ipc/clipboard.ts → ClipboardBridge.list
 * @see tauri-bridge/index.ts → clipboard.list
 * @see preview-bridge/index.ts → clipboard.list
 * @see mock-bridge.ts → clipboard.list
 */
export async function fetchClipboardHistory(this: StoreState, limit?: number) {
  const get = () => this;
  clearError(get, SCOPE);
  this.setClipboardHistoryLoading(true);
  try {
    const res = await getBridge().clipboard.list(limit ?? 200);
    if (!res.ok) { captureTypedError(get, fromIpcErrorCode(res.error.code, res.error.message), SCOPE); return; }
    this.setClipboardHistory(res.data);
  } catch (e) {
    captureError(get, e, SCOPE);
  } finally {
    this.setClipboardHistoryLoading(false);
  }
}

/**
 * [removeClipboardItem - 删除单条剪贴板历史]
 * @reads clipboardHistorySlice.clipboardHistory
 * @writes clipboardHistorySlice.clipboardHistory
 * @see shared/ipc/clipboard.ts → ClipboardBridge.remove
 */
export async function removeClipboardItem(this: StoreState, id: string) {
  const get = () => this;
  clearError(get, SCOPE);
  const res = await getBridge().clipboard.remove(id);
  if (!res.ok) { captureTypedError(get, fromIpcErrorCode(res.error.code, res.error.message), SCOPE); return; }
  if (res.data) this.removeClipboardHistoryItem(id);
}

/**
 * [clearAllClipboard - 清空全部剪贴板历史]
 * @reads 无
 * @writes clipboardHistorySlice.clipboardHistory
 * @see shared/ipc/clipboard.ts → ClipboardBridge.clear
 */
export async function clearAllClipboard(this: StoreState) {
  const get = () => this;
  clearError(get, SCOPE);
  const res = await getBridge().clipboard.clear();
  if (!res.ok) { captureTypedError(get, fromIpcErrorCode(res.error.code, res.error.message), SCOPE); return; }
  this.clearClipboardHistory();
}

/**
 * [fetchSystemSnapshot - 获取最新系统监控快照]
 * @reads 无
 * @writes systemMonitorSlice.sysmonSnapshot
 * @see shared/ipc/system_monitor.ts → SystemMonitorBridge.snapshot
 */
export async function fetchSystemSnapshot(this: StoreState) {
  const get = () => this;
  clearError(get, SCOPE);
  const res = await getBridge().systemMonitor.snapshot();
  if (!res.ok) { captureTypedError(get, fromIpcErrorCode(res.error.code, res.error.message), SCOPE); return; }
  this.setSysmonSnapshot(res.data);
}
```

> 注意：`this.setClipboardHistoryLoading`、`this.setClipboardHistory` 等来自 slice；务必在 `StoreState` 接口里把新 slice 的字段/方法合并（看 `StoreState.ts` 如何聚合 slices）。`getBridge()` 与 `res.error.code/message` 形状按现有 actions 实例为准。

- [ ] **Step 1/V2:** 写两个 slice

- [ ] **Step 3:** 更新 `slices/index.ts` 导出两个 creator

- [ ] **Step 4:** 写 `utilitiesActions.ts`（带 JSDoc）

- [ ] **Step 5:** 更新 `actions/index.ts` 导出 utilities actions

- [ ] **Step 6:** 更新 `slicedStore.ts` 合并两个新 slices

- [ ] **Step 7: 类型检查**

```bash
pnpm --dir ai-digital-life/frontend run typecheck
```

- [ ] **Step 8: 提交**

```bash
git add ai-digital-life/frontend/src/app/stores
git commit -m "feat(stores): 剪贴板历史 / 系统监控 slice 与 actions"
```

***

### Task 6: 功能组件 — features/clipboard-history

**Files:**

- Create: `ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardHistoryList.tsx`

- Create: `ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardItemRow.tsx`

- Create: `ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardHistoryHeader.tsx`

**职责：**

- `ClipboardHistoryList`：读 `clipboardHistory`/`clipboardSearch`，filter 后渲染列表；空状态 `<EmptyRow message={t.clipboardEmpty} />`；挂载时触发 `fetchClipboardHistory`。

- `ClipboardItemRow`：`text` 显示截断预览（多行省略），`image` 显示缩略图；整行点击回写系统剪贴板（`navigator.clipboard.writeText/write`）并 toast；悬停显示删除按钮 → `removeClipboardItem(id)`。

- `ClipboardHistoryHeader`：搜索框（`setClipboardSearch`）+ "清空全部"按钮（`Dialog` 二次确认 → `clearAllClipboard`）+ 底部本地存储提示。

> UI 采用既有侧边栏风格（复用 `.adl-list-row` 等），Tailwind + i18n 全覆盖，参考现有 `features` 目录里的 component 写法（如 terminal/patch-review）。

- [ ] **Step 1:** create 目录与三组件（实现如职责描述）

- [ ] **Step 2:** 实现 Header（搜索 + 二次确认清空）

- [ ] **Step 3:** 实现 ItemRow（文本/图片、点击回写、删除）

- [ ] **Step 4:** 实现 List 入口（含空状态 EmptyRow）

- [ ] **Step 5:** 类型检查

```bash
pnpm --dir ai-digital-life/frontend run typecheck
```

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/frontend/src/app/features/clipboard-history
git commit -m "feat(features): 剪贴板历史列表组件"
```

***

### Task 7: 功能组件 — features/system-monitor

**Files:**

- Create: `ai-digital-life/frontend/src/app/features/system-monitor/SystemMonitorPanel.tsx`

- Create: `ai-digital-life/frontend/src/app/features/system-monitor/CpuMemoryMini.tsx`

- Create: `ai-digital-life/frontend/src/app/features/system-monitor/ProcessTable.tsx`

**职责：**

- `SystemMonitorPanel`：读 `sysmonCollapsed`；默认折叠仅渲染 `CpuMemoryMini`，点击标题展开完整面板。展开后每秒 `fetchSystemSnapshot`（`useEffect` + `setInterval` 1000ms）。

- `CpuMemoryMini`：折叠态两个迷你进度条 + 百分比。

- `ProcessTable`：进程 Top-N 只读表格（`{t.sysProcessTopN}`）。

> GPU 不做、无占位。展开内容含 CPU（总 + 每核心）、内存进度条、磁盘列表、网络速率列表、进程表。

- [ ] **Step 1/V2/V3:** create 目录与三组件

- [ ] **Step 4:** 实现 Panel（折叠逻辑 + 1s 轮询）

- [ ] **Step 5: 类型检查**

```bash
pnpm --dir ai-digital-life/frontend run typecheck
```

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/frontend/src/app/features/system-monitor
git commit -m "feat(features): 系统监控面板（可折叠）"
```

***

### Task 8: LeftSidebar 重构

**Files:**

- Modify: `ai-digital-life/frontend/src/app/regions/LeftSidebar.tsx`

**变更点：**

1. 删除 `WorkspaceList` import 与渲染（`./left-sidebar/WorkspaceList`）。
2. 删除快速访问区（两 disabled 按钮 Skills/MCP）。
3. 删除 WorkspaceList 部分 props 与 `menuState`/右键菜单渲染。
4. `LeftSidebarProps` 移除 `onTriggerCreateWorkspace`（若不涉及 App.tsx 传参变更则保留签名但不用）。
5. 新增顶部 `ClipboardHistoryList`（flex:1 可滚动）与底部 `SystemMonitorPanel`（折叠）。

**结构骨架：**

```tsx
return (
  <aside className={`adl-leftbar${collapsed ? ' adl-leftbar--collapsed' : ''}`}
         aria-label={t.utilities.clipboardHistory} aria-hidden={collapsed}>
    <div className="adl-leftbar__content">
      <div className="adl-clipboard-history"><ClipboardHistoryList /></div>
      <div className="adl-system-monitor"><SystemMonitorPanel /></div>
    </div>
    <ResizeHandle />
  </aside>
);
```

**CSS（flex 布局）：** `.adl-leftbar__content{display:flex;flex-direction:column;height:100%}` `.adl-clipboard-history{flex:1 1 auto;overflow-y:auto;min-height:0}` `.adl-system-monitor{flex:0 0 auto}`。

> ⚠️ **风险点**：移除 WorkspaceList 会导致 `StoreState` 里大量 workspace 相关字段/actions 暂时无用（如 `recentWorkspaces`、`reorderWorkspaces`、`pinWorkspace`）。按 spec（§7）约定，**只移除侧边栏 UI 引用，不动 workspace store 后端与 store slice**，避免破坏 dsh 集成。因此新 `LeftSidebar` 不再消费这些即可，无需删 store。

- [ ] **Step 1:** 删除旧区块（快速访问/WorkspaceList/右键菜单）

- [ ] **Step 2:** 导入并替换新组件，调整 props

- [ ] **Step 3:** 调整布局 CSS（`LeftSidebar.module.css` 或对应样式文件）

- [ ] **Step 4: 类型检查**

```bash
pnpm --dir ai-digital-life/frontend run typecheck
```

- [ ] **Step 5: 浏览器预览目检**

```bash
cd ai-digital-life && pnpm run dev:browser
```

确认：剪贴板历史在上占高区、系统监控折叠小卡片在下，折叠宽度正常。

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/frontend/src/app/regions/LeftSidebar.tsx
git commit -m "refactor(left-sidebar): 移除 WorkspaceList/SkillsMCP，接入剪贴板与监控"
```

***

### Task 9: 桌面端事件实时刷新 + 浏览器端轮询

**Files:**

- Modify: `ai-digital-life/frontend/src/app/features/clipboard-history/ClipboardHistoryList.tsx`

**后端（Tauri）会 emit** **`clipboard-changed`** **事件；前端监听它刷新列表。**

```ts
useEffect(() => {
  if (!isTauri) return;
  let un: (() => void) | undefined;
  import('@tauri-apps/api/event').then(async ({ listen }) => {
    un = await listen<string>('clipboard-changed', () => { actions.fetchClipboardHistory(); });
  });
  return () => { if (un) un(); };
}, [isTauri, actions]);
```

**浏览器端：** 无事件，改 2s 轮询 `fetchClipboardHistory`（与 preview-pty-bridge 同策略）。

- [ ] **Step 1: 添加桌面端 Tauri 事件监听**

- [ ] **Step 2: 添加浏览器端 2s 轮询**

- [ ] **Step 3: 类型检查**

```bash
pnpm --dir ai-digital-life/frontend run typecheck
```

- [ ] **Step 4: 提交**

```bash
git add ai-digital-life/frontend/src/app/features/clipboard-history
git commit -m "feat(clipboard): 桌面事件推送 / 浏览器轮询实时刷新"
```

***

### Self-Review

- **Spec 覆盖**：移除快速访问+WorkspaceList（Task 8）、剪贴板列表/搜索/删除/清空/回写（Task 6 + actions Task 5）、系统监控可折叠+实时+Top-N（Task 7 + actions Task 5）、三桥接（Task 1/2）、i18n（Task 4）、图标（Task 3）、实时性（Task 9）。完整覆盖 spec 前端要求。

- **占位符扫描**：各处组件/接口/actions 均有实际实现框架；仅「SVG path」「`httpGet`/`invoke` 写法」「`getBridge()` 获取实例」按现有代码真实签名落地（已标注照抄现有实现），不臆造。

- **一致性**：`ClipboardItem`/`SystemSnapshot` 字段与后端一致（`createdAt`/`cpuTotal` camelCase）；三桥接接口命名一致；slice/actions/i18n 均符合项目既有 pattern。


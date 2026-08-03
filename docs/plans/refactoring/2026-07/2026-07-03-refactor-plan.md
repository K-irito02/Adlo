# Refactoring Insight 第 23 次执行 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 16 项高优先级架构债务，包括死代码删除、i18n 硬编码修复、存储键常量集中化、Store/Hook/组件分解、CSS 架构清理、Rust RwLock 迁移

**Architecture:** 6 阶段逐步推进：先做无风险清理（死代码+常量集中化），再做有测试路径的变更（i18n+React.memo），最后做架构拆分（Store/Hook/组件/CSS/Rust）。每阶段独立验证。

**Tech Stack:** React 19 + TypeScript + Zustand + CSS; Rust + tokio

**Source Report:** `docs/refactoring-insight/report/daily-insights/2026-07/refactor-insight-2026-07-03.md` (34 项发现)

## Global Constraints

- 所有修改不得破坏现有功能及 UI/UX — 保持双端（Tauri+Browser）一致性
- 最小变更原则 — 仅修复发现的问题，不做无关变更
- 禁止跨 Phase 变更 — 不引入超出当前阶段范围的功能或架构变更
- 未发布产品禁止添加数据格式兼容/旧版本迁移代码
- 红绿测试 — 含测试路径的变更先写测试后改代码
- 验收强制 — TypeScript 0 errors + 287 前端测试全通过 + Cargo check + Clippy 0 warnings

---

### Task 1: 删除死代码 preview-window.ts browser 方法

**Files:**
- Modify: `frontend/src/preview-bridge/preview-window.ts`

**Interfaces:**
- Produces: `createPreviewWindowBridge()` 仅返回 `{ window }`，browser 属性完全移除

- [ ] **Step 1: 删除 browser 返回值及 10 个方法实现**

修改 `frontend/src/preview-bridge/preview-window.ts`：
删除 `browser` 属性（7-20 行）的 10 个方法实现（createForTab, activateTab, destroyTab, navigateTab, setTabBounds, goBackTab, goForwardTab, reloadTab, onUrlChanged, onMetaChanged）。返回对象中移除 `browser,` 键。

检查方式：`rg "browser" frontend/src/preview-bridge/preview-window.ts` 无结果。

- [ ] **Step 2: 验证**

```powershell
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: 运行前端测试**

```powershell
cd frontend && pnpm test run
```
Expected: 287/287 passed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/preview-bridge/preview-window.ts
git commit -m "refactor: remove dead browser methods from preview-window.ts createPreviewWindowBridge"
```

---

### Task 2: 集中化重复 localStorage 键常量

**Files:**
- Modify: `frontend/src/app/stores/slices/browserSliceShared.ts`
- Modify: `frontend/src/app/stores/slices/browserSlice.ts`
- Modify: `frontend/src/app/stores/slices/browserLandingSlice.ts`

**Interfaces:**
- Produces: `browserSliceShared.ts` 新增 3 个导出常量
- Consumes: `browserSlice.ts` / `browserLandingSlice.ts` 从 `browserSliceShared` import 替代本地定义

- [ ] **Step 1: 在 browserSliceShared.ts 添加 3 个导出常量**

在 `frontend/src/app/stores/slices/browserSliceShared.ts` 中（已存在的 key 定义区域之后）添加：

```typescript
export const BROWSER_SHORTCUTS_KEY = "adl-ui:browser-shortcuts";
export const BROWSER_LOCAL_PORTS_KEY = "adl-ui:browser-local-ports";
export const BROWSER_BG_CONFIG_KEY = "adl-ui:browser-bg-config";
```

- [ ] **Step 2: 更新 browserSlice.ts 使用统一定义**

在 `frontend/src/app/stores/slices/browserSlice.ts` 中：
- 添加 import：`import { BROWSER_SHORTCUTS_KEY, BROWSER_LOCAL_PORTS_KEY, BROWSER_BG_CONFIG_KEY } from "./browserSliceShared";`
- 删除 L42-44 的 3 个本地 `const` 定义
- 检查文件内所有引用处（readJson/scheduleWrite）确保使用导入版本

- [ ] **Step 3: 更新 browserLandingSlice.ts 使用统一定义**

在 `frontend/src/app/stores/slices/browserLandingSlice.ts` 中：
- 添加 import：`import { BROWSER_SHORTCUTS_KEY, BROWSER_LOCAL_PORTS_KEY, BROWSER_BG_CONFIG_KEY } from "./browserSliceShared";`
- 删除 L33-35 的 3 个本地 `const` 定义
- 检查 `scheduleWrite` 调用确保使用导入版本

- [ ] **Step 4: 验证**

```powershell
cd frontend && npx tsc --noEmit && pnpm test run
```
Expected: 0 errors, 287/287 tests passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/stores/slices/browserSliceShared.ts frontend/src/app/stores/slices/browserSlice.ts frontend/src/app/stores/slices/browserLandingSlice.ts
git commit -m "refactor: centralize duplicate localStorage key constants in browserSliceShared"
```

---

### Task 3: 抽取 BrowserOpenTabFlatListItem 并 React.memo 包裹

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserOpenTabFlatList.tsx`
- Create: `frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx`

**Interfaces:**
- Produces: `BrowserOpenTabFlatListItem` 组件（React.memo），props: `{ tab, isSelected, audioState, isActive, onSelect, onClose, getFaviconUrl, translate }`
- Consumes: BrowserOpenTabFlatList 从子组件 import

- [ ] **Step 1: 创建 BrowserOpenTabFlatListItem.tsx**

新建 `frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx`：

从 `BrowserOpenTabFlatList.tsx:45-96` 提取 `<li>` 渲染逻辑为独立组件，包裹 `React.memo`。需要导入的已有依赖（如 BrowserFavicon、TooltipSimple、图标组件）保持现有 import 路径。将 `t` 翻译函数以 `translate` prop 传入（该组件当前在 `.map()` callback 中使用闭包 `t`）。

```tsx
import React from "react";
import { BrowserTab } from "@/app/stores/slices/browserTabsSlice";
import { AudioState } from "@/shared/ipc/browser";
import BrowserFavicon from "@/app/components/BrowserFavicon";
import TooltipSimple from "@/app/components/TooltipSimple";
import { IconX } from "@/app/icons/interface";
import { Volume2, VolumeX } from "lucide-react";

interface BrowserOpenTabFlatListItemProps {
  tab: BrowserTab;
  isSelected: boolean;
  audioState: AudioState | null;
  isActive: boolean;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  getFaviconUrl: (tab: BrowserTab) => string | null;
  translate: (key: string, fallback: string) => string;
}

export const BrowserOpenTabFlatListItem = React.memo(
  function BrowserOpenTabFlatListItem({
    tab,
    isSelected,
    audioState,
    isActive,
    onSelect,
    onClose,
    getFaviconUrl,
    translate,
  }: BrowserOpenTabFlatListItemProps) {
    // ... extracted <li> rendering from BrowserOpenTabFlatList.tsx lines 45-96
    // 保持完全相同的 JSX 结构和 CSS 类名
  }
);
```

- [ ] **Step 2: 更新 BrowserOpenTabFlatList.tsx 使用新组件**

修改 `frontend/src/app/features/browser/BrowserOpenTabFlatList.tsx`：
- 添加 import：`import { BrowserOpenTabFlatListItem } from "./BrowserOpenTabFlatListItem";`
- 将 `.map()` 中的内联 `<li>` 替换为 `<BrowserOpenTabFlatListItem>` 组件调用
- 传递所需 props，`translate` 使用 `(key, fb) => t(key) || fb` 模式

- [ ] **Step 3: 验证**

```powershell
cd frontend && npx tsc --noEmit && pnpm test run
```
Expected: 0 errors, 287/287 tests passed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx frontend/src/app/features/browser/BrowserOpenTabFlatList.tsx
git commit -m "perf: extract BrowserOpenTabFlatListItem with React.memo from inline list items"
```

---

### Task 4: 修复 githubPanelUtils.ts 硬编码相对时间中文

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/githubPanelUtils.ts`
- Modify: `frontend/src/app/i18n/locales/zh-CN.ts` (或实际 i18n 配置文件)
- Modify: `frontend/src/app/i18n/locales/en.ts` (或实际 i18n 配置文件)

**Interfaces:**
- Consumes: 4 个新 i18n key：`t.relativeTimeJustNow`, `t.relativeTimeMinutesAgo`, `t.relativeTimeHoursAgo`, `t.relativeTimeDaysAgo`
- Produces: `formatRelativeTime(timestamp)` 使用 `useTCopy()` 或 i18n 函数替代硬编码

- [ ] **Step 1: 添加 i18n translations**

先找到实际 i18n 文件位置：
```powershell
rg "relativeTime|相对时间" --include="*.ts" frontend/src/app/i18n/ -l
```

在对应 i18n 文件中添加 4 个翻译 key：
```typescript
// en
relativeTimeJustNow: "just now",
relativeTimeMinutesAgo: "{n} min ago",
relativeTimeHoursAgo: "{n} hr ago",
relativeTimeDaysAgo: "{n} days ago",

// zh-CN
relativeTimeJustNow: "刚刚",
relativeTimeMinutesAgo: "{n} 分钟前",
relativeTimeHoursAgo: "{n} 小时前",
relativeTimeDaysAgo: "{n} 天前",
```

- [ ] **Step 2: 修改 formatRelativeTime 函数**

修改 `frontend/src/app/regions/right-panel/panels/communicate/githubPanelUtils.ts:67-79`，将 `formatRelativeTime` 函数签名改为接受翻译函数参数，或改为返回 key+params 由调用方翻译。

推荐方案：改为返回 `{ key: string; params: Record<string, number> }` 形式，调用方使用 `useTCopy()` 翻译：

```typescript
export function formatRelativeTime(timestamp: string): { key: string; params: Record<string, number> } {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return { key: "relativeTimeJustNow", params: {} };
  if (minutes < 60) return { key: "relativeTimeMinutesAgo", params: { n: minutes } };
  if (hours < 24) return { key: "relativeTimeHoursAgo", params: { n: hours } };
  return { key: "relativeTimeDaysAgo", params: { n: days } };
}
```

- [ ] **Step 3: 更新调用方**

查找 `formatRelativeTime` 的调用方并在渲染层使用 `useTCopy()`：
```powershell
rg "formatRelativeTime" --include="*.tsx" --include="*.ts" frontend/src/
```

更新调用方从 `formatRelativeTime(ts)` 直接使用返回值改为通过 `t(key, params)` 翻译。

- [ ] **Step 4: 验证**

```powershell
cd frontend && npx tsc --noEmit && pnpm test run
```

- [ ] **Step 5: Commit**

```bash
git commit -m "i18n: replace hardcoded Chinese relative time with i18n keys in githubPanelUtils"
```

---

### Task 5: 修复 useBrowserTreeData.ts 硬编码日期/节点名中文

**Files:**
- Modify: `frontend/src/app/features/browser-tree/useBrowserTreeData.ts`
- Modify: i18n 配置文件

**Interfaces:**
- 新增 i18n keys：`t.browserDateYear`, `t.browserDateMonth`, `t.browserDateDay`, `t.browserHistory`

- [ ] **Step 1: 添加 4 个 i18n key**

在 i18n 文件中添加：
```typescript
browserDateYear: "年",     // en: "y"
browserDateMonth: "月",    // en: "mo"
browserDateDay: "日",      // en: "d"
browserHistory: "历史记录", // en: "History"
```

- [ ] **Step 2: 修改 useBrowserTreeData.ts**

在函数体内使用 `useTCopy()` hook 获取翻译函数，将 L346/357/368 的 `'年'/'月'/'日'` 替换为 `t("browserDateYear")` 等。将 L384 的 `'历史记录'` 替换为 `t("browserHistory")`。

- [ ] **Step 3: 验证**

```powershell
cd frontend && npx tsc --noEmit && pnpm test run
```

- [ ] **Step 4: Commit**

---

### Task 6: 修复 cmTheme.ts 硬编码 CodeMirror gutter 标签中文

**Files:**
- Modify: `frontend/src/app/features/editor/cmTheme.ts`
- Modify: i18n 配置文件

**Interfaces:**
- 新增 i18n keys 带参数：`t.cmFoldNoChanges("$ {lines} 行无变化")`, `t.cmFoldRestore`, `t.cmFoldAccept`, `t.cmFoldReject`

- [ ] **Step 1: 添加 4 个 i18n key**

在 i18n 文件中添加（支持参数插值）：
```typescript
cmFoldNoChanges: "$ {lines} 行无变化",  // en: "$ {lines} unchanged lines"
cmFoldRestore: "还原此块",              // en: "Restore this block"
cmFoldAccept: "接受",                   // en: "Accept"
cmFoldReject: "拒绝",                   // en: "Reject"
```

- [ ] **Step 2: 修改 cmTheme.ts L494-497**

需要确认 CodeMirror gutter 标签的创建方式。这些是作为 CodeMirror Extension API 回调中的字符串使用的，不能直接在组件中使用 `useTCopy()` hook。需要在调用方传入翻译后的字符串。

先检查调用链：
```powershell
rg "cmFoldNoChanges|行无变化|还原此块" --include="*.ts" --include="*.tsx" frontend/src/
```

方案：将函数改为接受翻译后的字符串参数，由组件层传入。

- [ ] **Step 3: 验证**

```powershell
cd frontend && npx tsc --noEmit && pnpm test run
```

- [ ] **Step 4: Commit**

---

### Task 7: 修复剩余硬编码中文（useBrowserMenus/settingsViewModel/RunSummaryBlock/githubRepoSlice）

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserMenus.ts:102`
- Modify: `frontend/src/app/utils/settingsViewModel.ts:21`
- Modify: `frontend/src/app/components/conversation/RunSummaryBlock.tsx:290`
- Modify: `frontend/src/app/stores/slices/githubRepoSlice.ts:130`
- Modify: `frontend/src/app/utils/debugLogCollector.ts:325,372,375,380,383`
- Modify: i18n 配置文件

**Interfaces:**
- 新增 i18n key：`t.browserNewTabFolder`, `t.langChinese`, `t.githubDefaultFolderName`

- [ ] **Step 1: 添加 i18n key**

```typescript
browserNewTabFolder: "新建标签文件夹",    // en: "New Tab Folder"
langChinese: "中文",                      // en: "Chinese"
githubDefaultFolderName: "目录 {n}",     // en: "Folder {n}"
```

- [ ] **Step 2: 逐个修改 4 个文件**

1. `useBrowserMenus.ts:102` — `'新建标签文件夹'` → `t("browserNewTabFolder")`
2. `settingsViewModel.ts:21` — `'中文'` → `t("langChinese")`
3. `githubRepoSlice.ts:130` — `\`目录 ${folderCount + 1}\`` 改为返回 i18n key `{ key: "githubDefaultFolderName", params: { n: folderCount + 1 } }` 由 UI 层翻译
4. `RunSummaryBlock.tsx:290` — 移除 fallback 中文，`t.auditEmpty` 始终可用

- [ ] **Step 3: 验证**

```powershell
cd frontend && npx tsc --noEmit && pnpm test run
```

- [ ] **Step 4: Commit**

---

### Task 8: 提取 githubRepoDeleteHelpers.ts（重复递归删除逻辑消重）

**Files:**
- Create: `frontend/src/app/stores/slices/githubRepoDeleteHelpers.ts`
- Modify: `frontend/src/app/stores/slices/githubRepoSlice.ts`

**Interfaces:**
- Produces: `computeFolderDeleteOutcome(folders, folderId, activeCiWorkspaceId?)` 纯函数
- Consumes: githubRepoSlice 从 helpers import 替代内联逻辑

- [ ] **Step 1: 分析三个删除方法的共同逻辑**

`gitHubDeleteFolderConfigRecursive` / `gitHubDeleteFolderDataRecursive` / `gitHubDeleteFolderConfigAndDataRecursive` 三者区别仅在于：删除 config 数据 / 删除 run data / 两者都删。核心递归遍历逻辑相同。

- [ ] **Step 2: 提取纯函数**

```typescript
// githubRepoDeleteHelpers.ts
export interface FolderDeleteResult {
  folderIdsToRemove: Set<string>;
  // ... 其他需删除的 id 集合
}

export function computeFolderDeleteOutcome(
  folders: Record<string, CiFolder>,
  folderId: string,
  scope: "config" | "data" | "both",
  activeCiWorkspaceId?: string | null
): FolderDeleteResult {
  // 递归收集所有需删除的子文件夹 id
  // 根据 scope 决定删除 config/run data
}
```

- [ ] **Step 3: 更新 githubRepoSlice.ts**

用 `computeFolderDeleteOutcome` 替换三个方法中的内联递归逻辑。

- [ ] **Step 4: 验证 + Commit**

---

### Task 9: 提取 workspaceLifecycleActions.ts

**Files:**
- Create: `frontend/src/app/stores/actions/workspaceLifecycleActions.ts`
- Modify: `frontend/src/app/stores/actions/workspaceActions.ts`

**Interfaces:**
- Produces: `workspaceLifecycleActions` 含 `openWorkspace`, `clearWorkspaceContext`, `pickWorkspaceDirectory`
- workspaceActions.ts 从 303 行 → ~180 行

- [ ] **Step 1: 提取 3 个生命周期 action**

将 `openWorkspace`、`clearWorkspaceContext`、`pickWorkspaceDirectory` 及其依赖移到 `workspaceLifecycleActions.ts`。保持函数签名完全不变。

- [ ] **Step 2: 更新 workspaceActions.ts**

从 `workspaceLifecycleActions.ts` re-export 3 个方法。`slicedStore.ts` 无需变更（store 从 `workspaceActions.ts` 的 barrel export 消费）。

- [ ] **Step 3: 验证 + Commit**

---

### Task 10: 提取 githubCiRefresh.ts（CI 刷新逻辑共享化）

**Files:**
- Create: `frontend/src/app/stores/slices/githubCiRefresh.ts`
- Modify: `frontend/src/app/stores/slices/githubSlice.ts`
- Modify: `frontend/src/app/stores/slices/ciSlice.ts` (检查依赖)

**Interfaces:**
- Produces: `createCiRefreshAction(get, set, ...)` 共享 helper

- [ ] **Step 1: 提取 CI 刷新逻辑**

分析 `githubSlice.ts` 和 `ciSlice.ts` 中重复的 CI 状态刷新逻辑，提取到 `githubCiRefresh.ts`。

- [ ] **Step 2: 更新两个 slice**

使用共享 helper 替换重复逻辑。

- [ ] **Step 3: 验证 + Commit**

---

### Task 11: 提取 browserFoldersDeletionHelpers.ts

**Files:**
- Create: `frontend/src/app/stores/slices/browserFoldersDeletionHelpers.ts`
- Modify: `frontend/src/app/stores/slices/browserFoldersDeletion.ts`

**Interfaces:**
- Produces: `collectNodeTabIds(node)` / `computeDeletionOutcome(...)` 纯函数

- [ ] **Step 1: 提取纯函数**

从 `browserFoldersDeletion.ts` 提取 `browserDeleteAllTabsInNode` 和 `browserDeleteOwnTabsInNode` 中的计算逻辑为纯函数。

- [ ] **Step 2: 验证 + Commit**

---

### Task 12: 拆分 useTerminalPanel.ts (323行 → <300行)

**Files:**
- Create: `frontend/src/app/features/terminal/useTerminalTabActions.ts`
- Create: `frontend/src/app/features/terminal/useTerminalShellManagement.ts`
- Modify: `frontend/src/app/features/terminal/useTerminalPanel.ts`

**Interfaces:**
- Produces: `useTerminalTabActions()` 返回 `{ handleTabSwitch, handleTabClose, handleTabRename, ... }`
- Produces: `useTerminalShellManagement()` 返回 `{ handleShellSelect, shellMenuItems, ... }`

- [ ] **Step 1: 提取 useTerminalTabActions**

标签切换、关闭、重命名逻辑提取为独立 Hook。使用 Zustand store 选择器访问终端标签状态。

- [ ] **Step 2: 提取 useTerminalShellManagement**

Shell 类型选择、菜单配置等逻辑提取为独立 Hook。

- [ ] **Step 3: 简化 useTerminalPanel.ts**

主 Hook 仅做组合：调用两个子 Hook 并返回聚合结果。

- [ ] **Step 4: 验证 + Commit**

---

### Task 13: 提取 TerminalHeaderBar 子组件（TerminalPanel.tsx 378行 → <300行）

**Files:**
- Create: `frontend/src/app/features/terminal/TerminalHeaderBar.tsx`
- Modify: `frontend/src/app/features/terminal/TerminalPanel.tsx`

- [ ] **Step 1: 创建 TerminalHeaderBar 组件**

提取 TerminalPanel.tsx 中的标签栏 + 菜单下拉区域为独立组件。Props 接口保持显式传递（不用隐式 store 访问）。

- [ ] **Step 2: 更新 TerminalPanel.tsx**

用 `<TerminalHeaderBar>` 替换内联渲染。

- [ ] **Step 3: 验证 + Commit**

---

### Task 14: 提取 statusbar-menu.css 拆分配置（statusbar.css 657行 → <400行）

**Files:**
- Create: `frontend/src/styles/regions/statusbar-menu.css`
- Modify: `frontend/src/styles/regions/statusbar.css`
- Modify: `frontend/src/styles/index.css` (添加 @import)

**Interfaces:**
- `statusbar-menu.css` 包含 L317-770 菜单样式（453 行）
- `statusbar.css` 仅保留 L1-316 状态栏本体

- [ ] **Step 1: 创建 statusbar-menu.css**

从 statusbar.css L317-770 提取菜单样式（model-menu/workspace-menu/branch-menu/submenu）。

- [ ] **Step 2: 更新 statusbar.css**

删除已提取的菜单样式。在 statusbar.css 顶部添加 `@import './statusbar-menu.css';`

- [ ] **Step 3: 验证构建**

```powershell
cd frontend && pnpm run build
```
Expected: dist 正常生成，无 CSS 构建错误。

- [ ] **Step 4: Commit**

---

### Task 15: 拆分 editor-content.css (614行 → 3文件)

**Files:**
- Create: `frontend/src/styles/regions/rightpanel/markdown-preview.css`
- Create: `frontend/src/styles/regions/rightpanel/highlightjs-theme.css`
- Modify: `frontend/src/styles/regions/rightpanel/editor-content.css`

- [ ] **Step 1: 创建 markdown-preview.css**

从 editor-content.css L305-611 提取 Markdown 预览样式。

- [ ] **Step 2: 创建 highlightjs-theme.css**

从 editor-content.css L613-719 提取 Highlight.js 主题样式（含 dark+light 双套）。

- [ ] **Step 3: 更新 editor-content.css 和前向引用**

editor-content.css 仅保留 L1-303（CodeMirror 布局）。在顶部添加两个 `@import`。

- [ ] **Step 4: 验证 + Commit**

---

### Task 16: Rust — 合并 5 个 Mutex<String> → RwLock<WebView2Meta>

**Files:**
- Modify: `crates/browser/src/webview2_message.rs`

**Interfaces:**
- 删除 5 个静态 Mutex：`LAST_HISTORY_URL`, `LAST_EMIT_URL`, `LAST_EMIT_TITLE`, `LAST_EMIT_TIME`, `LAST_EMIT_FAVICON`
- 新增 `WebView2Meta` 结构体 + `static META: Lazy<RwLock<WebView2Meta>>`

- [ ] **Step 1: 定义 WebView2Meta 结构体并替换**

```rust
#[derive(Default)]
struct WebView2Meta {
    last_history_url: String,
    last_emit_url: String,
    last_emit_title: String,
    last_emit_time: Instant,
    last_emit_favicon: String,
}

static META: Lazy<RwLock<WebView2Meta>> = Lazy::new(Default::default);
```

- [ ] **Step 2: 更新所有读写点**

读访问 `.lock().unwrap()` → `.read().unwrap()`
写访问 `.lock().unwrap()` → `.write().unwrap()`

使用 `replace_all` 模式批量替换同文件内所有引用。

- [ ] **Step 3: 验证编译**

```powershell
cargo check
cargo clippy --workspace --all-targets -- -D warnings
```

- [ ] **Step 4: Commit**

---

### Task 17: 合并验证 + 门禁检查

- [ ] **Step 1: 运行全量前端检查**

```powershell
cd frontend
npx tsc --noEmit
pnpm test run
npx eslint .
npx prettier --check .
```
Expected: TypeScript 0 errors, 287 tests passed, ESLint 0 errors, Prettier clean.

- [ ] **Step 2: 运行全量 Rust 检查**

```powershell
cd src-tauri
cargo check
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
```
Expected: all clean.

- [ ] **Step 3: 更新进度报告**

在 `docs/refactoring-insight/report/progress/REFACTORING_PROGRESS_REPORT.md` 中追加本轮记录。

- [ ] **Step 4: Final commit**

```bash
git add docs/refactoring-insight/report/progress/REFACTORING_PROGRESS_REPORT.md
git commit -m "docs: update refactoring progress for Round 93"
```

---

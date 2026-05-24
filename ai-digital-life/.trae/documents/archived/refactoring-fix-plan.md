# 重构修复计划

> 基于 2026-05-25 重构洞察报告，按优先级分阶段执行

## 总览

| 阶段 | 名称 | 工作量 | 预期收益 |
|------|------|--------|----------|
| 1 | 快速收获 | 小（~2h） | 消除 4 处重复代码、3 处渲染优化、3 处配置修复 |
| 2 | Store 架构清理 | 中（~4h） | 消除状态重复、跨 Store 依赖、级联渲染、代码重复 |
| 3 | 组件架构拆分 | 大（~8h） | 7 个大文件拆分，控制组件行数在 500 行以内 |
| 4 | 性能优化 | 中（~6h） | 缩小 bundle ~450KB+、`content-visibility` 渲染优化 |
| 5 | Rust 后端 | 中（~4h） | God Function 拆分、I/O 优化、依赖边界解耦 |
| 6 | 基础设施 | 小（~2h） | 打包分析、测试覆盖补全 |

---

## 阶段 1：快速收获（Priority: Highest, Effort: Small）

### 1.1 `moveIdWithinBucket` 4 处重复 → 共享工具函数

**分析**：在 [WorkspaceList.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/left-sidebar/WorkspaceList.tsx#L42-L51)、[SessionList.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/left-sidebar/SessionList.tsx#L11-L20)、[MultiWorkspaceChangesTree.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/workspace-changes-tree/MultiWorkspaceChangesTree.tsx#L36-L45)、[MultiWorkspaceFileTree.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/workspace-file-tree/MultiWorkspaceFileTree.tsx#L36-L45) 中共 4 处存在完全一致的 `moveIdWithinBucket` 实现。该函数对数组中的元素重新排序（移除 + 插入到目标索引），是纯粹的数组工具函数，不依赖任何组件上下文。

**改动**：
- 新建 `frontend/src/app/utils/dragUtils.ts`，导出 `moveIdWithinBucket` 和 `moveIdToBucketEnd`、`moveIdAfterTarget`
- 4 处调用文件改为 `import { moveIdWithinBucket } from "../../utils/dragUtils"`，删除内联定义

**验证**：TypeScript 类型检查通过，功能无变化。

---

### 1.2 `ChangesPanel.tsx` Record 型状态补充 `useShallow`

**分析**：在 [ChangesPanel.tsx:L92-L93](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx#L92-L93) 中，`workspaceChangesTreeLoading` 和 `workspaceChangesTreeErrors` 是 `Record<string, ...>` 类型，直接订阅导致其他工作区的无关变化触发本组件重渲染。

**改动**：
```typescript
// 修改前
const workspaceChangesTreeLoading = useAppStore((s) => s.workspaceChangesTreeLoading);
// 修改后
const workspaceChangesTreeLoading = useAppStore(useShallow((s) => s.workspaceChangesTreeLoading));
```
对这两行添加 `useShallow` 包裹（已有 import 签名 `useShallow` 在文件顶部）。

**验证**：确认 `useShallow` 已导入；渲染次数减少。

---

### 1.3 `fileTree.tsx` 中 `handleOpenFile` 补充 `useCallback`

**分析**：在 [fileTree.tsx:L313-L318](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/file-tree/fileTree.tsx#L313-L318)，函数 `handleOpenFile` 是同一组件中**唯一**未用 `useCallback` 包裹的事件处理器。周围 `handleToggleDirectory`(L305)、`getMultiSelectedNodes`(L320)、`handleShowContextMenu`(L336) 均已包裹。

**改动**：
```typescript
const handleOpenFile = useCallback((relativePath: string, event: React.MouseEvent<HTMLButtonElement>) => {
    flushSync(() => {
      props.onOpenFile(relativePath);
    });
}, [props.onOpenFile]);
```

**验证**：TypeScript 编译通过，文件树点击功能正常。

---

### 1.4 `RightPanel.tsx` 中 `ActiveToolPanel` 补充 `React.memo`

**分析**：在 [RightPanel.tsx:L37-L61](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/RightPanel.tsx#L37-L61)，`ActiveToolPanel` 接收 90+ 属性的 `viewProps` 作为剩余参数。每次 `RightPanel` 渲染时，`useRightPanelViewProps` 返回新对象引用，导致 `ActiveToolPanel` 无条件重渲染。

**改动**：
```typescript
const ActiveToolPanel = React.memo(function ActiveToolPanel({ activeTool, idBase, ...props }: ...) {
  // 现有逻辑
});
```

**验证**：确认 `activeTool` 切换时面板正确渲染，无关 state 变更不会触发不必要的重渲染。

---

### 1.5 `vite.config.ts` 关闭生产 sourcemap

**分析**：当前 `build.sourcemap` 未设置，默认 `true`，生产构建生成 `.map` 文件浪费磁盘和构建时间。

**改动**：在 [vite.config.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/vite.config.ts) `build` 字段中添加 `sourcemap: false`。

---

### 1.6 `package.json` 移动 `node-pty` 到 `devDependencies`

**分析**：`node-pty` 仅在 `previewTerminalService.ts`（服务端）使用，不参与前端打包。

**改动**：在 [package.json](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/package.json) 中将 `"node-pty"` 从 `dependencies` 移至 `devDependencies`。

---

### 1.7 `App.tsx` 提取键盘快捷键 hook

**分析**：在 [App.tsx:L39-L57](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/App.tsx#L39-L57)，键盘快捷键监听逻辑内嵌在 `App` 组件中。

**改动**：新建 `frontend/src/app/hooks/useKeyboardShortcuts.ts`，将快捷键逻辑（Ctrl+N, Ctrl+Shift+N, Ctrl+O）提取到独立 hook，App.tsx 中调用 `useKeyboardShortcuts()`。

---

## 阶段 2：Store 架构清理（Priority: High, Effort: Medium）

### 2.1 `workspaceSlice` / `gitSlice` 状态去重

**分析**：[workspaceSlice.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts#L25-L31) 中 `gitSnapshot` 字段在 interface 中声明（但实际 `createWorkspaceSlice` 中**未初始化**该字段），`gitBranches` 在 workspaceSlice 和 gitSlice 中都初始化并设置。`gitSlice.ts` 有完整的 git 状态管理（含 `clearGitState`）。

**改动**：
1. 从 `workspaceSlice` interface 中删除 `gitSnapshot`、`gitBranches` 字段定义及其 setter（仅保留 `gitSnapshots`—多工作区聚合快照，与 `gitSlice` 的 `gitSnapshot`/`gitBranches` 用途不同）
2. 删除 `workspaceSlice` 中的 `setGitSnapshot`、`setGitBranches` setter
3. 从 `createWorkspaceSlice` 的初始值中移除 `gitBranches: []`

**验证**：`cargo test` + `npm run typecheck` 通过，git 功能不受影响。

---

### 2.2 `streamActions.ts` 消除跨 Store 依赖

**分析**：[streamActions.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/streamActions.ts#L11) 导入 `useUiStore`，在 L97 和 L171 中分别调用 `useUiStore.getState().setActiveTool("models")` 和 `useUiStore.getState().chatMode`。

**改动**：
1. 将 `chatMode` 状态迁移到已存在的 `uiSlice`（添加 `chatMode: "reply" | "edit"` 字段和 `setChatMode` setter）
2. 将 `setActiveTool("models")` → `get().setActiveRightTool("models")`（`uiSlice` 已包含 `activeRightTool`）
3. `chatMode` 判断改为 `get().chatMode ?? "reply"`
4. 删除 `streamActions.ts` 中对 `useUiStore` 的 import

**验证**：`npm run typecheck` && `npm test` 通过。消息流发送功能正常。

---

### 2.3 `editorActions.ts` 提取 `openFileGeneric` 消除重复

**分析**：[editorActions.ts:L27-L168](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/editorActions.ts#L27-L168) 中 `openFile` 和 `openFileForWorkspace` 约 70% 重复代码。仅有 2 处差异：
1. cache key 格式（`getWorkspaceScopedCacheKey` vs `${workspacePath}:${relativePath}`）
2. IPC 调用（`readFile` vs `readFileForWorkspace`）
3. `applyDocument` 中的 `selectedFileWorkspaceId` 赋值（`currentWorkspace?.id` vs `workspaceId`）

`openChangePreview` 和 `openChangePreviewForWorkspace` 也有类似重复模式（L170-L251）。

**改动**：
```typescript
// 提取公共函数
type OpenFileParams = {
  relativePath: string;
  cacheKey: string;
  workspaceId?: string;
  readFile: () => Promise<...>;
};

async function openFileGeneric(set, get, params: OpenFileParams) {
  // 合并 openFile 和 openFileForWorkspace 的公共逻辑
}

// openFile / openFileForWorkspace / openChangePreview / openChangePreviewForWorkspace 
// 都通过调用 openFileGeneric 实现
```

**验证**：文件打开、变更预览功能在两种模式下一致。

---

### 2.4 `terminalSlice.ts` localStorage 异步化

**分析**：[terminalSlice.ts:L116-L166](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts#L116-L166) 模块顶层执行同步 `localStorage.removeItem()`，slice 初始化时 3 次同步 `localStorage.getItem()`。

**改动**：
1. 删除模块顶层的 `localStorage.removeItem()` 调用
2. 将初始化值改为惰性初始化模式：
```typescript
// 替换同步读取为惰性读取
let _lazyInit = false;
function ensureTerminalDefaults() {
  if (_lazyInit) return;
  _lazyInit = true;
  // 使用 requestIdleCallback 或 queued microtask 读取 localStorage
  queueMicrotask(() => {
    // 初始化 defaultTerminalProfile 等
  });
}
```
3. 将每次 mutation 后的 `setTimeout(() => writeJson(...), 0)` 改为使用 `requestIdleCallback`：
```typescript
// 写操作批处理
const pendingWrites = new Map<string, unknown>();
function scheduleWrite(key: string, value: unknown) {
  pendingWrites.set(key, value);
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(flushWrites, { timeout: 500 });
  } else {
    setTimeout(flushWrites, 50);
  }
}
function flushWrites() {
  for (const [key, value] of pendingWrites) {
    writeJson(key, value);
  }
  pendingWrites.clear();
}
```

---

### 2.5 `generalActions.ts` 合并级联 `set()` 调用

**分析**：[generalActions.ts:L51-L140](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/generalActions.ts#L51-L140) 中 `bootstrap()` 内部有 3 次独立 `set()` 调用（L51-L66 初始状态、L91-L99 补充状态、L125-L136 低优先级刷新）。

**改动**：将所有 `set()` 合并为单次（在 `queueLowPriorityRefresh` 的回调中也统一合并）。对于 `Promise.allSettled` 触发的 5 个并行操作，在各自回调中使用 `set()` 收集变化，在微任务中批量提交。

```typescript
// 合并策略
bootstrap: async () => {
  let nextState: Partial<StoreState> = { /* 初始状态 */ };
  // ... 收集所有变化
  set(nextState);  // 只调用一次 set
}
```

**验证**：启动流程功能正常，确认渲染次数从 5-10 次减少到 1-2 次。

---

## 阶段 3：组件架构拆分（Priority: High, Effort: Large）

### 3.1 ChangesPanel.tsx 1035 → <500 行

**分析**：当前在 [Change‌sPanel.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx#L1-L1035) 混合了 diff 编辑器渲染、变更树导航、工具栏、上下文菜单、文件预览切换 5 项职责。

**拆分方案**：
| 提取模块 | 行数目标 | 内容 |
|----------|---------|------|
| `ChangesToolbar.tsx` | 已有 | 搜索/过滤/展开工具栏 |
| `ChangesTreePanel.tsx` | ~200 | 变更树渲染 + 上下文菜单 + 拖拽排序 |
| `ChangesEditorPanel.tsx` | ~200 | diff 编辑器 + 粘性上下文 + 预览切换 |
| `ChangesConfirmDialogs.tsx` | ~100 | ConfirmDialog + RenameInput 内联组件 |

---

### 3.2 CenterPane.tsx 629 → <300 行

**分析**：[CenterPane.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/CenterPane.tsx#L1-L629) 含 `WelcomeState` 内联组件、`ApprovalInlineCard` 内联组件、`contentEditable` 编辑器（反模式）。

**拆分方案**：
| 提取模块 | 行数 | 内容 |
|----------|------|------|
| `WelcomeState.tsx`（独立文件） | 已有（移动） | 欢迎页 UI |
| `ApprovalInlineCard.tsx`（独立文件） | 已有（移动） | 审批卡片 |
| `ComposerFooter.tsx` | ~120 | L488-L624 的编辑区域 |
| 替换 `contentEditable` | — | 替换为现有的 `PromptInput.tsx` 受控组件 |

---

### 3.3 StatusBar.tsx 588 → <300 行

**分析**：[StatusBar.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/StatusBar.tsx#L1-L588) 混合 Git 信息、模型状态、索引状态、多模式 UI。

**拆分方案**：
| 提取模块 | 行数目标 | 内容 |
|----------|---------|------|
| `StatusBarGitInfo.tsx` | ~120 | Git 分支显示 + 变更计数 |
| `StatusBarModelStatus.tsx` | ~80 | 模型健康状态指示器 |
| `StatusBarIndexStatus.tsx` | ~60 | 索引进度显示 |
| `StatusBar.utils.ts` | ~50 | 格式化工具函数 |

---

### 3.4 `useTerminalPanel.ts` 519 → 拆分为 4 个子 hook

**分析**：[useTerminalPanel.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/terminal/useTerminalPanel.ts#L1-L519) 返回 78 项属性分 4 组，hook 内部相互依赖。

**拆分方案**：
| 子 hook | 职责 | 行数目标 |
|---------|------|---------|
| `useTerminalTabs` | 标签页增删改、active tab 管理 | ~100 |
| `useTerminalSession` | PTY 会话生命周期 | ~100 |
| `useTerminalDragReorder` | 拖拽排序逻辑 | ~60 |
| `useTerminalContextMenu` | 右键菜单状态 | ~40 |

---

### 3.5 `RightPanelViewProps` 接口拆分

**分析**：[types.ts:L30-L120](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/regions/right-panel/types.ts#L30-L120) 90+ 属性的接口传递给所有 7 个 panel。

**改动**：按 panel 拆分为独立接口：
- `ChangesPanelProps`（~30 props）
- `FilesPanelProps`（~25 props）
- `BrowserPanelProps`（~5 props）
- `TerminalPanelProps`（~10 props）
- `AuditPanelProps`（~5 props）
- `ModelsPanelProps`（~5 props）
- `SettingsPanelProps`（~10 props）

在 `useRightPanelViewProps.ts` 中构建具体的 props 对象而非单一超大对象。

---

## 阶段 4：性能优化（Priority: High, Effort: Medium-Large）

### 4.1 `cmLanguages.ts` CodeMirror 语言包按需动态导入

**分析**：10 个语言包（合计 ~285KB min+gz）全部静态导入到 `vendor-codemirror` chunk。

**改动**：
```typescript
// cmLanguages.ts — 改为动态 import
const languageLoaders: Record<string, () => Promise<Extension[]>> = {
  typescript: async () => {
    const { javascript } = await import("@codemirror/lang-javascript");
    return [javascript({ typescript: true, jsx: true })];
  },
  // ... 其余类似
};

const extensionCache = new Map<string, Extension[]>();

export async function getLanguageExtension(languageId: string): Promise<Extension[]> {
  const cached = extensionCache.get(languageId);
  if (cached) return cached;
  const loader = languageLoaders[languageId];
  if (!loader) return [];
  const extensions = await loader();
  extensionCache.set(languageId, extensions);
  return extensions;
}
```

**影响**：`getLanguageExtension` 变为 `async`，需要更新调用方（`CodeEditor.tsx`、`DiffViewer.tsx` 等约 5 处），在 `useEffect` 中 `await` 调用。

**验证**：`npm run build` 确认 `vendor-codemirror` chunk 体积从 ~285KB 降至 ~100KB。

---

### 4.2 `MarkdownPreview.tsx` selective highlight.js

**分析**：`import hljs from "highlight.js"` 导入全部 190+ 语言，~150KB+。

**改动**：
```typescript
// 方式一（推荐）: 使用 highlight.js/lib/common
import hljs from "highlight.js/lib/common";

// 方式二: 按需注册（若只需更少语言）
import { highlight, registerLanguage } from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
// ... 仅注册需要的语言
registerLanguage("typescript", typescript);
registerLanguage("python", python);
```

**验证**：`npm run build` 确认 MarkdownPreview chunk 减少 ~110KB。

---

### 4.3 CSS `content-visibility: auto` 添加

**分析**：当前所有 CSS 中无 `content-visibility` 声明（第九轮重构的优化未落地）。

**改动**：在以下 CSS 选择器中添加 `content-visibility: auto`：
| 文件 | 选择器 | 收益 |
|------|--------|------|
| `styles/regions/center.css` | `.adl-message-stream` | 长消息流离屏消息不渲染 |
| `styles/regions/rightpanel/files-panel.css` | `.adl-file-tree__list` | 大型文件树性能 |
| `styles/regions/rightpanel/changes-panel.css` | `.adl-changes-tree` | 变更列表性能 |

同时添加 `contain-intrinsic-size` 预估高度避免布局偏移。

---

### 4.4 `selectors.ts` 添加 `terminalTabsById` O(1) 查找

**分析**：`useActiveTerminalTab` 使用 `.find()` 遍历数组 O(n)。

**改动**：在 `terminalSlice.ts` 中添加 `terminalTabsById: Record<string, TerminalTabState>`，在每次 `setTerminalTabs` 时同步更新。选择器改为 `state.terminalTabsById[state.terminalActiveTabId]` O(1) 查找。

---

### 4.5 `sessionSlice.ts` rAF 缓冲区添加上限保护

**分析**：`appendStreamingText` 的 `_streamingBuffer` 在标签页不可见时无限累积。

**改动**：
```typescript
const STREAMING_BUFFER_LIMIT = 10240; // 10KB
appendStreamingText: (text) => {
    _streamingBuffer += text;
    if (_streamingBuffer.length > STREAMING_BUFFER_LIMIT) {
      // 超过上限，立即 flush
      const batch = _streamingBuffer;
      _streamingBuffer = "";
      set((state) => ({
        streamingAssistantText: state.streamingAssistantText + batch
      }));
      return;
    }
    // ... 继续原有 rAF 逻辑
}
```

---

### 4.6 添加打包体积分析工具

**改动**：
1. 安装 `rollup-plugin-visualizer`：`npm install --save-dev rollup-plugin-visualizer`
2. 在 `vite.config.ts` 中添加条件性插件（仅 `BUILD_ANALYZE=true` 时启用）
3. 在 `package.json` 中添加 `"build:analyze": "BUILD_ANALYZE=true vite build"`

```typescript
// vite.config.ts
import { visualizer } from "rollup-plugin-visualizer";

// 在 plugins 中条件添加:
process.env.BUILD_ANALYZE && visualizer({
  filename: "dist/stats.html",
  open: true,
  gzipSize: true,
})
```

---

## 阶段 5：Rust 后端优化（Priority: Medium, Effort: Medium）

### 5.1 `agent.rs` 拆分 `start_run_inner`（334 行）

**分析**：[agent.rs:L50-L384](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/agent.rs#L50-L384) 混合 activity 记录、模型调用、流式处理、patch 生成、任务同步。

**拆分方案**：
| 函数 | 行数目标 | 职责 |
|------|---------|------|
| `prepare_activity()` | ~50 | 创建 activity 记录 + 上下文构建 |
| `execute_model_call()` | ~80 | 模型网关调用 + 流式处理 |
| `handle_stream_output()` | ~80 | 流式输出 → patch 生成与应用 |
| `finalize_run()` | ~60 | 任务状态更新 + 会话同步 |

---

### 5.2 `tree.rs` 合并双重 `read_dir`

**分析**：`build_tree` 中每个目录调用 `std::fs::read_dir()` 两次。

**改动**：合并为单次 `read_dir`，在一轮遍历中同时完成条目收集和过滤排序。使用 Rust 迭代器链式处理：
```rust
let entries: Vec<_> = std::fs::read_dir(path)?
    .filter_map(|e| e.ok())
    .map(|e| ...)
    .collect();  // 一次 I/O
// 再排序
entries.sort_by(|a, b| ...);
```

---

### 5.3 `terminal/Cargo.toml` 解耦 `tauri` 依赖

**分析**：`adl-terminal` 声明 `tauri` 依赖，导致领域层 crate 耦合桌面框架。

**改动**：
1. 从 `adl-terminal/Cargo.toml` 移除 `tauri` 依赖
2. 识别 `adl-terminal` 中哪些代码使用了 `tauri` 类型（如 `AppHandle` 相关的状态管理）
3. 将这些代码上移至 `src-tauri/` 目录（如新建 `src-tauri/src/terminal.rs`）
4. `adl-terminal` 通过 trait 或回调与 Tauri 层解耦

---

### 5.4 `search.rs` 消除双重遍历

**分析**：`search_files` 先收集到 `Vec`，再遍历做分页切片和路径截断。

**改动**：使用迭代器适配器链式处理：`results.into_iter().filter(...).map(...).take(limit).collect()`。

---

## 阶段 6：基础设施（Priority: Low, Effort: Small）

### 6.1 补齐 Store actions/slices 单元测试

**当前缺口**：`stores/actions/` 下 8 个模块、`stores/slices/` 下 12 个切片无测试文件。

**实施方案**：
1. 新建 `frontend/src/app/stores/actions/__tests__/` 目录
2. 优先为关键 action 编写测试：`generalActions.ts`（`bootstrap`）、`editorActions.ts`（`openFile`）、`streamActions.ts`（`sendMessage`）
3. 使用 Zustand 的 `createStore` 直接构造测试 store，无需渲染 React 组件

### 6.2 补齐 preview-bridge 单元测试

**新建**：`frontend/src/preview-bridge/__tests__/ptyBridge.test.ts`，测试轮询连接管理和监听器上限保护。

---

## 执行路线图总结

| 阶段 | 优先级 | 工作量 | 建议开始时间 |
|------|--------|--------|-------------|
| **阶段 1: 快速收获** | 🔴最高 | ~2h | Day 1 |
| **阶段 2: Store 架构清理** | 🔴高 | ~4h | Day 1-2 |
| **阶段 3: 组件架构拆分** | 🔴高 | ~8h | Day 2-4 |
| **阶段 4: 性能优化** | 🟡高 | ~6h | Day 3-5 |
| **阶段 5: Rust 后端** | 🟡中 | ~4h | Day 4-6 |
| **阶段 6: 基础设施** | 🟢低 | ~2h | Day 6-7 |

### 快速收获（Day 1）执行顺序

1. `moveIdWithinBucket` 去重（~15 分钟）
2. `ChangesPanel.tsx` useShallow（~5 分钟）
3. `fileTree.tsx` useCallback（~5 分钟）
4. `RightPanel.tsx` React.memo（~10 分钟）
5. `vite.config.ts` sourcemap（~2 分钟）
6. `package.json` node-pty（~1 分钟）
7. `App.tsx` 快捷键 hook（~20 分钟）

## 验证策略

| 阶段 | 验证命令 |
|------|----------|
| 所有前端代码改动 | `npm run typecheck` && `npm test` |
| Rust 改动 | `cargo test --workspace` |
| 构建 | `npm run build` |
| Bundle 体积 | `npm run build:analyze`（阶段 4 完成后） |

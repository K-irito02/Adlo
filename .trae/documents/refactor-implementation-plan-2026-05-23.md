# 重构修复计划 – ai-digital-life
**生成日期**：2026-05-23
**来源**：`refactor-insight-2026-05-23-2.md` 第二轮重构洞察报告（26 项发现）
**执行策略**：按 5 个 Phase 分步实施，每个 Phase 完成后可独立验证（`npm test` + `tsc --noEmit`）

---

## Phase 1：渲染性能与数据流修复（🔴高，4 项）

### 1.1 App.tsx 状态选择器下沉（🔴高）

**影响**：当前 App.tsx 通过 `useShallow` 一次性订阅 37 个状态字段，流式输出期间每 token 触发全树重渲染。

**修改清单**：

| 文件 | 操作 |
|------|------|
| `frontend/src/app/App.tsx` | 移除 L83-L121 的巨型 `useShallow` 选择器（仅保留 `error`/`loading`/`appInfo` 三个根级字段）；移除通过 props 传递的 32 个状态值；移除三个子组件 JSX 上的 55+ 个 prop 透传 |
| `frontend/src/app/regions/LeftSidebar.tsx` | 将 props 接收改为内部 `useAppStore()` 细粒度选择器（选 `sessions`/`activeSessionId`/`streamingActiveRunId`/`taskCenter`/`indexingStatus`/`recentWorkspaces`）+ `useAppActions()` |
| `frontend/src/app/regions/CenterPane.tsx` | 将 props 接收改为内部细粒度选择器（选 `streamingAssistantText`/`activeRun`/`activeDetail`/`gitSnapshot`/`gitBranches`/`modelHealth`/`taskCenter`/`recentWorkspaces`/`workspaceContextMode`/`runActivityByRunId`/`runUsageByRunId`） |
| `frontend/src/app/regions/RightPanel.tsx` | 将 props 接收改为内部细粒度选择器（选 `openTabs`/`selectedFilePath`/`selectedChangePreviewPath`/`changePreview`/`fileContent`/`fileLastModifiedAt`/`externalFileChange`/`editorLanguage`/`filePatch`/`diagnostics`/`outline`/`workspaceTree`/`repoMap`/`searchResults`/`dirtyEditorPaths`/`auditEntries`/`settings`/`gitSnapshot`/`commandHistory`/`latestCommandRun`/`latestPatchApplication`/`activePatchSet`/`changePreviewLoading`） |

**模式**：每个子组件内部使用 `useAppStore(selectors.useXxx())` 或独立 `useAppStore((s) => s.xxx)` 选择器，App.tsx 只提供 layout 容器和 ErrorBoundary。

**验证**：
- `npm --prefix frontend run typecheck` 通过
- `npm --prefix frontend test` 通过（283 个测试）
- 手动验证 UI 布局不受影响

---

### 1.2 workspaceSlice / diagnosticSlice 字段去重（🔴高）

**影响**：`indexingStatus` 和 `repoMap` 在两个 Slice 中重复定义，`fetchActions.ts` 中同时调用两个 setter 触发双重 Zustand 更新。

**修改清单**：

| 文件 | 操作 |
|------|------|
| `frontend/src/app/stores/slices/diagnosticSlice.ts` | 移除 `indexingStatus`、`repoMap`、`setIndexingStatus`、`setRepoMap`（这些从 workspaceSlice 继承，不需要重复定义） |
| `frontend/src/app/stores/StoreState.ts` | 确认 `interface StoreStateBase extends ...WorkspaceSlice, ...DiagnosticSlice` 已经通过合并包含这些字段，无需操作 |
| `frontend/src/app/stores/actions/fetchActions.ts` | `fetchIndexStatus` 和 `fetchRepoMap` 中检查是否仍正确引用 `indexingStatus`/`repoMap`（它们通过 workspaceSlice 暴露） |
| 全项目 grep `setIndexingStatus`/`setRepoMap` | 检查是否有其他文件设置了这两个字段。若有，确认它们使用的 `(state) => ({ indexingStatus: ... })` 模式已在 workspaceSlice 覆盖范围内 |

**验证**：
- `npm --prefix frontend run typecheck` 通过，无找不到属性错误

---

### 1.3 streamingAssistantText 批量合并（🔴高）

**影响**：`sessionSlice.ts` 中 `appendStreamingText` 每字符触发一次 Zustand set，流式期间 30-60Hz 更新频率。

**修改清单**：

| 文件 | 操作 |
|------|------|
| `frontend/src/app/stores/slices/sessionSlice.ts` | `appendStreamingText` 保持现有接口但内部使用 `requestAnimationFrame` 批量合并：维护一个 rAF 挂起标志 + 累积缓冲区，下次 rAF tick 时执行 `set`。导出新的 `flushStreamingBuffer` 用于流结束时强制刷新 |

**实现要点**：
```typescript
let _streamingRafPending = false;
let _streamingBuffer = "";

appendStreamingText: (text) => {
  _streamingBuffer += text;
  if (!_streamingRafPending) {
    _streamingRafPending = true;
    requestAnimationFrame(() => {
      _streamingRafPending = false;
      if (_streamingBuffer) {
        set((state) => ({
          streamingAssistantText: state.streamingAssistantText + _streamingBuffer,
        }));
        _streamingBuffer = "";
      }
    });
  }
},
flushStreamingText: () => {
  if (_streamingBuffer) {
    set((state) => ({
      streamingAssistantText: state.streamingAssistantText + _streamingBuffer,
    }));
    _streamingBuffer = "";
  }
  _streamingRafPending = false;
},
```

**验证**：
- 手动测试流式输出功能正常，文本不丢失
- `npm --prefix frontend test` 通过

---

### 1.4 terminalSlice 同步 localStorage 解耦（🔴高）

**影响**：`terminalSlice.ts` 中所有写操作直接调用 `writeJson()`（`localStorage.setItem`），阻塞主线程。

**修改清单**：

| 文件 | 操作 |
|------|------|
| `frontend/src/app/stores/slices/terminalSlice.ts` | 将直接 `writeJson` 调用替换为 `setTimeout(() => writeJson(...), 0)` 延迟写入。在切片的 `terminalCreateTab`、`terminalSelectTab`、`terminalCloseTab`、`terminalUpdateActiveTab`、`terminalUpdateTab`、`terminalTogglePin`、`terminalReorderTabs`、`terminalCloseAllTabs` 共 8 个 action 中替换 |

**验证**：
- 终端标签页创建/切换/关闭仍正常工作
- 浏览器刷新后终端标签页状态仍恢复（localStorage 写入延迟后仍执行）

---

## Phase 2：组件模块化与代码去重（🟡中，5 项）

### 2.1 CenterPane 内嵌组件提取（🟡中）

**文件**：`frontend/src/app/regions/CenterPane.tsx` 825 行

**修改清单**：

| 操作 | 说明 |
|------|------|
| 提取 `ContextBuilderPopover`（L86-L249）到 `frontend/src/app/components/conversation/ContextBuilderPopover.tsx` | 163 行内嵌，含 contentEditable 光标逻辑 + 上下文芯片管理 |
| 提取 `WelcomeState`（起始区域）到 `frontend/src/app/components/WelcomeState.tsx` | ~102 行内嵌，注意：`WelcomeState.tsx` 已在 `app/components/` 存在同名文件（检查是否重复） |

> 注意：先确认 `WelcomeState.tsx` 是否已作为独立组件存在。若存在则直接删除 CenterPane 中的内联版本并 import 共享版本。

**验证**：
- `npm --prefix frontend run typecheck` 通过
- UI 布局和交互不受影响

---

### 2.2 sessionActions.ts 通用模式提取（🟡中）

**文件**：`frontend/src/app/stores/actions/sessionActions.ts` 211 行

**修改清单**：

将以下 6 个相似 action 提取通用 helper：
```
pinSession, unpinSession, markSessionRead, markSessionUnread, archiveSession, deleteSession
```

**实现**：
```typescript
async function sessionMutate<T>(
  get: () => StoreState,
  set: StoreApi<StoreState>["setState"],
  sessionId: string,
  ipcCall: (sessionId: string) => Promise<IpcResult<T>>,
  onSuccess?: (state: StoreState, result: T) => Partial<StoreState>
) {
  const result = await ipcCall(sessionId);
  if (!result.ok) {
    set({ error: result.error.message });
    return;
  }
  const conversationState = await refreshConversationSlice(get().activeSessionId);
  set((state) => ({
    sessions: conversationState.sessions,
    ...(onSuccess ? onSuccess(state, result.data) : {}),
  }));
}
```

6 处改为 `sessionMutate(get, set, sessionId, ...)`。

**验证**：
- `npm --prefix frontend test` 通过
- 手动测试会话置顶/已读/归档功能正常

---

### 2.3 mock-bridge.ts 测试 fixture 分离（🟡中）

**文件**：`frontend/src/mock-bridge.ts` 1316 行

**修改清单**：

| 操作 | 说明 |
|------|------|
| 提取 `buildResumeHtml`（~153行）到 `test-fixtures/resume-html.ts` | 用于 DiffViewer 测试的上百行 HTML 生成器 |
| 提取 `buildResumeHtmlModified`（~80行）到 `test-fixtures/resume-html.ts` | 同上 |
| 提取重复的 mock 数据对象到 `test-fixtures/mock-data.ts` | `modelHealth` 对象和 `taskCenter` policy 对象各出现 3 次 |
| `mock-bridge.ts` 改为 import 这些外部模块 | 内联调用 `buildResumeHtml()` → `import { buildResumeHtml } from "../test-fixtures/resume-html"` |

> 注意：先确认 `test-fixtures/` 目录存在，不存在则创建。

**验证**：
- `npm --prefix frontend test` 全部通过
- `npm --prefix frontend run typecheck` 通过

---

### 2.4 ChangesPanel / FilesPanel useMemo 补全（🟡中）

**文件**：
- `frontend/src/app/regions/right-panel/ChangesPanel.tsx`
- `frontend/src/app/regions/right-panel/FilesPanel.tsx`

**修改**：用 `useMemo` 包裹 `changesMenuItems` 和 `fileMenuItems` 数组

```typescript
// ChangesPanel.tsx L189-L210
const changesMenuItems = useMemo(() => [...], [filePatches, reviewFilter, ...]);

// FilesPanel.tsx L129-L158  
const fileMenuItems = useMemo(() => [...], [workspaceTree, searchResults, ...]);
```

**验证**：
- `npm --prefix frontend run typecheck` 通过

---

### 2.5 streamActions 工厂函数提升（🟡中）

**文件**：`frontend/src/app/stores/actions/streamActions.ts`

**修改**：将 `createModelStreamSubscriber` 和 `createRunActivitySubscriber` 从 `sendMessage` 内部提升到模块作用域，通过参数传入 `get`/`set`。

```typescript
// 模块作用域创建一次，而非每次 sendMessage 重建
const createModelStreamSubscriber = (
  get: () => StoreState,
  set: StoreApi<StoreState>["setState"],
  runId: string,
  activeSessionId: string
) => { /* ... */ };
```

**验证**：
- `npm --prefix frontend test` 通过
- 手动测试流式消息发送正常

---

## Phase 3：架构治理（🟡中，3 项）

### 3.1 regions.css 按区域拆分（🟡中）

**文件**：`frontend/src/styles/regions.css` 8144 行

**拆分方案**：

```css
styles/
├── regions/
│   ├── leftbar.css       /* ~1800行 leftbar */
│   ├── center.css        /* ~2200行 center */
│   ├── rightpanel.css    /* ~2400行 right panel */
│   ├── titlebar.css      /* ~350行 title bar */
│   ├── statusbar.css     /* ~250行 status bar */
│   └── composer.css      /* ~900行 composer */
├── index.css             /* 更新导入链 */
```

**操作**：按文件内容中的区域分类选择器，每组提取到一个独立 CSS 文件。`index.css` 中原 `@import "./regions.css"` 替换为 6 个 `@import "./regions/leftbar.css"` 等。**逐区域进行，每次一个区域**，避免长锁定。

> 提示：此步骤可与 Phase 1 同步进行（不阻塞其他任务），因为纯 CSS 拆分不影响 JS 逻辑。

**验证**：
- 构建 `npm run build` 通过
- UI 视觉检查和区域样式完整

---

### 3.2 Vite manualChunks 代码分割（🟡中）

**文件**：`frontend/vite.config.ts`

**修改**：添加 `build.rollupOptions.output.manualChunks`：

```typescript
build: {
  outDir: "dist",
  emptyOutDir: true,
  target: "esnext",
  rollupOptions: {
    output: {
      manualChunks: {
        "vendor-react": ["react", "react-dom", "react-dom/client"],
        "vendor-codemirror": [
          "@codemirror/state", "@codemirror/view", "@codemirror/language",
          "@codemirror/commands", "@codemirror/autocomplete", "@codemirror/search",
          "@codemirror/lint", "@codemirror/lang-javascript", "@codemirror/lang-json",
          "@codemirror/lang-markdown", "@codemirror/lang-python", "@codemirror/lang-rust",
          "@codemirror/lang-sql", "@codemirror/lang-css", "@codemirror/lang-html",
          "@codemirror/lang-xml", "@codemirror/lang-yaml", "@codemirror/merge",
        ],
        "vendor-xterm": ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-web-links"],
        "vendor-zustand": ["zustand"],
        "vendor-markdown": ["markdown-it", "react-markdown", "remark-gfm"],
        "vendor-pdf": ["pdfjs-dist"],
      },
    },
  },
},
```

**验证**：
- `npm --prefix frontend run build` 通过
- 构建产物中 dist/assets/ 出现 vendor-*.js 文件

---

### 3.3 双 Store 模式治理：方案调研（🟡中）

**当前状态**：
- `useUiStore`（`ui-store.ts`，987行）：管理纯 UI 状态
- `UISlice`（`uiSlice.ts`，48行）：在 slicedStore 中定义了 `leftSidebarVisible`/`rightPanelVisible`/`activeRightTool` 等但未被实际消费
- `terminalSlice.ts` 从 `../../ui-store` 导入类型形成斜向依赖

**本阶段操作**：
1. 从 `uiSlice.ts` 的接口和实现中移除未被引用的字段（`leftSidebarVisible`/`rightPanelVisible`/`activeRightTool`/`setActiveRightTool`）
2. 在 `terminalSlice.ts` 中，将 import 的 `TerminalProfile`/`TerminalTabState`/`ToolId` 类型定义直接内联或提取到共享类型文件，消除对 `ui-store.ts` 的斜向依赖
3. 记录后续需要完整的双 Store 合并方案文档

**验证**：
- `npm --prefix frontend run typecheck` 通过
- 无运行时错误

---

## Phase 4：Rust 后端改进（🟢低，6 项）

### 4.1 workspace.rs 命令层提取公共模式

**文件**：`src-tauri/src/commands/workspace.rs`

| 操作 | 说明 |
|------|------|
| 提取 `load_or_seed_sidebar(&state)` 辅助函数 | 6 处重复的 `load_sidebar_entries` + `if all.is_empty() { seed_sidebar_from_db }` |
| 提取 `unpinned_max(&entries)` 辅助函数 | 4 处重复的 `all.iter().filter(...).map(...).max().unwrap_or(-1)` |
| 验证：`cargo test --workspace` 通过 |

### 4.2 model-gateway 改进

**文件**：`crates/model-gateway/src/lib.rs`

| 操作 | 说明 |
|------|------|
| L79: `response.usage.clone()` → 提前提取 | 避免不必要的堆分配 |
| L243-L248: keyring 调用包装 `spawn_blocking` | 避免同步 I/O 阻塞 tokio 运行时 |
| 验证：`cargo test --workspace` 通过 |

### 4.3 跨 crate Token 估算去重 + 零分配截取

**文件**：
- `crates/context-engine/src/lib.rs`
- `crates/model-gateway/src/lib.rs`

| 操作 | 说明 |
|------|------|
| 将 `estimate_tokens` 提取到 `adl-kernel` | 两处重复的 `chars.count() / 4` |
| `file_context()` L14-L23 双重字符串分配 → 零分配 | `chars().rev().collect<...>().rev().collect` → `char_indices().nth_back()` |
| 验证：`cargo test --workspace` 通过 |

### 4.4 run_activity 重复 match 臂优化

**文件**：`src-tauri/src/commands/run_activity.rs`

| 操作 | 说明 |
|------|------|
| 为 `DigitalLifeRunActivityEventV1` 实现 `fn seq(&self) -> i64` | 消除 10 个 match 臂重复 |
| 验证：`cargo test --workspace` 通过 |

---

## Phase 5：润色与微优化（🟢低，4 项）

### 5.1 CenterPane 流式自动滚动 behavior 修正

**文件**：`frontend/src/app/regions/CenterPane.tsx`
**修改**：增量更新时使用 `scrollTop = scrollHeight`（instant），仅在用户已滚到底部时执行。避免连续 `smooth` 动画重叠卡顿。

### 5.2 文件树 props spread 精简

**文件**：`frontend/src/app/features/file-tree/fileTree.tsx`
**修改**：L388 处 `{...props}` 改为只传递每个节点必需的 props（`node`、`depth`、`onToggle`、`onSelect`）。

### 5.3 file_context 零分配截取（已在 Phase 4.3 覆盖）

### 5.4 最终验证

- `npm --prefix frontend run typecheck` — 0 errors
- `npm --prefix frontend test` — 全部通过（283+ test cases）
- `cargo test --workspace` — 全部通过
- 手动 UI 验证：打开/关闭标签页、流式消息、终端操作、文件编辑、补丁审查

---

## 执行顺序总结

| Phase | 任务数 | 预计影响 | 验证方式 |
|-------|--------|----------|----------|
| **Phase 1** 渲染性能 | 4 | 🔴最大 | 类型检查 + 测试 + 手动 |
| **Phase 2** 模块化 | 5 | 🟡大 | 类型检查 + 测试 |
| **Phase 3** 架构治理 | 3 | 🟡中 | 构建 + 类型检查 |
| **Phase 4** Rust 改进 | 4 | 🟢小 | cargo test |
| **Phase 5** 润色 | 2 | 🟢微小 | 类型检查 + 手动 |

**建议执行方式**：按 Phase 1 → 2 → 3 → 4 → 5 顺序，每个 Phase 内任务可并行执行。

---

> 由自动化重构洞察生成于 2026-05-23 02:54:04

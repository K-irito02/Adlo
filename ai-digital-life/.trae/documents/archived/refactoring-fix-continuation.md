# 重构修复延续计划 — 第 2 阶段

> 基于 `refactoring-fix-plan.md` 的剩余工作，按优先级分阶段执行

## 当前进展

已在上一次会话中完成了 **10 项修复**（阶段 1 全部 7 项 + 阶段 2 中的 2.1/2.2/2.3），183 项测试全部通过。

## 本阶段执行计划（按优先级排列）

---

## A. 快速收获 — Store 级优化（Effort: Small）

### A1. 2.4 — `terminalSlice.ts` localStorage 异步化

**文件**: [terminalSlice.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts)

**当前问题**（L116-L121, L150-L168）：
- 模块顶层 3 次同步 `localStorage.removeItem()` 
- slice 初始化时 3 次同步 `readJson()`/`readNumber()` 阻塞首屏
- 每次 mutation 使用 `setTimeout(() => writeJson(...), 0)`（无批处理）

**改动**：
1. 删除模块顶层的 `localStorage.removeItem()` 调用（L116-L121）
2. 将初始化值的同步读取改为惰性初始化模式：
   - 默认值直接在 slice 中使用合理的 fallback（如 `"powershell"`、`200`、`{}`）
   - 在 `requestIdleCallback` 中异步读取 localStorage 并更新
3. 用 `requestIdleCallback` 批处理替代 `setTimeout(() => writeJson(...), 0)`：
   - 收集所有待写入的 key/value 到 `pendingWrites: Map<string, unknown>`
   - `requestIdleCallback` 触发时一次性 flush

**验证**：`npm run typecheck` && `npm test`

---

### A2. 2.5 — `generalActions.ts` `bootstrap()` 合并级联 `set()`

**文件**: [generalActions.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/actions/generalActions.ts)

**当前问题**：`bootstrap()` 内部有 **3-4 次独立 `set()` 调用**（L51-L66, L91-L99, L113-L120, L140-L162），导致单次启动触发 3-4 次 React 重渲染。

**改动**：
1. 将前两/三次 `set()` 合并为单次批量 set：
   ```typescript
   let nextState: Partial<StoreState> = { /* 初始状态 */ };
   // 在 if (appInfoResult.data.currentWorkspace) 分支中向同一个 nextState 追加
   set(nextState); // 仅一次
   ```
2. `queueLowPriorityRefresh` 回调中 5 个并行操作各自的 `set()` 合并到单个微任务

**验证**：`npm run typecheck` && `npm test`，启动流程功能正常

---

### A3. 4.5 — `sessionSlice.ts` rAF 流式缓冲区添加上限保护

**文件**: [sessionSlice.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/sessionSlice.ts)

**当前问题**：`appendStreamingText` 的 `_streamingBuffer`（模块级字符串）在标签页不可见时（rAF 被暂停）无限累积。

**改动**：添加 `STREAMING_BUFFER_LIMIT = 10240`（10KB），超过时立即 flush：
```typescript
appendStreamingText: (text) => {
    _streamingBuffer += text;
    if (_streamingBuffer.length > 10240) {
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

**验证**：`npm run typecheck`

---

## B. 性能优化 — Bundle 体积（Effort: Medium）

### B1. 4.1 — `cmLanguages.ts` CodeMirror 语言包按需动态导入

**文件**: [cmLanguages.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/editor/cmLanguages.ts)、[CodeEditor.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/editor/CodeEditor.tsx)、[DiffViewer.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/diff-viewer/DiffViewer.tsx)、[InlineDiffViewer.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/diff-viewer/InlineDiffViewer.tsx)、[SideBySideDiffViewer.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/diff-viewer/SideBySideDiffViewer.tsx)

**当前问题**：10 个 CodeMirror 语言包（~285KB min+gz）全部静态导入。

**改动**：

1. 修改 `cmLanguages.ts`：
```typescript
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

2. 更新 `CodeEditor.tsx`：将 `basicExtensions` 中的同步调用改为 `useEffect` 中的异步调用：
   - 使用 `useState` 保存动态加载的 language extensions
   - `useEffect(() => { getLanguageExtension(language).then(setLangExt) }, [language])`
   - 将 `langExt` 加入 `allExtensions`

3. 更新 `InlineDiffViewer.tsx` 和 `SideBySideDiffViewer.tsx`：类似模式

**注意**：此改动影响 5 个文件，需要在 `useEffect` 中处理加载状态。加载期间 fallback 到无语法高亮的编辑器。

**验证**：`npm run typecheck` && `npm test`。构建后确认 `vendor-codemirror` chunk 体积减小。

---

### B2. 4.2 — `MarkdownPreview.tsx` 按需加载 highlight.js

**文件**: [MarkdownPreview.tsx](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/features/preview/MarkdownPreview.tsx)

**当前问题**：`import hljs from "highlight.js"` 导入全部 190+ 语言（~150KB+）。

**改动**：替换为 `import hljs from "highlight.js/lib/common"`（仅 ~35 种常用语言，约 40KB，减少 ~110KB）。

**验证**：确认构建后 MarkdownPreview chunk 体积减小。运行 `npm test`。

---

### B3. 4.6 — 添加打包体积分析工具

**文件**: [vite.config.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/vite.config.ts)、[package.json](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/package.json)

**改动**：
1. 安装：`npm install --save-dev rollup-plugin-visualizer`
2. 在 `vite.config.ts` 中添加条件性插件
3. 在 `package.json` 中添加 `"build:analyze"` 脚本

**验证**：`npm run build:analyze` 生成 `dist/stats.html`

---

## C. 性能优化 — 渲染性能（Effort: Small）

### C1. 4.3 — CSS `content-visibility: auto` 添加

**文件**: [center.css](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/styles/regions/center.css)、[files-panel.css](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/styles/regions/rightpanel/files-panel.css)、[changes-panel.css](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/styles/regions/rightpanel/changes-panel.css)

**当前问题**：所有 CSS 中无 `content-visibility` 声明，长列表（消息流、文件树、变更列表）的所有项都参与布局和绘制。

**改动**：
- `center.css` 的 `.adl-message-stream`：添加 `content-visibility: auto; contain-intrinsic-size: auto 300px;`
- `files-panel.css` 的 `.adl-multitree-scroll` 或 `.adl-filetree`：添加 `content-visibility: auto; contain-intrinsic-size: auto 400px;`
- `changes-panel.css` 的 `.adl-tool-panel--changes`：添加 `content-visibility: auto; contain-intrinsic-size: auto 300px;`

**验证**：UI 渲染功能正常，无布局偏移。

---

### C2. 4.4 — `selectors.ts` 添加 `terminalTabsById` O(1) 查找

**文件**: [terminalSlice.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts)、[selectors.ts](file:///e:/Programs/Obsidian/notes/ai-digital-life/frontend/src/app/stores/selectors.ts)

**当前问题**：`useActiveTerminalTab` 使用 `.find()` O(n) 遍历数组。

**改动**：
1. 在 `terminalSlice.ts` 的 `TerminalSlice` 接口中添加 `terminalTabsById: Record<string, TerminalTabState>`
2. 在 `createTerminalSlice` 中初始化 `terminalTabsById: {}`
3. 在所有修改 `terminalTabs` 的 setter 中同步更新 `terminalTabsById`（`terminalCreateTab`, `terminalCloseTab`, `terminalUpdateTab`, `terminalTogglePin`, `terminalReorderTabs`）
4. 在 `selectors.ts` 中更新选择器：
```typescript
getActiveTerminalTab: (state: StoreState) =>
    state.terminalActiveTabId ? state.terminalTabsById[state.terminalActiveTabId] : undefined,
```

**验证**：`npm run typecheck` && `npm test`

---

## D. Rust 后端优化（Effort: Large，建议单独安排）

### D1. 5.1 — `agent.rs` `start_run_inner` 拆分

**文件**: [agent.rs](file:///e:/Programs/Obsidian/notes/ai-digital-life/src-tauri/src/commands/agent.rs)

**当前问题**：333 行的 God Function（L186-L519），混合 4 项职责。

**拆分方案**：
| 函数 | 行数 | 职责 |
|------|------|------|
| `prepare_activity()` | ~50 | 创建 activity 记录 + 上下文构建 |
| `execute_model_call()` | ~80 | 模型网关调用 + 流式处理 |
| `handle_stream_output()` | ~80 | 流式输出 → patch 生成与应用 |
| `finalize_run()` | ~60 | 任务状态更新 + 会话同步 |

**验证**：`cargo test --workspace`

### D2. 5.2 — `tree.rs` 合并 `build_retrieval_snapshot` 双重遍历

**文件**: [tree.rs](file:///e:/Programs/Obsidian/notes/ai-digital-life/crates/workspace/src/tree.rs)

**改动**：在 `build_retrieval_snapshot` 中将两次独立的遍历合并为单次。

**验证**：`cargo test --workspace`

### D3. 5.3 — `terminal/Cargo.toml` 解耦 `tauri` 依赖

**文件**: [Cargo.toml](file:///e:/Programs/Obsidian/notes/ai-digital-life/crates/terminal/Cargo.toml)、`src-tauri/src/terminal.rs`（新建）

**改动**：移除 `tauri` 依赖，将 Tauri 相关代码上移至 `src-tauri/src/`。

**验证**：`cargo test --workspace` && `cargo check`

---

## 执行路线图

| 序号 | 任务 | 文件数 | 工作量 | 风险 |
|------|------|--------|--------|------|
| A1 | terminalSlice localStorage 异步化 | 1 | 小 | 低 |
| A2 | generalActions bootstrap set 合并 | 1 | 小 | 中（需确保启动流程正确） |
| A3 | sessionSlice rAF 缓冲区上限 | 1 | 非常小 | 极低 |
| **A 组小计** | | **3** | **~1h** | |
| B1 | CodeMirror 按需加载 | 5 | 中 | 中（异步化重构，需确认所有调用方） |
| B2 | highlight.js 按需加载 | 1 | 非常小 | 极低 |
| B3 | 打包分析工具 | 2 | 小 | 极低 |
| **B 组小计** | | **8** | **~2h** | |
| C1 | content-visibility CSS | 3 | 非常小 | 极低 |
| C2 | terminalTabsById O(1) | 2 | 小 | 低 |
| **C 组小计** | | **5** | **~0.5h** | |
| D1 | agent.rs 拆分 | 1 | 中 | 中（Rust 重构） |
| D2 | tree.rs 合并遍历 | 1 | 小 | 低 |
| D3 | terminal tauri 解耦 | 2 | 中 | 中 |
| **D 组小计** | | **4** | **~4h** | |

### 建议执行顺序

```
A1 → A3 → A2 → C1 → C2 → B2 → B3 → B1 → D2 → D3 → D1
(低风险→中风险，按依赖关系排列)
```

## 验证策略

| 阶段 | 验证命令 |
|------|----------|
| A/C 组（纯前端 JS） | `npm run typecheck` && `npm test` |
| B 组（构建/打包） | `npm run typecheck` && `npm test` && `npm run build` |
| D 组（Rust） | `cargo test --workspace` && `cargo check` |

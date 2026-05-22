# 第七轮重构修复计划

**生成日期**：2026-05-23
**来源报告**：`docs/重构洞察/refactor-insight-2026-05-23.md`

---

## 执行摘要

基于第六轮重构（2026-05-22 Store 拆分、桥接模块化、Rust 优化）之后的再次审计，本次计划**共 22 项修复任务**，按风险-收益评估分为 5 个 Phase：

| Phase | 主题 | 任务数 | 风险等级 |
|-------|------|--------|----------|
| Phase 1 | 快速修复（Rust 死依赖/空 crate、前端死代码） | 4 | 🟢低 |
| Phase 2 | 稳定性与性能核心修复（App 选择器、ErrorBoundary、mutex 优雅降级等） | 6 | 🟡中 |
| Phase 3 | 大型组件拆分（LeftSidebar/TerminalPanel/DiffViewer） | 3 | 🔴高 |
| Phase 4 | 代码质量改进（Icon 去重、useMemo 补充、运算符括号、run_activity 方法提取等） | 6 | 🟢低 |
| Phase 5 | 低优先级优化（死代码确认、Map 上限、滚动卡顿、reverse 分配等） | 3 | 🟢低 |

---

## Phase 1：快速修复（低风险，明确收益）

> 这些修复简单直接、不涉及逻辑变更，优先执行以降低后续 Phase 的干扰。

### 1.1 移除 `change-engine` 对 `adl-terminal` 的死依赖

**文件**：`crates/change-engine/Cargo.toml:L10`
**现状**：`adl-terminal = { path = "../terminal" }` 但 `change-engine/src/lib.rs` 中从未引用 `adl_terminal`
**改动**：删除该行
**验证**：`cd ai-digital-life && cargo check -p adl-change-engine` 零警告零错误

### 1.2 移除 `context-engine` 和 `prompt-engine` 对 `adl-errors` 的未使用依赖

**文件**：
- `crates/context-engine/Cargo.toml:L8`：`adl-errors = { path = "../errors" }`
- `crates/prompt-engine/Cargo.toml:L8`：同上
**现状**：两 crate 的 `lib.rs` 中均无 `use adl_errors` 或使用其类型
**改动**：从两个 `Cargo.toml` 删除该行
**验证**：`cargo check -p adl-context-engine -p adl-prompt-engine`

### 1.3 移除 `crates/editor/` 空占位 crate

**文件**：
- `crates/editor/src/lib.rs`：仅一行注释
- `Cargo.toml`（workspace 根）：[workspace.members] 中移除 `crates/editor`
- `src-tauri/Cargo.toml`：移除 `adl-editor` 依赖
**现状**：空 crate 增加编译开销却无任何功能
**改动**：删除 `crates/editor/` 目录，从 workspace 和 src-tauri 依赖中移除
**验证**：`cargo check --workspace` 通过

### 1.4 确认并移除未使用的 `useStreamingText.ts`

**文件**：`frontend/src/app/hooks/useStreamingText.ts`
**现状**：全项目搜索仅自身定义行，无任何调用方；流式文本已由 `streamActions.ts` + Zustand `streamingAssistantText` 管理
**改动**：删除该文件
**验证**：`npm --prefix frontend run typecheck` 零错误

---

## Phase 2：稳定性与性能核心修复（中等风险）

### 2.1 拆分 App 组件 Zustand 选择器（关键性能瓶颈）

**文件**：`frontend/src/app/App.tsx:L40-L205`
**现状**：`useAppStore(useShallow(...))` 扁平展开 80+ 字段+action；每次任意状态变更触发 `App` 重渲染，级联所有子组件
**改动**：
1. 新建 `frontend/src/app/hooks/useAppActions.ts`——仅选择性 actions，不选状态
2. `App.tsx` 中移除所有状态字段选择，只留 `error`（因直接使用）
3. `LeftSidebar`、`CenterPane`、`RightPanel` 各自使用细粒度选择器只选所需状态

**设计决策**：
- Actions 用 `useShallow` 包裹，因为它们是不变引用
- 警告：此改动涉及面广，需确保所有子组件已自给自足（即不要依赖父组件通过 props 下传的状态）
- 每个子组件独立选择后，需确认 `useShallow` 浅比较能阻止不必要的重渲染

**验证**：
- `npm --prefix frontend run typecheck` 通过
- `npm --prefix frontend test` 全部通过
- 手动验证应用功能正常

### 2.2 为三个主面板添加 Error Boundary

**文件**：`frontend/src/app/App.tsx:L672-L848`
**现状**：渲染树无 `ErrorBoundary`，任何子组件崩溃导致全应用白屏
**改动**：
1. 新建 `frontend/src/app/components/ErrorBoundary.tsx`——类组件形式 `componentDidCatch`，渲染 `fallback` UI
2. `App.tsx` 中包裹 `<ErrorBoundary>` 到 `LeftSidebar`、`CenterPane`、`RightPanel` 三个区域

**验证**：在浏览器控制台主动构造一个渲染异常，确认仅该区域降级而非全应用白屏

### 2.3 storage DB mutex 中毒优雅降级

**文件**：`crates/storage/src/lib.rs:L29`
**现状**：`.expect("database mutex poisoned")` 中毒即崩溃整个桌面应用
**改动**：替换为 `self.conn.lock().map_err(|_| AppError::Internal("database mutex poisoned"))?`
- `conn()` 返回类型改为 `Result<MutexGuard<'_, Connection>, AppError>`
- 所有调用点加 `?`
**验证**：`cargo test -p adl-storage` 通过

### 2.4 model-gateway 空 choices 静默错误处理

**文件**：`crates/model-gateway/src/lib.rs:L204-L208`
**现状**：`.unwrap_or_default()` 在 API 返回空 `choices` 数组时静默变空字符串
**改动**：
```rust
let content = body.choices.first().map(|choice| choice.message.content.clone()).ok_or_else(|| {
    AppError::Model(format!("API returned empty choices array (model={model_id})"))
})?;
```
**验证**：`cargo test -p adl-model-gateway` 通过

### 2.5 DiffViewer `onMount` 缺失依赖修复

**文件**：
- `frontend/src/app/features/diff-viewer/DiffViewer.tsx:L410-L418`（SideBySide）
- `frontend/src/app/features/diff-viewer/DiffViewer.tsx:L585`（Inline）
**现状**：两个 `useEffect` 依赖数组均缺失 `onMount`，导致回调引用变化时 Effect 不重新执行
**改动**：在两个依赖数组中加入 `onMount`
**验证**：`npm --prefix frontend run typecheck` 通过

### 2.6 ptyBridge HMR 泄漏修复

**文件**：`frontend/src/preview-bridge/ptyBridge.ts:L6-L9`
**现状**：模块级变量在 Vite HMR 时不重置，累积旧轮询与监听器
**改动**：使用工厂函数模式，`createPtyBridge()` 返回全新状态
- 将 `ptyOutputListeners`、`ptyPollingInterval` 等移至函数内部闭包
- 导出 `createPtyBridge` 而非模块级函数
**验证**：`npm --prefix frontend run typecheck` 通过

---

## Phase 3：大型组件拆分（高风险，高收益）

### 3.1 LeftSidebar 拆分（1796 行）

**文件**：`frontend/src/app/regions/LeftSidebar.tsx`

**拆分方案**：

| 新文件 | 职责 | 预估行数 |
|--------|------|----------|
| `regions/left-sidebar/WorkspaceList.tsx` | 工作区列表渲染与交互 | ~165 行 |
| `regions/left-sidebar/SessionList.tsx` | 会话列表（含拖拽重排） | ~280 行 |
| `regions/left-sidebar/ConversationPanel.tsx` | 对话面板 | ~60 行 |
| `regions/left-sidebar/ResizeHandle.tsx` | 拖拽调整宽度 | ~60 行 |
| `regions/left-sidebar/SidebarContextMenu.tsx` | 右键菜单（从现有 L374-430 提取） | ~60 行 |
| `regions/left-sidebar/index.ts` | 导出组合 `LeftSidebar` | ~20 行 |
| `regions/LeftSidebar.tsx`（改造后） | 组合各子组件，保持对外接口一致 | ~80 行 |

**额外**：提取 8 个 mock 函数（`buildMockStandaloneSessions` 等）到独立文件 `left-sidebar/mockData.ts`，或直接删除（`usingMockStandaloneSessions = false` 已硬编码）。

**风险控制**：
- 每个新文件单独创建，每迁移一个子组件后运行 `typecheck` 确认
- 确保 props 接口与原组件一致
- 最后删除原组件中的对应代码块

### 3.2 TerminalPanel 拆分（793 行）

**文件**：`frontend/src/app/features/terminal/TerminalPanel.tsx`

**拆分方案**：

| 新文件 | 职责 | 预估行数 |
|--------|------|----------|
| `features/terminal/TerminalTabBar.tsx` | 标签栏 + 拖拽排序 + 右键菜单 | ~150 行 |
| `features/terminal/TerminalContextMenu.tsx` | 标签右键菜单 | ~60 行 |
| `features/terminal/TerminalShellSelector.tsx` | Shell 类型选择下拉 | ~80 行 |
| `features/terminal/TerminalEmptyState.tsx` | 空白引导页（"当前没有打开的终端会话"） | ~80 行 |
| `features/terminal/TerminalPanel.tsx`（改造后） | 主容器组合各子组件 + 逻辑编排 | ~200 行 |

**额外**：将 11 处硬编码中文字符串替换为 `t()` 调用（如 `"关闭所有"`→`t("closeAll")`、`"终端面板"`→`t("terminalPanel")` 等），补充 i18n 词汇表。

### 3.3 DiffViewer 拆分（672 行）

**文件**：`frontend/src/app/features/diff-viewer/DiffViewer.tsx`

**拆分方案**：

| 新文件 | 职责 | 预估行数 |
|--------|------|----------|
| `features/diff-viewer/SideBySideDiffViewer.tsx` | SideBySide 模式 diff 视图 | ~300 行 |
| `features/diff-viewer/InlineDiffViewer.tsx` | Inline 模式 diff 视图 | ~158 行 |
| `features/diff-viewer/DiffViewer.tsx`（改造后） | 模式选择器 + 共享配置 + 对外接口 | ~100 行 |
| `features/diff-viewer/sharedExtensions.ts` | 共享 CodeMirror 扩展构建（与 CodeEditor 对齐） | ~60 行 |

**额外**：从 `DiffViewer.tsx` 和 `CodeEditor.tsx` 中提取共享扩展配置到新文件，消除两处 `baseExtensions`/`buildSharedExtensions` 重复。

---

## Phase 4：代码质量改进（低风险）

### 4.1 抽取共享 Icon 组件

**文件**：6 处重复定义（`ContextBuilder.tsx`、`MessageStream.tsx`、`MessageBubble.tsx`、`PromptInput.tsx`、`ActionButton.tsx`、`WelcomeState.tsx`）
**改动**：新建 `app/components/Icon.tsx`，定义共享 `Icon` 组件；6 处改为 import 引用
**验证**：`typecheck` + `test` 通过

### 4.2 CodeEditor.tsx 移除无效 theme 依赖

**文件**：`frontend/src/app/features/editor/CodeEditor.tsx:L97-L117`
**现状**：`theme` 在 `baseExtensions` 的 `useMemo` 依赖中但函数体未引用
**改动**：从 `useMemo` 依赖数组中移除 `theme`
**验证**：`typecheck` 通过

### 4.3 RightPanel/ChangesPanel/FilesPanel useMemo 补充

**文件**：
- `frontend/src/app/regions/RightPanel.tsx:L306-L314`：`badges` 对象
- `frontend/src/app/regions/right-panel/ChangesPanel.tsx:L189-L210`：`changesMenuItems`
- `frontend/src/app/regions/right-panel/FilesPanel.tsx:L129-L158`：`fileMenuItems`
**改动**：以上三处用 `useMemo` 包裹
**验证**：`typecheck` 通过

### 4.4 task crate 运算符括号明确化

**文件**：`crates/task/src/lib.rs:L26-L31`
**改动**：`\|\| command_lower == "cargo" && args...` → `\|\| (command_lower == "cargo" && args...)`
**验证**：`cargo check` 通过

### 4.5 run_activity.rs 提取 `seq()` 方法

**文件**：`src-tauri/src/commands/run_activity.rs:L26-L37`
**改动**：为 `DigitalLifeRunActivityEventV1` 实现 `fn seq(&self) -> i64`，`sort_by_key` 简化为 `events.sort_by_key(|e| e.seq())`
**验证**：`cargo test --workspace` 通过

### 4.6 streamActions 订阅者函数提升

**文件**：`frontend/src/app/stores/actions/streamActions.ts:L130-L136`
**改动**：将 `createModelStreamSubscriber` / `createRunActivitySubscriber` 提升到模块作用域，通过参数注入 `get`/`set`
**验证**：`typecheck` 通过

---

## Phase 5：低优先级优化

### 5.1 fileTree.tsx `{...props}` 展开缩小

**文件**：`frontend/src/app/features/file-tree/fileTree.tsx:L388`
**改动**：替换 `{...props}` 为仅传递需要的 props（`node`、`depth`、`renderMeta`、`onClick` 等），非整个 props 对象
**验证**：`typecheck` 通过

### 5.2 CustomScrollArea.tsx children 依赖稳定化

**文件**：`frontend/src/app/features/file-tree/CustomScrollArea.tsx:L82`
**改动**：从 `useEffect` 依赖中移除 `children`；使用 ref 访问当前子元素
**验证**：`typecheck` 通过

### 5.3 context-engine locale 截取零分配优化

**文件**：`crates/context-engine/src/lib.rs:L14-L23`
**改动**：双重 `chars().rev()...collect()` 替换为 `content.char_indices().nth_back(max_chars/2)`
**验证**：`cargo test -p adl-context-engine` 通过

---

## 未纳入计划的问题

以下问题经评估暂不纳入本轮计划，理由如下：

| 问题 | 原因 | 替代方案 |
|------|------|----------|
| `storage` 同步 `Arc<Mutex>` 阻塞 tokio | 涉及架构级改动（引入 `tokio-rusqlite` 或全面 `spawn_blocking`），建议 Phase 2+ 统一处理 | 先做 2.3 mutex 中毒降级 |
| `model-gateway` 不必要的 `response.usage.clone()` | 收益极小（单次 clone 8 个 i32），需解构 `ModelResponse` 影响面大 | 保持现状 |
| `CenterPane.tsx` smooth 滚动卡顿 | 用户体感不明显，且 `behavior: "smooth"` 仅当流式更新触发时生效 | 保持现状，等待用户反馈 |
| `TerminalPanel.tsx sessionOutputsRef` 无上限 | 实际使用中很少累积大量 session | 保持现状 |
| `kernel/src/types.rs` 1264 行上帝类型 | 当前阶段 18 个 crate 的编译时间可接受，过早拆分增加维护成本 | 项目增长至 30+ crate 时再拆分 |

---

## 验证确认清单

| 检查项 | 命令 |
|--------|------|
| Rust 编译检查 | `cd ai-digital-life && cargo check --workspace` |
| Rust 测试 | `cd ai-digital-life && cargo test --workspace` |
| 前端类型检查 | `npm --prefix frontend run typecheck` |
| 前端测试 | `npm --prefix frontend test` |
| 功能回归 | 浏览器模式手动验证核心流程（打开工作区、对话、流式消息、补丁审查） |

---

## 执行顺序建议

```
Phase 1 (快速修复)
  ├── 1.1 ~ 1.4 → 执行后立即 cargo check + typecheck
  ↓
Phase 2 (稳定性核心)
  ├── 2.3 (storage) → cargo test
  ├── 2.4 (model-gateway) → cargo test
  ├── 2.5 (DiffViewer onMount) → typecheck
  ├── 2.6 (ptyBridge HMR) → typecheck
  ├── 2.2 (ErrorBoundary) → typecheck + 手动验证
  └── 2.1 (App 选择器) → typecheck + 完整功能验证
  ↓
Phase 3 (大型拆分)
  ├── 3.3 DiffViewer → typecheck + 手动验证
  ├── 3.2 TerminalPanel → typecheck + 手动验证
  └── 3.1 LeftSidebar → typecheck + 完整功能验证
  ↓
Phase 4 (代码质量)
  ├── 4.1 ~ 4.6 → typecheck + test
  ↓
Phase 5 (低优先级后置)
  └── 5.1 ~ 5.3 → typecheck + cargo test
```

---

> 基于 [refactor-insight-2026-05-23.md](../../docs/重构洞察/refactor-insight-2026-05-23.md) 制定

---

## 执行完成状态（2026-05-23）

| Phase | 任务数 | 完成 | 验证结果 |
|-------|--------|------|----------|
| Phase 1 | 4 | ✅ 全部完成 | `cargo check` + `typecheck` 通过 |
| Phase 2 | 6 | ✅ 全部完成 | `cargo test` + `npm test` 通过 |
| Phase 3 | 3 | ⏸️ 暂缓（高风险架构拆分，需独立规划） | — |
| Phase 4 | 6 | ✅ 全部完成 | `typecheck` + `cargo test` 通过 |
| Phase 5 | 3 | ✅ 全部完成 | `typecheck` + `cargo test` 通过 |

### 关键变更统计

| 指标 | 数值 |
|------|------|
| Rust 死依赖移除 | 3 项（change-engine/terminal、context-engine/errors、prompt-engine/errors） |
| 空 crate 清理 | 1 项（crates/editor） |
| 死代码清理 | 1 项（useStreamingText.ts） |
| DB mutex 中毒降级 | 12+ 调用点加 `?`，2 个外部 crate 同步更新 |
| Error Boundary | 新建 + 3 个主面板包裹 |
| App 选择器拆分 | 80+ 字段 → `error`(单字段) + `useAppActions()`(稳定 actions) + 35 字段(state 组) |
| 共享 Icon 组件 | 6 处重复 → 1 个共享组件 |
| useMemo 补充 | 3 处（badges/changesMenuItems/fileMenuItems） |
| onMount 依赖修复 | 2 处 SideBySide/Inline DiffViewer |
| run_activity 提取 | 10 路 match → `fn seq()` 方法 |
| ptyBridge HMR 泄漏 | 模块级变量 → 工厂函数内部闭包 |
| 零分配优化 | context-engine 双重 `chars().rev()` → `char_indices().nth_back()` |

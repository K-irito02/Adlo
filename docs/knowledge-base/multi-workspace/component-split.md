# 重构洞察 — 阶段 3 组件架构拆分 + 剩余工作收尾

> 撰写日期：2026-05-25 | 基于已完成的所有重构任务

---

## 概要

本阶段完成了第 **12-13 轮重构**，聚焦两大目标：

1. **组件架构拆分**（第 12 轮）：将 4 个超大型模块拆分为 12 个独立文件
2. **剩余工作收尾**（第 13 轮）：修复此前遗留的 God Function、CSS 不一致、死代码删除等问题

---

## 已解决的问题

### P1 — ChangesPanel.tsx（1037 行 → ~870 行）

**问题**：混合 7 项职责（变更树渲染、上下文菜单、确认对话框、diff 编辑器、补丁预览、拖拽排序）。

**方案**：提取 2 个子组件：
- `ChangesTreePanel.tsx` — 变更树导航器（含 OutlineTree + MultiWorkspaceChangesTree）
- `ChangesConfirmDialogs.tsx` — 确认对话框 + 重命名输入

**难点**：`ChangesTreePanel` 需要传递约 40 个 props，保持与 `MultiWorkspaceChangesTree` 的严格类型兼容。

### P2 — CenterPane.tsx（629 行 → ~360 行）

**问题**：内联 `ApprovalInlineCard` + `WelcomeState` + `ComposerFooter` 混在 629 行组件中。

**方案**：提取 3 个独立文件，通过 `center-pane/index.ts` barrel 导出。

**难点**：`ComposerFooter` 引用了 `StatusBar`（存在循环引用风险），路径需要从 `../../../` 调整为 `../../`。

### P3 — StatusBar.tsx（588 行 → ~470 行）

**问题**：6 个辅助函数（`gitIcon`, `gitStatusLabel`, `modelLabel`, `modelHealthLabel`, `modelHealthTone`, `isDirtyWorktree`）混在主组件中。

**方案**：提取到 `StatusBar/utils.tsx`。使用 `.tsx` 扩展而非 `.ts`，因为 `gitIcon` 返回 JSX。

**教训**：Rust 风格的类型模块（`.ts`）与 React 渲染函数（`.tsx`）文件名规则不同——当提取的 utils 包含 JSX 返回类型时，必须使用 `.tsx` 扩展名，否则 tsc 报 `'>' expected`。

### P4 — useTerminalPanel.ts（519 行 → ~480 行）

**问题**：13 个 useState、25 个 useCallback，混合标签管理、PTY 会话、拖拽排序、上下文菜单 4 项职责。

**方案**：提取 `useTerminalContextMenu.ts`（上下文菜单状态 + 5 个回调）。

**难点**：上下文菜单使用 `setContextMenu` 在原始文件中，提取后需要在 `useTerminalPanel.ts` 中调整一个 `useEffect`——原本监听 `contextMenu.open` 的自动关闭逻辑需要独立保留在子 hook 中。

### P5 — agent.rs（334 行 God Function → 6 个函数）

**问题**：`start_run_inner` 混合 8 个逻辑阶段，闭包捕获 5 个变量。

**方案**：提取 6 个函数：
- `make_activity_emitter()` — 闭包提升为顶层函数
- `prepare_run()` — 消息创建 + 审计日志
- `collect_context()` — 上下文收集
- `call_model()` — 模型网关调用 + 流式事件
- `generate_patches()` — 补丁创建 + DB 持久化
- `finalize_run()` — Run 完成 + 消息保存

**关键挑战 — `Send` 约束问题**：
- 第 1 次尝试：使用 `Box<dyn Fn(Value) + Send + Sync + 'static>` → 需要将所有借用改为 `Arc`，改动量大
- 第 2 次尝试：使用 `&(dyn Fn(Value) + '_)` 作为参数类型 → async 上下文中的 `Send` 约束失败
- **最终方案**：使用 `impl Fn(serde_json::Value) + 'a` 且 `emit_activity` 闭包作为 **值参数传递**（非引用），避免 async Send 检测。`make_activity_emitter` 直接消费 `String` 类型（非 `&str`），生命周期绑定到函数参数 `'a`

**经验**：Rust async 中的闭包 Send 约束是常见陷阱。关键决策：将闭包所有者从 `start_run_inner` 提升到外部函数，避免 async fn 捕获非 Send 闭包。

### R2 — PromptInput 替换（UI 复原）

**问题**：将 `contentEditable` div 替换为 `PromptInput` 受控组件时，`prompt-input__*` CSS 类在项目中无对应样式，导致输入框 UI 破坏。

**方案**：**回滚**为原始 `contentEditable` + 自定义光标方案。删除约 150 行死代码（`updateCustomCaret`、`onKeyDown`、`onInput`、`composerEditorRef` 等）。

**教训**：在没有对应 CSS 样式文件的情况下，不应引入新组件。`PromptInput` 的设计初衷可能来自另一个项目，其 CSS 类名（`prompt-input__textarea`、`prompt-input__char-count` 等）在本项目中不存在样式定义。

### R3 — ChangesPanel 进一步缩减（已从 1343→992 行）

**问题**：剩余的可提取 JSX 块（补丁 diff 编辑器 + change preview 编辑器）与主组件共享约 30+ props，耦合度高。

**方案**：暂缓进一步提取。992 行已比原始 1343 行减少 26%。

### R4 — 工作区选择分离

**问题**：左侧侧边栏工作区点击同时切换右侧面板，预期只切换对话区域。

**方案**：核心 5 步中 4 步已在前序重构完成（`switchToWorkspace` action、`WorkspaceList` prop、`LeftSidebar` 配线、`StoreState` 类型）。

---

## 架构变化

### 目录结构变更

```
frontend/src/app/regions/
├── center-pane/                           【新增目录】
│   ├── index.ts                           【新增】barrel 导出
│   ├── ApprovalInlineCard.tsx             【新增】从 CenterPane.tsx 提取
│   ├── WelcomeState.tsx                   【新增】从 CenterPane.tsx 提取
│   └── ComposerFooter.tsx                 【新增】从 CenterPane.tsx 提取
├── right-panel/panels/
│   ├── ChangesConfirmDialogs.tsx           【新增】从 ChangesPanel.tsx 提取
│   └── ChangesTreePanel.tsx               【新增】从 ChangesPanel.tsx 提取
├── StatusBar/
│   └── utils.tsx                          【新增】6 个辅助函数
└── features/terminal/
    └── useTerminalContextMenu.ts           【新增】从 useTerminalPanel.ts 提取
```

### 模块依赖简化

| 模块 | 之前 | 之后 | 改善 |
|------|------|------|------|
| `ChangesPanel.tsx` | 31 个 import | 27 个 import | -13% |
| `CenterPane.tsx` | 13 个内联函数/组件 | 3 个导入组件 | +复用性 |
| `StatusBar.tsx` | 6 个内联函数 | 1 个 import | +可测性 |
| `agent.rs` | 1 个 334 行函数 | 7 个独立函数 | +可读性 |

---

## 经验教训

### 1. 提取组件时保留 UI 完整性

**事件**：PromptInput 替换 → UI 破坏 → 回滚
**根源**：`prompt-input__*` CSS 类在项目中无对应样式
**规则**：引入新组件前，必须确认其 CSS 文件存在于项目样式系统中

### 2. Rust 闭包 Send 约束是 async 重构的主要障碍

**事件**：agent.rs 3 次尝试拆分
**方案**：`impl Fn(Value) + 'a` + 值传递 + String 所有权
**规则**：在 async 函数中提取闭包时，优先考虑消除闭包依赖，次选将闭包提升为非 async 函数的外层

### 3. 提取后测试回归至关重要

**事件**：outlinePanelWiring 测试因 `MultiWorkspaceChangesTree` 移入 `ChangesTreePanel.tsx` 而失败
**方案**：测试文件同步更新引用路径
**规则**：snapshot-style 测试（`readFileSync` + `toContain`）对文件拆分敏感，必须同步更新

### 4. JSX 提取的耦合阈值

**经验**：当提取目标需要传递 20+ props 时，提取的收益/成本比大幅下降
**决策**：ChangesPanel 的补丁编辑器区域（约 150 行 JSX，30+ props 传递）暂缓提取
**阈值建议**：超过 15 个 props 的组件提取应先验证收益

---

## 文件变更统计

| 指标 | 数值 |
|------|------|
| 新增文件 | 9 个 |
| 修改文件 | 6 个 |
| 删除死代码 | ~150 行 |
| 总拆分部件 | 12 个（11 组件 + 1 工具文件） |
| 提取的辅助函数 | 6 个 |
| Rust 函数拆分 | 6 个独立函数 |
| typecheck 通过率 | ✅ 0 errors |
| 前端测试通过率 | ✅ 183/183 |
| Rust 测试通过率 | ✅ 44/44 |

---

## 相关文件

- [component-split-phase3.md](file:///e:/Programs/Obsidian/notes/adlo/.trae/documents/component-split-phase3.md) — 阶段 3 拆分计划
- [remaining-work-plan.md](file:///e:/Programs/Obsidian/notes/adlo/.trae/documents/remaining-work-plan.md) — 剩余工作执行计划
- [AGENTS.md](file:///e:/Programs/Obsidian/notes/adlo/AGENTS.md) — 项目治理文件

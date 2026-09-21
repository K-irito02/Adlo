# 高风险重构经验总结（2026-06-12）

## 概述

针对 2026-06-12 重构洞察报告的 5 个 🔴 高风险目标，进行了系统性重构。涵盖桥接层语义修复、GitHub 面板+通信切片重组、浏览器 Hook+Store 切片拆分三大工作包。

## 核心成果

| 目标 | 前 | 后 | 减少 |
|------|----|----|------|
| browserSlice | 962 行 | 244 行 | -718 行 |
| useBrowserPanel.ts | 1042 行 | **已删除** | -1042 行 |
| GitHubPanel.tsx | 1351 行 | 554 行 | -797 行 |
| communicateSlice | 712 行 | 109 行 | -603 行 |
| 桥接语义一致性问题 | 11 处 | 0 | — |
| **合计** | | | **~-3200 行** |

## 关键经验

### 1. 组件提取的安全原则

- **优先提取纯 props 驱动、无 store 依赖的子组件**。GitHubPanel 中提取的 8 个组件全是纯 props 组件：HelpView 只依赖 `copy` prop，StatusDot 只依赖 `conclusion`/`status` props。
- **从内部逐步往外提取**：先提取无依赖的工具函数和纯展示组件，再提取轻 UI 组件，最后处理主组件的 import 变更
- **每次提取后立即运行 typecheck**，确保不引入新错误

### 2. Store 切片拆分的策略

- **按业务领域拆分**而非按使用频率。browserSlice 拆为 Tabs/Bookmark/History/Folders/Landing 5 片，每片 77~202 行
- **保留核心切片的 re-export**使消费者无需修改 import 路径
- **缩减后的切片只保留跨领域逻辑**：如 `hydrateBrowserDefaults`（跨 5 个子切片的初始化）和 `browserNavigateActiveTab`（同时操作 tabs + history）

### 3. Hook 彻底拆散的注意点

- `useBrowserPanel` 返回一个 `{ browserState, browserActions }` 大对象，拆散后消费者需要逐个导入独立 Hook，是最具破坏性的变更——必须一次完成
- **拆分前先确保上游切片拆分已完成**（C1 必须先于 C2），否则 import 路径会同时变化
- **browserpanel.tsx 反而增加了约 250 行**，因为从 1 个 Hook 调用变成了 4 个独立 Hook + 保留的部分局部状态。这是可接受的——组件文件理应包含渲染逻辑，而拆散的 Hook 改善了可测试性和可维护性

### 4. 跨字段 Action 的归属判断

`browserNavigateActiveTab` 同时操作 `browserTabs`（更新当前标签页 URL）和 `browserHistory`（添加历史记录），很难归属到单一子切片。最终保留在核心 `browserSlice.ts` 中，通过 `get()` 访问其他切片的值。

### 5. 桥接层参数修复的陷阱

- `IpcResult` 和 `IpcErrorCode` 的导入方式不同：`IpcResult` 是 `type` 可用 `import type`，`IpcErrorCode` 是 `enum` 需运行时导入
- `WorkspaceFileChangedEvent` 作为独立类型存在于 `@ai-digital-life/kernel` 包中，需要在 preview-bridge 中单独添加 import
- 最小修复原则：每处仅改 1~2 行，不改变实际行为，只修复类型签名

### 6. 跨工作包依赖管理

| 工作包 | 依赖 | 说明 |
|--------|------|------|
| A: 桥接层 | 无 | 可独立并行 |
| B1: communicateSlice | 无 | 可并行 |
| B2: GitHubPanel | 无 | 可并行 |
| C1: browserSlice | 无 | 可并行 |
| C2: useBrowserPanel 拆散 | 依赖 C1 | C1 完成后才可执行 |

C1→C2 的依赖确保 import 路径不产生冲突：C2 创建的新 Hook 直接引用 C1 的新切片名，避免迁移两次。

### 7. 质量门禁的时序

每完成一个工作包后运行 `typecheck` + `pnpm test` + `cargo clippy`，比一次性修改所有文件后再修复效率更高。本轮 4 路并行执行后，typecheck 仅出现 2 个新错误（import 缺失），10 分钟内完成修复。

## 推荐策略

| 类型 | 策略 |
|------|------|
| 小型组件提取（<150 行/组件） | 一次性全部提取 |
| 大型组件提取（>150 行/组件） | 按依赖强度排序，逐步提取 |
| Store 切片拆分 | 按业务领域一次性拆完，保留 re-export |
| Hook 拆散 | 先完成上游 Store 拆分，再一次性拆完 |
| Bridge 修复 | 全量 grep 后一次修复 |

# UI Store 迁移与代码重构经验总结

> 日期: 2026-06-07 | 来源: 第三十六轮重构

## 概述

本次重构完成了 Zustand 状态管理的统一，消除了 `ui-store.ts` 和 `uiSlice.ts` 的重复状态管理问题，同时对 Rust 代码进行了大函数拆分。

## 解决的问题

### 1. 状态管理重复

**问题描述**：
- 存在两套状态管理体系（`ui-store.ts` 和 `uiSlice.ts`）
- 导致维护困难、潜在的不一致、组件使用时混淆
- `useUiStore` 被标记为 deprecated 但仍在 10 个组件中使用

**解决方案**：
- 将 `ui-store.ts` 中的所有状态和操作方法迁移到 `uiSlice.ts`
- 扩展 `UISlice` 接口，添加文件树展开、导航器模式、上下文芯片等状态
- 保持 localStorage 兼容的持久化逻辑
- 删除废弃的 `ui-store.ts` 和 `ui-store.test.ts`

### 2. 大型函数违反单一职责

**问题描述**：
- `maybe_execute_approved_command` 函数过大（约 127 行）
- `decide_approval_inner` 函数过大（约 56 行）
- 违反单一职责原则，可测试性差

**解决方案**：
- 拆分为多个单职责函数：
  - `deserialize_command` - 反序列化命令请求
  - `load_workspace_for_task` - 为任务加载工作区
  - `update_task_to_running` - 更新任务状态为运行中
  - `save_command_result` - 保存命令执行结果
- 添加详细的中文文档注释

### 3. 代码重复

**问题描述**：
- `emit_run_activity_start_event` 和 `emit_run_activity_done_event` 存在大量重复代码

**解决方案**：
- 提取公共逻辑到 `emit_command_activity_event` 辅助函数
- 保持原有功能完全不变

### 4. 性能问题

**问题描述**：
- `ChangesPanel.tsx` 中存在 8 个独立的 `useUiStore` 调用
- 任何 UI 状态变化都会触发多次重渲染检查

**解决方案**：
- 合并为单个 `useShallow` 选择器
- 减少不必要的 React 重渲染

## 关键经验

### 渐进式迁移策略

```
1. 扩展 uiSlice.ts → 添加缺失的状态和方法
2. 更新组件 → 逐步替换 useUiStore 为 useAppStore
3. 测试验证 → 运行类型检查和功能测试
4. 删除旧文件 → 确认无任何引用后删除
```

**好处**：
- 每一步都可以独立验证
- 出现问题容易定位
- 风险可控

### 性能优化原则

**合并选择器**：
```tsx
// ❌ 多个独立选择器
const a = useAppStore((s) => s.fieldA);
const b = useAppStore((s) => s.fieldB);
const c = useAppStore((s) => s.fieldC);

// ✅ 单个 useShallow 选择器
const { a, b, c } = useAppStore(useShallow((s) => ({
  fieldA: s.fieldA,
  fieldB: s.fieldB,
  fieldC: s.fieldC,
})));
```

### 测试驱动重构

在重构前确保有完整的测试覆盖：
- 98 个 Rust 测试
- 214 个前端测试
- TypeScript 类型检查
- ESLint 检查
- Clippy 检查

### 双向验证

- **静态验证**：TypeScript 类型检查、ESLint、Clippy
- **动态验证**：运行测试套件、构建应用、启动应用检查功能

## 变更文件清单

### 前端（11 个文件）

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `uiSlice.ts` | 修改 | 扩展状态和方法 |
| `browserSlice.ts` | 修改 | 添加通用导航栏控制方法 |
| `types.ts` | 修改 | 添加类型定义 |
| `LeftSidebar.tsx` | 修改 | 使用 useAppStore |
| `ChangesPanel.tsx` | 修改 | 合并选择器 |
| `TitleBar.tsx` | 修改 | 使用 useAppStore |
| `CenterPane.tsx` | 修改 | 使用 useAppStore |
| `FilesPanel.tsx` | 修改 | 使用 useAppStore |
| `FileNavigatorShell.tsx` | 修改 | 使用 useAppStore |
| `EditorSurfaceShell.tsx` | 修改 | 使用 useAppStore |
| `SettingsPanel.tsx` | 修改 | 使用 useAppStore |
| `useRightPanelViewProps.ts` | 修改 | 使用 useAppStore |
| `useRightPanelLayout.ts` | 修改 | 更新导入路径 |
| `ui-store.ts` | 删除 | 已废弃 |
| `ui-store.test.ts` | 删除 | 已废弃 |

### Rust（2 个文件）

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `task.rs` | 修改 | 拆分大函数，提取公共逻辑 |

## 测试结果

| 测试项 | 结果 |
|--------|------|
| Rust 测试 | ✅ 98/98 通过 |
| 前端测试 | ✅ 214/214 通过 |
| TypeScript 类型检查 | ✅ 0 errors |
| ESLint | ✅ 0 errors, 0 warnings |
| Clippy | ✅ 0 warnings |
| 构建 | ✅ 成功 |

## 经验教训

### ✅ 做对的事情

1. **渐进式迁移**：每一步都独立验证，降低风险
2. **完整测试覆盖**：重构前确保有完整测试，重构后立即验证
3. **性能优化**：趁迁移机会合并多个选择器，提升性能
4. **文档更新**：及时更新重构进度报告和知识沉淀

### ❌ 需要改进的地方

1. **缺少组件级性能测试**：没有量化重渲染次数的变化
2. **缺少对比数据**：重构前后性能对比数据缺失
3. **文档分散**：经验分散在多个文件中，缺乏集中索引

### 🎯 后续行动项

1. 添加 React DevTools 集成测试，量化重渲染改善
2. 建立性能基准数据，每次重构前后对比
3. 创建统一的经验教训索引文档

## 相关文档

- [REFACTORING_PROGRESS_REPORT.md](../重构洞察/REFACTORING_PROGRESS_REPORT.md) - 重构进度报告
- [refactor-insight-2026-06-07.md](../重构洞察/refactor-insight-2026-06-07.md) - 重构洞察报告
- [zustand-patterns.md](../../.trae/rules/zustand-patterns.md) - Zustand 状态管理模式

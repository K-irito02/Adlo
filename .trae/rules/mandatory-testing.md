---
description: Mandatory comprehensive red-green testing after any UI/UX or functional change
alwaysApply: true
---

# 强制红绿测试规则

## 核心原则

**任何 UI/UX 或功能变更完成后，必须执行全方位红绿测试，不得跳过。**

"红绿测试"定义：先确认测试存在且可能失败（红），再确认实现后测试通过（绿）。

## 适用范围

以下变更类型**必须**执行红绿测试：

| 变更类型 | 示例 |
|----------|------|
| 新增 UI 组件 | 添加 Tooltip、Modal、Dropdown 等 |
| 修改现有组件 | 变更 props、状态逻辑、事件处理 |
| CSS 样式变更 | 主题变量、动画、布局调整 |
| React Hook 变更 | 新增/修改自定义 Hook |
| 组件迁移 | 原生 → 自定义组件、API 重构 |
| 功能逻辑变更 | 业务逻辑、数据处理、状态管理 |
| 依赖升级 | 主要依赖版本变更 |

## 必须执行的测试步骤

| 顺序 | 步骤 | 命令 | 通过标准 |
|------|------|------|----------|
| 1 | 类型检查 | `npm run typecheck -w @ai-digital-life/desktop` | 零错误 |
| 2 | 全量单元测试 | `npx vitest run` | 所有测试通过 |
| 3 | 受影响组件专项测试 | `npx vitest run tests/unit/components/` | 所有测试通过 |
| 4 | 受影响包专项测试 | `npx vitest run tests/unit/<package>/` | 所有测试通过 |

## 测试覆盖要求

### 新增组件必须覆盖

- [ ] 基础渲染（默认状态、空状态）
- [ ] 交互行为（hover/click/focus/keyboard）
- [ ] 主题适配（light/dark 切换）
- [ ] 可访问性（role、aria 属性、键盘导航）
- [ ] 边界情况（极端值、快速操作、卸载清理）

### 修改组件必须覆盖

- [ ] 修改的功能点有对应测试
- [ ] 原有功能未被破坏（回归测试）
- [ ] 新增的 props/状态有测试

## 禁止行为

| 禁止 | 原因 |
|------|------|
| ❌ 跳过测试直接标记任务完成 | 无法验证变更正确性 |
| ❌ 只运行部分测试忽略失败 | 掩盖潜在问题 |
| ❌ 类型检查有错误仍继续 | 类型安全是第一道防线 |
| ❌ 测试失败后不修复直接提交 | 破坏主分支稳定性 |
| ❌ 降低测试覆盖率要求 | 债务累积 |

## 测试失败处理流程

1. **记录失败**：在 todo 列表中标记测试失败
2. **分析原因**：区分实现错误 vs 测试用例过时
3. **修复问题**：优先修复实现，其次调整测试
4. **重新验证**：执行完整测试流程确认修复
5. **标记完成**：所有测试通过后才可标记任务完成

## 随项目演进

- 测试框架变更：更新命令表格
- 新增测试类型（如 E2E）：更新步骤表格
- 覆盖率要求变更：更新覆盖要求清单

## 相关文件

- [quality-gates.md](/E:/Programs/Obsidian/notes/.trae/rules/quality-gates.md)
- [design-system.md](/E:/Programs/Obsidian/notes/.trae/rules/design-system.md)
- [desktop-ui-verification.md](/E:/Programs/Obsidian/notes/.trae/rules/desktop-ui-verification.md)
- [ai-digital-life/vitest.config.ts](/E:/Programs/Obsidian/notes/ai-digital-life/vitest.config.ts)

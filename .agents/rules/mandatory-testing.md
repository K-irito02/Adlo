---
description: Mandatory comprehensive red-green testing after any UI/UX or functional change
alwaysApply: true
---

# 强制红绿测试

## TDD 要求（新增功能）

新增功能必须:
1. 先写失败测试
2. 实现最小代码使测试通过
3. 重构优化

重构（无行为变更）可跳过步骤 1-2。

## 核心原则

任何 UI/UX 或功能变更完成后，必须执行红绿测试，不得跳过。

## 适用范围

| 变更类型 | 示例 |
|----------|------|
| 新增 UI 组件 | Tooltip、Modal、Dropdown |
| 修改现有组件 | props、状态、事件处理 |
| CSS 样式变更 | 主题变量、动画、布局 |
| Hook 变更 | 新增/修改自定义 Hook |
| 组件迁移 | API 重构 |

## 必须执行的测试

| 步骤 | 命令 |
|------|------|
| 0. 前端 Lint | `pnpm --dir frontend run lint` |
| 1. 前端格式检查 | `pnpm --dir frontend run format:check` |
| 2. Rust 格式检查 | `cargo fmt --all -- --check` |
| 3. Rust Lint | `cargo clippy --workspace --all-targets -- -D warnings` |
| 4. Rust 测试 | `cargo test --workspace` |
| 5. 前端类型检查 | `pnpm --dir frontend run typecheck` |
| 6. 前端测试 | `pnpm --dir frontend run test` |

## 测试范围

| 变更类型 | 最低测试要求 |
|----------|-------------|
| 新增功能 | 单元测试覆盖核心逻辑 |
| Bug 修复 | 回归测试（重现原始 bug） |
| 重构（无行为变更） | 所有现有测试通过 + typecheck |
| Hook 提取 | 测试原有消费组件行为不变 |

## 禁止行为

- 跳过测试直接提交
- 只运行部分测试忽略失败
- 类型检查有错误仍继续

## 测试失败处理

1. 记录失败
2. 分析原因（实现错误 vs 测试过时）
3. 修复问题
4. 重新验证
5. 所有测试通过后才可标记完成

## 相关文件

- [quality-gates.md](./quality-gates.md)
- [design-system.md](./design-system.md)

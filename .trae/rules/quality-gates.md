---
description: Tests, typecheck, migration, and pre-merge quality gates
globs: ai-digital-life/tests/**,ai-digital-life/frontend/**,ai-digital-life/crates/**,ai-digital-life/src-tauri/**
alwaysApply: false
---

# 质量门禁

## 合并前必检项

| 检查项 | 命令 | 执行目录 |
|--------|------|----------|
| Rust 格式检查 | `cargo fmt --all -- --check` | `ai-digital-life/` |
| Rust lint | `cargo clippy --workspace --all-targets -- -D warnings` | `ai-digital-life/` |
| Rust 检查 | `cargo check --workspace` | `ai-digital-life/` |
| Rust 测试 | `cargo test --workspace` | `ai-digital-life/` |
| 前端类型检查 | `npm --prefix frontend run typecheck` | `ai-digital-life/` |
| 前端测试 | `npm --prefix frontend test` | `ai-digital-life/` |

## 高风险改动必检项

以下改动类型**必须**附带相关测试：

| 改动类型 | 必须覆盖的测试 |
|----------|----------------|
| Tauri Command / capability | Rust 单测或 `tests/integration/` + 文档同步 |
| 存储迁移 | `cargo test --workspace` 中迁移/存储相关测试 |
| `kernel` 契约 | 相关 Rust 单测 + `frontend/src/shared/ipc.ts` 对齐 |
| 前端 UI 组件 | `npm --prefix frontend test` + 视觉验证 |
| 主题 / i18n / 状态桥接 | 前端测试 + 启动烟测说明 |

## UI/功能变更红绿测试规则

**任何 UI/UX 或功能变更完成后，必须执行全量红绿测试，不得跳过。**

### 必须执行的测试

| 步骤 | 命令 | 说明 |
|------|------|------|
| 1. Rust 测试 | `cargo test --workspace` | 确保后端与基础设施回归 |
| 2. 前端类型检查 | `npm --prefix frontend run typecheck` | 确保零类型错误 |
| 3. 前端测试 | `npm --prefix frontend test` | 确保 UI 与交互测试通过 |

### 适用范围

- 新增 UI 组件
- 修改现有组件的 props、状态或行为
- CSS 样式变更（尤其是主题相关）
- Hook 逻辑变更
- 组件迁移（如原生 → 自定义组件）

### 禁止行为

- ❌ 跳过测试直接提交
- ❌ 只运行部分测试忽略失败
- ❌ 类型检查有错误仍标记任务完成

## SQLite / Storage 规则

- Schema 变更：**必须**带迁移脚本
- 禁止仅改运行时字符串而不改版本与迁移注册
- 迁移脚本位置：`crates/migration/`

## 桌面集成测试

- Tauri Command、恢复、持久化与工作区链路：`tests/integration/`
- 桥接 API 变更时同步 mock：`frontend/src/mock-bridge.ts`

## 测试目录结构

```
tests/
├── integration/    # Rust 集成测试
└── e2e/            # WebDriver / tauri-driver
```

## 随项目演进

- 测试命令变更：更新合并前必检项表格
- 新增高风险改动类型：更新高风险改动必检项表格
- 测试目录结构调整：更新测试目录结构图

## 相关文件

- [ai-digital-life/frontend/package.json](/E:/Programs/Obsidian/notes/ai-digital-life/frontend/package.json)
- [ai-digital-life/package.json](/E:/Programs/Obsidian/notes/ai-digital-life/package.json)

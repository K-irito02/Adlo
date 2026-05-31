---
description: Tests, typecheck, migration, and pre-merge quality gates
globs: ai-digital-life/tests/**,ai-digital-life/frontend/**,ai-digital-life/crates/**,ai-digital-life/src-tauri/**
alwaysApply: false
---

# 质量门禁

## 合并前必检

| 检查项 | 命令 |
|--------|------|
| Rust 格式 | `cargo fmt --all -- --check` |
| Rust lint | `cargo clippy --workspace --all-targets -- -D warnings` |
| Rust 检查 | `cargo check --workspace` |
| Rust 测试 | `cargo test --workspace` |
| 前端类型 | `npm --prefix frontend run typecheck` |
| 前端测试 | `npm --prefix frontend test` |
| Rust Clippy | `cargo clippy -- -D warnings` |
| 重构验证 | `npm --prefix frontend run typecheck` + `npm --prefix frontend test` + `cargo check --workspace` + `cargo test --workspace` |
| **双端一致性验证** | **分别在 Tauri 桌面和浏览器模式下验证功能一致** |

## 双端一致性验证

所有 UI/UX 或功能变更后，必须在两种模式下验证一致性：

| 验证项 | 验证方式 |
|--------|----------|
| 窗口控制按钮 | 两种模式均显示（Tauri 可实际操作，浏览器无操作效果） |
| 标题栏拖拽 | Tauri 模式可拖拽，浏览器模式无拖拽效果 |
| 拖拽打开工作区 | Tauri 模式和浏览器模式都支持拖拽文件夹打开 |
| 文件树/变更面板 | 两种模式下功能一致（使用 `npm run dev:both` 同时验证） |
| 主题/语言切换 | 两种模式下切换正常 |
| 所有其他功能 | 两种模式下行为一致 |

## 高风险改动

| 改动类型 | 必须覆盖 |
|----------|----------|
| Tauri Command / capability | Rust 单测或集成测试 + 文档同步 |
| 存储迁移 | 迁移/存储相关测试 |
| `kernel` 契约 | Rust 单测 + IPC 对齐 |
| UI 组件 | 前端测试 + 视觉验证 |

## SQLite 规则

- Schema 变更必须带迁移脚本
- 迁移脚本位置：`crates/migration/`

## 重构门禁

重构后必须执行:
- [ ] 前端类型检查: `npm --prefix frontend run typecheck`
- [ ] 前端测试: `npm --prefix frontend test`（183 tests 全通过）
- [ ] Rust 编译: `cargo check --workspace`
- [ ] Rust 测试: `cargo test --workspace`（105 tests 全通过）
- [ ] 行为回归: 确认关键用户路径无退化

## 相关文件

- [mandatory-testing.md](./mandatory-testing.md)
- [tauri-shell.md](./tauri-shell.md)

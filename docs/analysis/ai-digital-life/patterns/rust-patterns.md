# Rust 后端编码模式（索引）

> **体裁变更**：本文件原为实现快照，现已精简为索引。规范性约束以 `.agents/rules/` 为准。
> 源码路径：`ai-digital-life/crates/` + `ai-digital-life/src-tauri/`

## 阅读地图

| 想了解 | 去哪里 |
|--------|--------|
| Rust 性能模式、Crate 治理、数据库规范 | `.agents/rules/rust-patterns.md` |
| Tauri Command / capability 边界、安全基线 | `.agents/rules/tauri-shell.md` |
| Tauri Command `{domain}_{action}` 命名 | `.agents/rules/rust-command-domain-action-naming.md` |
| crate `adl-` 前缀命名 | `.agents/rules/rust-crate-adl-prefix-convention.md` |
| crate lib 桶导出 | `.agents/rules/rust-crate-lib-barrel-export-pattern.md` |
| use 三段式排序 | `.agents/rules/rust-use-statement-ordering-convention.md` |
| 内联 `#[cfg(test)]` 组织 | `.agents/rules/rust-inline-cfg-test-pattern.md` |
| serde 双注解约定 | `.agents/rules/serde-default-rename-all-convention.md` |
| Rust→TS 类型生成与桶导入 | `.agents/rules/ts-rs-type-generation-barrel-import.md` |
| 包/目录职责总表 | `docs/analysis/ai-digital-life/03-package-index.md` |

## 实现备注（快照摘录，细节以源码为准）

- 依赖方向：`kernel`（零依赖底层）← `errors`/`adl-logging`/`storage` ← 领域服务层 ← AI 层 ← Tauri 壳；低层绝不依赖高层。
- 错误：统一 `AppError`（`crates/errors/`），禁止 `Result<_, String>`；关键错误 `tracing::error!/warn!`。
- Command：`src-tauri/src/commands/`，返回 `Result<T, AppError>`，经 `capabilities/*.json` 白名单暴露（禁 `"all"`/`"**"`）。
- 数据：`rusqlite` 参数绑定（禁字符串拼接 SQL），`WAL` 模式，阻塞 IO 包 `spawn_blocking`；schema 变更附迁移脚本。
- 日志：`tracing`（`crates/adl-logging/`）；凭据经 `crates/credential/`（禁落配置/日志）。

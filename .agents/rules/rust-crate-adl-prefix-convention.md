---
description: Rust 内部 crate 统一使用 adl- 前缀命名
globs: ai-digital-life/crates/*/Cargo.toml,ai-digital-life/src-tauri/Cargo.toml
alwaysApply: false
---

# Rust Crate `adl-` 命名前缀约定

所有内部 Rust crate 使用 `adl-` 前缀（项目代号 "AI Digital Life" 缩写），确保与外部 crate 在 Cargo.toml 中的明确区分。

## 规则

- crate 名 = `adl-` + 短横线分隔的领域名
- 目录名与 Cargo.toml 中的 crate 名允许不同
- 在 `Cargo.toml` 的 `[dependencies]` 中全部使用 `adl-{name}` 引用
- 在 Rust 代码中使用 `use adl_{name}::...`（下划线形式）引用

## 正确示例

```toml
# crates/storage/Cargo.toml
name = "adl-storage"
```

```toml
# src-tauri/Cargo.toml
[dependencies]
adl-storage = { path = "../crates/storage" }
adl-errors = { path = "../crates/errors" }
```

```rust
use adl_storage::EntityTable;
use adl_errors::AppError;
```

## 错误示例

```toml
name = "storage"  # 缺少 adl- 前缀
name = "adl_storage"  # 应使用短横线而非下划线
```

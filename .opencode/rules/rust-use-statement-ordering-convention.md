---
description: Rust use statement three-section ordering convention — std → external crates → adl_* internal crates, separated by blank lines
globs: adlo/crates/**/*.rs,adlo/src-tauri/**/*.rs
alwaysApply: false
---

## Rust use 语句三段式排序约定

### 规则描述

Rust 源文件中的 `use` 语句必须按三段式排序，每组之间用空行分隔：
1. **标准库**：`std::` 开头的导入
2. **外部 crate**：第三方依赖（tokio、serde、sha2 等）
3. **内部 crate**：`adl_*` 前缀的项目内部 crate 与 `crate::` 本地模块引用

> **工具行为说明**：项目 `rustfmt.toml` 设 `reorder_imports = true`，`cargo fmt` 会在**组内**排序，并把 `crate::`/`self::`/`super::` 排在 `adl_*` 之前（对 `adl_errors` 前置的人工排序会打回）。因此第三组内实际顺序为 `crate::` 在前、`adl_*` 在后；手工调整需与 `cargo fmt --check` 保持一致，否则会被还原。

### 正确示例

```rust
// ✅ 正确：三段式排序，空行分隔
use std::path::Path;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use adl_errors::AppError;
use adl_types::IpcResult;
```

### 错误示例

```rust
// ❌ 错误：混排，无分组
use adl_errors::AppError;
use std::path::Path;
use serde::Serialize;

// ❌ 错误：内部 crate 放在外部 crate 之前
use adl_errors::AppError;
use tokio::process::Command;
use std::path::Path;
```

### 适用场景

所有 `crates/` 和 `src-tauri/src/` 目录下的 Rust 源文件。三段式分组（std / 外部 / 内部）需人工维护；组内顺序由 `cargo fmt` 的 `reorder_imports` 决定（见上），以 `cargo fmt --check` 通过为准。
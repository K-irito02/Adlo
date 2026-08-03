---
description: Rust use statement three-section ordering convention — std → external crates → adl_* internal crates, separated by blank lines
globs: ai-digital-life/crates/**/*.rs,ai-digital-life/src-tauri/**/*.rs
alwaysApply: false
---

## Rust use 语句三段式排序约定

### 规则描述

Rust 源文件中的 `use` 语句必须按三段式排序，每组之间用空行分隔：
1. **标准库**：`std::` 开头的导入
2. **外部 crate**：第三方依赖（tokio、serde、sha2 等）
3. **内部 crate**：`adl_*` 前缀的项目内部 crate

`crate::` 本地模块引用（如有）放在第三组之后。

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

所有 `crates/` 和 `src-tauri/src/` 目录下的 Rust 源文件。`rustfmt` 不强制 use 排序，需人工维护此约定。
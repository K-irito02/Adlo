---
description: Rust crate lib.rs public API barrel export pattern — module declarations followed by centralized pub use re-exports
globs: adlo/crates/*/src/lib.rs
alwaysApply: false
---

## Rust crate lib.rs 公共 API 桶导出模式

### 规则描述

所有 Rust crate 的 `lib.rs` 必须遵循"模块声明 + 公共 API 桶导出"两层结构：
1. 先声明所有模块（`pub mod` 为公开模块，`mod` 为私有模块）
2. 再通过 `pub use` 从各模块重导出公共 API 项

外部消费者统一从 crate root 导入，不直接引用内部模块路径。

### 正确示例

```rust
// ✅ 正确：模块声明后集中 pub use
pub mod browser_pool;
pub mod browser_webview;
mod browser_events;

pub use browser_pool::BrowserPool;
pub use browser_webview::{BrowserManager, webview_label};
```

### 错误示例

```rust
// ❌ 错误：pub mod 但不 pub use，消费方需写完整路径
pub mod browser_pool;
// 消费方被迫 use adl_browser::browser_pool::BrowserPool;

// ❌ 错误：pub use 散落在模块声明之间
pub use browser_pool::BrowserPool;
pub mod browser_webview;
pub use browser_webview::BrowserManager;
```

### 适用场景

所有 `crates/` 目录下的 Rust crate 的 `lib.rs` 文件。新增 crate 时必须遵循此模式。
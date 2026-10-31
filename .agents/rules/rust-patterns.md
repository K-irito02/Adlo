---
description: Rust backend performance, architecture patterns, and crate governance
globs: ai-digital-life/crates/**,ai-digital-life/src-tauri/**
alwaysApply: false
---

# Rust 模式规范

## 编译期缓存
- 任何被多次调用的 `Regex::new()` 必须使用 `LazyLock<Regex>` 缓存（MSRV 1.85+，优先于 `OnceLock`）
- 字符串到枚举映射必须使用 `static HashMap`（`LazyLock<HashMap>`）而非多次 `match` 或 `if/else` 链
- SQL 预构建：热路径查询必须预构建 SQL 字符串，禁止在函数体内使用 `format!()` 拼接

## 数据库
- 必须使用 `r2d2` 连接池（`Pool<SqliteConnectionManager>`），禁止 `Arc<Mutex<Connection>>`
- 连接池最大连接数建议 8（可配置）
- `open()` 中用一条独立连接执行一次 `PRAGMA journal_mode=WAL;`（切库需排他锁）；连接池 `with_init` 只设连接级 pragma（`busy_timeout`、`foreign_keys=ON`），禁止逐连接切 journal_mode（新建库并行 checkout 会 `database is locked`）
- 新增持久化实体类型必须使用 `EntityTable` 宏（`define_entity_table!`），禁止手动维护 `TABLE_NAMES` 数组

## Crate 治理
- 依赖方向：kernel → errors/events → config/fs-ops/storage → business → agent-runtime。禁止反向依赖。
- 单一 crate 超过 3 个独立关注点时，评估拆分（参考 workspace crate 拆出 outline）
- 两个 crate 均 <200 行且仅被同一消费者引用时，评估合并（参考 context-engine + prompt-engine → adl-context）
- Rust 源文件超过 ~500 行时评估按领域拆分
- kernel 类型保留 `pub use types::*` 向后兼容，同时提供 `pub mod domain { ... }` 分组路径

## 编译与类型安全
- `pnpm run cargo:check` 和 `pnpm run cargo:test` 必须在任何 crate 结构变更后执行
- 编译期断言优于运行时检查（参考 `type _StoreTypeCheck` 模式）
- 第三方 crate 版本升级需在 workspace 级别统一管理

## 禁止项
- 在热路径函数中使用 `format!()` 构建 SQL 或正则
- 在 `Arc<Mutex<...>>` 包裹的闭包中执行 I/O 操作超过锁持有时间 1ms
- 新增 `pub type` 或 `pub fn` 无文档说明其所属领域和消费方
- 在函数签名中接受 `String` 参数，但内部仅用于格式化/拼接而不需要所有权——应使用 `&str`
- 在函数调用点对已拥有的变量进行 `.clone()` 传递，而接收方仅需引用——应修改被调用方签名为引用

## Mutex 与错误处理
- **禁止 `Mutex::lock().unwrap()` 在生产代码中**：会因 poisoned mutex panic 整个进程
  - 优先使用 `if let Ok(mut guard) = mutex.lock() { ... } else { tracing::warn!("..."); }` 优雅恢复
  - 恢复 poisoned mutex：`mutex.lock().unwrap_or_else(|e| e.into_inner())`（取出内部数据继续操作）
- **禁止 `Result::unwrap_or_default()` 静默吞错误**：错误不可见，难以排查
  - 改为 `match` + `tracing::warn!` 记录错误后再返回默认值
- **`expect()` 仅用于"不变量"断言**：仅当逻辑保证 `Option/Result` 必然为 `Some/Ok` 时使用，且必须包含上下文消息
  - 例：`guard.as_mut().expect("file state must be Some after needs_reopen check")`
  - 错误用法：`expect("lock failed")` — 应改用 poisoned mutex 恢复

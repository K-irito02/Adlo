---
description: Rust backend performance, architecture patterns, and crate governance
alwaysApply: false
---

# Rust 模式规范

## 编译期缓存
- 任何被多次调用的 `Regex::new()` 必须使用 `OnceLock<Regex>` 缓存
- 字符串到枚举映射必须使用 `static HashMap`（`OnceLock<HashMap>`）而非多次 `match` 或 `if/else` 链
- SQL 预构建：热路径查询必须预构建 SQL 字符串，禁止在函数体内使用 `format!()` 拼接

## 数据库
- 必须使用 `r2d2` 连接池（`Pool<SqliteConnectionManager>`），禁止 `Arc<Mutex<Connection>>`
- 连接池最大连接数建议 8（可配置）
- `open()` 中必须执行 `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`
- 新增持久化实体类型必须使用 `EntityTable` 宏（`define_entity_table!`），禁止手动维护 `TABLE_NAMES` 数组

## Crate 治理
- 依赖方向：kernel → errors/events → config/fs-ops/storage → business → agent-runtime。禁止反向依赖。
- 单一 crate 超过 3 个独立关注点时，评估拆分（参考 workspace crate 拆出 outline）
- 两个 crate 均 <200 行且仅被同一消费者引用时，评估合并（参考 context-engine + prompt-engine → adl-context）
- Rust 源文件超过 ~500 行时评估按领域拆分
- kernel 类型导出保留 `pub use types::*` 向后兼容，同时提供 `pub mod domain { ... }` 分组路径

## 编译与类型安全
- `cargo check --workspace` 和 `cargo test --workspace` 必须在任何 crate 结构变更后执行
- 编译期断言优于运行时检查（参考 `type _StoreTypeCheck` 模式）
- 第三方 crate 版本升级需在 workspace 级别统一管理

## 禁止项
- 在热路径函数中使用 `format!()` 构建 SQL 或正则
- 在 `Arc<Mutex<...>>` 包裹的闭包中执行 I/O 操作超过锁持有时间 1ms
- 新增 `pub type` 或 `pub fn` 无文档说明其所属领域和消费方

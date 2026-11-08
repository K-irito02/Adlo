---
description: Rust workspace 集中配置（workspace.package/lints/dependencies）+ 成员 crate 零声明继承 + clippy.toml 统一阈值
globs: adlo/Cargo.toml,adlo/crates/**/Cargo.toml,adlo/clippy.toml,adlo/.cargo/config.toml
alwaysApply: false
---

# Rust Cargo workspace 集中配置与 lint 继承

## 规则描述

Rust 实现工作区采用**单一根配置、成员零声明**模式：

1. **根 `adlo/Cargo.toml`** 集中定义：
   - `[workspace.package]`：`edition = "2024"`、`rust-version = "1.85"`、统一 `version`/`license`；
   - `[workspace.lints.rust]` / `[workspace.lints.clippy]`：`unwrap_used` / `dbg_macro` / `todo` 全部 `warn`；
   - `[workspace.dependencies]`：所有第三方依赖的版本与 features 只在此声明一次（附带注释说明，如 reqwest 保持 socks/gzip 的原因）；
   - `[profile.dev.package."*"] debug = 1 + opt-level = 1`（第三方依赖），自有 crate 白名单 `debug = 2`（`.cargo/config.toml`）。
2. **每个成员 crate**（`crates/*/Cargo.toml`）只写继承指令，禁止自行声明版本号或 lint：
   - `version.workspace = true`、`edition.workspace = true`
   - `[lints] workspace = true`
   - `anyhow.workspace = true`、`serde.workspace = true` 等
3. **`clippy.toml`** 统一复杂度阈值与命名黑名单（`foo/bar/baz/qux`），并用 `allow-unwrap-in-tests = true` 系列允许测试代码 relax。
4. 工具链钉死 `rust-toolchain.toml`（channel + clippy + rustfmt）。

## 正确示例

```toml
# crates/errors/Cargo.toml —— 整个文件只有继承，没有版本号
[package]
name = "adl-errors"
version.workspace = true
edition.workspace = true

[lints]
workspace = true

[dependencies]
thiserror.workspace = true
serde.workspace = true
```

```toml
# Cargo.toml（根）新增依赖时的唯一姿势
[workspace.dependencies]
regex = "1"
```

## 错误示例

```toml
# ❌ 成员 crate 私自声明版本——版本漂移、两个 crate 编译出两份 serde
[dependencies]
serde = { version = "1.0.0", features = ["derive"] }
```

```toml
# ❌ 成员 crate 遗漏 [lints] workspace = true——该 crate 静默失去 unwrap_used 门禁
```

## 适用场景

- 新增 `crates/xxx` crate 时：先加入根 `members` 数组，再复制继承模板（`[lints] workspace = true` 是最易漏项）；
- 新增/升级第三方依赖时：只改根 `[workspace.dependencies]`，成员写 `.workspace = true`；
- 新增自有 crate 时：同步把 crate 名加入 `.cargo/config.toml` 的 `debug = 2` 白名单；
- 性能/磁盘问题排查：先确认第三方依赖未被误提升到 `debug = 2`（disk 暴涨主因）。

## 相关文件

- `adlo/Cargo.toml`（`[workspace.package]` / `[workspace.lints.*]` / `[workspace.dependencies]`）
- `adlo/clippy.toml`（`cognitive-complexity-threshold = 25`、`disallowed-names`、`allow-*-in-tests`）
- `adlo/.cargo/config.toml`（`[profile.dev.package."*"] debug = 1` 与自有 crate 白名单 `debug = 2`）
- `adlo/rust-toolchain.toml`

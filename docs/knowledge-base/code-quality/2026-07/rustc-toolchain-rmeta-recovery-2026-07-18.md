# Rust 工具链升级后 `core` 库缺失 `.rmeta` 的恢复

## 问题

`cargo check` 报错串：
```
only metadata stub found for rlib dependency core please provide path to the corresponding .rmeta file
cannot resolve a prelude import
requires `meta_sized` lang_item
```

原因是 `rustup update` 中途失败（`core` 的 `.rmeta` 文件被删除但未重新下载）。

## 诊断

检查 sysroot 中 `core` 的文件列表：

```powershell
Get-ChildItem "$env:USERPROFILE\.rustup\toolchains\stable-x86_64-pc-windows-msvc\lib\rustlib\x86_64-pc-windows-msvc\lib\libcore*"
```

正常应同时有 `.rlib`（~2.3 MB）和 `.rmeta`（~64 MB）。缺失 `.rmeta` 时仅 `.rlib` 存在。

## 修复

```powershell
rustup toolchain remove stable-x86_64-pc-windows-msvc
rustup toolchain install stable-x86_64-pc-windows-msvc
```

重新安装后从 1.96.0 升级到 1.97.1。

## 教训

- `rustup update` 失败时，不要直接重试；先用 `rustup toolchain remove` 完全卸载再重新安装
- 对于 `cannot find Some` 这类 prelude 错误，不要去改代码——这是工具链问题
- 工具链更新后必须重新安装 `clippy` 和 `rustfmt`（`rustup component add`）

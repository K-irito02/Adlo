# `cargo build` 报 externalBin 缺失：裸 cargo 不触发 sidecar staging

- 日期：2026-10-31
- 影响面：`adlo/` 下任何会编译 `src-tauri` 的裸 cargo 命令

## 症状

```
error: failed to run custom build command for `adlo`
  resource path `binaries\adl-server-x86_64-pc-windows-msvc.exe` doesn't exist
```

## 根因链

1. `src-tauri/tauri.conf.json` 的 `bundle.externalBin: ["binaries/adl-server"]` 由 tauri-build
   在 **build script 阶段**校验，文件缺失即构建脚本失败。
2. 该文件只由 `scripts/build-stage-sidecar.ps1` 生成（内部调用 copy 脚本落盘），
   `src-tauri/binaries/` 被 gitignore，每个工作树独立。
3. 只有以下入口会自动执行它：`tauri dev` / `tauri build` 的钩子、`pnpm run stage:sidecar`
   （`e2e:build` 经它）、pre-push 的 `check-rust-changed.mjs`（含壳层改动时）。
   **裸 `cargo build` / `cargo check --workspace` 不触发任何钩子。**
4. 历史上 `package.json` 只给 `cargo:check` / `cargo:clippy` / `cargo:test` 加了 staging 前缀，
   缺 `cargo:build`；而 `.agents/rules/commands.md` 把裸 `cargo build --workspace` 当常规命令列出，
   照着文档做必然踩坑。

## 处置

- 首次/干净工作树：`pnpm run stage:sidecar`，之后裸 cargo 命令即可用。
- 日常：用 `pnpm run cargo:build` / `cargo:check` / `cargo:clippy` / `cargo:test`（均内置 staging）。
- release 打包用 `pnpm run build`（`cargo tauri build`），不是 `cargo:build`。

## 防复发

- `package.json` 增加 `cargo:build`（与其它三个同构）。
- `commands.md` / `quality-gates.md` / `mandatory-testing.md` / `rust-patterns.md` / `CONTRIBUTING.md`
  统一改为 `pnpm run cargo:*` 或显式标注 staging 前置。
- pre-push 的 `shouldStageSidecar(files)` 按受影响 crate 判断是否需要 staging
  （不要从 clippy argv 反推：`--exclude adlo` 的值也会被 `includes` 命中）。

## 相关

- [tauri-frontend-dist-dev-bootstrap-2026-10-30.md](./tauri-frontend-dist-dev-bootstrap-2026-10-30.md) — 同一类「tauri-build 编译期资源校验」问题（`frontend/dist`）

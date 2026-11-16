# Contributing

## Scope Discipline

- 先确认变更属于当前范围（见 `AGENTS.md` 与 `.agents/rules/phase-boundary.md`）
- 若变更扩大权限边界、Tauri Command 暴露面或持久化真相源，必须先补文档再改代码

## Required Checks

提交前至少完成：

### Rust 端

- `cargo fmt --all -- --check`
- `pnpm run cargo:clippy`
- `pnpm run cargo:check`
- `pnpm run cargo:test`

> 以上 `cargo:*` 脚本会先 `stage:sidecar`。若直接跑裸 `cargo clippy/check/test --workspace`，
> 干净工作树需先 `pnpm run stage:sidecar`（见下方「Windows Rust Toolchain Notes」）。

### 前端

- `pnpm --dir frontend run lint`
- `pnpm --dir frontend run format:check`
- `pnpm --dir frontend run typecheck`
- `pnpm --dir frontend run typecheck:dev`
- `pnpm --dir frontend run check:i18n`
- `pnpm --dir frontend run test`

涉及 Tauri 启动链路、SQLite、恢复流程或后台 `tokio::spawn` 任务变更时，补一条 `cargo tauri dev` 启动烟测说明。

## Windows Rust Toolchain Notes

- Windows 开发默认使用 `stable-x86_64-pc-windows-msvc`。
- 若 `rustup`/`cargo` 在 Windows 上出现半安装或组件回滚，优先在当前终端跳过代理或清理代理环境变量后再重试，不要求关闭本地代理软件本身。
- 国内网络建议在当前终端临时设置 Rust 镜像，再执行安装：

```powershell
Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:ALL_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:NO_PROXY -ErrorAction SilentlyContinue
$env:RUSTUP_DIST_SERVER="https://rsproxy.cn"
$env:RUSTUP_UPDATE_ROOT="https://rsproxy.cn/rustup"
rustup set profile minimal
rustup toolchain install stable-x86_64-pc-windows-msvc
rustup default stable-x86_64-pc-windows-msvc
rustup target add x86_64-pc-windows-msvc
```

- `minimal` profile 足够支撑 `cargo check` / `cargo test --workspace`；`rustfmt` 与 `clippy` 可在工具链恢复后单独安装。
- `vcvars64.bat` / `VsDevCmd.bat` 报错本身不构成失败结论；以 `cargo test --workspace`、`cargo check --workspace` 的实际结果为准。
- 若需要额外确认 MSVC 编译器可见性，再检查 `where cl` 与 `where link`。
- 首次检出（或 `src-tauri/binaries/` 为空）时先运行 `pnpm run stage:sidecar`，再执行任何触及 src-tauri 的 `cargo tauri dev` / `cargo test` / `cargo clippy`；`pnpm dev:tauri`、`pnpm run cargo:*` 与 `pnpm run e2e:build` 已内置该步骤，可直接运行。原因是 `bundle.externalBin` 由 tauri-build 构建脚本在每次构建时校验，缺失即直接失败。该命令每次都执行对应 profile 的 `cargo build`（cargo 增量编译使重复执行成本很低），内部用 `-C target-feature=+crt-static` 构建 sidecar 再拷贝到 `src-tauri/binaries/`——sidecar 在 tauri-build 之外编译，不加此参数就会动态依赖 `VCRUNTIME140.dll`，无法在未装 VC++ 运行库的机器上启动。

## Must-Sync Docs

以下变更必须同步 `docs/architecture/*` 和必要的规划文档：

- 技术栈变化（Cargo 依赖、Tauri 插件、前端依赖）
- 桌面 E2E 脚手架或版本变化（`e2e/`、`e2e` feature、`@wdio/*` 与 `tauri-plugin-wdio*`）
- Tauri 安全基线变化（CSP / capability / plugin scope）
- SQLite schema、迁移或恢复策略变化
- Workspace / Retrieval 责任边界变化
- UI 主题、国际化、状态真相源变化

## 双端一致性原则

所有功能必须在 **Tauri 桌面应用**和**浏览器开发模式**（通过 `preview-bridge/` + adl-server 真实后端）下保持一致：

1. 新增 Tauri Command 时，必须同步实现：
   - `tauri-bridge.ts`（Tauri 模式）
   - `preview-bridge/`（浏览器模式，http 优先经 adl-server 真实后端，可回退）
   - `mock-bridge.ts`（纯内存回退）

2. 新增 UI/UX 变更后，必须使用 `pnpm run dev:both` 同时验证两种模式的一致性

3. 条件渲染仅允许以下平台差异：
   - 窗口控制按钮（仅 Tauri 显示）
   - 标题栏拖拽（仅 Tauri 可用）
   - 窗口图标同步（仅 Tauri）
   - 目录选择器（Tauri 原生，浏览器通过 Preview API）

4. 所有其他功能必须双端行为一致

## Change Summary Template

提交说明至少覆盖：

- 变更内容
- 为什么改
- 验证方式（cargo / vitest / tauri dev 烟测 / 桌面 E2E `pnpm run e2e`）
- 文档同步
- 残余风险

## Tauri Command 新增清单

新增 `#[tauri::command]` 时必须：

1. 在 `crates/kernel` 定义请求/响应类型（`#[derive(Serialize, Deserialize)]`）。
2. 在 `src-tauri/src/commands/<domain>.rs` 实现，返回 `Result<T, AppError>`。
3. 在 `src-tauri/src/main.rs` 的 `invoke_handler` 注册。
4. 在 `src-tauri/permissions/digital-life.toml` 的 `commands.allow` 登记该命令（`src-tauri/capabilities/default.json` 通过 `digital-life-commands` 权限集合引用；`src-tauri/src/main.rs` 的 `every_registered_command_is_allowlisted` 测试做机器校验，漏登记会在 `cargo test` 失败）。
5. 在前端增加类型化调用：在 `src/shared/ipc.ts` 保持 `DigitalLifeBridge` 与后端一致；同时同步 `tauri-bridge.ts` 与浏览器开发态桥接（当前为 `preview-bridge.ts`，必要时再配合 `mock-bridge.ts`）并在入口统一挂载到 `window.digitalLife`。
6. 补充单测（命令逻辑层）+ 集成测试（穿过 Tauri 调用层）。

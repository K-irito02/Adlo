# Contributing

## Scope Discipline

- 先确认变更属于 `Phase 0` 还是后续阶段
- 不把模型路由、命令执行、补丁引擎、多智能体编排伪装成当前必需项
- 若变更扩大权限边界、Tauri Command 暴露面或持久化真相源，必须先补文档再改代码

## Required Checks

提交前至少完成：

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo check --workspace`
- `cargo test --workspace`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend test`

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

## Must-Sync Docs

以下变更必须同步 `docs/architecture/*` 和必要的规划文档：

- 技术栈变化（Cargo 依赖、Tauri 插件、前端依赖）
- Tauri 安全基线变化（CSP / capability / plugin scope）
- SQLite schema、迁移或恢复策略变化
- Workspace / Retrieval 责任边界变化
- UI 主题、国际化、状态真相源变化

## Change Summary Template

提交说明至少覆盖：

- 变更内容
- 为什么改
- 验证方式（cargo / vitest / tauri dev 烟测）
- 文档同步
- 残余风险

## Tauri Command 新增清单

新增 `#[tauri::command]` 时必须：

1. 在 `crates/kernel` 定义请求/响应类型（`#[derive(Serialize, Deserialize)]`）。
2. 在 `src-tauri/src/commands/<domain>.rs` 实现，返回 `Result<T, AppError>`。
3. 在 `src-tauri/src/main.rs` 的 `invoke_handler` 注册。
4. 在对应 `src-tauri/capabilities/*.json` 登记到允许调用该命令的窗口/上下文。
5. 在前端增加类型化调用：在 `src/shared/ipc.ts` 保持 `DigitalLifeBridge` 与后端一致；同时同步 `tauri-bridge.ts` 与浏览器开发态桥接（当前为 `preview-bridge.ts`，必要时再配合 `mock-bridge.ts`）并在入口统一挂载到 `window.digitalLife`。
6. 补充单测（命令逻辑层）+ 集成测试（穿过 Tauri 调用层）。

# OpenCode CLI 2.x 与 1.x 共用一套版本管理 UI

**状态**: 已接受（2026-11-02）

## 背景

OpenCode 1.x 发布在 npm `opencode-ai`（当前 latest 1.19.5）；2.x CLI 发布在另一个 npm 包
`@opencode/cli`（当前 latest 2.2.5），平台包为 `@opencode/cli-<platform>-<arch>[-baseline]`。
两者的版本目录入口相同（`bin/opencode.exe`），但包名与 tarball 文件名不同。应用原先只查询
`opencode-ai`，所以设置组只能看到 1.x，看不到 TUI 更新提示里的 2.0。

用户决定：**2.x CLI TUI 与 1.x 放在同一个「正式版本」列表里**，不拆第二个设置组；不管理桌面版。

## 决策

1. `spec.rs` 新增 `OPENCODE_V2`（`package = "@opencode/cli"`，平台前缀 `@opencode/cli`，
   marker 与 `OPENCODE` 相同），`HarnessSpec` 增加 `platform_prefix`。
2. `fetch_catalog_for_lines` / `get_version_status_for_lines` 合并 `opencode-ai` 与
   `@opencode/cli` 的 stable/prerelease；按 semver 降序去重，latest 取最高。OpenCode HTTP
   handler 使用这条合并线，卡片仍是一张「正式版本」列表。
3. 安装/重装/切换按**包线**选包：目标版本已安装时读 `installed/<version>/.adl-package`；
   首次安装的正式版按 major（`>= 2` → `@opencode/cli`，`1.x` → `opencode-ai`）；首次安装的
   major 0 版本（预发布与 0.x 稳定版）先查 `@opencode/cli`：200 → 2.x，404 → 1.x，
   探测失败（超时/5xx）上抛网络错误，不再静默退回 1.x。
   scoped 平台包的 tarball 文件名去掉 scope（`cli-windows-x64-<version>.tgz`）。
4. 托管数据库按包线隔离：`OPENCODE_DB=<...>/managed/v1|v2/opencode.db`，避免 2.x 迁移
   schema 后 1.x 打不开；2.x 额外隔离 `XDG_DATA_HOME` / `XDG_STATE_HOME`，并通过 PATH 中的
   `opencode` 包装脚本强制 `--standalone`，只运行自己的私人 server，不连接桌面版正在运行的
   background service。同时注入 `OPENCODE_DISABLE_AUTOUPDATE=1`，版本升级统一走应用设置，
   禁止 TUI 内 `/update` 原地替换二进制。
   - 脚本落点：`<harnesses>/opencode/managed/shim/`；Windows 同时写 `opencode.cmd`（cmd /
     PowerShell）与无扩展名 `opencode`（Git Bash 不解析 `.cmd`），unix 只写 `opencode`。
   - 已在 Windows 实测：把 shim 目录前置到 Windows 形式 PATH 后，Git Bash 的
     `command -v opencode` 命中无扩展名 shim 并执行 `--standalone`；用户显式输入
     `opencode.exe` 仍会绕过 shim（直接运行二进制，属预期）。
   - 脚本通过 `%~dp0` / `$(dirname "$0")` 相对定位版本目录，不嵌入绝对数据根：cmd.exe 按
     控制台代码页读取 `.cmd`，数据根含 CJK 时会乱码。
   - 切回 1.x 或关闭注入后 shim 文件仍留在磁盘（不再进入 PATH），下次切到 2.x 时覆盖。
5. 浏览器 mock 合并两个 packument，保证浏览器预览与 Tauri 看到同一份版本列表。

## 影响

- 2.x 与 1.x 的会话数据库分开；跨 major 切换不会迁移历史（这是有意的隔离）。
- 2.0 的插件/Server API 变更由 CLI 自身承担；本应用只负责安装、选择、启动与隔离数据。
- 不接入、不修改 OpenCode Desktop 的安装或数据。

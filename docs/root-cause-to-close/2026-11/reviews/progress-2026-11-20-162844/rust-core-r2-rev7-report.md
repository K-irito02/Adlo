# rust-core — R2 定向复核报告（rev7）

## 范围

- 工作树（仓库根）：`E:\AI-DIGITAL-LIFE\SourceWorkspace-worktrees\slot-2`
- 只核对 `rust-core-r2-rev6-report.md` 的 4 项：F1（`read_binary_file` 删除 + 边界用例迁移）、F2（workspace/根 `base64` 依赖）、F4（server `tokio-util` `io` feature）、F3 反向复核（`Win32_Security` 是否为 `RegCreateKeyExW` 隐式依赖，注释是否准确）。
- 依据：rev7 快照 diff（`adlo_crates_fs-ops_src_lib.rs-rev7.diff`、`adlo_crates_workspace_Cargo.toml-rev7.diff`、`adlo_Cargo.toml-rev7.diff`、`adlo_src-tauri_Cargo.toml-rev7.diff`，并与 rev6 同名 diff 对照）+ 工作区当前源码 + 本地 registry 只读核对（`windows-0.61.3`）。未运行 `git diff/log/show`，未跑测试/构建/dev server（无端口、无后台进程），未改源码（只写本报告）。

## 上轮问题关闭情况

1. **F1 `read_binary_file` 死代码 — 已关闭**：函数本体已删除（rev7 diff `:140-` 删除块），全仓 `grep read_binary_file` 仅命中进度文档，`crates/workspace` 内亦无 `read_binary_file` / `read_media_file` / `base64` 残留。边界用例已迁移到 `read_text_file` 且断言有效（删除性推演）：
   - 超限：16 字节文本文件 + `max_bytes=8` → 断言 `InvalidInput`；删掉 `meta.len() > max_bytes` 与 `take(max+1)` 两道检查后返回 `Ok`，用例必红。
   - 目录：`sub` 目录 → 断言 `InvalidInput`；整个目录拒绝逻辑删除后在 Unix 上 `read_to_end` 会走 `Io`、断言仍红（现有「目录预检 + 句柄 `is_file`」是双层防御，只删预检在 Unix 不会红，但用户可见行为收敛仍被钉住）。
   - 空文件：断言 `content.is_empty()`，返回空串/报错都会改变断言结果（正向行为规格）。
   - symlink 逃逸：`cfg(unix)` 下断言 `Security`，走 `resolve_workspace_file` 的 canonicalize 界内校验；删掉该校验会读到界外内容而失败。
   - 缺失错误码：`missing_files_map_to_io_error_code` 只保留 `read_text_file` 的 `IO_ERROR` 断言（rev6 要求的 `bin_err` 已删），改为 `NotFound` 会红。
2. **F2 workspace / 根 `base64` — 已关闭**：`adlo/crates/workspace/Cargo.toml` 已删 `base64.workspace = true`（diff `:20-3`）；`adlo/Cargo.toml [workspace.dependencies]` 已删 `base64 = "0.22"`（diff `:12`）。全仓 `Cargo.toml` grep base64 只剩 `adlo/src-tauri/Cargo.toml:36` 的独立字面量（`commands/browser.rs`、`file_save.rs`、`download_commands.rs` 的真实消费者），无 `base64.workspace` 残留。
3. **F4 server `tokio-util` `io` — 已关闭**：`adlo/Cargo.toml:75` 改为 `features = ["rt", "io"]`（rev6 建议的第二种方案），`crates/server` 通过 `tokio-util.workspace = true` 显式获得 `io`；全仓仅 server 消费该依赖，`ReaderStream`（`handlers/workspace.rs:22`）不再依赖 reqwest `stream` 的 feature 合并。
4. **F3 `Win32_Security` 误报 — 已关闭（确认误报）**：`windows-0.61.3` 中 `RegCreateKeyExW` 签名为 `lpsecurityattributes: Option<*const super::super::Security::SECURITY_ATTRIBUTES>`（`System/Registry/mod.rs:84`），而 `Win32_System_Registry = ["Win32_System"]` 不拉入 `Win32_Security`（`Cargo.toml:650`、`:530`），`Security` 模块本身由 `#[cfg(feature = "Win32_Security")]` 门控（`Win32/mod.rs:23-24`）。即不启用该 feature，Registry 模块无法解析类型 → 编译失败，属真实隐式编译依赖。`app_identity.rs:87-97` 确实调用 `RegCreateKeyExW`；rev7 仅在该 feature 上方加了注释（与 rev6 diff 逐行对照：条目、顺序、其它 feature 全未变，无其它编译依赖被删）。注释「RegCreateKeyExW 的 SECURITY_ATTRIBUTES 参数来自 Win32::Security（隐式依赖，勿删）」与代码/upstream 事实一致，无绝对断言漂移。

## 新增发现

无。

## 记录不修

- symlink 逃逸用例仍为 `cfg(unix)`（迁移前即如此）：Windows 建符号链接需要提权/开发者模式，属既有取舍；Windows 侧静态逃逸由 `resolve_workspace_file` 的 canonicalize 结构性拦截，且 `read_text_file` 目录/句柄校验另有覆盖。
- 进度文件 `docs/root-cause-to-close/2026-11/progress-2026-11-20-162844.md:458` 仍把 `read_binary_file` + workspace `base64` 列在「记录不修」，与本轮已处置事实不符——`docs/**` 不在 R1/R2 范围，留 P5 由主代理同步（不计入需修复）。

## 结论

- 需修复项：0（本轮零问题）

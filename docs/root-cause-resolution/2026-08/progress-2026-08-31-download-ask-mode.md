# 进度 — 2026-08-31（下载"每次询问"模式无效）

## [x] 事项 1：下载"每次询问/自动保存"开关无效——ask 模式不弹保存对话框
- 状态：已完成（用户确认 2026-08-31，全部问题/任务解决完成）
- 位置：Tauri 桌面应用 → 右侧面板 → 浏览器面板 → 下载
- 现象：开关设为"每次询问(ask)"时仍表现为"自动保存(auto)"，不弹出系统资源管理器保存对话框
- 根因（已确认）：`DownloadMode` 只被存储/回显，从未被下载请求路径消费
  - `download_update_settings` 仅写入 `DownloadManager`（download_commands.rs）
  - `setup_download_handler`（download_handler.rs）与 `resolve_download_target`（download_manager.rs）从不读取 `mode`，一律解析到默认下载目录自动保存
  - 全仓库无任何保存对话框调用；`DownloadMode::Ask` 仅出现在序列化/存储/测试
- 修复方案：在 `setup_download_handler` 中当 `mode == Ask` 且非 silent 时，调用 `tauri_plugin_dialog` 的 `blocking_save_file()` 弹出原生保存对话框；用户取消则拒绝下载；选中则用所选路径作为目标
- 调试日志：下载请求入口（mode、suggested_path）、ask 分支（对话框弹出/取消/选中路径）、resolve 后路径、record 创建
- 验证：用户 Tauri 桌面实测 → 分析 debug 日志 / `.adl-logs/`

## 实施记录（2026-08-31）
- **已实现**：
  - `crates/browser/Cargo.toml`：新增 `tauri-plugin-dialog.workspace = true`
  - `crates/browser/src/download_manager.rs`：`derive_file_name` 改为 `pub(crate)`（供 ask 分支预填文件名）
  - `crates/browser/src/download_handler.rs`：
    - 引入 `DialogExt`、`derive_file_name`、`get_default_download_path`、`DownloadMode`
    - 入口日志追加 `mode` 字段
    - `final_path` 解析改为分支：`mode == Ask` 时用 `handle.dialog().file().set_file_name(...).set_directory(默认下载目录).blocking_save_file()` 弹原生保存对话框；取消 → 记日志 + `return false` 拒绝下载；选中 → `fp.into_path()` 得到目标路径；`mode == Auto` 时保持原 `resolve_download_target` 自动解析
  - **线程安全说明**：`blocking_save_file` 内部经 `send_user_message`，在 WebView2 回调线程（主线程）上会**内联执行**并在线程中运行 rfd 原生对话框，不会死锁（已核对 `tauri-runtime-wry-patched` 的 `send_user_message` 实现）
- **验证**：
  - `cargo check -p adl-browser` ✅
  - `cargo test -p adl-browser` ✅（98 通过 / 0 失败）
  - `cargo clippy -p adl-browser --all-targets -- -D warnings` ✅
  - `cargo fmt --all -- --check` ✅
  - `cargo check --workspace` ✅
- **待用户实测**：Tauri 桌面应用中设置"每次询问"，触发下载，确认弹出系统保存对话框；测试后提供日志（debug-logs.txt 或 `.adl-logs/`）供验证

## 日志分析（用户实测 .adl-logs，2026-08-31 03:04-03:20）
- **Ask 模式 ✅ 验证通过**（03:09:05 Qoder）：`ask mode: showing native save dialog` → `ask mode: user selected save path` → record 创建 → 下载完成（205,286,872 bytes）
- **Ask 取消 ✅**（03:20:49 ZCode）：对话框弹出 → `ask mode: save dialog cancelled, download denied` → handler 返回 false
- **Auto 模式 ✅**（03:11:26 CodeBuddy / 03:20:31 ZCode）：自动解析路径，正常下载
- **暂停/恢复 ✅**（03:20:34 ZCode）：`native WebView2 download PAUSED` → 伪 `finished(false)` 被正确忽略（`ignoring spurious finished(false) for a paused/canceled download`）
- **Silent webview 取消 ✅**（03:11:31）：预期行为，正常
- **⚠️ 发现 1 个警告**（03:20:55.552）：
  - `[ADL-DL] no download record found for finished URL url=...ZCode...`
  - 触发链：Ask 取消 → handler 返回 false（无 record 创建）→ WebView2 仍触发 DownloadStarting 捕获到死操作 → 仍触发 DownloadCompleted(success=false) → `handle_download_finished` 查无 record → WARN
  - 另有 `register_operation: captured native download operation`（03:20:55.529）记录了被拒下载的死操作句柄

## 修复 2（2026-08-31，基于日志分析）
- `crates/browser/src/download_handler.rs` `handle_download_finished` 无 record 分支：
  - 调用 `download_manager.remove_operation(url)` 清理被拒/取消下载留下的死操作句柄
  - `success=false`（取消/拒绝预期场景）降级为 DEBUG；`success=true`（异常丢失 record）保留 WARN
- 依据：record 一定在传输开始前创建，"无 record" 即无合法进行中下载，移除操作是安全的
- 配合已有保护：`register_operation` 不覆盖 IN_PROGRESS 操作（webview2_download.rs / download_manager.rs），故清理逻辑无副作用

## 修复 2 验证（2026-08-31）
- `cargo fmt --all` ✅（自动格式化修复 1 处长行换行）
- `cargo test -p adl-browser` ✅（通过 / 0 失败）
- `cargo clippy -p adl-browser --all-targets -- -D warnings` ✅（无警告）
- `cargo check -p adl-browser` ✅
- 修复 2 待用户重新构建后实测验证：Ask 模式取消保存对话框 → 不应再出现 `no download record found` WARN

## 备注
- 2026-08-31 用户确认：根因理解正确，直接修复，用原生系统保存对话框，并添加调试日志

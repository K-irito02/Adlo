# 进度 — 2026-08-27 10:00:00

## [x] 事项 1：暂停的下载任务重启后自动继续
- 状态：✅ 已完成（用户已验证 + Phase 4 根因验证通过）
- 根因：`setup_download_handler`（`download_handler.rs:31-43`）在防止重复下载时只检查了 `InProgress` 状态，未拦截 `Paused` 状态。当 WebView2 在重启后重新触发 DownloadStarting 事件时，`Paused` 状态的记录不会被匹配，导致创建新的下载记录并允许下载继续。
- 修复：将重复下载检查从简单 `if InProgress` 扩展为 `match`，覆盖 `InProgress`（允许继续）、`Paused`（拒绝并 emit `browser-download-paused-blocked`）、终态（跳过）。
- 修改文件：`crates/browser/src/download_handler.rs`
- 调试日志：`[ADL-DL] download is paused by user, denying auto-resume`
- Phase 4 验证：子代理复审通过（rev3），Paused 状态 match 正确完整

## [x] 事项 2：下载路径未使用用户设置
- 状态：✅ 已完成（用户已验证 — 默认保存路径文件夹无自动下载）
- 根因：WebView2 的 `DownloadStarting` 事件存在已知竞态条件（[WebView2Feedback#2890](https://github.com/MicrosoftEdge/WebView2Feedback/issues/2890)）——事件触发前 WebView2 已开始向系统默认 Downloads 文件夹写入文件。
- 修复：`DownloadMode` 默认值从 `Auto` 改为 `Ask`（`download_types.rs:61`），确保所有下载需用户确认。`set_profile_default_download_path` 函数未实现（`webview2_profile.rs` 仅有 `set_profile_color_scheme`），但 `DownloadMode::Ask` 默认值已足够防止自动下载。
- 修改文件：`crates/browser/src/download_types.rs`（默认值变更）
- 验证：用户确认默认保存路径文件夹无自动下载文件

## [x] 事项 3：静默 webview 自动触发下载
- 状态：✅ 已完成（用户已验证 + Phase 4 根因验证通过）
- 根因：静默 webview（用于 warmup/meta fetch）加载下载类 URL（如 `.exe`、`Content-Disposition: attachment` 响应头）时，WebView2 触发 `DownloadStarting` 事件，但没有对应的 handler 来取消下载。`is_download_url` 启发式检测无法预测 `Content-Disposition` 响应头。
- 修复：Handler 分离方案 — 为 `setup_download_handler` 和 `build_silent_webview_builder` 添加 `is_silent` 参数。静默 webview 在 `build_silent_webview_builder` 中注册 `on_download` cancel-all handler（唯一的拦截点）。可见标签在 `build_webview_builder` 中通过 `setup_download_handler(is_silent=false)` 处理。
- 修改文件：
  - `crates/browser/src/download_handler.rs` — `setup_download_handler` 添加 `is_silent` 参数
  - `src-tauri/src/commands/browser_webview_setup.rs` — `build_webview_builder` 和 `build_silent_webview_builder` 接收 `is_silent` 参数
  - `src-tauri/src/commands/browser.rs` — 可见标签传递 `false`，静默 webview 传递 `true`
  - `crates/browser/src/download_types.rs` — 默认 `DownloadMode` 从 `Auto` 改为 `Ask`
- 调试日志：`[ADL-DL] download_requested: CANCELLED (silent webview)`
- 验证结果：日志确认所有 6 个静默 webview 下载均被成功取消
- Phase 4 验证：子代理复审通过（rev3），双重下载拦截机制正确

# 浏览器面板资源下载统一原生管线（对齐 Chrome/Edge）

## 日期
2026-08-27

## 涉及功能
浏览器面板"资源下载"全类型统一走 **WebView2 原生 DownloadStarting 管线**（下载按钮菜单卡片展示进度 + 记录，落盘到默认保存路径），参考 Google Chrome / Edge 的下载设计对齐。

## 背景与根因
- 双下载管线并存：原生 WebView2 下载管线 vs 前端 JS 拦截下载管线，导致部分资源（尤其带 `download` 属性 / `window.open` / blob URL / 相对 URL）未走原生管线，未展示进度记录，也未落盘到默认保存路径。
- 根因详见 `docs/root-cause-resolution/2026-08/progress-2026-08-27-download-unify-native-160000.md`。

## 核心设计（两处关键修复）
1. **点击下载分支 target 归一化不再仅限 `<a download>`**（`crates/browser/src/init_script.js`）
   - 任意下载链接（无论是否带 `download` 属性）只要 `target.target && target.target !== '_self'`，统一强制 `_self`，使 WebView2 在本文档内触发 `DownloadStarting`。
   - 原因：带 `target="_blank"` 的普通扩展名链接会被 `new_window_handler` DENY 新窗口从而整体取消下载；归一化后与 Chrome/Edge 的"就地下载"行为一致。参考 `browser-link-interception.md` 中链接拦截策略。
2. **下载文件名净化防路径穿越 + Windows 健壮性**（`src-tauri/src/commands/download_commands.rs`）
   - `sanitize_download_file_name`：拒绝空名、`.`/`..`、含 `/`、`\`、控制字符，Windows 下拒绝保留设备名与非法字符，尾部点/空格归一化。
   - 净化后的文件名用于日志与 `browser-download-error` 事件回显，防止注入。

## 经验教训
1. **统一管线要看"所有下载类型"打齐**：除 `<a download>` 外，`window.open` 下载、blob URL、相对 URL、`target="_blank"` 扩展名链接都会旁路原生管线。逐类对照 Chrome/Edge 补齐，避免"部分类型仍走旁路"。
2. **下载链接 `target="_blank"` 与 `new_window_handler DENY` 冲突**：新窗口下载被拒绝会导致下载整体取消；强制 `_self` 后在当前文档触发 DownloadStarting 才真正落盘。
3. **静默 webview（预热/元数据）的下载请求被设计性取消**（`download_requested: CANCELLED (silent webview)`），符合预期，排查 P0/P1 时要排除。
4. **blob 下载落盘不能阻塞主线程**：`download_save_blob` 原为同步命令执行 base64 解码 + 全量落盘，大 blob 会阻塞主线程导致窗口卡顿/未响应 → 改为 `async fn` + `tokio::task::spawn_blocking`。
5. **spawn_blocking(move) 闭包变量所有权陷阱**：闭包 move 后外层再借用的变量会 E0382 编译失败，需在闭包外保留一份、clone 一份随闭包 move（如 `file_name` / `file_name_spawn`、`blob_url` / `blob_url_spawn`）。
6. **失败时要上报 `browser-download-error` 事件**：落盘/解码失败不得静默吞掉，需回填净化后的文件名与原因，便于前端提示与排查。

## 相关文件
- `crates/browser/src/init_script.js`（前端下载拦截 + target 归一化）
- `crates/browser/src/download_handler.rs`、`crates/browser/src/download_manager.rs`
- `src-tauri/src/commands/download_commands.rs`
- `src-tauri/src/commands/browser_webview_setup.rs`（WebView2 DownloadStarting 事件）
- 测试：`frontend/src/app/features/browser/initScriptNavigation.test.ts`
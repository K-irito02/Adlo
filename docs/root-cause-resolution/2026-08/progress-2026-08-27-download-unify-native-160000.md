# 进度 — 2026-08-27 (下载统一走原生管线)

## [x] 事项 1：部分资源下载未在"下载按钮菜单卡片"展示进度/记录，且未保存到默认路径
- 状态：✅ 已完成（用户实测轮次2确认成功——鸣潮/ZZZ/wallspic/wallhaven 全部走原生 on_download 落默认路径）
- 根因（编码级初步确认）：存在两套并行下载管线——
  1. 原生 WebView2 `DownloadStarting`（`browser_webview_setup.rs::build_webview_builder .on_download` → `setup_download_handler` → `DownloadManager`）：流式写盘到默认路径、`browser-download-started` 生成记录、文件大小轮询线程上报进度。正常。
  2. JS 拦截管线（`crates/browser/src/init_script.js`）：重写 `fetch`/`window.open`/`location.assign|replace`/表单，拦截下载 URL 走 `__adlDownloadUrl` → 整文件 fetch→arrayBuffer→base64→一次性 IPC `download_save_blob`。传输期间无任何进度；记录只在写入后端那一刻才创建（立即 finished）；大文件内存缓冲+超大 base64 IPC 易失败，失败仅 JS catch 打日志，后端不建记录 → 菜单无记录、未落默认路径。
- 修复（用户确认方向：统一走原生管线，对齐 Chrome/Edge）：让 http/https 下载交由 WebView2 原生 DownloadStarting 处理；移除/最小化 JS 拦截对合法 http/https 的劫持；blob: URL 视 WebView2 原生支持情况决定是否保留 JS 兜底。
- 修改文件：
  - `crates/browser/src/init_script.js`
  - `src-tauri/src/commands/download_commands.rs`（`download_save_blob` 加日志/失败事件）
  - `src-tauri/src/commands/browser_webview_setup.rs`（原生管线加日志）
  - `crates/browser/src/download_handler.rs`（各事件加日志）
- 调试日志：`[ADL-DL]`（Rust）/ `[ADL-DL-JS]`（init_script.js）
- 验证：
- 外部调研：WebView2 原生 `DownloadStarting`+`DownloadOperation` 支持实时 BytesReceivedChanged 进度与自定义 ResultFilePath（= Chrome/Edge 方案），确认"统一走原生管线"方向正确。

## [x] 事项 2（Phase 2A 实施）：init_script.js 统一 http/https 下载走原生管线
- 状态：✅ 已完成（用户实测轮次2确认成功）
- 步骤：
  1. ✅ `window.open` override：移除下载 URL 的 JS 拦截（`__adlDownloadUrl` fetch），fallthrough 到原生 `origOpen`（由 WebView2 DownloadStarting 接管）；仅记录日志
  2. ✅ `location.assign/replace` override：移除下载 URL 拦截，交原生导航→DownloadStarting；仅记录日志
  3. ✅ `form submit` override：移除下载 URL/hidden 字段拦截（preventDefault + fetch），交原生；仅记录日志
  4. ✅ `fetch` override：整体移除（Chrome/Edge 不对 XHR 的 attachment 响应自动落盘；该 override 整文件 clone+base64 最脆弱）
  5. ✅ blob:`<a download>`：保留 JS 兜底 `__adlDownloadUrl`→`download_save_blob`；`download_save_blob` 失败时 emit `browser-download-error` 使菜单可见失败；成功 emit started+finished
- 调试日志（用户实测后查日志）：
  - `[ADL-DL-JS] window.open: download URL -> native DownloadStarting ...`（init_script.js）
  - `[ADL-DL-JS] location.assign/replace: download URL -> native DownloadStarting ...`
  - `[ADL-DL-JS] form submit: action/hidden field download URL -> native ...`
  - `[ADL-DL-JS] click intercepted: blob download detected` → `__adlDownloadUrl` → `download_save_blob`
  - Rust：`[ADL-DL] on_download: Requested / handler decision`、`download record created`、`progress update emitted`、`download finished event received`、`browser-download-error`
- 验证：`cargo test -p adl-browser` 通过（79 passed）；`node --check init_script.js` 通过
- 待用户实测：下载含进度/记录 → 查看 `[ADL-DL]`（Rust）/ `[ADL-DL-JS]`（init_script.js）日志确认

## [x] 事项 3（实测轮次1）：Zzz 成功、鸣潮 `<a download>` 失败
- 状态：✅ 已完成（用户实测轮次2确认——鸣潮已成功）
- 日志证据（`terminal-logs.txt`）：成功 Zzz（21:31:03 `window.open` 非下载 URL → origOpen → new_window DENY → 但 WebView2 仍触发 `with_download_started_handler` → `on_download allowed=true` 建记录+进度 → success）；失败鸣潮（21:31:07 `<a download>` 点击 → JS `origOpen('_blank')` → `new_window_handler DENY（下载 URL 委托 on_download）` → **其后无 `with_download_started_handler`/`on_download: Requested`** → download 被 DENY 完全取消：无记录、无进度、无落盘）。
- 根因：点击处理器将 `<a download>` http(s) 链接路由到 `origOpen('_blank')` 打开新窗口；Rust `new_window_handler` 对下载 URL 返回 DENY 后，该 `.exe` 的 `DownloadStarting` 事件根本不触发。与 Chrome/Edge 不一致（Chrome 点击 `<a download>` 是浏览器原生就地下载，不经过新窗口）。
- 修复（`crates/browser/src/init_script.js` 点击处理器）：http(s) 下载链接（`<a download>` 或扩展名命中 isDownloadUrl）**不再拦截、不再转 origOpen**，直接 return 放行，让 WebView2 原生 `DownloadStarting` 触发；`<a download>` 若带 `target!="_self"`（= `_blank`）则强制 `target='_self'` 就地下载，避免命中 new_window DENY。仅 blob 保留 JS 兜底。
- 新调试日志（本轮验证用）：
  - `[ADL-DL-JS] click on download link - NOT intercepting (native DownloadStarting)`
  - `[ADL-DL-JS] <a download> forced in-place (target -> _self)`
  - 预期 Rust 侧应有：`with_download_started_handler ENTER` → `on_download: Requested allowed=true` → `starting progress monitor` → `on_download: Finished success=true`
- 验证：`cargo build` 通过（零警告）；`node --check` 通过
- 待用户实测：再次下载鸣潮同款 `<a download>` 资源，确认菜单有记录/进度、默认路径落盘，并核对上述新日志。
- ✅ 实测轮次2日志证据（成功）：鸣潮 21:47:15 `click on download link - NOT intercepting` → `on_download: Requested allowed=true` → `starting progress monitor` → 21:47:22 `on_download: Finished success=true path=E:\Test-Workspace-1\WutheringWaves_official_setup_2.6.5.0.exe`；ZZZ(21:47:20)、wallspic(21:48:24)、wallhaven(21:49:43) 均 success=true 落默认路径。无 ERROR/panic/失败。

## [x] 事项 0：预检（探索+确认方向）
- 状态：✅ 已完成（用户确认方向：统一走原生管线）
- 备注：预检探索了下载双管线；通过 `AskUserQuestion` 确认"统一走原生管线（推荐）"
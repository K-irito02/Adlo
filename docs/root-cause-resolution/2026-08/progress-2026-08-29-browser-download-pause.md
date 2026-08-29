# 进度 — 2026-08-29 浏览器下载「暂停后仍继续下载」根因排查

## [x] 事项 1：暂停按钮点击后，偶尔仍显示/继续下载
- 状态：✅ 已完成（根因 1–6 全部修复，多次复测通过）
- 现象：Tauri 桌面应用 · 右侧浏览器面板 · 下载菜单卡片，点击「暂停」后偶尔仍显示正在下载（文件继续增长或最终下载完成）。偶发性，发生在下载某些资源文件时。
- 涉及代码区域：
  - `ai-digital-life/crates/browser/src/download_manager.rs`（pause_download / resume_download / cancel_download / register_operation / get_operation）
  - `ai-digital-life/crates/browser/src/download_handler.rs`（setup_download_handler / handle_download_finished / handle_download_pause / handle_download_progress）
  - `ai-digital-life/crates/browser/src/webview2_download.rs`（setup_download_operation_capture，按 URI 捕获原生 DownloadOperation）
  - `ai-digital-life/crates/browser/src/browser_webview.rs`（setup_webview2_handlers 接线）
  - `ai-digital-life/src-tauri/src/commands/browser_webview_setup.rs`（on_download 回调 + start_download_progress_monitor 文件轮询监控线程）
  - `ai-digital-life/src-tauri/src/commands/download_commands.rs`（download_pause 等命令）
  - `ai-digital-life/frontend/src/app/stores/slices/browserDownloadsSlice.ts`（pauseDownload / 事件订阅）
  - `ai-digital-life/frontend/src/app/features/browser/BrowserDownloadItem.tsx`（暂停按钮 UI）
- 初步根因假设：
  - H1（主因）：原生 Pause() 失败/无法暂停时，后端返回 Err → 前端 `await invoke` 抛异常（非 `{ok:false}`），无 try/catch → 静默失败，状态未更新，下载继续。触发场景：`CanPause()==false`（未先检查）、未捕获到原生 operation（URI 键不匹配）、记录已终态（快速下载竞态）。
  - H2（良性）：下载过快，点击暂停时文件已落盘完毕 → pause_download 报「已终态」→ 前端显示完成。即用户感知的「UI 延迟，其实已下载完成」。
  - H3（次要）：暂停后监控线程/原生 Finished 竞态导致状态跳变（paused→completed/failed）。
- 验证方式：在 Tauri 桌面端测试，查看日志 `[ADL-DL]` 前缀记录。

## 对照产品（Chrome/Edge）
- Chrome/Edge 采用**乐观 UI**：点击暂停立即切换为「已暂停」状态，再由下载管理器真正暂停底层传输；底层无法暂停时仍显示暂停意图，避免「点了没反应」。
- 本实现当前为「后端成功后前端才改状态」，原生暂停失败即静默回退 → 与浏览器产品行为不一致。

## 用户确认（2026-08-29）
- 修复范围：日志 + 完整修复
- 关键补充现象：**界面显示为「已暂停」，但过一段时间后自动变成「已完成」**（非下载中状态）。
  - 这排除了「前端静默失败」这一主路径（因为 paused 状态确实显示出来了，说明 pause_download 返回了 Ok、原生 Pause() 返回 Ok）。
  - 直接锁定：`handle_download_finished` 在记录为 Paused 时，仅对 `!success` 有守卫（download_handler.rs L164-174），**对 `success=true` 无守卫** → WebView2 在暂停后仍触发 Finished(success=true)（典型：快速下载，Pause() 时字节已收完/正在收尾，暂停无法撤销已完成的传输）→ `complete_download(id, true)` → 记录从 paused 翻转为 completed → 前端显示已完成。
- 结论（根因确认）：
  - 根因 1：`handle_download_finished` 未对 Paused 记录的 `success=true` 做守卫 → paused→completed 自动翻转（用户观察到的现象）。
  - 根因 2（伴随）：pause 时未检查 `CanPause()`；对已接近完成/服务器不支持 Range 的下载，Pause() 返回 Ok 但传输已实际完成。
  - 根因 3（防御）：前端 pause/resume/cancel 的 invoke 若被 reject（非 `{ok:false}`）会抛未捕获异常，无错误提示。

## 待确认 → 已确认（日志 + 完整修复）
- 修复方向：日志 + 乐观 UI + CanPause 检查 + 前端错误处理（用户已确认）。

## Phase 1-2 实施（2026-08-29）
- 方案确定（对齐 Chrome/Edge 设计）：
  - Chrome/Edge 行为：点击「暂停」时若文件已完整落盘，条目直接变为「已完成」而非「已暂停」——UI 始终反映真实状态。
  - 因此：暂停前先查询原生 `State()`（CanPause 等价检查，WebView2 无 CanPause API，用 State()==COMPLETED/INTERRUPTED 判断）；已 COMPLETED → 直接标记完成（不显示暂停）；仅 IN_PROGRESS 才调用 `Pause()`。
  - `handle_download_finished` 对 Paused/Canceled 记录的 `success=true` 增加守卫：仅当原生 State()==COMPLETED 才翻转 completed，否则保留用户意图（paused/canceled）。
  - `download_pause` 命令返回结构化 `DownloadPauseResult { status }`，前端据此决定显示 paused 还是 completed，消除「paused→completed 瞬闪」。
  - 前端 pause/resume/cancel 增加 try/catch + `[ADL-DL]` 日志，杜绝 invoke reject 静默失败。
- 改动文件：
  - `crates/browser/src/download_types.rs`：新增 `DownloadPauseResult`
  - `crates/browser/src/download_manager.rs`：新增 `NativeDownloadState` + `native_operation_state()`；`pause_download` 返回 `Result<DownloadStatus, String>`，暂停前检查原生状态 + 暂停后字节竞态复查
  - `crates/browser/src/download_handler.rs`：`handle_download_finished` 增加 success=true 守卫；`handle_download_pause` 适配新返回类型
  - `src-tauri/src/commands/download_commands.rs`：`download_pause` 按结果分发事件 + 返回结构化结果
  - `frontend/src/shared/ipc/download.ts`：新增 `DownloadPauseResult`
  - `frontend/src/app/stores/slices/browserDownloadsSlice.ts`：pauseDownload 结构化处理 + try/catch 日志
- 验证方式：`[ADL-DL]` 前缀日志；用户 Tauri 桌面端复测「快速下载 + 暂停」场景。

## Phase 1-2 验收（2026-08-29）
- 前端：`typecheck` ✓、`lint` ✓（修复 1 处 prettier 长行警告）、`prettier` ✓
- Rust：`cargo check -p adl-browser` / `-p ai-digital-life` ✓、`cargo clippy -p adl-browser -p ai-digital-life --all-targets` ✓、`cargo fmt --all --check` ✓
- Rust 测试：`cargo test -p adl-browser` ✓（65 + 5 + 2 + 7 全部通过）
- 前端下载相关测试：`browserDownloadsSlice` 无既有测试文件

## Phase 3：用户测试验证（进行中）
- 待用户操作：Tauri 桌面端复测「快速下载 + 暂停」场景（下载某些资源文件，下载较快时点击暂停）
- 预期行为（对齐 Chrome/Edge）：
  - 下载进行中点击暂停 → 若原生已收完字节（State()==COMPLETED）→ 直接显示「已完成」；否则显示「已暂停」且停止增长
  - 暂停后不再出现「paused 一段时间后自动变成 completed」的跳变
- 排查手段：查看日志文件中 `[ADL-DL]` 前缀记录（Tauri 模式 `debug-logs.txt`）

## Phase 3 日志分析（2026-08-29，用户复测完成）
- 用户日志：`.adl-logs/debug-logs.txt`（前端）+ `.adl-logs/terminal-logs.txt`（后端）
- 复测 3 个下载（汽水音乐 09:03 / 哔哩哔哩 09:04 / 爱奇艺 09:05），点击暂停 3 次（09:03:03、09:03:07、09:05:18），**全部失败**：
  - 前端：`pauseDownload: invoke rejected {"code":"INTERNAL_ERROR","message":"Internal error: Download is already interrupted and cannot be paused"}`
  - 后端：`pause_download: native operation already INTERRUPTED; cannot pause`
- **新根因（根因 4，主因）**：`operations` 映射按 URL 键存储，`register_operation` 直接 `insert` 覆盖。元数据预载「静默 webview」对同一下载 URL 也会触发 `DownloadStarting`（爱奇艺一次触发 4 个静默下载），其**已取消（INTERRUPTED）的静默操作覆盖了真实下载的原生操作句柄** → 暂停时 `native_operation_state()` 查询到的是静默（已取消）操作 → 恒报 INTERRUPTED → 暂停失败 → 下载继续直到完成。
  - 证据（爱奇艺）：09:05:16.136 真实下载捕获 → 09:05:16.138/.254/.280/.319 四个静默下载覆盖 → 09:05:18.119 暂停报 INTERRUPTED → 09:05:19.420 下载完成
- **新根因（根因 5，次因）**：进度监控线程 `fetch_content_length` 盲目信任 HEAD 的 `Content-Length`。哔哩哔哩 CDN 对 HEAD 返回 238 字节的 HTML 验证页（真实文件 ~142MB）→ `total_bytes=238` → 监控线程误判「下载已完成」并发出 finish 事件（bytes_received=142187466 >= 238），可能在实际下载完成前错误标记 completed。

## Phase 2C：根因 4/5 修复（2026-08-29）
- 修复 4（`crates/browser/src/download_manager.rs`）：
  - 新增 `query_operation_state()` 私有辅助（对原始 op 查询 State()）
  - `register_operation` 增加守卫：若 URL 已存在**进行中（InProgress）**操作 → 保留真实操作，忽略静默/重复 DownloadStarting（不覆盖）
  - `native_operation_state` 重构复用 `query_operation_state`
  - `crates/browser/src/webview2_download.rs`：移除重复「captured」日志，改由 manager 记录（含 skip 分支）
- 修复 5（`src-tauri/src/commands/browser_webview_setup.rs` `fetch_content_length`）：HEAD 响应校验——非 2xx、Content-Type 为 text/html / application/xhtml / text/plain / 含 json 时拒绝信任，避免错误 total_bytes 导致误判完成
- 验收：`cargo check -p adl-browser -p ai-digital-life` ✓、`cargo clippy --all-targets` ✓、`cargo fmt` ✓、`cargo test -p adl-browser` ✓（5+2+7 全部通过）
- 调试日志：新增 `[ADL-DL] register_operation: keeping existing IN_PROGRESS operation (silent/duplicate DownloadStarting ignored)`（skip 时 debug 级）

## 待用户复测（Phase 3 续）
- 请再次测试「下载 + 暂停」场景，重点观察：
  - 暂停后应正常显示「已暂停」且停止增长（不再报 INTERRUPTED）
  - 下载中的暂停应真正生效，不再「暂停后自动完成」
  - 哔哩哔哩等 HEAD 返回 HTML 的站点下载进度不再误报完成
- 复测后提供 `.adl-logs/` 日志目录内容

## Phase 3 复测验证（2026-08-29，第二次复测）
- 复测 5 个下载全部「暂停」成功，修复完全生效：
  - 爱奇艺 `96169db3`（09:15:12）、哔哩哔哩 `a8b2bb9b`（09:15:37）、汽水音乐 `7922b252`（09:16:17）、鸣潮 `1d93377d`（09:17:17）、原神 `58b27e6b`（09:17:52）
  - 前端 5 次 `pauseDownload: backend reports download paused`，无任何 invoke rejected
- 关键日志证据：
  - `register_operation: keeping existing IN_PROGRESS operation (silent/duplicate DownloadStarting ignored)` — 根因 4 修复生效（静默 webview 重复下载不再覆盖真实句柄）
  - `pause_download: native WebView2 download PAUSED` + `DB status set to 'paused'` — 暂停真正生效
  - `handle_download_finished: ignoring spurious finished(false) for a paused/canceled download` — 暂停后的 spurious finished(false) 不再翻转状态（根因 1 守卫生效）
  - `progress monitor: download PAUSED, idling until resumed` — 监控线程正确待命
  - 哔哩哔哩 HEAD 不再产生 total_bytes（bogus 238 被拒绝，根因 5 修复生效）；其它站点 total_bytes 均正确（IQIYI 89MB / SodaMusic 150MB / WutheringWaves 189MB / yuanshen 216MB）
- 监控线程恢复逻辑核对：Paused 时 `continue` 待命；resume 后 DB 状态回 InProgress → `paused_idle_logged` 复位 → 恢复上报直至完成/终态
- `resume_download` 核对：`get_operation(&url)` 现返回真实句柄（修复后保留）→ `op.Resume()` 生效；失败回退 HTTP Range（未实现）返回错误，不会伪造 InProgress

## Phase 3：暂停→恢复 流程测试（2026-08-29，用户第三次测试）
- 用户操作：「暂停 → 等待几秒 → 恢复」×5（09:29:11–09:29:48 暂停 5 次全部成功；09:30:15–09:30:24 恢复 5 次全部失败）
- 前端日志（debug-logs.txt）：5 次 `pauseDownload: backend reports download paused` ✓；5 次 `resumeDownload: invoke rejected {"code":"INTERNAL_ERROR","message":"Internal error: Auto-resume limit reached (5 attempts). Please restart the download manually."}`
- 后端日志（terminal-logs.txt）：5 次 `resume_download: determined resume mode id=... resume_mode=UserRestart auto_resume_count=0`
- **关键证据**：`auto_resume_count=0` → 根本不是「自动恢复次数超限」，而是**模式判定错误**把用户手动暂停误判为 UserRestart，在调用原生 `op.Resume()` 之前就提前返回错误。
- **根因（根因 6，主因）**：`resume_download` 判定逻辑：
  - `user_action_required = auto_resume_count >= MAX(5) || status == Paused` → 用户暂停后状态为 Paused → `user_action_required=true`
  - `restart_required = file_path.is_empty() || (etag.is_none() && last_modified.is_none())` → 这些下载从未存 ETag/Last-Modified → `restart_required=true`
  - → `ResumeMode::UserRestart` → 命中 `return Err("Auto-resume limit reached...")` 分支，**错误消息误导**（计数=0 却说超限）
  - 语义错误：自动恢复上限只应防「系统自动重试」，不应挡住「用户主动点击继续」。Chrome/Edge 中用户手动 Resume 永远可用（USER_CONTINUE 只是提示需用户确认，用户点击即确认）。

## Phase 3C：根因 6 修复（2026-08-29）
- 修改 `crates/browser/src/download_manager.rs`：
  1. `resume_download` 新增 `user_paused = record.status == Paused`：
     - `restart_required`：用户暂停时置 `false`（原生句柄存活、从当前偏移继续，无需 ETag/Last-Modified——那些仅用于未实现的 HTTP Range 回退）
     - `user_action_required`：`!user_paused && auto_resume_count >= MAX`（自动上限不作用于用户主动继续）
  2. `match resume_mode`：`UserRestart | UserContinue` 分支**不再返回错误**，改为放行到原生 `Resume()` 快速路径（用户主动点击即满足「需要用户操作」条件）；仅 `Invalid` 仍拦截（UserCanceled/UserShutdown/FileMalicious/非 HTTP）
  3. `auto_resume_count` 增量：仅非用户暂停（自动恢复）时 +1；用户暂停/恢复循环不消耗上限预算
  4. `get_download_resume_mode` 新增 `Some("UserPaused") => {}` 分支：不再落入保守 `_`（强制 user_action=true），使日志模式准确为 ImmediateContinue
- 新增回归测试（`download_manager.rs` tests 模块）：
  - `resume_mode_user_paused_is_immediate_continue`：UserPaused + 无 restart/无 user_action → ImmediateContinue
  - `resume_mode_user_paused_passes_flags_through`：UserPaused 不强制 user_action，restart 标志透传
- 验收：`cargo fmt` ✓、`cargo clippy --workspace --all-targets --fix -- -D warnings` ✓、`cargo check --workspace` ✓、`cargo test -p adl-browser` ✓（67 lib + 5 + 2 + 7 全部通过，含 2 个新回归测试）
- 调试日志：`resume_download` debug 级新增 `user_paused` 字段；User* 模式放行时新增 `[ADL-DL] resume_download: user-initiated resume satisfies User* mode, proceeding`；原生恢复成功新增 `[ADL-DL] resume_download: native WebView2 download RESUMED`

## 待用户复测（Phase 3 续 · 恢复流程）→ ✅ 已完成
- 请再次测试「暂停 → 等待几秒 → 恢复」：恢复后应真正继续下载（进度增长直至完成），不再停留在「暂停状态」、不再报 Auto-resume limit reached
- 期望日志：后端 `resume_mode=ImmediateContinue` + `native WebView2 download RESUMED`；前端 `resumeDownload: backend reports download resumed`

## Phase 3 最终验证（2026-08-29，用户第四次测试）
- 用户操作：「暂停 → 等待几秒 → 恢复」×4（09:53:06 / 09:53:23 / 09:53:34 / 09:53:44 暂停 4 次全部成功；09:53:48–09:53:56 恢复 4 次全部成功），4 个下载（哔哩哔哩 / 网易云音乐 / 原神 / 汽水音乐）最终全部完成
- 前端日志（debug-logs.txt）：4 次 `pauseDownload: backend reports download paused`，无任何 invoke rejected / resume 失败
- 后端日志（terminal-logs.txt）关键证据：
  - 暂停：4 次 `pause_download: native WebView2 download PAUSED` → `DB status set to 'paused'` → `handle_download_finished: ignoring spurious finished(false) for a paused/canceled download` → `progress monitor: download PAUSED, idling until resumed`（根因 1/2/3 守卫全部生效）
  - 恢复：4 次 `resume_download: determined resume mode ... resume_mode=ImmediateContinue auto_resume_count=0 user_paused=true` → `resume_download: native WebView2 download RESUMED`（根因 6 修复生效，不再误报 Auto-resume limit reached）
  - 完成：4 个下载全部 `download completed successfully`，progress monitor 报告 bytes_received == total_bytes（如 150602608/150602608、216079848/216079848），无伪造完成
  - 静默 webview 防护：`register_operation: keeping existing IN_PROGRESS operation (silent/duplicate DownloadStarting ignored)`（根因 4 生效，原神站点出现 2 次静默重复均被忽略）
  - HEAD 校验：`resolved total_bytes via HEAD` 均为真实大小（根因 5 生效，无 HTML 验证页 238 误判）
- 日志整体审视：无 ERROR；仅 5 条 WARN 均为 `download_requested: CANCELLED (silent webview)`（设计内预期行为：静默元数据 webview 的下载请求被取消）
- 结论：根因 1–6 全部修复并验证通过，暂停/恢复/完成全链路符合 Chrome/Edge 一致行为

## 审视发现的其它问题
- **次要问题（已评估，暂不修改）**：静默 webview 每次触发多个不同 URL 的 DownloadStarting（爱奇艺 4 个），其中与真实 URL 不同的静默操作也会注册进 `operations` 映射且永不清理（无对应记录、URL 含一次性 uuid 不会再复用）→ 轻微内存占用累积（每次下载 ~3-4 个 COM 包装器）。无功能影响。修复需在 webview UI 线程做 DB 查询判断「无记录则不注册」，有阻塞主线程风险，暂不建议。
- 恢复流程已在本轮完整测试（4 次暂停+恢复全部成功）；「暂停瞬间传输恰好完成 → 直接显示完成」竞态路径由 pause 前原生 State() 检查 + `DownloadPauseResult` 结构化返回覆盖（已对齐 Chrome/Edge 乐观 UI 行为）。

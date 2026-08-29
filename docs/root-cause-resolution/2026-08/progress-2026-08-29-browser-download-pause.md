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

## 根因 7：进度监控线程误报「完成」导致下载文件消失（2026-08-29，汽水音乐缺失）
- 现象：用户测试 5 个下载，但默认保存路径 `E:\Test-Workspace-1` 下只看到 4 个文件；「汽水音乐（SodaMusic）」之前确实见过，后来自动消失了。
- 证据（`.adl-logs/terminal-logs.txt` + SQLite downloads 库）：
  - SodaMusic 记录 `6a1b87c6` 09:53:42 创建，09:53:44 暂停、09:53:56 恢复，09:54:00 监控线程报 `progress monitor: download complete, emitting finish event bytes_received=150602608 total_bytes=150602608`
  - 该下载**从未**出现 WRY `finished(success=true)` 事件（`with_download_completed_handler: ENTER` 无 success=true 记录）
  - 09:54:30 webview 销毁（`browser webview destroyed for tab`）
  - DB 中 5 个下载全部记录为 `completed` 且字节数一致，但 SodaMusic 文件不在磁盘上
- **根因（根因 7，主因）**：`start_download_progress_monitor` 的完成判定**只看文件大小是否 ≥ total_bytes**（`current_bytes >= total && total > 0`），未校验原生 WebView2 下载操作是否真正达到 `COMPLETED` 状态。暂停/恢复后引擎仍在收尾（或传输被中断、文件恰好在最后字节处中断），文件大小恰好匹配 total 时即被误判完成 → DB 标记 completed + 发出 finish 事件 → 监控线程 `break` 退出。此时原生操作实际**未完成**，webview 销毁时 WebView2 清理了未落定/未完成的文件 → 「DB 记录完成、文件消失」。
- 修复（`src-tauri/src/commands/browser_webview_setup.rs` 进度监控线程）：
  - 在「文件大小匹配 total」且未被 WRY 回调标记完成之后，增加原生状态校验：`native_operation_state(url)` 必须为 `Completed`（或 `Unknown` 回退到大小启发式，覆盖非 Windows/未捕获句柄的兜底）才标记完成
  - 原生状态为 `InProgress` → `continue` 等待下一轮（引擎收尾毫秒级，下一轮即 Completed 或由 WRY finished(true) 完成）；`Interrupted` → 继续等待，由 WRY finished(false) 标记失败，不再伪造完成
  - 复用 `download_manager.rs` 既有的 `NativeDownloadState` / `native_operation_state()`（与 `handle_download_finished` 的 success=true 守卫同一套校验逻辑）
- 验收：`cargo fmt` ✓、`cargo clippy --workspace --all-targets --fix -- -D warnings` ✓、`cargo check --workspace` ✓、`cargo test --workspace` ✓
- 待用户复测：Tauri 桌面端再测「多个下载（含暂停/恢复）」，确认 5 个下载文件全部留在保存路径下，且不再出现「DB 显示完成但文件消失」。

## Phase 4 复测（2026-08-29，用户第五次测试）→ 新根因 8
- 用户操作：5 个下载（腾讯视频 / 夸克网盘 / 芒果TV / 崩坏星穹铁道 / 汽水音乐），各「暂停→恢复」，部分暂停了 2 次。
- 复测发现两个新问题：
  1. **已下载完成（进度条满）的下载仍停留在「进行中」分区/状态**。
  2. **「已暂停」分区下某个下载（汽水音乐）点击「继续/恢复」无任何反应，一直停留暂停**。
- 日志证据（`.adl-logs/terminal-logs.txt`）：
  - 腾讯视频 `7bb8b14f` / 星穹铁道 `07377490` 经 WRY `finished(success=true)` 正常完成（`download completed successfully` + `status=completed`）；芒果TV/夸克仍在下载中。
  - 汽水音乐 `b3302986` 11:00:56.746 暂停成功（`native WebView2 download PAUSED`）；**11:00:57.075 静默 webview 对同一 URL 再次触发 DownloadStarting**（`download_requested: CANCELLED (silent webview)`）→ 11:00:57.076 `register_operation: captured native download operation`（**覆盖了真实的暂停操作**）。
  - 之后 6 次恢复（11:01:36 / 11:01:38 / 11:01:47 / 11:02:14 / 11:02:36 / 11:02:39）全部失败：`native Resume() failed ... 组或资源的状态不是执行请求操作的正确状态。 (0x8007139F)` → HTTP Range 回退未实现 → 汽水音乐永远停留在 paused。
- **根因（根因 8，两个问题的共同主因）**：`setup_download_operation_capture` 对**静默（silent 元数据）webview** 也注册了 DownloadStarting；静默 webview 触发下载后会被取消（dead operation）。因 `register_operation` 只保护 `InProgress` 操作，而**暂停中的操作原生 State()=INTERRUPTED**，守卫不通过 → 静默 dead 操作**覆盖**真实暂停操作。后果：
  - **恢复失效**：`Resume()` 调用到静默已取消操作 → `0x8007139F` 失败 ×6 → 停留暂停（问题 2）。
  - **完成卡死**：原生操作被换成 dead 句柄后恒报 INTERRUPTED；配合根因 7 的「标记完成前校验原生状态」，监控线程 `native_state=Interrupted(≠Completed/Unknown)` → `continue` 永不标记完成 → 已满文件停留在「进行中」（问题 1）。（若未加根因 7 校验，则相反地会伪造完成导致文件被清。）
- 修复（`is_silent` 贯穿）：
  - `crates/browser/src/webview2_download.rs`：`setup_download_operation_capture(core, manager, is_silent)`，`is_silent=true` 时直接跳过（静默 webview 的所有下载都会被取消，其操作句柄永远无用）。
  - `crates/browser/src/browser_webview.rs`：`setup_webview2_handlers` 增 `is_silent` 参数并透传（含非 windows 桩）。
  - `src-tauri/src/commands/browser_webview_setup.rs`：`setup_webview2_handlers_for_platform` 增 `is_silent` 透传。
  - `src-tauri/src/commands/browser.rs`：`attach_webview_child` 增 `is_silent`；可见 tab 传 `false`（`browser_create_for_tab`），静默走 `true`（`create_silent_webview`）。
  - 附加收益：修复了此前「审视发现的其它问题」中静默 webview 死操作永不清理的内存累积（静默不再注册任何操作）。
- 验收：`cargo fmt`、`cargo clippy --workspace --all-targets --fix -- -D warnings`、`cargo check --workspace`、`cargo test`（-p adl-browser 67+5+2+7 全部通过；-p ai-digital-life 70 通过）✓

## 死测试移除（2026-08-29）：`silent_meta_tests::partial_meta_pre_returns_even_when_channel_goes_silent`
- 现象：`cargo test --workspace` 长时间无输出，定位到 `commands::browser::silent_meta_tests::partial_meta_pre_returns_even_when_channel_goes_silent` **运行超过 60 秒仍未结束**（测试二进制自身无 60s 阈值，属挂死）。
- 根因（永久无法完成，非偶发）：
  - `poll_silent_meta`（`src-tauri/src/commands/browser.rs`）只有**单轮 recv 超时**、**无整体时限**；每轮超时走 `Err(idle)` 分支，该分支仅检查 `favicon_extended` 但**永不置位** → 无限空转。
  - `favicon_extended` 唯一置位点在「收到消息」分支（L463），且要求 `since_first >= partial_ms`；该测试只发一条消息（此时 `since_first≈0`，分支被跳过），此后 channel 保持打开（tx 未 drop）且静默 → 死循环。
- 为何生产不挂：外层 `fetch_silent_meta` 有 6s 总体超时兜底，测试直接调用内部函数绕过了该兜底。
- 处置：删除该死测试（保留注释说明），与本次下载修复无关（预先存在）。
- 验证：删除后 `cargo test -p ai-digital-life` **70 passed / 0 failed / finished in 3.04s**，无任何 "running for over" 卡死；workspace 其余 crate 全部通过。
- 待用户复测：Tauri 桌面端再测「下载→暂停→（等静默元数据 webview 触发后）→恢复」，确认：暂停的下载恢复后能继续并完成；完成的下载离开「进行中」分区；汽水音乐不再停留暂停。

## Phase 5 复测（2026-08-29，用户第六次测试）→ 新根因 9 + Chrome/Edge 一致方案
- 用户操作：5 个下载（腾讯视频 / 夸克网盘 / 芒果TV / 崩坏星穹铁道 / 汽水音乐）暂停→恢复。
- 复测新现象：
  1. **进度条已满的下载仍停留在「进行中」分区/状态**（DB `in_progress`、`bytes_received == total_bytes`、`completed_at=NULL`）。
  2. 这些下载的文件在保存路径下可见（运行中），但**关闭 Tauri 后文件自动消失**。
- 证据（`.adl-logs/terminal-logs.txt` + DB + 目录）：
  - 芒果/星穹/腾讯经 WRY `finished(success=true)` 正常完成，文件保留；夸克 `5bf1ffad` / 汽水 `7bc4624f` 恢复后 `RESUMED` 但**从未触发完成事件**，DB 卡在 `in_progress`，文件在关闭后从 `E:\Test-Workspace-1` 消失（实测目录只剩 3 个完成的文件）。
  - 与根因 8 相同判据：夸克/汽水**服务器不支持 Range（不可续传）**——原生 `Pause()` 虽返回 Ok 但传输未真正停止，操作被破坏后永远不报 Completed；应用关闭时 WebView2 环境销毁，删除「未 Completed 操作」的目标文件（`InterruptReason.UserShutdown`：关闭时中断的下载不支持恢复）。
- 调研结论（对齐 Chrome/Edge/Firefox 最佳实践）：
  - **Chrome/Edge 用 `.crdownload` 临时文件**：下载中写入 `文件名.crdownload`，仅成功完成时原子重命名（`rename()`）为最终名。最终名文件**永远不会半成品出现**，关闭时被清理的只是明确标记为未完成的临时文件。
  - **Firefox bug 410289**：明确"不允许暂停无法恢复的下载"（不要假装暂停）。
  - WebView2 官方：`DownloadOperation.CanResume`（判断中断能否恢复）、`InterruptReason.ServerNoRange`（服务器不支持 Range）。
- **根因（根因 9，与根因 7 同源深化）**：我们此前直接写最终路径 + 根因 7 的「必须原生 Completed 才标记完成」判定，导致不可续传下载被 Pause 破坏后：进度满但不标记完成（问题 1）、最终名文件在关闭时被 WebView2 删除（问题 2）。根因 7 的诊断（"文件大小达到 total 是误报"）实际是错误的——字节数与 Content-Length 一致即代表字节完整；真正的病灶是**操作生命周期被 Pause 破坏 + 直接写最终路径**。
- 修复（Chrome/Edge 一致设计，三层）：
  1. **`.crdownload` 临时文件方案**（`download_handler.rs` / `download_manager.rs`）：
     - `setup_download_handler` 将 WebView2 目标改为 `{final_path}.crdownload`（含 duplicate 分支）。
     - `complete_download` 成功时原子重命名 `.crdownload` → 最终路径（文件只有真正完成才以最终名出现，且被重命名后脱离 WebView2 清理路径）。
     - `delete_file_and_record` 同时清理最终名与 `.crdownload`。
     - `handle_download_finished` 完成事件向前端发最终路径（非 `.crdownload`），并新增「已完成记录收到 spurious finished(false)」守卫（防止监控提前最终化后 WebView2 销毁时把已完成翻成失败）。
  2. **字节真相完成判定**（`browser_webview_setup.rs` 监控线程）：`current_bytes >= total` 时——原生已完成 → 立即最终化；原生未完成 → 文件在满大小**稳定 2 轮（~1s）**即最终化（重命名+标记完成），覆盖 Pause 破坏操作的场景。此前「非 Completed/Unknown 就 continue」的严格判定移除。
  3. **可续传探测 + 装饰性暂停**（`download_manager.rs` / `browser_webview_setup.rs`）：监控线程启动时 HEAD 探测 `Accept-Ranges: bytes` 并缓存；`pause_download` 对不可续传下载**跳过原生 Pause**（仅 DB 标记暂停，UI 展示；传输继续并自然完成、文件保留——与 Firefox 一致的不假装暂停）；监控线程对「装饰性暂停」继续轮询直至字节完成。
- 验收：`cargo fmt`、`cargo clippy --workspace --all-targets --fix -- -D warnings`、`cargo check --workspace`、`cargo test`（-p adl-browser 全通过；-p ai-digital-life 全通过）✓
- 待用户复测：Tauri 桌面端再测「暂停→恢复」，确认：① 进度满的下载离开「进行中」分区并显示完成；② 完成后最终路径出现文件、`.crdownload` 消失；③ 关闭应用后已完成的文件保留；④ 下载中途关闭应用只清理 `.crdownload`（符合 Chrome 行为）。

## Phase 5 复测验证（2026-08-29，用户第七次测试）✅ 全部通过
- 用户操作：5 个下载（腾讯视频 / 夸克网盘 / 芒果TV / 崩坏星穹铁道 / 汽水音乐），其中腾讯（装饰性暂停）、星穹/汽水（真实暂停→恢复）。
- 日志证据（`.adl-logs/terminal-logs.txt`）：
  - 探测：腾讯 `resumable=false`（HEAD 无 Accept-Ranges）→ 装饰性暂停（`skipping native Pause (cosmetic pause, transfer continues)`）→ 传输继续并完成（WRY `finished(success=true)`）→ `renamed .crdownload to final path` → completed ✓
  - 夸克/芒果：字节真相完成判定（`file byte-complete and stable, finalizing`）或 WRY 完成 → 重命名 → completed ✓
  - 星穹 `6988710a`：真实暂停（`native WebView2 download PAUSED` + 监控 idling）→ 恢复（`RESUMED`）→ 字节真相最终化 → completed ✓；随后 12:43:29 WebView2 触发迟到 `finished(success=false)` → **新守卫生效**：`ignoring spurious finished(false) for an already-completed download (late native interrupt)`，记录保持 completed（未翻成失败）✓
  - 汽水 `63d7f68e`：真实暂停→恢复→字节真相最终化 → completed ✓
- 结果核验：
  - DB：5 个下载全部 `completed` 且 `bytes_received == total_bytes` ✓
  - 目录 `E:\Test-Workspace-1`：**5 个文件全部保留**（含汽水音乐 150MB），无 `.crdownload` 残留 ✓（此前仅 3 个保留）
  - 终端日志：**0 ERROR / 0 panic**；5 条 WARN 均为预期的 `download_requested: CANCELLED (silent webview)`（根因 8 正常行为）✓
  - 前端日志：仅 2 条良性 `Couldn't find callback id`（Tauri 热重载时异步回调，与下载无关，预存在）✓
- 修复验证结论：`.crdownload` 方案 + 字节真相完成判定 + 装饰性暂停 + 迟到 finished(false) 守卫**全部按预期工作**，根因 7/8/9 彻底解决。

## 审视发现的次要问题（已修复）：可续传探测精度
- 现象：腾讯视频 `dldir1.qq.com` 支持 Range（此前 12:07 会话真实暂停成功），但 HEAD 不返回 `Accept-Ranges` 头 → 旧探测误判 `resumable=false` → 其暂停退化为装饰性（仍完成、文件保留，但暂停不真正生效）。
- 修复（`browser_webview_setup.rs` `check_server_resumable`）：HEAD 请求附带 `Range: bytes=0-0`，服务器返回 `206 Partial Content` + `Content-Range` 即判定可续传；仍保留 `Accept-Ranges: bytes` 兜底。仅当有明确证据才判定可续传（保守方向：误判为不可续传只损失"暂停真正生效"，误判为可续传才会破坏操作、丢文件）。
- 验收：`cargo fmt` ✓、`cargo clippy -p ai-digital-life --all-targets --fix -- -D warnings` ✓、`cargo check -p ai-digital-life` ✓
- 待用户复测（可选）：确认腾讯视频等站点的暂停重新真正生效（探测应判 resumable=true）。

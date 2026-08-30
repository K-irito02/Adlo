# 进度 — 2026-08-31（下载 .tmp 残留文件 + 下载完成显示 0 B / 大小不一致）

## 事项 1：Ask 模式下默认保存路径文件夹出现 `.tmp` 文件
- 位置：Tauri 桌面应用 → 浏览器面板 → 下载（"每次询问"模式，选择默认保存路径）
- 现象：在默认保存路径文件夹中残留 GUID 命名的 `.tmp` 文件，对非专业用户造成困扰/疑惑
- 根因（已确认）：WebView2 引擎下载时使用 `{GUID}.tmp` 作为内部暂存文件，传输结束时再重命名为目标文件（`.crdownload`）。当下载被取消/中断/异常结束时，WebView2 可能来不及重命名，把 `{GUID}.tmp` 残留下来（见 MicrosoftEdge/WebView2Feedback#3356）。应用自身代码只写 `.crdownload`，从不生成 `.tmp`，因此这些文件对本应用不可见但会留在用户文件夹中
- 结论：`.tmp` 是 WebView2 的下载暂存文件，下载完成后应被重命名/消失；残留的是异常结束留下的"孤儿"暂存文件
- 修复方案：在 `complete_download` 与 `cancel_download` 末尾调用新增的 `cleanup_orphaned_tmp_files` 清理函数：
  - 仅扫描下载目标所在目录
  - **仅删除符合 WebView2 暂存形态 `{GUID}.tmp`（8-4-4-4-12 十六进制 GUID）的文件**，绝不触碰其他应用的任意 `.tmp` 文件（如 Office 自动保存、安装包、编辑器残留），避免误删用户合法数据
  - 仅删除修改时间 ≥ `TMP_ORPHAN_GRACE_SECS`（30 秒）的暂存文件（避免误删进行中下载的暂存文件；Windows 下被占用文件删除会失败并记 warn）
  - 不触碰任何非 `.tmp` 文件

## 事项 2：资源文件下载完成后显示 0 B / 与真实占用空间不一致
- 位置：Tauri 桌面应用 → 浏览器面板 → 下载记录列表
- 现象：部分下载完成后显示 "0 B"，或显示大小与文件资源管理器中的真实占用空间不一致
- 根因（已确认）：快速下载可在两次进度轮询之间直接到达终态，数据库 `bytes_received` 停留在 0 或旧值。`complete_download` 只把 `.crdownload` 重命名为最终文件，从未把 `bytes_received`/`total_bytes` 同步为磁盘上的真实文件大小（日志证据：`progress monitor: evaluating resume state — status=completed, interrupt_reason=none, bytes_received=0`）
- 修复方案：在 `complete_download` 成功分支读取最终文件元数据，将 `bytes_received`/`total_bytes` 同步为实际文件大小，使下载历史列表显示真实大小；该大小写入与状态更新放在**同一数据库事务**内，保证原子性（不会出现 "Completed 但 bytes_received=0" 的半更新状态）

## 实施记录（2026-08-31）
- **已实现**（`crates/browser/src/download_manager.rs`）：
  - 新增 `is_webview2_staging_tmp(name)`：校验文件名是否为 `{GUID}.tmp` 形态（大小写不敏感，兼容 Windows/macOS 大小写不敏感文件系统）
  - 新增 `TMP_ORPHAN_GRACE_SECS = 30` 常量；`cleanup_orphaned_tmp_files(file_path, grace_secs)` 按目录扫描 + GUID 形态校验 + 修改时间判定清理 WebView2 孤儿暂存文件，删除失败记 warn
  - `complete_download`：通过 `db.transaction()` 将状态更新与大小同步合并为单一事务；大小同步失败通过 `AppError::Storage` 上报而非静默吞掉，成功日志仅在真正写库成功后输出
  - `complete_download` / `cancel_download` 末尾调用 `cleanup_orphaned_tmp_files(&record.file_path, TMP_ORPHAN_GRACE_SECS)`
  - 回归测试更新/新增：`complete_download_syncs_bytes_to_actual_file_size`（校验 bytes_received/total_bytes 同步为真实大小）、`cleanup_orphaned_tmp_files_removes_stale_and_keeps_others`（改用 `{GUID}.tmp` 文件名，并新增"任意 `.tmp` 永不被删"断言）
- **代码审查修复**（closing-workflow Step 2，rev1 → rev2）：
  - H1：原清理逻辑按 `.tmp` 后缀删除所有旧临时文件，可能误删用户文件 → 增加 `{GUID}.tmp` 形态校验
  - Issue 1（HIGH）：大小同步 DB 失败被 `let _` 静默吞掉且无条件打印成功日志 → 改为事务内 `AppError::Storage` 上报 + 成功日志仅在真正成功后输出
  - Issue 2（M2）：大小写入与状态更新非原子 → 合并进 `db.transaction()` 单一事务
- **代码审查修复**（closing-workflow Step 2，rev2 → rev3，`download_manager.rs` / `download_handler.rs`）：
  - 成功分支 `fs::metadata` 失败静默（会残留 "Completed + 0 B" 且无日志）→ 记 `warn`（record_id/file_path/error）；大小跳过时记 debug
  - `is_webview2_staging_tmp` 无直接单测（H1 防回归缺口）→ 新增表驱动单测（合法 + 全部拒绝形态 + 大小写变体）
  - `read_dir` 失败静默 → 记 debug；删除前补 `meta.is_file()` 守卫；`remove_file` 的 NotFound 降级 debug（并发清理），其余仍 warn
  - `download_handler.rs` 终态失败日志措辞误导（DB 失败误报为 rename 失败）→ 改为 "rename or DB write failed"
- **代码审查修复**（closing-workflow Step 2，rev3 → rev4，`download_manager.rs`）：
  - cleanup 逐条目 `entry.metadata()` 失败静默 → 改 match 记 debug（file/dir/error）；`modified()`/`duration_since()` 注释声明为有意的时钟竞态静默（best-effort 扫描）
  - `complete_download` 的 `get_record` 失败静默（size 跳过无日志）→ 由 `.ok().and_then()` 改 `match`，Err 分支记 debug（record_id/error）
- **验证**：
  - `cargo test -p adl-browser --lib download` ✅（46 通过 / 0 失败，含 3 个相关回归测试：大小同步、孤儿清理、GUID 匹配器）
  - `cargo fmt --all` ✅
  - `cargo clippy -p adl-browser --all-targets -- -D warnings` ✅（无警告）
  - closing-workflow Step 2 多 Agent 审查 rev1→rev4 全部通过（rev4 确认 0 critical / 0 high / 0 medium / 0 low）
- **待用户实测**：重新构建后，Ask 模式取消下载后确认默认保存路径文件夹不再残留 `.tmp`；下载完成后确认历史列表显示真实大小

## 备注
- 用户要求：不需要全量测试，只测试影响部分即可（已按此执行：仅 `adl-browser` crate 的下载模块定向测试）

# 进度 — 2026-08-31（下载 .tmp 残留文件 + 下载完成显示 0 B / 大小不一致）

## 事项 1：Ask 模式下默认保存路径文件夹出现 `.tmp` 文件
- 位置：Tauri 桌面应用 → 浏览器面板 → 下载（"每次询问"模式，选择默认保存路径）
- 现象：在默认保存路径文件夹中残留 GUID 命名的 `.tmp` 文件，对非专业用户造成困扰/疑惑
- 根因（已确认）：WebView2 引擎下载时使用 `{GUID}.tmp` 作为内部暂存文件，传输结束时再重命名为目标文件（`.crdownload`）。当下载被取消/中断/异常结束时，WebView2 可能来不及重命名，把 `{GUID}.tmp` 残留下来（见 MicrosoftEdge/WebView2Feedback#3356）。应用自身代码只写 `.crdownload`，从不生成 `.tmp`，因此这些文件对本应用不可见但会留在用户文件夹中
- 结论：`.tmp` 是 WebView2 的下载暂存文件，下载完成后应被重命名/消失；残留的是异常结束留下的"孤儿"暂存文件
- 修复方案：在 `complete_download` 与 `cancel_download` 末尾调用新增的 `cleanup_orphaned_tmp_files` 清理函数：
  - 仅扫描下载目标所在目录
  - 仅删除修改时间 ≥ 30 秒的 `.tmp` 文件（避免误删进行中下载的暂存文件；Windows 下被占用文件删除会失败并记 warn）
  - 不触碰任何非 `.tmp` 文件

## 事项 2：资源文件下载完成后显示 0 B / 与真实占用空间不一致
- 位置：Tauri 桌面应用 → 浏览器面板 → 下载记录列表
- 现象：部分下载完成后显示 "0 B"，或显示大小与文件资源管理器中的真实占用空间不一致
- 根因（已确认）：快速下载可在两次进度轮询之间直接到达终态，数据库 `bytes_received` 停留在 0 或旧值。`complete_download` 只把 `.crdownload` 重命名为最终文件，从未把 `bytes_received`/`total_bytes` 同步为磁盘上的真实文件大小（日志证据：`progress monitor: evaluating resume state — status=completed, interrupt_reason=none, bytes_received=0`）
- 修复方案：在 `complete_download` 成功分支中读取最终文件元数据，将 `bytes_received`/`total_bytes` 同步为实际文件大小，使下载历史列表显示真实大小

## 实施记录（2026-08-31）
- **已实现**（`crates/browser/src/download_manager.rs`）：
  - 新增 `cleanup_orphaned_tmp_files(file_path, grace_secs)`：按目录扫描 + 修改时间判定清理 WebView2 孤儿 `.tmp` 暂存文件
  - `complete_download` 成功分支：`fs::metadata(final_path)` → `UPDATE download_history SET bytes_received = ?1, total_bytes = ?1 WHERE id = ?2`
  - `complete_download` / `cancel_download` 末尾调用 `cleanup_orphaned_tmp_files(&record.file_path, 30)`
  - 新增 2 个回归测试：`complete_download_syncs_bytes_to_actual_file_size`、`cleanup_orphaned_tmp_files_removes_stale_and_keeps_others`
- **验证**：
  - `cargo test -p adl-browser --lib download_manager` ✅（32 通过 / 0 失败，含新增 2 测试）
  - `cargo fmt -p adl-browser` ✅
  - `cargo clippy -p adl-browser --all-targets` ✅（无警告）
- **待用户实测**：重新构建后，Ask 模式取消下载后确认默认保存路径文件夹不再残留 `.tmp`；下载完成后确认历史列表显示真实大小

## 备注
- 用户要求：不需要全量测试，只测试影响部分即可（已按此执行：仅 `adl-browser` crate 的下载模块定向测试）

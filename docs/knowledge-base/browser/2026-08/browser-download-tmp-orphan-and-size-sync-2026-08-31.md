# 浏览器下载：WebView2 `.tmp` 孤儿残留与下载完成大小同步

## 日期
2026-08-31

## 涉及功能
浏览器面板"资源下载"（Ask"每次询问"模式）保存路径出现 `{GUID}.tmp` 残留文件；部分下载完成后历史列表显示 0 B 或与真实占用空间不一致。

## 背景与根因
- **`.tmp` 残留**：WebView2 引擎下载时使用 `{GUID}.tmp` 作为内部暂存文件，传输结束再重命名（`.crdownload` → 目标文件）。下载被取消/中断/异常结束时 WebView2 可能来不及重命名，把 `{GUID}.tmp` 留在用户保存路径下（参考 MicrosoftEdge/WebView2Feedback#3356）。应用自身代码只写 `.crdownload`，从不生成 `.tmp`。
- **0 B / 大小不一致**：快速下载可在两次进度轮询之间直达终态，数据库 `bytes_received` 停留在 0 或旧值；`complete_download` 只做重命名，从未把 `bytes_received`/`total_bytes` 同步为磁盘真实文件大小。

## 核心修复
1. **孤儿 `.tmp` 清理**（`crates/browser/src/download_manager.rs`）
   - `cleanup_orphaned_tmp_files` 在 `complete_download`/`cancel_download` 末尾按下载目标所在目录扫描
   - **只删除符合 WebView2 暂存形态 `{GUID}.tmp`（8-4-4-4-12 十六进制，大小写不敏感）的文件**，绝不触碰其他应用的任意 `.tmp`（Office 自动保存、安装包、编辑器残留等），避免误删用户合法数据
   - 仅删除修改时间 ≥ `TMP_ORPHAN_GRACE_SECS`（30s）的暂存文件，避免误删进行中的兄弟下载暂存；Windows 下被占用文件删除失败记 warn 兜底
2. **大小同步**（`complete_download`）
   - 成功分支读取最终文件元数据，将 `bytes_received`/`total_bytes` 同步为实际大小；与状态更新放同一 `db.transaction()` 保证原子性（不会出现 "Completed 但 0 B" 半更新态）
   - DB 写入失败通过 `AppError::Storage` 上报；最终文件缺失/不可读记 warn；`get_record` 失败记 debug——均不静默吞错

## 经验教训
1. **WebView2 下载会留下 `{GUID}.tmp` 暂存文件**：这是引擎内部行为，异常结束时成为孤儿残留。清理时**必须按 GUID 形态严格匹配**，不能按 `.tmp` 后缀一刀切（会误删用户其他应用的文件）。
2. **清理孤儿暂存与"保护进行中兄弟下载"是一对安全权衡**：整目录扫描 + 30s 宽限是保守方案；彻底消除需 WebView2 暴露每个下载自身的暂存名（当前 API 未提供）。并发同目录下载 + 暂停 >30s 为罕见场景，接受为已知取舍。
3. **下载终态大小必须主动同步**：快速下载可跳过进度轮询直达终态，DB 大小会停在 0/旧值；`complete_download` 成功分支必须 stat 最终文件并写回真实大小。
4. **状态更新与大小写入必须原子**：合并进同一 SQLite 事务，避免半更新态（Completed + 0 B）。
5. **错误路径禁止静默**：metadata 失败记 warn、DB 失败用 `AppError::Storage` 上报、`get_record` 失败记 debug，均不静默吞错（符合 `error-handling.md`）。

## 相关文件
- `crates/browser/src/download_manager.rs`（`cleanup_orphaned_tmp_files`、`is_webview2_staging_tmp`、`TMP_ORPHAN_GRACE_SECS`、`complete_download` 大小同步 + 表驱动单测）
- `crates/browser/src/download_handler.rs`（终态失败日志措辞）
- 根因与修复全记录：`docs/root-cause-resolution/2026-08/progress-2026-08-31-download-tmp-0b.md`
- 收尾记录：`docs/closing-workflow/2026-08/progress-2026-08-31-043054.md`

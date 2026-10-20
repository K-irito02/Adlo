# 设置面板打开即卡死：storage 状态查询在 UI 线程遍历 6 万文件 + 诊断心跳重 arm 防抖

- 来源：2026-10-20 事项 9（Tauri 白屏/未响应 AppHangB1），进度 `docs/root-cause-to-close/2026-10/progress-2026-10-20-001712.md`
- 现象：开屏后点设置面板（DSH/存储组）或拖拽复制按钮 → 白屏卡死数分钟 → 自行恢复；`AppHangB1`；前端零日志、零 IPC、零 HTTP。

## 1. 根因：同步 Tauri 命令在 WebView2 UI 线程内联执行

- cdb 活体抓栈（`Responding=False` 时非侵入 attach）：主线程停在
  `ntdll!NtCreateFile ← CreateFileW ← std::fs::metadata ←
  adl_kernel::storage::migration::dir_usage_limited (migration.rs:293) ←
  category_usage(Dsh) ← category_statuses (storage.rs:158) ←
  storage_get_status ← run_invoke_handler（主线程）`。
- 活体内存值：`files.len=63669`（dsh-versions 下真 npm 安装的 613 包产物）、
  已处理 54502、约 673MB；当前路径即 `...\dsh-versions`。
- 触发链：设置面板打开 → `prefetchStorageSettings` 预取状态 →
  6.3 万文件逐个 `metadata()`（过杀毒过滤）→ 主线程被堵数分钟 →
  窗口消息/WebView 创建/同步 IPC 全停 → 恢复（走完即好）。
- 修复：`storage_get_status` / `storage_scan_foreign_cmd` /
  `storage_preflight_cmd` / `storage_set_paths` 改 `async + spawn_blocking`
 （与既有 `write_debug_logs_to_project` 同模式）；重活抽纯函数单测锁定。
- 教训：
  - 同步 `pub fn` Tauri 命令默认在调用线程（UI 线程）执行，任何目录遍历、
    文件 IO 都必须 `spawn_blocking`；PDB + cdb 行号是定位此类问题的最短路径。
  - 数据量是帮凶：真安装把 `installed/` 从空目录变成 6 万文件，
    让原本“瞬间完成”的隐藏遍历变成分钟级卡死——引入大体积数据时要复查
    所有同步遍历调用方。

## 2. 诊断探针自身缺陷：2s 心跳永久重 arm 3s 防抖，自动刷盘永不触发

- 收集器 `collectLog → debouncedWriteLogs(3s)`：心跳每 2s 写一条 console，
  每次都清掉 pending 的 3s 定时器并重设 → 定时器永不到期 → 磁盘零日志。
- 后果：“零日志”曾被误读为“渲染器已死”，实际渲染器活着（心跳在内存里涨）。
- 修复（诊断期）：心跳每 3 次直接调 `__forceFlushDebugLogs`，不走防抖；
  收尾时探针整体删除。
- 教训：给诊断日志加“保底刷盘通道”（安装时强制刷一次 + 周期强制刷），
  不要把唯一证据链押在防抖定时器上；解读“无日志”前先证伪测量通道本身。

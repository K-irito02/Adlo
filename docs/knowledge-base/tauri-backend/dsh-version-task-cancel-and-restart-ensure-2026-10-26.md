# dsh 版本任务取消饥饿与重启确保语义（2026-10-26）

用户实测：安装中点“取消”后 11 秒无响应，进度条先跳“正在收尾”又退回“正在下载”，要点第二次才生效。

## 根因 1：同步全树 walk 饿死取消检查

`run_npm_with_progress` 的 400ms 轮询 ticker 内联执行 `count_installed_packages(tmp)`（同步递归 walk，大树可达数秒）。`tokio::select!` 单任务内轮询，一旦进入 walk 分支，同任务的取消检查分支也被饿死——取消请求到达后，要等 walk 走完 + npm 自然结束才被处理（实测延迟 11 秒）。

教训：**进度统计这类 CPU/IO 密集型同步工作，禁止放在承载取消检查的同一 async 任务里内联执行**。修法：
- walk 搬进 `tokio::task::spawn_blocking`（返回值经 `await` 拿回，期间 select 照常轮询）；
- 另加一条独立 100ms 快检分支只做 `is_cancelled()`（不碰文件系统，双保险）；
- 自适应节流：walk 耗时按 2 倍计入下次间隔（400ms～5s），大树下不饿死事件循环。

同类位置一并处理：卸载的 `collect_for_removal` 全树收集同样搬进 `spawn_blocking`；收集时加深度/条目上限（防恶意包造环），超限部分由最后整体 `remove_dir_all` 兜底。

附带：Windows junction 的 `symlink_metadata().file_type().is_symlink()` 为 false（junction 是 reparse point 不是 symlink），链接判定必须另查 `FILE_ATTRIBUTE_REPARSE_POINT`，否则跟随出界。

## 根因 2（设计）：`run_restart` 只重启“已有进程”

旧语义：无运行实例直接返回 `restarted:false`，不做任何事。用户定义的完成态是“后台 dsh 进程已成功启动**并正在运行**”——安装/切换/重装后若之前没跑 dsh，完成后实际没进程，与完成态矛盾。

改为 ensure 语义：无运行实例但有可用来源时直接拉起（run_open），无可用来源才返回 `restarted:false`。调用方（安装/切换/重装/卸载后 + 卸载到空的关标签兜底）统一按最终结果 toast。注意：这不是“自动打开标签”——建标签仍是前端 `openDsh` 的事，服务只保证进程。

## 关联修复

- `syncDshTab` 改为“先开新标签、再关旧标签”：`centerRemoveTab` 在中心变空时会**同步**补一个 launcher 入口页，先关后开必中招（重装后多出入口页的根因）。按原位置逐个重建（中间区回中间区，面板留面板）。
- `TaskReporter::cancel()` 把 phase 置为 finalizing 是有意的即时反馈（取消后 100ms 内 UI 即显示“正在收尾”），不是 bug；之前看起来像“闪烁”纯因根因 1 的 ticker 恢复后又写回 installing。

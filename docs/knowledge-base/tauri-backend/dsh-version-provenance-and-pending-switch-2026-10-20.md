# dsh 版本显示溯源 + 延迟切换 — 2026-10-20

## 1. `where` 首行无后缀 shim：探测与拉起必须同口径回退

npm 全局安装在 Windows 落三个文件（`dsh` shell 脚本 / `dsh.cmd` / `dsh.ps1`），`where dsh`
首行是无后缀的 `…\node_global\dsh`。直接 spawn 报 193（`%1 不是有效的 Win32 应用程序`）。
宿主拉起侧早有 `.cmd` 回退（`webapp-host::spawn_capturing`，spawn 失败换 `program + ".cmd"` 重试）；
但 `--version` 探测是另一条代码路径，漏了同口径回退 → `system.version` 恒 `None`，
UI 只能显示“版本未知”。教训：**凡按 PATH 首行 spawn 的地方有几处，回退就要有几处**
（本次是 `detect_system_dsh → probe_dsh_version` 补 `system_probe_candidates` 原 path + `.cmd` 兜底，
纯函数可单测）。附带：会话缓存键必须带 path，否则 PATH 变化会导致“新 path 配旧版本”的错配展示。

## 2. 运行中版本号不许猜：source-status 登记 spawn 来源

`resolve_effective_source` 里 `running` 恒优先，UI 曾用“宿主已装版”启发式填充运行中版本号——
切 system 并立即生效重启后就误报（实际跑的是 system 版）。正解：后端 `dsh_state`
记 `ManagedDsh{process, version}`（spawn 处按 Host/System/Bundled 登记；外部复用不写锁），
`source-status.running` 增 `managed/version`，前端只认登记值，外部一律“未知”。
原则：**展示层禁止用库存信息推测运行中进程的版本**（它可能是外部手起的任意版本）。

## 3. 破坏性来源切换走“pending + 启动兑现”，不直接落盘

切来源（host↔system）有运行中进程时直接落盘 `version_source`，选择器立刻变新值，
与“本次仍使用当前来源”矛盾，且旧进程继续服务导致显示错乱。模式：
“下次启动生效”只写 `localStorage` pending（+ 内存 deferred 标记供 UI 提示），
配置不动、选择器仍显示当前生效来源；下次启动由挂载期 `applyPendingVersionSource`
一次性落盘 + 静默重启 + 刷新（失败保留 pending 下次重试；并发重入守卫合并）。
注意：pending 必须持久化（内存态重启即丢，兑现无从谈起）；直接落盘路径要清 pending，
否则陈旧 pending 在下次启动误触发。

## 4. 一次性 token 进一切持久化都要剥离（身份 vs 导航分离）

`?token=` 只用于首次访问换 cookie（导航必需），绝不是身份。history 落盘、
site-meta 缓存键（三处同构：Rust `normalize_cache_key`、前端镜像、preview 服务）、
`page-meta getSilent` 日志行此前都原样携带 token：修复口径统一为“剥离 `token`
查询参数”，且只动**存储/日志键**，抓取与导航仍用完整 URL。另：去重键同样去 token，
否则每次 token 轮换分裂出新历史条目。

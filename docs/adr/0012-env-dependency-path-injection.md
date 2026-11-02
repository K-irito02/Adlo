# 环境依赖通过进程级 PATH 注入生效，而非只做状态展示

环境组检测到宿主副本或指定路径后，仅更新状态不会让 dsh/内部 git/终端真正使用它：dsh 宿主版用 `spawn_node_direct("node")`、workspace 的 `Command::new("git")` 与 PTY 都只认 `adl-server` 进程的 PATH。因此决定把当前取用目录（auto/host 取宿主副本，system/custom 取指定路径的父目录，auto 宿主优先）前置到 `adl-server` 进程 PATH，并在启动、install/uninstall 成功、来源切换、设置指定路径时刷新；用 `APPLIED` 记录上一轮目录，切换时先摘旧再加新。只影响新终端/新子进程，不修改系统或用户环境变量。

本决策只覆盖环境依赖；harness CLI 的终端 PATH 注入仍是另一套机制，见 [ADR-0005](./0005-terminal-path-injection-for-hosted-cli.md)。

**Considered Options**: 在每个 spawn 点显式传绝对路径（workspace git 调用点多，dsh 与 PTY 也要改，侵入大）；改系统/用户 PATH（持久污染、影响其它程序）；只做状态展示（原缺陷：安装成功但不可用）。

**Consequences**: 既有 PTY 不回溯；`join_paths` 失败保留原 PATH 并下次重试；内置 bash 终端的 shell 选择器仍优先固定 Git/WSL 路径；指定路径以文件存在为准，损坏后不回退。

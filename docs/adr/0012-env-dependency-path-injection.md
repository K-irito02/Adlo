# 环境依赖通过进程级 PATH 注入生效，而非只做状态展示

环境组检测到宿主副本或指定路径后，仅更新状态不会让 dsh/内部 git/终端真正使用它：dsh 宿主版用 `spawn_node_direct("node")`、workspace 的 `Command::new("git")` 与 PTY 都只认 `adl-server` 进程的 PATH。因此决定把当前取用目录（auto/host 取宿主副本，system/custom 取指定路径的父目录，auto 宿主优先）前置到 `adl-server` 进程 PATH，并在启动、install/uninstall 成功、来源切换、设置指定路径时刷新；用 `APPLIED` 记录上一轮目录，切换时先摘旧再加新。只影响新终端/新子进程，不修改系统或用户环境变量。

本决策只覆盖环境依赖；harness CLI 的终端 PATH 注入仍是另一套机制，见 [ADR-0005](./0005-terminal-path-injection-for-hosted-cli.md)。

**Considered Options**: 在每个 spawn 点显式传绝对路径（workspace git 调用点多，dsh 与 PTY 也要改，侵入大）；改系统/用户 PATH（持久污染、影响其它程序）；只做状态展示（原缺陷：安装成功但不可用）。

**Consequences**: 既有 PTY 不回溯；`join_paths` 失败保留原 PATH 并下次重试；内置 bash 终端的 shell 选择器仍优先固定 Git/WSL 路径；指定路径以文件存在为准，损坏后不回退。

## 2026-11-05 补充：系统探测不得读注入后的 PATH

本决策让进程 PATH 前置了宿主副本目录。反过来，「系统安装」的探测（`where node/git/bash`）也在同一进程里跑，于是会把注入目录当成系统副本：把 Git 切成系统安装、而 Bash 仍取宿主时，宿主 PortableGit 的 `bin/`（同时含 `bash.exe` 与 `git.exe`）仍在 PATH 上，`where git` 首个命中就是宿主副本——界面显示「系统安装」，路径却是宿主副本，直到 Bash 也切成系统才「突然」更新。

决定：**系统探测必须排除应用自己注入的宿主目录。** `adl-env` 提供 `first_system_candidate`（跳过路径含 `\env-hosted\` 的候选），node / git / bash 共用。判断依据是路径归属，而不是「有没有出现在 PATH 上」。

**Considered Options**: 探测时用注入前的 PATH 快照（更根本，但要把快照线程化到每个 provider，改动面大）；按路径过滤注入根（选中，集中在一处）；不处理（切换来源会长期显示错误路径）。

**Consequences**: 用户若把合法副本恰好放在 `<数据根>/env-hosted/` 下，不会被识别为系统安装（布局约定即语义）；宿主目录布局改名时 `first_system_candidate` 必须同步；与「来源切换后只重探被切依赖」配合，切换后无需等全量探测。

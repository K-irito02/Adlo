# git 元数据监听盲区：commit/push 后面板文件仍显示「已暂存」

日期：2026-11-09 · 领域：multi-workspace（变更面板 / 监听刷新）· 决策见 [ADR-0019](../../adr/0019-git-metadata-watchers.md)

## 现象

"右侧面板-文件面板 和 变更面板"在保存/编辑文件后已能实时刷新，但 `git commit` / `git push` 之后，工作区下的所有变更文件仍停留在「已暂存（S）」，不消失。

## 根因

1. `.git` 被监听根整体忽略：`crates/workspace/src/tree.rs` `ignored_dirs()` 含 `.git`（Rust / adl-server，Tauri 桌面与浏览器连真服务器共用）；dev 预览 Node watcher 同样把 `.git` 列入 `IGNORED_DIRS`。
2. `git commit` / `git push` / `git checkout` 等操作**不写工作树一个字节**，只改 `.git`（refs/**、logs/**、packed-refs、HEAD、index）——工作树 watcher 一条事件都没有，`refreshGitSnapshot` 不触发，变更面板停留在操作前的快照。
3. push 本身不改变快照（ahead/behind 恒为 `None`）；让「文件从面板消失」的是 commit，而 commit 也只动 `.git`。
4. **linked worktree**（本仓 slot-1 自身）形态更特殊：`.git` 是 **gitdir 指针文件**，真实的 HEAD/index/logs 在 worktree 专属 gitdir（`<主仓>/.git/worktrees/<name>/`），`refs/**`/`packed-refs`/`logs/**` 在共享主仓 `.git`——两者都不在工作区根下，仅 watch 根覆盖不到任何提交信号。

## 解法要点

- 每个监听根额外 watch 解析出的 **gitdir + commondir**（`.git` 目录 → 自身；`.git` 文件 → 解析 `gitdir:` 指针 + 其中 `commondir` 文件，词法归一化消 `..`），白名单只放行 `HEAD/index/packed-refs/FETCH_HEAD/ORIG_HEAD/MERGE_HEAD/…/refs/**/logs/**/rebase-*/**`，排除 `objects/**` 等噪音。
- 路径合成 `.git/<rel>`、以**工作区根**打 `rootPath` tag，复用 `FilesChangedBatch` 契约——**零 IPC 变更**。
- 前端按 `.git/` 前缀把批次分区：非溢出 git 批次只做静默 `refreshGitSnapshot`；树/搜索/选中文件对账全部按 normal 路径处理。
- 漂移对账：`.git` 被删除重建、目录↔gitfile 布局互换、`.git` 原位 rm+init 后旧 git watcher 盯住已删除目录（创建时间指纹 `btime` 比对识别），登记内容与磁盘不一致时替换/降级（git 静默跟手暂时缺失，焦点补刷兜底）。

## 复盘

- 「面板在文件变化时刷新、git 操作时不刷新」这个组合，是典型的**信号源与刷新触发面不匹配**：所有文件事件都来自「工作树」这一维，git 把状态写到另一维（`.git`）。watch 的设计原则应当对「被忽略的目录内是否存在会影响可见状态的信号」单独复核，而不是只想着「哪些目录不想盯」。
- 白名单（`refs/**`、`logs/**` 等最小集）而不是放行整个 `.git`：前者把语义边界收缩到「驱动快照变化的信号」，避免 `objects/**` 高频事件放大刷新。
- 指针布局（`.git` 是文件）意味着元数据**不在**监听根下，任何「watch 根下的一个目录」类方案都不够——必须解引用 gitdir 并对其**双重打开**（gitdir + commondir）。
- 已知未处理边界（记在 ADR-0019 / 进度文件）：commit/checkout 若同时改写工作树文件，工作树通道照常上报；纯 push 在 git 未更新任何被监听路径时面板不主动刷新（token/语义边界）。

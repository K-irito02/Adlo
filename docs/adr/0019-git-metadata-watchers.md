# git 元数据通道：commit/push 等只动 `.git` 的操作也要唤起刷新

**Status**: accepted（companion to [ADR-0018](./0018-multi-root-workspace-watchers.md)）

多根文件监听（ADR-0018）只观察工作树，而 `git commit` / `git push` / `git checkout` 等操作**只改 `.git` 元数据、不触碰工作树文件**，因此根 watcher 收不到任何批次，变更快照（staged/unstaged/untracked）停留在操作前状态——用户看到的现象是「文件明明提交了，变更面板里还带着已暂存（S）」。决定：**每个监听根除主 watcher 外，额外监听解析出的 git 元数据目录（gitdir + commondir，去重），只放行 git 元数据白名单（`HEAD`/`index`/`packed-refs`/`FETCH_HEAD`/`ORIG_HEAD`/`MERGE_HEAD`/`CHERRY_PICK_HEAD`/`REVERT_HEAD`/`REBASE_HEAD`/`MERGE_MSG`/`SQUASH_MSG`/`AUTO_MERGE`、`refs/**`、`logs/**`、`rebase-merge/**`、`rebase-apply/**`），路径合成 `.git/<rel>` 后仍以工作区根打 tag 发出批次；前端按 `.git/` 前缀把 git 批次分区出来，无 overflow 时只静默刷新 git 快照（`refreshGitSnapshot(..., { silent: true })`），不触发文件树/搜索重算/选中文件对账；overflow 批次无法归因，按整轮重扫 + 选中 reconcile 处理（契约既定）。**linked worktree 的 `.git` 是 gitdir 指针文件，真实 git 元数据分布在 worktree 专属 gitdir（HEAD/index/logs）与共享主仓 `.git`（refs、packed-refs、logs），根 watcher 根本看不到，因此必须同时 watch 两者。

## Considered Options

- **沿用「根 watcher 带 `.git`」**：让根 watcher 放行 `.git/**`——`objects/**` 噪音大、且常见重复事件；分区逻辑复杂，且越过「合成路径只供快照刷新」的诚实边界，废弃。
- **前端轮询 git 快照**：每 N 秒跑 6 个 git 命令 × 工作区数，刷新有延迟且高峰负载大；与自动刷新通道重复两套，废弃。
- **仅在提交类 UI 动作后刷新**：应用内目前没有提交按钮，提交发生在终端/外部 GUI，覆盖面为零；废弃。
- **本次采用：git 元数据专用 watcher + 合成路径分区**：不改 IPC 契约与 WS 帧，前端只按路径前缀分流；`.git` 仍被普通 watcher 忽略。

## Consequences

- 每个监听根最多额外 2 个 OS watcher（gitdir + commondir；普通仓库两者同一，去重为 1）。git 子 watcher 不计入「监听根上限 32」。
- Git watcher 对根布局漂移做对账：`.git` 被删除重建、目录 ↔ gitfile 布局互换、git 目录被移走后，注册内容与磁盘不一致时（含同路径 rm+init，靠创建时间指纹识别），替换登记或立即降级（git 静默跟手暂停，焦点补刷兜底），两端口径一致。
- 单个 git watcher 失效（git 目录不可 watch）只降级 git 感知，根 watcher 不受影响；worktree 被移除/重建后随下一次 watcher 对账生效（打开/移除工作区、启动对账、浏览器预览 2s 轮询触发）。
- 消费端按 `.git/` 前缀分流；git 批次即使带溢出也无法归因，退化为全量刷新通路（消费端分流规则不区分 overflow 归因）。
- 白名单是「能驱动快照变化的最小集」：commit 更新 HEAD + refs；staging 更新 index；push 更新 refs/remotes/**（本应用快照不含 ahead/behind，push 仅触发静默刷新，数据自身不变）；rebase/merge/checkout 更新 logs/** 与 HEAD/refs。
- 领域术语见 [GLOSSARY.md](../../GLOSSARY.md) 的「git 元数据监听」「监听根」「文件变更批次」「批次归属」。

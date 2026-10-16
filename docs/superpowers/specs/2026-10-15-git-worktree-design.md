# Git Worktree 分支隔离设计（方案 B，sibling 落点）

- 日期：2026-10-15 / 状态：已批准（用户亲批 sibling 独立目录）
- 配套进度：`docs/root-cause-to-close/2026-10/progress-2026-10-15-135801.md`

## 目标

1. 任一面板切分支，两面板同刷；2. 子卡片 divergence 图标 + 三选项；
3. 增量（换目录即切换，零重写）；4. 本地可复测矩阵。

## 架构

主仓 + sibling worktrees：`<仓>-worktrees/<分支>/`，与主仓并列。
对象库共享（`.git` 为指针文件），磁盘开销 = 工作文件 × 分支数。

```
Git-Test-Repository/            ← 主仓（main 常驻）
Git-Test-Repository-worktrees/
  feature-ahead/                ← worktree：本地超前
  feature-behind/               ← worktree：远程超前
  feature-diverged/             ← worktree：双向分叉
Git-Test-Remote.git/            ← bare 远端（本地模拟 origin）
```

## 接口（新增优先复用 switch 入参扩展）

- `WorktreeInfo { branch, path, isMain, locked, prunable }`
- `worktree_add(root, branch, base?)` → 同名分支二次 add 直接报错透出；
  `worktree_list(root)`（解析 `git worktree list --porcelain`）；
  `worktree_remove(root, branch)` + `worktree_prune(root)`（孤儿清理）。
- `GitBranchSummary += { ahead, behind, upstream?, divergeStatus: synced|ahead|behind|diverged, worktreePath? }`
  计算：`rev-list --left-right --count 本地...<remote-tracking>`，只读不 fetch。
- `switch` 输入加 `mode: local | remote | sync`：
  local = 聚焦/新建 worktree；remote = 以 `origin/<名>` 建（或重置）worktree；
  sync = 该 worktree 内 `fetch + merge --ff-only`，非 ff 即停报冲突。

## 前端

- `BranchSubCard`：行内 ↑/↓/⇕（中性色）+ 计数 Tooltip + worktree 徽标 + 复制按钮保留；
  分叉行点选弹三选项（local/remote/sync），remote 二次确认（reset --hard 语义）。
- 切后三刷：`fetchGitStatus + refreshOneWorkspaceTree(force) + fetchGitBranches` + 清该仓预览缓存。
- 四端对齐：tauri-bridge / preview-bridge / mock-bridge / httpBridge 同方法集；i18n key 无硬编码。

## 错误与治理

- 同分支双检出：透出 Git 原文 + 中文前缀； capabilities 如新增 command 白名单登记（禁通配）；
- 双端一致：preview `git.ts` 与 Rust 同语义（含 pop 缺口一并补齐）；
- 准确性：worktree 建后 `rev-parse HEAD` 回读校验。

## 验证

本地矩阵断言：聚焦零重写、脏隔离、计数正确、删主仓后 prune、冲突即停。

## 边界与注意事项（安全审计结论）

1. **ignored 文件不跟随切换**：`stash --include-untracked` 按 git 语义不含被忽略文件；各分支的构建产物、`.log` 等 ignored 文件会原地残留。这是 git 原生行为，不是 bug；如某分支构建异常，先清构建目录。
2. **`remove --force` 故意不暴露 UI**：删除 worktree 会丢弃其未提交内容且不可逆；桥方法保留供未来带脏确认的 UI 使用，当前子卡片不提供删除入口。
3. **离线行为**：remote/sync 模式需联网 fetch；失败时本次新建的 worktree 目录会被自动回滚删除（只删自己建的），经典切换则停在目标分支本地内容 + 报错，不丢数据。
4. **stash 同名堆积**：同一分支多次 stash（如 remote-reset 后又切走）都会保留，分支行显示 `自动暂存 ×N`；取回永远拿最新一条，旧的可 `git stash list` 自行认领。
5. **永远不自动 push**：同步 = fetch + merge（ff 优先，否则 `--no-edit` 合并，冲突 abort）。push 永远手动。

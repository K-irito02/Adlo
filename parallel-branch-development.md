# Agent 工作手册：工作树并行分支开发

> 仓库：`E:\AI-DIGITAL-LIFE\SourceWorkspace`　｜　模型：**一分支 = 一工作树 = 一会话**
>
> 用法：开工先读 §1–§2，动手前读 §3，提交前读 §4–§5，报错先查 §7。
> 真相优先级：`git` 实测 > `.sessions` 注册表 > 本手册示例 > 目录名。

## 0. 章节路由

| 要做的事 | 去 |
|----------|-----|
| 第一次使用，还没有任何槽位 | §3.1 建槽位 |
| 判断我在哪、能不能开工 | §2 开工自检 |
| 没有可用目录，要新建 | §3.2 新建工作树 |
| 有闲置的旧工作树，要改成新分支 | §3.3 复用改造 |
| 改代码、跑构建、起应用 | §4 硬约束 |
| 提交、合并、收尾 | §5 / §9 |
| 报错 | §7 异常对照 |

---

## 1. 概念与不变量

| 术语 | 含义 |
|------|------|
| 主工作树 | `E:/AI-DIGITAL-LIFE/SourceWorkspace`，常驻 `main`，只做集成与全量验证 |
| 槽位 | `E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1` 这类**长期持有**的目录，分支在其中轮换 |
| 工作树 | git worktree：独立文件目录，共享对象库（**从不重复克隆**） |
| 注册表 | `SourceWorkspace-worktrees/.sessions/<session>.json`，在仓库外，不进 git |

三条不变量：

1. 一个目录同一时刻只属于一个会话、只承载一条分支。
2. 未探测环境不动手；探测结果必须能贴给用户。
3. 破坏性命令（`reset --hard`、`clean -fdx`、`rm -rf`、`worktree remove --force`）禁止在非自己专属目录内使用。

**为什么复用槽位**：`target/` 与 `node_modules/` 可跨分支复用——本仓 `target` 大头是依赖产物，冷构建代价远高于增量。但收益有条件：`Cargo.lock`、`Cargo.toml` profile、`.cargo/config.toml`、工具链任一变化都会让依赖层失效，退化为接近冷构建。另注意：复用与并行互斥，一个目录只能串行承载分支。

---

## 2. 开工自检（ENV PROBE）

每次开工第一件事。任一项不通过 → 停止并报告，禁止自行“修环境”。

```bash
ROOT="E:/AI-DIGITAL-LIFE/SourceWorkspace"
WT_ROOT="$ROOT-worktrees"

git rev-parse --show-toplevel                      # 1 我在哪个目录
git branch --show-current                          # 2 我在哪条分支（空 = detached）
git worktree list --porcelain                      # 3 全仓工作树与分支占用
ls "$WT_ROOT/.sessions" 2>/dev/null                # 4 谁占着哪个槽位
git status --porcelain                             # 5 是否干净
git log --oneline -1                               # 6 我在哪个提交
git rev-list --left-right --count main...HEAD      # 7 相对本地 main 的落后/领先
git config --get core.hooksPath                    # 8 本地门禁是否启用（期望 .githooks）
test -d ai-digital-life/.codegraph                 # 9 CodeGraph 索引是否就绪（每工作树一份）
```

| # | 通过标准 | 不通过时 |
|---|----------|----------|
| 1 | 是 `$ROOT` 或 `$WT_ROOT/<slot>` | 不认识的路径 → 不改任何文件 |
| 2 | 非空，且与注册表 `branch` 一致 | detached 或与登记不符 → 停 |
| 3 | 本分支只出现一次，且是当前路径 | 出现在别处 → 分支已被占用 |
| 4 | 当前目录无他人 `status: active` | 有 → 换槽位或等待 |
| 5 | 空，或改动全部属于本会话 | 来源不明的改动 → 停，禁止清理 |
| 6/7 | 清楚自己的基线落后多少 | 落后较多 → 先 `merge --ff-only main` |
| 8 | 输出 `.githooks` | 未启用 → `pnpm --dir ai-digital-life run setup:worktree`（仓库级，一处即可） |
| 9 | 目录存在 | 缺失 → 同上（`codegraph init`，索引不入库） |

输出一行环境快照（**没有快照视为未开工**）：

```
[ENV] toplevel=<路径> branch=<分支> head=<短 SHA> dirty=<文件数> slot=<slot-n|—>
      mode=<new-worktree|reused-slot> others=<他人 active 会话> instance=<none|运行中的 exe 路径>
      hooks=<ok|missing> graph=<ok|missing>
```

结论与去向：已是自己的槽位 → 读 §4 后开工；有空闲干净槽位 → §3.3 复用；都没有 → §3.2 新建。

---

## 3. 拿到一个可开发的目录

### 3.1 首次使用：建槽位

```bash
mkdir -p "$WT_ROOT/.sessions"
git -C "$ROOT" worktree add "$WT_ROOT/slot-1" -b <branch> main
cd "$WT_ROOT/slot-1/ai-digital-life" && pnpm install && pnpm run setup:worktree && cargo check --workspace
```

**基线用本地 `main`，不要用 `origin/main`**：本仓约定永不自动 push，远端可能落后于本地 `main`，从 `origin/main` 起分支会丢掉本地提交。

### 3.2 新建工作树（需要多分支同时在线时）

```bash
git -C "$ROOT" worktree add "$WT_ROOT/<branch>" -b <branch> main
git -C "$WT_ROOT/<branch>" status --porcelain     # 必须为空
cd "$WT_ROOT/<branch>/ai-digital-life" && pnpm install && pnpm run setup:worktree && cargo check --workspace
```

- `setup:worktree`：启用仓库级 git hooks（`core.hooksPath=.githooks`）并为**当前工作树**建 CodeGraph 索引（`ai-digital-life/.codegraph/`，已 gitignore，各工作树独立、不跟随分支切换自动更新；重建直接删目录后重跑）。

- 目录名用分支名，kebab-case、≤ 3 个词、无斜杠。
- 只放 sibling 目录；根 `.gitignore` 里的 `.worktrees/` 是历史遗留，不使用。
- 代价：全新 `target/`（冷构建）+ 新 `node_modules`（pnpm store 命中，较快）。
- ignored 文件不跟随（`.env`、`target/`、`node_modules/`）。启动失败先查 `.env`。
- App 界面创建的工作树同样按分支名生成目录，视为**一次性现场**，不参与槽位轮换。

### 3.3 复用改造（默认路径：旧分支已收口，改造为新分支）

四道门槛，缺一不可：

| 门槛 | 验证 | 通过 |
|------|------|------|
| G1 槽位空闲 | 查 `.sessions` 同 `slot` 且 `status: active` | 无 |
| G2 无运行实例 | 见下方命令 | 输出中无本槽位 exe |
| G3 工作区干净 | `git -C "$WT" status --porcelain` | 空 |
| G4 旧分支已收口 | `git -C "$WT" branch --merged main` | 旧分支在列，或用户明确放弃 |

```powershell
Get-Process ai-digital-life -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path
```

任一不通过 → 改走 §3.2，禁止自行 stash / clean / 强切。

七步操作：

```bash
WT="$WT_ROOT/slot-1"
OLD=$(git -C "$WT" branch --show-current)          # 1 记录旧分支
git -C "$WT" status --porcelain                    # 2 确认干净（G3）
git -C "$WT" fetch origin --prune                  # 3 取远端（仅为同步，不用于起分支）
git -C "$WT" switch -c <new-branch> main           # 4 从本地 main 原地建新分支
git -C "$WT" branch --show-current                 # 5 校验分支名
git -C "$WT" diff --stat "$OLD".."<new-branch>" -- \
  ai-digital-life/Cargo.lock ai-digital-life/pnpm-lock.yaml \
  ai-digital-life/Cargo.toml ai-digital-life/.cargo/config.toml   # 6 依赖是否变化
# 7 更新注册表：branch=<new>，history 追加 $OLD，status=active
```

失败回滚：`git -C "$WT" switch "$OLD"`（新分支 ref 保留，未提交改动不会自动带走）。

若 App 正打开该槽位：优先用 App 内“新建分支/切换分支”（底层即 `create_git_branch`，脏则先 stash），或在 CLI 切换后于 App 内刷新工作区；否则 App 的文件树与快照已过期。

### 3.4 切换后必检（复用特有）

| 风险 | 检查 | 处置 |
|------|------|------|
| 依赖变了没重装 | 第 6 步含 `pnpm-lock.yaml` | `pnpm install` |
| 依赖变化引发大面积重编 | 第 6 步含 `Cargo.lock` / `Cargo.toml` | 正常现象，重跑 `cargo check` |
| **跑了 stale 可执行文件** | 是否直接运行 `target/debug/*.exe` | 禁止；先 `cargo build` 或 `pnpm run dev:tauri` |
| 旧分支未跟踪残留 | `git -C "$WT" clean -nd`（干跑，不含 ignored） | 列给用户，由用户决定 |
| 旧分支 stash 债 | `git -C "$WT" stash list` | 记入注册表 `notes` |
| CodeGraph 索引仍是旧分支 | `ai-digital-life/.codegraph` 存在且刚切过分支 | 删掉该目录后重跑 `pnpm --dir ai-digital-life run setup:worktree`（索引不自动跟随） |

---

## 4. 开发中的硬约束

### 4.1 独占契约文件（同一时刻只允许一个会话改）

改动前先在注册表 `contractFiles` 登记，并尽快提交。

| 类别 | 文件（未注明者相对 `ai-digital-life/`） |
|------|------|
| 共享类型与 IPC | `frontend/src/shared/**`、`frontend/src/kernel/**`、`frontend/src/tauri-bridge/**`、`frontend/src/preview-bridge/**`、`frontend/src/mock/**`、`frontend/src/httpBridge.ts` |
| Store | `frontend/src/app/stores/slices/**`、`frontend/src/app/stores/actions/**`、`frontend/src/app/stores/StoreState.ts` |
| i18n | `frontend/src/app/i18n/zh-CN/**`、`frontend/src/app/i18n/en-US/**` |
| 依赖与构建 | `Cargo.toml`、`Cargo.lock`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/**` |
| 治理 | 仓库根 `AGENTS.md`、`RULES.md`、`SKILLS.md`、`.agents/rules/**`、本手册 |

可安全并行：`frontend/src/app/features/<feature>/**`、`frontend/src/app/regions/right-panel/panels/**`（同一文件不可并行）、`frontend/src/styles/regions/**`、`ai-digital-life/crates/<单个 crate>/**`、`docs/**`（按文件切）。

新增 i18n key 归属占用 i18n 文件的会话统一收口；未占用者先写无文案实现，把 key 需求记在 `notes`。

### 4.2 构建与运行

| 项 | 事实 | 规则 |
|----|------|------|
| `target/` | 每槽独立 | 禁止共享 `CARGO_TARGET_DIR`：共享后 exe 路径相同，dev 脚本（`killProcessesByName` 按绝对路径过滤）会跨槽互杀，且构建退化为串行 |
| `node_modules/` | 每槽独立，pnpm store 全局共享 | lock 变了才重装 |
| 运行数据 | dev 脚本按槽位派生 identifier（`com.ai-digital-life.app.<槽位目录名>`，可用 `ADL_INSTANCE_ID` 覆盖），数据根、WebView2 profile、locator、凭证回退目录、浏览器模式 ad-server 数据都随之隔离（`<worktree>/ai-digital-life/target/adl-instance/`） | 隔离只覆盖 `pnpm dev*` 入口；直接跑 `target/debug/*.exe` 或主工作树仍共 `%APPDATA%\com.ai-digital-life.app`；OS 密钥环条目按 service 名存系统凭据管理器，仍跨槽共享 |
| 前端端口 | 每个工作树自动取**稳定端口**：主工作树 5173、`slot-N` → 5173+N；被占则顺延到下一个空闲端口。`ADL_PORT` / `PORT` 可显式覆盖，但**必须空闲**（占用即硬失败）。窗口只加载本工作树的 vite（`strictPort` + 实例令牌 `GET /__adl_dev_instance__` 校验）。`dev:tauri` / `dev:browser` / `dev:preview` 同一规则；裸 `pnpm frontend:dev` 不经过启动器，`strictPort` 下占用即失败（并行请走 `dev:browser`） | 无需手工固定端口；一个窗口"改了没变化"时先核对 `[adl-run] url=` 与本工作树的端口 |
| 内置 Rust server | 绑定 `127.0.0.1:0` | 无固定端口冲突 |
| 实例定位 | `pnpm run dev:status` 扫描 5173..5182，打印端口 / 实例令牌前缀 / PID | 与启动行 `[adl-run] … token=xxxxxxxx` 对号；「窗口连的是谁」先跑它再怀疑代码 |

并行验证首选 `pnpm run dev:browser`；需要桌面实例时各槽可直接跑 `pnpm run dev:tauri`，启动行 `[adl-run] instance=…` 是该槽的数据根身份，`[adl-run] url=…` 是该槽的前端地址。多工作树同时跑桌面实例互不干扰（标识/数据根/WebView2 profile/端口全隔离）。

**在 App 内嵌终端里启动另一个工作树**也是可以的：桌面应用进程刻意不带 `ADL_PORT`/`PORT`/`ADL_DEV_TOKEN`（前两者是 vite 的配置，令牌只有 vite 需要），启动器启动前还会清理继承来的 `ADL_*` 并按本工作树重新注入端口与 locator。因此父实例的端口不会串进内嵌终端，无需手工 `Remove-Item Env:ADL_PORT`。

### 4.3 验证

```bash
cd "<worktree>/ai-digital-life"
node --test scripts/instance-id.test.mjs   # 实例隔离逻辑
pnpm run frontend:typecheck && pnpm run frontend:test
pnpm run cargo:test
pnpm run check:all        # 提交前与合并后都跑（含前端 check:full；门禁真源见 .agents/rules/quality-gates.md）
```

---

## 5. 提交、合并、保留

### 5.1 提交

- 只在自己的槽位、自己的分支提交；`git add` 前先 `git status`。
- 格式：`type(scope): summary`，scope ∈ `core/frontend/rust/stores/browser/terminal/ipc/docs/deps`。
- **禁止在分支工作树内写 `.workbuddy/memory/**`**：该目录被 git 跟踪，多分支并行必然冲突。分支结论写入注册表 `notes` 或提交信息，记忆只在主工作树写。

### 5.2 合并（主工作树执行，一次一个分支）

```bash
git -C "$ROOT" merge --ff-only <branch>
pnpm --dir "$ROOT/ai-digital-life" run check:all
```

- 永不自动 push。
- 合并前主工作树需干净（未提交改动会让 ff 合并被拒）。
- `--ff-only` 失败 = 已分叉 → 交回主工作树裁决，禁止在分支上 `merge main` 后继续开发。
- 合并后必须跑 `check:all`：这是唯一能发现**语义冲突**的环节。

### 5.3 保留与清理

| 场景 | 动作 |
|------|------|
| 分支已合并 | 保留目录，注册表 `status: merged`，槽位回到空闲池 |
| 分支被放弃 | 保留目录，`status: done`，`notes` 写明原因 |
| 会话结束 | 只更新注册表，不动目录 |

保留的目的是保住 `target/` 与 `node_modules/`。只有三种情况清理：用户明确要求；槽位 `target` 超 30 GB 且空闲；目录已 `prunable`。

```bash
powershell -NoProfile -File "$ROOT/ai-digital-life/.cargo/clean-target.ps1"          # 只清当前槽位
powershell -NoProfile -File "$ROOT/ai-digital-life/.cargo/clean-target.ps1" -WhatIf   # 干跑
git -C "$ROOT" worktree remove "$WT_ROOT/slot-1"                                     # 用户批准后
git -C "$ROOT" worktree prune
```

磁盘预算（实测 2026-10-24：`E:` 余 118 GB）：并发槽位 ≤ 2，单槽 `target` ≤ 30 GB，新建工作树前余量 ≥ 60 GB。

---

## 6. 会话注册表

位置 `$WT_ROOT/.sessions/<session>.json`（目录不存在先 `mkdir -p`）；**只写自己的文件，永不改别人的**。槽位占用以“存在 `status: active` 且 `slot` 相同”为判据。

```json
{
  "session": "terminal-history",
  "mode": "reused-slot",
  "slot": "slot-1",
  "worktree": "E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1",
  "branch": "terminal-history",
  "history": ["browser-toolbar-fix"],
  "owner": "agent-session-2026-10-24-1520",
  "scope": ["ai-digital-life/frontend/src/app/features/terminal/**"],
  "contractFiles": [],
  "startedAt": "2026-10-24T15:20:00+08:00",
  "status": "active",
  "notes": "旧分支已合并，target 完整"
}
```

`mode` = `new-worktree` / `reused-slot`；`history` 记录该槽位承载过的分支；`status` 状态机 `active → paused → merged / done`（后两者均保留目录）。

---

## 7. 异常对照

| 现象 | 根因 | 动作 | 禁止 |
|------|------|------|------|
| `branch 'X' is already checked out at '<path>'` | 分支被别的工作树占用 | 换分支或聚焦既有目录 | `--force` 抢占 |
| `index.lock exists` | 并发 git 操作 | 只操作自己槽位，报告用户 | 删 `.git/index.lock` |
| `switch` 报本地改动会被覆盖 | 工作区脏（G3 未过） | 提交或 stash 后再切 | `--discard-changes` |
| 构建很快通过但行为是旧的 | stale 产物 | 先 `cargo build` 再运行，核对 `git log -1` | 跑旧 exe 下结论 |
| 切换后编译量巨大 | lock / profile / 工具链变化 | 正常，重跑 `cargo check` | 删 `Cargo.lock` |
| `database is locked` / 配置被覆盖 | 第二个 Tauri 实例 | 关掉多余实例 | 删 AppData 里的 DB |
| 端口被占用 | 他人 dev server | 未显式指定时启动器自动顺延；显式 `ADL_PORT` 被占则报错并按提示换端口 | 杀陌生进程 |
| 改了代码但窗口毫无变化 | 端口串台：窗口的 devUrl 指向**另一个工作树**的 dev server（历史隐患：vite 静默顺延 + 裸 HTTP 探活被对方满足） | 核对 `[adl-run] url=` 与端口归属；现行 `strictPort` + 实例令牌已使其硬失败而非静默 | 重装依赖 / 怀疑 HMR |
| 在 App 内嵌终端启动另一工作树报 `Port 5173 ... already in use` | 旧版启动器把 `ADL_PORT`/`PORT` 注入桌面应用进程，内嵌终端继承后被误当成本次显式指定端口 | 现行启动器不再给应用进程注入端口（并在启动前清理继承的 `ADL_*`）；用打了补丁的启动器重启父实例即可 | 手工 `Remove-Item Env:ADL_PORT` 当常规解法 |
| 在同一工作树的内嵌终端里再跑 `dev:tauri`，宿主窗口消失 | 启动器按 exe 绝对路径清理锁文件的旧实例，同一槽位的新会话会 `taskkill` 掉正在托管该终端的父实例 | 确认在**目标工作树**目录下执行（跨槽不会互杀）；需要重启同槽实例时从外部终端操作 | 把"启动即闪退"当应用 bug |
| 启动即被杀 | 同槽重复启动或共享 target | 确认唯一实例，检查 `CARGO_TARGET_DIR` | 反复重启 |
| 构建产物消失 | 有人跑了全量 `cargo clean` | 重建，告知用户 | 改清理脚本 |
| `could not create work tree dir` | 目标目录已存在 | `git worktree prune` 后确认归属 | `rm -rf` 未知目录 |
| 合并后异常但无文本冲突 | 语义冲突 | 回退合并，按 §4.1 重划领地 | 在合并提交上打补丁 |

---

## 8. 禁止事项

1. 两个会话进入同一工作树（含“只读看一眼”）。
2. 跨工作树直接编辑文件；协作只走“提交 + 合并”。
3. 在非自己专属目录用破坏性命令。
4. 在分支工作树写 `.workbuddy/memory/**`。
5. 共享 `CARGO_TARGET_DIR`，或同时开两个 Tauri debug 实例。
6. 未在 `contractFiles` 登记就改 §4.1 文件。
7. 把“顺手修别处”的改动塞进自己分支。
8. 未过 §3.3 门槛就强行复用槽位。
9. 未输出 `[ENV]` 快照就开始改代码。
10. 其余见 `AGENTS.md` 与 `.agents/rules/`，并行不豁免。

---

## 9. 收尾

```bash
WT="$WT_ROOT/slot-1"                # 换成自己的槽位
git -C "$WT" status --porcelain     # 干净，或已明确告知遗弃内容
# 更新注册表：status=merged|done，notes 写遗留项与下一位复用者注意事项
# 报告：槽位、分支、变更范围、验证结果、待合并事项
```

目录默认保留，清理需用户明确要求。

---

## 附录：与既有实现映射

| 能力 | 位置 |
|------|------|
| 工作树路径公式与增删 | `ai-digital-life/crates/workspace/src/git/git_worktree.rs`（`sibling_worktree_dir`、`ensure_branch_worktree`、`remove_worktree`） |
| 原地建分支并切换（复用底层） | `ai-digital-life/crates/workspace/src/git/git_branch.rs`（`create_git_branch`、`switch_git_branch`、`adl-auto-stash`） |
| 分支子卡片 | `ai-digital-life/frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx`、`stores/actions/gitBranchActions.ts` |
| 设计边界（ignored 不跟随、不自动 push） | `docs/superpowers/specs/2026-10-15-git-worktree-design.md` |
| 磁盘治理 | `ai-digital-life/.cargo/clean-target.ps1`、`ai-digital-life/AGENTS.md#磁盘空间管理` |

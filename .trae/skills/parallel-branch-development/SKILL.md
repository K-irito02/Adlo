---
name: parallel-branch-development
description: 多会话 / 多 agent 并行开发本仓库时使用：开工环境自检、新建或复用分支工作树、执行隔离与保留约定。用户要求并行开发、开新分支工作树、复用旧工作树，或同时运行多个开发会话时加载。
agent_created: true
---

# 并行分支开发

> 仓库：`E:\AI-DIGITAL-LIFE\SourceWorkspace`　｜　模型：**一分支 = 一工作树 = 一会话**
>
> 本技能是并行开发流程的**唯一真源**。
> 用法：开工先读 §1–§2，动手前读 §3，提交前读 §4–§5，报错先查 §7。
> 真相优先级：`git` 实测 > `.sessions` 注册表 > 本技能示例 > 目录名。

## 0. 章节路由

| 要做的事                               | 去                                               |
| -------------------------------------- | ------------------------------------------------ |
| 用户调用本技能，要开始并行开发         | §3 交互流程（列工作树 → 用户选择 → 自检 → 通知） |
| 判断我在哪、能不能开工                 | §2 开工自检                                      |
| 新建工作树分支                         | §3.1                                             |
| 复用已存在的某个工作树分支             | §3.2                                             |
| 特批：变更工作树绑定的分支（默认禁止） | §3.3                                             |
| 改代码、跑构建、起应用                 | §4 硬约束                                        |
| 提交、合并、收尾                       | §5 / §9                                          |
| 报错                                   | §7 异常对照                                      |

---

## 1. 概念与不变量

| 术语     | 含义                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| 主工作树 | `E:/AI-DIGITAL-LIFE/SourceWorkspace`，常驻 `main`，只做集成与全量验证                      |
| 工作树   | git worktree：独立文件目录，共享对象库（**从不重复克隆**）；每个工作树**固定绑定一条分支** |
| 注册表   | `SourceWorkspace-worktrees/.sessions/<session>.json`，在仓库外，不进 git                   |

三条不变量：

1. 一个目录同一时刻只属于一个会话、固定承载一条分支；**没有用户批准，不得变更工作树绑定的分支名称**。
2. 未探测环境不动手；探测结果必须能贴给用户。
3. 破坏性命令（`reset --hard`、`clean -fdx`、`rm -rf`、`worktree remove --force`）禁止在非自己专属目录内使用。

**为什么保留工作树**：`target/` 与 `node_modules/` 可随工作树保留——本仓 `target` 大头是依赖产物，冷构建代价远高于增量。但收益有条件：`Cargo.lock`、`Cargo.toml` profile、`.cargo/config.toml`、工具链任一变化都会让依赖层失效，退化为接近冷构建。新分支 = 新工作树（全新 `target/` 冷构建 + 新 `node_modules/`）；已存在的工作树固定服务于其绑定分支，并行互不干扰。

---

## 2. 开工自检（ENV PROBE）

每次进入一个工作树环境第一件事。任一项不通过 → 停止并报告，禁止自行“修环境”。

> **顺序：先快照，后探索。** 在输出 `[ENV]` 并经 §3 选定工作树之前，只允许列目录/文件清单、读 `AGENTS.md`/技能/配置；不得读取业务源码。选定后所有读取、编辑与命令一律以该工作树的绝对路径为准。

```powershell
$ROOT = "E:/AI-DIGITAL-LIFE/SourceWorkspace"
$WT_ROOT = "$ROOT-worktrees"

git rev-parse --show-toplevel                      # 1 我在哪个目录
git branch --show-current                          # 2 我在哪条分支（空 = detached）
git worktree list --porcelain                      # 3 全仓工作树与分支占用
Get-ChildItem "$WT_ROOT/.sessions" -ErrorAction SilentlyContinue  # 4 谁占着哪个工作树
git status --porcelain                             # 5 是否干净
git log --oneline -1                               # 6 我在哪个提交
git rev-list --left-right --count main...HEAD      # 7 相对本地 main 的落后/领先
git config --get core.hooksPath                    # 8 本地门禁是否启用（期望 .husky）
Test-Path -LiteralPath "adlo/.codegraph"  # 9 CodeGraph 索引是否就绪（每工作树一份）
pnpm --dir adlo run worktree:env        # 10 依赖是否落后（deps: ok|stale|missing）
```

> 本仓在 Windows + PowerShell 7 下执行，命令块均为 PowerShell 语法（`$` 变量、`Test-Path`、`Get-ChildItem`）；不要转写成 bash。

| #   | 通过标准                        | 不通过时                                                          |
| --- | ------------------------------- | ----------------------------------------------------------------- |
| 1   | 是 `$ROOT` 或 `$WT_ROOT/<name>` | 不认识的路径 → 不改任何文件                                       |
| 2   | 非空，且与注册表 `branch` 一致  | detached 或与登记不符 → 停                                        |
| 3   | 本分支只出现一次，且是当前路径  | 出现在别处 → 分支已被占用                                         |
| 4   | 当前目录无他人 `status: active` | 有 → 换工作树或等待                                               |
| 5   | 空，或改动全部属于本会话        | 来源不明的改动 → 停，禁止清理                                     |
| 6/7 | 清楚自己的基线落后多少          | 落后较多 → 先 `merge --ff-only main`                              |
| 8   | 输出 `.husky`                   | 未启用 → `pnpm --dir adlo run setup:worktree`（仓库级，一处即可） |
| 9   | 目录存在                        | 缺失 → 同上（`codegraph init`，索引不入库）                       |
| 10  | `deps` 为 `ok`                  | `stale`/`missing` → 在对应树跑 `pnpm install`（根与 `adlo/` 各一次） |

> `worktree:env` 在他人 `active` 会话占用时退出码 2；确需共享须用户批准后加 `--allow-shared`。

输出环境快照块（**没有快照视为未开工**）。固定 11 行：一项一行，键用英文冒号对齐（键宽 8、前后各一空格），未知值写 `—`，禁止把多项挤进一行。首行 `[ENV]` 独占一行，保留可 grep 标记：

```text
[ENV]
  toplevel : <路径>                                # #1 我在哪个目录
  branch   : <分支> @ <短 SHA>                     # #2 在哪条分支 / #6 在哪个提交
  base     : main 落后 <N> / 领先 <M>              # #7 相对本地 main
  dirty    : <文件数>                              # #5 是否干净
  slot     : <目录名|—> / mode : <new-worktree|existing-worktree|main-worktree>
  others   : <无|占用当前目录的 active 会话>        # #3 分支占用 / #4 会话占用
  instance : <none|运行中的 exe 路径（注明归属工作树）>
  deps     : <ok|stale|missing>                    # 锁文件 vs 已安装依赖
  hooks    : <ok|missing> / graph : <ok|missing>   # #8 本地门禁 / #9 索引是否就绪
  registry : <session>.json|missing                # 本会话注册表是否已写入 .sessions/
```

示例：

```text
[ENV]
  toplevel : E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1
  branch   : slot-1 @ 95eefdaa
  base     : main 落后 0 / 领先 0
  dirty    : 0
  slot     : slot-1 / mode : existing-worktree
  others   : 无
  instance : E:/AI-DIGITAL-LIFE/SourceWorkspace/adlo/target/debug/adlo.exe（归属主工作树，slot-1 无实例）
  deps     : ok
  hooks    : ok / graph : ok
  registry : settings-version-cleanup.json
```

> `registry` 为 `missing` 时**不算开工完成**：先按 §6 在 `$WT_ROOT/.sessions/` 写入本会话文件（只写自己的），再通知用户可以开始开发。

> `pnpm --dir adlo run worktree:env` 在 `graph : missing` / `hooks : missing` 时会额外打印 `[worktree:env] WARN`。先运行 `pnpm --dir adlo run setup:worktree`（仓库根）补齐 hooks 与 CodeGraph 索引，再进入源码探索；不要带着缺失索引开始 P0。

读完 §2 后必须进入 §3 交互流程（先列表、再让用户选）；**禁止跳过用户选择直接定目录开工**。

---

## 3. 交互流程（每次调用必走）

### 3.0 五步走

1. 在当前目录执行 §2 ENV PROBE，输出 `[ENV]` 快照。
2. **在输出正文中列出全仓工作树对照表**（路径、分支、与本地 `main` 的对齐、dirty、会话占用）：运行 `pnpm --dir adlo run worktree:env -- --all`，直接贴输出的 `[WORKTREES]` 块，不要手工循环 `git rev-list`。

   | 工作树                               | 分支       | 落后 main | 领先 main | 会话占用                          |
   | ------------------------------------ | ---------- | --------- | --------- | --------------------------------- |
   | `E:/AI-DIGITAL-LIFE/SourceWorkspace` | `main`     | 0         | 0         | —                                 |
   | `…/SourceWorkspace-worktrees/<name>` | `<branch>` | N         | M         | active 会话或无（查 `.sessions`） |

3. 询问用户二选一（用提问工具或正文提问；**未获答复不得继续**，选错目录会在错误分支上提交，造成跨树污染）：
   - A：新建工作树分支 → 走 §3.1；
   - B：复用已存在的某个工作树分支 → 走 §3.2。
4. 按用户选择建好 / 切好环境后，在**目标工作树目录**重跑 §2 自检（含 `registry` 行：写入本会话 `.sessions/<session>.json`）；逐项通过后，明确通知用户“可以在该工作树分支下开始开发了”，方可动手改代码。
5. 全程遵守分支固定绑定：无用户批准不得变更任何工作树的分支名称（特批见 §3.3）。

### 3.1 新建工作树分支

先追问两项（未获答复不得建树）：分支名称（kebab-case、≤ 3 个词、无斜杠）；对齐基准（分支及提交节点，**默认本地 `main` 最新提交**）。

```powershell
git -C "$ROOT" worktree add "$WT_ROOT/<branch>" -b <branch> <base>   # <base> 默认 main
git -C "$WT_ROOT/<branch>" status --porcelain                        # 必须为空
cd "$WT_ROOT/<branch>/adlo" && pnpm install && pnpm run setup:worktree && pnpm run cargo:check
```

- `setup:worktree`：启用仓库级 git hooks（`core.hooksPath=.husky`）并为**当前工作树**建 CodeGraph 索引（`adlo/.codegraph/`，已 gitignore，各工作树独立、不跟随分支切换自动更新；重建直接删目录后重跑）。

- **基线默认用本地 `main`，不要用 `origin/main`**：本仓约定永不自动 push，远端可能落后于本地 `main`，从 `origin/main` 起分支会丢掉本地提交。用户指定了其他对齐分支及提交节点时，以用户指定为准。
- 目录只放 sibling 目录；根 `.gitignore` 里的 `.worktrees/` 是历史遗留，不使用。
- 代价：全新 `target/`（冷构建）+ 新 `node_modules`（pnpm store 命中，较快）。
- ignored 文件不跟随（`.env`、`target/`、`node_modules/`）。启动失败先查 `.env`。
- App 界面创建的工作树同样按分支名生成目录，视为**一次性现场**。
- 建树后登记注册表（`mode=new-worktree`），将会话工作环境切换到新工作树目录，按 §3.0 第 4 步自检并通知。

### 3.2 复用已存在的某个工作树分支

1. 确认三项：该分支在全仓只出现一次（即该工作树）；无他人 `status: active` 会话占用；`git status --porcelain` 为空（或改动全部归属明确且用户知情；有疑问先停下报告，不得自行清理）。
   - 若 `worktree:env` 的 `others` 标出 `(active, Nd stale)`（最后写入超过 24h），先跑 `pnpm --dir adlo run worktree:sessions -- --stale-only` 核对条目并让用户一次性确认；确认后执行 `--reap --older-than 3d` 把 stale 项改为 `paused`（之后不再重复询问），再只写自己的 `.sessions/<session>.json`（不改他人文件），并在 `notes` 记录接管来源。
2. 将会话工作环境切换到该工作树目录，在该目录重跑 §2 ENV PROBE。
3. 逐项通过后，明确通知用户“可以在该工作树分支下开始开发了”。
4. 禁止动作：切过去之后换分支（`switch -c` / `switch <other>`）、把别处改动带入。确需换分支 → 走 §3.3 特批。

### 3.3 特批：变更工作树绑定的分支（默认禁止）

没有用户明确批准不得执行。获批后仍须过四道门槛，缺一不可：

| 门槛              | 验证                                     | 通过                       |
| ----------------- | ---------------------------------------- | -------------------------- |
| G1 工作树无人占用 | 查 `.sessions` 同目录且 `status: active` | 无                         |
| G2 无运行实例     | 见下方命令                               | 输出中无本工作树 exe       |
| G3 工作区干净     | `git -C "$WT" status --porcelain`        | 空                         |
| G4 旧分支已收口   | `git -C "$WT" branch --merged main`      | 旧分支在列，或用户明确放弃 |

```powershell
Get-Process adlo -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path
```

任一不通过 → 改走 §3.1 新建，禁止自行 stash / clean / 强切。

获批后的操作：

```powershell
$WT = "$WT_ROOT/<name>"
$OLD = $(git -C "$WT" branch --show-current)          # 1 记录旧分支
git -C "$WT" status --porcelain                       # 2 确认干净（G3）
git -C "$WT" fetch origin --prune                     # 3 取远端（仅为同步，不用于起分支）
git -C "$WT" switch -c <new-branch> main              # 4 从本地 main 原地建新分支（用户指定了其他基准则用指定基准）
git -C "$WT" branch --show-current                    # 5 校验分支名
git -C "$WT" diff --stat "$OLD..<new-branch>" -- `  # 6 依赖是否变化
  adlo/Cargo.lock adlo/pnpm-lock.yaml `
  adlo/Cargo.toml adlo/.cargo/config.toml
# 7 更新注册表：branch=<new>，history 追加 $OLD，status=active
```

失败回滚：`git -C "$WT" switch "$OLD"`（新分支 ref 保留，未提交改动不会自动带走）。

若 App 正打开该工作树：优先用 App 内“新建分支/切换分支”（底层即 `create_git_branch`，脏则先 stash），或在 CLI 切换后于 App 内刷新工作区；否则 App 的文件树与快照已过期。

### 3.4 切换后必检

适用于 §3.3 特批换分支之后（“第 6 步”指 §3.3 的步骤 6）；§3.1 新建树没有第 6 步，依赖以 `pnpm install` 结果为准。

| 风险                      | 检查                                           | 处置                                                                    |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| 依赖变了没重装            | 第 6 步含 `pnpm-lock.yaml`                     | `pnpm install`                                                          |
| 依赖变化引发大面积重编    | 第 6 步含 `Cargo.lock` / `Cargo.toml`          | 正常现象，重跑 `pnpm run cargo:check`                                   |
| **跑了 stale 可执行文件** | 是否直接运行 `target/debug/*.exe`              | 禁止；先 `pnpm run cargo:build` 或 `pnpm run dev:tauri`                 |
| 旧分支未跟踪残留          | `git -C "$WT" clean -nd`（干跑，不含 ignored） | 列给用户，由用户决定                                                    |
| 旧分支 stash 债           | `git -C "$WT" stash list`                      | 记入注册表 `notes`                                                      |
| CodeGraph 索引仍是旧分支  | `adlo/.codegraph` 存在且刚切过分支             | 删掉该目录后重跑 `pnpm --dir adlo run setup:worktree`（索引不自动跟随） |

---

## 4. 开发中的硬约束

### 4.1 独占契约文件（同一时刻只允许一个会话改）

改动前先在注册表 `contractFiles` 登记，并尽快提交。

| 类别           | 文件（未注明者相对 `adlo/`）                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共享类型与 IPC | `frontend/src/shared/**`、`frontend/src/kernel/**`、`frontend/src/tauri-bridge/**`、`frontend/src/preview-bridge/**`、`frontend/src/mock/**`、`frontend/src/httpBridge.ts` |
| Store          | `frontend/src/app/stores/slices/**`、`frontend/src/app/stores/actions/**`、`frontend/src/app/stores/StoreState.ts`                                                         |
| i18n           | `frontend/src/app/i18n/zh-CN/**`、`frontend/src/app/i18n/en-US/**`                                                                                                         |
| 依赖与构建     | `Cargo.toml`、`Cargo.lock`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/**`                              |
| 工具脚本       | `scripts/**`、`frontend/scripts/**`、`.husky/**`、`docs/root-cause-to-close/_template.md`                                                                                   |
| 治理           | 仓库根 `AGENTS.md`、`RULES.md`、`SKILLS.md`、`.agents/rules/**`、本技能（`.agents/skills/parallel-branch-development/SKILL.md`，真源）                                     |

可安全并行：`frontend/src/app/features/<feature>/**`、`frontend/src/app/regions/right-panel/panels/**`（同一文件不可并行）、`frontend/src/styles/regions/**`、`adlo/crates/<单个 crate>/**`、`docs/**`（按文件切）。

新增 i18n key 归属占用 i18n 文件的会话统一收口；未占用者先写无文案实现，把 key 需求记在 `notes`。

### 4.2 构建与运行

| 项               | 事实                                                                                                                                                                                                                                                                                                                                                                                              | 规则                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `target/`        | 每工作树独立                                                                                                                                                                                                                                                                                                                                                                                      | 禁止共享 `CARGO_TARGET_DIR`：共享后 exe 路径相同，dev 脚本（`killProcessesByName` 按绝对路径过滤）会跨工作树互杀，且构建退化为串行                           |
| `node_modules/`  | 每工作树独立，pnpm store 全局共享                                                                                                                                                                                                                                                                                                                                                                 | lock 变了才重装                                                                                                                                              |
| 运行数据         | dev 脚本按工作树派生 identifier（`com.adlo.app.<工作树目录名>`，可用 `ADL_INSTANCE_ID` 覆盖），数据根、WebView2 profile、locator、凭证回退目录、浏览器模式 adl-server 数据都随之隔离（`<worktree>/adlo/.adl-instance/`，`cargo clean` 不碰）                                                                                                                                                                    | 隔离只覆盖 `pnpm dev*` 入口；直接跑 `target/debug/*.exe` 或主工作树仍共 `%APPDATA%\com.adlo.app`；OS 密钥环条目按 service 名存系统凭据管理器，仍跨工作树共享 |
| 前端端口         | 每个工作树自动取**稳定端口**：主工作树 5173、`slot-N` → 5173+N；被占则顺延到下一个空闲端口。`ADL_PORT` / `PORT` 可显式覆盖，但**必须空闲**（占用即硬失败）。窗口只加载本工作树的 vite（`strictPort` + 实例令牌 `GET /__adl_dev_instance__` 校验）。`dev:tauri` / `dev:browser` / `dev:preview` 同一规则；裸 `pnpm frontend:dev` 不经过启动器，`strictPort` 下占用即失败（并行请走 `dev:browser`） | 无需手工固定端口；一个窗口"改了没变化"时先核对 `[adl-run] url=` 与本工作树的端口                                                                             |
| 内置 Rust server | 绑定 `127.0.0.1:0`                                                                                                                                                                                                                                                                                                                                                                                | 无固定端口冲突                                                                                                                                               |
| 实例定位         | `pnpm run dev:status` 扫描 5173..5182，打印端口 / 实例令牌前缀 / PID                                                                                                                                                                                                                                                                                                                              | 与启动行 `[adl-run] … token=xxxxxxxx` 对号；「窗口连的是谁」先跑它再怀疑代码                                                                                 |

并行验证首选 `pnpm run dev:browser`；需要桌面实例时各工作树可直接跑 `pnpm run dev:tauri`，启动行 `[adl-run] instance=…` 是该工作树的数据根身份，`[adl-run] url=…` 是该工作树的前端地址。多工作树同时跑桌面实例互不干扰（标识/数据根/WebView2 profile/端口全隔离）。

**在 App 内嵌终端里启动另一个工作树**也是可以的：桌面应用进程刻意不带 `ADL_PORT`/`PORT`/`ADL_DEV_TOKEN`（前两者是 vite 的配置，令牌只有 vite 需要），启动器启动前还会清理继承来的 `ADL_*` 并按本工作树重新注入端口与 locator。因此父实例的端口不会串进内嵌终端，无需手工 `Remove-Item Env:ADL_PORT`。

### 4.3 验证

```powershell
cd "<worktree>/adlo"
node --test scripts/instance-id.test.mjs   # 实例隔离逻辑
pnpm run frontend:typecheck && pnpm run frontend:test
pnpm run cargo:test
pnpm run check:all        # 提交前与合并后都跑（含前端 check:full；门禁真源见 .agents/rules/quality-gates.md）
```

---

## 5. 提交、合并、保留

### 5.1 提交

- 只在自己的工作树、自己的分支提交；`git add` 前先 `git status`。
- 格式：`type(scope): summary`，scope ∈ `core/frontend/rust/stores/browser/terminal/ipc/docs/deps`。
- **禁止在分支工作树内写入多分支共享且被 git 跟踪的记忆/笔记类目录**（多分支并行必然冲突）。分支结论写入会话注册表 `notes` 或提交信息，长期记忆只在主工作树维护。

### 5.2 合并（主工作树执行，一次一个分支）

```powershell
git -C "$ROOT" merge --ff-only --quiet <branch>
pnpm --dir "$ROOT/adlo" run worktree:env -- --all   # deps 必须 ok；stale 先 pnpm install
# 快进到已在分支工作树跑过完整门禁的同一提交：主工作树跑 check:repo 即可
pnpm --dir "$ROOT/adlo" run check:repo
# 非快进，或无法证明该提交已门禁：完整跑
pnpm --dir "$ROOT/adlo" run check:all
```

- 大仓合并加 `--quiet`；摘要用 `git show --shortstat --oneline -1`。
- 永不自动 push（推送由用户执行或明确批准）。
- 合并前主工作树需干净（未提交改动会让 ff 合并被拒）。
- `--ff-only` 失败 = 已分叉 → 交回主工作树裁决，禁止在分支上 `merge main` 后继续开发。
- `--ff-only` 到已在分支工作树通过完整门禁的同一提交，不产生语义冲突：主工作树跑 `check:repo` + `worktree:env` 即可。非快进或没有门禁证据时，`check:all` 仍是唯一能发现语义冲突的环节，必须跑。
- **非快进合并顺序**（`--ff-only` 失败、main 已含其它提交）：
  1. `git -C "$ROOT" merge --no-ff <branch>`；
  2. 冲突先解决 `.agents` 源文件，再跑 `pnpm --dir "$ROOT/adlo" run agents:mirror` 同步 `.opencode` / `.trae`；依赖清单有变化时跑 `notices:generate`；
  3. `git commit` 完成 merge；
  4. 在 merge commit 上跑 `check:all`（未提交时跑会漏掉 pre-push 以 `origin/main` 为基线的差异检查）；
  5. 其它工作树 `git -C <slot> merge --ff-only main`；
  6. 双远程推送用 `pnpm --dir "$ROOT/adlo" run push:both -- main slot-1 slot-2`（第一个远程正常跑门禁，第二个远程同一批 SHA 用受控 `--no-verify`，脚本最后 `ls-remote` 校验两端 SHA）。

### 5.3 保留与清理

| 场景         | 动作                                                                  |
| ------------ | --------------------------------------------------------------------- |
| 分支已合并   | 保留目录，注册表 `status: merged`                                     |
| 分支被放弃   | 保留目录，`status: done`，`notes` 写明原因                            |
| 会话结束     | 只更新注册表，不动目录                                                |
| 只清产物     | `pnpm --dir adlo run worktree:disk -- --only <branch,…> --clean`（默认删 `target/` + `node_modules/`，保留 `.adl-instance`；其余开关见 `-- --help`） |
| 注册表 stale | `pnpm --dir adlo run worktree:sessions -- --reap --older-than 3d`     |

保留的目的是保住 `target/`、`node_modules/` 与 `adlo/.adl-instance/`（dev 实例 DB / WebView2 profile / locator，已移出 `target`，`cargo clean` 不再误删）。只有三种情况清理：用户明确要求；该工作树无 active 会话且 `target` 超 30 GB；目录已 `prunable`。

```powershell
pnpm --dir adlo run worktree:disk                              # 全仓体积报告（先看再删）
pnpm --dir adlo run worktree:disk -- --only main,slot-1        # 只看点名的工作树
pnpm --dir adlo run worktree:disk -- --only main,slot-1 --clean --dry-run  # 干跑
pnpm --dir adlo run worktree:disk -- --only main,slot-1 --clean            # 只清点名的树
pnpm --dir adlo run worktree:disk -- --current --clean         # 只清当前工作树产物
pwsh -NoProfile -File "adlo/.cargo/clean-target.ps1"           # 或：单树 + 30GB 阈值
pwsh -NoProfile -File "adlo/.cargo/clean-target.ps1" -WhatIf   # 干跑
git -C "$ROOT" worktree remove "$WT_ROOT/<name>"               # 用户批准后
git -C "$ROOT" worktree prune
# Windows 长路径（node_modules 深嵌套）致 remove 报 `Filename too long` 时（用户已批准删除）：
Remove-Item -LiteralPath "\\?\$WT_ROOT\<name>" -Recurse -Force # 整删后重跑 worktree prune
```

`clean-target.ps1` 先做进程预检（本工作树 `adlo.exe` / `adl-server.exe` 被占用 → 退出码 2），默认保留 `.adl-instance`；要连 dev 状态一起删加 `-IncludeInstanceState`（`worktree:disk` 对应 `--include-instance-state`）。`worktree:disk --clean` 属破坏性操作：按不变量 3，只在用户明确要求或本会话专属工作树内使用。

**清理别的工作树用 `--only`，不要切过去**：用户点名要清不是自己的树（例如主工作树的 `target`）时，在本会话目录执行 `--only <branch,…> --clean`；切到该树目录跑 `--current` 违反 §8.1。每次真实清理在 `<tree>/adlo/.adl-instance/clean-events.jsonl` 追加一行，报告 `cleaned` 列显示距上次清理的时长——某树显示 `just now` 说明下次构建是冷构建。

磁盘预算（实测 2026-10-24：`E:` 余 118 GB）：并发工作树 ≤ 2，单工作树 `target` ≤ 30 GB，新建工作树前余量 ≥ 60 GB。

---

## 6. 会话注册表

位置 `$WT_ROOT/.sessions/<session>.json`（目录不存在先 `New-Item -ItemType Directory -Force`）；**只写自己的文件，永不改别人的**。工作树占用以“存在 `status: active` 且目录相同”为判据。

登记/收口：`pnpm --dir adlo run worktree:session -- claim <name>` / `close <name> --status merged|done`；提交前 `check` 会拒绝分支不一致的活动会话。

```json
{
  "session": "terminal-history",
  "mode": "existing-worktree",
  "slot": "slot-1",
  "worktree": "E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1",
  "branch": "terminal-history",
  "history": ["browser-toolbar-fix"],
  "owner": "agent-session-2026-10-24-1520",
  "scope": ["adlo/frontend/src/app/features/terminal/**"],
  "contractFiles": [],
  "startedAt": "2026-10-24T15:20:00+08:00",
  "status": "active",
  "notes": "分支绑定固定，不换分支"
}
```

`mode` = `new-worktree` / `existing-worktree`；`slot` = 工作树目录名；`history` 记录该工作树承载过的分支（固定绑定下一般只有一条，特批换分支后追加）；`status` 状态机 `active → paused → merged / done`（后两者均保留目录）。

stale `active`（>24h 未更新）用 `pnpm --dir adlo run worktree:sessions -- --stale-only` 核对，`-- --reap --older-than 3d` 收口：脚本只把超阈值条目改为 `paused` 并追加 `notes`，不删文件。

写注册表文件必须显式 UTF-8 无 BOM（`[System.IO.File]::WriteAllText($p, $json, [System.Text.UTF8Encoding]::new($false))`）；禁止经 PowerShell 管道/重定向传文本（CJK 会被写成 `?`），见规则 `shell-encoding.md`。

---

## 7. 异常对照

| 现象                                                                   | 根因                                                                                                          | 动作                                                                                               | 禁止                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `branch 'X' is already checked out at '<path>'`                        | 分支被别的工作树占用                                                                                          | 聚焦既有工作树（§3.2），或换分支名新建                                                             | `--force` 抢占                             |
| 被要求在现有工作树上直接开新分支                                       | 分支固定绑定，无批准不得变更                                                                                  | 走 §3.1 新建，或走 §3.3 特批                                                                       | 自行 `switch -c` / `switch <other>`        |
| `index.lock exists`                                                    | 并发 git 操作 / 上次中断残留                                                                                  | 先等待 3–5 秒重试；仍存在则报告用户                                                                | 删 `.git/index.lock`                       |
| `switch` 报本地改动会被覆盖                                            | 工作区脏                                                                                                      | 提交或 stash 后再切                                                                                | `--discard-changes`                        |
| 构建很快通过但行为是旧的                                               | stale 产物                                                                                                    | 先 `pnpm run cargo:build` 再运行，核对 `git log -1`                                                | 跑旧 exe 下结论                            |
| 切换后编译量巨大                                                       | lock / profile / 工具链变化                                                                                   | 正常，重跑 `pnpm run cargo:check`                                                                  | 删 `Cargo.lock`                            |
| `cargo build` 报 `resource path binaries\adl-server-... doesn't exist` | 干净工作树未 stage sidecar（裸 cargo 不触发 Tauri 钩子）                                                      | 先 `pnpm run stage:sidecar`，或改用 `pnpm run cargo:build`                                         | 手搓空文件冒充 sidecar                     |
| `database is locked` / 配置被覆盖                                      | 第二个 Tauri 实例                                                                                             | 关掉多余实例                                                                                       | 删 AppData 里的 DB                         |
| 端口被占用                                                             | 他人 dev server                                                                                               | 未显式指定时启动器自动顺延；显式 `ADL_PORT` 被占则报错并按提示换端口                               | 杀陌生进程                                 |
| 改了代码但窗口毫无变化                                                 | 端口串台：窗口的 devUrl 指向**另一个工作树**的 dev server（历史隐患：vite 静默顺延 + 裸 HTTP 探活被对方满足） | 核对 `[adl-run] url=` 与端口归属；现行 `strictPort` + 实例令牌已使其硬失败而非静默                 | 重装依赖 / 怀疑 HMR                        |
| 在 App 内嵌终端启动另一工作树报 `Port 5173 ... already in use`         | 旧版启动器把 `ADL_PORT`/`PORT` 注入桌面应用进程，内嵌终端继承后被误当成本次显式指定端口                       | 现行启动器不再给应用进程注入端口（并在启动前清理继承的 `ADL_*`）；用打了补丁的启动器重启父实例即可 | 手工 `Remove-Item Env:ADL_PORT` 当常规解法 |
| 在同一工作树的内嵌终端里再跑 `dev:tauri`，宿主窗口消失                 | 启动器按 exe 绝对路径清理锁文件的旧实例，同一工作树的新会话会 `taskkill` 掉正在托管该终端的父实例             | 确认在**目标工作树**目录下执行（跨工作树不会互杀）；需要重启同工作树实例时从外部终端操作           | 把"启动即闪退"当应用 bug                   |
| 启动即被杀                                                             | 同工作树重复启动或共享 target                                                                                 | 确认唯一实例，检查 `CARGO_TARGET_DIR`                                                              | 反复重启                                   |
| 构建产物消失                                                           | 有人跑了全量 `cargo clean`                                                                                    | 重建，告知用户                                                                                     | 改清理脚本                                 |
| `could not create work tree dir`                                       | 目标目录已存在                                                                                                | `git worktree prune` 后确认归属                                                                    | `rm -rf` 未知目录                          |
| `worktree remove` 报 `Filename too long`                               | Windows 长路径（`node_modules` 深嵌套超 MAX_PATH）                                                            | `\\?\` 前缀整删（已批准）后重跑 `worktree prune`                                                   | 反复 `remove --force`                      |
| 合并后异常但无文本冲突                                                 | 语义冲突                                                                                                      | 回退合并，按 §4.1 重划领地                                                                         | 在合并提交上打补丁                         |

---

## 8. 禁止事项

1. 两个会话进入同一工作树（含“只读看一眼”）。
2. 跨工作树直接编辑文件；协作只走“提交 + 合并”。
3. 在非自己专属目录用破坏性命令。
4. 在分支工作树内写入多分支共享且被 git 跟踪的记忆/笔记类目录。
5. 共享 `CARGO_TARGET_DIR`，或同时开两个 Tauri debug 实例。
6. 未在 `contractFiles` 登记就改 §4.1 文件。
7. 把“顺手修别处”的改动塞进自己分支。
8. 未经用户批准变更工作树绑定的分支（擅自换分支会让其他会话的基线错位；包括未过 §3.3 特批门槛强行换分支）。
9. 未输出 `[ENV]` 快照就开始改代码。
10. 未列出工作树对照表、未获用户选择就进入开发目录（选错目录会在错误分支上提交）。
11. 其余见 `AGENTS.md` 与 `.agents/rules/`，并行不豁免。

---

## 9. 收尾

收尾判定（三项缺一不可）：

| #   | 条件                            | 验证                                                                                         |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| R1  | 当前工作树分支已合入本地 `main` | 在主工作树执行 `git merge --ff-only <branch>` 成功，或 `git branch --merged main` 已含该分支 |
| R2  | 本地 `main` 已推送到远程        | `git rev-list --left-right --count origin/main...main` 为 `0 0`                              |
| R3  | 当前工作树分支已推送到远程      | `git rev-list --left-right --count origin/<branch>...<branch>` 为 `0 0`                      |

推送由用户执行或明确批准，agent 永不自动 push。双远程一次推送用 `pnpm --dir adlo run push:both -- <分支…>`（门禁只跑一遍并校验两端 SHA）。R1–R3 全部满足即判为收尾，执行：

```powershell
$WT = "$WT_ROOT/<name>"                  # 换成自己的工作树
git -C "$WT" status --porcelain       # 干净，或已明确告知遗弃内容
# 更新注册表：status=merged|done，notes 写遗留项
# 报告：工作树、分支、变更范围、验证结果、推送状态（R1–R3）
```

目录默认保留，清理需用户明确要求。

---

## 附录：与既有实现映射

| 能力                                    | 位置                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 工作树路径公式与增删                    | `adlo/crates/workspace/src/git/git_worktree.rs`（`sibling_worktree_dir`、`ensure_branch_worktree`、`remove_worktree`） |
| 特批换分支底层（建分支并切换）          | `adlo/crates/workspace/src/git/git_branch.rs`（`create_git_branch`、`switch_git_branch`、`adl-auto-stash`）            |
| 分支子卡片                              | `adlo/frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx`、`stores/actions/gitBranchActions.ts`             |
| 设计边界（ignored 不跟随、不自动 push） | `docs/superpowers/specs/2026-10-15-git-worktree-design.md`                                                             |
| 磁盘治理                                | `adlo/.cargo/clean-target.ps1`、`adlo/AGENTS.md#磁盘空间管理`                                                          |

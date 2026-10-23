# Phase 3（兜底与回归）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 env 卸载/重装真实链路、6 份 agent runbook 并接入「复制给 agent」载荷、文档索引同步、全量回归与手动 QA 清单。

**Architecture:** 后端在 `adl-env` provider 增加 `uninstall`（复用 `HostedVersions::best_fallback` 回落语义）与 `adl-server /env/uninstall` 路由；前端把已存在的 `environmentUninstall/Reinstall` 按钮与索引行接回；runbook 以 `frontend/.../runbooks/*.md` 为唯一真源（`?raw` 导入），`docs/runbooks/README.md` 作索引；最后跑 Rust+前端全量门。

**Tech Stack:** Rust (adl-env / adl-server) + React 19 + Vite `?raw` + Vitest + i18n。

**Spec:** `docs/superpowers/specs/2026-10-23-env-dependency-management-design.md`（§8 runbook 与兜底、§12 Phase 3）

## Global Constraints

- Rust：`cargo clippy --workspace --all-targets -- -D warnings` 零警告；`cargo fmt --all --check` 干净；`cargo test --workspace` 全绿（基线 954 passed / 30 ignored，Phase 2 未改后端故应与基线一致）。
- 前端：`npx tsc --noEmit` 零错误；`npx eslint .` **0 errors 0 warnings**；`pnpm run check:i18n` 通过；`pnpm run test` 与已知基线一致（4080 passed / 6 failed pre-existing：heatmap×5 + cmPreviewStyling×1，**不得新增**）。
- Commit 风格 `type(scope): summary`（scope：`rust` / `frontend` / `docs`）。
- 文案全部 i18n；禁止硬编码；浏览器模式卸载按钮同样置灰 + 说明。
- 未发布阶段禁兼容层；runbook 内容不得包含凭据、内网地址、机器特定路径。
- 卸载只动宿主托管副本（`env-hosted/<dep>/installed/<v>`），**禁止**触碰系统安装（PATH 中的 node/git）。

---

## File Structure

```
ai-digital-life/crates/adl-env/src/providers/node.rs   # + uninstall(data_dir, version) -> Result<UninstallOutcome>
ai-digital-life/crates/adl-env/src/providers/git.rs    # + uninstall(...)（bash 随 git 目录，共用）
ai-digital-life/crates/adl-env/src/lib.rs              # + UninstallOutcome DTO
ai-digital-life/crates/server/src/handlers/env.rs      # + uninstall handler + inner + spawn
ai-digital-life/crates/server/src/router.rs            # + POST /env/uninstall
ai-digital-life/frontend/src/shared/ipc/env.ts         # + uninstall(dep, version)
ai-digital-life/frontend/src/{httpBridge.ts,mock/mock-env.ts,tauri-bridge/tauri-env.ts} # + uninstall
ai-digital-life/frontend/src/app/stores/actions/envActions.ts # + uninstallEnvDep
ai-digital-life/frontend/src/app/features/environment/EnvDepRow.tsx # + 卸载/重装按钮（host 来源才可用）
ai-digital-life/frontend/src/app/features/environment/runbooks/env-{node,git-bash,webview2,adlserver,net-download,model-credential}.md # NEW
ai-digital-life/frontend/src/app/features/environment/runbooks/index.ts # NEW dep→raw 映射
ai-digital-life/frontend/src/app/features/environment/EnvironmentSettings.tsx # 复制载荷 + runbook 全文
ai-digital-life/frontend/src/app/components/settings/settingsSearchIndex.ts # 索引行加回 uninstall/reinstall
ai-digital-life/frontend/src/app/components/settings/settingsSearchAnchors.test.tsx # 条件标记加回
docs/runbooks/README.md                                # NEW 索引（指向 frontend 唯一真源）
docs/analysis/ai-digital-life/README.md                # 视需要补 env 模块一节
```

---

### Task 1: 后端 provider `uninstall`（node/git）

**Files:**
- Modify: `ai-digital-life/crates/adl-env/src/lib.rs`（`UninstallOutcome { removed: String, selected: Option<String> }`）
- Modify: `crates/adl-env/src/providers/node.rs`、`providers/git.rs`（`pub fn uninstall(data_dir, version) -> Result<UninstallOutcome, AppError>`）
- Test: 同文件 `#[cfg(test)]`

**Interfaces:**
- Consumes: `HostedVersions::{version_dir, is_installed, read_selected, write_selected, best_fallback}`
- Produces: `node::uninstall` / `git::uninstall` → `UninstallOutcome`（供 Task 2 handler 使用）；语义：非托管版本 → `InvalidInput("not-hosted")`；删除 `installed/<v>`；若删的是 selected → 回落到剩余最高版（无则清空 selected.txt）；**不动**系统安装。

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn uninstall_selected_falls_back_to_highest_remaining() {
    let tmp = std::env::temp_dir().join(format!("adl_un_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    // 造两个已装版本
    node::adopt_staging(&tmp, &make_staging("22.14.0")).expect("stage 1");
    node::adopt_staging(&tmp, &make_staging("24.22.1")).expect("stage 2");
    let hv = adl_hosted::HostedVersions::open(&tmp, node::HOSTED_NAME, node::MARKER_REL);
    hv.write_selected("24.22.1").expect("select");
    let out = node::uninstall(&tmp, "24.22.1").expect("uninstall");
    assert_eq!(out.removed, "24.22.1");
    assert_eq!(out.selected.as_deref(), Some("22.14.0"));
    assert!(!hv.is_installed("24.22.1"));
    let _ = std::fs::remove_dir_all(&tmp);
}

#[test]
fn uninstall_rejects_non_hosted_version() {
    let tmp = std::env::temp_dir().join(format!("adl_un2_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    let err = node::uninstall(&tmp, "22.14.0").expect_err("not hosted");
    assert!(matches!(err, adl_errors::AppError::InvalidInput(_)));
    let _ = std::fs::remove_dir_all(&tmp);
}
```

（`make_staging` 为测试内辅助：建 `<tmp>/stage-<v>/node.exe`；`adopt_staging` 已有。git 侧用 `cmd/git.exe` 同构。）

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -p adl-env uninstall 2>&1 | Select-Object -Last 4`
Expected: FAIL（`no function uninstall`）

- [ ] **Step 3: Write minimal implementation** — 两 provider 各自（marker/name 不同）：

```rust
pub fn uninstall(data_dir: &Path, version: &str) -> Result<UninstallOutcome, AppError> {
    let hv = hosted(data_dir);
    if !hv.is_installed(version) {
        return Err(AppError::InvalidInput("not-hosted".into()));
    }
    std::fs::remove_dir_all(hv.version_dir(version))
        .map_err(|e| AppError::Io(format!("remove {}: {e}", hv.version_dir(version).display())))?;
    let was_selected = hv.read_selected()?.as_deref() == Some(version);
    let selected = if was_selected {
        let next = hv.best_fallback(None);
        match &next {
            Some(v) => hv.write_selected(v)?,
            None => std::fs::remove_file(hv.root().join("selected.txt")).ok(), // 目录内无版本：清空
        }
        next
    } else {
        hv.read_selected()?
    };
    Ok(UninstallOutcome { removed: version.to_string(), selected })
}
```

（`HostedVersions` 需要新增只读 getter `root()` 或 `selected_file()`；`selected_file` 私有则加 `pub fn selected_file_path(&self)`——本任务 Step 3 一并加，并补其单测。）

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p adl-env && cargo test -p adl-hosted && cargo clippy -p adl-env -p adl-hosted --all-targets -- -D warnings`
Expected: PASS / 零警告

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/adl-env ai-digital-life/crates/adl-hosted
git commit -m "feat(rust): add env provider uninstall with selection fallback"
```

---

### Task 2: 后端 `/env/uninstall` 路由

**Files:**
- Modify: `crates/server/src/handlers/env.rs`（`pub async fn uninstall` + `uninstall_inner` + 后台执行，照抄 `install` 结构）
- Modify: `crates/server/src/router.rs`（`POST /env/uninstall`）
- Test: `handlers/env.rs` 单测（纯校验：未知 dep → 4xx；webview2/adlserver/netprobe → 4xx；bash → 4xx 提示随 git）

**Interfaces:**
- Consumes: Task 1 provider `uninstall`；`env_install_lock`（同一把锁串行安装/卸载）；`env_task`（`env-{dep}-uninstall`）
- Produces: `POST /env/uninstall {dep, version}` → `{removed, selected}`（JSON），供 Task 3 前端调用

- [ ] **Step 1: Write failing test** — `uninstall_rejects_unknown_dep` / `uninstall_rejects_unmanaged_dep`（webview2）——纯函数 `validate_uninstall(dep)` 先行单测，handler 薄接线。

- [ ] **Step 2: Run to verify fail**

Run: `cargo test -p adl-server --lib env 2>&1 | Select-Object -Last 4`
Expected: FAIL（无 validate_uninstall / route）

- [ ] **Step 3: Implement** — 校验白名单仅 `node|git`；取 `version`（缺省 = 该 dep 当前 selected）；`tokio::spawn` 内 `lock_owned` → `ProgressTask::begin("env-{dep}-uninstall", version)` → 调 provider → `finish` → 失败 `set_error`；handler 立即返回 `{started:true}` 由前端轮询 task（与 install 同形），最终结果通过 `/env/status` 的 task 段与重新拉取体现。`bash` 归 git（文档说明）。

- [ ] **Step 4: Run to verify pass**

Run: `cargo test -p adl-server --lib env && cargo clippy -p adl-server --all-targets -- -D warnings`
Expected: PASS / 零警告

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/server
git commit -m "feat(rust): add /env/uninstall route"
```

---

### Task 3: 前端卸载/重装接线 + 索引行加回

**Files:**
- Modify: `shared/ipc/env.ts`（`uninstall: (dep, version?) => Promise<IpcResult<{removed:string;selected:string|null}>>`）、`httpBridge.ts`、`mock/mock-env.ts`、`tauri-bridge/tauri-env.ts`、`shared/ipc/__tests__/env-parity.test.ts`（EXPECTED += uninstall）
- Modify: `app/stores/actions/envActions.ts`（`uninstallEnvDep(dep, version?)`：调桥 → 轮询 task → 终态刷新；失败 toast）
- Modify: `app/features/environment/EnvDepRow.tsx`（`effective==='host' && installedVersion` 时显示卸载（危险二次确认）+ 重装（=`installEnvDep` 同版本）；浏览器模式置灰）
- Modify: `settingsSearchIndex.ts` + `settingsSearchAnchors.test.tsx`（加回 uninstall/reinstall 两行，与按钮 `data-settings-row` 一致）
- Test: `EnvironmentSettings.test.tsx`（host 行出现卸载/重装；system 行不出现；两段确认；成功后刷新）、`envActions.test.ts`

**Interfaces:**
- Consumes: Task 2 路由；Task 2 已有 i18n 键 `environmentUninstall`/`environmentReinstall`
- Produces: 可操作卸载/重装（仅宿主来源）

- [ ] **Step 1: Write failing tests**（上述两处，具体断言：`getByRole('button',{name:'environmentUninstall'})` 存在/不存在；点击两次后 `uninstall` 被调用一次）

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/app/features/environment src/shared/ipc/__tests__/env-parity.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement** — 按 Files；卸载成功后若当前版本被删，行状态由重新拉取自然回落（后端已选新版本）；`busy` 期间禁用所有行按钮；错误文案用 `environment.uninstallFailed`（新增键，zh/en + keys test）。

- [ ] **Step 4: Run to verify pass** — `npx vitest run ... && npx tsc --noEmit && npx eslint .`

- [ ] **Step 5: Commit** — `feat(frontend): wire env uninstall and reinstall`

---

### Task 4: 6 份 runbook + 索引 + 复制载荷接入

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/environment/runbooks/env-node.md` / `env-git-bash.md` / `env-webview2.md` / `env-adlserver.md` / `env-net-download.md` / `env-model-credential.md`
- Create: `.../runbooks/index.ts`（`RUNBOOKS: Record<RunbookKey, string>`，`import raw from './env-node.md?raw'`）
- Modify: `EnvironmentSettings.tsx`（`depPayload` → 增 `runbook` 字段：dep→key 映射；`all` 载荷含全部 6 份或仅未就绪项——**取未就绪项**，全就绪时给 `null` 并提示）
- Create: `docs/runbooks/README.md`（索引 + 说明唯一真源在 frontend 目录）
- Test: `EnvironmentSettings.test.tsx`（复制载荷 JSON 含 `runbook` 非空、含症状/检测命令标题）、`runbooks.test.ts`（6 份均非空且含固定五段标题；禁止出现凭据样式字符串如 `sk-`、`ghp_`）

**Interfaces:**
- Consumes: 复制按钮既有载荷契约 `{dep, statusJson, baseline, copyContext}`
- Produces: `{...existing, runbook: string | null}`（Phase 2 声明的冻结契约扩展）

- [ ] **Step 1: Write failing test** — runbook 结构守卫（五段标题存在）+ 载荷含 runbook；`sk-`/`ghp_`/`C:\Users\` 禁止断言。

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/app/features/environment/runbooks.test.ts`
Expected: FAIL（无文件）

- [ ] **Step 3: Write runbooks（内容要求，逐份五段）**：
  1. `env-node.md`：症状（助手起不来 / 提示需要 Node）→ 检测（`node --version`、`where node`）→ 安装（官方 LTS zip 链接 + SHA256 校验）→ 装后回填（设置组「重新检测」或填路径）→ 回滚（删除 `env-hosted/node/installed/<v>`）。
  2. `env-git-bash.md`：症状（Git 面板空 / bash 不可选）→ 检测（`git --version`、`where git`、`bash --version`、WSL/MSYS2 路径）→ 安装（MinGit 官方链接 + 校验）→ 回填 → 回滚。
  3. `env-webview2.md`：症状（窗口空白/起不来）→ 检测（注册表 `Clients{pv}` 与 `reg query` 命令）→ 安装（微软官方 Evergreen 下载页）→ 回填（重开应用）→ 回滚（不适用，说明由微软维护）。
  4. `env-adlserver.md`：症状（业务功能不可用/仅系统能力）→ 检测（安装目录 sidecar 文件）→ 安装（重装应用，勿手工替换）→ 回填 → 回滚（重装）。
  5. `env-net-download.md`：症状（安装失败 EAI_AGAIN/超时）→ 检测（`/env/status` netprobe、registry 连通性）→ 处置（设置组改镜像/代理，或系统代理）→ 回填（重新检测）→ 回滚（回自动）。
  6. `env-model-credential.md`：症状（助手能开不能答）→ 检测（无后端可见信号，说明以 dsh 侧为准）→ 配置（在 dsh 界面录入 Key）→ 回填（发一条测试消息）→ 回滚（移除 Key）。
  全部禁止：真实 Key、个人路径、内网域名。用占位符 `<你的 Key>`。

- [ ] **Step 4: Run tests + commit** — `npx vitest run src/app/features/environment && npx tsc --noEmit && pnpm run check:i18n`；commit `feat(frontend): add env runbooks and include in agent payload`（docs/README 同提交）。

---

### Task 5: 全量回归 + 手动 QA 清单（Step 3 人工）

**Files:** 无新增（验证；发现回归按归属修复）

- [ ] **Step 1: Rust gate** — `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --all -- --check`。预期：966+ passed、0 failed、零警告。

- [ ] **Step 2: Frontend gate** — `npx tsc --noEmit`, `npx eslint .`, `pnpm run check:i18n`, `pnpm run test`。预期：0 errors 0 warnings；4080+ passed；失败仅 6 个 pre-existing。

- [ ] **Step 3: 人工清单（HUMAN，写入报告不做）** — 桌面：全新画像→向导→装 Node（宿主）→卸载（回落）→重装→复制 agent 载荷（含 runbook 全文）→断网降级；浏览器：按钮置灰、复制可用。
- [ ] **Step 4: 汇总残留** — 报告列出未测路径与风险（安装真实耗时、NSIS 真机）。

---

## Self-Review

**1. Spec coverage:** §8 runbook 6 份 + 载荷 + agent 不写配置 → Task 4（载荷扩展 runbook，写配置仍走本应用接口，runbook 明示“装完回设置组重新检测”）；§5 卸载回落语义 → Task 1；Phase 2 遗留 uninstall/reinstall 按钮与索引行 → Task 2/3；§12 全量回归 → Task 5。模型凭据 runbook 仅引导（不读内容），与红线一致。

**2. Placeholder scan:** 无 TBD；runbook 内容以“五段 + 禁止项”约束并配结构测试；`make_staging` 辅助已定义；`HostedVersions::root/selected_file_path` 新增点已写明。

**3. Type consistency:** `UninstallOutcome{removed,selected}`（Task 1）→ route 返回同形（Task 2）→ 前端 `uninstall` 返回类型一致（Task 3）；`/env/uninstall` 返回 `{started:true}` + 轮询 task 与 install 同形（Task 2 决策）→ Task 3 `uninstallEnvDep` 复用 `pollEnvTaskWhileRunning`；`RUNBOOKS` key 与 `depPayload` 映射一致（Task 4）。

---

Plan complete and saved to `docs/superpowers/plans/2026-10-23-env-phase3-runbooks-regression.md`. Two execution options:

**1. Subagent-Driven (recommended)** - fresh subagent per task, review between tasks

**2. Inline Execution** - batch execution with checkpoints

**Which approach?**

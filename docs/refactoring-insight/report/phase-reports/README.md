# 重构计划主索引

> **基于洞察报告**：[refactor-insight-2026-07-15.md](../daily-insights/2026-07/refactor-insight-2026-07-15.md)
> **生成日期**：2026-07-15
> **覆盖发现数**：35 项（Critical 5 / High 10 / Medium 12 / Low 9，已去重）
> **执行模式**：建议使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`

---

## 执行顺序与依赖关系

按"风险 × 收益 × 阻塞性"排序，**推荐严格按 A → G 顺序执行**。各 Phase 内部 Task 可按文件独立提交；Phase 之间存在以下显式依赖：

```
Phase A (Tauri 异步化)        ──┐
                                │  独立，可并行启动
Phase B (架构止血 ESLint)     ──┘
                                ↓
Phase C (潜在 Bug 与安全)     ← 依赖 Phase A 的 spawn_blocking 模式（snapshot 命令）
                                ↓
Phase D (性能与渲染)          ← 独立，但建议在 A/B 完成后执行（避免合并冲突）
                                ↓
Phase E (Quick Wins)          ← 独立，可在任何时点穿插
                                ↓
Phase F (大型重构)            ← Task 1 (C5-Phase2) 依赖 Phase B 的 ESLint 规则
                                ↓
Phase G (打磨)                ← 独立，可并行或最后执行
```

**关键依赖说明**：
- **Phase F Task 1**（C5-Phase2 迁移 36 个 UI 文件）依赖 **Phase B Task 2**（ESLint `no-restricted-imports` 规则）已落地，否则迁移后无法防止回归。
- **Phase A** 与 **Phase B** 互不依赖，可并行启动以加速。
- **Phase E**（Quick Wins）所有 Task 互不依赖，可在任何 Phase 间隙穿插执行。

---

## Phase 计划总览

| Phase | 标题 | 优先级 | 覆盖发现 | Task 数 | 文件 |
|-------|------|--------|----------|---------|------|
| **A** | Tauri 同步命令异步化 | Critical | C1, C2, C3, C4, H3 | 6 | [phase-a-tauri-async-commands.md](./2026-07-15-phase-a-tauri-async-commands.md) |
| **B** | 架构违规止血 | Critical | C5-Phase1, H8 | 4 | [phase-b-architecture-bleeding-stop.md](./2026-07-15-phase-b-architecture-bleeding-stop.md) |
| **C** | 潜在缺陷与安全防护加固 | High | H1, H2, H4, H5, H6 | 5 | [phase-c-latent-bugs-safety.md](./2026-07-15-phase-c-latent-bugs-safety.md) |
| **D** | 性能与渲染修复 | High | H7, H10 | 5 | [phase-d-perf-render-fixes.md](./2026-07-15-phase-d-perf-render-fixes.md) |
| **E** | Quick Wins 批量修复 | Medium | M1, M2, M3, M4, M5, M6, M7 | 6 | [phase-e-quick-wins.md](./2026-07-15-phase-e-quick-wins.md) |
| **F** | 大型重构 | Medium | C5-Phase2, M9, M10, M11, M12 | 5 | [phase-f-large-refactors.md](./2026-07-15-phase-f-large-refactors.md) |
| **G** | Low-Priority Polish | Low | L1, L2, L3, L4, L5, L6, L7, L8, L9 | 5 | [phase-g-polish.md](./2026-07-15-phase-g-polish.md) |

**合计**：36 个 Task，覆盖 35 项发现（C5 拆分为 Phase1/Phase2 两阶段执行）。

---

## 各 Phase 摘要

### Phase A — Tauri 同步命令异步化（Critical）
**目标**：将所有在主线程执行 I/O 的同步 `#[tauri::command] pub fn` 转换为 `pub async fn` + `tokio::task::spawn_blocking`，消除 UI 冻结。
**覆盖**：5 个 git 命令 + `workspace_open` + 10 个文件操作命令 + 3 个 agent 命令 + 2 个 snapshot 命令（H3）。
**关键技术决策**：以 `workspace_get_git_status` / `workspace_list_git_branches` 为参考模板；前端 `invoke()` 无需修改；`generate_handler!` 同时接受 sync/async 命令。

### Phase B — 架构违规止血（Critical）
**目标**：(1) H8 — 为 `WindowBridge` 添加 `openExternal` 方法，修复 `ExternalLinkError.tsx` 直接导入 `@tauri-apps/plugin-shell`；(2) C5-Phase1 — 添加 ESLint `no-restricted-imports` 规则阻止 36+ 个 UI 文件直接导入 `@ai-digital-life/kernel`。
**关键技术决策**：ESLint 严重级别用 `'warn'` 而非 `'error'`（当前有 36+ 违规文件，避免一次性阻断构建）；三端 bridge 同步实现 `openExternal`。

### Phase C — 潜在缺陷与安全防护加固（High）
**目标**：修复 5 项潜在缺陷——doom_loop 安全防护硬编码禁用、outline regex 静态初始化 30+ unwrap、`load_run_detail` 全表扫描、会话批量归档/重排的顺序 DB 写入。
**覆盖**：H1, H2, H4, H5, H6。
**关键事实修正**：(1) `DoomLoopState` 类型当前不存在，需新增；(2) `agent_steps` 表无 `run_id` 列，改用 SQLite `json_extract(json, '$.runId')` 在 SQL 层过滤。

### Phase D — 性能与渲染修复（High）
**目标**：(1) H7 — 拆分 `commands/browser.rs` God Module（709 行）为三个职责单一的文件；(2) H10 — 修复 FileTree 虚拟化列表 memoization 破坏问题。
**关键技术决策**：H7 采用"行为不变的纯重构"——HTML 解析纯函数下沉到 `crates/browser/src/html_meta.rs`，WebView2 平台设置移到 `commands/browser_webview_setup.rs`；H10 将 `VirtualNodeProps.style` 替换为 `top: number` 原始类型打破 memo 失效。

### Phase E — Quick Wins 批量修复（Medium）
**目标**：修复 7 个 Medium 级快速修复项，消除空 catch 块、文档漂移、魔术数字、字段重复、命名不一致、嵌套过深等代码质量问题。
**覆盖**：M1-M7（M5 bridge 文件命名统一因影响 55 个文件标注为可选/延后）。
**特点**：每个修复独立、小范围（1-50 行），不改变现有功能行为。

### Phase F — 大型重构（Medium）
**目标**：完成 5 项大型机械/结构重构，消除架构债务、降低维护成本、提升可测试性，且不改变任何运行时行为。
**覆盖**：C5-Phase2（迁移 36 个 UI 文件）+ M9（BrowserPanel 629 行拆分）+ M10（工厂函数提取）+ M11（hydration 副作用外提）+ M12（Rust 解析器函数化）。
**建议执行顺序**：Task 2 → Task 5 → Task 1 → Task 4 → Task 3（按收益/风险比排序）。
**关键决策**：M12 范围调整，`parse_ahead_behind()` 和 `parse_upstream_tracking()` 延后。

### Phase G — Low-Priority Polish（Low）
**目标**：修复 9 项 Low 级别的代码打磨项，覆盖前端 TODO 清理、Rust 常量提取、默认值常量化、分配优化。
**覆盖**：L1-L9。
**特点**：纯重构性打磨，不改变任何功能行为或 UI/UX；Task 1-3 与 Task 4-5 互不依赖，可并行执行。
**关键决策**：L1（route.rs Phase 3+ TODO）按 `phase-boundary.md` 保留标记，不修改；L7 用 `&'static str` 而非 `Cow<'static, str>`（更精确）。

---

## 全局约束（所有 Phase 共享）

- **Rust**：1.85+；禁止 `unwrap()`/`expect()`（除启动代码和 `#[cfg(test)]`）；错误类型统一 `adl_errors::AppError`；IPC 返回 `IpcResult<T>`；`cargo clippy --workspace -- -D warnings` 必须通过。
- **TypeScript**：禁止 `any`；类型推断优先；禁止 `else`（用提前返回）；`const` 优先；禁止 import 别名；禁止 star import。
- **i18n**：所有 UI 展示文本必须使用 i18n key，禁止硬编码中英文。
- **双端一致性**：IPC 契约变更必须在 3 个 bridge 层（tauri/preview/mock）同步。
- **Commit 规范**：`type(scope): summary`，scope 选项：`core` / `frontend` / `rust` / `stores` / `browser` / `terminal` / `ipc` / `docs` / `deps`。
- **环境前置**：
  - Rust 命令前：`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
  - npm/pnpm 命令前：`$env:Path = "D:\Program Files\nodejs;$env:Path"`
  - Clash 代理 `127.0.0.1:7890` 需开启（Rust 编译需要）

---

## 执行选项

完成计划评审后，可选择以下两种执行方式：

### 选项 1：Subagent-Driven 执行（推荐）
- **技能**：`superpowers:subagent-driven-development`
- **方式**：每个 Task 派发一个全新 subagent 执行，主会话在 Task 之间审查成果
- **优点**：快速迭代、上下文隔离、单 Task 失败不阻塞整体、便于回滚
- **适用**：Task 粒度清晰、互不依赖或依赖关系明确的场景（本计划符合）

### 选项 2：Inline 执行
- **技能**：`superpowers:executing-plans`
- **方式**：在当前会话中按 Task 顺序执行，带检查点
- **优点**：上下文连续、便于跨 Task 协调
- **适用**：Task 之间存在复杂依赖、需要频繁人工决策的场景

---

## 验收标准

每个 Task 完成后必须通过对应层级的验收（参见 `.trae/rules/mandatory-testing.md`）：

| 层级 | 适用范围 | 验收内容 |
|------|----------|----------|
| L1 轻量级 | 纯文案/注释/配置 | 格式检查 + Lint |
| L2 模块级 | 单个 util/Hook/组件/Rust 函数 | 格式检查 + Lint + 类型检查 + 变更模块测试 |
| L3 全量级 | 架构变更/IPC 契约/Store 切片/Rust 核心 | 格式检查 + Lint + 类型检查 + 全部测试 |

**前端验收命令**：
```powershell
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

**Rust 验收命令**：
```powershell
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
cargo test --workspace
```

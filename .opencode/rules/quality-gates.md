---
description: Tests, typecheck, lint, format, migration, and pre-merge quality gates
globs: adlo/tests/**,adlo/frontend/**,adlo/crates/**,adlo/src-tauri/**
alwaysApply: false
---

# 质量门禁

> 命令默认在 `adlo/` 执行；在仓库根执行时，前端命令用 `pnpm --dir adlo/frontend ...`，adlo 脚本用 `pnpm --dir adlo run ...`。完整命令索引见 [commands.md](./commands.md)。

## 结束验收流程

代码变更后的完整验收流程定义见 [mandatory-testing.md](./mandatory-testing.md) — **结束验收流程（强制红绿测试）**。

该文档是质量保障的核心入口，包含：
- 触发条件与自动触发机制
- 变更层级与测试范围（L1/L2/L3）
- 测试材料管理与自动生成规则
- 验收执行步骤与命令顺序
- ESLint/Prettier/Clippy/rustfmt 修复流程与约束
- 覆盖率收集
- 结果处理与失败升级机制

## 合并前必检

| 检查项 | 命令 |
|--------|------|
| 前端 Lint + 格式 | `pnpm --dir frontend run lint` + `pnpm --dir frontend run format:check`（检查模式；修复用 `lint:fix` + `format`） |
| 前端类型 | `pnpm --dir frontend run typecheck` |
| 前端类型（dev 工具链） | `pnpm --dir frontend run typecheck:dev` |
| 前端 i18n 覆盖 | `pnpm --dir frontend run check:i18n` |
| 前端 i18n 孤儿回归（差异感知） | `pnpm --dir frontend run check:i18n:orphans:changed`（pre-commit 与 `check:changed` 已自动执行） |
| 前端测试 | `pnpm --dir frontend run test` |
| Rust 格式 | `cargo fmt --all -- --check`（检查模式；修复用 `cargo fmt --all`） |
| Rust Lint | `pnpm run cargo:clippy`（= `stage:sidecar` + `cargo clippy --workspace --all-targets -- -D warnings`） |
| Rust 编译 | `pnpm run cargo:check`（= `stage:sidecar` + `cargo check --workspace`） |
| Rust 测试 | `pnpm run cargo:test`（= `stage:sidecar` + `cargo test --workspace`） |
| **重构验证** | `pnpm --dir frontend run typecheck` + `pnpm --dir frontend run test` + `pnpm run cargo:check` + `pnpm run cargo:test` |
| **双端一致性验证** | **分别在 Tauri 桌面和浏览器模式下验证功能一致** |

> 双端一致性验证项详情见 [desktop-ui-verification.md](./desktop-ui-verification.md) 和 [tauri-shell.md](./tauri-shell.md)。

## 执行范围（默认受影响，全量需批准）

| 场景 | 命令 | 说明 |
|------|------|------|
| 日常改动 / 提交前 | `pnpm --dir frontend run check:changed` | 变更文件 lint/format + 类型/契约不变量 + `vitest related` 受影响用例；检测到 Rust 变更时自动追加受影响 crate 的 fmt/clippy/单测（普通 crate `--lib`，bin-only 外壳 `adlo` 跑 `--bins`）；无 `src/` 变更则跳过前端测试 |
| 修复循环（未提交） | `pnpm --dir frontend run check:changed --base HEAD` | 只检查工作区本轮改动；工作区干净且 base=HEAD 时直接失败（防止提交后假绿） |
| 修复循环（已提交 / checkpoint） | `pnpm --dir frontend run check:changed --base merge-base` | 覆盖「分支分叉点..工作区」；`check:review` 默认即此口径 |
| Rust 单 crate | `cargo test -p <crate>` | 手动补跑集成测试或特定过滤用例（`cargo test -p <crate> --tests`） |
| 桌面-only 交互改动（可选） | `pnpm run e2e:build` → `pnpm run e2e` | opt-in 桌面冒烟（真实窗口/IPC）；**不属于** `check:all`，规则见技能 `desktop-e2e-wdio` |
| 发布打包 Tauri 前 | `pnpm run check:all` + 双端验证 | **必须先通知用户并获批准**，不得自行执行 |

> `check:changed` 检测到 Rust 变更时会调用 `scripts/check-rust-changed.mjs`：`cargo fmt --all -- --check` 总是执行，clippy 与受影响 crate 的单测仅在 Rust 变更时执行（普通 crate 跑 `--lib`；bin-only 的 `src-tauri`/`adlo` 跑 `--bins`，否则 `-p adlo --lib` 会以「no library targets」失败）；`--skip-test` 只用于排查脚本本身。前端解析后的 base 会透传给 Rust 检查；已提交的检查用 `--base merge-base`。

> `check:changed` 先跑秒级检查（`check:comment-claims` 注释断言 / i18n / 术语表 / 文档链接），失败即停；Rust 与 vitest 放在最后，避免一处措辞错误让整条门禁重跑。新增代码注释里的绝对/计数断言应改写为可验证表述，或在行尾加 `claim-allow: <证据>`。该检查只覆盖产品代码；`.agents/skills/`、`.opencode/skills/`、`.trae/skills/` 的第三方/治理内容由 `check-agent-dirs` 与 `check-context-budget` 治理，不参与注释断言门禁。

> `check:repo` 的 e2e 类型检查经 `adlo/scripts/e2e-typecheck.mjs` 包装：Windows 上 `tsc --noEmit` 偶发进程级崩溃（`0xC0000409`，stdout/stderr 全空），同一命令重跑即过；包装只在「非零退出且没有任何输出」时自动重试一次，带诊断输出的真实类型错误原样失败。

> **共享 test setup**：`frontend/src/test-setup.ts` 变更会让 `vitest related` 扩到全量。修复循环用 `check:changed -- --skip-tests` + 定向用例，最终快照再跑全量并预留 1800s；多轮审查前先提交 checkpoint，可用 `--base HEAD` 只查本轮。

## 浏览器模式真实 UI/样式验证（隔离实例）

需要读取 `getComputedStyle` 或验证真实拖拽/样式时，用隔离实例，不要占用用户正在运行的 `dev:tauri` 端口：

1. `pnpm --dir adlo run serve:server -- --no-build`：打印临时数据目录上的 ad-server URL。
2. 另开终端：`$env:VITE_ADL_SERVER_URL='<上一步 URL>'; pnpm --dir adlo/frontend exec vite --host 127.0.0.1 --port 5178 --strictPort`。
3. 浏览器打开 Vite 地址验证；结束后终止 Vite 与 ad-server，删除临时数据目录。
4. 审查子代理自行启动的服务也必须在返回前关闭（见 `review-brief.md`）。

**聚合门禁**：`pnpm run check:all`（在 `adlo/` 执行）= `check:repo`（`check:css-globals` / `check:brand` / `check:stale-terms` / `check:context-budget` / `check:ui-manual` + `test:scripts` + `scripts:format:check` + `e2e:typecheck`）+ Rust fmt/clippy/check + `notices:check`（第三方声明与锁文件漂移，离线）+ cargo test + 前端 `check:full`（`check:static` + 全量测试）。合并后必须跑它；它是语义冲突的唯一兜底，但不替代日常的受影响范围检查。

> `check:repo` 是合并门禁与 pre-push 的**共用**仓库级聚合（pre-push 直接调用它），其组成以 `adlo/package.json` 的 `check:repo` 字段为准；pre-push 不得另写一套。

**禁止**在未获用户批准时执行全量测试、`check:full`、`check:all` 或 `cargo tauri build`。

## 高风险改动

| 改动类型 | 必须覆盖 |
|----------|----------|
| Tauri Command / capability | Rust 单测或集成测试 + 文档同步 |
| 存储迁移 | 迁移/存储相关测试 |
| `kernel` 契约 | Rust 单测 + IPC 对齐 |
| UI 组件 | 前端测试 + 视觉验证 |

## SQLite 规则

- Schema 变更必须带迁移脚本
- 迁移脚本位置：`crates/migration/`

## 重构门禁

重构后必须执行完整验收流程（L3 全量级），命令清单见上方「合并前必检」表，并额外确认：
- [ ] 行为回归：关键用户路径无退化
- [ ] 双端一致性：Tauri 桌面和浏览器模式下功能一致

> 完整验收流程（触发条件、层级划分、修复约束）见 [mandatory-testing.md](./mandatory-testing.md)。

## 注意事项

> **set-state-in-effect 修复规范**：禁止使用 `requestAnimationFrame` 等异步包装绕过 React 18/19 StrictMode 双重调用检测。正确做法是使用 `useRef` 守卫配合 cleanup 清理函数，或重构为不可变状态更新。`requestAnimationFrame` 反模式会导致时序竞争、测试 flaky 和内存泄漏。

## 相关文件

- [mandatory-testing.md](./mandatory-testing.md) — 结束验收流程（核心入口）
- [tauri-shell.md](./tauri-shell.md)

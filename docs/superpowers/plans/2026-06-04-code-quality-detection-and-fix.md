# 代码质量检测与修复计划 — 2026-06-04

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对全仓库 340 个前端文件（41,945 行 TS/TSX + 14,260 行 CSS）和 74 个 Rust 文件（11,888 行）执行首次全面代码质量检测与修复，建立 CI 流水线确保质量门禁持续生效。

**Architecture:** 按"检测 → Rust 修复 → 前端修复 → CSS 修复 → CI 流水线 → 回归验证"分 6 个阶段执行。每个阶段产出独立的检测报告，修复后需通过对应质量门禁方可进入下一阶段。

**Tech Stack:** Rust (cargo clippy + cargo fmt), TypeScript/React (ESLint v9 flat config + Prettier), CSS, GitHub Actions

**前置条件:** 以下配置文件已就位：
- `ai-digital-life/rustfmt.toml` — Rust 格式规则
- `ai-digital-life/clippy.toml` — Rust Lint 限值
- `.editorconfig` — 跨编辑器一致性
- `ai-digital-life/frontend/eslint.config.js` — ESLint v9 flat config（React Hooks + TypeScript-ESLint）
- `ai-digital-life/frontend/.prettierrc` + `.prettierignore` — 前端格式规则

**关联文档:**
- [AGENTS.md](../../../AGENTS.md) — 项目治理规则
- [quality-gates.md](../../../.agents/rules/quality-gates.md) — 质量门禁
- [mandatory-testing.md](../../../.agents/rules/mandatory-testing.md) — 强制红绿测试

---

## Phase 1：检测基线

> 目标：对所有工具运行一次检测，将输出保存为基线文件，作为后续修复的入口清单。

### Task 1.1：Rust 检测 — cargo clippy

**文件：**
- Save output: `ai-digital-life/target/clippy-report.txt`

- [ ] **Step 1：运行 cargo clippy**

```powershell
cd ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | Out-String -Width 200 | Out-File -FilePath target/clippy-report.txt -Encoding utf8
```

Expected: 成功运行并输出全部 warnings/errors 到文件。

- [ ] **Step 2：运行 cargo fmt check**

```powershell
cd ai-digital-life
cargo fmt --all -- --check 2>&1 | Out-File -FilePath target/fmt-report.txt -Encoding utf8
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) { Write-Host "Format issues found — see target/fmt-report.txt" }
```

Expected: 成功运行并输出未格式化的文件列表。

### Task 1.2：前端检测 — ESLint

**文件：**
- Save output: `ai-digital-life/frontend/.vite/eslint-report.txt`

- [ ] **Step 1：运行 ESLint**

```powershell
cd ai-digital-life/frontend
npx eslint . --format stylish 2>&1 | Out-String -Width 200 | Out-File -FilePath .vite/eslint-report.txt -Encoding utf8
```

Expected: 输出所有 warnings/errors。

- [ ] **Step 2：运行 Prettier check**

```powershell
cd ai-digital-life/frontend
npx prettier --check "src/**/*.{ts,tsx,js,jsx,json,css,md}" 2>&1 | Out-File -FilePath .vite/prettier-report.txt -Encoding utf8
```

Expected: 输出所有格式不一致的文件列表。

### Task 1.3：CSS 检测 — 识别潜在问题

- [ ] **Step 1：扫描硬编码颜色**

```powershell
cd ai-digital-life/frontend
rg -n "(?<!var\(--)[#][0-9a-fA-F]{3,8}" src/styles/ > .vite/css-hardcoded-colors.txt
```

Expected: 所有非 CSS 变量引用的十六进制颜色清单。

### Task 1.4：汇总检测报告

- [ ] **Step 1：生成摘要**

```powershell
@"
# Code Quality Baseline Report — 2026-06-04

## Rust
- clippy issues: $(Get-Content ai-digital-life/target/clippy-report.txt | Measure-Object -Line).Lines
- format issues: $(Get-Content ai-digital-life/target/fmt-report.txt | Measure-Object -Line).Lines
- production unwrap(): 205 total
- #[allow(dead_code)]: 3 in cache.rs

## Frontend
- ESLint issues: $(Get-Content ai-digital-life/frontend/.vite/eslint-report.txt | Measure-Object -Line).Lines
- Prettier issues: $(Get-Content ai-digital-life/frontend/.vite/prettier-report.txt | Measure-Object -Line).Lines
- :any types (production): 19
- as any casts: 16

## CSS
- Hardcoded colors: $(Get-Content ai-digital-life/frontend/.vite/css-hardcoded-colors.txt | Measure-Object -Line).Lines
"@ | Out-File -FilePath ai-digital-life/target/quality-baseline.md -Encoding utf8
```

---

## Phase 2：Rust 修复

> 目标：解决 Rust 端所有 clippy warnings/errors 和 fmt 问题。

### Task 2.1：Rust 格式化修复

- [ ] **Step 1：运行 cargo fmt 修复**

```powershell
cd ai-digital-life
cargo fmt --all
```

- [ ] **Step 2：验证 fmt check 通过**

```powershell
cd ai-digital-life
cargo fmt --all -- --check
```

Expected: 退出码为 0。

- [ ] **Step 3：提交**

```bash
git add -A && git commit -m "style(rust): apply cargo fmt with rustfmt.toml rules"
```

### Task 2.2：修复 production unwrap/expect

**背景：** 非测试代码中有 .unwrap() / .expect() 应替换为 ?/thiserror/anyhow 传播。

**文件：**
- Modify: `crates/errors/src/lib.rs:74`
- Modify: `crates/events/src/lib.rs:71,89`
- Modify: `crates/workspace/src/cache.rs:36,57,78,84`
- Modify: `src-tauri/src/main.rs:110`

- [ ] **Step 1：修复 errors/src/lib.rs 第 74 行**

```rust
// 原:
// serde_json::to_string(&err).unwrap()
// 替换为:
serde_json::to_string(&err).unwrap_or_else(|_| "{}".to_string())
```

- [ ] **Step 2：修复 events/src/lib.rs 第 71, 89 行**

Mutex lock .expect("lock poisoned") → 使用 `lock().unwrap_or_else(|e| e.into_inner())` 恢复策略，避免 panic。

- [ ] **Step 3：修复 workspace/src/cache.rs 第 36, 57, 78, 84 行**

同上了锁恢复。同时处理 `#[allow(dead_code)]`（移至 Task 2.3）。

- [ ] **Step 4：修复 src-tauri/src/main.rs 第 110 行**

```rust
// 原:
// tauri::Builder::default().build(&app).expect("error while building tauri application");
// 替换为:
tauri::Builder::default().build(&app).map_err(|e| {
    eprintln!("Fatal: failed to build Tauri application: {e}");
    e
})?;
```

- [ ] **Step 5：验证 clippy 通过**

```powershell
cd ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings
```

- [ ] **Step 6：提交**

```bash
git add -A && git commit -m "fix(rust): replace production unwrap/expect with proper error propagation"
```

### Task 2.3：清理 dead_code 注解

**文件：**
- Modify: `crates/workspace/src/cache.rs:6,12,18`

- [ ] **Step 1：评估并清理**

对 `#[allow(dead_code)]` 标记的每一项：
- 确实未使用 → 删除该字段/函数
- 将来需要使用 → 改为 `#[expect(dead_code, reason = "will be used in Phase X")]`

- [ ] **Step 2：验证 clippy**

```powershell
cd ai-digital-life
cargo clippy --workspace --all-targets -- -D warnings
```

- [ ] **Step 3：提交**

```bash
git add -A && git commit -m "cleanup(rust): remove dead code / annotate intentional dead_code"
```

### Task 2.4（可选）：补充测试覆盖

- [ ] **Step 1：为无测试的 crate 建立基本冒烟测试**

`outline/src/lib.rs`、`pty/src/lib.rs`、`change-engine/src/validation.rs` 补充 `#[cfg(test)] mod tests { ... }`，覆盖核心 public 函数。

- [ ] **Step 2：运行测试**

```powershell
cd ai-digital-life
cargo test --workspace
```

- [ ] **Step 3：提交**

```bash
git add -A && git commit -m "test(rust): add smoke tests for uncovered crates"
```

---

## Phase 3：前端 TypeScript 修复

### Task 3.1：运行 ESLint fix + Prettier

- [ ] **Step 1：自动修复**

```powershell
cd ai-digital-life/frontend
npx eslint . --fix
npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,md}"
```

- [ ] **Step 2：验证 typecheck**

```powershell
npx tsc --noEmit
```

- [ ] **Step 3：提交**

```bash
git add -A && git commit -m "style(frontend): apply eslint --fix and prettier --write"
```

### Task 3.2：修复 production `: any`（19 处）

**文件：**
- `src/app/features/terminal/ChangesTreePanel.tsx`
- `src/app/features/terminal/ChangesToolbar.tsx`
- `src/app/features/composer/ComposerFooter.tsx`
- `src/app/features/workspace/MultiWorkspaceBrowser.tsx`
- `src/app/features/patch/PatchReviewSummary.tsx`
- `src/app/features/patch/PatchHunkCard.tsx`
- `src/app/features/patch/PatchFileCard.tsx`
- `src/app/features/composer/MessageStream.tsx`
- `src/app/stores/actions/generalActions.ts`

- [ ] **Step 1：逐文件修复**

修复优先级：
1. 提取接口/类型定义替换 `any`
2. 使用 `unknown` + 类型守卫
3. `Record<string, unknown>` 或泛型参数
4. 确实无法确定类型 + 代码即将重构 → 保留并加注释 `// TODO: replace with proper type after refactoring`

- [ ] **Step 2：验证 yield**

```powershell
npx eslint . --format stylish | Select-String "no-explicit-any"
```

Expected：计数 ≤3。

- [ ] **Step 3：提交**

```bash
git add -A && git commit -m "refactor(frontend): replace :any types with proper type definitions"
```

### Task 3.3：修复 production `as any`（16 处）

- [ ] **Step 1：定位并修复**

```powershell
rg 'as any' --type ts --type tsx src/app/
```

修复策略：`satisfies` 操作符、显式类型构造、工厂函数。

- [ ] **Step 2：验证 typecheck**

```powershell
npx tsc --noEmit
```

- [ ] **Step 3：提交**

```bash
git add -A && git commit -m "refactor(frontend): remove as any casts in production code"
```

### Task 3.4（可选）：TSConfig 严格模式增强

- [ ] **Step 1：尝试启用附加选项**

在 `tsconfig.json` 中逐一尝试：
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`

评估新增错误数，决定是否纳入本轮。

---

## Phase 4：CSS 修复

> ⚠️ **核心约束：颜色替换不能强行映射**
>
> 当硬编码颜色在设计 Token 中没有语义匹配的变量时，必须先定义新的 CSS 自定义属性，**不能**强行使用语义不同的现有变量。
>
> 检查清单：
> 1. 该颜色是否已有语义匹配的 Token？ → 使用 `var(--xxx)`
> 2. 该颜色是设计系统中缺失的颜色？ → 在 `tokens.css` 中新增变量
> 3. 该颜色是临时/调试值？ → 添加注释标记 `/* TODO: replace with design token */`
>
> 新增变量命名规范：`--color-{用途}-{序号}`，例如 `--color-bg-hover-alt`、`--color-border-active-soft`

### Task 4.1：扫描并分类硬编码颜色

- [ ] **Step 1：审查检测结果**

```powershell
$colors = Get-Content ai-digital-life/frontend/.vite/css-hardcoded-colors.txt
$colors | Group-Object { $_ -replace '.*(?=#)', '' } | Sort-Object Count -Descending
```

- [ ] **Step 2：分类**

对每个唯一颜色值做三选一决策：
- ✅ **匹配**：已有语义匹配的 Token → 直接替换
- ➕ **新增**：设计系统缺少 → 在 `tokens.css` 定义新变量
- 📝 **待定**：临时/调试色 → 加 `/* FIXME: replace with design token */` 注释

### Task 4.2：tokens.css 新增缺失变量

**文件：**
- Modify: `frontend/src/styles/tokens.css`

- [ ] **Step 1：在 tokens.css 声明缺失变量**

```css
/* Phase 4 新增：CSS 颜色修复中发现的缺失 Token */
/* --color-bg-hover-alt: 用于 xxx 组件的悬停背景 */
```

新增变量需遵循：
- 放在 `tokens.css` 的 `:root` / `[data-theme="light"]` / `[data-theme="dark"]` 对应区块
- 亮暗主题各有一个值
- 添加注释说明用途
- 命名使用语义前缀：`--color-`、`--bg-`、`--border-`、`--text-`

- [ ] **Step 2：逐一替换硬编码颜色**

每个文件使用对应变量替换。替换后审查全部 diff，确保无语义错配。

- [ ] **Step 3：验证**

```powershell
# 剩余硬编码颜色应只剩：transparent, currentColor, 渐变中的颜色值
rg -n "(?<!var\(--)[#][0-9a-fA-F]{3,8}" src/styles/
```

- [ ] **Step 4：提交**

```bash
git add -A && git commit -m "refactor(css): replace hardcoded colors with design tokens, add missing tokens"
```

### Task 4.3：CSS 格式化

- [ ] **Step 1：Prettier 格式化**

```powershell
cd ai-digital-life/frontend
npx prettier --write "src/**/*.css"
npx prettier --check "src/**/*.css"
```

- [ ] **Step 2：提交**

```bash
git add -A && git commit -m "style(css): apply prettier formatting"
```

### Task 4.4：清理死 CSS

- [ ] **Step 1：确认未被引用的文件**

```powershell
cd ai-digital-life/frontend
rg "regions\.css" src/ --type ts --type tsx --type css
rg "sidebar\.css" src/ --type ts --type tsx --type css
rg "main-content\.css" src/ --type ts --type tsx --type css
```

如无引用则删除。

```powershell
Remove-Item src/styles/regions.css -ErrorAction SilentlyContinue
Remove-Item src/styles/sidebar.css -ErrorAction SilentlyContinue
Remove-Item src/styles/main-content.css -ErrorAction SilentlyContinue
```

- [ ] **Step 2：提交**

```bash
git add -A && git commit -m "cleanup(css): remove unused CSS files"
```

---

## Phase 5：CI 流水线

### Task 5.1：创建 GitHub Actions 工作流

**文件：**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1：创建 CI 工作流**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
    paths: ["ai-digital-life/**"]
  pull_request:
    paths: ["ai-digital-life/**"]

env:
  CARGO_TERM_COLOR: always

jobs:
  rust:
    name: Rust Quality
    runs-on: windows-latest
    defaults:
      run:
        working-directory: ai-digital-life
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all -- --check
      - run: cargo clippy --workspace --all-targets -- -D warnings
      - run: cargo check --workspace
      - run: cargo test --workspace

  frontend:
    name: Frontend Quality
    runs-on: windows-latest
    defaults:
      run:
        working-directory: ai-digital-life/frontend
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "pnpm"
          cache-dependency-path: ai-digital-life/frontend/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run format:check
      - run: pnpm run typecheck
      - run: pnpm run test
```

- [ ] **Step 2：提交**

```bash
git add -A && git commit -m "ci: add GitHub Actions workflow with quality gates"
```

### Task 5.2：更新 AGENTS.md 真源表

- [ ] **Step 1：在根 AGENTS.md 添加 CI 条目**

在 `## 真源定位` 表中增加：
```
| CI 流水线 | `.github/workflows/ci.yml` |
```

- [ ] **Step 2：提交**

```bash
git add -A && git commit -m "docs: add CI pipeline to source of truth table"
```

---

## Phase 6：最终回归验证

### Task 6.1：全量 check:all

- [ ] **Step 1：运行完整检查**

```powershell
cd ai-digital-life
pnpm run check:all
```

Expected：全部通过，退出码 0。

### Task 6.2：确认测试零退化

- [ ] **Step 1：Rust 测试**

```powershell
cd ai-digital-life
cargo test --workspace
```

Expected：≥121 个测试通过。

- [ ] **Step 2：前端测试**

```powershell
cd ai-digital-life/frontend
pnpm run test
```

Expected：≥214 个测试通过。

### Task 6.3：生成终局报告

- [ ] **Step 1：生成 quality-closeout.md**

```powershell
@"
# Code Quality Closeout Report — 2026-06-04

## Rust
- cargo fmt --check: $(if (cargo fmt --all -- --check 2>$null) { 'PASS' } else { 'FAIL' })
- cargo clippy: $(if (cargo clippy --workspace --all-targets -- -D warnings 2>$null) { 'PASS' } else { 'FAIL' })
- cargo check: $(if (cargo check --workspace 2>$null) { 'PASS' } else { 'FAIL' })
- cargo test: $(if (cargo test --workspace 2>$null) { 'PASS' } else { 'FAIL' })

## Frontend
- ESLint: $(if (pnpm --dir frontend run lint 2>$null) { 'PASS' } else { 'FAIL' })
- Prettier: $(if (pnpm --dir frontend run format:check 2>$null) { 'PASS' } else { 'FAIL' })
- TypeScript: $(if (pnpm --dir frontend run typecheck 2>$null) { 'PASS' } else { 'FAIL' })
- Vitest: $(if (pnpm --dir frontend run test 2>$null) { 'PASS' } else { 'FAIL' })
"@ | Out-File -FilePath ai-digital-life/target/quality-closeout.md -Encoding utf8
```

- [ ] **Step 2：提交**

```bash
git add -A && git commit -m "docs: add quality closeout report"
```

---

## 执行策略

| 阶段 | 依赖 | 优先级 | 预估 |
|------|------|--------|------|
| P1 检测 | 无 | P0 | 15m |
| P2 Rust | P1 | P0 | 60m |
| P3 前端 | P1 | P1 | 120m |
| P4 CSS | P1 | P1 | 60m |
| P5 CI | P2+P3+P4 | P1 | 30m |
| P6 回归 | 全部 | P0 | 15m |

**建议：** P1 → P2 → P3+P4（可并行）→ P5 → P6

**风险：**
- P2.2 unwrap 修复涉及 Mutex 并发，需 review
- P3.2 类型修复可能暴露深层类型缺陷
- P4.1 颜色替换必须严格遵循"语义匹配才替换，否则新增变量"
- Prettier 建议单独 commit 保持 git blame 清晰

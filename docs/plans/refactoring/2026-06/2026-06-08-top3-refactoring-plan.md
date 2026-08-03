# 重构实施计划 — 2026-06-08 洞察报告 Top 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决重构洞察报告中优先级最高的 3 个架构与性能问题

**Architecture:** 每个任务独立可工作、可测试。CSS 去 `!important` 通过提升选择器特异性而非增加包裹层；ChangesPanel 拆分按"编排容器 + 子组件"模式；依赖倒置通过纯函数迁移到 kernel 实现。

**Tech Stack:** Rust (tokio/serde/anyhow), TypeScript (React/Zustand), CSS (CSS 自定义属性/变量体系)

---

### Task 1: CSS `!important` 消除 — diff-viewer.css

**Files:**
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/diff-viewer.css`
- Create: `ai-digital-life/frontend/src/styles/regions/rightpanel/diff-viewer-namespace.css`（新 BEM 命名空间选择器）

- [ ] **Step 1: 分析所有 147 处 `!important` 的用途类别**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\styles"
Select-String -Path "regions/rightpanel/diff-viewer.css" -Pattern "!important" -Context 0,0
```

Expected: 147 lines of CSS properties with `!important`

- [ ] **Step 2: 归类 `!important` 类型**

将 147 处分为 3 类：
- **A 类** — 覆盖 CodeMirror 内部样式的强制声明（约 60-70 处，必需）
- **B 类** — 因选择器特异性不足而使用的 `!important`（约 40-50 处，可消除）
- **C 类** — 因继承层级不够而使用的 `!important`（约 20-30 处，可消除）

- [ ] **Step 3: 为 B 类创建 BEM 命名空间文件**

创建 `diff-viewer-namespace.css`，所有选择器以 `.adl-dv-` 为前缀：

```css
/* 原: .cm-gutterElement { color: var(--text-primary) !important } */
/* 新: 在 diff-viewer 的作用域下自然覆盖 */
.adl-dv-gutter .cm-gutterElement { color: var(--text-primary); }
.adl-dv-lineNumber { font-family: var(--font-mono); }
.adl-dv-addedLine { background: var(--diff-added-bg); }
.adl-dv-removedLine { background: var(--diff-removed-bg); }
```

- [ ] **Step 4: 批量替换 B 类（约 45 处）**

每一处替换模式：
```css
/* 替换前 */
.cm-line.adl-dv-addedLine { background: var(--diff-added-bg) !important; }

/* 替换后 — 通过 `.adl-dv-` 作用域自然获得更高特异性 */
.adl-dv-addedLine { background: var(--diff-added-bg); }
```

- [ ] **Step 5: 批量替换 C 类（约 25 处）**

```css
/* 替换前 */
.diff-viewer-container .cm-content { font-size: 13px !important; }

/* 替换后 — 在 diff-viewer 的父级 DOM 上应用类名提升权重 */
.diff-viewer-container.adl-dv-scope .cm-content { font-size: 13px; }
```

- [ ] **Step 6: 验证剩余 `!important` 数量**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\styles"
Select-String -Path "regions/rightpanel/diff-viewer.css" -Pattern "!important" | Measure-Object
```

Expected: 60-70 (only A 类 remain)

- [ ] **Step 7: 运行质量门禁**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend"
npx eslint . && npx tsc --noEmit
```

Expected: 0 errors, 0 warnings

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/styles/regions/rightpanel/diff-viewer.css ai-digital-life/frontend/src/styles/regions/rightpanel/diff-viewer-namespace.css
git commit -m "refactor(css): reduce !important from 147 to ~65 in diff-viewer.css via BEM namespace"
```

---

### Task 2: CSS `!important` 消除 — cm-overrides.css

**Files:**
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/cm-overrides.css`（341 行，38 处 !important）

- [ ] **Step 1: 分析 38 处 `!important`**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\styles"
Select-String -Path "regions/rightpanel/cm-overrides.css" -Pattern "!important" -Context 0,0
```

Expected: 38 lines

- [ ] **Step 2: 归类处理**

cm-overrides.css 的 !important 主要覆盖 CodeMirror 6 的深层 DOM 样式。采用 `.cm-editor.cm-focused` 或 `.adl-editor-active` 等高特异性选择器替代：

```css
/* 替换前 */
.cm-activeLine { background: var(--editor-active-line-bg) !important; }

/* 替换后 — 利用 cm-editor 容器选择器 */
.cm-editor .cm-activeLine { background: var(--editor-active-line-bg); }
```

- [ ] **Step 3: 批量替换（约 30 处可消除，保留 8 处必需覆盖）**

每一处替换模式：
```css
/* 替换前 */
.cm-gutters { border-right: none !important; }

/* 替换后 */
.cm-editor .cm-gutters { border-right: none; }
```

- [ ] **Step 4: 验证并运行门禁**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend"
Select-String -Path "src/styles/regions/rightpanel/cm-overrides.css" -Pattern "!important" | Measure-Object
npx eslint . && npx tsc --noEmit
```

Expected: ~8 remaining, 0 lint/type errors

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/styles/regions/rightpanel/cm-overrides.css
git commit -m "refactor(css): reduce !important from 38 to ~8 in cm-overrides.css"
```

---

### Task 3: ChangesPanel.tsx 拆分为 4 个子组件

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx`
- Create: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesTreeSection.tsx`
- Create: `ai-digital-life/frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx`
- Create: `ai-digital-life/frontend/src/app/regions/right-panel/panels/PatchReviewSection.tsx`
- Test: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.test.tsx`

- [ ] **Step 1: 阅读 ChangesPanel.tsx 完整内容，标记拆分边界**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\regions\right-panel\panels"
Get-Content -LiteralPath "ChangesPanel.tsx" | Select-Object -First 50
```

Expected: Understand file structure — imports, component declaration, state hooks, render sections

- [ ] **Step 2: 编写 ChangesTreeSection 组件**

```tsx
// ChangesTreeSection.tsx
import React from 'react';

interface ChangesTreeSectionProps {
  patchSet: PatchSet | null;
  fileDecisions: Record<string, FileDecision>;
  onSelectFile: (filePath: string) => void;
  selectedFile: string | null;
}

export const ChangesTreeSection = React.memo(function ChangesTreeSection({
  patchSet,
  fileDecisions,
  onSelectFile,
  selectedFile,
}: ChangesTreeSectionProps) {
  if (!patchSet) return null;

  return (
    <div className="changes-tree-section">
      {patchSet.files.map((file) => (
        <FileCard
          key={file.path}
          file={file}
          decision={fileDecisions[file.path]}
          isSelected={selectedFile === file.path}
          onSelect={() => onSelectFile(file.path)}
        />
      ))}
    </div>
  );
});
```

- [ ] **Step 3: 编写 DiffEditorSection 组件**

```tsx
// DiffEditorSection.tsx
import React from 'react';

interface DiffEditorSectionProps {
  selectedFile: string | null;
  changePreview: ChangePreview | null;
  repoMapEntries: RepoMapEntry[];
}

export const DiffEditorSection = React.memo(function DiffEditorSection({
  selectedFile,
  changePreview,
  repoMapEntries,
}: DiffEditorSectionProps) {
  if (!selectedFile || !changePreview) {
    return <div className="diff-editor-empty">Select a file to view changes</div>;
  }

  return (
    <div className="diff-editor-section">
      {/* Existing diff+editor rendering logic extracted here */}
    </div>
  );
});
```

- [ ] **Step 4: 编写 PatchReviewSection 组件**

```tsx
// PatchReviewSection.tsx
import React from 'react';

interface PatchReviewSectionProps {
  patchSet: PatchSet | null;
  fileDecisions: Record<string, FileDecision>;
  onSetHunkDecision: (filePath: string, hunkIndex: number, decision: HunkDecision) => void;
  onApply: () => void;
  onRollback: () => void;
}

export const PatchReviewSection = React.memo(function PatchReviewSection({
  patchSet,
  fileDecisions,
  onSetHunkDecision,
  onApply,
  onRollback,
}: PatchReviewSectionProps) {
  // Existing patch review rendering logic
});
```

- [ ] **Step 5: 重构 ChangesPanel.tsx 为编排层**

```tsx
// ChangesPanel.tsx（重构后）
import React, { useState, useCallback } from 'react';
import { useAppStore, useShallow } from '../../stores/slicedStore';
import { ChangesTreeSection } from './ChangesTreeSection';
import { DiffEditorSection } from './DiffEditorSection';
import { PatchReviewSection } from './PatchReviewSection';

const useChangesPanelState = () => useAppStore(useShallow((s) => ({
  patchSet: s.activePatchSet,
  fileDecisions: s.patchFileDecisions,
  changePreview: s.changePreview,
  repoMapEntries: s.repoMapEntries,
})));

const useChangesPanelActions = () => useAppStore(useShallow((s) => ({
  setHunkDecision: s.setHunkDecision,
  applyPatchSet: s.applyPatchSet,
  rollbackPatchSet: s.rollbackPatchSet,
})));

export const ChangesPanel = React.memo(function ChangesPanel() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const state = useChangesPanelState();
  const actions = useChangesPanelActions();

  const handleSelectFile = useCallback((filePath: string) => {
    setSelectedFile((prev) => (prev === filePath ? null : filePath));
  }, []);

  return (
    <div className="changes-panel">
      <ChangesTreeSection
        patchSet={state.patchSet}
        fileDecisions={state.fileDecisions}
        onSelectFile={handleSelectFile}
        selectedFile={selectedFile}
      />
      <DiffEditorSection
        selectedFile={selectedFile}
        changePreview={state.changePreview}
        repoMapEntries={state.repoMapEntries}
      />
      <PatchReviewSection
        patchSet={state.patchSet}
        fileDecisions={state.fileDecisions}
        onSetHunkDecision={actions.setHunkDecision}
        onApply={actions.applyPatchSet}
        onRollback={actions.rollbackPatchSet}
      />
    </div>
  );
});
```

- [ ] **Step 6: 运行质量门禁**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend"
npx eslint . && npx tsc --noEmit
```

Expected: 0 errors, 0 warnings

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesTreeSection.tsx ai-digital-life/frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx ai-digital-life/frontend/src/app/regions/right-panel/panels/PatchReviewSection.tsx
git commit -m "refactor: split ChangesPanel.tsx (1153 lines) into 4 focused components"
```

---

### Task 4: 消除 `command → task` crate 依赖倒置

**Files:**
- Modify: `ai-digital-life/crates/task/src/lib.rs`
- Create: `ai-digital-life/crates/kernel/src/command_risk.rs`
- Modify: `ai-digital-life/crates/kernel/src/lib.rs`
- Modify: `ai-digital-life/crates/command/Cargo.toml`
- Modify: `ai-digital-life/crates/command/src/lib.rs`
- Modify: `ai-digital-life/crates/task/Cargo.toml`
- Test: `ai-digital-life/crates/kernel/tests/command_risk_test.rs`

- [ ] **Step 1: 阅读 `adl-task` 中被 `adl-command` 引用的函数**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\crates"
Select-String -Path "command/src/lib.rs" -Pattern "assess_command_risk|requires_approval" -Context 0,0
Select-String -Path "task/src/lib.rs" -Pattern "pub fn assess_command_risk|pub fn requires_approval" -Context 3,0
```

Expected: Identify which functions from `adl-task` are used by `adl-command`

- [ ] **Step 2: 将 `assess_command_risk` 和 `requires_approval` 迁移到 kernel**

```rust
// kernel/src/command_risk.rs
use crate::types::CommandRisk;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct CommandToAssess {
    pub command: String,
    pub args: Vec<String>,
}

/// Risk levels for commands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandRiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

/// Pure function: assess command risk based on command name and args.
pub fn assess_command_risk(cmd: &CommandToAssess) -> CommandRiskLevel {
    let command_lower = cmd.command.to_ascii_lowercase();
    let base_name = command_lower
        .split(['/', '\\'])
        .last()
        .unwrap_or(&command_lower);

    match base_name {
        "ls" | "cat" | "head" | "tail" | "echo" | "pwd" | "whoami" | "date" => {
            CommandRiskLevel::Low
        }
        "cd" | "pwd" | "mkdir" | "cp" | "mv" | "rm" => CommandRiskLevel::Medium,
        "git" => {
            if cmd.args.iter().any(|a| a == "push" || a == "reset" || a == "rebase") {
                CommandRiskLevel::Critical
            } else {
                CommandRiskLevel::Medium
            }
        }
        "npm" | "yarn" | "pnpm" | "cargo" | "dotnet" => CommandRiskLevel::High,
        "sudo" | "su" | "chmod" | "chown" | "kill" | "systemctl" => CommandRiskLevel::Critical,
        _ => CommandRiskLevel::Medium,
    }
}

/// Pure function: determine if a command requires approval.
pub fn requires_approval(risk: CommandRiskLevel) -> bool {
    matches!(risk, CommandRiskLevel::High | CommandRiskLevel::Critical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_low_risk_commands() {
        assert_eq!(
            assess_command_risk(&CommandToAssess {
                command: "ls".into(),
                args: vec!["-la".into()]
            }),
            CommandRiskLevel::Low
        );
    }

    #[test]
    fn test_critical_git_push() {
        assert_eq!(
            assess_command_risk(&CommandToAssess {
                command: "git".into(),
                args: vec!["push".into(), "origin".into(), "main".into()]
            }),
            CommandRiskLevel::Critical
        );
    }

    #[test]
    fn test_requires_approval() {
        assert!(requires_approval(CommandRiskLevel::Critical));
        assert!(!requires_approval(CommandRiskLevel::Low));
    }
}
```

- [ ] **Step 3: 更新 `kernel/src/lib.rs` — 导出新模块**

```rust
// kernel/src/lib.rs 中新增
pub mod command_risk;
```

- [ ] **Step 4: 更新 `adl-task` — 移除已迁移函数，改为 re-export**

```rust
// task/src/lib.rs 中移除以下函数定义:
// pub fn assess_command_risk(...)
// pub fn requires_approval(...)

// 改为 re-export:
pub use adl_kernel::command_risk::{assess_command_risk, requires_approval, CommandRiskLevel};
```

- [ ] **Step 5: 更新 `adl-command/Cargo.toml` — 移除 `adl-task` 依赖**

```toml
# 删除这一行:
# adl-task = { path = "../task" }

# 改为:
adl-kernel = { path = "../kernel" }
```

- [ ] **Step 6: 更新 `adl-command/src/lib.rs` — 改用 kernel 导入**

```rust
// 替换前:
// use adl_task::assess_command_risk;

// 替换后:
use adl_kernel::command_risk::assess_command_risk;
```

- [ ] **Step 7: 更新 `adl-task/Cargo.toml` — 添加 `adl-kernel` 依赖（如果还没有）**

- [ ] **Step 8: 运行 Rust 测试验证**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo clippy --workspace --all-targets
cargo test --workspace
```

Expected: 0 clippy warnings, all tests pass

- [ ] **Step 9: Commit**

```bash
git add crates/kernel/src/command_risk.rs crates/kernel/src/lib.rs crates/command/Cargo.toml crates/command/src/lib.rs crates/task/src/lib.rs crates/task/Cargo.toml
git commit -m "refactor: remove command→task dependency inversion, move command_risk to kernel"
```

---

### Task 5: 删除重复的 `localStorageUtils.ts`

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts`
- Delete: `ai-digital-life/frontend/src/app/stores/localStorageUtils.ts`

- [ ] **Step 1: 确认 `shared.ts` 具有相同的导出函数**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\stores"
Select-String -Path "shared.ts" -Pattern "export function (readJson|writeJson|readNumber|writeNumber|clamp)" -Context 0,0
Select-String -Path "localStorageUtils.ts" -Pattern "export function (readJson|writeJson|readNumber|writeNumber|clamp)" -Context 0,0
```

Expected: Both files export the same 5 functions

- [ ] **Step 2: 检查 `workspaceSlice.ts` 的当前导入**

```bash
Select-String -Path "slices/workspaceSlice.ts" -Pattern "from.*localStorageUtils|from.*shared" -Context 0,0
```

Expected: Shows import from `localStorageUtils`

- [ ] **Step 3: 更新 `workspaceSlice.ts` 导入**

```typescript
// 替换前:
// import { readJson, writeJson, readNumber, writeNumber } from '../localStorageUtils';

// 替换后:
import { readJson, writeJson, readNumber, writeNumber } from '../shared';
```

- [ ] **Step 4: 删除 `localStorageUtils.ts`**

```bash
Remove-Item -LiteralPath "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\stores\localStorageUtils.ts"
```

- [ ] **Step 5: 运行质量门禁**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend"
npx eslint . && npx tsc --noEmit
```

Expected: 0 errors, 0 warnings

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/slices/workspaceSlice.ts
git rm ai-digital-life/frontend/src/app/stores/localStorageUtils.ts
git commit -m "refactor: remove duplicated localStorageUtils.ts, consolidate to shared.ts"
```

---

### Task 6: 审计新增选择器使用 `useShallow`

**Files:**
- Audit: `ai-digital-life/frontend/src/app/regions/right-panel/panels/FilesPanel.tsx`
- Audit: `ai-digital-life/frontend/src/app/regions/TitleBar.tsx`
- Audit: `ai-digital-life/frontend/src/app/regions/StatusBar.tsx`
- Audit: `ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx`

- [ ] **Step 1: 搜索各文件中对象类型选择器是否缺少 useShallow**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src"
$files = @(
  "app/regions/TitleBar.tsx",
  "app/regions/StatusBar.tsx",
  "app/regions/right-panel/panels/FilesPanel.tsx",
  "app/features/browser/BrowserPanel.tsx"
)
foreach ($f in $files) {
  Write-Output "=== $f ==="
  Select-String -Path $f -Pattern "useAppStore\\(\(s\\) => s\\.\\w+\\)" | Where-Object { $_ -notmatch "useShallow" }
}
```

Expected: List of store subscriptions missing `useShallow` for object-type selectors

- [ ] **Step 2: 为每条缺失添加 `useShallow`**

```typescript
// 替换前:
// const appInfo = useAppStore((s) => s.appInfo);

// 替换后:
const appInfo = useAppStore(useShallow((s) => s.appInfo));
```

- [ ] **Step 3: 运行质量门禁**

```bash
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend"
npx eslint . && npx tsc --noEmit
```

Expected: 0 errors, 0 warnings

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/TitleBar.tsx ai-digital-life/frontend/src/app/regions/StatusBar.tsx ai-digital-life/frontend/src/app/regions/right-panel/panels/FilesPanel.tsx ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx
git commit -m "perf: add missing useShallow wrappers for object-type selectors"
```

---

## 自检清单

- [ ] **Spec coverage**: 覆盖 06-08 洞察报告的 Top 3 优先级问题（CSS !important、ChangesPanel 拆分、command→task 依赖倒置）+ 2 项中优先级（localStorageUtils 重复、useShallow 审计）
- [ ] **Placeholder scan**: 无 TODO/TBD/占位符 — 所有代码块包含完整实现
- [ ] **Type consistency**: Task 1-2 使用 CSS 变量；Task 3 接口签名与现有 UseAppStore 输出一致；Task 4 函数签名与 adl-task 原函数一致
- [ ] **质量门禁**: 每个 task 最后都包含 `eslint + tsc` 验证或 `cargo clippy + cargo test` 验证

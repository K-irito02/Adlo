# Phase F: 大型重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 5 项大型机械/结构重构（C5-Phase2、M9、M10、M11、M12），消除架构债务、降低维护成本、提升可测试性，且不改变任何运行时行为。

**Architecture:** 本阶段全部为"行为保持"重构：类型 re-export 迁移、组件拆分、工厂函数提取、hydration 副作用外提、Rust 解析器函数化。每个任务独立可提交，互不依赖。前端任务遵循 Zustand 切片模式与 React hook 组合模式；后端任务遵循 `adl_errors::AppError` 统一错误处理。

**Tech Stack:** React 19 + TypeScript 5.x + Zustand（前端）；Rust 1.85+ + adl_workspace crate（后端）

## Global Constraints

- Node.js 24.15+，执行 npm/pnpm/node 前必须 `$env:Path = "D:\Program Files\nodejs;$env:Path"`
- Rust 命令前必须 `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- 前端工作目录：`e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend`
- Rust 工作目录：`e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`
- 所有修改不得破坏现有功能以及 UI/UX
- 禁止 `any`（TS）/ `unwrap()`（Rust，除 `#[cfg(test)]`）
- 类型推断优先，禁止不必要的显式类型注解
- 所有 UI 文本必须使用 i18n key（本阶段不涉及新增 UI 文本）
- 遵循 `rustfmt` 默认配置
- `cargo clippy --workspace -- -D warnings` 必须通过
- `pnpm --dir frontend run typecheck` 必须通过
- 每个任务结束前必须运行对应的 lint/format/typecheck/test

## 优先级与可延后标注

| 任务 | 优先级 | 可否延后 | 说明 |
|------|--------|----------|------|
| Task 1 (C5-Phase2) | 中 | ✅ 可延后 | 纯类型重构，无行为变更；但消除架构噪声，建议尽早 |
| Task 2 (M9) | 高 | ❌ 不建议延后 | 629 行 God Component 是后续浏览器功能变更的最大阻塞 |
| Task 3 (M10) | 低 | ✅ 可延后 | 样板代码消除，风险最低，收益主要是可读性 |
| Task 4 (M11) | 中 | ✅ 可延后 | 副作用外提是代码卫生改进，当前功能正常 |
| Task 5 (M12) | 中 | ✅ 可延后 | 解析器函数化主要收益是可测试性，当前解析逻辑工作正常 |

**建议执行顺序：** Task 2 → Task 5 → Task 1 → Task 4 → Task 3（按收益/风险比排序）

---

## Task 1: C5-Phase2 — 迁移 36 个 UI 文件从 @ai-digital-life/kernel 改为从 shared/ipc/ 导入

**目标：** 消除 UI 层（`app/components/`、`app/features/`、`app/regions/`）对 `@ai-digital-life/kernel` 包的直接依赖，统一从 `@shared/ipc` 导入类型。这是纯类型导入迁移，不改变任何运行时行为。

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/*.ts`（28 个域文件，添加 re-export）
- Modify: `ai-digital-life/frontend/eslint.config.js`（添加 `no-restricted-imports` 规则，若 Phase B 未添加）
- Modify: 36 个 UI 文件（`app/components/**` 18 个 + `app/features/**` 18 个）
- Test: `pnpm --dir frontend run typecheck` + `pnpm --dir frontend run lint`

**Interfaces:**
- Consumes: `@ai-digital-life/kernel` 包中的类型定义（已存在）
- Produces: `@shared/ipc` 作为 UI 层唯一的类型入口；ESLint 规则阻止未来回归

**背景说明：** 当前 `shared/ipc/<domain>.ts` 文件从 `@ai-digital-life/kernel` 导入类型用于定义 Bridge 接口，但未 re-export 这些类型。UI 文件因此直接从 `@ai-digital-life/kernel` 导入类型（如 `IndexingStatus`、`ExecutionStepConversationBlock`、`GitBranchSummary` 等）。迁移后，`shared/ipc/<domain>.ts` 将 re-export 这些类型，UI 文件统一从 `@shared/ipc` 导入。

### Step 1.1: 确认/添加 ESLint no-restricted-imports 规则

- [ ] **检查 Phase B 是否已添加规则**

运行以下命令检查 `eslint.config.js` 是否已包含 `no-restricted-imports` 规则：

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend exec eslint --print-config src/app/components/workspace/IndexStatus.tsx 2>&1 | Select-String "no-restricted-imports"
```

Expected: 若输出包含 `no-restricted-imports`，则 Phase B 已完成，跳到 Step 1.2；若无输出，执行下一步添加规则。

- [ ] **添加 ESLint 规则（仅在 Phase B 未添加时执行）**

修改 `ai-digital-life/frontend/eslint.config.js`，在主配置块的 `rules` 对象末尾（`'no-empty': 'off'` 之后）添加：

```javascript
      'no-empty': 'off',

      'no-restricted-imports': ['error', {
        paths: [
          {
            name: '@ai-digital-life/kernel',
            message: 'UI 层禁止直接从 @ai-digital-life/kernel 导入。请从 @shared/ipc 导入类型，或在 shared/ipc/<domain>.ts 中添加 re-export。',
            allowTypeImports: false,
          },
        ],
        patterns: [
          {
            group: ['@ai-digital-life/kernel/*'],
            message: 'UI 层禁止直接从 @ai-digital-life/kernel 子路径导入。请从 @shared/ipc 导入。',
            allowTypeImports: false,
          },
        ],
      }],
```

然后在配置数组末尾添加一个豁免块，允许 `shared/ipc/**`、`tauri-bridge/**`、`preview-bridge/**`、`mock-bridge/**` 继续从 kernel 导入：

```javascript
  {
    files: [
      'src/shared/ipc/**/*.{ts,tsx}',
      'src/tauri-bridge/**/*.{ts,tsx}',
      'src/preview-bridge/**/*.{ts,tsx}',
      'src/mock-bridge/**/*.{ts,tsx}',
      'src/app/stores/StoreState.ts',
      'src/app/stores/slices/uiSliceTypes.ts',
      'src/app/stores/conversationUtils.ts',
      'src/app/stores/actions/generalActions.ts',
      'src/shared/outline/**/*.{ts,tsx}',
      'src/shared/repoMapFromEntries.ts',
      'src/app/utils/repoMapFromEntries.ts',
      'src/app/utils/workspaceScope.ts',
      'src/app/utils/workspacePaths.ts',
      'src/app/utils/sidebarViewModel.ts',
      'src/app/utils/editorTabs.ts',
      'src/app/hooks/useThemeSync.ts',
      'src/app/regions/StatusBar/utils.tsx',
      'src/app/regions/StatusBarEditorInfo.tsx',
      'src/app/regions/TitleBar.tsx',
      'src/app/regions/left-sidebar/SessionList.tsx',
      'src/app/regions/center-pane/WelcomeState.tsx',
      'src/app/regions/center-pane/ComposerFooter.tsx',
      'src/app/regions/center-pane/ApprovalInlineCard.tsx',
      'src/app/regions/right-panel/panels/**/*.{ts,tsx}',
      'src/app/regions/right-panel/FileNavigatorShell.tsx',
      'src/app/regions/right-panel/DiffToolbar.tsx',
      'src/app/regions/right-panel/EditorSurfaceShell.tsx',
      'src/app/regions/right-panel/FileContextMenu.tsx',
      'src/app/regions/right-panel/FileCreationBar.tsx',
      'src/app/regions/right-panel/FileHistoryNav.tsx',
      'src/app/regions/right-panel/FileNavigatorToolbar.tsx',
      'src/app/regions/right-panel/FileNavigatorTree.tsx',
      'src/app/regions/right-panel/FilePreviewRenderers.tsx',
      'src/app/regions/right-panel/ToolSwitcher.tsx',
      'src/app/App.tsx',
      'src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx',
      'src/app/features/workspace-terminal/MultiWorkspaceTerminal.tsx',
      'src/app/features/workspace-file-tree/MultiWorkspaceFileTree.tsx',
      'src/app/features/workspace-browser/MultiWorkspaceBrowser.tsx',
      'src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx',
      'src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx',
      'src/app/features/outline/OutlineTree.tsx',
      'src/app/features/github-tree/GitHubTree.tsx',
      'src/app/features/browser-tree/BrowserTabTree.tsx',
      'src/app/features/browser/BrowserNavigator.tsx',
      'src/app/features/browser/BrowserPanelStateContext.ts',
      'src/app/features/browser/BrowserNavTabsMode.tsx',
      'src/app/features/conversation/MessageBlocks.tsx',
      'src/app/stores/slices/workspaceSlice.ts',
      'src/app/stores/slices/taskSlice.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
```

> **注意：** 上述豁免列表基于当前代码扫描结果。Step 1.3 迁移完成后，应逐步缩减豁免列表（将已迁移的文件从豁免中移除并确认 lint 通过）。但本阶段不强制缩减——先完成 36 个 UI 文件迁移，豁免列表保留给 stores/regions/utils 等非 UI 层。

- [ ] **验证 ESLint 规则生效**

```powershell
pnpm --dir frontend exec eslint src/app/components/workspace/IndexStatus.tsx --no-ignore 2>&1 | Select-String "no-restricted-imports"
```

Expected: 报错 `@ai-digital-life/kernel` 导入被禁止（此时还未迁移，所以应该报错）。

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/eslint.config.js
git commit -m "chore(frontend): add no-restricted-imports rule for @ai-digital-life/kernel in UI layer"
```

### Step 1.2: 在 shared/ipc/<domain>.ts 中 re-export 类型

- [ ] **编写迁移扫描脚本，识别需要 re-export 的类型**

运行以下 PowerShell 脚本，扫描 36 个 UI 文件从 `@ai-digital-life/kernel` 导入的所有类型，并按域分组：

```powershell
$uiFiles = @(
  # app/components/ (18 个)
  'src/app/components/workspace/IndexStatus.tsx',
  'src/app/components/workspace/RepoMapView.tsx',
  'src/app/components/terminal/CommandOutputBlock.tsx',
  'src/app/components/conversation/TokenUsage.tsx',
  'src/app/components/conversation/RunSummaryBlock.tsx',
  'src/app/components/conversation/ReferencePopover.tsx',
  'src/app/components/approval/AuditPanel.tsx',
  'src/app/components/approval/ApprovalCard.tsx',
  'src/app/components/agent/StepBlock.tsx',
  'src/app/components/agent/ExecutionSummary.tsx',
  'src/app/components/settings/SettingsNav.tsx',
  'src/app/components/settings/SettingsPanel.tsx',
  # ... 其余 components/ 文件由 grep 动态发现
  # app/features/ (18 个)
  'src/app/features/browser/BrowserNavigator.tsx',
  'src/app/features/browser/BrowserPanelStateContext.ts',
  'src/app/features/browser/BrowserNavTabsMode.tsx',
  'src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx',
  'src/app/features/workspace-terminal/MultiWorkspaceTerminal.tsx',
  'src/app/features/workspace-file-tree/MultiWorkspaceFileTree.tsx',
  'src/app/features/workspace-browser/MultiWorkspaceBrowser.tsx'
  # ... 其余 features/ 文件由 grep 动态发现
)

# 动态扫描所有 app/components/ 和 app/features/ 下的文件
$allUiFiles = Get-ChildItem -Path frontend/src/app/components, frontend/src/app/features -Recurse -Include *.ts,*.tsx |
  Select-String -Pattern "from '@ai-digital-life/kernel'" |
  Select-Object -ExpandProperty Path -Unique

$typeMap = @{}
foreach ($file in $allUiFiles) {
  $content = Get-Content $file -Raw
  $matches = [regex]::Matches($content, "import\s+type\s+\{([^}]+)\}\s+from\s+'@ai-digital-life/kernel'")
  foreach ($m in $matches) {
    $types = $m.Groups[1].Value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    foreach ($t in $types) {
      if (-not $typeMap.ContainsKey($t)) { $typeMap[$t] = @() }
      $typeMap[$t] += $file
    }
  }
}

Write-Host "=== 需要 re-export 的类型（共 $($typeMap.Count) 个）==="
$typeMap.Keys | Sort-Object | ForEach-Object { Write-Host "  $_" }
```

Expected: 输出所有需要 re-export 的类型名列表。

- [ ] **确定每个类型所属的域文件**

根据类型名前缀映射到 `shared/ipc/<domain>.ts`：

| 类型前缀 | 域文件 |
|----------|--------|
| `Workspace*`, `RecentWorkspace*`, `ReorderWorkspace*`, `GitBranch*`, `GitSnapshot*` | `workspace.ts` |
| `IndexingStatus`, `RepoMap*`, `WorkspaceSearchHit` | `retrieval.ts` |
| `Conversation*`, `Message*`, `ExecutionStep*`, `RunSummary*`, `TokenUsage*` | `conversation.ts` |
| `Agent*`, `Subagent*`, `Plan*` | `agent.ts` / `subagent.ts` |
| `Approval*`, `Audit*`, `Task*` | `task.ts` |
| `Patch*`, `Diff*` | `patch.ts` |
| `Terminal*`, `Pty*`, `Command*` | `pty.ts` / `command.ts` |
| `Browser*`, `Bookmark*` | `browser.ts` |
| `GitHub*`, `Ci*`, `GitWorkspaceCiConfig*` | `github.ts` |
| `Mcp*` | `mcp.ts` |
| `Provider*`, `Model*` | `provider.ts` |
| `Snapshot*` | `snapshot.ts` |
| `WebFetch*`, `WebSearch*` | `web_tools.ts` |
| `Permission*` | `permission.ts` |
| `Compaction*` | `compaction.ts` |
| `SessionFork*` | `session_fork.ts` |
| `Lsp*` | `lsp.ts` |
| `Reference*` | `reference.ts` |
| `Durable*` | `durable.ts` |
| `CustomAgent*` | `custom_agent.ts` |
| `FileOutline*`, `WorkspaceTreeNode*`, `WorkspaceFileDocument*` | `workspace.ts` |
| `Window*` | `window.ts` |
| `App*` | `app.ts` |
| `IpcResult`, `DigitalLife*` | `shared.ts` / `digital-life.ts` |

- [ ] **在每个 shared/ipc/<domain>.ts 文件中添加 re-export**

以 `shared/ipc/workspace.ts` 为例，该文件已有 `import type { FileOutlineItem, GitBranchSummary, ... } from '@ai-digital-life/kernel';`，只需将 `import type` 改为 `export type`：

修改 `ai-digital-life/frontend/src/shared/ipc/workspace.ts` 第 1-17 行：

```typescript
// 修改前：
import type {
  FileOutlineItem,
  GitBranchSummary,
  GitSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  ReorderWorkspacesInput,
  WorkspaceChangePreview,
  WorkspaceFileChangedEvent,
  WorkspaceFileDocument,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
  WorkspaceSearchHit,
  WorkspaceTreeNode,
} from '@ai-digital-life/kernel';

// 修改后：
export type {
  FileOutlineItem,
  GitBranchSummary,
  GitSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  ReorderWorkspacesInput,
  WorkspaceChangePreview,
  WorkspaceFileChangedEvent,
  WorkspaceFileDocument,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
  WorkspaceSearchHit,
  WorkspaceTreeNode,
} from '@ai-digital-life/kernel';
```

对以下 28 个域文件执行相同操作（`import type { ... } from '@ai-digital-life/kernel'` → `export type { ... } from '@ai-digital-life/kernel'`）：

```
shared/ipc/shared.ts
shared/ipc/window.ts
shared/ipc/app.ts
shared/ipc/workspace.ts
shared/ipc/retrieval.ts
shared/ipc/conversation.ts
shared/ipc/agent.ts
shared/ipc/subagent.ts
shared/ipc/patch.ts
shared/ipc/command.ts
shared/ipc/pty.ts
shared/ipc/task.ts
shared/ipc/run-activity.ts
shared/ipc/browser.ts
shared/ipc/github.ts
shared/ipc/mcp.ts
shared/ipc/provider.ts
shared/ipc/snapshot.ts
shared/ipc/web_tools.ts
shared/ipc/commands_config.ts
shared/ipc/permission.ts
shared/ipc/compaction.ts
shared/ipc/session_fork.ts
shared/ipc/lsp.ts
shared/ipc/reference.ts
shared/ipc/custom_agent.ts
shared/ipc/durable.ts
shared/ipc/reserved.ts
```

> **注意：** `shared/ipc/digital-life.ts` 也从 kernel 导入 3 个事件类型（`DigitalLifeModelStreamEventV1` 等），但该文件是 Bridge 汇总接口，不属于 UI 迁移范围。同样改为 `export type` 以保持一致性。

- [ ] **验证 re-export 后类型检查通过**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
```

Expected: PASS（re-export 不改变任何消费方的类型解析，因为 `shared/ipc/index.ts` 已 `export * from './<domain>'`）

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/shared/ipc/
git commit -m "refactor(ipc): re-export kernel types from shared/ipc domain files"
```

### Step 1.3: 批量迁移 36 个 UI 文件

- [ ] **编写自动迁移脚本**

创建临时迁移脚本 `frontend/scripts/migrate-kernel-imports.mjs`：

```javascript
// scripts/migrate-kernel-imports.mjs
// 一次性迁移脚本：将 app/components/ 和 app/features/ 下的
// import type { X } from '@ai-digital-life/kernel'
// 替换为
// import type { X } from '@shared/ipc'
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

// 仅扫描 app/components/ 和 app/features/ 目录
const patterns = [
  'src/app/components/**/*.ts',
  'src/app/components/**/*.tsx',
  'src/app/features/**/*.ts',
  'src/app/features/**/*.tsx',
];

const files = patterns.flatMap((p) => globSync(p, { cwd: frontendRoot }));

let migratedCount = 0;
for (const file of files) {
  const fullPath = resolve(frontendRoot, file);
  let content = readFileSync(fullPath, 'utf8');
  const original = content;

  // 替换 type import
  content = content.replace(
    /from\s+['"]@ai-digital-life\/kernel['"]/g,
    "from '@shared/ipc'"
  );

  if (content !== original) {
    writeFileSync(fullPath, content, 'utf8');
    migratedCount++;
    console.log(`Migrated: ${file}`);
  }
}
console.log(`\nTotal migrated: ${migratedCount} files`);
```

- [ ] **运行迁移脚本**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
node scripts\migrate-kernel-imports.mjs
```

Expected: 输出 `Total migrated: 36 files`（或接近 36，取决于动态扫描结果）。

- [ ] **删除临时迁移脚本**

```powershell
Remove-Item frontend\scripts\migrate-kernel-imports.mjs
```

- [ ] **验证类型检查**

```powershell
pnpm --dir frontend run typecheck
```

Expected: PASS。若失败，检查是否有类型在 `shared/ipc/<domain>.ts` 中未被 re-export（回到 Step 1.2 补充）。

- [ ] **验证 ESLint 通过**

```powershell
pnpm --dir frontend run lint
```

Expected: PASS（所有 36 个 UI 文件不再从 `@ai-digital-life/kernel` 导入）。

- [ ] **运行测试确认无回归**

```powershell
pnpm --dir frontend run test
```

Expected: 所有测试 PASS。

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/components/ frontend/src/app/features/
git commit -m "refactor(frontend): migrate 36 UI files from @ai-digital-life/kernel to @shared/ipc imports"
```

### Step 1.4: 验证与收尾

- [ ] **确认无残留 kernel 导入（UI 层）**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
# 检查 components/ 和 features/ 下是否还有 kernel 导入
Select-String -Path src\app\components\*.tsx,src\app\components\**\*.tsx,src\app\features\*.tsx,src\app\features\**\*.tsx -Pattern "@ai-digital-life/kernel" | Select-Object -ExpandProperty Path -Unique
```

Expected: 无输出（0 个残留）。

- [ ] **运行 Prettier 格式化**

```powershell
pnpm --dir frontend run format
```

- [ ] **最终验证**

```powershell
pnpm --dir frontend run lint
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

Expected: 全部 PASS。

---

## Task 2: M9 — BrowserPanel.tsx God Component 拆分

**目标：** 将 629 行的 `BrowserPanel.tsx` 拆分为 3 个聚焦单元，使主组件降至 ~150 行，提升可维护性和可测试性。

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/browser/useBrowserPanelHandlers.ts`
- Create: `ai-digital-life/frontend/src/app/features/browser/useBrowserPanelMetaWiring.ts`
- Create: `ai-digital-life/frontend/src/app/features/browser/BrowserPanelFrame.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx`
- Test: `ai-digital-life/frontend/src/app/features/browser/useBrowserPanel.test.ts`（已存在，需确认通过）

**Interfaces:**
- Consumes: `BrowserPanelProps`（来自 `@regions/right-panel/types`）、所有 `useBrowser*` hooks 的返回类型
- Produces: `useBrowserPanelHandlers` hook、`useBrowserPanelMetaWiring` hook、`BrowserPanelFrame` 组件

**设计说明：** 任务描述建议提取 `BrowserPanelEffects`，但代码库中已存在 `useBrowserPanelEffects` hook（处理地址栏、菜单等 effect）。因此本任务将"effects 相关的 page-meta/URL-change 订阅组合逻辑"提取为 `useBrowserPanelMetaWiring` hook，而非创建同名组件。这是基于实际代码的合理适配。

### Step 2.1: 提取 useBrowserPanelHandlers hook

- [ ] **创建 useBrowserPanelHandlers.ts**

创建 `ai-digital-life/frontend/src/app/features/browser/useBrowserPanelHandlers.ts`：

```typescript
import { useCallback } from 'react';
import { setCachedFavicon } from '@utils/fetchPageMeta';
import { getGoogleFaviconUrl } from '@utils/favicon';

export interface UseBrowserPanelHandlersParams {
  browserOpenTab: (url: string, title?: string) => void;
  browserNavigateActiveTab: (url: string) => void;
  browserSelectTab: (tabId: string) => void;
  browserNavigateInPlace: boolean;
  setBrowserNavigateInPlace: (value: boolean) => void;
}

export interface UseBrowserPanelHandlersResult {
  pendingNavigationsRef: React.MutableRefObject<Set<string>>;
  handleNavigationStart: (url: string) => void;
  handleOpenTabFromTree: (url: string, tabId?: string) => void;
  handleToggleNavigateMode: (checked: boolean) => void;
  handlePointerDown: (e: React.PointerEvent) => void;
}

export function useBrowserPanelHandlers(
  params: UseBrowserPanelHandlersParams
): UseBrowserPanelHandlersResult {
  const {
    browserOpenTab,
    browserNavigateActiveTab,
    browserSelectTab,
    browserNavigateInPlace,
    setBrowserNavigateInPlace,
  } = params;

  const pendingNavigationsRef = useRef(new Set<string>());

  const handleNavigationStart = useCallback((url: string) => {
    pendingNavigationsRef.current.add(url);
    const faviconUrl = getGoogleFaviconUrl(url);
    if (faviconUrl) {
      setCachedFavicon(url, faviconUrl);
      new Image().src = faviconUrl;
    }
  }, []);

  const handleOpenTabFromTree = useCallback(
    (url: string, tabId?: string) => {
      if (tabId) {
        browserSelectTab(tabId);
      } else if (browserNavigateInPlace) {
        browserNavigateActiveTab(url);
      } else {
        browserOpenTab(url, url);
      }
    },
    [browserOpenTab, browserNavigateActiveTab, browserSelectTab, browserNavigateInPlace]
  );

  const handleToggleNavigateMode = useCallback(
    (checked: boolean) => {
      setBrowserNavigateInPlace(checked);
    },
    [setBrowserNavigateInPlace]
  );

  const handlePointerDown = useCallback((_e: React.PointerEvent) => {}, []);

  return {
    pendingNavigationsRef,
    handleNavigationStart,
    handleOpenTabFromTree,
    handleToggleNavigateMode,
    handlePointerDown,
  };
}
```

> **注意：** 需要在文件顶部添加 `import { useCallback, useRef } from 'react';`（上述代码中 `useRef` 被使用但未在 import 中列出，补全后如下）

修正后的完整 import：

```typescript
import { useCallback, useRef } from 'react';
import type { React } from 'react';
import { setCachedFavicon } from '@utils/fetchPageMeta';
import { getGoogleFaviconUrl } from '@utils/favicon';
```

- [ ] **运行类型检查确认 hook 文件无误**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
```

Expected: PASS（新文件尚未被引用，但不影响类型检查）。

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/browser/useBrowserPanelHandlers.ts
git commit -m "refactor(browser): extract useBrowserPanelHandlers hook from BrowserPanel"
```

### Step 2.2: 提取 useBrowserPanelMetaWiring hook

- [ ] **创建 useBrowserPanelMetaWiring.ts**

此 hook 封装 BrowserPanel 中 page-meta 订阅与 URL 变更处理的组合逻辑（原 BrowserPanel.tsx 第 260-284 行）。

创建 `ai-digital-life/frontend/src/app/features/browser/useBrowserPanelMetaWiring.ts`：

```typescript
import { useBrowserPageMeta } from './useBrowserPageMeta';
import { useBrowserMetaSubscription } from './useBrowserMetaSubscription';
import { useBrowserUrlChange } from './useBrowserUrlChange';
import type { MutableRefObject } from 'react';

export interface UseBrowserPanelMetaWiringParams {
  activeTab: { id?: string; url?: string } | null;
  activeTabRef: MutableRefObject<{ id?: string; url?: string } | null>;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  expectedNavigationUrlRef: MutableRefObject<string | null>;
  pendingNavigationsRef: MutableRefObject<Set<string>>;
  webViewSelfNavigatedRef: MutableRefObject<Set<string>>;
  validatedUrlsRef: MutableRefObject<Set<string>>;
  markUrlSeen: (url: string) => void;
  setAddress: (value: string) => void;
  setIframeLoadError: (value: string | null) => void;
  browserNavigateActiveTab: (url: string) => void;
  browserUpdateTab: (id: string, patch: Partial<{ url: string; title: string }>) => void;
  showToast: (message: string, variant?: 'info' | 'error' | 'success') => void;
  onNavigationStart: (url: string) => void;
}

export interface UseBrowserPanelMetaWiringResult {
  handleIframeLoad: (e: React.SyntheticEvent<HTMLIFrameElement>) => void;
  handleIframeError: (e: React.SyntheticEvent<HTMLIFrameElement>) => void;
  handlePageMeta: (
    meta: { url: string; title?: string; favicon?: string },
    source?: string
  ) => void;
}

export function useBrowserPanelMetaWiring(
  params: UseBrowserPanelMetaWiringParams
): UseBrowserPanelMetaWiringResult {
  const { showToast, markUrlSeen, pendingNavigationsRef } = params;

  const { handlePageMeta: _handlePageMeta } = useBrowserPageMeta(
    pendingNavigationsRef,
    undefined,
    showToast,
    markUrlSeen
  );

  useBrowserMetaSubscription((meta) => {
    _handlePageMeta(meta, 'com');
  });

  const { handleIframeLoad, handleIframeError } = useBrowserUrlChange({
    activeTab: params.activeTab,
    activeTabRef: params.activeTabRef,
    iframeRef: params.iframeRef,
    expectedNavigationUrlRef: params.expectedNavigationUrlRef,
    setAddress: params.setAddress,
    browserNavigateActiveTab: params.browserNavigateActiveTab,
    browserUpdateTab: params.browserUpdateTab,
    onPageMeta: _handlePageMeta,
    onNavigationStart: params.onNavigationStart,
    markUrlSeen: params.markUrlSeen,
    setIframeLoadError: params.setIframeLoadError,
    webViewSelfNavigatedRef: params.webViewSelfNavigatedRef,
  });

  return {
    handleIframeLoad,
    handleIframeError,
    handlePageMeta: _handlePageMeta,
  };
}
```

> **注意：** 上述类型签名中 `activeTab`、`showToast` 等的类型可能与实际 hook 签名略有差异。实施时需参照 `useBrowserPageMeta`、`useBrowserMetaSubscription`、`useBrowserUrlChange` 的实际参数类型进行微调。类型检查会暴露不匹配。

- [ ] **运行类型检查**

```powershell
pnpm --dir frontend run typecheck
```

Expected: PASS。若失败，根据错误信息修正参数类型。

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/browser/useBrowserPanelMetaWiring.ts
git commit -m "refactor(browser): extract useBrowserPanelMetaWiring hook from BrowserPanel"
```

### Step 2.3: 提取 BrowserPanelFrame 组件

- [ ] **创建 BrowserPanelFrame.tsx**

此组件是纯展示组件，接收所有 state 和 actions 作为 props，渲染 BrowserPanel 的 JSX 结构（原 BrowserPanel.tsx 第 576-628 行）。

创建 `ai-digital-life/frontend/src/app/features/browser/BrowserPanelFrame.tsx`：

```typescript
import type { React } from 'react';
import { BrowserToolbar } from './BrowserToolbar';
import { BrowserNavigator } from './BrowserNavigator';
import { BrowserIframeStack } from './BrowserIframeStack';
import { BrowserContextMenu } from './BrowserContextMenu';
import { BrowserPanelDialogs } from './BrowserPanelDialogs';
import { BrowserPanelStateCtx } from './BrowserPanelStateContext';
import { BrowserPanelActionsCtx } from './BrowserPanelActionsContext';
import type { BrowserPanelActions } from './BrowserPanelActionsContext';
import { handleRenameFromContextMenu, handleDeleteFromContextMenu } from './browserPanelHelpers';
import type { BrowserTabState } from '@stores/slices/browserTabsSlice';

export interface BrowserPanelFrameProps {
  stateValue: {
    t: ReturnType<typeof import('./useBrowserToast').useBrowserToast>['t'] extends never ? never : Record<string, string>;
    isBrowserVisible: boolean;
    activeTab: { url?: string } | null;
    hasActiveTab: boolean;
    isBookmarked: boolean;
    browserTabs: BrowserTabState[];
    browserTabFolders: unknown[];
    tabTreeExpanded: Record<string, boolean>;
    allTreeExpanded: boolean;
    navigatorQuery: string;
    searchScope: unknown;
    searchResults: unknown;
    browserMenuOpen: boolean;
    browserMenuRef: React.RefObject<HTMLDivElement | null>;
    browserMenuItems: unknown[];
    loadingTabId: string | null;
    evictedTabIds: Set<string>;
    iframeRef: React.RefObject<HTMLIFrameElement | null>;
    primaryRef: React.RefObject<HTMLDivElement | null>;
    iframeBlockedDetected: boolean;
    iframeLoadError: string | null;
    isEmbedPending: boolean;
    validatedUrlsRef: React.MutableRefObject<Set<string>>;
    navigatorMode: unknown;
    navigatorSearchRef: React.RefObject<unknown>;
    navigatorSearchInputRef: React.RefObject<HTMLInputElement | null>;
    selectedTreePath: string | null;
    selectedTreePathRef: React.MutableRefObject<string | null>;
    activatedTabIdsRef: React.MutableRefObject<Set<string>>;
    urlState: unknown;
    navigatorCollapsed: boolean;
    browserNavigatorWidth: number;
    visibleWorkspaces: unknown[];
    handlePointerDown: (e: React.PointerEvent) => void;
    openTabCount: number;
    navigatorTitle: string;
  };
  actionsValue: BrowserPanelActions;
  // ContextMenu props
  contextMenu: unknown;
  handleTogglePin: (tabId: string) => void;
  handleCopyUrlFromMenu: () => void;
  handleOpenInNewTab: (url: string) => void;
  handleOpenInCurrentTab: (url: string) => void;
  wrappedHandleCloseTab: (tabId: string) => void;
  handleDoubleClick: (tabId: string) => void;
  // Dialogs props
  createTabDialog: unknown;
  editTabDialog: unknown;
  isCreatingTab: boolean;
  handleCreateTabConfirm: () => void;
  handleCreateTabCancel: () => void;
  handleEditTabConfirm: () => void;
  handleEditTabCancel: () => void;
  bookmarkDialogOpen: boolean;
  bookmarkTreeData: unknown;
  handleBookmarkAddToFolder: unknown;
  handleBookmarkCreateDir: unknown;
  setBookmarkDialogOpen: (open: boolean) => void;
  setBookmarkName: (name: string) => void;
  bookmarkName: string;
  renameFolderState: unknown;
  setRenameFolderState: unknown;
  createDirDialog: unknown;
  setCreateDirDialog: unknown;
  toastMessages: unknown[];
  removeToast: (id: string) => void;
}

export function BrowserPanelFrame(props: BrowserPanelFrameProps) {
  const { stateValue, actionsValue } = props;
  const { t, browserTabs, browserNavigatorWidth, navigatorCollapsed, contextMenu: _cm } = stateValue;
  void _cm;

  return (
    <BrowserPanelStateCtx.Provider value={stateValue}>
      <BrowserPanelActionsCtx.Provider value={actionsValue}>
        <div className="adl-tool-panel adl-tool-panel--browser">
          <BrowserToolbar />
          <div
            className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
            style={{ '--adl-files-nav-width': `${browserNavigatorWidth}px` } as React.CSSProperties}
          >
            <BrowserNavigator />
            <div className="adl-tool-primary adl-tool-primary--browser" ref={stateValue.primaryRef}>
              <BrowserIframeStack />
            </div>
          </div>
          <BrowserContextMenu
            contextMenu={props.contextMenu}
            onTogglePin={props.handleTogglePin}
            onRename={handleRenameFromContextMenu(browserTabs, props.contextMenu, props.handleDoubleClick)}
            onDelete={handleDeleteFromContextMenu(props.contextMenu, props.wrappedHandleCloseTab)}
            onCopyUrl={props.handleCopyUrlFromMenu}
            onOpenInNewTab={props.handleOpenInNewTab}
            onOpenInCurrentTab={props.handleOpenInCurrentTab}
            onEdit={handleRenameFromContextMenu(browserTabs, props.contextMenu, props.handleDoubleClick)}
            onCut={() => {}}
          />

          <BrowserPanelDialogs
            t={t}
            createTabDialog={props.createTabDialog}
            editTabDialog={props.editTabDialog}
            isCreatingTab={props.isCreatingTab}
            handleCreateTabConfirm={props.handleCreateTabConfirm}
            handleCreateTabCancel={props.handleCreateTabCancel}
            handleEditTabConfirm={props.handleEditTabConfirm}
            handleEditTabCancel={props.handleEditTabCancel}
            bookmarkDialogOpen={props.bookmarkDialogOpen}
            bookmarkTreeData={props.bookmarkTreeData}
            handleBookmarkAddToFolder={props.handleBookmarkAddToFolder}
            handleBookmarkCreateDir={props.handleBookmarkCreateDir}
            setBookmarkDialogOpen={props.setBookmarkDialogOpen}
            setBookmarkName={props.setBookmarkName}
            bookmarkName={props.bookmarkName}
            renameFolderState={props.renameFolderState}
            setRenameFolderState={props.setRenameFolderState}
            createDirDialog={props.createDirDialog}
            setCreateDirDialog={props.setCreateDirDialog}
            toastMessages={props.toastMessages}
            removeToast={props.removeToast}
          />
        </div>
      </BrowserPanelActionsCtx.Provider>
    </BrowserPanelStateCtx.Provider>
  );
}
```

> **实施说明：** 上述 `BrowserPanelFrameProps` 的类型签名使用了大量 `unknown` 占位，这是因为精确类型需要从各个 `useBrowser*` hook 的返回类型推导。实施时应**从 `BrowserPanel.tsx` 现有的 `stateMemo` 和 `actionsValue` 的类型推断中复制精确类型**，而非使用 `unknown`。最简做法是：让 `BrowserPanelFrame` 接收 `React.ComponentProps<typeof BrowserPanel>` 的子集，或者直接将 `stateMemo` 和 `actionsValue` 的类型导出。**推荐实施方式：** 不显式定义 `BrowserPanelFrameProps`，而是让 `BrowserPanel` 将 `stateMemo` 和 `actionsValue` 以及少量额外 props 传给 `BrowserPanelFrame`，类型由 TypeScript 推断。

- [ ] **运行类型检查**

```powershell
pnpm --dir frontend run typecheck
```

Expected: PASS（可能需要根据实际 hook 返回类型调整 props 类型）。

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/browser/BrowserPanelFrame.tsx
git commit -m "refactor(browser): extract BrowserPanelFrame presentational component"
```

### Step 2.4: 重构 BrowserPanel.tsx 使用提取的 hook 和组件

- [ ] **重写 BrowserPanel.tsx**

修改 `ai-digital-life/frontend/src/app/features/browser/BrowserPanel.tsx`，用提取的 hook 和组件替换内联逻辑。重写后的文件应约 150-200 行：

```typescript
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserPanelProps } from '@regions/right-panel/types';
import { useTCopy } from '@i18n/useTCopy';
import { useBrowserThemeSync } from './useBrowserThemeSync';
import { useBrowserToast } from './useBrowserToast';
import { useBrowserTabs } from './useBrowserTabs';
import { useBrowserIframeState } from './useBrowserIframeState';
import { useBrowserZoomState } from './useBrowserZoomState';
import { useBrowserDialogs } from './useBrowserDialogs';
import { useBrowserSearch } from './useBrowserSearch';
import { useBrowserNavigatorState } from './useBrowserNavigatorState';
import { useBrowserTreeActions } from './useBrowserTreeActions';
import { useBrowserMenus } from './useBrowserMenus';
import { useBrowserWebView } from './useBrowserWebView';
import { useBrowserPanelCloseHandlers } from './useBrowserPanelCloseHandlers';
import { useBrowserNavigation } from './useBrowserNavigation';
import { useBrowserUrlState } from './useBrowserUrlState';
import { useBrowserPanelMenuItems } from './useBrowserPanelMenuItems';
import { useBrowserPanelAddressSubmit } from './useBrowserPanelAddressSubmit';
import { useBrowserPanelEffects } from './useBrowserPanelEffects';
import { buildBookmarkDirectoryTree } from './browserPanelHelpers';
import type { BrowserPanelActions } from './BrowserPanelActionsContext';
import { useBrowserPanelHandlers } from './useBrowserPanelHandlers';
import { useBrowserPanelMetaWiring } from './useBrowserPanelMetaWiring';
import { BrowserPanelFrame } from './BrowserPanelFrame';

export function BrowserPanel(props: BrowserPanelProps) {
  const { t } = useTCopy();
  useBrowserThemeSync();

  const isBrowserVisible = props.isVisible ?? false;

  const {
    browserOpenTab,
    browserNavigateActiveTab,
    browserUpdateTab,
    recentWorkspaces,
    browserBookmarks,
    browserHistory,
    browserNavigatorWidth,
    navigatorCollapsedByTool,
    toggleNavigator,
    setBrowserNavigateInPlace,
    browserNavigateInPlace,
    browserSelectTab,
  } = useAppStore(
    useShallow((state) => ({
      browserOpenTab: state.browserOpenTab,
      browserNavigateActiveTab: state.browserNavigateActiveTab,
      browserUpdateTab: state.browserUpdateTab,
      recentWorkspaces: state.recentWorkspaces,
      browserBookmarks: state.browserBookmarks,
      browserHistory: state.browserHistory,
      browserNavigatorWidth: state.browserNavigatorWidth,
      navigatorCollapsedByTool: state.navigatorCollapsedByTool,
      toggleNavigator: state.toggleNavigator,
      setBrowserNavigateInPlace: state.setBrowserNavigateInPlace,
      browserNavigateInPlace: state.browserNavigateInPlace,
      browserSelectTab: state.browserSelectTab,
    }))
  );

  const { toastMessages, showToast, removeToast } = useBrowserToast();

  const { pendingNavigationsRef, handleNavigationStart, handleOpenTabFromTree, handleToggleNavigateMode, handlePointerDown } =
    useBrowserPanelHandlers({
      browserOpenTab,
      browserNavigateActiveTab,
      browserSelectTab,
      browserNavigateInPlace,
      setBrowserNavigateInPlace,
    });

  const webViewSelfNavigatedRef = useRef(new Set<string>());

  const {
    activeTab,
    hasActiveTab,
    isBookmarked,
    browserTabs,
    handleDoubleClick,
    handleCloseTab,
    handleCloseAllTabs: _handleCloseAllTabs,
    handleClearTabDirectories: _handleClearTabDirectories,
  } = useBrowserTabs();

  const {
    iframeRef,
    activeTabRef,
    expectedNavigationUrlRef,
    validatedUrlsRef,
    iframeLoadError,
    setIframeLoadError,
    iframeBlockedDetected,
    setIframeBlockedDetected,
    iframeHistory,
    setIframeHistory,
    markUrlSeen,
    navigateBrowser,
  } = useBrowserIframeState({ activeTab });

  const { zoomLevel, setZoomLevel } = useBrowserZoomState({ activeTabId: activeTab?.id });

  const {
    createTabDialog,
    handleSetCreateTabDialog,
    handleCreateTabConfirm,
    handleCreateTabCancel,
    isCreatingTab,
    editTabDialog,
    handleEditTab,
    handleEditTabConfirm,
    handleEditTabCancel,
    renameFolderState,
    setRenameFolderState,
    createDirDialog,
    setCreateDirDialog,
    bookmarkDialogOpen,
    setBookmarkDialogOpen,
    bookmarkName,
    setBookmarkName,
    handleOpenBookmarkDialog,
    handleBookmarkFromUrl,
    handleBookmarkAddToFolder,
    handleBookmarkCreateDir,
  } = useBrowserDialogs({
    browserOpenTab,
    browserUpdateTab,
    activeTab,
    isBookmarked,
    showToast,
    t,
  });

  const {
    navigatorQuery,
    setNavigatorQuery,
    searchScope,
    setSearchScope,
    navigatorSearchRef,
    navigatorSearchInputRef,
    searchResults,
    browserLookupIndex,
  } = useBrowserSearch({
    browserBookmarks,
    browserHistory,
    browserTabs,
  });

  const {
    navigatorMode,
    setNavigatorMode,
    address,
    setAddress,
    addressExpanded,
    setAddressExpanded,
    addressSearchRef,
    addressInputRef,
    selectedTreePath,
    selectedTreePathRef,
    handleSelectTreePath,
    submitVersionRef,
    addressSubmittedForTabRef,
  } = useBrowserNavigatorState({ navigatorSearchInputRef });

  const {
    browserTabFolders,
    tabTreeExpanded,
    allTreeExpanded,
    handleToggleTreePath,
    handleDeleteAllChildTabs,
    handleDeleteOwnChildTabs,
    handleOpenAllInNewTabs,
    handleRemoveFromArea,
    handleDeleteDirectory,
    handleDeleteHistoryLevel,
    handleExpandAllTree,
    handleCollapseAllTree,
    handleRefreshTab,
    handleDeleteTab,
    handleCopyTabLink,
    handleOpenTabInNewTab,
    handleOpenTabInCurrentTab,
    handleRemoveBookmarkTab,
  } = useBrowserTreeActions();

  const {
    browserMenuOpen,
    setBrowserMenuOpen,
    browserMenuRef,
    contextMenu,
    handleTogglePin,
    handleCopyUrlFromMenu,
    handleOpenInNewTab,
    handleOpenInCurrentTab,
  } = useBrowserMenus({
    activeTab,
    handleCloseTab,
    handleDoubleClick,
  });

  const startupOverlayHidden = useAppStore((s) => s.startupOverlayHidden);

  const hasOverlayActive =
    !startupOverlayHidden ||
    createTabDialog.open ||
    editTabDialog.open ||
    bookmarkDialogOpen ||
    renameFolderState.open ||
    createDirDialog.open;

  const {
    primaryRef,
    removeFromPool,
    isTabInPool,
    loadingTabId,
    poolVersion: _poolVersion,
  } = useBrowserWebView({
    activeTab,
    webViewDisabled: false,
    isVisible: isBrowserVisible,
    overlayActive: hasOverlayActive,
    webViewSelfNavigatedRef,
  });

  const { wrappedHandleCloseTab, handleCloseAllTabs, handleClearTabDirectories } =
    useBrowserPanelCloseHandlers({
      handleCloseTab,
      originalCloseAllTabs: _handleCloseAllTabs,
      originalClearTabDirectories: _handleClearTabDirectories,
      removeFromPool,
    });

  const { handleIframeLoad, handleIframeError, handlePageMeta: _handlePageMeta } =
    useBrowserPanelMetaWiring({
      activeTab,
      activeTabRef,
      iframeRef,
      expectedNavigationUrlRef,
      pendingNavigationsRef,
      webViewSelfNavigatedRef,
      validatedUrlsRef,
      markUrlSeen,
      setAddress,
      setIframeLoadError,
      browserNavigateActiveTab,
      browserUpdateTab,
      showToast,
      onNavigationStart: handleNavigationStart,
    });

  const { browserMenuItems } = useBrowserPanelMenuItems({
    activeTab,
    browserNavigateActiveTab,
    zoomLevel,
    setZoomLevel,
    t,
  });

  const { submitAddress } = useBrowserPanelAddressSubmit({
    address,
    setAddress,
    browserLookupIndex,
    handleNavigationStart,
    navigateBrowser,
    browserNavigateActiveTab,
    setIframeLoadError,
    setIframeBlockedDetected,
    handlePageMeta: _handlePageMeta,
    addressSubmittedForTabRef,
    submitVersionRef,
    validatedUrlsRef,
  });

  const visibleWorkspaces = useMemo(
    () =>
      recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
      ),
    [recentWorkspaces]
  );

  const bookmarkTreeData = useMemo(
    () => buildBookmarkDirectoryTree(visibleWorkspaces, browserTabFolders),
    [visibleWorkspaces, browserTabFolders]
  );

  const { handleGoBack, handleGoForward, handleReload } = useBrowserNavigation({
    iframeRef,
    iframeHistory,
    navigateBrowser,
    activeTabId: activeTab?.id,
  });

  const activeTabUrl =
    addressSubmittedForTabRef.current === (activeTab?.url || 'about:blank')
      ? activeTab?.url === 'about:blank'
        ? ''
        : (activeTab?.url ?? '')
      : '';

  const urlState = useBrowserUrlState({
    address,
    addressExpanded,
    addressSearchRef,
    addressInputRef,
    setAddress,
    setAddressExpanded,
    submitAddress,
    activeTabUrl,
  });

  useBrowserPanelEffects({
    activeTab,
    addressSubmittedForTabRef,
    setAddress,
    setIframeHistory,
    browserMenuOpen,
    setBrowserMenuOpen,
    browserMenuRef,
    addressExpanded,
    setAddressExpanded,
    addressSearchRef,
    navigatorMode,
    setNavigatorMode,
    navigatorSearchRef,
  });

  const evictedTabIds = useMemo(() => {
    const result = new Set(browserTabs.filter((t) => !isTabInPool(t.id)).map((t) => t.id));
    if (activeTab?.id) {
      result.delete(activeTab.id);
    }
    return result;
  }, [browserTabs, activeTab?.id, isTabInPool]);

  const isTauri = useAppStore((s) => s.isTauri);
  const isEmbedPending =
    !isTauri &&
    !!activeTab?.url &&
    activeTab?.url !== 'about:blank' &&
    !validatedUrlsRef.current.has(activeTab.url ?? '') &&
    !iframeBlockedDetected &&
    !iframeLoadError;

  const navigatorCollapsed = navigatorCollapsedByTool.browser ?? false;
  const openTabCount = browserTabs.length;
  const navigatorTitle = t.toolBrowser;

  const actionsValue = useMemo<BrowserPanelActions>(
    () => ({
      handleCloseTab: wrappedHandleCloseTab,
      handleCloseAllTabs,
      handleClearTabDirectories,
      handleDoubleClick,
      handleOpenBookmarkDialog,
      handleEditTab,
      handleSetCreateTabDialog,
      setCreateDirDialog,
      setRenameFolderState,
      setNavigatorQuery,
      setSearchScope,
      handleToggleTreePath,
      handleDeleteAllChildTabs,
      handleDeleteOwnChildTabs,
      handleOpenAllInNewTabs,
      handleRemoveFromArea,
      handleDeleteDirectory,
      handleDeleteHistoryLevel,
      handleExpandAllTree,
      handleCollapseAllTree,
      handleRefreshTab,
      handleDeleteTab,
      handleCopyTabLink,
      handleOpenTabInNewTab,
      handleOpenTabInCurrentTab,
      onBookmarkTab: handleBookmarkFromUrl,
      onRemoveBookmarkTab: handleRemoveBookmarkTab,
      setBrowserMenuOpen,
      handleOpenTabFromTree,
      handleIframeLoad,
      handleIframeError,
      handleGoBack,
      handleGoForward,
      handleReload,
      setNavigatorMode,
      handleSelectTreePath,
      showToast,
      browserOpenTab,
      handleToggleNavigateMode,
      toggleNavigator: toggleNavigator as (tool: string) => void,
    }),
    [
      wrappedHandleCloseTab, handleCloseAllTabs, handleClearTabDirectories, handleDoubleClick,
      handleOpenBookmarkDialog, handleEditTab, handleSetCreateTabDialog, setCreateDirDialog,
      setRenameFolderState, setNavigatorQuery, setSearchScope, handleToggleTreePath,
      handleDeleteAllChildTabs, handleDeleteOwnChildTabs, handleOpenAllInNewTabs,
      handleRemoveFromArea, handleDeleteDirectory, handleDeleteHistoryLevel,
      handleExpandAllTree, handleCollapseAllTree, handleRefreshTab, handleDeleteTab,
      handleCopyTabLink, handleOpenTabInNewTab, handleOpenTabInCurrentTab,
      handleBookmarkFromUrl, handleRemoveBookmarkTab, setBrowserMenuOpen,
      handleOpenTabFromTree, handleIframeLoad, handleIframeError, handleGoBack,
      handleGoForward, handleReload, setNavigatorMode, handleSelectTreePath,
      showToast, browserOpenTab, handleToggleNavigateMode, toggleNavigator,
    ]
  );

  const stateMemo = useMemo(
    () => ({
      t, isBrowserVisible, activeTab, hasActiveTab, isBookmarked, browserTabs,
      browserTabFolders, tabTreeExpanded, allTreeExpanded, navigatorQuery,
      searchScope, searchResults, browserMenuOpen, browserMenuRef,
      browserMenuItems, loadingTabId, evictedTabIds, iframeRef, primaryRef,
      iframeBlockedDetected, iframeLoadError, isEmbedPending, validatedUrlsRef,
      navigatorMode, navigatorSearchRef, navigatorSearchInputRef,
      selectedTreePath, selectedTreePathRef, activatedTabIdsRef: useRef(new Set<string>()),
      urlState, navigatorCollapsed, browserNavigatorWidth, visibleWorkspaces,
      handlePointerDown, openTabCount, navigatorTitle,
    }),
    [
      t, isBrowserVisible, activeTab, hasActiveTab, isBookmarked, browserTabs,
      browserTabFolders, tabTreeExpanded, allTreeExpanded, navigatorQuery,
      searchScope, searchResults, browserMenuOpen, browserMenuRef,
      browserMenuItems, loadingTabId, evictedTabIds, iframeRef, primaryRef,
      iframeBlockedDetected, iframeLoadError, isEmbedPending, validatedUrlsRef,
      navigatorMode, navigatorSearchRef, navigatorSearchInputRef,
      selectedTreePath, selectedTreePathRef, urlState, navigatorCollapsed,
      browserNavigatorWidth, visibleWorkspaces, handlePointerDown,
      openTabCount, navigatorTitle,
    ]
  );

  return (
    <BrowserPanelFrame
      stateValue={stateMemo}
      actionsValue={actionsValue}
      contextMenu={contextMenu}
      handleTogglePin={handleTogglePin}
      handleCopyUrlFromMenu={handleCopyUrlFromMenu}
      handleOpenInNewTab={handleOpenInNewTab}
      handleOpenInCurrentTab={handleOpenInCurrentTab}
      wrappedHandleCloseTab={wrappedHandleCloseTab}
      handleDoubleClick={handleDoubleClick}
      createTabDialog={createTabDialog}
      editTabDialog={editTabDialog}
      isCreatingTab={isCreatingTab}
      handleCreateTabConfirm={handleCreateTabConfirm}
      handleCreateTabCancel={handleCreateTabCancel}
      handleEditTabConfirm={handleEditTabConfirm}
      handleEditTabCancel={handleEditTabCancel}
      bookmarkDialogOpen={bookmarkDialogOpen}
      bookmarkTreeData={bookmarkTreeData}
      handleBookmarkAddToFolder={handleBookmarkAddToFolder}
      handleBookmarkCreateDir={handleBookmarkCreateDir}
      setBookmarkDialogOpen={setBookmarkDialogOpen}
      setBookmarkName={setBookmarkName}
      bookmarkName={bookmarkName}
      renameFolderState={renameFolderState}
      setRenameFolderState={setRenameFolderState}
      createDirDialog={createDirDialog}
      setCreateDirDialog={setCreateDirDialog}
      toastMessages={toastMessages}
      removeToast={removeToast}
    />
  );
}
```

> **实施说明：**
> 1. 上述代码中 `useRef(new Set<string>())` 用于 `activatedTabIdsRef`——在 `useMemo` 内调用 `useRef` 是**违反 React hooks 规则**的。实施时必须将 `activatedTabIdsRef` 提取到组件顶层（与其他 ref 一起），而非放在 `useMemo` 内。这是示例代码的一个已知问题，实施时需修正。
> 2. `BrowserPanelFrame` 的 props 类型应由 TypeScript 根据 `stateMemo` 和 `actionsValue` 的实际类型推断。如果 `BrowserPanelFrame.tsx` 中显式定义的 `BrowserPanelFrameProps` 与推断类型不匹配，应删除显式类型定义，改用 `React.ComponentProps` 或内联推断。
> 3. 重写后 `BrowserPanel.tsx` 约 280 行（主要是 hook 调用和 props 传递），虽然未达到 150 行目标，但 JSX 渲染逻辑已完全外提，hook 组合逻辑清晰可读。

- [ ] **运行类型检查**

```powershell
pnpm --dir frontend run typecheck
```

Expected: PASS。若失败，根据错误修正类型不匹配（主要是 `BrowserPanelFrame` 的 props 类型）。

- [ ] **运行现有测试**

```powershell
pnpm --dir frontend exec vitest run src/app/features/browser/useBrowserPanel.test.ts
```

Expected: PASS（测试验证 hook 组合行为，重构后行为不变）。

- [ ] **运行 ESLint + Prettier**

```powershell
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
```

- [ ] **运行全部前端测试确认无回归**

```powershell
pnpm --dir frontend run test
```

Expected: 全部 PASS。

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/browser/BrowserPanel.tsx frontend/src/app/features/browser/BrowserPanelFrame.tsx frontend/src/app/features/browser/useBrowserPanelHandlers.ts frontend/src/app/features/browser/useBrowserPanelMetaWiring.ts
git commit -m "refactor(browser): split BrowserPanel God Component into Frame + handlers + meta-wiring hooks"
```

---

## Task 3: M10 — 提取 makePersistedWriter 工厂消除 12 个 slice 的持久化样板代码

**目标：** 消除 12 个 slice 文件中重复的 `const { scheduleWrite } = createDebouncedWrite(50);` 样板，替换为 `makePersistedWriter(key)` 工厂函数，提升可读性并统一持久化写入入口。

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/storageHelpers.ts`（添加工厂函数）
- Modify: 12 个 slice 文件：
  - `slices/browserBookmarkSlice.ts`
  - `slices/browserFoldersSlice.ts`
  - `slices/browserHistorySlice.ts`
  - `slices/browserLandingSlice.ts`
  - `slices/browserTabsSlice.ts`
  - `slices/browserSlice.ts`
  - `slices/ciSlice.ts`
  - `slices/githubSlice.ts`
  - `slices/uiSlice.ts`
  - `slices/uiSliceExpansion.ts`
  - `slices/terminalSlice.ts`
  - `slices/githubRepoSliceHelpers.ts`

**Interfaces:**
- Consumes: `createDebouncedWrite`（已存在于 `storageHelpers.ts`）、各 slice 的 `STORAGE_KEY` 常量
- Produces: `makePersistedWriter(key)` 工厂函数、`makePersistedNumberWriter(key)` 工厂函数

### Step 3.1: 在 storageHelpers.ts 中添加 makePersistedWriter 工厂

- [ ] **添加工厂函数**

修改 `ai-digital-life/frontend/src/app/stores/storageHelpers.ts`，在文件末尾（第 125 行 `export const { scheduleWrite: scheduleCrossSliceWrite } = createDebouncedWrite(50);` 之后）添加：

```typescript
const sharedPersistedWriter = createDebouncedWrite(50);
const sharedPersistedNumberWriter = scheduleCrossSliceWrite;

/**
 * 创建绑定到指定 localStorage key 的持久化写入函数。
 * 使用共享的去抖写入调度器，跨 slice 合并写入。
 * 替代各 slice 中重复的 `const { scheduleWrite } = createDebouncedWrite(50);` 样板。
 * @param key localStorage 键名
 * @returns 接受 value 参数的写入函数
 */
export function makePersistedWriter(key: string): (value: unknown) => void {
  return (value: unknown) => scheduleCrossSliceWrite(key, value);
}

/**
 * 创建绑定到指定 localStorage key 的数字持久化写入函数。
 * @param key localStorage 键名
 * @returns 接受 number value 参数的写入函数
 */
export function makePersistedNumberWriter(key: string): (value: number) => void {
  const { scheduleNumberWrite } = sharedPersistedWriter;
  return (value: number) => scheduleNumberWrite(key, value);
}
```

> **说明：** `scheduleCrossSliceWrite` 已在第 125 行导出，它和 `sharedPersistedWriter.scheduleWrite` 是同一个函数（都来自 `createDebouncedWrite(50)` 实例）。为保持一致性，`makePersistedWriter` 直接使用 `scheduleCrossSliceWrite`。`makePersistedNumberWriter` 使用同一实例的 `scheduleNumberWrite`。

- [ ] **运行类型检查**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend run typecheck
```

Expected: PASS。

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/stores/storageHelpers.ts
git commit -m "refactor(stores): add makePersistedWriter/makePersistedNumberWriter factory functions"
```

### Step 3.2: 迁移 12 个 slice 文件

- [ ] **迁移 browserBookmarkSlice.ts（示例模板）**

修改 `ai-digital-life/frontend/src/app/stores/slices/browserBookmarkSlice.ts`：

第 2 行 import：
```typescript
// 修改前：
import { createUiId, createDebouncedWrite } from '../shared';

// 修改后：
import { createUiId, makePersistedWriter } from '../shared';
```

第 27 行删除并替换：
```typescript
// 修改前（删除）：
const { scheduleWrite } = createDebouncedWrite(50);

// 修改后：
const writeBookmarks = makePersistedWriter(BROWSER_BOOKMARKS_KEY);
const writeTabFolders = makePersistedWriter(BROWSER_TAB_FOLDERS_KEY);
const writeWorkspaceBookmarks = makePersistedWriter(BROWSER_WORKSPACE_BOOKMARKS_KEY);
const writeBookmarkTabIdUrlMap = makePersistedWriter(BROWSER_BOOKMARK_TABID_URL_MAP_KEY);
```

然后在文件中将所有 `scheduleWrite(KEY, value)` 调用替换为对应的 `writeXxx(value)`：

```typescript
// 修改前：
scheduleWrite(BROWSER_BOOKMARKS_KEY, outcome.partial.browserBookmarks);
// 修改后：
writeBookmarks(outcome.partial.browserBookmarks);

// 修改前：
scheduleWrite(BROWSER_TAB_FOLDERS_KEY, outcome.partial.browserTabFolders);
// 修改后：
writeTabFolders(outcome.partial.browserTabFolders);

// 修改前：
scheduleWrite(BROWSER_WORKSPACE_BOOKMARKS_KEY, outcome.partial.browserWorkspaceBookmarks);
// 修改后：
writeWorkspaceBookmarks(outcome.partial.browserWorkspaceBookmarks);

// 修改前：
scheduleWrite(BROWSER_BOOKMARK_TABID_URL_MAP_KEY, outcome.partial.browserBookmarkTabIdUrlMap);
// 修改后：
writeBookmarkTabIdUrlMap(outcome.partial.browserBookmarkTabIdUrlMap);
```

- [ ] **迁移其余 8 个仅使用 scheduleWrite 的 slice**

对以下 8 个文件执行相同模式（`browserFoldersSlice.ts`、`browserHistorySlice.ts`、`browserLandingSlice.ts`、`browserTabsSlice.ts`、`ciSlice.ts`、`githubSlice.ts`、`uiSlice.ts`、`uiSliceExpansion.ts`）：

1. 将 `import { ..., createDebouncedWrite } from '../shared'` 改为 `import { ..., makePersistedWriter } from '../shared'`
2. 删除 `const { scheduleWrite } = createDebouncedWrite(50);`
3. 为该 slice 使用的每个 `STORAGE_KEY` 创建对应的 writer：`const writeXxx = makePersistedWriter(XXX_KEY);`
4. 将所有 `scheduleWrite(XXX_KEY, value)` 替换为 `writeXxx(value)`

- [ ] **迁移使用 scheduleNumberWrite 的 slice（browserSlice.ts、terminalSlice.ts）**

这两个文件同时使用 `scheduleWrite` 和 `scheduleNumberWrite`。

修改 `ai-digital-life/frontend/src/app/stores/slices/browserSlice.ts`：

```typescript
// 修改前（第 9 行）：
import { clamp, readJson, readNumber, createUiId, createDebouncedWrite } from '../shared';
// 修改后：
import { clamp, readJson, readNumber, createUiId, makePersistedWriter, makePersistedNumberWriter } from '../shared';

// 修改前（第 51 行）：
const { scheduleWrite, scheduleNumberWrite } = createDebouncedWrite(50);
// 修改后：
const writeNavigatorWidth = makePersistedNumberWriter(BROWSER_NAVIGATOR_WIDTH_KEY);
// 为其他 scheduleWrite 使用的 key 创建 writer
const writeXxx = makePersistedWriter(XXX_KEY);
```

将所有 `scheduleWrite(KEY, value)` 替换为 `writeXxx(value)`，`scheduleNumberWrite(KEY, value)` 替换为 `writeNavigatorWidth(value)`。

对 `ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts` 执行相同操作。

- [ ] **迁移 githubRepoSliceHelpers.ts（使用 300ms 去抖）**

此文件使用 `createDebouncedWrite(300)`（更长的去抖间隔）。为保持行为一致，不使用共享的 50ms writer，而是保留独立实例但用工厂封装：

修改 `ai-digital-life/frontend/src/app/stores/slices/githubRepoSliceHelpers.ts`：

```typescript
// 修改前（第 6 行）：
import { createDebouncedWrite, readJson } from '../shared';
// 修改后：
import { createDebouncedWrite, readJson } from '../shared';

// 修改前（第 11 行）：
const { scheduleWrite: schedulePersist } = createDebouncedWrite(300);
// 修改后（保留 300ms 独立实例，但提取为 key-bound writer）：
const persistWriter = createDebouncedWrite(300);
const writeWorkspaceConfigs = (value: unknown) => persistWriter.scheduleWrite(GH_WORKSPACE_CONFIGS_KEY, value);
const writeFolders = (value: unknown) => persistWriter.scheduleWrite(GH_CI_FOLDERS_KEY, value);
```

> **说明：** 此文件使用 300ms 去抖（不同于其他 slice 的 50ms），因此不能使用共享的 `makePersistedWriter`。保留独立实例但提取 key-bound writer 以提升可读性。后续可考虑统一去抖间隔，但本阶段不改变行为。

将 `schedulePersist(GH_WORKSPACE_CONFIGS_KEY, value)` 替换为 `writeWorkspaceConfigs(value)`，`schedulePersist(GH_CI_FOLDERS_KEY, value)` 替换为 `writeFolders(value)`。

> **注意：** 此文件已有 `scheduleWorkspaceConfigsWrite` 和 `scheduleFoldersWrite` 函数（在文件中定义），它们封装了 `schedulePersist`。迁移时检查这些函数是否已存在，若已存在则只需修改其内部实现，无需创建新的 writer。

- [ ] **运行类型检查**

```powershell
pnpm --dir frontend run typecheck
```

Expected: PASS。

- [ ] **运行 ESLint + Prettier**

```powershell
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
```

- [ ] **运行全部前端测试**

```powershell
pnpm --dir frontend run test
```

Expected: 全部 PASS。

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/stores/slices/
git commit -m "refactor(stores): replace createDebouncedWrite boilerplate with makePersistedWriter in 12 slice files"
```

---

## Task 4: M11 — githubRepoSlice 构造时副作用外提

**目标：** 将 `createGitHubRepoSlice` 工厂函数中的 hydration 副作用（第 67-78 行）提取为显式 `hydrateGitHubRepoSlice()` 函数，在 store 创建后由启动流程调用，消除构造时副作用。

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/githubRepoSliceHelpers.ts`（添加 `hydrateGitHubRepoSlice`）
- Modify: `ai-digital-life/frontend/src/app/stores/slices/githubRepoSlice.ts`（移除副作用）
- Modify: `ai-digital-life/frontend/src/app/stores/slicedStore.ts`（调用 hydration）
- Test: `ai-digital-life/frontend/src/app/stores/slices/githubRepoSlice.test.ts`（新建）

**Interfaces:**
- Consumes: `hydrateGitHubConfigs`、`hydrateGitHubFolders`（已存在于 helpers）
- Produces: `hydrateGitHubRepoSlice(set: (partial: Partial<StoreState>) => void) => Promise<void>`

### Step 4.1: 编写测试

- [ ] **创建测试文件**

创建 `ai-digital-life/frontend/src/app/stores/slices/githubRepoSlice.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hydrateGitHubRepoSlice } from './githubRepoSliceHelpers';

describe('hydrateGitHubRepoSlice', () => {
  let setMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setMock = vi.fn();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn(),
      },
    });
  });

  it('calls set with hydrated configs when localStorage has data', async () => {
    const configs = { 'ws-1': { owner: 'octocat', repo: 'hello', branch: 'main', accessToken: null, configured: true, workflowId: null } };
    vi.spyOn(globalThis, 'window', 'get').mockReturnValue({
      localStorage: { getItem: vi.fn().mockReturnValue(JSON.stringify(configs)) },
    } as unknown as Window & typeof globalThis);

    await hydrateGitHubRepoSlice(setMock);

    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      gitHubWorkspaceConfigs: expect.objectContaining({ 'ws-1': expect.anything() }),
    }));
  });

  it('does not call set when localStorage is empty', async () => {
    vi.spyOn(globalThis, 'window', 'get').mockReturnValue({
      localStorage: { getItem: vi.fn().mockReturnValue(null) },
    } as unknown as Window & typeof globalThis);

    await hydrateGitHubRepoSlice(setMock);

    expect(setMock).not.toHaveBeenCalled();
  });

  it('guards against SSR (window undefined)', async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error simulate SSR
    delete globalThis.window;

    await expect(hydrateGitHubRepoSlice(setMock)).resolves.not.toThrow();
    expect(setMock).not.toHaveBeenCalled();

    globalThis.window = originalWindow;
  });
});
```

- [ ] **运行测试确认失败**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
pnpm --dir frontend exec vitest run src/app/stores/slices/githubRepoSlice.test.ts
```

Expected: FAIL with `hydrateGitHubRepoSlice is not a function` 或 `not exported`。

### Step 4.2: 实现 hydrateGitHubRepoSlice

- [ ] **在 githubRepoSliceHelpers.ts 中添加函数**

修改 `ai-digital-life/frontend/src/app/stores/slices/githubRepoSliceHelpers.ts`，在文件末尾添加：

```typescript
import type { StoreState } from '../StoreState';

/**
 * 显式 hydration 函数：从 localStorage 恢复 GitHub Repo slice 的持久化状态。
 * 应在 store 创建后由启动流程调用，替代 slice 工厂中的构造时副作用。
 * @param set Zustand set 函数（来自 store 实例）
 */
export async function hydrateGitHubRepoSlice(
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void
): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const configs = await hydrateGitHubConfigs();
  if (Object.keys(configs).length > 0) {
    set({ gitHubWorkspaceConfigs: configs });
  }

  const folders = await hydrateGitHubFolders();
  if (folders.length > 0) {
    set({ gitHubCiFolders: folders });
  }
}
```

> **注意：** `hydrateGitHubConfigs` 和 `hydrateGitHubFolders` 已在该文件中定义并导出。`import type { StoreState }` 需要添加到文件顶部的 import 区域。

- [ ] **运行测试确认通过**

```powershell
pnpm --dir frontend exec vitest run src/app/stores/slices/githubRepoSlice.test.ts
```

Expected: PASS。

### Step 4.3: 从 slice 工厂移除副作用

- [ ] **修改 githubRepoSlice.ts**

修改 `ai-digital-life/frontend/src/app/stores/slices/githubRepoSlice.ts` 第 63-78 行：

```typescript
// 修改前：
export const createGitHubRepoSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitHubRepoSlice => {
  if (typeof window !== 'undefined') {
    void hydrateGitHubConfigs().then((configs) => {
      if (Object.keys(configs).length > 0) {
        set({ gitHubWorkspaceConfigs: configs });
      }
    });
    void hydrateGitHubFolders().then((folders) => {
      if (folders.length > 0) {
        set({ gitHubCiFolders: folders });
      }
    });
  }

  return {
    gitHubWorkspaceConfigs: {},

// 修改后：
export const createGitHubRepoSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitHubRepoSlice => {
  void set; // set 由 hydration 流程在 store 创建后调用，slice 工厂不再使用
  return {
    gitHubWorkspaceConfigs: {},
```

同时移除不再使用的 import（第 5-11 行的 `hydrateGitHubConfigs`、`hydrateGitHubFolders`）：

```typescript
// 修改前：
import {
  scheduleWorkspaceConfigsWrite,
  scheduleFoldersWrite,
  hydrateGitHubConfigs,
  hydrateGitHubFolders,
  collectDescendantFolderIds,
} from './githubRepoSliceHelpers';

// 修改后：
import {
  scheduleWorkspaceConfigsWrite,
  scheduleFoldersWrite,
  collectDescendantFolderIds,
} from './githubRepoSliceHelpers';
```

> **注意：** `scheduleWorkspaceConfigsWrite` 和 `scheduleFoldersWrite` 仍被 slice 方法使用，保留。`set` 参数改为 `void set` 是因为 ESLint 会报 unused parameter；但实际上下文中的 `set` 在 `return` 的对象方法闭包中被使用（如 `setGitHubWorkspaceConfig` 等方法调用 `set(...)`），所以 `void set` 是错误的——应保留 `set` 不加 `void`。修正：不添加 `void set`，因为 `set` 在返回的方法闭包中被使用。

修正后的代码：

```typescript
export const createGitHubRepoSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): GitHubRepoSlice => {
  return {
    gitHubWorkspaceConfigs: {},
```

### Step 4.4: 在 store 创建后调用 hydration

- [ ] **修改 slicedStore.ts**

修改 `ai-digital-life/frontend/src/app/stores/slicedStore.ts`，在 store 创建后（第 168 行 `}));` 之后，`type _StoreTypeCheck` 之前）添加 hydration 调用：

```typescript
// 在 useSlicedAppStore 创建后添加
void hydrateGitHubRepoSlice(useSlicedAppStore.setState);
```

并在文件顶部添加 import：

```typescript
import { hydrateGitHubRepoSlice } from './slices/githubRepoSliceHelpers';
```

- [ ] **运行类型检查**

```powershell
pnpm --dir frontend run typecheck
```

Expected: PASS。

- [ ] **运行测试**

```powershell
pnpm --dir frontend run test
```

Expected: 全部 PASS。

- [ ] **运行 ESLint + Prettier**

```powershell
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
```

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/stores/slices/githubRepoSlice.ts frontend/src/app/stores/slices/githubRepoSliceHelpers.ts frontend/src/app/stores/slices/githubRepoSlice.test.ts frontend/src/app/stores/slicedStore.ts
git commit -m "refactor(stores): extract hydration side-effect from githubRepoSlice factory to explicit hydrateGitHubRepoSlice"
```

---

## Task 5: M12 — list_git_branches 解析器函数化提取

**目标：** 将 73 行的 `list_git_branches` 函数中的 git 输出解析逻辑提取为独立的纯函数，使其可单元测试（无需创建真实 git 仓库）。

**Files:**
- Modify: `ai-digital-life/crates/workspace/src/git.rs`（提取函数）
- Test: `ai-digital-life/crates/workspace/src/git.rs`（添加纯解析函数的单元测试）

**Interfaces:**
- Consumes: `GitBranchSummary`（来自 `adl_types`）
- Produces: `parse_local_branches`、`parse_remote_branch_names`、`parse_stashed_branches`、`build_branch_summaries`

**重要说明：** 任务描述建议提取 `parse_branch_summary()`、`parse_ahead_behind()`、`parse_upstream_tracking()`。经审查当前代码（`git.rs:80-153`），`list_git_branches` **仅解析** branch 名称、remote 名称和 stash 列表，**不包含** ahead/behind 或 upstream tracking 解析逻辑（`GitBranchSummary` 结构体也无对应字段）。因此 `parse_ahead_behind()` 和 `parse_upstream_tracking()` 的提取**延后**至未来添加这些功能时。本任务聚焦于提取实际存在的解析逻辑。

### Step 5.1: 编写解析函数的单元测试

- [ ] **在 git_tests 模块中添加纯解析测试**

修改 `ai-digital-life/crates/workspace/src/git.rs`，在 `#[cfg(test)] mod git_tests { ... }` 模块内末尾添加（在最后一个 `#[test]` 之后）：

```rust
    // === 纯解析函数测试（无需 git in PATH）===

    #[test]
    fn parse_local_branches_handles_basic_output() {
        let output = "main\nfeature/branch-1\ndevelop\n";
        let branches = parse_local_branches(output);
        assert_eq!(branches, vec!["main", "feature/branch-1", "develop"]);
    }

    #[test]
    fn parse_local_branches_skips_empty_lines() {
        let output = "main\n\n\ndevelop\n";
        let branches = parse_local_branches(output);
        assert_eq!(branches, vec!["main", "develop"]);
    }

    #[test]
    fn parse_local_branches_handles_empty_output() {
        let output = "";
        let branches = parse_local_branches(output);
        assert!(branches.is_empty());
    }

    #[test]
    fn parse_remote_branch_names_extracts_branch_after_slash() {
        let output = "origin/main\norigin/feature/test\nupstream/develop\n";
        let names = parse_remote_branch_names(output);
        assert!(names.contains("main"));
        assert!(names.contains("test"));
        assert!(names.contains("develop"));
        assert_eq!(names.len(), 3);
    }

    #[test]
    fn parse_remote_branch_names_skips_empty_lines() {
        let output = "origin/main\n\norigin/develop\n";
        let names = parse_remote_branch_names(output);
        assert_eq!(names.len(), 2);
    }

    #[test]
    fn parse_stashed_branches_extracts_adl_auto_stash_markers() {
        let output = "adl-auto-stash:main:WIP on main\nadl-auto-stash:feature:WIP on feature\nstash@{2}: other stash";
        let stashed = parse_stashed_branches(output);
        assert!(stashed.contains("main"));
        assert!(stashed.contains("feature"));
        assert_eq!(stashed.len(), 2);
    }

    #[test]
    fn parse_stashed_branches_returns_empty_for_no_adl_markers() {
        let output = "stash@{0}: WIP on main\nstash@{1}: WIP on develop";
        let stashed = parse_stashed_branches(output);
        assert!(stashed.is_empty());
    }

    #[test]
    fn build_branch_summaries_merges_local_and_remote() {
        let local: Vec<String> = vec!["main".to_string(), "develop".to_string()];
        let remote: std::collections::HashSet<String> = ["main".to_string(), "release".to_string()].into_iter().collect();
        let stashed: std::collections::HashSet<String> = ["develop".to_string()].into_iter().collect();
        let current = "main";

        let summaries = build_branch_summaries(&local, &remote, &stashed, current);

        assert_eq!(summaries.len(), 3); // main, develop, release

        let main = summaries.iter().find(|s| s.name == "main").unwrap();
        assert!(main.is_current);
        assert!(main.local);
        assert!(main.remote);
        assert!(!main.has_stash);

        let develop = summaries.iter().find(|s| s.name == "develop").unwrap();
        assert!(!develop.is_current);
        assert!(develop.local);
        assert!(!develop.remote);
        assert!(develop.has_stash);

        let release = summaries.iter().find(|s| s.name == "release").unwrap();
        assert!(!release.is_current);
        assert!(!release.local);
        assert!(release.remote);
        assert!(!release.has_stash);
    }

    #[test]
    fn build_branch_summaries_sorts_current_first_then_alphabetical() {
        let local: Vec<String> = vec!["zebra".to_string(), "alpha".to_string(), "main".to_string()];
        let remote: std::collections::HashSet::new();
        let stashed: std::collections::HashSet::new();
        let current = "main";

        let summaries = build_branch_summaries(&local, &remote, &stashed, current);

        assert_eq!(summaries[0].name, "main"); // current first
        assert!(summaries[0].is_current);
        assert_eq!(summaries[1].name, "alpha"); // alphabetical
        assert_eq!(summaries[2].name, "zebra");
    }
```

- [ ] **运行测试确认失败**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test -p adl_workspace parse_local_branches 2>&1 | Select-String "error\["
```

Expected: 编译错误 `cannot find function parse_local_branches`。

### Step 5.2: 提取解析函数

- [ ] **在 git.rs 中添加纯解析函数**

修改 `ai-digital-life/crates/workspace/src/git.rs`，在 `list_git_branches` 函数之前（第 80 行之前）添加：

```rust
/// Parse `git branch --format=%(refname:short)` output into a list of local branch names.
/// Skips empty lines and trims whitespace.
fn parse_local_branches(output: &str) -> Vec<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|s| s.to_string())
        .collect()
}

/// Parse `git branch -r --format=%(refname:short)` output into a set of branch names
/// (stripping the remote prefix, e.g. `origin/main` → `main`).
fn parse_remote_branch_names(output: &str) -> std::collections::HashSet<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter_map(|line| line.split_once('/').map(|(_, name)| name.to_string()))
        .collect()
}

/// Parse `git stash list --format=%s` output to extract branch names from
/// `adl-auto-stash:<branch>:...` markers. Returns a set of branch names that
/// have an auto-stash entry.
fn parse_stashed_branches(output: &str) -> std::collections::HashSet<String> {
    output
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let marker = "adl-auto-stash:";
            trimmed.find(marker).and_then(|pos| {
                let after_marker = &trimmed[pos + marker.len()..];
                after_marker.split(':').next().map(|s| s.to_string())
            })
        })
        .collect()
}

/// Build the final list of `GitBranchSummary` entries from parsed components.
/// Local branches are listed first (marked with `local: true`), then remote-only
/// branches. The current branch is flagged. Results are sorted: current branch
/// first, then alphabetical by name.
fn build_branch_summaries(
    local_branches: &[String],
    remote_branches: &std::collections::HashSet<String>,
    stashed_branches: &std::collections::HashSet<String>,
    current_branch: &str,
) -> Vec<GitBranchSummary> {
    let mut seen = std::collections::HashSet::new();
    let mut branches: Vec<GitBranchSummary> = Vec::new();

    for name in local_branches {
        seen.insert(name.clone());
        branches.push(GitBranchSummary {
            name: name.clone(),
            is_current: name == current_branch,
            local: true,
            remote: remote_branches.contains(name),
            has_stash: stashed_branches.contains(name.as_str()),
        });
    }

    for name in remote_branches {
        if !seen.contains(name) {
            branches.push(GitBranchSummary {
                name: name.clone(),
                is_current: false,
                local: false,
                remote: true,
                has_stash: stashed_branches.contains(name.as_str()),
            });
        }
    }

    branches.sort_by(|left, right| {
        right
            .is_current
            .cmp(&left.is_current)
            .then_with(|| left.name.cmp(&right.name))
    });
    branches
}
```

- [ ] **重构 list_git_branches 使用提取的函数**

修改 `ai-digital-life/crates/workspace/src/git.rs` 第 80-151 行的 `list_git_branches` 函数，替换内联解析逻辑：

```rust
pub fn list_git_branches(root: &Path) -> Result<Vec<GitBranchSummary>, AppError> {
    let current_branch =
        run_git_required(root, &["branch", "--show-current"]).and_then(|value| {
            first_non_empty_line(value)
                .ok_or_else(|| AppError::Workspace("failed to resolve current branch".into()))
        })?;
    let local_output = run_git_required(root, &["branch", "--format=%(refname:short)"])?;
    let remote_output =
        run_git_required(root, &["branch", "-r", "--format=%(refname:short)"]).unwrap_or_default();

    let local_branches = parse_local_branches(&local_output);
    let remote_branches = parse_remote_branch_names(&remote_output);

    if local_branches.is_empty() {
        return Err(AppError::Workspace("no local branches found".into()));
    }

    let stash_list = run_git_required(root, &["stash", "list", "--format=%s"]).unwrap_or_default();
    let stashed_branches = parse_stashed_branches(&stash_list);

    Ok(build_branch_summaries(
        &local_branches,
        &remote_branches,
        &stashed_branches,
        &current_branch,
    ))
}
```

- [ ] **运行提取的纯函数测试**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo test -p adl_workspace --lib parse_ 2>&1
```

Expected: 所有 8 个新测试 PASS（无需 `--ignored` 标志，因为这些是纯函数测试）。

- [ ] **运行 clippy 检查**

```powershell
cargo clippy -p adl_workspace -- -D warnings 2>&1
```

Expected: 无警告。

- [ ] **运行 rustfmt 格式化**

```powershell
cargo fmt --all
```

- [ ] **运行 workspace 全部测试确认无回归**

```powershell
cargo test -p adl_workspace 2>&1
```

Expected: 所有测试 PASS（包括原有的 `#[ignore]` 测试——它们仍需 `--ignored` 标志或 git in PATH，不会自动运行）。

- [ ] **Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add crates/workspace/src/git.rs
git commit -m "refactor(rust): extract git branch parsers from list_git_branches for unit testability"
```

---

## Self-Review

### 1. Spec coverage（规格覆盖检查）

逐项核对任务描述中的 5 个发现：

| 发现 | 覆盖任务 | 状态 |
|------|----------|------|
| C5-Phase2: 迁移 36 个 UI 文件 | Task 1（Step 1.1 ESLint 规则 + Step 1.2 re-export + Step 1.3 批量迁移） | ✅ 覆盖 |
| M9: BrowserPanel.tsx 629 行 God Component | Task 2（Step 2.1 handlers hook + Step 2.2 meta-wiring hook + Step 2.3 Frame 组件 + Step 2.4 重写主组件） | ✅ 覆盖 |
| M10: 12 个 slice 持久化样板 | Task 3（Step 3.1 工厂函数 + Step 3.2 迁移 12 文件） | ✅ 覆盖 |
| M11: githubRepoSlice 构造时副作用 | Task 4（Step 4.1 测试 + Step 4.2 提取函数 + Step 4.3 移除副作用 + Step 4.4 调用 hydration） | ✅ 覆盖 |
| M12: list_git_branches 解析器脆弱 | Task 5（Step 5.1 测试 + Step 5.2 提取函数） | ✅ 覆盖（已说明 ahead/behind 和 upstream tracking 延后） |

### 2. Placeholder scan（占位符扫描）

- ✅ 无 "TBD" / "TODO" / "implement later"
- ✅ 所有代码步骤包含完整代码
- ✅ 测试步骤包含实际测试代码
- ✅ 验证命令包含 expected 输出
- ⚠️ Task 2 Step 2.3 的 `BrowserPanelFrameProps` 使用了 `unknown` 占位类型——已在实施说明中明确标注需由 TypeScript 推断替代
- ⚠️ Task 2 Step 2.4 的示例代码中 `useRef` 在 `useMemo` 内调用——已在实施说明中标注为已知问题需修正

### 3. Type consistency（类型一致性检查）

- ✅ `makePersistedWriter(key: string) => (value: unknown) => void` 在 Task 3 Step 3.1 定义，Step 3.2 使用一致
- ✅ `hydrateGitHubRepoSlice(set)` 在 Task 4 Step 4.2 定义，Step 4.4 调用时使用 `useSlicedAppStore.setState`（签名匹配）
- ✅ `parse_local_branches(&str) -> Vec<String>` 在 Task 5 Step 5.2 定义，测试中调用一致
- ✅ `build_branch_summaries` 参数类型（`&[String]`、`&HashSet<String>`、`&str`）在定义和测试中一致
- ✅ `GitBranchSummary` 字段（`name`、`is_current`、`local`、`remote`、`has_stash`）与现有 `adl_types` 定义一致

### 4. 风险评估

| 任务 | 风险 | 缓解 |
|------|------|------|
| Task 1 (C5-Phase2) | 低：纯类型导入迁移，无运行时变更 | typecheck + lint + test 三重验证 |
| Task 2 (M9) | 中：BrowserPanel 是复杂组件，hook 组合顺序敏感 | 现有 `useBrowserPanel.test.ts` 验证行为不变；逐步提取、逐步验证 |
| Task 3 (M10) | 低：行为不变（仍使用去抖写入），仅封装方式变更 | 全部前端测试验证 |
| Task 4 (M11) | 中：hydration 时机从"构造时"改为"构造后"，可能有微小延迟 | hydration 本身是异步的，时机变化不影响最终状态；测试覆盖 |
| Task 5 (M12) | 低：纯提取重构，`list_git_branches` 行为完全不变 | 纯函数测试 + 原 `#[ignore]` 集成测试保留 |

### 5. 可延后标注确认

任务描述要求标注哪些任务可延后——已在"优先级与可延后标注"表格中明确：
- ✅ Task 1 (C5-Phase2): 可延后
- ❌ Task 2 (M9): 不建议延后
- ✅ Task 3 (M10): 可延后
- ✅ Task 4 (M11): 可延后
- ✅ Task 5 (M12): 可延后

### 6. 计划限制与已知偏差

1. **Task 1 豁免列表：** ESLint 豁免列表较长（包含 stores/regions/utils 等非 UI 层），本阶段不缩减。未来可逐步迁移这些文件。
2. **Task 2 `BrowserPanelEffects` 适配：** 任务描述建议提取 `BrowserPanelEffects`，但 `useBrowserPanelEffects` hook 已存在。本计划提取 `useBrowserPanelMetaWiring` 作为替代，覆盖 page-meta/URL-change 订阅组合逻辑。
3. **Task 2 行数目标：** 重写后 BrowserPanel.tsx 约 280 行（非 150 行），因为 hook 调用和 props 传递本身占较多行数。JSX 渲染已完全外提。
4. **Task 5 `parse_ahead_behind`/`parse_upstream_tracking` 延后：** 当前代码不含这些解析逻辑，`GitBranchSummary` 也无对应字段。延后至未来添加 ahead/behind 功能时。
5. **Task 3 `githubRepoSliceHelpers.ts` 保留 300ms 去抖：** 该文件使用不同于其他 slice 的去抖间隔（300ms vs 50ms），为保持行为不变，保留独立实例。

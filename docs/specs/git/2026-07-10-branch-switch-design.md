# 分支切换一致性设计

- **日期:** 2026-07-10
- **状态:** 已批准

## 问题

应用现有 3 个"切换分支"入口（对话输入框底栏 StatusBar、变更面板工作区右键菜单、文件面板工作区右键菜单），但：

1. 脏工作区处理策略不统一（StatusBar 有 stash 确认，BranchSubCard 裸调 `allowStash: false` 直接报错）
2. 文件面板（File Panel）缺少分支切换入口
3. Git 边界情况（未跟踪/已暂存/已修改）未在 UI 中统一体现
4. 切出脏分支后切回时的状态恢复未实现

## 设计目标

1. 三入口行为一致——脏工作区统一走 stash 确认流程
2. 各面板 UI 状态独立——菜单开/关、搜索文本、确认弹窗互不干扰
3. 切回分支时自动恢复脏状态——stash message 带分支名标记，pop 时按名匹配
4. 文件面板补全"切换分支"入口（顶级条目更多操作 + 右键菜单）

## 架构

```
┌─────────────────────────────────────────────────┐
│                 useStashConfirm hook              │
│  ┌─────────────┐  ┌─────────────────────────┐    │
│  │ hasDirty    │  │ pendingAction state      │    │
│  │ check       │  │ (null | switch | create) │    │
│  └──────┬──────┘  └───────────┬─────────────┘    │
│         │                     │                   │
│         ▼                     ▼                   │
│  ┌───────────────────────────────────────────┐   │
│  │  confirmSwitch / confirmCreate / cancel   │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
           ↕ shared (同一份 switchGitBranch action)
┌────────────┐ ┌──────────────┐ ┌──────────────┐
│  StatusBar  │ │ Changes Panel│ │  File Panel   │
│ GitInfo     │ │ WorkspaceEntry│ │ WorkspaceEntry│
│ (已有完整   │ │ (当前allow   │ │ (新加Branch   │
│  确认流程)  │ │  Stash=false) │ │  MenuItem)    │
└────────────┘ └──────────────┘ └──────────────┘
```

### 独立性保障

| 维度 | 实现方式 |
|------|---------|
| 菜单打开/关闭 | 各组件独立的 useState（menuOpen / branchSubOpen） |
| 分支搜索 | 各 BranchSubCard 实例独立的 branchSearch |
| 分支列表 | 各 BranchSubCard 实例独立的 localBranches（或走 store） |
| Stash 确认 | 各面板独立的 pendingAction state |
| Git 操作 | 走统一 store action，同工作区时 gitSnapshot 会刷新（正确的数据联动） |

## 前端改动

### 1. useStashConfirm Hook（新增）

从 StatusBarGitInfo 中 `pendingBranchAction` + 脏检测逻辑提取。

**API:**

```typescript
type PendingBranchAction =
  | { kind: 'switch'; input: WorkspaceGitBranchSwitchInput }
  | { kind: 'create'; input: WorkspaceGitBranchCreateInput };

interface UseStashConfirmOptions {
  snapshot?: GitSnapshot;
  onConfirm: (action: PendingBranchAction) => Promise<void>;
}

function useStashConfirm(options: UseStashConfirmOptions): {
  pendingAction: PendingBranchAction | null;
  needsConfirm: boolean;
  confirm: () => Promise<void>;
  cancel: () => void;
  setPending: (action: PendingBranchAction) => void;
}
```

**逻辑：**

```
用户选择分支
  → detectDirty(snapshot)
  → 干净: 直接调用 switchGitBranch({ allowStash: false })
  → 脏: setPending → 展示确认弹窗
    → 用户确认: switchGitBranch({ allowStash: true })
    → 用户取消: setPending(null)
```

### 2. BranchSubCard / BranchMenuItem 增强

**文件:** `frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx`

**改动：**

1. 引入 `useStashConfirm` hook，`handleSelect` 中不再直接 `allowStash: false`
2. 分支列表项渲染顺序改为：`name | check | hasStash icon | local badge | remote badge | copy button`
3. 在搜索框下方新增本地/远程筛选按钮组（见下方 UI 布局）
4. 添加 `IconPendingCommit` 用于脏分支指示
5. 空状态文案按场景区分

**筛选按钮区域**（位于搜索框与分支列表之间，完全复刻变更面板筛选 UI）：

```tsx
<div className="adl-changes-branch-filters">
  <button
    className={`adl-changes-branch-filter${localActive ? ' is-active' : ''}`}
    onClick={() => setLocalActive(v => !v)}
  >
    <span className="adl-changes-branch-filter-label">{t.changesBranchLocal}</span>
    <strong className="adl-changes-branch-filter-value">
      <span className="adl-changes-branch-filter-code">L:</span>
      {localCount}
    </strong>
  </button>
  <button
    className={`adl-changes-branch-filter${remoteActive ? ' is-active' : ''}`}
    onClick={() => setRemoteActive(v => !v)}
  >
    <span className="adl-changes-branch-filter-label">{t.changesBranchRemote}</span>
    <strong className="adl-changes-branch-filter-value">
      <span className="adl-changes-branch-filter-code">R:</span>
      {remoteCount}
    </strong>
  </button>
</div>
```

- 默认两个筛选按钮都未激活 → 显示全部分支
- 点击切换激活状态，与变更面板筛选行为一致（toggle on/off，全激活等价于全不激活）
- 筛选为纯前端操作，基于 `local` / `remote` 字段过滤 `filteredBranches`
- CSS 类名对应样式：`.adl-changes-branch-filters`（2 列 grid）、`.adl-changes-branch-filter`、`.adl-changes-branch-filter.is-active`、`.adl-changes-branch-filter-label`、`.adl-changes-branch-filter-code`、`.adl-changes-branch-filter-value`

**空状态判定：**

| 场景 | 显示内容 | 判定 |
|------|---------|------|
| 非 Git 仓库 | "请先初始化 Git 仓库" | `isRepo === false`（通过 props 或 `listGitBranches` 错误判定） |
| 仅当前分支 | "暂无其它分支" | `gitBranches.length === 1 && isRepo === true` |
| 搜索无结果 | "搜索分支不存在" | `filteredBranches.length === 0 && branchSearch !== ''` |

**主菜单项标签：**

| 场景 | 标签 |
|------|------|
| 正常 Git 仓库 | "切换分支" |
| 非 Git 仓库 | "非 Git 仓库"（禁用、灰色） |

### 3. File Panel 接入

**文件:** `frontend/src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx`

**改动：**

1. 引入 `BranchMenuItem`（从 `BranchSubCard` 导出）
2. 新增 `branchSubOpen` state
3. 在菜单项数组最前面插入 `<BranchMenuItem>`
4. 注入 `currentBranch`（从 `gitSnapshot?.branch`）和 `workspacePath`
5. 现有 `menuOpen` 和 `handleNameContextMenu` / `handleMoreClick` 保持不变

**菜单结构：**

```
┌─ BranchMenuItem (切换分支) ────┐
│  └─ BranchSubCard ────────────┐│
│     │ 搜索框                  ││
│     │ ┌──────┐ ┌──────┐      ││
│     │ │ 本地  │ │ 远程  │      ││  ← 筛选按钮
│     │ │ L:3  │ │ R:5  │      ││
│     │ └──────┘ └──────┘      ││
│     │ 分支列表 (筛选后)       ││
│     └────────────────────────┘│
└────────────────────────────────┘
───────── separator ─────────────
  从本视图中移除
  在文件管理器中显示
───────── separator ─────────────
  复制完整路径
  复制相对路径
```

### 4. StatusBarGitInfo 重构

**文件:** `frontend/src/app/regions/StatusBarGitInfo.tsx`

**改动：**

1. 移除内联的 `pendingBranchAction` + 脏检测逻辑，替换为 `useStashConfirm`
2. 保留 UI 确认弹窗的渲染逻辑（弹窗样式不变）
3. 保持 `hasDirtyChanges` prop（由父组件传递）

### 5. CopyButton 可复用组件

**文件:** `frontend/src/app/components/CopyButton.tsx`（新增），从浏览器面板 URL 输入框的复制按钮提取

```tsx
interface CopyButtonProps {
  text: string;              // 要复制的内容
  size?: number;             // 图标尺寸，默认 14
  className?: string;        // 附加类名
  tooltip?: string;          // 复制提示文案（默认 "复制"）
  tooltipCopied?: string;    // 复制成功提示（默认 "已复制到剪贴板"）
  onCopy?: () => void;       // 复制成功回调
}
```

**行为：**
- 点击调用 `navigator.clipboard?.writeText(text)`
- 使用 `lucide-animated` 的 `CopyIcon` + `CopyIconHandle` 实现动画反馈（startAnimation / stopAnimation）
- 600ms 后自动恢复
- `is-copied` CSS class 用于样式覆盖

**使用方式：**

```tsx
// 浏览器工具栏（原有，改为使用此组件）
<CopyButton text={url} />

// 分支列表项（新增）
<CopyButton text={branch.name} size={12} />
```

**CSS 复用：**
- 基础样式 `.adl-copy-btn` 提取为公共样式（从 `.adl-tool-search__copy` 提取）
- 保持原有的 `is-copied` 状态类
- 在 `frontend/src/styles/base/` 或 `frontend/src/styles/components/` 下新增 `copy-button.css`

### 6. 新 SVG 图标

**位置:** `frontend/src/app/icons/status.tsx`

```tsx
export const IconPendingCommit = make(
  <>
    <path d="M13 13m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    <path d="M13 16v5" />
    <path d="M13 3v7" />
    <path d="M9 7l4 -4l4 4" />
  </>
);
```

**注册:** `frontend/src/app/icons/index.ts` 添加 `IconPendingCommit` 导出

### 7. i18n 新增

**文件:** `frontend/src/app/i18n/en-US/changes.ts` + `zh-CN/changes.ts`；`en-US/file.ts` + `zh-CN/file.ts`

| Key | EN | ZH | 位置 |
|-----|----|----|------|
| `changesBranchNoOther` | "No other branches" | "暂无其它分支" | changes.ts |
| `changesBranchNotRepo` | "Not a Git repository" | "非 Git 仓库" | changes.ts |
| `changesBranchInitRepo` | "Please initialize as a Git repository first" | "请先初始化为 Git 仓库" | changes.ts |
| `changesBranchSearchNone` | "Searched branch does not exist" | "搜索分支不存在" | changes.ts |
| `changesBranchRestored` | "Restored local changes from {branch}" | "已恢复分支 {branch} 的本地变更" | changes.ts |
| `fileCopyBranchName` | "Copy branch name" | "复制分支名称" | file.ts |
| `copySuccessClipboard` | "Copied to clipboard" | "已复制到剪贴板" | 已有（browser.ts/common.ts）复用 |

## 后端改动

### 1. GitBranchSummary 扩展

**文件:** `crates/kernel/src/types/workspace.rs`

```rust
pub struct GitBranchSummary {
    pub name: String,
    pub is_current: bool,
    pub local: bool,
    pub remote: bool,
    pub has_stash: bool,  // 新增
}
```

### 2. list_git_branches 增强

**文件:** `crates/workspace/src/git.rs`

在枚举分支后，对每个分支检查 `git stash list` 中是否存在 `adl-auto-stash:{branch_name}:` 前缀的 stash message。

```rust
fn has_auto_stash(root: &Path, branch_name: &str) -> bool {
    // git stash list --format="%s" | grep "adl-auto-stash:{branch_name}:"
}
```

### 3. stash 消息格式

```rust
fn stash_workspace_changes(root: &Path, branch_name: &str) -> Result<(), AppError> {
    let message = format!("adl-auto-stash:{}:{}", branch_name, now_ms());
    run_git_required(root, &["stash", "push", "--include-untracked", "--message", &message])
}
```

### 4. switch_git_branch 自动 pop

```rust
fn pop_auto_stash(root: &Path, target_branch: &str) -> Result<bool, AppError> {
    // 1. git stash list → 匹配 adl-auto-stash:{target_branch}: 的最新一条
    // 2. git stash pop (或 apply --index)
    // 3. 冲突时：保留 stash 不删除，返回 conflict: true
    // 4. 成功后：git stash drop 清理
}
```

**切换流程更新：**

```
1. 检测目标分支是否有匹配的 auto-stash
2. 如果有 → 先 git stash pop
   - 成功 → 继续 switch（不需要再次 stash）
   - 冲突 → switch 到目标分支，标记冲突
3. 如果没有 → 正常流程（脏检测 → 确认 → stash → switch）
4. 切出前 stash 当前分支脏状态（带分支名标记）
```

## 状态机：脏分支切换与恢复

```
分支A (脏: file.js) ── stash A(adl-auto-stash:A:ts1) ──→ 分支A (干净)
     │ git switch B                                           │ git switch A
     ▼                                                         ▼
分支B (脏: other.js) ── stash B(adl-auto-stash:B:ts2) ──→ 分支B (干净)
     │ switch back to A                                       │ pop auto-stash A
     ▼                                                         ▼
分支A (干净) ─── pop adl-auto-stash:A:ts1 ───→ 分支A (脏: file.js) ✅ 恢复
```

### 脏状态包含

| 状态 | Git 命令 | 包含 |
|------|---------|------|
| 已暂存 (staged) | `git diff --cached` | ✅（stash 保存，pop 后变为 unstaged）|
| 已修改 (unstaged) | `git diff` | ✅ |
| 未跟踪 (untracked) | `git ls-files --others` | ✅（`stash --include-untracked`）|
| 冲突 (conflicts) | `git diff --diff-filter=U` | ❌ 冲突需要先手动解决 |

## UI 状态矩阵

| 场景 | 菜单项标签 | 子卡片内容 |
|------|-----------|-----------|
| 正常 Git 仓库，有可用分支 | "切换分支" | 分支列表（搜索 + 选择） |
| 正常 Git 仓库，仅当前分支 | "切换分支" | "暂无其它分支" |
| 非 Git 仓库 | "非 Git 仓库"（灰色） | "请先初始化为 Git 仓库" |
| 工作区未打开 | "切换分支"（禁用） | — |

## 分支列表项渲染

```
┌──────────────────────────────────────────────┐
│ main            ✓  🔄  Local  Remote    📋  │
│ feature-x                Local           📋  │
│ feature-y       🔄      Remote          📋  │
└──────────────────────────────────────────────┘
│ └─ 名称 ────┘│││└─ 徽章 ───────┘││
               ││               └─ copy btn
               │└─ dirty icon
               └─ current icon
```

- `✓` — `IconCheck`，仅当前分支显示
- `🔄` — `IconPendingCommit`，`hasStash === true` 时显示
- `Local` / `Remote` — 徽章，对应 `local` / `remote` 字段
- `📋` — `CopyButton` 组件，点击复制分支名称到剪贴板
- 当前分支显示 `is-current` 样式类

## 文件列表

### 新增文件

| 文件 | 说明 |
|------|------|
| `frontend/src/app/components/CopyButton.tsx` | 可复用复制按钮组件（从浏览器面板提取） |
| `frontend/src/styles/components/copy-button.css` | CopyButton 公共样式 |

### 修改文件

| 文件 | 改动量 | 说明 |
|------|-------|------|
| `crates/kernel/src/types/workspace.rs` | +2 行 | `GitBranchSummary.has_stash` |
| `crates/workspace/src/git.rs` | ~+60 行 | `pop_auto_stash`, `has_auto_stash`, stash message 改造, `switch_git_branch` 更新 |
| `frontend/src/app/icons/status.tsx` | +8 行 | `IconPendingCommit` |
| `frontend/src/app/icons/index.ts` | +1 行 | 导出 `IconPendingCommit` |
| `frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx` | ~+60 行 | useStashConfirm 接入、空状态文案、图标顺序、筛选按钮组、copy 按钮、非 repo 判定 |
| `frontend/src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx` | ~+20 行 | 引入 BranchMenuItem、branchSubOpen state、菜单内嵌 |
| `frontend/src/app/regions/StatusBarGitInfo.tsx` | ~-30 行 | 提取 pendingBranchAction 到 useStashConfirm |
| `frontend/src/app/regions/StatusBar.tsx` | 可能微调 | 传递 gitSnapshot 给子组件 |
| `frontend/src/app/features/browser/BrowserToolbar.tsx` | ~-15 行 | 替换为公共 CopyButton 组件 |
| `frontend/src/styles/regions/rightpanel/browser-toolbar.css` | ~-15 行 | 移除 `.adl-tool-search__copy`（迁移到公共样式） |
| `frontend/src/app/i18n/en-US/changes.ts` | +5 行 | 新增 changes i18n key |
| `frontend/src/app/i18n/zh-CN/changes.ts` | +5 行 | 新增 changes i18n key |
| `frontend/src/app/i18n/en-US/file.ts` | +1 行 | 新增 `fileCopyBranchName` |
| `frontend/src/app/i18n/zh-CN/file.ts` | +1 行 | 新增 `fileCopyBranchName` |

### 生成文件（自动）

| 文件 | 说明 |
|------|------|
| `frontend/src/shared/ipc-types.generated.ts` | 重新生成（因 GitBranchSummary 变化） |

## 测试策略

- **后端:** 测试 `has_auto_stash`、`pop_auto_stash`（含冲突场景）、stash message 格式
- **前端:** 测试 `BranchSubCard` 三种空状态文案、`useStashConfirm` hook 状态流转
- **集成:** 模拟脏工作区切换 → 切回 → 恢复状态

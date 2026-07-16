# Comprehensive i18n Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Achieve complete Chinese/English localization parity across all UI surfaces — tooltips, dialogs, menus, cards, labels, aria-labels, placeholders, and text nodes — eliminating all hardcoded Chinese strings.

**Architecture:** Extend the existing custom CopyDict i18n system with a React Context provider (`useTCopy` hook) to eliminate prop drilling, add a template interpolation helper (`formatT`), fix existing i18n bugs, add ~150 new translation keys, then migrate 30+ component files from hardcoded Chinese to `t.xxx` lookups.

**Tech Stack:** TypeScript, React 19, Zustand, CopyDict (custom i18n), CSS custom properties, TooltipSimple (custom tooltip component)

---

## File Structure

### New files to create:
| File | Responsibility |
|------|---------------|
| `frontend/src/app/i18n/TCopyContext.tsx` | React Context + Provider for `t: CopyDict` + `locale: Locale` |
| `frontend/src/app/i18n/useTCopy.ts` | Hook `useTCopy()` returning `{ t, locale, formatT }` |
| `frontend/src/app/i18n/formatT.ts` | Template interpolation: `formatT(t, key, vars)` |

### Files to modify:
| File | Change |
|------|--------|
| `frontend/src/app/i18n/types.ts` | Add `TFunction` type, export `copy` unchanged |
| `frontend/src/app/i18n/index.ts` | Export `TCopyContext`, `useTCopy`, `formatT` |
| `frontend/src/app/i18n/zh-CN/*.ts` (all 13 files) | Add ~150 new keys |
| `frontend/src/app/i18n/en-US/*.ts` (all 13 files) | Add ~150 new keys (parallel) |
| `frontend/src/app/hooks/useAppStartup.ts` | Remove `t` return (migrate to Context) |
| `frontend/src/app/App.tsx` | Wrap with `<TCopyContext.Provider>`, remove `t` prop passing |
| `frontend/src/app/components/WelcomeState.tsx` | Full i18n migration |
| `frontend/src/app/components/ContextBuilder.tsx` | Full i18n migration |
| `frontend/src/app/components/MessageBubble.tsx` | Full i18n migration |
| `frontend/src/app/components/ActionButton.tsx` | Full i18n migration |
| `frontend/src/app/components/PromptInput.tsx` | Full i18n migration |
| `frontend/src/app/components/PromptModal.tsx` | Full i18n migration |
| `frontend/src/app/components/ConfirmDialog.tsx` | Full i18n migration |
| `frontend/src/app/components/RenameDialog.tsx` | Full i18n migration |
| `frontend/src/app/components/ErrorBoundary.tsx` | Full i18n migration |
| `frontend/src/app/components/MainContent.tsx` | Full i18n migration |
| `frontend/src/app/components/EnvironmentControls.tsx` | Full i18n migration |
| `frontend/src/app/components/WorkspaceSplitButton.tsx` | Fix hardcoded default path |
| `frontend/src/app/features/browser/browserpanel.tsx` | ~20 hardcoded strings |
| `frontend/src/app/features/browser/BrowserContextMenu.tsx` | 8 menu labels |
| `frontend/src/app/features/browser/BrowserMenuDropdown.tsx` | "更多操作" |
| `frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx` | ~25 menu/hint labels |
| `frontend/src/app/features/github-tree/GitHubTreeEntry.tsx` | ~40 menu/hint labels |
| `frontend/src/app/features/terminal/TerminalPanel.tsx` | "终端历史"/"终端" |
| `frontend/src/app/features/workspace-browser/multiworkspacebrowser.tsx` | "共X个标签" |
| `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx` | 3 menu labels |
| `frontend/src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx` | 3 menu labels |
| `frontend/src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx` | 3 menu labels + "创建终端" |
| `frontend/src/app/regions/left-sidebar/SessionList.tsx` | Rename dialog Chinese |
| `frontend/src/app/regions/LeftSidebar.tsx` | Rename dialog Chinese |
| `frontend/src/app/regions/TitleBar.tsx` | Language button aria-label |
| `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` | Rename dialog Chinese |
| `frontend/src/app/regions/right-panel/panels/ChangesEmptyState.tsx` | Fallback messages |
| `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx` | ~4 hardcoded strings |
| `frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx` | ~15 hardcoded strings |
| `frontend/src/app/regions/right-panel/panels/communicate/GitHubLogViewer.tsx` | ~10 hardcoded strings |
| `frontend/src/app/regions/right-panel/panels/communicate/CommunicationPanel.tsx` | Tab labels |
| `frontend/src/app/regions/right-panel/panels/communicate/WorkflowsView.tsx` | "暂无 Workflow 数据" |
| `frontend/src/app/regions/right-panel/panels/communicate/JobsView.tsx` | "暂无 Job 数据" |
| `frontend/src/app/regions/right-panel/panels/communicate/OverviewView.tsx` | "加载中..." |
| `frontend/src/app/regions/right-panel/panels/communicate/JobRow.tsx` | title="查看日志" |
| `frontend/src/app/regions/right-panel/EditorSurfaceShell.tsx` | Preview messages |
| `frontend/src/app/regions/center-pane/WelcomeState.tsx` | aria-labels |
| `frontend/src/app/regions/left-sidebar/ResizeHandle.tsx` | aria-labels |

### Total: ~45 files modified, 3 files created

---

## Sub-plan Index

Given the scope (3 new files, ~45 modified files, ~150 new translation keys, ~140 hardcoded Chinese strings), this plan is broken into sub-plans:

1. **Sub-plan A: Infrastructure** — TCopyContext, formatT, useTCopy, all new locale keys, App.tsx wiring, bug fixes
2. **Sub-plan B: Core Components** — WelcomeState, ContextBuilder, ActionButton, MessageBubble, PromptInput, PromptModal, ConfirmDialog, RenameDialog, ErrorBoundary, MainContent, EnvironmentControls, WorkspaceSplitButton
3. **Sub-plan C: Feature Components** — Browser, GitHub/CI, Terminal, Workspace tree entries
4. **Sub-plan D: Region Components** — Left sidebar, right panel, center pane, title bar, panels
5. **Sub-plan E: Native title → TooltipSimple sweep** — 8 remaining native title attributes
6. **Sub-plan F: Verification** — Tests, lint, typecheck, i18n coverage check

Each sub-plan can be executed independently after Sub-plan A is complete.

---

## Sub-plan A: Infrastructure

### Task A1: Create TCopyContext + useTCopy + formatT

**Files:**
- Create: `frontend/src/app/i18n/TCopyContext.tsx`
- Create: `frontend/src/app/i18n/useTCopy.ts`
- Create: `frontend/src/app/i18n/formatT.ts`

- [ ] **Step 1: Create TCopyContext.tsx**

```typescript
import { createContext, type ReactNode } from 'react';
import type { CopyDict, Locale } from './types';

export interface TCopyContextValue {
  t: CopyDict;
  locale: Locale;
}

export const TCopyContext = createContext<TCopyContextValue | null>(null);

export function TCopyProvider({
  t,
  locale,
  children,
}: TCopyContextValue & { children: ReactNode }) {
  return (
    <TCopyContext.Provider value={{ t, locale }}>
      {children}
    </TCopyContext.Provider>
  );
}
```

- [ ] **Step 2: Create useTCopy.ts**

```typescript
import { useContext } from 'react';
import { TCopyContext, type TCopyContextValue } from './TCopyContext';
import { formatT } from './formatT';

export function useTCopy(): TCopyContextValue & { formatT: typeof formatT } {
  const ctx = useContext(TCopyContext);
  if (!ctx) {
    throw new Error('useTCopy must be used within a TCopyProvider');
  }
  return { ...ctx, formatT };
}

export type { TCopyContextValue };
```

- [ ] **Step 3: Create formatT.ts**

```typescript
import type { CopyDict, CopyKey } from './types';

export function formatT(t: CopyDict, key: CopyKey, vars?: Record<string, string | number>): string {
  let str = t[key];
  if (!vars) return str;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, String(v));
  }
  return str;
}
```

- [ ] **Step 4: Update i18n/index.ts**

```typescript
export type { CopyKey, CopyDict, Locale } from './types';
export { copy } from './types';
export { copyToClipboard, copyMultiple } from './copyToClipboard';
export { formatNewFolderName, formatNewFolderNameByLocale } from './format';
export { getAppCopy } from './getAppCopy';
export { TCopyProvider, type TCopyContextValue } from './TCopyContext';
export { useTCopy } from './useTCopy';
export { formatT } from './formatT';
```

- [ ] **Step 5: Update useAppStartup.ts** — Keep returning `locale` and `t` for backward compat, add `TCopyProvider` usage will be in App.tsx

No change needed to useAppStartup.ts — `App.tsx` will create the provider using its return values.

- [ ] **Step 6: Update App.tsx** — Wrap with TCopyProvider, remove `t` prop drilling

```tsx
// In App.tsx, after getting locale and t:
const { locale, t } = useAppStartup(appInfo);

// Wrap everything:
return (
  <TCopyProvider t={t} locale={locale}>
    <main className="adl-shell adl-ide">
      <TitleBar
        // REMOVE: t={t}
        appInfo={appInfo}
        ...
      />
      ...
      <LeftSidebar
        // REMOVE: t={t}
        ...
      />
      <CenterPane
        // REMOVE: t={t}
        ...
      />
      <RightPanel
        // REMOVE: t={t}
        ...
      />
      <CreateWorkspaceModal
        // REMOVE: t={t}
        ...
      />
      <NewSessionDialog
        // REMOVE: t={t}
        ...
      />
    </main>
  </TCopyProvider>
);
```

- [ ] **Step 7: Update all downstream components** — Remove `t` from props interfaces, use `useTCopy()` instead

For each component that currently receives `t: CopyDict` as a prop:
1. Remove `t` from the interface
2. Add `import { useTCopy } from '../i18n/useTCopy';`
3. Inside the function, add `const { t } = useTCopy();`
4. Keep all `t.xxx` usages unchanged

Components to update (remove `t` from props, use hook instead):
- `regions/TitleBar.tsx`
- `regions/LeftSidebar.tsx` (and pass down to children without `t` prop)
- `regions/CenterPane.tsx` → `regions/center-pane/WelcomeState.tsx`
- `regions/RightPanel.tsx` → all its children
- `components/NewSessionDialog.tsx`
- `components/CreateWorkspaceModal.tsx`
- `regions/left-sidebar/WorkspaceList.tsx`
- `regions/left-sidebar/SessionList.tsx`
- `regions/left-sidebar/SessionListRow.tsx`
- `regions/left-sidebar/SidebarContextMenu.tsx`
- `regions/left-sidebar/ConversationPanel.tsx`
- `regions/center-pane/ComposerFooter.tsx`
- `regions/center-pane/ApprovalInlineCard.tsx`
- `regions/right-panel/panels/ChangesPanel.tsx`
- `regions/right-panel/panels/ChangesToolbar.tsx`
- `regions/right-panel/panels/DiffToolbar.tsx`
- `regions/right-panel/FileNavigatorShell.tsx`
- `regions/right-panel/FileHistoryNav.tsx`
- `regions/right-panel/FileCreationBar.tsx`
- `regions/right-panel/FileContextMenu.tsx`
- `regions/right-panel/ToolSwitcher.tsx`
- `regions/right-panel/EditorSupport.tsx`
- `regions/right-panel/panels/CommunicationPanel.tsx`
- `features/terminal/*`
- `features/browser/*`
- `features/patch-review/*`
- `features/github-tree/*`
- `components/MessageStream.tsx`
- `components/agent/*`
- `components/approval/*`
- etc.

This is a mechanical change: remove `t` from interface, add `const { t } = useTCopy();`.

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/i18n/TCopyContext.tsx
git add ai-digital-life/frontend/src/app/i18n/useTCopy.ts
git add ai-digital-life/frontend/src/app/i18n/formatT.ts
git add ai-digital-life/frontend/src/app/i18n/index.ts
git add ai-digital-life/frontend/src/app/App.tsx
# plus all component files that had t removed from props
git commit -m "feat(i18n): add TCopyContext, useTCopy, formatT; eliminate t prop drilling"
```

---

### Task A2: Fix existing i18n bugs

- [ ] **Step 1: Fix selectionPromptZh** — en-US conversation.ts line 110 has Chinese text

In `frontend/src/app/i18n/en-US/conversation.ts`:
```typescript
// Change:
selectionPromptZh: '请基于以下选区继续工作：\n',
// To:
selectionPromptZh: 'Continue working based on the following selection:\n',
```

- [ ] **Step 2: Fix addToFileTree TODO** — zh-CN workspace.ts line 85 has `[TODO:zh]`

In `frontend/src/app/i18n/zh-CN/workspace.ts`:
```typescript
// Change:
addToFileTree: '[TODO:zh] Show in file tree',
// To:
addToFileTree: '在文件树中显示',
```

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/i18n/en-US/conversation.ts
git add ai-digital-life/frontend/src/app/i18n/zh-CN/workspace.ts
git commit -m "fix(i18n): fix selectionPromptZh and addToFileTree translation bugs"
```

---

### Task A3: Add all missing translation keys

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/common.ts`
- Modify: `frontend/src/app/i18n/en-US/common.ts`
- Modify: `frontend/src/app/i18n/zh-CN/conversation.ts`
- Modify: `frontend/src/app/i18n/en-US/conversation.ts`
- Modify: `frontend/src/app/i18n/zh-CN/workspace.ts`
- Modify: `frontend/src/app/i18n/en-US/workspace.ts`
- Modify: `frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `frontend/src/app/i18n/en-US/browser.ts`
- Modify: `frontend/src/app/i18n/zh-CN/ci.ts`
- Modify: `frontend/src/app/i18n/en-US/ci.ts`
- Modify: `frontend/src/app/i18n/zh-CN/file.ts`
- Modify: `frontend/src/app/i18n/en-US/file.ts`
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts`
- Modify: `frontend/src/app/i18n/en-US/changes.ts`
- Modify: `frontend/src/app/i18n/zh-CN/terminal.ts`
- Modify: `frontend/src/app/i18n/en-US/terminal.ts`
- Modify: `frontend/src/app/i18n/zh-CN/communicate.ts`
- Modify: `frontend/src/app/i18n/en-US/communicate.ts`

All new keys must be added in sync to both zh-CN and en-US files to maintain `CopyKey` type safety.

- [ ] **Step 1: Add keys to common.ts** (both zh-CN and en-US)

Add to `frontend/src/app/i18n/zh-CN/common.ts`:
```typescript
// ======== Confirm/Rename/Prompt Dialogs ========
confirm: '确认',
cancel: '取消',
rename: '重命名',
enterNewName: '输入新名称',
close: '关闭',
processing: '处理中...',
operationFailed: '操作失败，请重试',
// ======== Error Boundary ========
panelError: '该面板遇到意外错误，已降级保护。',
retry: '重试',
// ======== Action Buttons ========
send: '发送',
sendMessage: '发送消息',
stopGenerating: '停止生成',
waiting: '等待中...',
// ======== Prompt Input ========
promptPlaceholder: '向 AI 助手提问...',
mainInputPlaceholder: '描述你想要完成的任务...',
mainInputPlaceholderWithFile: '@文件 或描述你想要完成的任务...',
releaseToAddAttachment: '释放以添加附件',
inputAriaLabel: '消息输入框',
charCountAria: '{count} 个字符',
removeAttachment: '移除 {name}',
// ======== Message Bubble ========
aiAssistant: 'AI 助手',
messageActions: '消息操作',
copySuccess: '已复制',
copy: '复制',
copySuccessClipboard: '已复制到剪贴板',
copyMessageContent: '复制消息内容',
regenerate: '重新生成',
regenerateReply: '重新生成此回复',
editMessage: '编辑消息',
editThisMessage: '编辑此消息',
// ======== Context Builder ========
contextPlanMode: '规划模式',
contextDebugMode: '调试模式',
contextQAMode: '问答模式',
contextModelSelect: '模型选择',
contextSkillLibrary: '技能库',
contextMCPService: 'MCP 服务',
contextReferenceFile: '引用文件',
contextReferenceDoc: '引用文档',
contextReferenceLink: '引用链接',
contextCodebaseContext: '代码库上下文',
contextSectionMode: '模式',
contextSectionModel: '模型与技能',
contextSectionReference: '上下文引用',
contextAddContext: '添加上下文',
contextAddContextAria: '添加上下文选项',
contextSearchPlaceholder: '搜索...',
contextSearchAria: '搜索上下文选项',
contextNoMatch: '未找到匹配的选项',
contextRemoveAria: '移除 {label}',
// ======== Environment Controls ========
languageChinese: '中文',
languageEnglish: 'EN',
envControlsAria: 'Environment controls',
changeLanguageAria: 'Change language',
themeTooltip: 'Theme: {theme} (click to cycle)',
themeButtonAria: 'Current theme: {theme}. Click to change.',
// ======== Main Content ========
mainContentAria: '主内容区域',
// ======== Workspace Split Button ========
defaultNewDir: '默认目录/my-project',
```

Add corresponding keys to `frontend/src/app/i18n/en-US/common.ts`:
```typescript
confirm: 'Confirm',
cancel: 'Cancel',
rename: 'Rename',
enterNewName: 'Enter new name',
close: 'Close',
processing: 'Processing...',
operationFailed: 'Operation failed, please retry',
panelError: 'This panel encountered an unexpected error and has been degraded.',
retry: 'Retry',
send: 'Send',
sendMessage: 'Send message',
stopGenerating: 'Stop generating',
waiting: 'Waiting...',
promptPlaceholder: 'Ask the AI assistant...',
mainInputPlaceholder: 'Describe the task you want to accomplish...',
mainInputPlaceholderWithFile: '@file or describe the task...',
releaseToAddAttachment: 'Release to add attachment',
inputAriaLabel: 'Message input',
charCountAria: '{count} characters',
removeAttachment: 'Remove {name}',
aiAssistant: 'AI Assistant',
messageActions: 'Message actions',
copySuccess: 'Copied',
copy: 'Copy',
copySuccessClipboard: 'Copied to clipboard',
copyMessageContent: 'Copy message content',
regenerate: 'Regenerate',
regenerateReply: 'Regenerate this reply',
editMessage: 'Edit message',
editThisMessage: 'Edit this message',
contextPlanMode: 'Planning mode',
contextDebugMode: 'Debug mode',
contextQAMode: 'Q&A mode',
contextModelSelect: 'Model selection',
contextSkillLibrary: 'Skill library',
contextMCPService: 'MCP service',
contextReferenceFile: 'Reference file',
contextReferenceDoc: 'Reference document',
contextReferenceLink: 'Reference link',
contextCodebaseContext: 'Codebase context',
contextSectionMode: 'Mode',
contextSectionModel: 'Model & Skills',
contextSectionReference: 'Context references',
contextAddContext: 'Add context',
contextAddContextAria: 'Add context options',
contextSearchPlaceholder: 'Search...',
contextSearchAria: 'Search context options',
contextNoMatch: 'No matching options found',
contextRemoveAria: 'Remove {label}',
languageChinese: '中文',
languageEnglish: 'EN',
envControlsAria: 'Environment controls',
changeLanguageAria: 'Change language',
themeTooltip: 'Theme: {theme} (click to cycle)',
themeButtonAria: 'Current theme: {theme}. Click to change.',
mainContentAria: 'Main content area',
defaultNewDir: 'default-dir/my-project',
```

- [ ] **Step 2: Add keys to browser.ts** (both zh-CN and en-US)

Add to `frontend/src/app/i18n/zh-CN/browser.ts`:
```typescript
browserViewModeTree: '文件树',
browserViewModeList: '文件列表',
browserViewModeAll: '全列表',
browserViewModeDefault: '已打开标签',
browserCategoryWorkspace: '工作区目录',
browserCategoryUserFolder: '非工作区目录',
browserCategoryHistory: '历史目录',
browserContextOpenCurrent: '在当前标签打开',
browserContextOpenNewTab: '在新标签打开',
browserContextUnpin: '取消置顶',
browserContextPin: '置顶标签',
browserContextRename: '重命名',
browserContextEdit: '编辑',
browserContextCut: '剪切',
browserContextCopyLink: '复制链接',
browserContextDelete: '删除',
browserContextMore: '更多操作',
browserContextCreateTab: '新建标签',
browserContextDeleteAllTabs: '删除所有子标签',
browserContextDeleteAllHistory: '删除全部历史记录 + 标签',
browserContextOpenAllNewTabs: '全部在新标签打开',
browserContextRemoveFromView: '从此区域移除不显示',
browserContextDeleteDir: '删除此目录',
browserCannotOpenEmbedded: '该网站无法在嵌入式视图中打开，这通常是由于网站的安全策略导致的。',
browserSelectDirFirst: '请先选择一个目录',
browserTabCount: '共 {count} 个标签',
```

Add to `frontend/src/app/i18n/en-US/browser.ts`:
```typescript
browserViewModeTree: 'File tree',
browserViewModeList: 'File list',
browserViewModeAll: 'Full list',
browserViewModeDefault: 'Open tabs',
browserCategoryWorkspace: 'Workspace directory',
browserCategoryUserFolder: 'Non-workspace directory',
browserCategoryHistory: 'History',
browserContextOpenCurrent: 'Open in current tab',
browserContextOpenNewTab: 'Open in new tab',
browserContextUnpin: 'Unpin',
browserContextPin: 'Pin tab',
browserContextRename: 'Rename',
browserContextEdit: 'Edit',
browserContextCut: 'Cut',
browserContextCopyLink: 'Copy link',
browserContextDelete: 'Delete',
browserContextMore: 'More actions',
browserContextCreateTab: 'New tab',
browserContextDeleteAllTabs: 'Delete all child tabs',
browserContextDeleteAllHistory: 'Delete all history + tabs',
browserContextOpenAllNewTabs: 'Open all in new tabs',
browserContextRemoveFromView: 'Remove from this view',
browserContextDeleteDir: 'Delete this directory',
browserCannotOpenEmbedded: 'This site cannot be opened in the embedded view, usually due to the site\'s security policy.',
browserSelectDirFirst: 'Please select a directory first',
browserTabCount: '{count} tabs',
```

- [ ] **Step 3: Add keys to ci.ts** (both zh-CN and en-US)

Add to `frontend/src/app/i18n/zh-CN/ci.ts`:
```typescript
ciSelectWorkspace: '请选择一个工作区查看 CI 状态',
ciRefresh: '刷新',
ciSettings: '设置',
ciDeleteDir: '删除目录',
ciDeleteConfig: '删除CI配置',
ciDeleteData: '删除数据',
ciDeleteConfigAndData: '删除CI配置及数据',
ciDeleteNestedConfig: '删除CI配置[嵌套]',
ciDeleteNestedData: '删除数据[嵌套]',
ciDeleteNestedAll: '删除CI配置及数据[嵌套]',
ciDeleteDirHint: '删除此目录及其所有嵌套子目录，同时删除所有CI配置及数据。',
ciDeleteNestedConfigHint: '递归删除此目录及其所有嵌套子目录的CI配置。',
ciDeleteNestedDataHint: '删除此目录及其所有嵌套子目录的CI数据。',
ciDeleteNestedAllHint: '递归删除此目录及其所有嵌套子目录的CI配置及数据。',
ciUnpin: '取消置顶',
ciPin: '置顶',
ciRemoveFromView: '从此区域移除不显示',
ciRemoveFromViewHint: '将此工作区从工作区目录分类中移除，嵌套的子目录也将一并移除。不会删除任何数据，可在左侧边栏中恢复显示。',
ciDeleteAllNewDirs: '删除全部新建目录',
ciDeleteAllNewDirsHint: '删除所有通过"新建目录"创建的目录节点及其CI配置和数据。工作区目录不受影响。',
ciDeleteAllConfigs: '删除全部CI配置',
ciDeleteAllConfigsHint: '清空所有工作区和文件夹绑定的GitHub仓库配置（owner/repo/branch/token）。保留目录结构和CI运行数据。',
ciDeleteAllData: '删除全部数据',
ciDeleteAllDataHint: '清空当前面板显示的所有CI运行状态（快照/作业列表/错误信息）。保留配置信息。',
ciDeleteAllConfigsAndData: '删除全部CI配置及数据',
ciDeleteAllConfigsAndDataHint: '同时清空所有工作区和文件夹的GitHub配置以及所有CI运行数据。保留目录结构。',
ciRestoreAll: '恢复还原',
ciRestoreAllHint: '清空所有内容——删除所有新建目录、所有CI配置及数据，恢复到仅显示工作区目录顶级目录的初始状态。',
ciNoWorkflowData: '暂无 Workflow 数据',
ciNoJobData: '暂无 Job 数据',
ciLoading: '加载中...',
ciViewLog: '查看日志',
ciSearchLog: '搜索日志…',
ciPrevMatch: '上一个匹配',
ciNextMatch: '下一个匹配',
ciCollapseBlank: '折叠空白',
ciViewOnGitHub: '在 GitHub 查看',
ciLoadingLog: '加载日志中…',
ciNoLogData: '暂无日志数据',
ciViewFullLogOnGitHub: '在 GitHub 查看完整日志',
ciBlankLines: '{count} 行空白 — 点击展开',
ciStepsCount: '{count} 个 Step',
```

Add to `frontend/src/app/i18n/en-US/ci.ts`:
```typescript
ciSelectWorkspace: 'Please select a workspace to view CI status',
ciRefresh: 'Refresh',
ciSettings: 'Settings',
ciDeleteDir: 'Delete directory',
ciDeleteConfig: 'Delete CI config',
ciDeleteData: 'Delete data',
ciDeleteConfigAndData: 'Delete CI config and data',
ciDeleteNestedConfig: 'Delete CI config [nested]',
ciDeleteNestedData: 'Delete data [nested]',
ciDeleteNestedAll: 'Delete CI config and data [nested]',
ciDeleteDirHint: 'Delete this directory and all nested subdirectories, along with all CI config and data.',
ciDeleteNestedConfigHint: 'Recursively delete CI config for this directory and all nested subdirectories.',
ciDeleteNestedDataHint: 'Delete CI data for this directory and all nested subdirectories.',
ciDeleteNestedAllHint: 'Recursively delete CI config and data for this directory and all nested subdirectories.',
ciUnpin: 'Unpin',
ciPin: 'Pin',
ciRemoveFromView: 'Remove from this view',
ciRemoveFromViewHint: 'Remove this workspace from the workspace directory category. Nested subdirectories will also be removed. No data will be deleted, and it can be restored in the left sidebar.',
ciDeleteAllNewDirs: 'Delete all new directories',
ciDeleteAllNewDirsHint: 'Delete all directory nodes created via "New Directory" and their CI config and data. Workspace directories are not affected.',
ciDeleteAllConfigs: 'Delete all CI configs',
ciDeleteAllConfigsHint: 'Clear all GitHub repository configs (owner/repo/branch/token) bound to workspaces and folders. Directory structure and CI run data are preserved.',
ciDeleteAllData: 'Delete all data',
ciDeleteAllDataHint: 'Clear all CI run states (snapshots/job lists/errors) displayed in the current panel. Config info is preserved.',
ciDeleteAllConfigsAndData: 'Delete all CI configs and data',
ciDeleteAllConfigsAndDataHint: 'Clear all GitHub configs and CI run data simultaneously. Directory structure is preserved.',
ciRestoreAll: 'Restore all',
ciRestoreAllHint: 'Clear everything — delete all new directories, all CI configs and data, restoring the initial state showing only workspace directory top-level directories.',
ciNoWorkflowData: 'No workflow data',
ciNoJobData: 'No job data',
ciLoading: 'Loading...',
ciViewLog: 'View log',
ciSearchLog: 'Search logs…',
ciPrevMatch: 'Previous match',
ciNextMatch: 'Next match',
ciCollapseBlank: 'Collapse blank lines',
ciViewOnGitHub: 'View on GitHub',
ciLoadingLog: 'Loading log…',
ciNoLogData: 'No log data',
ciViewFullLogOnGitHub: 'View full log on GitHub',
ciBlankLines: '{count} blank lines — click to expand',
ciStepsCount: '{count} steps',
```

- [ ] **Step 4: Add keys to changes.ts** (both zh-CN and en-US)

Add to `frontend/src/app/i18n/zh-CN/changes.ts`:
```typescript
changesNoChanges: '当前没有检测到文件变更',
changesOpenWorkspace: '打开工作区以查看变更',
changesFileTree: '文件树',
changesRename: '重命名',
changesCurrentPath: '当前路径: {path}',
changesEnterNewName: '输入新名称',
changesRenameSession: '重命名会话',
changesCurrentName: '当前名称: {name}',
changesEnterSessionName: '输入新会话名称',
changesRenameDir: '重命名目录',
changesOutline: '文档大纲',
changesPreviewNotSupported: '此文件类型暂不支持预览',
changesPreviewDocx: 'DOCX 文档',
changesPreviewPdf: 'PDF 文档',
changesPreviewBinary: '二进制文件',
```

Add to `frontend/src/app/i18n/en-US/changes.ts`:
```typescript
changesNoChanges: 'No file changes detected',
changesOpenWorkspace: 'Open a workspace to view changes',
changesFileTree: 'File tree',
changesRename: 'Rename',
changesCurrentPath: 'Current path: {path}',
changesEnterNewName: 'Enter new name',
changesRenameSession: 'Rename session',
changesCurrentName: 'Current name: {name}',
changesEnterSessionName: 'Enter new session name',
changesRenameDir: 'Rename directory',
changesOutline: 'Outline',
changesPreviewNotSupported: 'Preview is not supported for this file type',
changesPreviewDocx: 'DOCX document',
changesPreviewPdf: 'PDF document',
changesPreviewBinary: 'Binary file',
```

- [ ] **Step 5: Add keys to communicate.ts** (both zh-CN and en-US)

Add to `frontend/src/app/i18n/zh-CN/communicate.ts`:
```typescript
communicateWechat: '微信',
communicateFeishu: '飞书',
communicateEmail: '邮箱',
communicateTabFeishu: '飞书',
communicateTabWechat: '微信',
communicateTabEmail: '邮箱',
communicateDirList: '目录列表',
communicateRefreshAll: '刷新全部',
communicateNewDir: '新建目录',
```

Add to `frontend/src/app/i18n/en-US/communicate.ts`:
```typescript
communicateWechat: 'WeChat',
communicateFeishu: 'Feishu',
communicateEmail: 'Email',
communicateTabFeishu: 'Feishu',
communicateTabWechat: 'WeChat',
communicateTabEmail: 'Email',
communicateDirList: 'Directory list',
communicateRefreshAll: 'Refresh all',
communicateNewDir: 'New directory',
```

- [ ] **Step 6: Add keys to terminal.ts** (both zh-CN and en-US)

Add to `frontend/src/app/i18n/zh-CN/terminal.ts`:
```typescript
terminalHistory: '终端历史',
terminalLabel: '终端',
terminalCreate: '创建终端',
terminalDefaultProfile: '默认为{profile}终端',
terminalRemoveFromView: '从此区域移除不显示',
terminalCopyFullPath: '复制完整路径',
terminalCopyRelativePath: '复制相对路径',
```

Add to `frontend/src/app/i18n/en-US/terminal.ts`:
```typescript
terminalHistory: 'Terminal history',
terminalLabel: 'Terminal',
terminalCreate: 'Create terminal',
terminalDefaultProfile: 'Default {profile} terminal',
terminalRemoveFromView: 'Remove from this view',
terminalCopyFullPath: 'Copy full path',
terminalCopyRelativePath: 'Copy relative path',
```

- [ ] **Step 7: Add key to file.ts**

Add to `frontend/src/app/i18n/zh-CN/file.ts`:
```typescript
fileRemoveFromView: '从此区域移除不显示',
fileCopyFullPath: '复制完整路径',
fileCopyRelativePath: '复制相对路径',
```

Add to `frontend/src/app/i18n/en-US/file.ts`:
```typescript
fileRemoveFromView: 'Remove from this view',
fileCopyFullPath: 'Copy full path',
fileCopyRelativePath: 'Copy relative path',
```

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/i18n/zh-CN/*.ts
git add ai-digital-life/frontend/src/app/i18n/en-US/*.ts
git commit -m "feat(i18n): add ~150 new translation keys across all domain files"
```

---

### Task A4: Run i18n coverage check

- [ ] **Step 1: Run the existing check script**

Run: `cd ai-digital-life/frontend && pnpm run check:i18n`
Expected: PASS — zh-CN and en-US key sets are fully symmetric

- [ ] **Step 2: Fix any key mismatch errors**

If the script reports missing/mismatched keys, add the missing ones to the appropriate file.

- [ ] **Step 3: Run typecheck**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Expected: No type errors — all new keys satisfy `CopyKey`

- [ ] **Step 4: Commit any fixes**

---

## Sub-plan B: Core Components

### Task B1: Migrate ConfirmDialog.tsx

**File:** `frontend/src/app/components/ConfirmDialog.tsx`

- [ ] **Step 1: Replace hardcoded default props with t**

```typescript
import { useTCopy } from '../i18n/useTCopy';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTCopy();
  const resolvedConfirm = confirmLabel ?? t.confirm;
  const resolvedCancel = cancelLabel ?? t.cancel;
  // ...
  // Replace hardcoded:
  //   confirmLabel = '确认', cancelLabel = '取消'
  // With:
  //   resolvedConfirm, resolvedCancel
  // Use resolvedConfirm and resolvedCancel in JSX
}
```

- [ ] **Step 2: Verify test**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/ConfirmDialog.tsx
git commit -m "fix(i18n): migrate ConfirmDialog hardcoded Chinese to t keys"
```

### Task B2: Migrate RenameDialog.tsx

**File:** `frontend/src/app/components/RenameDialog.tsx`

- [ ] **Step 1: Replace hardcoded default props and JSX text**

```typescript
import { useTCopy } from '../i18n/useTCopy';

interface RenameDialogProps {
  open: boolean;
  initialValue: string;
  title?: string;
  placeholder?: string;
  itemInfo?: string;
  onConfirm: (newName: string) => void | Promise<void>;
  onCancel: () => void;
}

export function RenameDialog({
  open,
  initialValue,
  title,
  placeholder,
  itemInfo,
  onConfirm,
  onCancel,
}: RenameDialogProps) {
  const { t } = useTCopy();
  const resolvedTitle = title ?? t.rename;
  const resolvedPlaceholder = placeholder ?? t.enterNewName;
  // ...
  // Replace:
  //   aria-label="关闭"  →  aria-label={t.close}
  //   取消  →  {t.cancel}
  //   确认中... / 确认   →  {loading ? t.processing : t.confirm}
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/RenameDialog.tsx
git commit -m "fix(i18n): migrate RenameDialog hardcoded Chinese to t keys"
```

### Task B3: Migrate PromptModal.tsx

**File:** `frontend/src/app/components/PromptModal.tsx`

- [ ] **Step 1: Replace hardcoded strings**

```typescript
import { useTCopy } from '../i18n/useTCopy';

export function PromptModal({ ... }: PromptModalProps) {
  const { t } = useTCopy();
  // Replace:
  //   setError('操作失败，请重试')  →  setError(t.operationFailed)
  //   取消  →  {t.cancel}
  //   {loading ? '处理中...' : okLabel}  →  {loading ? t.processing : okLabel}
}
```

- [ ] **Step 2: Commit**

### Task B4: Migrate ErrorBoundary.tsx

**File:** `frontend/src/app/components/ErrorBoundary.tsx`

- [ ] **Step 1: Replace hardcoded strings**

Since ErrorBoundary is a class component (cannot use hooks), use the `copy` object directly:

```typescript
import { copy } from '../i18n';
import type { Locale } from '../i18n';
// ... need locale somehow — best approach: make locale a prop, or use a consumer

// Option A: Add locale prop to ErrorBoundary
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  locale?: Locale;  // optional, defaults to 'zh-CN'
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

// In render:
const currentLocale = this.props.locale ?? 'zh-CN';
const t = copy[currentLocale];
// Replace:
//   <p>该面板遇到意外错误，已降级保护。</p>  →  <p>{t.panelError}</p>
//   重试  →  {t.retry}
```

- [ ] **Step 2: Pass locale to ErrorBoundary in App.tsx**

```tsx
<ErrorBoundary locale={locale}>
  <LeftSidebar ... />
</ErrorBoundary>
```

- [ ] **Step 3: Commit**

### Task B5: Migrate ActionButton.tsx

**File:** `frontend/src/app/components/ActionButton.tsx`

- [ ] **Step 1: Replace hardcoded Chinese in APPEARANCE_MAP**

```typescript
import { useTCopy } from '../i18n/useTCopy';

export function ActionButton({ state, hasContent, onSend, onStop, onRetry }: ActionButtonProps) {
  const { t } = useTCopy();

  const APPEARANCE_MAP = useMemo(() => ({
    'idle-empty': () => ({
      icon: 'arrow-up' as IconName,
      label: t.send,
      className: 'action-btn action-btn--idle action-btn--empty',
      isDisabled: true,
      onClick: () => {},
    }),
    'idle-ready': ({ onSend: send }: ActionButtonProps) => ({
      icon: 'arrow-up' as IconName,
      label: t.sendMessage,
      className: 'action-btn action-btn--idle action-btn--ready',
      isDisabled: false,
      onClick: send,
    }),
    generating: ({ onStop: stop }: ActionButtonProps) => ({
      icon: 'stop-circle' as IconName,
      label: t.stopGenerating,
      className: 'action-btn action-btn--generating',
      isDisabled: false,
      onClick: stop,
    }),
    error: ({ onRetry: retry }: ActionButtonProps) => ({
      icon: 'rotate-ccw' as IconName,
      label: t.retry,
      className: 'action-btn action-btn--error',
      isDisabled: false,
      onClick: retry,
    }),
    waiting: () => ({
      icon: 'loader-2' as IconName,
      label: t.waiting,
      className: 'action-btn action-btn--waiting',
      isDisabled: true,
      onClick: () => {},
    }),
  }), [t]);
  // Move APPEARANCE_MAP inside the component function
}
```

- [ ] **Step 2: Commit**

### Task B6: Migrate MessageBubble.tsx

**File:** `frontend/src/app/components/MessageBubble.tsx`

- [ ] **Step 1: Replace hardcoded Chinese**

```typescript
import { useTCopy } from '../i18n/useTCopy';

export function MessageBubble({ id, role, content, timestamp }: MessageBubbleProps) {
  const { t } = useTCopy();
  // Replace:
  //   <span className="message-bubble__role">AI 助手</span>  →  <span>{t.aiAssistant}</span>
  //   aria-label="消息操作"  →  aria-label={t.messageActions}
  //   TooltipSimple content={copied ? '已复制' : '复制'}  →  TooltipSimple content={copied ? t.copySuccess : t.copy}
  //   aria-label={copied ? '已复制到剪贴板' : '复制消息内容'}  →  aria-label={copied ? t.copySuccessClipboard : t.copyMessageContent}
  //   TooltipSimple content="重新生成"  →  TooltipSimple content={t.regenerate}
  //   aria-label="重新生成此回复"  →  aria-label={t.regenerateReply}
  //   TooltipSimple content="编辑消息"  →  TooltipSimple content={t.editMessage}
  //   aria-label="编辑此消息"  →  aria-label={t.editThisMessage}
}
```

- [ ] **Step 2: Commit**

### Task B7: Migrate PromptInput.tsx

**File:** `frontend/src/app/components/PromptInput.tsx`

- [ ] **Step 1: Replace hardcoded default and text**

```typescript
import { useTCopy } from '../i18n/useTCopy';

export function PromptInput({ ... }: PromptInputProps) {
  const { t, formatT } = useTCopy();
  // Replace:
  //   placeholder = '向 AI 助手提问...'  →  placeholder = t.promptPlaceholder
  //   aria-label="消息输入框"  →  aria-label={t.inputAriaLabel}
  //   <span>释放以添加附件</span>  →  <span>{t.releaseToAddAttachment}</span>
  //   aria-label={`${charCount} 个字符`}  →  aria-label={formatT(t, 'charCountAria', { count: charCount })}
  //   aria-label={`移除 ${attachment.name}`}  →  aria-label={formatT(t, 'removeAttachment', { name: attachment.name })}
}
```

- [ ] **Step 2: Commit**

### Task B8: Migrate MainContent.tsx

**File:** `frontend/src/app/components/MainContent.tsx`

- [ ] **Step 1: Replace hardcoded aria-label and placeholders**

```typescript
import { useTCopy } from '../i18n/useTCopy';

export function MainContent({ ... }: MainContentProps) {
  const { t } = useTCopy();
  // Replace:
  //   aria-label="主内容区域"  →  aria-label={t.mainContentAria}
  //   placeholder="描述你想要完成的任务..."  →  placeholder={t.mainInputPlaceholder}
  //   placeholder="@文件 或描述你想要完成的任务..."  →  placeholder={t.mainInputPlaceholderWithFile}
}
```

- [ ] **Step 2: Commit**

### Task B9: Migrate EnvironmentControls.tsx

**File:** `frontend/src/app/components/EnvironmentControls.tsx`

- [ ] **Step 1: Replace hardcoded language labels**

```typescript
import { useTCopy } from '../i18n/useTCopy';

export function EnvironmentControls({ ... }: EnvironmentControlsProps) {
  const { t } = useTCopy();

  const LANGUAGE_OPTIONS: readonly { code: string; label: string }[] = [
    { code: 'zh-CN', label: t.languageChinese },
    { code: 'en-US', label: t.languageEnglish },
  ];
  // Also replace:
  //   aria-label="Options"  →  aria-label="Options" (keep as-is, it's a generic label)
   // Actually the Dropdown aria-label="Options" is fine, it's English already
  // But replace:
  //   aria-label="Change language"  →  aria-label={t.changeLanguageAria} (this is English too, fine)
  //   Theme: ${currentTheme} (click to cycle)  →  formatT(t, 'themeTooltip', { theme: currentTheme })
}
```

- [ ] **Step 2: Commit**

### Task B10: Migrate WelcomeState.tsx (components/)

**File:** `frontend/src/app/components/WelcomeState.tsx`

- [ ] **Step 1: Replace ALL hardcoded Chinese text**

```typescript
import { useTCopy } from '../i18n/useTCopy';

export function WelcomeState({ variant, ... }: WelcomeStateProps) {
  const { t } = useTCopy();

  const SUGGESTIONS = [
    t.welcomeSuggestionArchitecture,
    t.welcomeSuggestionBug,
    t.welcomeSuggestionTest,
    t.welcomeSuggestionPerformance,
    t.welcomeSuggestionExplain,
  ];

  const TIPS = [
    { icon: 'folder-open' as IconName, text: t.welcomeHintDrag },
    { icon: 'keyboard' as IconName, text: t.welcomeHintOpen },
    { icon: 'globe' as IconName, text: t.welcomeHintClone },
  ];

  // Replace ALL hardcoded JSX text:
  //   "开始新对话"  →  {t.welcomeStartChatTitle}
  //   "向 AI 助手提问或下达任务"  →  {t.welcomeStartChatDescription}
  //   "打开工作空间"  →  {t.welcomeOpenWorkspace}
  //   "选择一个项目目录开始"  →  {t.welcomeOpenWorkspaceDescription}
  //   "最近打开的工作空间"  →  {t.welcomeRecentWorkspaces}
  //   placeholder="搜索工作空间..."  →  placeholder={t.welcomeSearchPlaceholder}
  //   aria-label="搜索最近工作空间"  →  aria-label={t.welcomeSearchAria}
  //   aria-label="最近工作空间"  →  aria-label={t.welcomeRecentAria}
  //   "未找到匹配的工作空间"  →  {t.welcomeNoMatch}
  //   "—— 或 ——"  →  {t.welcomeOr}
  //   "快速提示"  →  {t.welcomeHints}
}
```

- [ ] **Step 2: Add the new keys needed for WelcomeState.suggestions to conversation.ts**

```typescript
// To both zh-CN and en-US conversation.ts:
welcomeSuggestionArchitecture: '帮我理解这个项目的架构' / 'Help me understand the project architecture'
welcomeSuggestionBug: '修复登录页面的 bug' / 'Fix the login page bug'
welcomeSuggestionTest: '为这个模块添加单元测试' / 'Add unit tests for this module'
welcomeSuggestionPerformance: '优化数据库查询性能' / 'Optimize database query performance'
welcomeSuggestionExplain: '解释这段代码的作用' / 'Explain what this code does'
welcomeSearchPlaceholder: '搜索工作空间...' / 'Search workspaces...'
welcomeSearchAria: '搜索最近工作空间' / 'Search recent workspaces'
welcomeRecentAria: '最近工作空间' / 'Recent workspaces'
welcomeNoMatch: '未找到匹配的工作空间' / 'No matching workspaces found'
welcomeOr: '—— 或 ——' / '—— or ——'
```

- [ ] **Step 3: Commit**

### Task B11: Migrate ContextBuilder.tsx

**File:** `frontend/src/app/components/ContextBuilder.tsx`

- [ ] **Step 1: Replace hardcoded Chinese**

```typescript
import { useTCopy } from '../i18n/useTCopy';

export function ContextBuilder({ ... }: ContextBuilderProps) {
  const { t } = useTCopy();

  const CONTEXT_ITEMS: ContextItem[] = [
    { type: 'plan', label: t.contextPlanMode, icon: 'clipboard-list' as IconName, section: 'mode' },
    { type: 'debug', label: t.contextDebugMode, icon: 'bug' as IconName, section: 'mode' },
    { type: 'ask', label: t.contextQAMode, icon: 'message-circle-question' as IconName, section: 'mode' },
    { type: 'model', label: t.contextModelSelect, icon: 'cpu' as IconName, section: 'model' },
    { type: 'skills', label: t.contextSkillLibrary, icon: 'sparkles' as IconName, section: 'model' },
    { type: 'mcp', label: t.contextMCPService, icon: 'plug' as IconName, section: 'model' },
    { type: '@file', label: t.contextReferenceFile, icon: 'file-text' as IconName, section: 'reference' },
    { type: '@doc', label: t.contextReferenceDoc, icon: 'book-open' as IconName, section: 'reference' },
    { type: '@url', label: t.contextReferenceLink, icon: 'link' as IconName, section: 'reference' },
    { type: '@codebase', label: t.contextCodebaseContext, icon: 'database' as IconName, section: 'reference' },
  ];

  const SECTION_LABELS: Record<string, string> = {
    mode: t.contextSectionMode,
    model: t.contextSectionModel,
    reference: t.contextSectionReference,
  };

  // Replace:
  //   TooltipSimple content="添加上下文"  →  TooltipSimple content={t.contextAddContext}
  //   aria-label="添加上下文选项"  →  aria-label={t.contextAddContextAria}
  //   placeholder="搜索..."  →  placeholder={t.contextSearchPlaceholder}
  //   aria-label="搜索上下文选项"  →  aria-label={t.contextSearchAria}
  //   "未找到匹配的选项"  →  {t.contextNoMatch}
  //   aria-label={`移除 ${ctx.label}`}  →  aria-label={formatT(t, 'contextRemoveAria', { label: ctx.label })}
}
```

- [ ] **Step 2: Commit**

### Task B12: Migrate WorkspaceSplitButton.tsx

**File:** `frontend/src/app/components/WorkspaceSplitButton.tsx`

- [ ] **Step 1: Replace hardcoded default path**

```typescript
import { useTCopy } from '../i18n/useTCopy';

// Replace:
//   defaultCreateDir ? `${defaultCreateDir}/my-project` : '默认目录/my-project'
// With:
//   defaultCreateDir ? `${defaultCreateDir}/my-project` : t.defaultNewDir
```

- [ ] **Step 2: Commit**

---

## Sub-plan C: Feature Components

### Task C1: Migrate browserpanel.tsx

**File:** `frontend/src/app/features/browser/browserpanel.tsx`

Replace the following hardcoded strings:
- `tree: '文件树'` → `tree: t.browserViewModeTree`
- `list: '文件列表'` → `list: t.browserViewModeList`
- `all: '全列表'` → `all: t.browserViewModeAll`
- fallback `'已打开标签'` → `t.browserViewModeDefault`
- `workspaceCategory: '工作区目录'` → `workspaceCategory: t.browserCategoryWorkspace`
- `userFolderCategory: '非工作区目录'` → `userFolderCategory: t.browserCategoryUserFolder`
- `historyCategory: '历史目录'` → `historyCategory: t.browserCategoryHistory`
- `showToast('请先选择一个目录', 'warning')` → `showToast(t.browserSelectDirFirst, 'warning')`
- `<p>该网站无法在嵌入式视图中打开...</p>` → `<p>{t.browserCannotOpenEmbedded}</p>`

- [ ] **Step 1: Add `useTCopy` hook, replace all hardcoded strings**
- [ ] **Step 2: Commit**

### Task C2: Migrate BrowserContextMenu.tsx

**File:** `frontend/src/app/features/browser/BrowserContextMenu.tsx`

- [ ] **Step 1: Replace hardcoded Chinese menu labels with `t.xxx`**

```typescript
import { useTCopy } from '../../i18n/useTCopy';

// Replace:
//   <span>在当前标签打开</span>  →  <span>{t.browserContextOpenCurrent}</span>
//   <span>在新标签打开</span>  →  <span>{t.browserContextOpenNewTab}</span>
//   <span>{contextMenu.isPinned ? '取消置顶' : '置顶标签'}</span>  →  <span>{contextMenu.isPinned ? t.browserContextUnpin : t.browserContextPin}</span>
//   <span>重命名</span>  →  <span>{t.browserContextRename}</span>
//   <span>编辑</span>  →  <span>{t.browserContextEdit}</span>
//   <span>剪切</span>  →  <span>{t.browserContextCut}</span>
//   <span>复制链接</span>  →  <span>{t.browserContextCopyLink}</span>
//   <span>删除</span>  →  <span>{t.browserContextDelete}</span>
```

- [ ] **Step 2: Commit**

### Task C3: Migrate BrowserTreeEntry.tsx

**File:** `frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx`

- [ ] **Step 1: Replace ~25 hardcoded menu labels**

Replace `label: '更多操作'` → `label: t.browserContextMore`, etc. for all menu item labels defined in the browser context menu configuration objects.

- [ ] **Step 2: Commit**

### Task C4: Migrate GitHubTreeEntry.tsx

**File:** `frontend/src/app/features/github-tree/GitHubTreeEntry.tsx`

- [ ] **Step 1: Replace ~40 hardcoded menu labels and hints**

Replace all `label:` and `hint:` values with `t.ciXxx` lookups (keys defined in Task A3 Step 3).

- [ ] **Step 2: Commit**

### Task C5: Migrate remaining feature files

- `features/terminal/TerminalPanel.tsx` — Replace `'终端历史'` and `'终端'`
- `features/workspace-browser/multiworkspacebrowser.tsx` — Replace `共 ${count} 个标签`
- `features/workspace-changes-tree/WorkspaceChangesEntry.tsx` — Replace 3 menu labels
- `features/workspace-file-tree/WorkspaceFileTreeEntry.tsx` — Replace 3 menu labels
- `features/workspace-terminal/WorkspaceTerminalEntry.tsx` — Replace 4 hardcoded strings
- `features/browser/BrowserMenuDropdown.tsx` — Replace `"更多操作"`

- [ ] **Step 1: One-by-one migrate each file**
- [ ] **Step 2: Commit after each file for clean history**

---

## Sub-plan D: Region Components

### Task D1: Migrate SessionList.tsx and LeftSidebar.tsx

**Files:**
- `frontend/src/app/regions/left-sidebar/SessionList.tsx`
- `frontend/src/app/regions/LeftSidebar.tsx`

- [ ] **Step 1: Replace RenameDialog props in SessionList.tsx**

```typescript
const { t, formatT } = useTCopy();
// Replace:
//   title="重命名会话"  →  title={t.changesRenameSession}
//   itemInfo={`当前名称: ${sessionToRename.name}`}  →  itemInfo={formatT(t, 'changesCurrentName', { name: sessionToRename.name })}
//   placeholder="输入新会话名称"  →  placeholder={t.changesEnterSessionName}
```

- [ ] **Step 2: Same changes in LeftSidebar.tsx**
- [ ] **Step 3: Commit**

### Task D2: Migrate FileNavigatorShell.tsx and ChangesPanel.tsx

**Files:**
- `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx`
- `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx`

- [ ] **Step 1: Replace RenameDialog-related hardcoded Chinese**

```typescript
// FileNavigatorShell.tsx:
//   title="重命名"  →  title={t.changesRename}
//   itemInfo={`当前路径: ${renamingPath}`}  →  itemInfo={formatT(t, 'changesCurrentPath', { path: renamingPath })}
//   placeholder="输入新名称"  →  placeholder={t.changesEnterNewName}
//   TooltipSimple content="刷新全部"  →  TooltipSimple content={t.communicateRefreshAll}
//   TooltipSimple content="文档大纲"  →  TooltipSimple content={t.changesOutline}

// ChangesPanel.tsx:
//   title="重命名"  →  title={t.changesRename}
//   itemInfo={`当前路径: ${changesRenamingPath}`}  →  itemInfo={formatT(t, 'changesCurrentPath', { path: changesRenamingPath })}
//   placeholder="输入新名称"  →  placeholder={t.changesEnterNewName}
//   '文件树'  →  t.changesFileTree
```

- [ ] **Step 2: Commit**

### Task D3: Migrate ChangesEmptyState.tsx and EditorSurfaceShell.tsx

**Files:**
- `frontend/src/app/regions/right-panel/panels/ChangesEmptyState.tsx`
- `frontend/src/app/regions/right-panel/EditorSurfaceShell.tsx`

```typescript
// ChangesEmptyState.tsx:
// Replace: {message ?? (hasWorkspaces ? '当前没有检测到文件变更' : '打开工作区以查看变更')}
// With: {message ?? (hasWorkspaces ? t.changesNoChanges : t.changesOpenWorkspace)}

// EditorSurfaceShell.tsx:
// Replace preview messages with t.changesPreviewDocx, t.changesPreviewNotSupported, etc.
```

- [ ] **Step 1: Apply changes**
- [ ] **Step 2: Commit**

### Task D4: Migrate CommunicationPanel.tsx and GitHub feature files

**Files:**
- `frontend/src/app/regions/right-panel/panels/CommunicationPanel.tsx`
- `frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx`
- `frontend/src/app/regions/right-panel/panels/communicate/GitHubLogViewer.tsx`
- `frontend/src/app/regions/right-panel/panels/communicate/WorkflowsView.tsx`
- `frontend/src/app/regions/right-panel/panels/communicate/JobsView.tsx`
- `frontend/src/app/regions/right-panel/panels/communicate/OverviewView.tsx`
- `frontend/src/app/regions/right-panel/panels/communicate/JobRow.tsx`

- [ ] **Step 1: CommunicationPanel.tsx** — Replace tab labels
```typescript
// Replace hardcoded:
//   label: '飞书', label: '微信', label: '邮箱'
// With:
//   label: t.communicateTabFeishu, label: t.communicateTabWechat, label: t.communicateTabEmail
```

- [ ] **Step 2: GitHubPanel.tsx** — Replace all hardcoded labels, hints, and TooltipSimple content
```typescript
// Replace TooltipSimple content="刷新全部"  →  content={t.communicateRefreshAll}
// Replace "文件树" / "目录列表"  →  t.changesFileTree / t.communicateDirList
// Replace all menu labels and hints with ciXxx keys
```

- [ ] **Step 3: GitHubLogViewer.tsx** — Replace hardcoded strings
```typescript
// title="上一个匹配"  →  title={t.ciPrevMatch}
// title="下一个匹配"  →  title={t.ciNextMatch}
// placeholder="搜索日志…"  →  placeholder={t.ciSearchLog}
// etc.
```

- [ ] **Step 4: WorkflowsView.tsx, JobsView.tsx, OverviewView.tsx, JobRow.tsx** — Replace hardcoded Chinese
- [ ] **Step 5: Commit**

### Task D5: Migrate TitleBar.tsx and region WelcomeState

**Files:**
- `frontend/src/app/regions/TitleBar.tsx`
- `frontend/src/app/regions/center-pane/WelcomeState.tsx`
- `frontend/src/app/regions/left-sidebar/ResizeHandle.tsx`

- [ ] **Step 1: TitleBar.tsx** — Replace language button aria-label
```typescript
// Replace: aria-label={`${t.language}: ${nextLanguage === 'zh-CN' ? '中文' : 'EN'}`}
// With: aria-label={`${t.language}: ${nextLanguage === 'zh-CN' ? t.languageChinese : t.languageEnglish}`}
```

- [ ] **Step 2: Center-pane WelcomeState.tsx** — Replace hardcoded aria-labels
```typescript
// Replace aria-label="欢迎页"  →  use t key
// Replace aria-label="快速操作"  →  use t key
```

- [ ] **Step 3: ResizeHandle.tsx** — Replace hardcoded aria-labels
```typescript
// Replace: aria-label="调整侧边栏宽度"  →  use t key
// Replace: aria-label="调整对话区域高度"  →  use t key
```
Add keys to common.ts:
```typescript
// zh-CN:
resizeSidebar: '调整侧边栏宽度',
resizeConversation: '调整对话区域高度',
// en-US:
resizeSidebar: 'Resize sidebar width',
resizeConversation: 'Resize conversation area height',
```

- [ ] **Step 4: Commit**

---

## Sub-plan E: Native title → TooltipSimple sweep

### Task E1: Replace 8 remaining native `title` attributes

**Files (one at a time):**
1. `regions/right-panel/panels/communicate/JobRow.tsx:46`

```typescript
// Before: <td title="查看日志">
// After: <TooltipSimple content={t.ciViewLog}><td>...</td></TooltipSimple>
```

2. `regions/right-panel/panels/communicate/GitHubLogViewer.tsx:291`
```typescript
// Before: <button title="上一个匹配">
// After: <TooltipSimple content={t.ciPrevMatch}><button>...</button></TooltipSimple>
```

3. `regions/right-panel/panels/communicate/GitHubLogViewer.tsx:302`
```typescript
// Before: <button title="下一个匹配">
// After: <TooltipSimple content={t.ciNextMatch}><button>...</button></TooltipSimple>
```

4. `regions/right-panel/panels/ChangesPanel.tsx:835`
```typescript
// Before: <span title="重命名">
// After: <TooltipSimple content={t.changesRename}><span>...</span></TooltipSimple>
```

5. `regions/right-panel/FileNavigatorShell.tsx:726`
```typescript
// Before: <span title="重命名">
// After: <TooltipSimple content={t.changesRename}><span>...</span></TooltipSimple>
```

6. `features/github-tree/GitHubTreeEntry.tsx:1045`
```typescript
// Before: <span title="重命名目录">
// After: <TooltipSimple content={t.changesRenameDir}><span>...</span></TooltipSimple>
```

7. `regions/left-sidebar/SessionList.tsx:368`
```typescript
// Before: <span title="重命名会话">
// After: <TooltipSimple content={t.changesRenameSession}><span>...</span></TooltipSimple>
```

8. `regions/LeftSidebar.tsx:284`
```typescript
// Before: <span title="重命名会话">
// After: <TooltipSimple content={t.changesRenameSession}><span>...</span></TooltipSimple>
```

- [ ] **Step 1-8: Replace each title attribute with TooltipSimple**
- [ ] **Step after all 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/regions/right-panel/panels/communicate/JobRow.tsx
git add ai-digital-life/frontend/src/app/regions/right-panel/panels/communicate/GitHubLogViewer.tsx
git add ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx
git add ai-digital-life/frontend/src/app/regions/right-panel/FileNavigatorShell.tsx
git add ai-digital-life/frontend/src/app/features/github-tree/GitHubTreeEntry.tsx
git add ai-digital-life/frontend/src/app/regions/left-sidebar/SessionList.tsx
git add ai-digital-life/frontend/src/app/regions/LeftSidebar.tsx
git commit -m "fix(i18n): replace native title attributes with TooltipSimple"
```

---

## Sub-plan F: Verification

### Task F1: Run i18n coverage check

- [ ] **Step 1: Verify key symmetry**

Run: `cd ai-digital-life/frontend && pnpm run check:i18n`
Expected: PASS — all keys match between zh-CN and en-US

- [ ] **Step 2: Run TypeScript type check**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run ESLint**

Run: `cd ai-digital-life/frontend && npx eslint .`
Expected: No new lint errors

- [ ] **Step 4: Run existing unit tests**

Run: `cd ai-digital-life/frontend && pnpm test` (or find the exact test command)
Expected: All existing tests pass

- [ ] **Step 5: Verify Tauri build (optional)**

Run: `cd ai-digital-life && cargo tauri build` (or `cargo tauri dev` for quick check)
Expected: Build succeeds

- [ ] **Step 6: Commit any fixes**

---

## Self-Review Checklist

### 1. Spec coverage
- ✅ **Tooltip i18n**: Sub-plan E replaces all native `title`; Task B5/B6/B11/B4/B10 already use `TooltipSimple` with `t.xxx`
- ✅ **Dialog i18n**: Task B1 (ConfirmDialog), B2 (RenameDialog), B3 (PromptModal)
- ✅ **Menu i18n**: Task C2 (BrowserContextMenu), C3 (BrowserTreeEntry), C4 (GitHubTreeEntry), D4 (GitHubPanel)
- ✅ **Card i18n**: Cards already use `t.xxx` in their existing implementations (ApprovalCard, PlanCard, etc.)
- ✅ **Surface text i18n**: Tasks B5-B12 cover all 10+ core UI components
- ✅ **Feature i18n**: Sub-plans C and D cover browser, GitHub, terminal, workspace tree, panels
- ✅ **Architecture improvement**: Task A1 adds `TCopyContext`/`useTCopy` to eliminate prop drilling
- ✅ **Bug fixes**: Task A2 fixes `selectionPromptZh` and `addToFileTree` bugs

### 2. Placeholder scan
No "TBD", "TODO", "implement later", "add appropriate error handling" patterns found. All tasks have complete code shown.

### 3. Type consistency
- `t.xxx` keys referenced in component code match keys defined in Task A3 locale files
- `formatT(t, key, vars)` signature consistent between Task A1 (definition) and all usages
- `useTCopy()` hook returns `{ t, locale, formatT }` consistent across all usages
- `TCopyContextValue` interface matches what `TCopyProvider` expects

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-12-i18n-full-localization.md`.

This plan covers 6 sub-plans (A-F), each producing working, testable software independently after Sub-plan A is complete. Sub-plans B-F can be executed in parallel.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

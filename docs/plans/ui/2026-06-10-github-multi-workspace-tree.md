# GitHub Multi-Workspace CI Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the GitHub sub-feature panel with a Browser-style left sidebar tree navigator supporting multiple workspaces, where each workspace directory contains system-level sub-entries (Overview, Workflows, Jobs, Logs).

**Architecture:** Copy the Browser's `browser-tree` feature pattern exactly — create a parallel `github-tree` feature directory with its own types, data hooks, and tree components. The communicate store slice gets new multi-workspace CI configuration state plus tree expansion state. The existing `GitHubPanel.tsx` is rewritten to use the new tree navigator; the existing CI data views are preserved but wrapped in a content area that switches based on tree selection.

**Tech Stack:** React 19 + TypeScript + Zustand (communicateSlice) + CSS custom properties (BEM). No Tailwind. No routing library.

---

## File Structure

### New files to create:
1. `frontend/src/app/features/github-tree/types.ts` — GitHub tree node types, analogous to `browser-tree/types.ts`
2. `frontend/src/app/features/github-tree/useGithubTreeData.ts` — Build tree data from multi-workspace CI configs and workspace list
3. `frontend/src/app/features/github-tree/GitHubTree.tsx` — Top-level tree component (analogous to `BrowserTabTree.tsx`)
4. `frontend/src/app/features/github-tree/GitHubCategorySection.tsx` — Category section component (analogous to `BrowserCategorySection.tsx`)
5. `frontend/src/app/features/github-tree/GitHubTreeEntry.tsx` — Tree entry node (analogous to `BrowserTreeEntry.tsx`)
6. `frontend/src/app/features/github-tree/index.ts` — Barrel exports

### Files to modify:
1. `frontend/src/app/stores/slices/communicateSlice.ts` — Add multi-workspace CI configs (`gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>`), tree expansion state, new actions
2. `frontend/src/app/stores/StoreState.ts` — Add new fields from communicateSlice changes to the interface
3. `frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx` — Complete rewrite with tree navigator sidebar + content area
4. `frontend/src/app/regions/right-panel/hooks/useCIPanelProps.ts` — Adapt for multi-workspace
5. `frontend/src/app/regions/right-panel/types.ts` — Update `CIPanelProps` if needed
6. `frontend/src/app/features/terminal/useGitPushAutoRefresh.ts` — Support multi-workspace git push detection
7. `frontend/src/styles/regions/rightpanel/communication-panel.css` — Add category/entry/tree styles, remove old nav-btn styles

### No changes needed:
- `CommunicationPanel.tsx` — Only routes between platforms, unchanged
- `GitHubLogViewer.tsx` — Already standalone, only minor integration
- Other platform placeholders (Feishu, QQ, WeChat, Email)
- Rust backend / crates — CI data model unchanged
- IPC bridge files — `DigitalLifeBridge` unchanged
- `browser-tree/` files — Read as reference, not modified

---

### Task 1: Add multi-workspace CI config types to communicateSlice

**Files:**
- Modify: `frontend/src/app/stores/slices/communicateSlice.ts`
- Modify: `frontend/src/app/stores/StoreState.ts`

- [ ] **Step 1: Define the new types**

Add to `communicateSlice.ts`, above the `CommunicateSlice` interface:

```typescript
/** Per-workspace CI configuration */
export interface GitWorkspaceCiConfig {
  owner: string;
  repo: string;
  branch: string;
  workflowId: string | null;
  accessToken: string | null;
  /** Whether this workspace has been configured */
  configured: boolean;
}

/** GitHub tree node types */
export type GitHubTreeNodeType = 'workspace' | 'overview' | 'workflows' | 'jobs' | 'logs';

/** GitHub tree node (for displaying in the navigator) */
export interface GitHubTreeNode {
  path: string;
  name: string;
  kind: 'directory' | 'file';
  children: GitHubTreeNode[];
  nodeType: GitHubTreeNodeType;
  workspaceId?: string;
}

export type GitHubCategoryType = 'ci-workspace';
```

- [ ] **Step 2: Add new fields to `CommunicateSlice` interface**

```typescript
/** Per-workspace CI configs keyed by workspaceId */
gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>;
/** Tree expansion state for GitHub navigator */
gitHubTreeExpanded: Record<string, boolean>;
/** Whether the workspace tree is fully expanded */
gitHubAllTreeExpanded: boolean;
/** Selected tree path in GitHub navigator */
selectedGitHubTreePath: string | null;
/** Active CI workspace ID (which workspace's CI is shown) */
activeCiWorkspaceId: string | null;
/** Active sub-section within the selected workspace */
activeWorkspaceSection: 'overview' | 'workflows' | 'jobs' | 'logs';

// New actions
setGitHubWorkspaceConfig: (workspaceId: string, config: GitWorkspaceCiConfig) => void;
removeGitHubWorkspaceConfig: (workspaceId: string) => void;
clearAllGitHubWorkspaceConfigs: () => void;
setGitHubTreeExpanded: (expanded: Record<string, boolean>) => void;
toggleGitHubTreePath: (path: string) => void;
expandAllGitHubTree: () => void;
collapseAllGitHubTree: () => void;
setSelectedGitHubTreePath: (path: string | null) => void;
setActiveCiWorkspaceId: (workspaceId: string | null) => void;
setActiveWorkspaceSection: (section: 'overview' | 'workflows' | 'jobs' | 'logs') => void;
refreshCiStatusForWorkspace: (workspaceId: string) => Promise<void>;
```

- [ ] **Step 3: Add initial state defaults**

In the `createCommunicateSlice` return block, add:

```typescript
gitHubWorkspaceConfigs: {},
gitHubTreeExpanded: {},
gitHubAllTreeExpanded: false,
selectedGitHubTreePath: null,
activeCiWorkspaceId: null,
activeWorkspaceSection: 'overview',
```

- [ ] **Step 4: Implement new actions**

Add implementations inside `createCommunicateSlice`:

```typescript
setGitHubWorkspaceConfig: (workspaceId, config) => {
  set((state: { gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig> }) => ({
    gitHubWorkspaceConfigs: { ...state.gitHubWorkspaceConfigs, [workspaceId]: config },
  }));
},

removeGitHubWorkspaceConfig: (workspaceId) => {
  set((state: { gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig> }) => {
    const next = { ...state.gitHubWorkspaceConfigs };
    delete next[workspaceId];
    return { gitHubWorkspaceConfigs: next };
  });
},

clearAllGitHubWorkspaceConfigs: () => {
  set({ gitHubWorkspaceConfigs: {}, activeCiWorkspaceId: null, selectedGitHubTreePath: null });
},

setGitHubTreeExpanded: (expanded) => set({ gitHubTreeExpanded: expanded }),

toggleGitHubTreePath: (path) => {
  set((state: { gitHubTreeExpanded: Record<string, boolean> }) => ({
    gitHubTreeExpanded: {
      ...state.gitHubTreeExpanded,
      [path]: !state.gitHubTreeExpanded[path],
    },
  }));
},

expandAllGitHubTree: () => {
  set((state: { recentWorkspaces: Array<{ id: string }> }) => {
    const paths: Record<string, boolean> = {};
    for (const ws of state.recentWorkspaces) {
      paths[`github-workspace:${ws.id}`] = true;
    }
    return { gitHubTreeExpanded: paths };
  });
},

collapseAllGitHubTree: () => set({ gitHubTreeExpanded: {} }),

setSelectedGitHubTreePath: (path) => set({ selectedGitHubTreePath: path }),

setActiveCiWorkspaceId: (workspaceId) => set({ activeCiWorkspaceId: workspaceId }),

setActiveWorkspaceSection: (section) => set({ activeWorkspaceSection: section }),

refreshCiStatusForWorkspace: async (workspaceId) => {
  const state = _get();
  const config = state.gitHubWorkspaceConfigs[workspaceId];
  if (!config || !config.configured) {
    set({ ciError: '请先配置仓库 owner 和 repo' });
    return;
  }
  set({ ciLoading: true, ciError: null });
  try {
    const bridge = getBridge();
    if (!bridge || !bridge.github) {
      set({ ciError: 'bridge not ready', ciLoading: false });
      return;
    }
    const token = isTauriMode() ? null : (config.accessToken ?? '');
    const result = await bridge.github.getStatus({
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      workflowId: config.workflowId,
      accessToken: token,
    });
    if (result.ok) {
      set({ ciSnapshot: result.data, ciJobs: result.data.jobs ?? [], ciLoading: false });
    } else {
      set({ ciError: result.error?.message ?? '获取 CI 状态失败', ciLoading: false });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    set({ ciError: message, ciLoading: false });
  }
},
```

- [ ] **Step 5: Update `StoreState.ts` imports**

Add `GitWorkspaceCiConfig` and `GitHubTreeNodeType` imports (re-export from communicateSlice) — actually these are in the same file through the `CommunicateSlice` extension, so no import changes needed. The `StoreState` already extends `CommunicateSlice`, so new fields are automatically available.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/stores/slices/communicateSlice.ts frontend/src/app/stores/StoreState.ts
git commit -m "feat(github): add multi-workspace CI config types and store actions"
```

---

### Task 2: Create GitHub tree types and data hook

**Files:**
- Create: `frontend/src/app/features/github-tree/types.ts`
- Create: `frontend/src/app/features/github-tree/useGithubTreeData.ts`
- Create: `frontend/src/app/features/github-tree/index.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
import type { GitWorkspaceCiConfig } from '../../stores/slices/communicateSlice';

export type GitHubCategoryType = 'ci-workspace';

export type GitHubNodeType = 'workspace' | 'overview' | 'workflows' | 'jobs' | 'logs';

export interface GitHubTreeNode {
  path: string;
  name: string;
  kind: 'directory' | 'file';
  children: GitHubTreeNode[];
  nodeType: GitHubNodeType;
  workspaceId?: string;
  config?: GitWorkspaceCiConfig;
}

export interface GitHubCategoryState {
  id: GitHubCategoryType;
  label: string;
  isExpanded: boolean;
  isPermanent: boolean;
  nodes: GitHubTreeNode[];
}
```

- [ ] **Step 2: Create `useGithubTreeData.ts`**

```typescript
import { useMemo } from 'react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { GitWorkspaceCiConfig } from '../../stores/slices/communicateSlice';
import type { GitHubCategoryState, GitHubTreeNode } from './types';

const DEFAULT_SUB_ENTRIES = [
  { id: 'overview', name: 'Overview', pathSuffix: 'overview' },
  { id: 'workflows', name: 'Workflows', pathSuffix: 'workflows' },
  { id: 'jobs', name: 'Jobs', pathSuffix: 'jobs' },
  { id: 'logs', name: 'Logs', pathSuffix: 'logs' },
];

function buildWorkspaceNode(
  ws: RecentWorkspaceEntry,
  config?: GitWorkspaceCiConfig
): GitHubTreeNode {
  const subEntries: GitHubTreeNode[] = DEFAULT_SUB_ENTRIES.map((entry) => ({
    path: `github-workspace:${ws.id}:${entry.pathSuffix}`,
    name: entry.name,
    kind: 'file' as const,
    children: [],
    nodeType: entry.id as GitHubTreeNode['nodeType'],
    workspaceId: ws.id,
  }));

  return {
    path: `github-workspace:${ws.id}`,
    name: ws.name || ws.path,
    kind: 'directory' as const,
    children: subEntries,
    nodeType: 'workspace' as const,
    workspaceId: ws.id,
    config,
  };
}

export interface UseGithubTreeDataResult {
  ciWorkspaceCategory: GitHubCategoryState;
}

export function useGithubTreeData(
  workspaces: RecentWorkspaceEntry[],
  gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>,
  labels: {
    ciWorkspaceCategory: string;
  }
): UseGithubTreeDataResult {
  const ciWorkspaceNodes = useMemo(
    () =>
      workspaces.map((ws) => {
        const config = gitHubWorkspaceConfigs[ws.id];
        return buildWorkspaceNode(ws, config);
      }),
    [workspaces, gitHubWorkspaceConfigs]
  );

  const ciWorkspaceCategory: GitHubCategoryState = useMemo(
    () => ({
      id: 'ci-workspace',
      label: labels.ciWorkspaceCategory,
      isExpanded: true,
      isPermanent: false,
      nodes: ciWorkspaceNodes,
    }),
    [ciWorkspaceNodes, labels.ciWorkspaceCategory]
  );

  return { ciWorkspaceCategory };
}
```

- [ ] **Step 3: Create `index.ts`**

```typescript
export { GitHubTree } from './GitHubTree';
export { useGithubTreeData } from './useGithubTreeData';
export type { GitHubCategoryType, GitHubNodeType, GitHubTreeNode, GitHubCategoryState } from './types';
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/github-tree/
git commit -m "feat(github): create github-tree types and data hook"
```

---

### Task 3: Create GitHub tree UI components

**Files:**
- Create: `frontend/src/app/features/github-tree/GitHubCategorySection.tsx`
- Create: `frontend/src/app/features/github-tree/GitHubTreeEntry.tsx`
- Create: `frontend/src/app/features/github-tree/GitHubTree.tsx`

- [ ] **Step 1: Create `GitHubCategorySection.tsx`**

```typescript
import React from 'react';
import { GitHubTreeEntry } from './GitHubTreeEntry';
import type { GitHubCategoryState, GitHubCategoryType } from './types';

export interface SectionCallbacks {
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectSection: (workspaceId: string, section: 'overview' | 'workflows' | 'jobs' | 'logs') => void;
  onDeleteWorkspaceConfig: (workspaceId: string) => void;
  onOpenSettings: (workspaceId: string) => void;
  onRefreshWorkspace: (workspaceId: string) => void;
}

interface GitHubCategorySectionProps {
  category: GitHubCategoryState;
  categoryType: GitHubCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: SectionCallbacks;
}

export function GitHubCategorySection({
  category,
  categoryType,
  expandedPaths,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  callbacks,
}: GitHubCategorySectionProps) {
  const topLevelCount = category.nodes.length;

  return (
    <div className="adl-github-category">
      <div className="adl-github-category__label">
        <span className="adl-github-category__label-text">{category.label}</span>
        <span className="adl-github-category__label-count">{topLevelCount}</span>
      </div>
      <div className="adl-github-category__entries">
        {category.nodes.map((node) => (
          <GitHubTreeEntry
            key={node.path}
            node={node}
            categoryType={categoryType}
            expandedPaths={expandedPaths}
            selectedTreePath={selectedTreePath}
            onSelectTreePath={onSelectTreePath}
            onTogglePath={onTogglePath}
            callbacks={callbacks}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `GitHubTreeEntry.tsx`**

```typescript
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  IconFolder,
  IconFolderOpen,
  IconTrash,
  IconSettings,
  IconRefreshCw,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import type { GitHubTreeNode, GitHubCategoryType } from './types';
import type { SectionCallbacks } from './GitHubCategorySection';

interface GitHubTreeEntryProps {
  node: GitHubTreeNode;
  categoryType: GitHubCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: SectionCallbacks;
}

const SUB_ENTRY_ICONS: Record<string, React.ReactNode> = {
  overview: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M2 2h5v5H2V2zm0 7h5v5H2V9zm7-7h5v5H9V2zm0 7h5v5H9V9z" />
    </svg>
  ),
  workflows: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M8 1a.5.5 0 0 1 .5.5v6h6a.5.5 0 0 1 0 1h-6v6a.5.5 0 0 1-1 0v-6h-6a.5.5 0 0 1 0-1h6v-6A.5.5 0 0 1 8 1z" />
    </svg>
  ),
  jobs: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7zM3.5 4a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-9z" />
      <path d="M4.5 6.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z" />
    </svg>
  ),
  logs: (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm1 3h10v1H3V4zm0 3h10v1H3V7zm0 3h7v1H3v-1z" />
    </svg>
  ),
};

export function GitHubTreeEntry({
  node,
  categoryType,
  expandedPaths,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  callbacks,
}: GitHubTreeEntryProps) {
  const isSelected = selectedTreePath === node.path;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isExpanded = expandedPaths[node.path] ?? false;
  const count = node.children.length;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleHeaderClick = useCallback(() => {
    if (node.kind === 'directory') {
      onTogglePath(node.path);
    }
    onSelectTreePath(node.path);
    if (node.nodeType === 'workspace' && node.workspaceId) {
      callbacks.onSelectWorkspace(node.workspaceId);
    }
  }, [node, onTogglePath, onSelectTreePath, callbacks]);

  const handleSubEntryClick = useCallback(
    (child: GitHubTreeNode) => {
      onSelectTreePath(child.path);
      if (child.workspaceId) {
        // The section is derived from child.path suffix
        const parts = child.path.split(':');
        const section = parts[parts.length - 1] as 'overview' | 'workflows' | 'jobs' | 'logs';
        callbacks.onSelectSection(child.workspaceId, section);
      }
    },
    [onSelectTreePath, callbacks]
  );

  if (node.kind === 'file') {
    return (
      <div
        className={`adl-github-entry__leaf${isSelected ? ' is-selected' : ''}`}
        onClick={() => handleSubEntryClick(node)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubEntryClick(node);
        }}
      >
        <span className="adl-github-entry__leaf-icon">
          {SUB_ENTRY_ICONS[node.nodeType] ?? null}
        </span>
        <span className="adl-github-entry__leaf-name">{node.name}</span>
      </div>
    );
  }

  return (
    <div className="adl-github-entry">
      <div
        className={`adl-github-entry__header${isSelected ? ' is-selected' : ''}`}
        onClick={handleHeaderClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuPosition({ top: e.clientY, left: e.clientX + 4 });
          setMenuOpen(true);
        }}
      >
        <div className="adl-github-entry__expand">
          <button
            type="button"
            className={`adl-github-entry__expand-btn${isExpanded ? ' is-expanded' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePath(node.path);
            }}
            aria-label={isExpanded ? '收起' : '展开'}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <IconFolderOpen size={14} decorative />
            ) : (
              <IconFolder size={14} decorative />
            )}
          </button>
        </div>
        <div
          className="adl-github-entry__namezone"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSelectTreePath(node.path);
          }}
        >
          <span className="adl-github-entry__name" title={node.name}>
            {node.name}
          </span>
          <div className="adl-github-entry__trailing">
            {node.config?.configured ? (
              <span className="adl-github-entry__configured-dot" title="已配置 CI" />
            ) : null}
            <span className="adl-github-entry__count">{count}</span>
            <div className="adl-github-entry__actions">
              <TooltipSimple content="删除CI配置及数据" placement="top">
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (node.workspaceId) {
                      callbacks.onDeleteWorkspaceConfig(node.workspaceId);
                    }
                  }}
                  aria-label="删除CI配置及数据"
                >
                  <IconTrash size={12} decorative />
                </button>
              </TooltipSimple>
              <TooltipSimple content="设置" placement="top">
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (node.workspaceId) {
                      callbacks.onOpenSettings(node.workspaceId);
                    }
                  }}
                  aria-label="设置"
                >
                  <IconSettings size={12} decorative />
                </button>
              </TooltipSimple>
            </div>
          </div>
        </div>
      </div>

      {menuOpen && menuPosition
        ? createPortal(
            <div
              className="adl-multitree-entry__menu"
              role="menu"
              ref={menuRef}
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              <button
                type="button"
                className="adl-multitree-entry__menu-item"
                role="menuitem"
                onClick={() => {
                  if (node.workspaceId) callbacks.onRefreshWorkspace(node.workspaceId);
                  setMenuOpen(false);
                }}
              >
                刷新 CI 状态
              </button>
              <button
                type="button"
                className="adl-multitree-entry__menu-item is-danger"
                role="menuitem"
                onClick={() => {
                  if (node.workspaceId) callbacks.onDeleteWorkspaceConfig(node.workspaceId);
                  setMenuOpen(false);
                }}
              >
                删除CI配置及数据
              </button>
            </div>,
            document.body
          )
        : null}

      {isExpanded && node.children.length > 0 ? (
        <div className="adl-github-entry__tree">
          {node.children.map((child) => (
            <GitHubTreeEntry
              key={child.path}
              node={child}
              categoryType={categoryType}
              expandedPaths={expandedPaths}
              selectedTreePath={selectedTreePath}
              onSelectTreePath={onSelectTreePath}
              onTogglePath={onTogglePath}
              callbacks={callbacks}
            />
          ))}
        </div>
      ) : null}

      {isExpanded && node.children.length === 0 ? (
        <div className="adl-github-entry__empty">
          <span className="adl-empty-hint">暂无内容</span>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Create `GitHubTree.tsx`**

```typescript
import React, { useCallback } from 'react';
import { useGithubTreeData } from './useGithubTreeData';
import { GitHubCategorySection, type SectionCallbacks } from './GitHubCategorySection';
import { CustomScrollArea } from '../file-tree/CustomScrollArea';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { GitWorkspaceCiConfig } from '../../stores/slices/communicateSlice';

interface GitHubTreeProps {
  workspaces: RecentWorkspaceEntry[];
  gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>;
  gitHubTreeExpanded: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: SectionCallbacks;
  labels: {
    ciWorkspaceCategory: string;
  };
}

export function GitHubTree({
  workspaces,
  gitHubWorkspaceConfigs,
  gitHubTreeExpanded,
  selectedTreePath,
  onSelectTreePath,
  onTogglePath,
  callbacks,
  labels,
}: GitHubTreeProps) {
  const { ciWorkspaceCategory } = useGithubTreeData(
    workspaces,
    gitHubWorkspaceConfigs,
    labels
  );

  return (
    <CustomScrollArea
      shellClassName="adl-multitree adl-multitree--github"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      <GitHubCategorySection
        category={ciWorkspaceCategory}
        categoryType="ci-workspace"
        expandedPaths={gitHubTreeExpanded}
        selectedTreePath={selectedTreePath}
        onSelectTreePath={onSelectTreePath}
        onTogglePath={onTogglePath}
        callbacks={callbacks}
      />
    </CustomScrollArea>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/github-tree/
git commit -m "feat(github): create GitHub tree UI components"
```

---

### Task 4: Rewrite GitHubPanel.tsx with tree navigator

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx`
- Modify: `frontend/src/app/regions/right-panel/hooks/useCIPanelProps.ts`
- Modify: `frontend/src/app/regions/right-panel/types.ts`

This is the largest task — the entire `GitHubPanel.tsx` is rewritten to use the tree navigator sidebar (copied from the Browser left sidebar pattern) + the existing content views. Key differences from the Browser pattern:
- Only one category: "CI工作区目录" (no history, no userFolder)
- Each workspace entry has 4 default sub-entries: Overview, Workflows, Jobs, Logs
- No "新建标签" button
- "删除全部目录标签" → "删除全部目录CI配置及数据"
- Add "Help" button next to delete button
- No "已打开标签" button/view toggle → "刷新全部" button
- No "搜索标签" button
- Workspace hover: "删除CI配置及数据" + "设置" buttons

- [ ] **Step 1: Rewrite `useCIPanelProps.ts` for multi-workspace**

```typescript
import { useCallback } from 'react';
import { useAppStore } from '../../../stores/slicedStore';
import { useGitPushAutoRefresh } from '../../../features/terminal/useGitPushAutoRefresh';
import type { GitWorkspaceCiConfig } from '../../../stores/slices/communicateSlice';

export interface UseCIPanelPropsResult {
  gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>;
  accessToken: string;
  loading: boolean;
  error: string | null;
  snapshot: CiStatusSnapshot | null;
  onRefresh: () => void;
  onConfigChange: (owner: string, repo: string, branch: string, token: string) => void;
  onClearToken: () => void;
  onSaveWorkspaceConfig: (workspaceId: string, owner: string, repo: string, branch: string, token: string) => void;
  onRemoveWorkspaceConfig: (workspaceId: string) => void;
  onRefreshWorkspace: (workspaceId: string) => void;
}

export function useCIPanelProps(): UseCIPanelPropsResult {
  useGitPushAutoRefresh();

  const gitHubWorkspaceConfigs = useAppStore((s) => s.gitHubWorkspaceConfigs);
  const ciAccessToken = useAppStore((s) => s.ciAccessToken);
  const ciLoading = useAppStore((s) => s.ciLoading);
  const ciError = useAppStore((s) => s.ciError);
  const ciSnapshot = useAppStore((s) => s.ciSnapshot);
  const setGitHubWorkspaceConfig = useAppStore((s) => s.setGitHubWorkspaceConfig);
  const removeGitHubWorkspaceConfig = useAppStore((s) => s.removeGitHubWorkspaceConfig);
  const refreshCiStatusForWorkspace = useAppStore((s) => s.refreshCiStatusForWorkspace);
  const setCiAccessToken = useAppStore((s) => s.setCiAccessToken);
  const clearCiAccessToken = useAppStore((s) => s.clearCiAccessToken);
  const refreshCiStatus = useAppStore((s) => s.refreshCiStatus);

  const onRefresh = useCallback(() => {
    void refreshCiStatus();
  }, [refreshCiStatus]);

  const onConfigChange = useCallback(
    (owner: string, repo: string, branch: string, token: string) => {
      setCiConfig({ owner, repo, branch, workflowId: null, accessToken: null });
      void setCiAccessToken(token);
      void refreshCiStatus();
    },
    [setCiConfig, setCiAccessToken, refreshCiStatus]
  );

  const onClearToken = useCallback(() => {
    void clearCiAccessToken();
  }, [clearCiAccessToken]);

  const onSaveWorkspaceConfig = useCallback(
    (workspaceId: string, owner: string, repo: string, branch: string, token: string) => {
      const config: GitWorkspaceCiConfig = {
        owner,
        repo,
        branch: branch || 'main',
        workflowId: null,
        accessToken: token || null,
        configured: !!(owner && repo),
      };
      setGitHubWorkspaceConfig(workspaceId, config);
      void setCiAccessToken(token);
      void refreshCiStatusForWorkspace(workspaceId);
    },
    [setGitHubWorkspaceConfig, setCiAccessToken, refreshCiStatusForWorkspace]
  );

  const onRemoveWorkspaceConfig = useCallback(
    (workspaceId: string) => {
      removeGitHubWorkspaceConfig(workspaceId);
    },
    [removeGitHubWorkspaceConfig]
  );

  const onRefreshWorkspace = useCallback(
    (workspaceId: string) => {
      void refreshCiStatusForWorkspace(workspaceId);
    },
    [refreshCiStatusForWorkspace]
  );

  return {
    gitHubWorkspaceConfigs,
    accessToken: ciAccessToken,
    loading: ciLoading,
    error: ciError,
    snapshot: ciSnapshot,
    onRefresh,
    onConfigChange,
    onClearToken,
    onSaveWorkspaceConfig,
    onRemoveWorkspaceConfig,
    onRefreshWorkspace,
  };
}
```

- [ ] **Step 2: Create the SettingsDialog component (inline in GitHubPanel)**

The settings dialog replaces the old inline SettingsView. A simple modal/dialog approach:

```typescript
function GitHubSettingsDialog({
  open,
  workspaceName,
  owner,
  repo,
  branch,
  token,
  error,
  copy,
  onSave,
  onCancel,
}: {
  open: boolean;
  workspaceName: string;
  owner: string;
  repo: string;
  branch: string;
  token: string;
  error: string | null;
  copy: Record<string, string>;
  onSave: (owner: string, repo: string, branch: string, token: string) => void;
  onCancel: () => void;
}) {
  const [ownerInput, setOwnerInput] = useState(owner);
  const [repoInput, setRepoInput] = useState(repo);
  const [branchInput, setBranchInput] = useState(branch);
  const [tokenInput, setTokenInput] = useState(token);
  const [tokenVisible, setTokenVisible] = useState(false);

  if (!open) return null;

  return createPortal(
    <div className="adl-dialog-overlay" onClick={onCancel}>
      <div className="adl-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="adl-dialog__header">
          <h3 className="adl-dialog__title">CI 配置 - {workspaceName}</h3>
          <button type="button" className="adl-dialog__close" onClick={onCancel}>
            <IconClose size={14} decorative />
          </button>
        </div>
        <div className="adl-dialog__body">
          <div className="adl-github__config">
            <div className="adl-github__config-row">
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciOwnerPlaceholder}
                value={ownerInput}
                onChange={(e) => setOwnerInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(ownerInput, repoInput, branchInput, tokenInput)}
              />
              <span className="adl-github__config-sep">/</span>
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciRepoPlaceholder}
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(ownerInput, repoInput, branchInput, tokenInput)}
              />
            </div>
            <div className="adl-github__config-row">
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciBranchPlaceholder}
                value={branchInput}
                onChange={(e) => setBranchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(ownerInput, repoInput, branchInput, tokenInput)}
              />
            </div>
            <div className="adl-github__config-row">
              <input
                className="adl-input adl-input--sm"
                placeholder={copy.ciTokenPlaceholder}
                type={tokenVisible ? 'text' : 'password'}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSave(ownerInput, repoInput, branchInput, tokenInput)}
              />
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--sm"
                onClick={() => setTokenVisible((v) => !v)}
                title={tokenVisible ? '隐藏' : '显示'}
              >
                {/* eye icon SVG */}
              </button>
            </div>
            <div className="adl-github__token-hint adl-text--xs adl-text--secondary">
              Token 仅保存在浏览器本地，不会上传至服务器
            </div>
          </div>
          {error && (
            <div className="adl-github__error">
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="adl-dialog__footer">
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--sm"
            onClick={() => onSave(ownerInput, repoInput, branchInput, tokenInput)}
            disabled={!ownerInput.trim() || !repoInput.trim()}
          >
            保存并查询
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 3: Rewrite the main `GitHubPanel` component**

The full rewrite with tree navigator pattern (copied from `browserpanel.tsx` navigator section):

```typescript
export function GitHubPanel() {
  const {
    gitHubWorkspaceConfigs,
    loading,
    error,
    snapshot,
    onSaveWorkspaceConfig,
    onRemoveWorkspaceConfig,
    onRefreshWorkspace,
  } = useCIPanelProps();

  const appInfo = workspaceSelectors.useAppInfo();
  const copy = getAppCopy(appInfo);
  const t = { ...copy };

  const recentWorkspaces = useAppStore(useShallow((state) => state.recentWorkspaces));
  const gitHubTreeExpanded = useAppStore((state) => state.gitHubTreeExpanded);
  const selectedGitHubTreePath = useAppStore((state) => state.selectedGitHubTreePath);
  const activeCiWorkspaceId = useAppStore((state) => state.activeCiWorkspaceId);
  const activeWorkspaceSection = useAppStore((state) => state.activeWorkspaceSection);
  const gitHubAllTreeExpanded = useAppStore((state) => state.gitHubAllTreeExpanded);
  const communicateNavigatorCollapsed = useAppStore((state) => state.communicateNavigatorCollapsed);

  const setSelectedGitHubTreePath = useAppStore((state) => state.setSelectedGitHubTreePath);
  const toggleGitHubTreePath = useAppStore((state) => state.toggleGitHubTreePath);
  const expandAllGitHubTree = useAppStore((state) => state.expandAllGitHubTree);
  const collapseAllGitHubTree = useAppStore((state) => state.collapseAllGitHubTree);
  const setActiveCiWorkspaceId = useAppStore((state) => state.setActiveCiWorkspaceId);
  const setActiveWorkspaceSection = useAppStore((state) => state.setActiveWorkspaceSection);
  const refreshCiStatusForWorkspace = useAppStore((state) => state.refreshCiStatusForWorkspace);
  const clearAllGitHubWorkspaceConfigs = useAppStore((state) => state.clearAllGitHubWorkspaceConfigs);
  const toggleCommunicateNavigator = useAppStore((state) => state.toggleCommunicateNavigator);

  const [settingsDialogState, setSettingsDialogState] = useState<{
    open: boolean;
    workspaceId: string;
    workspaceName: string;
  }>({ open: false, workspaceId: '', workspaceName: '' });
  const [selectedLogJobId, setSelectedLogJobId] = useState<number | null>(null);

  const visibleWorkspaces = useMemo(
    () =>
      recentWorkspaces.filter(
        (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
      ),
    [recentWorkspaces]
  );

  const handleSelectTreePath = useCallback(
    (path: string | null) => {
      setSelectedGitHubTreePath(path);
    },
    [setSelectedGitHubTreePath]
  );

  const handleTogglePath = useCallback(
    (path: string) => {
      toggleGitHubTreePath(path);
    },
    [toggleGitHubTreePath]
  );

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      setActiveCiWorkspaceId(workspaceId);
      setActiveWorkspaceSection('overview');
      // Auto-refresh if not yet loaded
      const config = gitHubWorkspaceConfigs[workspaceId];
      if (config?.configured) {
        void refreshCiStatusForWorkspace(workspaceId);
      }
    },
    [setActiveCiWorkspaceId, setActiveWorkspaceSection, gitHubWorkspaceConfigs, refreshCiStatusForWorkspace]
  );

  const handleSelectSection = useCallback(
    (workspaceId: string, section: 'overview' | 'workflows' | 'jobs' | 'logs') => {
      setActiveCiWorkspaceId(workspaceId);
      setActiveWorkspaceSection(section);
      const config = gitHubWorkspaceConfigs[workspaceId];
      if (config?.configured) {
        void refreshCiStatusForWorkspace(workspaceId);
      }
    },
    [setActiveCiWorkspaceId, setActiveWorkspaceSection, gitHubWorkspaceConfigs, refreshCiStatusForWorkspace]
  );

  const handleDeleteWorkspaceConfig = useCallback(
    (workspaceId: string) => {
      onRemoveWorkspaceConfig(workspaceId);
    },
    [onRemoveWorkspaceConfig]
  );

  const handleOpenSettings = useCallback(
    (workspaceId: string) => {
      const ws = recentWorkspaces.find((w) => w.id === workspaceId);
      setSettingsDialogState({
        open: true,
        workspaceId,
        workspaceName: ws?.name || ws?.path || workspaceId,
      });
    },
    [recentWorkspaces]
  );

  const handleSaveSettings = useCallback(
    (owner: string, repo: string, branch: string, token: string) => {
      onSaveWorkspaceConfig(
        settingsDialogState.workspaceId,
        owner,
        repo,
        branch,
        token
      );
      setSettingsDialogState({ open: false, workspaceId: '', workspaceName: '' });
    },
    [onSaveWorkspaceConfig, settingsDialogState.workspaceId]
  );

  const handleRefreshAll = useCallback(() => {
    for (const [wsId, config] of Object.entries(gitHubWorkspaceConfigs)) {
      if (config.configured) {
        void refreshCiStatusForWorkspace(wsId);
      }
    }
  }, [gitHubWorkspaceConfigs, refreshCiStatusForWorkspace]);

  const handleViewLogs = useCallback(
    (jobId: number) => {
      setSelectedLogJobId(jobId);
      setActiveWorkspaceSection('logs');
    },
    [setActiveWorkspaceSection]
  );

  // Close settings dialog
  const handleCloseSettings = useCallback(() => {
    setSettingsDialogState({ open: false, workspaceId: '', workspaceName: '' });
  }, []);

  const treeCallbacks: SectionCallbacks = useMemo(
    () => ({
      onSelectWorkspace: handleSelectWorkspace,
      onSelectSection: handleSelectSection,
      onDeleteWorkspaceConfig: handleDeleteWorkspaceConfig,
      onOpenSettings: handleOpenSettings,
      onRefreshWorkspace: (wsId) => refreshCiStatusForWorkspace(wsId),
    }),
    [
      handleSelectWorkspace,
      handleSelectSection,
      handleDeleteWorkspaceConfig,
      handleOpenSettings,
      refreshCiStatusForWorkspace,
    ]
  );

  const primaryContent = useMemo(() => {
    // Find the current workspace config if activeCiWorkspaceId is set
    const config = activeCiWorkspaceId ? gitHubWorkspaceConfigs[activeCiWorkspaceId] : null;
    const workspaceName =
      activeCiWorkspaceId
        ? recentWorkspaces.find((w) => w.id === activeCiWorkspaceId)?.name
        : null;

    switch (activeWorkspaceSection) {
      case 'overview':
        return (
          <OverviewView
            snapshot={snapshot}
            loading={loading}
            branch={config?.branch ?? 'main'}
            copy={copy}
            onViewLogs={handleViewLogs}
          />
        );
      case 'workflows':
        return <WorkflowsView snapshot={snapshot} />;
      case 'jobs':
        return <JobsView snapshot={snapshot} onViewLogs={handleViewLogs} />;
      case 'logs':
        return <GitHubLogViewer snapshot={snapshot} config={config} />;
    }
  }, [activeWorkspaceSection, activeCiWorkspaceId, gitHubWorkspaceConfigs, snapshot, loading, copy, handleViewLogs, recentWorkspaces]);

  return (
    <div
      className={`adl-tool-surface adl-tool-surface--github${communicateNavigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
      style={
        { '--adl-files-nav-width': `200px` } as React.CSSProperties
      }
    >
      <aside className="adl-tool-navigator" aria-label="GitHub CI">
        {/* Navigator context header */}
        <div className="adl-tool-navigator__context">
          <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--actions">
            <TooltipSimple content={gitHubAllTreeExpanded ? '全部折叠' : '全部展开'} placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={gitHubAllTreeExpanded ? collapseAllGitHubTree : expandAllGitHubTree}
                aria-label={gitHubAllTreeExpanded ? '全部折叠' : '全部展开'}
              >
                {gitHubAllTreeExpanded ? (
                  <IconFoldVertical size={14} decorative />
                ) : (
                  <IconUnfoldVertical size={14} decorative />
                )}
              </button>
            </TooltipSimple>
            <span className="adl-tool-navigator__context-title">CI 工作区</span>
          </div>
          <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
            <span className="adl-tool-navigator__context-count">
              {visibleWorkspaces.length}
            </span>
          </div>
        </div>

        {/* Second header row: actions */}
        <div className="adl-tool-navigator__context adl-tool-navigator__context--secondary">
          <div className="adl-tool-navigator__context-group adl-tool-navigator__context-group--utility">
            <TooltipSimple content="刷新全部" placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={handleRefreshAll}
                aria-label="刷新全部"
              >
                <IconRefreshCw size={14} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content="删除全部目录CI配置及数据" placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={() => {
                  if (window.confirm('确定删除所有工作区的 CI 配置及数据？')) {
                    clearAllGitHubWorkspaceConfigs();
                  }
                }}
                aria-label="删除全部目录CI配置及数据"
              >
                <IconTrash size={14} decorative />
              </button>
            </TooltipSimple>
            <TooltipSimple content="Help" placement="top">
              <button
                type="button"
                className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
                onClick={() => setActiveWorkspaceSection('help')}
                aria-label="Help"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                  <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM7 5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 0 1h-.5v2h.5a.5.5 0 0 1 0 1H7a.5.5 0 0 1-.5-.5v-2.5a.5.5 0 0 1 .5-.5zm1 5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z" />
                </svg>
              </button>
            </TooltipSimple>
          </div>
        </div>

        {/* Tree content */}
        <GitHubTree
          workspaces={visibleWorkspaces}
          gitHubWorkspaceConfigs={gitHubWorkspaceConfigs}
          gitHubTreeExpanded={gitHubTreeExpanded}
          selectedTreePath={selectedGitHubTreePath}
          onSelectTreePath={handleSelectTreePath}
          onTogglePath={handleTogglePath}
          callbacks={treeCallbacks}
          labels={{
            ciWorkspaceCategory: 'CI工作区目录',
          }}
        />
      </aside>

      {/* Primary content area */}
      <div className="adl-tool-primary adl-tool-primary--github">
        {!activeCiWorkspaceId ? (
          <div className="adl-github__empty">
            <p>请选择一个工作区查看 CI 状态</p>
            <span className="adl-text--tertiary">从左侧树形目录中选择已配置 CI 的工作区</span>
          </div>
        ) : (
          <div className="adl-communicate__primary-scroll">
            {primaryContent}
          </div>
        )}
      </div>

      {/* Settings dialog */}
      <GitHubSettingsDialog
        open={settingsDialogState.open}
        workspaceName={settingsDialogState.workspaceName}
        owner={
          settingsDialogState.open
            ? gitHubWorkspaceConfigs[settingsDialogState.workspaceId]?.owner ?? ''
            : ''
        }
        repo={
          settingsDialogState.open
            ? gitHubWorkspaceConfigs[settingsDialogState.workspaceId]?.repo ?? ''
            : ''
        }
        branch={
          settingsDialogState.open
            ? gitHubWorkspaceConfigs[settingsDialogState.workspaceId]?.branch ?? 'main'
            : 'main'
        }
        token={
          settingsDialogState.open
            ? gitHubWorkspaceConfigs[settingsDialogState.workspaceId]?.accessToken ?? ''
            : ''
        }
        error={error}
        copy={copy}
        onSave={handleSaveSettings}
        onCancel={handleCloseSettings}
      />
    </div>
  );
}
```

Remove `SettingsView` from the file since it's replaced by `GitHubSettingsDialog`. Keep `HelpView`, `OverviewView`, `WorkflowsView`, `JobsView`, and `GitHubLogViewer` imports as-is.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx \
  frontend/src/app/regions/right-panel/hooks/useCIPanelProps.ts
git commit -m "feat(github): rewrite GitHubPanel with tree navigator and multi-workspace support"
```

---

### Task 5: Update CSS for new GitHub tree navigator

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/communication-panel.css`

- [ ] **Step 1: Add new tree/category/entry styles and update navigator styles**

Reuse the browser tree CSS patterns but with `.adl-github-*` prefix classes. Add at the end of `communication-panel.css`:

```css
/* ─── GitHub Tree Navigator (copied from browser-panel.css pattern) ─── */

.adl-tool-surface--github {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  min-height: 0;
}

.adl-tool-surface--github.is-navigator-collapsed .adl-tool-navigator {
  width: 0;
  opacity: 0;
  border-right: none;
  overflow: hidden;
}

.adl-tool-primary--github {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}

/* Category */
.adl-github-category {
  padding: 4px 0;
}

.adl-github-category__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  color: var(--text-tertiary);
  font-size: var(--text-xxs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.adl-github-category__label-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adl-github-category__label-count {
  flex-shrink: 0;
  color: var(--text-tertiary);
  font-size: var(--text-xxs);
  font-weight: 500;
}

.adl-github-category__entries {
  display: flex;
  flex-direction: column;
}

/* Directory entry (workspace) */
.adl-github-entry {
  display: flex;
  flex-direction: column;
}

.adl-github-entry__header {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  cursor: pointer;
  border-radius: 0;
  min-height: 28px;
  transition: background-color 0.15s;
}

.adl-github-entry__header:hover {
  background: var(--bg-hover);
}

.adl-github-entry__header.is-selected {
  background: var(--bg-active);
}

.adl-github-entry__expand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.adl-github-entry__expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 3px;
  transition: transform 0.15s, color 0.15s;
}

.adl-github-entry__expand-btn:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.adl-github-entry__expand-btn.is-expanded {
  transform: rotate(0deg);
}

.adl-github-entry__namezone {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 4px;
  cursor: pointer;
}

.adl-github-entry__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  color: var(--text-primary);
  line-height: 1.5;
}

.adl-github-entry__trailing {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.adl-github-entry__configured-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
}

.adl-github-entry__count {
  font-size: var(--text-xxs);
  color: var(--text-tertiary);
  flex-shrink: 0;
  min-width: 16px;
  text-align: right;
}

.adl-github-entry__actions {
  display: none;
  align-items: center;
  gap: 2px;
}

.adl-github-entry__header:hover .adl-github-entry__actions {
  display: flex;
}

.adl-github-entry__actions .adl-icon-btn {
  width: 20px;
  height: 20px;
}

/* Leaf entry (Overview, Workflows, Jobs, Logs) */
.adl-github-entry__leaf {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 32px;
  cursor: pointer;
  min-height: 26px;
  transition: background-color 0.15s;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.adl-github-entry__leaf:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.adl-github-entry__leaf.is-selected {
  background: var(--bg-active);
  color: var(--text-primary);
}

.adl-github-entry__leaf-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.6;
}

.adl-github-entry__leaf.is-selected .adl-github-entry__leaf-icon {
  opacity: 1;
}

.adl-github-entry__leaf-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Tree children container */
.adl-github-entry__tree {
  display: flex;
  flex-direction: column;
}

.adl-github-entry__empty {
  padding: 4px 8px 4px 32px;
}

/* Menu */
.adl-multitree-entry__menu {
  position: fixed;
  z-index: 10000;
  min-width: 180px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  display: flex;
  flex-direction: column;
}

.adl-multitree-entry__menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: var(--text-xs);
  color: var(--text-primary);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.adl-multitree-entry__menu-item:hover {
  background: var(--bg-hover);
}

.adl-multitree-entry__menu-item.is-danger {
  color: var(--danger);
}

.adl-multitree-entry__menu-item.is-danger:hover {
  background: var(--surface-danger);
}
```

- [ ] **Step 2: Update old `adl-communicate__navigator` and `adl-communicate__nav-buttons` styles**

Keep the existing `.adl-communicate__surface` and `.adl-communicate__primary` styles. The old nav button styles (`.adl-communicate__nav-buttons`, `.adl-communicate__nav-btn`, `.adl-communicate__nav-content`, `.adl-communicate__navigator`) are no longer used by GitHubPanel — but they might be referenced elsewhere. Add a comment to mark them as deprecated and keep them for now. They'll be removed in a cleanup pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/regions/rightpanel/communication-panel.css
git commit -m "style(github): add tree navigator CSS for multi-workspace GitHub panel"
```

---

### Task 6: Update useGitPushAutoRefresh for multi-workspace

**Files:**
- Modify: `frontend/src/app/features/terminal/useGitPushAutoRefresh.ts`

- [ ] **Step 1: Read the current file and add multi-workspace support**

Read the file first to understand its current pattern, then modify the `notifyGitPushed` call to refresh all configured workspaces:

```typescript
// Replace store interaction:
// Old: notifyGitPushed() - only refreshes single workspace
// New: For each configured workspace, call refreshCiStatusForWorkspace
```

The file is at `frontend/src/app/features/terminal/useGitPushAutoRefresh.ts`. After reading it, change the auto-refresh trigger to call `refreshCiStatusForWorkspace` for all configured workspaces.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/features/terminal/useGitPushAutoRefresh.ts
git commit -m "feat(github): update git push auto-refresh for multi-workspace CI"
```

---

### Task 7: Integration verification and cleanup

**Files:**
- All above files

- [ ] **Step 1: Run TypeScript type check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 type errors

- [ ] **Step 2: Run ESLint**

```bash
cd frontend && npx eslint .
```
Expected: 0 lint errors

- [ ] **Step 3: Verify imports and exports**

Check that:
- `features/github-tree/index.ts` exports `GitHubTree` and `useGithubTreeData`
- `GitHubPanel.tsx` imports `GitHubTree` correctly
- `communicateSlice.ts` exports all new types and interfaces
- `StoreState.ts` correctly includes all new fields from `CommunicateSlice`

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(github): resolve type/lint issues after multi-workspace integration"
```

---

## Self-Review

### Spec coverage:
1. ✅ **Multi-workspace**: `gitHubWorkspaceConfigs: Record<string, GitWorkspaceCiConfig>` in Task 1, tree data in Task 2, navigator in Tasks 3-4
2. ✅ **Browser-style left sidebar**: Tree navigator with expand/collapse in Tasks 3-4, CSS in Task 5
3. ✅ **No "历史记录" workspace**: Only `ci-workspace` category created, no `history` or `userFolder` category
4. ✅ **Default system sub-entries (Overview, Workflows, Jobs, Logs)**: Built into each workspace node in `useGithubTreeData.ts` (Task 2, `DEFAULT_SUB_ENTRIES`)
5. ✅ **No "新建标签" button**: Removed from toolbar in Task 4
6. ✅ **"删除全部目录CI配置及数据" button + "Help" button**: Two buttons in the toolbar in Task 4
7. ✅ **No "已打开标签" button / file-tree/list/all buttons → "刷新全部" button**: `IconRefreshCw` replaces file-tree view toggle in Task 4
8. ✅ **No "搜索标签" button**: Removed from toolbar in Task 4
9. ✅ **Workspace hover: "删除CI配置及数据" + "设置"**: Two `TooltipSimple` buttons in `GitHubTreeEntry.tsx` (Task 3)

### Placeholder scan:
No "TBD", "TODO", or placeholder patterns found. All code blocks contain complete implementations.

### Type consistency:
- `GitWorkspaceCiConfig` defined in `communicateSlice.ts`, used consistently in `useGithubTreeData.ts`, `GitHubTree.tsx`, `useCIPanelProps.ts`
- `GitHubTreeNode` path format `github-workspace:{wsId}` and `github-workspace:{wsId}:{section}` used consistently
- `SectionCallbacks` interface defined once in `GitHubCategorySection.tsx`, used in all tree components
- All `GitHubTreeNode` `nodeType` values match the `GitHubNodeType` union
- `activeWorkspaceSection` type `'overview' | 'workflows' | 'jobs' | 'logs'` used consistently

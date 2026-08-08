import type {
  GitSnapshot,
  PatchSet,
  RecentWorkspaceEntry,
  WorkspaceChangePreview,
  WorkspaceMeta,
  WorkspaceTreeNode,
} from '@ai-digital-life/kernel';
import {
  DEMO_DOCUMENTS,
  DEMO_NOW,
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_NAME_MARKER,
  DEMO_WORKSPACE_PATH,
} from './demo-constants';

function demoNode(path: string): WorkspaceTreeNode {
  const name = path.split('/').pop() ?? path;
  return { path, name, kind: 'file', children: [] };
}

export function buildDemoTree(): WorkspaceTreeNode[] {
  const docs = Object.keys(DEMO_DOCUMENTS);
  const files = docs.map(demoNode);
  const dirSet = new Set<string>();
  for (const doc of docs) {
    const parts = doc.split('/');
    let acc = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      dirSet.add(acc);
    }
  }
  const dirs = [...dirSet].sort().map((path) => {
    const name = path.split('/').pop() ?? path;
    return { path, name, kind: 'directory' as const, children: [] };
  });
  return [...dirs, ...files].sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1,
  );
}

export function buildDemoWorkspaceMeta(): WorkspaceMeta {
  return {
    id: DEMO_WORKSPACE_ID,
    path: DEMO_WORKSPACE_PATH,
    rootPath: DEMO_WORKSPACE_PATH,
    name: DEMO_WORKSPACE_NAME_MARKER,
    type: 'node',
    status: 'ready',
    createdAt: DEMO_NOW - 60_000,
    updatedAt: DEMO_NOW,
    lastOpenedAt: DEMO_NOW,
    gitSnapshot: buildDemoGitSnapshot(),
  };
}

export function buildDemoRecentEntry(): RecentWorkspaceEntry {
  return {
    id: DEMO_WORKSPACE_ID,
    path: DEMO_WORKSPACE_PATH,
    rootPath: DEMO_WORKSPACE_PATH,
    name: DEMO_WORKSPACE_NAME_MARKER,
    lastOpenedAt: DEMO_NOW,
    isPinned: true,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  };
}

export function buildDemoGitSnapshot(): GitSnapshot {
  return {
    isRepo: true,
    branch: 'main',
    head: 'abc1234',
    staged: [],
    unstaged: ['frontend/src/main.tsx', 'README.md'],
    untracked: [],
    conflicts: [],
    capturedAt: DEMO_NOW,
  };
}

export function buildDemoChangePreview(relativePath: string): WorkspaceChangePreview {
  const currentContent = DEMO_DOCUMENTS[relativePath] ?? '';
  const isModified = relativePath === 'frontend/src/main.tsx';
  return {
    path: relativePath,
    changeKind: currentContent ? 'modified' : 'added',
    status: isModified ? 'modified' : 'untracked',
    baseExists: isModified,
    currentExists: Boolean(currentContent),
    baseContent: isModified ? `import { App } from './app/App';\n// (old)\n` : '',
    currentContent,
  };
}

function demoPatchSet(sessionId: string, runId: string): PatchSet {
  const relativePath = 'frontend/src/main.tsx';
  const before = DEMO_DOCUMENTS[relativePath] ?? '';
  const after = `// AI Digital Life\n${before}`;
  return {
    id: `patchset-demo-${runId}`,
    workspaceId: DEMO_WORKSPACE_ID,
    sessionId,
    runId,
    title: `Update ${relativePath}`,
    summary: '在 main.tsx 顶部加入项目说明注释。',
    status: 'ready',
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
    filePatches: [
      {
        id: `filepatch-demo-${runId}`,
        patchSetId: `patchset-demo-${runId}`,
        relativePath,
        beforeContent: before,
        afterContent: after,
        hunks: [
          {
            id: `hunk-demo-${runId}`,
            filePatchId: `filepatch-demo-${runId}`,
            patchSetId: `patchset-demo-${runId}`,
            relativePath,
            oldStart: 1,
            oldLines: before.split(/\r?\n/).length,
            newStart: 1,
            newLines: after.split(/\r?\n/).length,
            preview: 'Add project note to main.tsx',
            beforeText: before,
            afterText: after,
            decision: 'accepted',
          },
        ],
      },
    ],
  };
}

export function buildDemoPatchSet(sessionId: string, runId: string): PatchSet {
  return demoPatchSet(sessionId, runId);
}

export function getDemoPatchSet(patchSetId: string): PatchSet | undefined {
  if (patchSetId === 'patchset-demo-complete') {
    return demoPatchSet('demo-session-complete', 'complete');
  }
  if (patchSetId === 'patchset-demo-plan') {
    return demoPatchSet('demo-session-plan', 'plan');
  }
  return undefined;
}

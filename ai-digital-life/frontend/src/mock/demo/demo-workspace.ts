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
import { DEMO_RUN_IDS } from './demo-run-activity';

export function buildDemoTree(): WorkspaceTreeNode[] {
  const docs = Object.keys(DEMO_DOCUMENTS);
  type Node = WorkspaceTreeNode;
  const rootNodes: Node[] = [];
  const dirs = new Map<string, Node>();

  function ensureDir(path: string): Node {
    const cached = dirs.get(path);
    if (cached) {
      return cached;
    }
    const name = path.split('/').pop() ?? path;
    const node: Node = { path, name, kind: 'directory', children: [] };
    dirs.set(path, node);
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (parent) {
      ensureDir(parent).children.push(node);
    } else {
      rootNodes.push(node);
    }
    return node;
  }

  for (const doc of docs) {
    const parts = doc.split('/');
    let acc = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      ensureDir(acc);
    }
    const parent = doc.includes('/') ? doc.slice(0, doc.lastIndexOf('/')) : '';
    const name = doc.split('/').pop() ?? doc;
    const fileNode: Node = { path: doc, name, kind: 'file', children: [] };
    if (parent) {
      ensureDir(parent).children.push(fileNode);
    } else {
      rootNodes.push(fileNode);
    }
  }

  const sort = (nodes: Node[]) => {
    nodes.sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
    );
    for (const node of nodes) {
      if (node.children.length) {
        sort(node.children);
      }
    }
  };
  sort(rootNodes);
  return rootNodes;
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
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const snapshot = buildDemoGitSnapshot();
  const status = snapshot.conflicts.includes(normalizedPath)
    ? 'conflicted'
    : snapshot.untracked.includes(normalizedPath)
      ? 'untracked'
      : snapshot.unstaged.includes(normalizedPath)
        ? 'modified'
        : 'staged';
  const currentContent = DEMO_DOCUMENTS[normalizedPath] ?? '';
  const currentExists = Boolean(currentContent);
  const baseExists = status !== 'untracked';
  return {
    path: normalizedPath,
    changeKind: !baseExists ? 'added' : !currentExists ? 'deleted' : 'modified',
    status,
    baseExists,
    currentExists,
    baseContent: baseExists ? `// mock HEAD content for ${normalizedPath}\n` : '',
    currentContent,
  };
}

function demoPatchSet(patchSetId: string, sessionId: string, runId: string): PatchSet {
  const relativePath = 'frontend/src/main.tsx';
  const before = DEMO_DOCUMENTS[relativePath] ?? '';
  const after = `// AI Digital Life\n${before}`;
  return {
    id: patchSetId,
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
        patchSetId,
        relativePath,
        beforeContent: before,
        afterContent: after,
        hunks: [
          {
            id: `hunk-demo-${runId}`,
            filePatchId: `filepatch-demo-${runId}`,
            patchSetId,
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
  return demoPatchSet(`patchset-demo-${runId}`, sessionId, runId);
}

export function getDemoPatchSet(patchSetId: string): PatchSet | undefined {
  if (patchSetId === 'patchset-demo-complete') {
    return demoPatchSet('patchset-demo-complete', 'demo-session-complete', DEMO_RUN_IDS.complete);
  }
  if (patchSetId === 'patchset-demo-plan') {
    return demoPatchSet('patchset-demo-plan', 'demo-session-plan', DEMO_RUN_IDS.plan);
  }
  return undefined;
}

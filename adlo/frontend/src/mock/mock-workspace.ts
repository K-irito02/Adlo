import { IpcErrorCode } from "../shared/ipc/shared";
import type { WorkspaceBridge } from "../shared/ipc";
import type {
  GitBranchSummary,
  GitSnapshot,
  WorktreeInfo,
  WorkspaceChangePreview,
  WorkspaceFileChangedEvent,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceMeta,
  WorkspaceSearchFilter,
  WorkspaceSearchHit,
  WorkspaceSearchWindow,
  WorkspaceWorktreeEnsureInput,
  WorkspaceWorktreeEnsureResult,
  WorkspaceWorktreeRemoveInput
} from "@adlo/kernel";
import { paginateSearchHits } from "../shared/ipc/searchWindow";
import { isSearchPathExcluded } from "../shared/ipc/searchIgnore";
import {
  buildMockChangePreview,
  buildMockWorkspaceMeta,
  buildWorkspaceTreeFromPaths,
  currentWorkspaceMeta,
  documents,
  emptyDirectories,
  emptyGitSnapshot,
  ensureRecentWorkspace,
  fileVersions,
  recentWorkspaces,
  setMockCurrentWorkspace,
  workspaceRoot,
} from "./mock-shared";
import { buildOutlineFromContent } from "../shared/outline";
import type { FileOutlineItem } from "@adlo/kernel";
import {
  commitNodes,
  commitEdges,
  allBranches,
  contributorNames,
  contributorModuleMatrix,
  moduleNames,
  fileHotspotsMockData,
  mockCommitTimelineData,
} from "../test-fixtures/gitVisMockData";

export function setMockActiveWorkspace(workspace?: WorkspaceMeta): void {
  setMockCurrentWorkspace(workspace);
}

export const mockWorkspace: WorkspaceBridge = {
  listRecent: async () => ({ ok: true, data: recentWorkspaces }),
  open: async (workspacePath: string) => ({
    ok: true,
    data: (() => {
      const next = buildMockWorkspaceMeta(workspacePath);
      ensureRecentWorkspace(next);
      setMockCurrentWorkspace(next);
      return next;
    })()
  }),
  clearCurrent: async () => {
    setMockCurrentWorkspace(undefined);
    return { ok: true, data: true };
  },
  pickDirectory: async () => ({
    ok: false,
    error: { code: IpcErrorCode.INTERNAL_ERROR, message: "Directory picker is unavailable in the mock bridge." }
  }),
  removeFromSidebar: async (workspaceId: string) => {
    const entry = recentWorkspaces.find((item) => item.id === workspaceId);
    if (entry) {
      entry.removedFromSidebar = true;
    }
    return { ok: true, data: recentWorkspaces };
  },
  listTreeForWorkspace: async (
    _workspacePath: string,
    _options?: { force?: boolean; allowStale?: boolean },
  ) => ({
    ok: true as const,
    // mock 无 SQLite 行：allowStale 恒 miss，恒返新鲜树（fromCache:false）。
    data: {
      tree: currentWorkspaceMeta
        ? buildWorkspaceTreeFromPaths(
            Array.from(documents.keys()),
            Array.from(emptyDirectories),
          )
        : [],
      fromCache: false as const,
      capturedAt: Date.now(),
    },
  }),
  listGitStatusForWorkspace: async (_workspacePath: string) => ({
    ok: true,
    data: { isRepo: true, branch: "main", staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: Date.now() }
  }),
  initGitRepo: async (_workspacePath: string) => ({
    ok: true,
    data: { isRepo: true, branch: "main", staged: [], unstaged: [], untracked: [], conflicts: [], capturedAt: Date.now() }
  }),
  revealInFileManager: async () => ({ ok: true, data: true }),
  createFile: async (relativePath: string, content = "", _workspacePath?: string) => {
    documents.set(relativePath, content);
    fileVersions.set(relativePath, Date.now());
    return {
      ok: true,
      data: {
        path: relativePath,
        content,
        lastModifiedAt: fileVersions.get(relativePath) ?? Date.now()
      }
    };
  },
  updateFileContent: async (relativePath: string, content: string, _workspacePath?: string) => {
    // mock 与真实端同上限（8MB，按 utf8 字节计）；分隔符归一化沿用 createFile 的
    // 原样键行为（调用方统一传 `/` 路径），此处不另做。
    if (new TextEncoder().encode(content).byteLength > 8 * 1024 * 1024) {
      return { ok: false, error: { code: "INVALID_INPUT", message: `file exceeds configured write limit: ${relativePath}` } };
    }
    if (!documents.has(relativePath)) {
      return { ok: false, error: { code: "NOT_FOUND", message: `file not found: ${relativePath}` } };
    }
    documents.set(relativePath, content);
    fileVersions.set(relativePath, Date.now());
    return {
      ok: true,
      data: {
        path: relativePath,
        content,
        lastModifiedAt: fileVersions.get(relativePath) ?? Date.now()
      }
    };
  },
  createFolder: async (relativePath: string, _workspacePath?: string) => {
    emptyDirectories.add(relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
    return { ok: true, data: true };
  },
  listTree: async (_options?: { force?: boolean; allowStale?: boolean }) => ({
    ok: true as const,
    // 同 listTreeForWorkspace：allowStale 恒 miss，恒返新鲜树。
    data: {
      tree: currentWorkspaceMeta
        ? buildWorkspaceTreeFromPaths(
            Array.from(documents.keys()),
            Array.from(emptyDirectories),
          )
        : [],
      fromCache: false as const,
      capturedAt: Date.now(),
    },
  }),
  readFile: async (relativePath: string) => ({
    ok: true,
    data: {
      path: relativePath,
      content: documents.get(relativePath) ?? "",
      lastModifiedAt: fileVersions.get(relativePath) ?? Date.now()
    }
  }),
  readFileForWorkspace: async (_workspacePath: string, relativePath: string) => ({
    ok: true,
    data: {
      path: relativePath,
      content: documents.get(relativePath) ?? "",
      lastModifiedAt: fileVersions.get(relativePath) ?? Date.now()
    }
  }),
  // mock 工作区只有内存文本文档，无二进制字节：媒体读取恒返回不可用，
  // 调用端展示居中友好错误（与超限/失败同一视觉）。
  readMediaFile: async (relativePath: string) => ({
    ok: false as const,
    error: {
      code: "WORKSPACE_ERROR",
      message: `media files are not readable in mock workspace: ${relativePath}`
    }
  }),
  readMediaFileForWorkspace: async (_workspacePath: string, relativePath: string) => ({
    ok: false as const,
    error: {
      code: "WORKSPACE_ERROR",
      message: `media files are not readable in mock workspace: ${relativePath}`
    }
  }),
  getChangePreview: async (relativePath: string) => ({
    ok: true,
    data: buildMockChangePreview(relativePath)
  }),
  getChangePreviewForWorkspace: async (_workspacePath: string, relativePath: string) => {
    if (!currentWorkspaceMeta) return { ok: false, error: { message: "No workspace", code: "NO_WORKSPACE" } };
    return {
      ok: true,
      data: buildMockChangePreview(relativePath),
    };
  },
  search: async (
    query: string,
    window?: WorkspaceSearchWindow,
    filter?: WorkspaceSearchFilter,
    _workspacePath?: string,
  ) => {
    // 与其余三端对齐：空查询直接返回空页（`''.includes` 恒真，否则会全量刷屏）。
    if (!query.trim()) {
      return { ok: true as const, data: { hits: [] as WorkspaceSearchHit[], hasMore: false } };
    }
    // mock 为内存文档：手动忽略名单同样过滤（`.gitignore` 无内存对应物，恒视为不启用，
    // 与"无 gitignore 文件的工作区"语义一致）。
    const excluded = filter?.excludedPaths ?? [];
    const needle = query.toLowerCase();
    const all: WorkspaceSearchHit[] = Array.from(documents.entries())
      .filter(([filePath]) => !isSearchPathExcluded(filePath, excluded))
      .flatMap(([filePath, content]) =>
        content
          .split(/\r?\n/)
          .map((lineText, index) => ({ filePath, lineText, index }))
          .filter((entry) => entry.lineText.toLowerCase().includes(needle))
          .map((entry) => ({
            path: entry.filePath,
            line: entry.index + 1,
            // 与三端对齐截断 240（事项 M7；searchInFiles 同文件已截断）。
            preview: entry.lineText.trim().slice(0, 240),
          }))
      );
    // 与后端同语义：窗口切片 + 精确 hasMore（`paginateSearchHits` 是前端单一来源）。
    return { ok: true, data: paginateSearchHits(all, window) };
  },
  searchInFiles: async (
    paths: string[],
    query: string,
    window?: WorkspaceSearchWindow,
    filter?: WorkspaceSearchFilter,
    _workspacePath?: string,
  ) => {
    // 与其余三端对齐：空查询返回 []（`''.includes` 恒真，旧代码会全量刷屏）。
    if (!query.trim()) {
      return { ok: true as const, data: { hits: [] as WorkspaceSearchHit[], hasMore: false } };
    }
    const excluded = filter?.excludedPaths ?? [];
    const needle = query.toLowerCase();
    const hits: WorkspaceSearchHit[] = [];
    for (const filePath of paths) {
      if (isSearchPathExcluded(filePath, excluded)) {
        continue;
      }
      const content = documents.get(filePath);
      if (content === undefined) {
        continue;
      }
      content.split(/\r?\n/).forEach((lineText, index) => {
        if (lineText.toLowerCase().includes(needle)) {
          hits.push({ path: filePath, line: index + 1, preview: lineText.trim().slice(0, 240) });
        }
      });
    }
    return { ok: true as const, data: paginateSearchHits(hits, window) };
  },
  // 空实现是刻意的：mock 内存文档无外部变更源，不存在需要推送的变更。
  onFilesChanged: () => () => {},
  // mock 无 watcher，声明监听根为 no-op。
  setFilesChangedRoots: () => {},
  outline: async (relativePath: string) => {
    const content = documents.get(relativePath) ?? "";
    const items: FileOutlineItem[] = buildOutlineFromContent(content, relativePath);
    return { ok: true, data: items };
  },
  renameFile: async (relativePath: string, newName: string, _workspacePath?: string) => {
    const keys = Array.from(documents.keys());
    const prefix = relativePath.endsWith("/") ? relativePath : relativePath.substring(0, relativePath.lastIndexOf("/") + 1);
    for (const key of keys) {
      if (key === relativePath || key.startsWith(relativePath + "/")) {
        const newKey = prefix + newName + key.substring(relativePath.length);
        const content = documents.get(key) ?? "";
        documents.delete(key);
        documents.set(newKey, content);
        const ver = fileVersions.get(key) ?? Date.now();
        fileVersions.delete(key);
        fileVersions.set(newKey, Date.now());
      }
    }
    return { ok: true, data: true };
  },
  deleteFile: async (relativePath: string, _workspacePath?: string) => {
    const keys = Array.from(documents.keys());
    for (const key of keys) {
      if (key === relativePath || key.startsWith(relativePath + "/")) {
        documents.delete(key);
        fileVersions.delete(key);
      }
    }
    emptyDirectories.delete(relativePath);
    return { ok: true, data: true };
  },
  duplicateFile: async (srcRelativePath: string, dstRelativePath: string, _workspacePath?: string) => {
    const keys = Array.from(documents.keys());
    for (const key of keys) {
      if (key === srcRelativePath || key.startsWith(srcRelativePath + "/")) {
        const newKey = dstRelativePath + key.substring(srcRelativePath.length);
        const content = documents.get(key) ?? "";
        documents.set(newKey, content);
        fileVersions.set(newKey, Date.now());
      }
    }
    return { ok: true, data: true };
  },
  getAbsolutePath: async (relativePath: string, _workspacePath?: string) => {
    return { ok: true, data: `/mock/workspace/${relativePath}` };
  },
  moveFile: async (relativePath: string, newPath: string, _workspacePath?: string) => {
    const content = documents.get(relativePath);
    if (content !== undefined) {
      documents.delete(relativePath);
      documents.set(newPath, content);
      const ver = fileVersions.get(relativePath);
      fileVersions.delete(relativePath);
      fileVersions.set(newPath, ver ?? Date.now());
    } else {
      const keys = Array.from(documents.keys()).filter(k => k.startsWith(relativePath + "/"));
      for (const key of keys) {
        const kcontent = documents.get(key);
        documents.delete(key);
        documents.set(newPath + key.substring(relativePath.length), kcontent ?? "");
        const ver = fileVersions.get(key);
        fileVersions.delete(key);
        fileVersions.set(newPath + key.substring(relativePath.length), ver ?? Date.now());
      }
    }
    return { ok: true, data: true };
  },
  setEditorDirtyPaths: async () => ({ ok: true, data: true }),
  getGitStatus: async () => ({
    ok: true,
    data: currentWorkspaceMeta?.gitSnapshot ?? emptyGitSnapshot()
  }),
  listGitBranches: async (_rootPath?: string) => {
    if (!currentWorkspaceMeta) {
      return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
    }
    const currentBranch = currentWorkspaceMeta.gitSnapshot?.branch ?? "main";
    const branches: GitBranchSummary[] = [
      { name: currentBranch, isCurrent: true, local: true, remote: true, hasStash: false },
      { name: "main", isCurrent: currentBranch === "main", local: true, remote: true, hasStash: false },
      { name: "experiment/mock", isCurrent: currentBranch === "experiment/mock", local: true, remote: false, hasStash: false }
    ].filter((branch, index, list) => list.findIndex((item) => item.name === branch.name) === index);
    return { ok: true, data: branches };
  },
  switchGitBranch: async (input: WorkspaceGitBranchSwitchInput) => {
    if (!currentWorkspaceMeta) {
      return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
    }
    const dirty = (currentWorkspaceMeta.gitSnapshot?.staged.length ?? 0) > 0 ||
      (currentWorkspaceMeta.gitSnapshot?.unstaged.length ?? 0) > 0 ||
      (currentWorkspaceMeta.gitSnapshot?.untracked.length ?? 0) > 0;
    if (dirty && !input.allowStash) {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: "Dirty worktree requires explicit stash confirmation." }
      };
    }
    const previousBranch = currentWorkspaceMeta.gitSnapshot?.branch ?? "main";
    const gitSnapshot: GitSnapshot = {
      ...(currentWorkspaceMeta.gitSnapshot ?? emptyGitSnapshot()),
      isRepo: true,
      branch: input.branchName,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
      capturedAt: Date.now()
    };
    const workspace = { ...currentWorkspaceMeta, gitSnapshot, updatedAt: Date.now(), lastOpenedAt: Date.now() };
    setMockCurrentWorkspace(workspace);
    const result: WorkspaceGitBranchChangeResult = {
      workspace,
      gitSnapshot,
      previousBranch,
      currentBranch: input.branchName,
      stashedChanges: dirty,
      hasRestored: false
    };
    return { ok: true, data: result };
  },
    // mock 无真实 worktree：恒空，ensure 见下（调用方走 openWorkspace 全量刷新）。
  listWorktrees: async () => ({ ok: true, data: [] as WorktreeInfo[] }),
    ensureWorktree: async (input: WorkspaceWorktreeEnsureInput) => {
      if (!currentWorkspaceMeta) {
        return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
      }
      // Mock/demo：无真实 worktree，直接以当前工作区路径充当目标，
      // 调用方仍走 openWorkspace 全量刷新，行为一致。
      const result: WorkspaceWorktreeEnsureResult = {
        path: currentWorkspaceMeta.rootPath,
        created: false,
        branch: input.branchName,
        gitSnapshot: currentWorkspaceMeta.gitSnapshot ?? emptyGitSnapshot()
      };
      return { ok: true, data: result };
    },
    removeWorktree: async (_input: WorkspaceWorktreeRemoveInput) => ({ ok: true, data: undefined }),
    pruneWorktrees: async () => ({ ok: true, data: undefined }),
    stageFile: async (relativePath: string, _workspacePath?: string) => {
      if (!currentWorkspaceMeta) {
        return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
      }
      const snapshot = currentWorkspaceMeta.gitSnapshot ?? emptyGitSnapshot();
      const updated: GitSnapshot = {
        ...snapshot,
        staged: [...new Set([...snapshot.staged, relativePath])],
        unstaged: snapshot.unstaged.filter((p) => p !== relativePath),
        capturedAt: Date.now(),
      };
      const ws = { ...currentWorkspaceMeta, gitSnapshot: updated };
      setMockCurrentWorkspace(ws);
      return { ok: true, data: undefined };
    },
    unstageFile: async (relativePath: string, _workspacePath?: string) => {
      if (!currentWorkspaceMeta) {
        return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
      }
      const snapshot = currentWorkspaceMeta.gitSnapshot ?? emptyGitSnapshot();
      const updated: GitSnapshot = {
        ...snapshot,
        staged: snapshot.staged.filter((p) => p !== relativePath),
        unstaged: [...new Set([...snapshot.unstaged, relativePath])],
        capturedAt: Date.now(),
      };
      const ws = { ...currentWorkspaceMeta, gitSnapshot: updated };
      setMockCurrentWorkspace(ws);
      return { ok: true, data: undefined };
    },
    discardFile: async (relativePath: string, _workspacePath?: string) => {
      if (!currentWorkspaceMeta) {
        return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
      }
      const snapshot = currentWorkspaceMeta.gitSnapshot ?? emptyGitSnapshot();
      const updated: GitSnapshot = {
        ...snapshot,
        staged: snapshot.staged.filter((p) => p !== relativePath),
        unstaged: snapshot.unstaged.filter((p) => p !== relativePath),
        untracked: snapshot.untracked.filter((p) => p !== relativePath),
        capturedAt: Date.now(),
      };
      const ws = { ...currentWorkspaceMeta, gitSnapshot: updated };
      setMockCurrentWorkspace(ws);
      return { ok: true, data: undefined };
    },
    createGitBranch: async (input: WorkspaceGitBranchCreateInput) => {
    if (!currentWorkspaceMeta) {
      return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
    }
    const previousBranch = currentWorkspaceMeta.gitSnapshot?.branch ?? "main";
    const shouldStash =
      Boolean(input.baseBranch && input.baseBranch !== previousBranch) &&
      (((currentWorkspaceMeta.gitSnapshot?.staged.length ?? 0) > 0) ||
        ((currentWorkspaceMeta.gitSnapshot?.unstaged.length ?? 0) > 0) ||
        ((currentWorkspaceMeta.gitSnapshot?.untracked.length ?? 0) > 0));
    if (shouldStash && !input.allowStash) {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: "Dirty worktree requires explicit stash confirmation." }
      };
    }
    const gitSnapshot: GitSnapshot = {
      ...(currentWorkspaceMeta.gitSnapshot ?? emptyGitSnapshot()),
      isRepo: true,
      branch: input.branchName,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: [],
      capturedAt: Date.now()
    };
    const workspace = { ...currentWorkspaceMeta, gitSnapshot, updatedAt: Date.now(), lastOpenedAt: Date.now() };
    setMockCurrentWorkspace(workspace);
    const result: WorkspaceGitBranchChangeResult = {
      workspace,
      gitSnapshot,
      previousBranch,
      currentBranch: input.branchName,
      stashedChanges: shouldStash,
      hasRestored: false
    };
    return { ok: true, data: result };
  },
  gitVisCommitStats: async (_rootPath) => ({
    ok: true as const,
    data: {
      dailyCommits: mockCommitTimelineData.map(d => ({ date: d.date, count: d.count })),
      hourlyDistribution: [{ day: 0, hour: 10, count: 5 }],
      contributorActivity: contributorNames.map((author, i) => ({
        author, authorEmail: `${author.toLowerCase()}@example.com`,
        totalCommits: 10 - i,
        periods: [{ period: '2026-01', month: 1, count: 3 }, { period: '2026-02', month: 2, count: 2 }],
      })),
      commitTimeline: mockCommitTimelineData.map(d => ({ date: d.date, count: d.count, cumulative: d.cumulative })),
      commits: commitNodes.map(n => ({ hash: n.hash, shortHash: n.hash.substring(0, 6), date: n.date, author: n.author, authorEmail: n.authorEmail, message: n.message })),
    },
  }),
  gitVisCodeEvolution: async () => ({
    ok: true as const,
    data: { days: [{ date: '2026-01-06', additions: 100, deletions: 30 }] },
  }),
  gitVisContributorModules: async () => ({
    ok: true as const,
    data: {
      matrix: contributorNames.map((author, ci) => ({
        author, authorEmail: `${author.toLowerCase()}@example.com`,
        modules: moduleNames.map((module, mi) => ({ module, count: contributorModuleMatrix[ci][mi] })),
      })),
    },
  }),
  gitVisBranchGraph: async () => ({
    ok: true as const,
    data: {
      nodes: commitNodes.map(n => ({ hash: n.hash, shortHash: n.hash.substring(0, 6), parentHashes: [], branch: n.branch, refs: n.refs ?? [], date: n.date, message: n.message, author: n.author, authorEmail: n.authorEmail, tag: n.tag })),
      edges: commitEdges.map(e => ({ from: e.source, to: e.target })),
      branches: allBranches,
    },
  }),
  gitVisFileHotspots: async () => ({
    ok: true as const,
    data: fileHotspotsMockData,
  }),
  gitVisFirstCommitYear: async () => ({
    ok: true as const,
    data: 2020,
  }),
  onFileChanged: (listener: (event: WorkspaceFileChangedEvent) => void) => () => {}
};
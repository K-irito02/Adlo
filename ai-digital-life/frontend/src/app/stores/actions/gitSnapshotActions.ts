import type { StoreState } from '../StoreState';
import type { GitSnapshot } from '@ai-digital-life/kernel';
import type { StoreApi } from 'zustand';
import { createLazyLoader, pendingChangePreviewPath } from '../shared';
import { buildGitSnapshotSyncPatch } from '../gitSnapshotSync';

function moveInSnapshot(
  snapshot: GitSnapshot,
  relativePath: string,
  operation: 'stage' | 'unstage' | 'discard',
): GitSnapshot {
  const capturedAt = Date.now();
  if (operation === 'stage') {
    return {
      ...snapshot,
      staged: [...new Set([...snapshot.staged, relativePath])],
      unstaged: snapshot.unstaged.filter((p) => p !== relativePath),
      untracked: snapshot.untracked.filter((p) => p !== relativePath),
      capturedAt,
    };
  }
  if (operation === 'unstage') {
    return {
      ...snapshot,
      staged: snapshot.staged.filter((p) => p !== relativePath),
      unstaged: [...new Set([...snapshot.unstaged, relativePath])],
      capturedAt,
    };
  }
  return {
    ...snapshot,
    staged: snapshot.staged.filter((p) => p !== relativePath),
    unstaged: snapshot.unstaged.filter((p) => p !== relativePath),
    untracked: snapshot.untracked.filter((p) => p !== relativePath),
    capturedAt,
  };
}

export function applyGitOperation(
  get: () => StoreState,
  set: StoreApi<StoreState>['setState'],
  workspacePath: string | undefined,
  relativePath: string,
  operation: 'stage' | 'unstage' | 'discard',
) {
  const state = get();
  const currentWorkspace = state.appInfo?.currentWorkspace;
  // Resolve the target workspace from the provided path; when the path is absent
  // or equals the current workspace's path/rootPath, the operation targets the
  // current workspace. Only a path matching some OTHER workspace routes to it.
  const matchedWs = workspacePath
    ? state.recentWorkspaces.find((w) => w.path === workspacePath || w.rootPath === workspacePath)
    : undefined;
  const isCurrentPath =
    !workspacePath ||
    !currentWorkspace ||
    workspacePath === currentWorkspace.path ||
    workspacePath === currentWorkspace.rootPath;
  const targetId = matchedWs?.id ?? (isCurrentPath ? currentWorkspace?.id : undefined);
  if (!targetId) {
    return;
  }
  const isCurrentTarget = targetId === currentWorkspace?.id;
  // Source A (gitSnapshot singleton) only ever describes the current workspace:
  // moving a NON-current workspace's files into it would pollute the badge /
  // Changes panel. The sync helper encodes exactly that rule — B is always
  // merged for the target workspace, while A/C are only touched when the target
  // IS the current workspace — so both branches route through it. The optimistic
  // move is synchronous (no await between get() and set()), so the base read is
  // atomic. For the current target prefer the A singleton as the base (it also
  // corrects B/C); otherwise fall back to the target's own B slot.
  const base = isCurrentTarget
    ? (state.gitSnapshot ?? state.gitSnapshots[targetId])
    : state.gitSnapshots[targetId];
  if (!base) {
    return;
  }
  set((s: StoreState) =>
    buildGitSnapshotSyncPatch(s, {
      workspaceId: targetId,
      snapshot: moveInSnapshot(base, relativePath, operation),
    }),
  );
}

export function createGitSnapshotActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    /**
     * [fetchGitStatus - 获取当前工作区的 Git 状态快照]
     * @reads workspaceSlice.appInfo, editorSlice.selectedChangePreviewPath
     * @writes gitSlice.gitSnapshot, workspaceSlice.gitSnapshots, workspaceSlice.appInfo (gitSnapshot 字段), editorSlice.selectedChangePreviewPath, editorSlice.changePreview, editorSlice.changePreviewLoading
     * @see shared/ipc.ts → workspace.getGitStatus
     * @see mock-bridge.ts → workspace.getGitStatus
     * @see preview-bridge/index.ts → workspace.getGitStatus
     */
    fetchGitStatus: async () => {
      const currentWorkspace = get().appInfo?.currentWorkspace;
      if (!currentWorkspace) {
        set({
          gitSnapshot: undefined,
          selectedChangePreviewPath: undefined,
          changePreview: undefined,
          changePreviewLoading: false,
        });
        return;
      }
      // Capture the workspace id BEFORE the await: getGitStatus() returns only a
      // GitSnapshot payload (no self-describing workspace field), so its result
      // always belongs to the workspace that was current when the request was
      // SENT. Reading currentWorkspace.id after the await would, on a mid-flight
      // openWorkspace switch, write the old workspace's snapshot into the NEW
      // current workspace's A/B/C. Capturing up front lets the sync helper gate
      // correctly: if the switch already happened it only writes B[oldId] and
      // leaves the new workspace's A/C to openWorkspace→bootstrap.
      const workspaceId = currentWorkspace.id;
      const result = await window.digitalLife.workspace.getGitStatus();
      if (result.ok) {
        // fetchGitStatus always refreshes the (request-time) current workspace's
        // snapshot: mirror the fresh data into A/B/C in one atomic set via the
        // sync helper, so per-workspace views (file tree / changes tree / git
        // visualization) never lag behind the singleton after patch apply /
        // rollback refreshes. Passing the pre-await workspaceId lets the helper
        // gate correctly on a mid-flight workspace switch: if the switch already
        // happened it only writes B[oldId] (the payload belongs to the old
        // workspace) and leaves the new workspace's A/C to openWorkspace→bootstrap.
        set((state: StoreState) =>
          buildGitSnapshotSyncPatch(state, {
            workspaceId,
            snapshot: result.data,
          }),
        );
        // The change-preview sync below must only run against the SAME workspace
        // this fetch targeted. After a mid-flight workspace switch,
        // selectedChangePreviewPath / changePreview describe the NEW workspace,
        // while result.data's staged/unstaged lists describe the OLD one — judging
        // the new workspace's preview against the old workspace's paths would
        // wrongly close or refresh it. Guard on the request-time id; the new
        // workspace's preview consistency is handled by its own bootstrap/fetch.
        if (get().appInfo?.currentWorkspace?.id !== workspaceId) {
          return;
        }
        // 用户发起的预览请求在途时让路（复审 H2）："就绪才切换"使 pending 期
        // selected 仍是旧文件，此处若按 selected 重开预览会推进全局 seq 并作废
        // 用户刚点击的请求。下次 fetch 再收敛即可。
        if (pendingChangePreviewPath !== undefined) {
          return;
        }
        const selectedChangePreviewPath = get().selectedChangePreviewPath;
        if (!selectedChangePreviewPath) {
          return;
        }
        const changedPaths = new Set([
          ...result.data.staged,
          ...result.data.unstaged,
          ...result.data.untracked,
          ...result.data.conflicts,
        ]);
        if (!changedPaths.has(selectedChangePreviewPath)) {
          set({
            selectedChangePreviewPath: undefined,
            changePreview: undefined,
            changePreviewLoading: false,
          });
          return;
        }
        await get().openChangePreview(selectedChangePreviewPath);
      }
    },

    /**
     * [loadGitSnapshot - 懒加载指定工作区的 Git 状态快照]
     * @reads workspaceSlice.gitSnapshots, workspaceSlice.workspaceChangesTreeLoading
     * @writes workspaceSlice.gitSnapshots, workspaceSlice.workspaceChangesTreeLoading, workspaceSlice.workspaceChangesTreeErrors
     * @see shared/ipc.ts → workspace.listGitStatusForWorkspace
     * @see mock-bridge.ts → workspace.listGitStatusForWorkspace
     * @see preview-bridge/index.ts → workspace.listGitStatusForWorkspace
     */
    loadGitSnapshot: createLazyLoader<GitSnapshot>(
      (path) => window.digitalLife.workspace.listGitStatusForWorkspace(path),
      (s, id) => ({
        hasData: !!s.gitSnapshots[id],
        isLoading: !!s.workspaceChangesTreeLoading[id],
      }),
      (g, id) => ({
        workspaceChangesTreeLoading: { ...g().workspaceChangesTreeLoading, [id]: true },
        workspaceChangesTreeErrors: { ...g().workspaceChangesTreeErrors, [id]: undefined },
      }),
      (g, id, data) => ({
        // Route through the sync helper so that when the lazily-loaded workspace
        // IS the current one, A (gitSnapshot) and C are kept in lockstep — not
        // just B. For a non-current workspace only B is touched.
        ...buildGitSnapshotSyncPatch(g(), { workspaceId: id, snapshot: data }),
        workspaceChangesTreeLoading: { ...g().workspaceChangesTreeLoading, [id]: false },
      }),
      (g, id, message) => ({
        workspaceChangesTreeLoading: { ...g().workspaceChangesTreeLoading, [id]: false },
        workspaceChangesTreeErrors: { ...g().workspaceChangesTreeErrors, [id]: message },
      }),
    )(set, get),

    /**
     * [refreshGitSnapshot - 刷新单个工作区的 Git 状态快照]
     * @reads workspaceSlice.workspaceChangesTreeErrors, workspaceSlice.changesTreeRefreshing
     * @writes workspaceSlice.gitSnapshots, workspaceSlice.workspaceChangesTreeErrors, workspaceSlice.changesTreeRefreshing
     * @see shared/ipc.ts → workspace.listGitStatusForWorkspace
     * @see mock-bridge.ts → workspace.listGitStatusForWorkspace
     * @see preview-bridge/index.ts → workspace.listGitStatusForWorkspace
     * @param silent 为 true 时静默刷新，不触发该工作区刷新图标旋转
     */
    refreshGitSnapshot: async (
      workspaceId: string,
      workspacePath: string,
      options?: { silent?: boolean },
    ) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        set({
          changesTreeRefreshing: { ...get().changesTreeRefreshing, [workspaceId]: true },
          workspaceChangesTreeErrors: {
            ...get().workspaceChangesTreeErrors,
            [workspaceId]: undefined,
          },
        });
      }
      const result = await window.digitalLife.workspace.listGitStatusForWorkspace(workspacePath);
      if (!silent) {
        set({
          changesTreeRefreshing: { ...get().changesTreeRefreshing, [workspaceId]: false },
        });
      }
      if (!result.ok) {
        set({
          workspaceChangesTreeErrors: {
            ...get().workspaceChangesTreeErrors,
            [workspaceId]: result.error.message,
          },
        });
        return;
      }
      set((state) => ({
        // Sync helper keeps A/C in lockstep when the refreshed workspace IS the
        // current one; for a non-current workspace only B is touched.
        ...buildGitSnapshotSyncPatch(state, {
          workspaceId,
          snapshot: result.data,
        }),
        workspaceChangesTreeErrors: {
          ...state.workspaceChangesTreeErrors,
          [workspaceId]: undefined,
        },
      }));
    },
  };
}

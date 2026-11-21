import type { StoreState } from '../StoreState';
import type { GitSnapshot } from '@adlo/kernel';
import type { StoreApi } from 'zustand';
import { createLazyLoader, pendingChangePreviewPath } from '../shared';
import {
  cancelPreviewLanding,
  clearedChangePreviewState,
  invalidateCachedChangePreview,
  scopedFileKey,
} from '../cacheHelpers';
import { normalizeWorkspaceRelativePath } from '@utils/workspacePaths';
import { buildGitSnapshotSyncPatch } from '../gitSnapshotSync';

/** 后台批量刷新的并发上限：避免多工作区同时拉起大量 git 子进程。 */
const SNAPSHOT_REFRESH_CONCURRENCY = 3;
/** 同一工作区快照的新鲜期：focus / 15s 轮询 / 启动补刷共用，避免重复 IO。 */
const SNAPSHOT_FRESHNESS_MS = 5_000;

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

function snapshotPaths(snapshot: GitSnapshot): Set<string> {
  // 双端归一化（P4-R1-F10）：反斜杠变体仍能命中，避免误删仍在的预览。
  // 注意：归一化仅处理分隔符，不折叠大小写（git 路径大小写敏感），大小写变体不命中。
  return new Set(
    [...snapshot.staged, ...snapshot.unstaged, ...snapshot.untracked, ...snapshot.conflicts].map(
      (p) => normalizeWorkspaceRelativePath(p),
    ),
  );
}

/**
 * 陈旧变更预览对账（事项2）：快照刷新/文件丢弃后，若选中的变更预览已不在
 * 新快照中（已推送/删除），清空内容区，避免树已无文件但内容区仍显示旧 diff。
 * 仅在"预览所属工作区一致且路径消失"时清空；路径仍在则不动（由调用方重开）。
 */
function clearStaleChangePreview(
  get: () => StoreState,
  set: StoreApi<StoreState>['setState'],
  workspaceId: string,
  snapshot: GitSnapshot,
) {
  const state = get();
  const selected = state.selectedChangePreviewPath;
  if (!selected) {
    return;
  }
  const previewWorkspaceId =
    state.selectedChangePreviewWorkspaceId ?? state.appInfo?.currentWorkspace?.id;
  if (previewWorkspaceId !== workspaceId) {
    return;
  }
  if (!snapshotPaths(snapshot).has(normalizeWorkspaceRelativePath(selected))) {
    cancelPreviewLanding(scopedFileKey(previewWorkspaceId, selected), selected);
    set(clearedChangePreviewState());
  }
}

/**
 * 刷新"当前打开中的变更预览"：快照重拍后按新内容重开 diff，使内容与大纲同步。
 * 预览只属于一个工作区；不归属本次刷新的工作区时不动。
 */
async function refreshSelectedChangePreviewForWorkspace(
  get: () => StoreState,
  workspaceId: string,
): Promise<void> {
  const state = get();
  const selected = state.selectedChangePreviewPath;
  if (!selected) {
    return;
  }
  const ownerWorkspaceId =
    state.selectedChangePreviewWorkspaceId ?? state.appInfo?.currentWorkspace?.id;
  if (ownerWorkspaceId !== workspaceId) {
    return;
  }
  // 用户发起的预览请求在途时让路（与 fetchGitStatus 同口径）。
  if (pendingChangePreviewPath !== undefined) {
    return;
  }
  const workspacePath =
    state.recentWorkspaces.find((w) => w.id === workspaceId)?.path ??
    state.appInfo?.currentWorkspace?.path;
  if (!workspacePath) {
    return;
  }
  // 与 `openChangePreviewForWorkspace` 用同一套键推导（按 path 反查 id；
  // 查不到时两者同为 `global:` 键），否则失效打到另一个键，重开会读回旧缓存。
  const reopenWorkspaceId = state.recentWorkspaces.find((w) => w.path === workspacePath)?.id;
  invalidateCachedChangePreview(scopedFileKey(reopenWorkspaceId, selected));
  await get().openChangePreviewForWorkspace(workspacePath, selected);
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
  const next = moveInSnapshot(base, relativePath, operation);
  set((s: StoreState) =>
    buildGitSnapshotSyncPatch(s, {
      workspaceId: targetId,
      snapshot: next,
    }),
  );
  // 丢弃即移除：被丢弃的正是选中预览则清空内容区（stage/unstage 只 lean 列表间移动，
  // helper 内路径仍在即不动，故仅 discard 需要显式调用）。
  if (operation === 'discard') {
    clearStaleChangePreview(get, set, targetId, next);
  }
}

/**
 * 清空归属指定工作区的选中变更预览（事项5-R3）：worktree 替换式移除源工作区后，
 * 其预览在新上下文永无刷新路径（各刷新入口均按工作区归属对账），必须在此清掉，
 * 否则内容区永久残留旧 diff。不归属该工作区的预览不动。
 */
export function clearChangePreviewForWorkspace(
  get: () => StoreState,
  set: StoreApi<StoreState>['setState'],
  workspaceId: string | undefined,
) {
  if (!workspaceId) {
    return;
  }
  const state = get();
  // 未归属预览（id 为空）回退到当前工作区判定（P4-R1-F4），与 clearStaleChangePreview 同口径。
  const previewWorkspaceId =
    state.selectedChangePreviewWorkspaceId ?? state.appInfo?.currentWorkspace?.id;
  if (previewWorkspaceId === workspaceId && state.selectedChangePreviewPath !== undefined) {
    cancelPreviewLanding(
      scopedFileKey(previewWorkspaceId, state.selectedChangePreviewPath),
      state.selectedChangePreviewPath,
    );
    set(clearedChangePreviewState());
  }
}

export function createGitSnapshotActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    /**
     * [fetchGitStatus - 获取当前工作区的 Git 状态快照]
     * @reads workspaceSlice.appInfo, editorSlice.selectedChangePreviewPath
     * @writes gitSlice.gitSnapshot, workspaceSlice.gitSnapshots, workspaceSlice.appInfo (gitSnapshot 字段), editorSlice.selectedChangePreviewPath, editorSlice.changePreview, editorSlice.changePreviewLoading, editorSlice.changePreviewMedia, editorSlice.changePreviewMediaLoading, editorSlice.changePreviewMediaError
     * @see shared/ipc.ts → workspace.getGitStatus
     * @see mock-bridge.ts → workspace.getGitStatus
     * @see preview-bridge/index.ts → workspace.getGitStatus
     */
    fetchGitStatus: async () => {
      const currentWorkspace = get().appInfo?.currentWorkspace;
      if (!currentWorkspace) {
        const st = get();
        cancelPreviewLanding(
          scopedFileKey(st.selectedChangePreviewWorkspaceId, st.selectedChangePreviewPath ?? ''),
          st.selectedChangePreviewPath,
        );
        set({
          gitSnapshot: undefined,
          ...clearedChangePreviewState(),
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
        const changedPaths = snapshotPaths(result.data);
        if (!changedPaths.has(normalizeWorkspaceRelativePath(selectedChangePreviewPath))) {
          cancelPreviewLanding(
            scopedFileKey(workspaceId, selectedChangePreviewPath),
            selectedChangePreviewPath,
          );
          set(clearedChangePreviewState());
          return;
        }
        await get().openChangePreview(selectedChangePreviewPath);
      }
      // P4 F5：失败记静默诊断（与 fetchGitBranches silent 分支同口径），
      // 不再无声吞掉——保存/切换后的跟手失败可观测。
      if (!result.ok) {
        get().reportSilentError(result.error.code, result.error.message, 'git');
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
      (g, id, data) => {
        // 懒加载落盘同样对账（事项2）：首刷即发现选中预览已消失时直接清空，
        // 否则内容区残留旧 diff。与 refreshGitSnapshot / fetchGitStatus 同语义。
        const st = g();
        const selected = st.selectedChangePreviewPath;
        const previewWorkspaceId =
          st.selectedChangePreviewWorkspaceId ?? st.appInfo?.currentWorkspace?.id;
        const previewGone =
          selected !== undefined &&
          previewWorkspaceId === id &&
          !snapshotPaths(data).has(normalizeWorkspaceRelativePath(selected));
        // 清空同时取消在途 open landing，避免旧请求落定后复活已清的选中（P4-R1-F2）。
        if (previewGone) {
          cancelPreviewLanding(scopedFileKey(id, selected), selected);
        }
        return {
          // Route through the sync helper so that when the lazily-loaded workspace
          // IS the current one, A (gitSnapshot) and C are kept in lockstep — not
          // just B. For a non-current workspace only B is touched.
          ...buildGitSnapshotSyncPatch(st, { workspaceId: id, snapshot: data }),
          workspaceChangesTreeLoading: { ...st.workspaceChangesTreeLoading, [id]: false },
          ...(previewGone
            ? {
                ...clearedChangePreviewState(),
              }
            : {}),
        };
      },
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
      // 刷新后对账（事项2）：选中预览已不在新快照中（已推送/删除）则清空内容区，
      // 与 fetchGitStatus 的选中预览同步同语义（多工作区刷新路径此前缺失）。
      clearStaleChangePreview(get, set, workspaceId, result.data);
      // 仍在快照中的选中预览按新内容重开：否则 diff 内容与大纲停在旧版本。
      await refreshSelectedChangePreviewForWorkspace(get, workspaceId);
    },

    /**
     * [initGitRepo - 在当前工作区根目录初始化本地 Git 仓库]
     * 只创建 `.git`；成功后把返回的快照写入 store，让「非 Git 仓库」空态立即消失。
     * `workspacePath` 显式传给后端，避免多工作区场景下误初始化到其它工作区。
     * @param workspaceId 目标工作区 id（仅用于定位快照槽位，不参与后端执行）
     * @param workspacePath 目标工作区根路径
     * @returns 是否初始化成功
     * @see shared/ipc/workspace.ts → workspace.initGitRepo
     * @see mock-bridge.ts → workspace.initGitRepo
     * @see preview-bridge/preview-workspace.ts → workspace.initGitRepo
     */
    initGitRepo: async (workspaceId: string, workspacePath: string): Promise<boolean> => {
      const result = await window.digitalLife.workspace.initGitRepo(workspacePath);
      if (!result.ok) {
        set({
          workspaceChangesTreeErrors: {
            ...get().workspaceChangesTreeErrors,
            [workspaceId]: result.error.message,
          },
        });
        return false;
      }
      set((state) => ({
        ...buildGitSnapshotSyncPatch(state, { workspaceId, snapshot: result.data }),
        workspaceChangesTreeErrors: {
          ...state.workspaceChangesTreeErrors,
          [workspaceId]: undefined,
        },
      }));
      return true;
    },

    /**
     * [refreshAllGitSnapshotsSilent - 静默刷新所有已添加可用工作区的 Git 快照]
     * 与展开状态解耦：折叠的工作区也要有计数/分支/ahead-behind，供工作区头与
     * 工具徽章显示。启动、新增工作区、窗口聚焦、变更面板 15s 轮询都走这里；
     * 跳过 `SNAPSHOT_FRESHNESS_MS` 内的快照；worker 数量取
     * `min(SNAPSHOT_REFRESH_CONCURRENCY, targets.length)`。
     * 不转刷新图标；单个失败只记 workspaceChangesTreeErrors（与 refreshGitSnapshot 同口径）。
     * @reads workspaceSlice.recentWorkspaces, workspaceSlice.gitSnapshots
     * @writes gitSlice.gitSnapshots, workspaceSlice.workspaceChangesTreeErrors (经 refreshGitSnapshot)
     * @see shared/ipc.ts → workspace.listGitStatusForWorkspace (经 refreshGitSnapshot)
     * @see mock-bridge.ts → workspace.listGitStatusForWorkspace (经 refreshGitSnapshot)
     * @see preview-bridge/index.ts → workspace.listGitStatusForWorkspace (经 refreshGitSnapshot)
     */
    refreshAllGitSnapshotsSilent: async () => {
      const state = get();
      const now = Date.now();
      const targets = (state.recentWorkspaces ?? []).filter((w) => {
        if (w.removedFromSidebar || !w.available) {
          return false;
        }
        const snapshot = state.gitSnapshots[w.id];
        return !snapshot || now - snapshot.capturedAt >= SNAPSHOT_FRESHNESS_MS;
      });
      if (targets.length === 0) {
        return;
      }
      let cursor = 0;
      const worker = async () => {
        while (cursor < targets.length) {
          const target = targets[cursor]!;
          cursor += 1;
          try {
            await get().refreshGitSnapshot(target.id, target.path, { silent: true });
          } catch (err) {
            // 桥接层 reject（如断网抛错）在此记录原因，避免静默吞掉。
            console.warn('[refreshAllGitSnapshotsSilent] refreshGitSnapshot rejected', err);
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(SNAPSHOT_REFRESH_CONCURRENCY, targets.length) }, worker),
      );
    },
  };
}

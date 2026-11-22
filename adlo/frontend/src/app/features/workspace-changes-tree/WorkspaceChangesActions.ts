import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { joinPathSegments } from '@app/utils/workspacePaths';
import type { FileTreeContextMenuItem } from '@features/file-tree';
export interface UseWorkspaceChangesActionsParams {
  workspace: RecentWorkspaceEntry;
  onToggleExpand: () => void;
  onHideFromRightPanels: (workspaceId: string) => void;
  onRefreshTree: () => void;
  getContextMenuItems: (node: WorkspaceTreeNode) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  onWorkspaceRootClick?: () => void;
  // 事项2：重命名/删除确认必须作用到右键节点所属工作区（面板级 dialogs 持有），
  // 由本 wrapper 在原动作之后注入（与文件面板 WorkspaceFileTreeEntry 对齐）。
  setRenamingWorkspacePath?: (path: string | undefined) => void;
  setDeleteWorkspacePath?: (path: string | undefined) => void;
  // 目录级 discard 需二次确认（审查 2-1）：目录会递归 restore/clean，一次影响面大。
  onRequestDiscardConfirm?: (path: string, workspacePath: string) => void;
}

export interface WorkspaceChangesActions {
  menuOpen: boolean;
  menuPosition: { top: number; left: number } | null;
  branchSubOpen: boolean;
  setBranchSubOpen: (open: boolean) => void;
  menuId: string;
  handleNameClick: () => void;
  handleNameContextMenu: (e: React.MouseEvent) => void;
  handleNameKeyDown: (e: React.KeyboardEvent) => void;
  handleMoreClick: (e: React.MouseEvent) => void;
  closeMenu: () => void;
  handleCopyFullPath: () => Promise<void>;
  handleCopyRelativePath: () => Promise<void>;
  handleRevealInFileManager: () => Promise<void>;
  handleHideFromRightPanels: () => void;
  handleRefreshClick: (e: React.MouseEvent) => void;
  wrappedGetContextMenuItems: (
    node: WorkspaceTreeNode,
  ) => FileTreeContextMenuItem<WorkspaceTreeNode>[];
  /** 六个 Git 菜单动作（事项3） */
  handleStageAll: () => Promise<void>;
  handleUnstageAll: () => Promise<void>;
  handleRequestCommit: () => void;
  handlePush: () => Promise<void>;
  handlePull: () => Promise<void>;
  pushPreflightOpen: boolean;
  pushPreflightDirty: boolean;
  pushPreflightHasUpstream: boolean;
  pushPreflightBranch: string;
  handlePushOnly: () => Promise<void>;
  handleCommitAndPush: () => void;
  cancelPushPreflight: () => void;
  handleRequestDiscardAll: () => void;
  commitOpen: boolean;
  commitBusy: boolean;
  commitError: string | undefined;
  submitCommit: (message: string, stageAll: boolean) => Promise<void>;
  closeCommit: () => void;
  discardOpen: boolean;
  confirmDiscardAll: () => Promise<void>;
  closeDiscard: () => void;
  gitBusy: boolean;
  gitBusyLabel: 'push' | 'pull' | null;
  hasChanges: boolean;
  hasStaged: boolean;
}

export function useWorkspaceChangesActions({
  workspace,
  onToggleExpand,
  onHideFromRightPanels,
  onRefreshTree,
  getContextMenuItems,
  onWorkspaceRootClick,
  setRenamingWorkspacePath,
  setDeleteWorkspacePath,
  onRequestDiscardConfirm,
}: UseWorkspaceChangesActionsParams): WorkspaceChangesActions {
  const { t } = useTCopy();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [branchSubOpen, setBranchSubOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitError, setCommitError] = useState<string | undefined>(undefined);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [localGitBusy, setLocalGitBusy] = useState(false);
  const gitBusyLabel = useAppStore((s) => s.gitOpsBusy[workspace.id] ?? null);
  const gitBusy = localGitBusy || gitBusyLabel !== null;
  const [pushPreflight, setPushPreflight] = useState<{
    dirty: boolean;
    hasUpstream: boolean;
    branch: string;
    ahead: number;
  } | null>(null);
  const pushAfterCommitRef = useRef<{ ahead: number; hasUpstream: boolean } | null>(null);
  const menuId = `ws-changes-menu-${workspace.id}`;
  const gitSnapshot = useAppStore((s) => s.gitSnapshots[workspace.id]);
  const hasChanges =
    (gitSnapshot?.staged.length ?? 0) +
      (gitSnapshot?.unstaged.length ?? 0) +
      (gitSnapshot?.untracked.length ?? 0) >
    0;
  const hasStaged = (gitSnapshot?.staged.length ?? 0) > 0;

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('[WorkspaceChangesEntry] clipboard write failed');
    }
  }, []);

  // 按工作区重绑菜单动作（事项2）：面板级 getContextMenuItems 不知节点所属工作区，
  // reveal/复制全路径若回退 currentWorkspace 会在多工作区下作用错目标；
  // Git 项（stage/unstage/discard）本就支持 workspacePath，在此一并绑定。
  // 注：变更面板 showClipboard:false（无 cut/copy/paste）、open-in-files 已移除，
  // 故此处只需处理 git/reveal/copy/rename/delete 五类。
  const wrappedGetContextMenuItems = useCallback(
    (node: WorkspaceTreeNode) => {
      const items = getContextMenuItems(node);
      const result: FileTreeContextMenuItem<WorkspaceTreeNode>[] = [];
      for (const item of items) {
        if (item.separator || !item.action) {
          result.push(item);
          continue;
        }
        if (item.id === 'stage' || item.id === 'unstage' || item.id === 'discard') {
          const isDiscard = item.id === 'discard';
          result.push({
            ...item,
            action: (targetNode: WorkspaceTreeNode) => {
              // 目录级 discard 走二次确认（审查 2-1）；文件级沿用即时执行。
              if (isDiscard && targetNode.kind === 'directory' && onRequestDiscardConfirm) {
                onRequestDiscardConfirm(targetNode.path, workspace.path);
                return;
              }
              const s = useAppStore.getState();
              if (item.id === 'stage') {
                void s.stageWorkspaceFile(targetNode.path, workspace.path);
              } else if (item.id === 'unstage') {
                void s.unstageWorkspaceFile(targetNode.path, workspace.path);
              } else {
                void s.discardWorkspaceFile(targetNode.path, workspace.path);
              }
            },
          } as FileTreeContextMenuItem<WorkspaceTreeNode>);
          continue;
        }
        if (item.id === 'reveal' || item.id === 'copy-full-path') {
          const isReveal = item.id === 'reveal';
          result.push({
            ...item,
            action: (targetNode: WorkspaceTreeNode) => {
              const fullPath = joinPathSegments(workspace.path, targetNode.path);
              if (isReveal) {
                void window.digitalLife.workspace.revealInFileManager(fullPath);
              } else {
                void copyToClipboard(fullPath);
              }
            },
          });
          continue;
        }
        if (item.id === 'rename' || item.id === 'delete') {
          const isRename = item.id === 'rename';
          const originalAction = item.action;
          result.push({
            ...item,
            action: (targetNode: WorkspaceTreeNode) => {
              originalAction?.(targetNode, [targetNode]);
              if (isRename) {
                setRenamingWorkspacePath?.(workspace.path);
              } else {
                setDeleteWorkspacePath?.(workspace.path);
              }
            },
          });
          continue;
        }
        result.push(item);
      }
      return result;
    },
    [
      getContextMenuItems,
      workspace.path,
      copyToClipboard,
      setRenamingWorkspacePath,
      setDeleteWorkspacePath,
      onRequestDiscardConfirm,
    ],
  );

  const handleNameClick = useCallback(() => {
    onToggleExpand();
    onWorkspaceRootClick?.();
  }, [onToggleExpand, onWorkspaceRootClick]);

  const handleNameContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ top: e.clientY, left: e.clientX + 4 });
    setMenuOpen(true);
  }, []);

  const handleMoreClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({ top: rect.top, left: rect.right + 4 });
    setMenuOpen((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuPosition(null);
  }, []);

  const handleCopyFullPath = useCallback(async () => {
    closeMenu();
    await copyToClipboard(workspace.path);
  }, [workspace.path, closeMenu, copyToClipboard]);

  const handleCopyRelativePath = useCallback(async () => {
    closeMenu();
    await copyToClipboard(workspace.name);
  }, [workspace.name, closeMenu, copyToClipboard]);

  const handleRevealInFileManager = useCallback(async () => {
    closeMenu();
    await window.digitalLife.workspace.revealInFileManager(workspace.path);
  }, [workspace.path, closeMenu]);

  const handleHideFromRightPanels = useCallback(() => {
    closeMenu();
    onHideFromRightPanels(workspace.id);
  }, [onHideFromRightPanels, workspace.id, closeMenu]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleNameClick();
      }
    },
    [handleNameClick],
  );

  const handleRefreshClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRefreshTree();
    },
    [onRefreshTree],
  );

  const runGitAction = useCallback(
    async (action: () => Promise<unknown>) => {
      closeMenu();
      setLocalGitBusy(true);
      try {
        await action();
      } finally {
        setLocalGitBusy(false);
      }
    },
    [closeMenu],
  );

  const pushNow = useCallback(
    async (info: { ahead: number; hasUpstream: boolean }) => {
      await runGitAction(() => useAppStore.getState().pushWorkspaceChanges(workspace.path, info));
    },
    [runGitAction, workspace.path],
  );

  const handleStageAll = useCallback(
    () => runGitAction(() => useAppStore.getState().stageAllWorkspaceChanges(workspace.path)),
    [runGitAction, workspace.path],
  );

  const handleUnstageAll = useCallback(
    () => runGitAction(() => useAppStore.getState().unstageAllWorkspaceChanges(workspace.path)),
    [runGitAction, workspace.path],
  );

  /**
   * 推送预检主流程：刷新快照 → 判定脏 → 查 upstream。
   * 独立成可自引用的函数，让「分支列表失败」错误卡的重试按钮能重新走完整预检
   * （只重试 listGitBranches 会绕过脏判定/预检）。
   */
  const beginPush = useCallback(
    async function beginPush() {
      // 先刷新目标工作区快照：预检的「未提交变更」判断不能依赖旧快照。
      await useAppStore
        .getState()
        .refreshGitSnapshot(workspace.id, workspace.path, { silent: true });
      const fresh = useAppStore.getState().gitSnapshots[workspace.id];
      const dirty =
        (fresh?.staged.length ?? 0) +
          (fresh?.unstaged.length ?? 0) +
          (fresh?.untracked.length ?? 0) +
          (fresh?.conflicts.length ?? 0) >
        0;
      const branches = await window.digitalLife.workspace.listGitBranches(workspace.path);
      if (!branches.ok) {
        useAppStore
          .getState()
          .reportError(branches.error.code, branches.error.message, `git:push:${workspace.id}`, {
            level: 'error',
            actions: [
              {
                label: t.changesPushRetry,
                // 重新走完整预检；返回 false 表示“由本次重试推进”，卡片交给
                // 成功清理 / 失败重新上报，不在动作返回时抢先关闭。
                run: async () => {
                  await beginPush();
                  return false;
                },
              },
            ],
          });
        return;
      }
      const current = branches.data.find((branch) => branch.isCurrent);
      const hasUpstream = Boolean(current?.upstream);
      const ahead = current?.ahead ?? 0;
      if (!dirty && hasUpstream) {
        await pushNow({ ahead, hasUpstream });
        return;
      }
      setPushPreflight({
        dirty,
        hasUpstream,
        branch: current?.name ?? '',
        ahead,
      });
    },
    [pushNow, t.changesPushRetry, workspace.id, workspace.path],
  );

  const handlePush = useCallback(async () => {
    closeMenu();
    await beginPush();
  }, [closeMenu, beginPush]);

  const handlePushOnly = useCallback(async () => {
    const info = pushPreflight;
    setPushPreflight(null);
    if (!info) {
      return;
    }
    await pushNow({ ahead: info.ahead, hasUpstream: info.hasUpstream });
  }, [pushPreflight, pushNow]);

  const handleCommitAndPush = useCallback(() => {
    const info = pushPreflight;
    setPushPreflight(null);
    if (!info) {
      return;
    }
    pushAfterCommitRef.current = { ahead: info.ahead, hasUpstream: info.hasUpstream };
    setCommitError(undefined);
    setCommitOpen(true);
  }, [pushPreflight]);

  const cancelPushPreflight = useCallback(() => {
    setPushPreflight(null);
  }, []);

  const handlePull = useCallback(
    () => runGitAction(() => useAppStore.getState().pullWorkspaceChanges(workspace.path)),
    [runGitAction, workspace.path],
  );

  const handleRequestCommit = useCallback(() => {
    closeMenu();
    setCommitError(undefined);
    setCommitOpen(true);
  }, [closeMenu]);

  const handleRequestDiscardAll = useCallback(() => {
    closeMenu();
    setDiscardOpen(true);
  }, [closeMenu]);

  const submitCommit = useCallback(
    async (message: string, stageAll: boolean) => {
      setCommitBusy(true);
      setCommitError(undefined);
      try {
        const failure = await useAppStore
          .getState()
          .commitWorkspaceChanges(message, { stageAll, workspacePath: workspace.path });
        if (failure) {
          setCommitError(failure);
          return;
        }
        setCommitOpen(false);
        const pendingPush = pushAfterCommitRef.current;
        pushAfterCommitRef.current = null;
        if (pendingPush) {
          await pushNow({
            ahead: pendingPush.ahead + 1,
            hasUpstream: pendingPush.hasUpstream,
          });
        }
      } finally {
        setCommitBusy(false);
      }
    },
    [pushNow, workspace.path],
  );

  const closeCommit = useCallback(() => {
    setCommitOpen(false);
    setCommitError(undefined);
    pushAfterCommitRef.current = null;
  }, []);

  const confirmDiscardAll = useCallback(async () => {
    if (gitBusy) {
      return;
    }
    await runGitAction(() => useAppStore.getState().discardAllWorkspaceChanges(workspace.path));
    setDiscardOpen(false);
  }, [gitBusy, runGitAction, workspace.path]);

  const closeDiscard = useCallback(() => {
    setDiscardOpen(false);
  }, []);

  return {
    menuOpen,
    menuPosition,
    branchSubOpen,
    setBranchSubOpen,
    menuId,
    handleNameClick,
    handleNameContextMenu,
    handleNameKeyDown,
    handleMoreClick,
    closeMenu,
    handleCopyFullPath,
    handleCopyRelativePath,
    handleRevealInFileManager,
    handleHideFromRightPanels,
    handleRefreshClick,
    wrappedGetContextMenuItems,
    handleStageAll,
    handleUnstageAll,
    handleRequestCommit,
    handlePush,
    handlePull,
    pushPreflightOpen: pushPreflight !== null,
    pushPreflightDirty: pushPreflight?.dirty ?? false,
    pushPreflightHasUpstream: pushPreflight?.hasUpstream ?? true,
    pushPreflightBranch: pushPreflight?.branch ?? '',
    handlePushOnly,
    handleCommitAndPush,
    cancelPushPreflight,
    handleRequestDiscardAll,
    commitOpen,
    commitBusy,
    commitError,
    submitCommit,
    closeCommit,
    discardOpen,
    confirmDiscardAll,
    closeDiscard,
    gitBusy,
    gitBusyLabel,
    hasChanges,
    hasStaged,
  };
}

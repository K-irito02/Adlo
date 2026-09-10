import { useCallback, useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';

function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx > 0 ? path.slice(0, idx) : '';
}

/**
 * 计算新建文件/文件夹的目标目录：
 * 点击了工作区顶级目录（rootSelected）→ 根目录；
 * 点击了目录节点 → 该目录；点击了文件节点 → 其父目录；
 * 否则回退到当前选中文件的父目录（仅当该文件属于目标工作区，避免跨工作区路径锚定错误），
 * 都没有则代表工作区根目录。
 */
function resolveCreationTargetDir(
  clickedNode: { path: string; kind: 'directory' | 'file' } | undefined,
  selectedFilePath: string | undefined,
  rootSelected: boolean,
  useSelectedFileFallback: boolean,
): string {
  if (rootSelected) {
    return '';
  }
  if (clickedNode) {
    return clickedNode.kind === 'directory' ? clickedNode.path : parentDir(clickedNode.path);
  }
  return useSelectedFileFallback && selectedFilePath ? parentDir(selectedFilePath) : '';
}

/**
 * 计算新建文件/文件夹的目标工作区：
 * 优先取"点击的节点所属工作区"（用户正在操作的工作区），其次取"最后点击的顶级工作区目录"，
 * 再回退到全局激活工作区，最后取第一个最近工作区。绝不能因为点了其它工作区的顶级目录，
 * 就把本应在当前操作工作区创建的文件作用到别的工作区。
 */
function resolveTargetWorkspaceId(input: {
  clickedNode?: { path: string; workspaceId: string; kind: 'directory' | 'file' };
  clickedWorkspaceRoot?: string;
  activeWorkspaceId: string | undefined;
  recentWorkspaces: { id: string; path: string }[];
}): string | undefined {
  if (input.clickedNode) {
    return input.clickedNode.workspaceId;
  }
  if (input.clickedWorkspaceRoot) {
    return input.clickedWorkspaceRoot;
  }
  return input.activeWorkspaceId ?? input.recentWorkspaces[0]?.id;
}

function normalizeCreationPath(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return undefined;
  }
  const normalized = trimmed.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
    return undefined;
  }
  return segments.join('/');
}

interface UseFileCreationInput {
  selectedFilePath: string | undefined;
  /** 编辑器当前打开文件所属的工作区 id（与 selectedFilePath 配套） */
  selectedFileWorkspaceId: string | undefined;
  activeWorkspaceId: string | undefined;
  recentWorkspaces: { id: string; path: string }[];
  clickedNode?: { path: string; workspaceId: string; kind: 'directory' | 'file' };
  /** 最近一次点击选中为"工作区顶级目录"（根目录）的工作区 id */
  clickedWorkspaceRoot?: string;
  onCreateWorkspaceFile: (
    path: string,
    content?: string,
    workspacePath?: string,
  ) => Promise<string | undefined>;
  onCreateWorkspaceFolder: (path: string, workspacePath?: string) => Promise<string | undefined>;
  /** 在指定工作区下展开某条路径链（workspaceId、path） */
  expandFileTreePathChain: (workspaceId: string, path: string) => void;
  /** 在指定工作区下设置某路径的展开态（workspaceId、path、expanded） */
  setFileTreePathExpanded: (workspaceId: string, path: string, expanded: boolean) => void;
}

interface UseFileCreationResult {
  createTarget: 'file' | 'folder' | null;
  createPathValue: string;
  createInputRef: React.RefObject<HTMLInputElement | null>;
  startCreate: (target: 'file' | 'folder') => void;
  cancelCreate: () => void;
  submitCreate: () => Promise<void>;
  setCreatePathValue: (value: string) => void;
}

function useFileCreation(input: UseFileCreationInput): UseFileCreationResult {
  const { t } = useTCopy();
  const [createTarget, setCreateTarget] = useState<'file' | 'folder' | null>(null);
  const [createPathValue, setCreatePathValue] = useState('');
  const createInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!createTarget) {
      return;
    }
    const timer = window.setTimeout(() => {
      createInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [createTarget]);

  const startCreate = useCallback(
    (target: 'file' | 'folder') => {
      // 检查是否有可用的工作区：如果没有可用的工作区，直接显示提示而不是打开对话框。
      const targetWorkspaceId = resolveTargetWorkspaceId(input);
      if (!targetWorkspaceId) {
        useAppStore.getState().showToast(t.fileNoWorkspace as string, 'warning');
        return;
      }
      // 对话框不预填任何路径，仅需用户输入名称。
      setCreateTarget(target);
      setCreatePathValue('');
    },
    [input, t],
  );

  const cancelCreate = useCallback(() => {
    setCreateTarget(null);
    setCreatePathValue('');
  }, []);

  const submitCreate = useCallback(async () => {
    if (!createTarget) {
      return;
    }
    const counted = createPathValue.trim();
    if (!counted) {
      // 用户未填写名称：顶部提示只需“请输入名称”
      useAppStore.getState().showToast(t.fileNameEmpty as string, 'warning');
      return;
    }
    const normalized = normalizeCreationPath(counted);
    if (!normalized) {
      useAppStore.getState().showToast(t.fileNameRequired as string, 'warning');
      return;
    }
    // 新文件/文件夹创建在目标工作区下，显式传入其路径，避免后端回退到
    // "active workspace"（可能未设置）导致创建失败。目标工作区优先取"当前操作的
    // 工作区"（点击的节点所属工作区 / 最后点击的顶级目录），而非全局激活工作区，
    // 避免多工作区场景下把 A 工作区的创建作用到 B 工作区。
    const targetWorkspaceId = resolveTargetWorkspaceId(input);
    if (!targetWorkspaceId) {
      // 无可用目标工作区（无最近工作区/数据不一致）：给出提示，避免对话框静默无响应。
      useAppStore.getState().showToast(t.fileNoWorkspace as string, 'warning');
      return;
    }
    const targetWorkspacePath = input.recentWorkspaces.find(
      (w) => w.id === targetWorkspaceId,
    )?.path;
    if (!targetWorkspacePath) {
      // 目标工作区虽存在但缺少路径（数据不一致）：提示而非静默失败。
      useAppStore.getState().showToast(t.fileNoWorkspacePath as string, 'warning');
      return;
    }
    // 名称创建在目标目录下（点击节点/选中文件所在目录/工作区顶级目录，缺省为工作区根目录）。
    // 根目录选中仅当"最后点击的顶级目录就是目标工作区"且没有更具体的节点选中时成立。
    // 回退到选中文件父目录前，先确认该文件确实属于目标工作区，否则直接落到目标工作区根目录，
    // 避免把文件锚定到与目标工作区不一致的目录结构（跨工作区路径污染）。
    const targetDir = resolveCreationTargetDir(
      input.clickedNode,
      input.selectedFilePath,
      input.clickedWorkspaceRoot === targetWorkspaceId && !input.clickedNode,
      !input.selectedFileWorkspaceId || input.selectedFileWorkspaceId === targetWorkspaceId,
    );
    const relativePath = targetDir ? `${targetDir}/${normalized}` : normalized;
    try {
      if (createTarget === 'file') {
        const created = await input.onCreateWorkspaceFile(
          relativePath,
          undefined,
          targetWorkspacePath,
        );
        if (created) {
          input.expandFileTreePathChain(targetWorkspaceId, created);
        }
      } else {
        const created = await input.onCreateWorkspaceFolder(relativePath, targetWorkspacePath);
        if (created) {
          input.expandFileTreePathChain(targetWorkspaceId, created);
          input.setFileTreePathExpanded(targetWorkspaceId, created, true);
        }
      }
    } catch (error) {
      // store action（createWorkspaceFile/createWorkspaceFolder）已对常规失败给出反馈并返回 undefined；
      // 此处为防御性兜底，捕获桥接层抛出的异常，避免未处理 rejection，同时保证对话框状态收敛。
      console.error('[useFileCreation] submitCreate failed', error);
    } finally {
      cancelCreate();
    }
  }, [createTarget, createPathValue, input, t, cancelCreate]);

  return {
    createTarget,
    createPathValue,
    createInputRef,
    startCreate,
    cancelCreate,
    submitCreate,
    setCreatePathValue,
  };
}

export { useFileCreation, normalizeCreationPath };
export type { UseFileCreationInput, UseFileCreationResult };

import { useCallback, useEffect, useRef, useState } from 'react';

export interface FileHistoryEntry {
  path: string;
  workspaceId: string | undefined;
}

export interface FileHistoryState {
  canGoBack: boolean;
  canGoForward: boolean;
  navigateBack: () => void;
  navigateForward: () => void;
}

function useFileHistory(
  currentFilePath: string | undefined,
  currentWorkspaceId: string | undefined,
  onNavigate: (entry: FileHistoryEntry) => void,
): FileHistoryState {
  const [fileHistory, setFileHistory] = useState<FileHistoryEntry[]>([]);
  const [fileHistoryIndex, setFileHistoryIndex] = useState(-1);
  // 真源镜像：effect 与 navigate 都经此读写，避免 updater 嵌套 setState
  // 与渲染闭包过期（事项 6 复审 N6）。pending 只记住"回退/前进的目标"，
  // 打开失败（落点不变）时不清标记、也不污染后续正常记录（N5）。
  const stateRef = useRef<{ history: FileHistoryEntry[]; index: number }>({
    history: [],
    index: -1,
  });
  const pendingRef = useRef<FileHistoryEntry | null>(null);

  useEffect(() => {
    if (!currentFilePath) {
      return;
    }
    const entry = { path: currentFilePath, workspaceId: currentWorkspaceId };
    const pending = pendingRef.current;
    pendingRef.current = null;
    // 落点与回退/前进目标一致才是导航回放；否则（用户新打开，或上次导航
    // 打开失败）都正常记录，不吞条目。
    if (pending && pending.path === entry.path && pending.workspaceId === entry.workspaceId) {
      return;
    }
    const { history, index } = stateRef.current;
    const base = index >= 0 ? history.slice(0, index + 1) : history;
    const last = base[base.length - 1];
    if (last && last.path === entry.path && last.workspaceId === entry.workspaceId) {
      return;
    }
    const next = [...base, entry];
    stateRef.current = { history: next, index: next.length - 1 };
    setFileHistory(next);
    setFileHistoryIndex(next.length - 1);
  }, [currentFilePath, currentWorkspaceId]);

  const canGoBack = fileHistoryIndex > 0;
  const canGoForward = fileHistoryIndex >= 0 && fileHistoryIndex < fileHistory.length - 1;

  const navigate = useCallback(
    (direction: 'back' | 'forward') => {
      const { history, index } = stateRef.current;
      const nextIndex = direction === 'back' ? index - 1 : index + 1;
      const nextEntry = history[nextIndex];
      if (!nextEntry) {
        return;
      }
      pendingRef.current = nextEntry;
      stateRef.current = { history, index: nextIndex };
      setFileHistoryIndex(nextIndex);
      onNavigate(nextEntry);
    },
    [onNavigate],
  );

  return {
    canGoBack,
    canGoForward,
    navigateBack: () => navigate('back'),
    navigateForward: () => navigate('forward'),
  };
}

export { useFileHistory };

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
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    if (!currentFilePath) {
      return;
    }
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }
    setFileHistory((current) => {
      const base = fileHistoryIndex >= 0 ? current.slice(0, fileHistoryIndex + 1) : current;
      const last = base[base.length - 1];
      if (last && last.path === currentFilePath && last.workspaceId === currentWorkspaceId) {
        return current;
      }
      const next = [...base, { path: currentFilePath, workspaceId: currentWorkspaceId }];
      setFileHistoryIndex(next.length - 1);
      return next;
    });
  }, [currentFilePath, currentWorkspaceId, fileHistoryIndex]);

  const canGoBack = fileHistoryIndex > 0;
  const canGoForward = fileHistoryIndex >= 0 && fileHistoryIndex < fileHistory.length - 1;

  const navigate = useCallback(
    (direction: 'back' | 'forward') => {
      const nextIndex = direction === 'back' ? fileHistoryIndex - 1 : fileHistoryIndex + 1;
      const nextEntry = fileHistory[nextIndex];
      if (!nextEntry) {
        return;
      }
      isNavigatingRef.current = true;
      setFileHistoryIndex(nextIndex);
      onNavigate(nextEntry);
    },
    [fileHistory, fileHistoryIndex, onNavigate],
  );

  return {
    canGoBack,
    canGoForward,
    navigateBack: () => navigate('back'),
    navigateForward: () => navigate('forward'),
  };
}

export { useFileHistory };

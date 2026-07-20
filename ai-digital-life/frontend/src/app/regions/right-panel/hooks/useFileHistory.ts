import { useCallback, useEffect, useRef, useState } from 'react';

export interface FileHistoryState {
  canGoBack: boolean;
  canGoForward: boolean;
  navigateBack: () => void;
  navigateForward: () => void;
}

function useFileHistory(
  currentFilePath: string | undefined,
  onOpenFile: (path: string) => void,
): FileHistoryState {
  const [fileHistory, setFileHistory] = useState<string[]>([]);
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
      if (base[base.length - 1] === currentFilePath) {
        return current;
      }
      const next = [...base, currentFilePath];
      setFileHistoryIndex(next.length - 1);
      return next;
    });
  }, [currentFilePath, fileHistoryIndex]);

  const canGoBack = fileHistoryIndex > 0;
  const canGoForward = fileHistoryIndex >= 0 && fileHistoryIndex < fileHistory.length - 1;

  const navigate = useCallback(
    (direction: 'back' | 'forward') => {
      const nextIndex = direction === 'back' ? fileHistoryIndex - 1 : fileHistoryIndex + 1;
      const nextPath = fileHistory[nextIndex];
      if (!nextPath) {
        return;
      }
      isNavigatingRef.current = true;
      setFileHistoryIndex(nextIndex);
      onOpenFile(nextPath);
    },
    [fileHistory, fileHistoryIndex, onOpenFile],
  );

  return {
    canGoBack,
    canGoForward,
    navigateBack: () => navigate('back'),
    navigateForward: () => navigate('forward'),
  };
}

export { useFileHistory };

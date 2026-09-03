import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import type { TerminalPanelProps } from '../types';
import type { RightPanelProps } from '@regions/RightPanel';

export function useTerminalPanelProps(_panelProps: RightPanelProps): TerminalPanelProps {
  const commandHistory = useAppStore(useShallow((s) => s.commandHistory));
  const appInfo = useAppStore(useShallow((s) => s.appInfo));

  return useMemo(
    () => ({
      commandHistory,
      appInfo,
    }),
    [commandHistory, appInfo],
  );
}

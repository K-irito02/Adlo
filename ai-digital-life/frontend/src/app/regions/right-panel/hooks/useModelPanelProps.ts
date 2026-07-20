import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import type { ModelPanelProps } from '../types';
import type { RightPanelProps } from '@regions/RightPanel';

export function useModelPanelProps(_panelProps: RightPanelProps): ModelPanelProps {
  const modelHealth = useAppStore(useShallow((s) => s.modelHealth));
  const actions = useAppActions();

  const handleRefreshModelHealth = useCallback(() => {
    void actions.refreshModelHealth();
  }, [actions]);

  return useMemo(
    () => ({
      modelHealth,
      onRefreshModelHealth: handleRefreshModelHealth,
    }),
    [modelHealth, handleRefreshModelHealth],
  );
}

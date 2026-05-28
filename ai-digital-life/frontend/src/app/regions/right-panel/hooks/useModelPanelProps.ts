import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../../stores/slicedStore";
import { useAppActions } from "../../../hooks/useAppActions";
import type { ModelPanelProps } from "../types";
import type { RightPanelProps } from "../../RightPanel";

export function useModelPanelProps(panelProps: RightPanelProps): ModelPanelProps {
  const modelHealth = useAppStore(useShallow((s) => s.modelHealth));
  const actions = useAppActions();

  const handleRefreshModelHealth = useCallback(() => {
    void actions.refreshModelHealth();
  }, [actions.refreshModelHealth]);

  return useMemo(() => ({
    t: panelProps.t,
    modelHealth,
    onRefreshModelHealth: handleRefreshModelHealth,
  }), [panelProps.t, modelHealth, handleRefreshModelHealth]);
}

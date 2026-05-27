import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../../stores/slicedStore";
import { useAppActions } from "../../../hooks/useAppActions";
import type { ModelPanelProps } from "../types";
import type { RightPanelProps } from "../../RightPanel";

export function useModelPanelProps(panelProps: RightPanelProps): ModelPanelProps {
  const modelHealth = useAppStore(useShallow((s) => s.modelHealth));
  const actions = useAppActions();

  return {
    t: panelProps.t,
    modelHealth,
    onRefreshModelHealth: () => void actions.refreshModelHealth(),
  };
}

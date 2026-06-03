import { useMemo } from "react";
import type { BrowserPanelProps } from "../types";
import type { RightPanelProps } from "../../RightPanel";

export function useBrowserPanelProps(
  panelProps: RightPanelProps,
  isVisible: boolean
): BrowserPanelProps {
  return useMemo(() => ({ t: panelProps.t, isVisible }), [panelProps.t, isVisible]);
}

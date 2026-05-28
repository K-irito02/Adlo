import { useMemo } from "react";
import type { BrowserPanelProps } from "../types";
import type { RightPanelProps } from "../../RightPanel";

export function useBrowserPanelProps(panelProps: RightPanelProps): BrowserPanelProps {
  return useMemo(() => ({ t: panelProps.t }), [panelProps.t]);
}

import type { BrowserPanelProps } from "../types";
import type { RightPanelProps } from "../../RightPanel";

export function useBrowserPanelProps(panelProps: RightPanelProps): BrowserPanelProps {
  return { t: panelProps.t };
}

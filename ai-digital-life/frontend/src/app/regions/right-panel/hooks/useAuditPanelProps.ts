import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../../stores/slicedStore";
import type { AuditPanelProps } from "../types";
import type { RightPanelProps } from "../../RightPanel";

export function useAuditPanelProps(panelProps: RightPanelProps): AuditPanelProps {
  const auditEntries = useAppStore(useShallow((s) => s.auditEntries));

  return useMemo(() => ({
    t: panelProps.t,
    auditEntries,
  }), [panelProps.t, auditEntries]);
}

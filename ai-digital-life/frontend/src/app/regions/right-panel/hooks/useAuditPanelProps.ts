import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import type { AuditPanelProps } from '../types';
import type { RightPanelProps } from '@regions/RightPanel';

export function useAuditPanelProps(_panelProps: RightPanelProps): AuditPanelProps {
  const auditEntries = useAppStore(useShallow((s) => s.auditEntries));

  return useMemo(
    () => ({
      auditEntries,
    }),
    [auditEntries]
  );
}

import { useState, useCallback, useMemo } from 'react';
import type { ChangeFileState, ChangeEntry } from '@regions/right-panel/changesTree';
import { computeFilteredChangeEntries } from './useChangesPanelStateUtils';

export function useChangesPanelFilters(changeEntries: ChangeEntry[]) {
  const [changesStatusFilter, setChangesStatusFilter] = useState<Set<ChangeFileState>>(
    () => new Set(),
  );

  const filteredChangeEntries = useMemo(
    () => computeFilteredChangeEntries(changeEntries, changesStatusFilter),
    [changeEntries, changesStatusFilter],
  );

  const onStatusFilterClick = useCallback((filter: ChangeFileState) => {
    setChangesStatusFilter((current) => {
      const next = new Set(current);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }, []);

  return {
    changesStatusFilter,
    filteredChangeEntries,
    onStatusFilterClick,
  };
}

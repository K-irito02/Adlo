import { useCallback, useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { ChangeFileState, ChangeEntry } from '@regions/right-panel/changesTree';
import { computeFilteredChangeEntries } from './useChangesPanelStateUtils';

export function useChangesPanelFilters(changeEntries: ChangeEntry[]) {
  // 状态过滤器上提 store（`adl:changes.statusFilter`，Task 22/23 同形）：
  // 对外 API 不变，调用方仍拿到 Set 与 toggle 回调。
  const changesStatusFilter = useAppStore((s) => s.changesStatusFilter);
  const toggleChangesStatusFilter = useAppStore((s) => s.toggleChangesStatusFilter);

  const filteredChangeEntries = useMemo(
    () => computeFilteredChangeEntries(changeEntries, changesStatusFilter),
    [changeEntries, changesStatusFilter],
  );

  const onStatusFilterClick = useCallback(
    (filter: ChangeFileState) => {
      toggleChangesStatusFilter(filter);
    },
    [toggleChangesStatusFilter],
  );

  return {
    changesStatusFilter,
    filteredChangeEntries,
    onStatusFilterClick,
  };
}

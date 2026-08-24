import { BrowserOpenTabFlatList } from './BrowserOpenTabFlatList';
import type { BrowserTabState } from '@stores/slices/browserSlice';

export interface BrowserNavOpenModeProps {
  browserTabs: BrowserTabState[];
  activeTabId: string;
  evictedTabIds?: ReadonlySet<string>;
  loadingTabId?: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function BrowserNavOpenMode({
  browserTabs,
  activeTabId,
  evictedTabIds,
  loadingTabId,
  onSelectTab,
  onCloseTab,
}: BrowserNavOpenModeProps) {
  return (
    <BrowserOpenTabFlatList
      browserTabs={browserTabs}
      activeTabId={activeTabId}
      onSelectTab={onSelectTab}
      onCloseTab={onCloseTab}
      evictedTabIds={evictedTabIds}
      loadingTabId={loadingTabId}
    />
  );
}

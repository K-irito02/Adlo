import { BrowserOpenTabFlatList } from './BrowserOpenTabFlatList';
import type { BrowserTabState } from '@stores/slices/browserSlice';

export interface BrowserNavOpenModeProps {
  browserTabs: BrowserTabState[];
  activeTabId: string;
  evictedTabIds?: ReadonlySet<string>;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRefreshTab?: (tabId: string, url: string) => void;
  onCopyTabLink?: (url: string) => void;
}

export function BrowserNavOpenMode({
  browserTabs,
  activeTabId,
  evictedTabIds,
  onSelectTab,
  onCloseTab,
  onRefreshTab,
  onCopyTabLink,
}: BrowserNavOpenModeProps) {
  return (
    <BrowserOpenTabFlatList
      browserTabs={browserTabs}
      activeTabId={activeTabId}
      onSelectTab={onSelectTab}
      onCloseTab={onCloseTab}
      onRefreshTab={onRefreshTab}
      onCopyTabLink={onCopyTabLink}
      evictedTabIds={evictedTabIds}
    />
  );
}

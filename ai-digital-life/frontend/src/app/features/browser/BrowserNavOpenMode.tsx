import React from 'react';
import { BrowserOpenTabFlatList } from './BrowserOpenTabFlatList';
import type { BrowserTabState } from '@stores/slices/browserSlice';

export interface BrowserNavOpenModeProps {
  browserTabs: BrowserTabState[];
  activeTabId: string;
  evictedTabIds?: ReadonlySet<string>;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function BrowserNavOpenMode({
  browserTabs,
  activeTabId,
  evictedTabIds,
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
    />
  );
}

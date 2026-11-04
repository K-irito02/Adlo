import { BrowserOpenTabFlatListItem } from './BrowserOpenTabFlatListItem';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { useTCopy } from '@i18n/useTCopy';
import type { BrowserTabState } from '@stores/slices/browserSlice';

interface BrowserOpenTabFlatListProps {
  browserTabs: BrowserTabState[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRefreshTab?: (tabId: string, url: string) => void;
  onCopyTabLink?: (url: string) => void;
  evictedTabIds?: ReadonlySet<string>;
}

export function BrowserOpenTabFlatList({
  browserTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onRefreshTab,
  onCopyTabLink,
  evictedTabIds,
}: BrowserOpenTabFlatListProps) {
  const { t } = useTCopy();

  if (browserTabs.length === 0) {
    return (
      <div className="adl-multitree__empty">
        <p className="adl-empty-hint">{t.browserOpenTabsEmpty}</p>
      </div>
    );
  }

  return (
    <CustomScrollArea
      shellClassName="adl-multitree adl-multitree--browser"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      <div className="adl-browser-entry__tree adl-browser-entry__tree--flat">
        <ul className="adl-filetree" role="tree">
          {browserTabs.map((tab) => (
            <BrowserOpenTabFlatListItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isEvicted={evictedTabIds?.has(tab.id) ?? false}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onRefreshTab={onRefreshTab}
              onCopyTabLink={onCopyTabLink}
            />
          ))}
        </ul>
      </div>
    </CustomScrollArea>
  );
}

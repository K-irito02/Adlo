import { BrowserOpenTabFlatListItem } from './BrowserOpenTabFlatListItem';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { useTCopy } from '@i18n/useTCopy';
import type { BrowserTabState } from '@stores/slices/browserSlice';

interface BrowserOpenTabFlatListProps {
  browserTabs: BrowserTabState[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  evictedTabIds?: ReadonlySet<string>;
  loadingTabId?: string | null;
}

export function BrowserOpenTabFlatList({
  browserTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  evictedTabIds,
  loadingTabId,
}: BrowserOpenTabFlatListProps) {
  const { t } = useTCopy();

  if (browserTabs.length === 0) {
    return (
      <div className="adl-multitree__empty">
        <p className="adl-empty-hint">{t.noContent}</p>
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
              isLoading={loadingTabId != null && loadingTabId === tab.id}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
            />
          ))}
        </ul>
      </div>
    </CustomScrollArea>
  );
}

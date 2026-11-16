import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrowserOpenTabFlatListItem } from './BrowserOpenTabFlatListItem';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { useTCopy } from '@i18n/useTCopy';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { useOpenTabReorder } from './useOpenTabReorder';

interface BrowserOpenTabFlatListProps {
  browserTabs: BrowserTabState[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRefreshTab?: (tabId: string, url: string) => void;
  onCopyTabLink?: (url: string) => void;
  onReorderTabs?: (tabs: BrowserTabState[]) => void;
  evictedTabIds?: ReadonlySet<string>;
}

export function BrowserOpenTabFlatList({
  browserTabs: panelTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onRefreshTab,
  onCopyTabLink,
  onReorderTabs,
  evictedTabIds,
}: BrowserOpenTabFlatListProps) {
  const { t } = useTCopy();
  const handleReorder = useCallback(
    (tabs: BrowserTabState[]) => {
      onReorderTabs?.(tabs);
    },
    [onReorderTabs],
  );
  const reorder = useOpenTabReorder(panelTabs, handleReorder);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [dropLine, setDropLine] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  // 插入线必须 portal 到 body 并高于抬起副本（z-index 10000）：
  // 留在列表里会被 ghost 覆盖（只在新行上方 2px 处，整行宽的 ghost 会挡住它），
  // 也会让 <ul> 的 flex gap 随落点变化产生抖动。
  const updateDropLine = useCallback(() => {
    const overIndex = reorder.overIndex;
    const list = listRef.current;
    if (overIndex == null || !list) {
      setDropLine(null);
      return;
    }
    const rows = list.querySelectorAll<HTMLElement>('[data-tab-index]');
    if (rows.length === 0) {
      setDropLine(null);
      return;
    }
    const isEnd = overIndex >= rows.length;
    const target = isEnd ? rows[rows.length - 1] : rows[overIndex];
    const rect = target.getBoundingClientRect();
    setDropLine({
      top: (isEnd ? rect.bottom : rect.top) - 1,
      left: rect.left + 8,
      width: Math.max(40, rect.width - 16),
    });
  }, [reorder.overIndex]);

  useLayoutEffect(() => {
    updateDropLine();
  }, [updateDropLine]);

  useEffect(() => {
    if (reorder.overIndex == null) {
      return;
    }
    const scroller = listRef.current?.closest<HTMLElement>('.adl-multitree-scroll');
    const handler = () => updateDropLine();
    scroller?.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler);
    return () => {
      scroller?.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, [reorder.overIndex, updateDropLine]);

  // 该列表只承载面板标签（调用方已按 isPanelTab 过滤）。
  if (panelTabs.length === 0) {
    return (
      <div className="adl-multitree__empty">
        <p className="adl-empty-hint">{t.browserOpenTabsEmpty}</p>
      </div>
    );
  }

  const pinnedCount = reorder.visibleTabs.filter((tab) => tab.isPinned).length;
  const showPinnedDivider = pinnedCount > 0 && pinnedCount < reorder.visibleTabs.length;

  return (
    <>
      <CustomScrollArea
        shellClassName="adl-multitree adl-multitree--browser"
        scrollClassName="adl-multitree-scroll"
        scrollbarClassName="adl-multitree-scrollbar"
        thumbClassName="adl-multitree-scrollbar__thumb"
      >
        <div className="adl-browser-entry__tree adl-browser-entry__tree--flat">
          <ul
            ref={listRef}
            className="adl-filetree"
            role="tree"
            onClickCapture={reorder.handlers.onClickCapture}
          >
            {reorder.visibleTabs.map((tab, index) => (
              <Fragment key={tab.id}>
                {showPinnedDivider && index === pinnedCount ? (
                  <li className="adl-browser-pinned-divider" aria-hidden="true">
                    {t.browserPinnedGroupLabel}
                  </li>
                ) : null}
                <BrowserOpenTabFlatListItem
                  tab={tab}
                  index={index}
                  isActive={tab.id === activeTabId}
                  isEvicted={evictedTabIds?.has(tab.id) ?? false}
                  onSelectTab={onSelectTab}
                  onCloseTab={onCloseTab}
                  onRefreshTab={onRefreshTab}
                  onCopyTabLink={onCopyTabLink}
                  onPointerDown={reorder.handlers.onPointerDown}
                />
              </Fragment>
            ))}
            <li className="adl-browser-tab-end" aria-hidden="true" data-tab-end="true" />
          </ul>
        </div>
      </CustomScrollArea>
      {dropLine
        ? createPortal(
            <div
              className="adl-browser-tab-drop-line-overlay"
              aria-hidden="true"
              style={{ top: dropLine.top, left: dropLine.left, width: dropLine.width }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

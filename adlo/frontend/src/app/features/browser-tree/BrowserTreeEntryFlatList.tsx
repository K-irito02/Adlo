import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconClose, IconMoreVertical, IconRefreshCw } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { BrowserFavicon } from '@components/BrowserFavicon';
import { BrowserAudioIndicator } from '@components/BrowserAudioIndicator';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { BrowserTreeNode } from './types';
import type { FlatItem } from './browserTreeEntryUtils';
import { faviconPropsForNode } from './browserTreeFavicon';

interface BrowserTreeEntryFlatListProps {
  flatItems: FlatItem[];
  selectedTreePath: string | null;
  onFlatTabClick: (node: BrowserTreeNode) => void;
  onTabContextMenu: (x: number, y: number, node: BrowserTreeNode) => void;
  onRefreshTab: (tabId: string | undefined, url: string) => void;
  onCloseTab?: (tabId: string) => void;
}

/**
 * 扁平列表首屏渲染行数，滚动接近底部时按页追加。
 *
 * 「书签列表」会把目录内全部书签（以及历史）摊平；导入几百上千条时一次性挂载
 * 全部行 + 每行一个 favicon 订阅会阻塞主线程，切换模式要等很久（2026-11-15
 * 用户反馈）。窗口化后首屏固定成本，滚动再增量渲染。
 */
export const FLAT_LIST_PAGE_SIZE = 80;

export const BrowserTreeEntryFlatList = React.memo(function BrowserTreeEntryFlatList({
  flatItems,
  selectedTreePath,
  onFlatTabClick,
  onTabContextMenu,
  onRefreshTab,
  onCloseTab,
}: BrowserTreeEntryFlatListProps) {
  const { t } = useTCopy();
  const [visibleCount, setVisibleCount] = useState(FLAT_LIST_PAGE_SIZE);
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  // 列表**身份**签名（不含节点对象身份）：树在站点元数据/标签更新时会整棵重建，
  // `flatItems` 数组身份随之变化，但目录/模式/搜索词未变时不该把窗口收回首屏。
  // 用路径/分隔符文案拼接签名：成员的增删/换序会重置窗口；同一成员的行内
  // 内容（标题/URL/图标）变化不重置（那不是列表身份变化）。
  const listSignature = useMemo(
    () =>
      flatItems
        .map((item) => (item.type === 'tab' ? `t:${item.node.path}` : `s:${item.label}`))
        .join('\u0000'),
    [flatItems],
  );

  // 列表内容变化（切换目录/切换模式/搜索词变化）时回到首屏窗口。
  // 在 layout 阶段执行，避免先按旧的大窗口多画一帧。
  useLayoutEffect(() => {
    setVisibleCount(FLAT_LIST_PAGE_SIZE);
  }, [listSignature]);

  // 哨兵进入视口时追加下一页；无 IntersectionObserver（SSR/老环境）时直接全量。
  useEffect(() => {
    if (visibleCount >= flatItems.length) {
      return;
    }
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisibleCount(flatItems.length);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => Math.min(count + FLAT_LIST_PAGE_SIZE, flatItems.length));
        }
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleCount, flatItems.length]);

  // 数据行（不含分隔符）及其位置：供窗口化选中项兜底与 a11y 计数。
  const tabItems = useMemo(
    () =>
      flatItems.filter((item): item is Extract<FlatItem, { type: 'tab' }> => item.type === 'tab'),
    [flatItems],
  );
  const positionByPath = useMemo(
    () => new Map(tabItems.map((item, index) => [item.node.path, index] as const)),
    [tabItems],
  );
  // 选中项可能在第 80 行之后：窗口必须至少覆盖它，否则切到列表模式后看不到选中反馈。
  const selectedIndex = selectedTreePath ? positionByPath.get(selectedTreePath) : undefined;
  const effectiveVisibleCount =
    selectedIndex === undefined ? visibleCount : Math.max(visibleCount, selectedIndex + 1);
  const visibleItems = useMemo(
    () => flatItems.slice(0, effectiveVisibleCount),
    [flatItems, effectiveVisibleCount],
  );

  const handleRowClick = useCallback(
    (node: BrowserTreeNode) => () => onFlatTabClick(node),
    [onFlatTabClick],
  );

  const handleRowContextMenu = useCallback(
    (node: BrowserTreeNode) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onTabContextMenu(e.clientX, e.clientY, node);
    },
    [onTabContextMenu],
  );

  const handleMoreClick = useCallback(
    (node: BrowserTreeNode) => (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onTabContextMenu(rect.right + 4, rect.top, node);
    },
    [onTabContextMenu],
  );

  const handleRefreshClick = useCallback(
    (node: BrowserTreeNode) => (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.url) {
        onRefreshTab(node.tabId, node.url);
      }
    },
    [onRefreshTab],
  );

  const handleCloseClick = useCallback(
    (node: BrowserTreeNode) => (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.tabId && onCloseTab) {
        onCloseTab(node.tabId);
      }
    },
    [onCloseTab],
  );

  return (
    <div className="adl-browser-entry__tree adl-browser-entry__tree--flat">
      <ul className="adl-filetree" role="tree">
        {visibleItems.map((item) => {
          if (item.type === 'separator') {
            return (
              <li
                key={`sep-${item.label}`}
                className="adl-browser-entry__flat-separator"
                role="separator"
              >
                <span className="adl-browser-entry__flat-sep-line adl-browser-entry__flat-sep-line--left" />
                <span className="adl-browser-entry__flat-sep-text">{item.label}</span>
                <span className="adl-browser-entry__flat-sep-line adl-browser-entry__flat-sep-line--right" />
              </li>
            );
          }
          const isTabSelected = selectedTreePath === item.node.path;
          const tabBtns = [
            ...(onCloseTab
              ? [
                  {
                    id: 'close' as const,
                    label: t.browserClose,
                    icon: <IconClose size={12} decorative />,
                    isClose: true,
                  },
                ]
              : []),
            {
              id: 'refresh' as const,
              label: t.browserRefreshMeta,
              icon: <IconRefreshCw size={12} decorative />,
            },
            {
              id: 'more' as const,
              label: t.browserContextMore,
              icon: <IconMoreVertical size={12} decorative />,
            },
          ];
          return (
            <li
              key={item.node.path}
              className={`adl-filetree__item adl-filetree__node--file${isTabSelected ? ' is-selected' : ''}`}
              data-path={item.node.path}
              role="treeitem"
              aria-setsize={tabItems.length}
              aria-posinset={(positionByPath.get(item.node.path) ?? 0) + 1}
            >
              <div
                className="adl-filetree__row"
                onClick={handleRowClick(item.node)}
                onContextMenu={handleRowContextMenu(item.node)}
              >
                <span
                  className="adl-filetree__indent adl-filetree__indent--flat"
                  aria-hidden="true"
                />
                <BrowserFavicon {...faviconPropsForNode(item.node)} />
                {(item.node.isPlayingAudio || item.node.isAudioMuted) && (
                  <BrowserAudioIndicator
                    isPlaying={item.node.isPlayingAudio ?? false}
                    isMuted={item.node.isAudioMuted ?? false}
                    onToggleMute={() => {
                      const tabId = item.node.associatedTabId ?? item.node.tabId;
                      if (tabId) {
                        const store = useAppStore.getState();
                        const nextMuted = !store.browserTabsById[tabId]?.isAudioMuted;
                        store.browserToggleTabMute(tabId);
                        window.digitalLife?.browser?.muteTab?.(tabId, nextMuted);
                      }
                    }}
                  />
                )}
                <button
                  type="button"
                  className="adl-filetree__label"
                  onClick={handleRowClick(item.node)}
                >
                  <span className="adl-filetree__label-content">
                    <span className="adl-filetree__label-text">{item.node.name}</span>
                  </span>
                </button>
                <span className="adl-filetree__meta adl-tree-node__meta--inline">
                  <span className="adl-browser-node__actions">
                    {tabBtns.map((btn) => (
                      <TooltipSimple key={btn.id} content={btn.label} placement="top">
                        <button
                          type="button"
                          className={`adl-icon-btn adl-icon-btn--xs${btn.isClose ? ' adl-icon-btn--danger-hover' : ''}`}
                          onClick={
                            btn.id === 'close'
                              ? handleCloseClick(item.node)
                              : btn.id === 'more'
                                ? handleMoreClick(item.node)
                                : handleRefreshClick(item.node)
                          }
                          aria-label={btn.label}
                        >
                          {btn.icon}
                        </button>
                      </TooltipSimple>
                    ))}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
        {visibleItems.length < flatItems.length ? (
          <li
            ref={sentinelRef}
            className="adl-browser-entry__flat-sentinel"
            aria-hidden="true"
            style={{ height: 1, listStyle: 'none' }}
          />
        ) : null}
      </ul>
    </div>
  );
});

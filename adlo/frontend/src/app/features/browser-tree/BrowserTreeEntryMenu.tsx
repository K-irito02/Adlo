import { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { isUrlBookmarked } from '@utils/browserDisplayUtils';
import { useOpenInCenterAction } from '@features/browser/useOpenInCenterAction';
import { getTabContextMenuItems } from './browserEntrySubEntriesUtils';
import { useHintCard, HintCard } from '../../components/HintCard';
import { useClampedMenuPosition } from '@features/tree/treeEntryMenus';
import type { BrowserTreeNode } from './types';
import type { SectionCallbacks } from './BrowserCategorySection';
import type { CopyDict } from '@i18n';

interface TreeMenuViewItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  danger?: boolean;
  hint?: string;
  action: () => void;
}

interface UseBrowserTreeEntryMenuInput {
  node: BrowserTreeNode;
  callbacks: SectionCallbacks;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  menuPosition: { top: number; left: number } | null;
  contextMenuForTab: { x: number; y: number; node: BrowserTreeNode } | null;
  setContextMenuForTab: (ctx: { x: number; y: number; node: BrowserTreeNode } | null) => void;
  entryBtnRef: React.MutableRefObject<{ [key: string]: HTMLButtonElement | null }>;
  menuId: string;
  entryMenuItems: TreeMenuViewItem[];
  t: CopyDict;
}

export interface BrowserTreeEntryMenuSlots {
  entryMenuSlot: React.ReactNode;
  tabContextMenuSlot: React.ReactNode;
}

export function useBrowserTreeEntryMenu({
  node,
  callbacks,
  menuOpen,
  setMenuOpen,
  menuPosition,
  contextMenuForTab,
  setContextMenuForTab,
  entryBtnRef,
  menuId,
  entryMenuItems,
  t,
}: UseBrowserTreeEntryMenuInput): BrowserTreeEntryMenuSlots {
  const {
    hintState,
    showHint: showHintCard,
    hideHint,
    scheduleHide,
    hintCardProps,
  } = useHintCard();

  const { openUrlInCenter, moveTabToCenter } = useOpenInCenterAction();

  // 两处 portal 菜单视口钳制（事项 15）：底部行右键不再被应用下边缘裁剪。
  const entryMenuPosition = useMemo(
    () => (menuOpen && menuPosition ? { top: menuPosition.top, left: menuPosition.left } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅坐标参与钳制，对象整体入 deps 会每渲染换身份
    [menuOpen, menuPosition?.top, menuPosition?.left],
  );
  const entryMenuClamp = useClampedMenuPosition(entryMenuPosition);
  const tabMenuPosition = useMemo(
    () => (contextMenuForTab ? { top: contextMenuForTab.y, left: contextMenuForTab.x } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅坐标参与钳制，对象整体入 deps 会每渲染换身份
    [contextMenuForTab?.x, contextMenuForTab?.y],
  );
  const tabMenuClamp = useClampedMenuPosition(tabMenuPosition);

  const showNodeInCenter = useCallback(
    (target: BrowserTreeNode) => {
      if (target.tabId) {
        moveTabToCenter(target.tabId);
      } else if (target.url) {
        openUrlInCenter(target.url, target.name);
      }
    },
    [moveTabToCenter, openUrlInCenter],
  );

  const handleShowHint = useCallback(
    (e: React.MouseEvent, hintText: string) => {
      const buttonEl = (e.target as HTMLElement).closest('button');
      const originalTitle = buttonEl?.getAttribute('title');
      if (originalTitle) {
        buttonEl?.setAttribute('data-original-title', originalTitle);
        buttonEl?.removeAttribute('title');
      }
      const btnRect = buttonEl?.getBoundingClientRect();
      if (btnRect) {
        showHintCard(hintText, btnRect);
      }
    },
    [showHintCard],
  );

  const handleMenuItemClick = useCallback(
    (action: () => void) => () => {
      action();
      setMenuOpen(false);
      hideHint();
    },
    [setMenuOpen, hideHint],
  );

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
      const btn = entryBtnRef.current['more'];
      if (btn?.contains(target)) {
        return;
      }
      if (menuEl?.contains(target)) {
        return;
      }
      setMenuOpen(false);
      hideHint();
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        hideHint();
      }
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escHandler);
      hideHint();
    };
  }, [menuOpen, menuId, setMenuOpen, hideHint, entryBtnRef]);

  const handleTabMenuAction = useCallback(
    (fn: () => void) => () => {
      fn();
      setContextMenuForTab(null);
      hideHint();
    },
    [setContextMenuForTab, hideHint],
  );

  // 两处 portal 菜单共用同一套按钮渲染，避免再次出现「列表菜单复制漂移」。
  const renderMenuButtons = useCallback(
    (items: TreeMenuViewItem[], wrapClick: (action: () => void) => () => void) =>
      items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
          role="menuitem"
          onClick={wrapClick(item.action)}
        >
          {item.icon ? <span className="adl-sidebar-menu__icon">{item.icon}</span> : null}
          <span>{item.label}</span>
          {item.badge ? <span className="adl-menu-item__badge">{item.badge}</span> : null}
          {item.hint ? (
            <span
              className={`adl-menu-item__hint${item.danger ? ' is-danger' : ''}`}
              onMouseEnter={(e) => handleShowHint(e, item.hint!)}
              onMouseLeave={scheduleHide}
            >
              !
            </span>
          ) : null}
        </button>
      )),
    [handleShowHint, scheduleHide],
  );

  useEffect(() => {
    if (!contextMenuForTab) {
      return;
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const menuEl = document.querySelector('[data-menu-id="browser-tab-context-menu"]');
      if (menuEl?.contains(target)) {
        return;
      }
      setContextMenuForTab(null);
      hideHint();
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuForTab(null);
        hideHint();
      }
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escHandler);
      hideHint();
    };
  }, [contextMenuForTab, setContextMenuForTab, hideHint]);

  const entryMenuViewItems: TreeMenuViewItem[] = [
    ...entryMenuItems,
    ...(node.url || node.tabId
      ? [
          {
            id: 'show-in-center',
            label: t.centerTabShowInCenter,
            action: () => showNodeInCenter(node),
          },
        ]
      : []),
  ];

  // 列表模式右键菜单与树模式共用同一套叶子项；「显示」插在危险项「删除」之前，
  // 避免菜单末尾出现「删除 → 显示」的反常顺序。
  const tabMenuViewItems: TreeMenuViewItem[] = contextMenuForTab
    ? (() => {
        const node = contextMenuForTab.node;
        const items: TreeMenuViewItem[] = getTabContextMenuItems(
          node,
          callbacks,
          t,
          isUrlBookmarked(useAppStore.getState().browserBookmarks, node.url),
        );
        if (node.nodeType !== 'tab') {
          return items;
        }
        const showItem: TreeMenuViewItem = {
          id: 'show-in-center',
          label: t.centerTabShowInCenter,
          action: () => showNodeInCenter(node),
        };
        const deleteIndex = items.findIndex((item) => item.id === 'delete');
        return deleteIndex < 0
          ? [...items, showItem]
          : [...items.slice(0, deleteIndex), showItem, ...items.slice(deleteIndex)];
      })()
    : [];

  const entryMenuSlot =
    menuOpen && entryMenuPosition
      ? createPortal(
          <>
            <div
              ref={entryMenuClamp.menuRef}
              className="adl-multitree-entry__menu"
              role="menu"
              data-menu-id={menuId}
              style={
                entryMenuClamp.adjusted
                  ? { top: entryMenuClamp.adjusted.top, left: entryMenuClamp.adjusted.left }
                  : { top: entryMenuPosition.top, left: entryMenuPosition.left }
              }
            >
              {renderMenuButtons(entryMenuViewItems, handleMenuItemClick)}
            </div>
            <HintCard {...hintCardProps} placement="right">
              {hintState?.content}
            </HintCard>
          </>,
          document.body,
        )
      : null;

  const tabContextMenuSlot = contextMenuForTab
    ? createPortal(
        <>
          <div
            ref={tabMenuClamp.menuRef}
            className="adl-multitree-entry__menu"
            role="menu"
            data-menu-id="browser-tab-context-menu"
            style={
              tabMenuClamp.adjusted
                ? { top: tabMenuClamp.adjusted.top, left: tabMenuClamp.adjusted.left }
                : { top: contextMenuForTab.y, left: contextMenuForTab.x }
            }
          >
            {renderMenuButtons(tabMenuViewItems, handleTabMenuAction)}
          </div>
          <HintCard {...hintCardProps} placement="right">
            {hintState?.content}
          </HintCard>
        </>,
        document.body,
      )
    : null;

  return { entryMenuSlot, tabContextMenuSlot };
}

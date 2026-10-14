import { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { useOpenInCenterAction } from '@features/browser/useOpenInCenterAction';
import { handleBookmarkToggle } from './browserEntrySubEntriesUtils';
import { useHintCard, HintCard } from '../../components/HintCard';
import { useClampedMenuPosition } from '@features/tree/treeEntryMenus';
import type { BrowserTreeNode } from './types';
import type { SectionCallbacks } from './BrowserCategorySection';
import type { CopyDict } from '@i18n';

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
  entryMenuItems: {
    id: string;
    label: string;
    badge?: string;
    danger?: boolean;
    hint?: string;
    action: () => void;
  }[];
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
              {[
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
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                  role="menuitem"
                  onClick={handleMenuItemClick(item.action)}
                >
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
              ))}
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
            {[
              {
                id: 'open-current',
                label: t.browserContextOpenCurrent,
                action: () => {
                  if (contextMenuForTab.node.tabId) {
                    callbacks.onOpenTabInCurrentTab(contextMenuForTab.node.tabId);
                  }
                  setContextMenuForTab(null);
                },
              },
              {
                id: 'open-new',
                label: t.browserContextOpenNewTab,
                action: () => {
                  if (contextMenuForTab.node.url) {
                    callbacks.onOpenTabInNewTab(
                      contextMenuForTab.node.url,
                      contextMenuForTab.node.isSavedBookmark
                        ? undefined
                        : contextMenuForTab.node.name,
                    );
                  }
                  setContextMenuForTab(null);
                },
              },
              {
                id: 'show-in-center',
                label: t.centerTabShowInCenter,
                action: () => {
                  showNodeInCenter(contextMenuForTab.node);
                  setContextMenuForTab(null);
                },
              },
              {
                id: 'refresh',
                label: t.browserRefreshMeta,
                hint: t.browserRefreshMetaHint,
                action: () => {
                  if (contextMenuForTab.node.tabId && contextMenuForTab.node.url) {
                    callbacks.onRefreshTab(
                      contextMenuForTab.node.tabId,
                      contextMenuForTab.node.url,
                    );
                  }
                  setContextMenuForTab(null);
                },
              },
              {
                id: 'edit',
                label: t.browserContextEdit,
                action: () => {
                  if (contextMenuForTab.node.tabId && contextMenuForTab.node.url) {
                    callbacks.onEditTab(
                      contextMenuForTab.node.tabId,
                      contextMenuForTab.node.name,
                      contextMenuForTab.node.url,
                    );
                  }
                  setContextMenuForTab(null);
                },
              },
              {
                id: 'copy-link',
                label: t.browserContextCopyLink,
                action: () => {
                  if (contextMenuForTab.node.url) {
                    callbacks.onCopyTabLink(contextMenuForTab.node.url);
                  }
                  setContextMenuForTab(null);
                },
              },
              {
                id: 'bookmark-toggle',
                label:
                  contextMenuForTab.node.url &&
                  useAppStore
                    .getState()
                    .browserBookmarks.some(
                      (b) =>
                        b.url === contextMenuForTab.node.url &&
                        b.title === contextMenuForTab.node.name,
                    )
                    ? t.browserUnbookmark
                    : t.browserBookmark,
                action: () => {
                  handleBookmarkToggle(
                    contextMenuForTab.node.url ?? '',
                    contextMenuForTab.node.name,
                    contextMenuForTab.node.tabId,
                  );
                  setContextMenuForTab(null);
                },
              },
              {
                id: 'delete',
                label: t.browserContextDelete,
                danger: true,
                action: () => {
                  if (contextMenuForTab.node.tabId && contextMenuForTab.node.url) {
                    if (contextMenuForTab.node.isSavedBookmark) {
                      callbacks.onRemoveBookmarkTab?.(
                        contextMenuForTab.node.tabId,
                        contextMenuForTab.node.url,
                      );
                    } else {
                      callbacks.onDeleteTab(
                        contextMenuForTab.node.tabId,
                        contextMenuForTab.node.url,
                      );
                    }
                  }
                  setContextMenuForTab(null);
                },
              },
            ].map(
              (item: {
                id: string;
                label: string;
                badge?: string;
                danger?: boolean;
                hint?: string;
                action: () => void;
              }) => (
                <button
                  key={item.id}
                  type="button"
                  className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                  role="menuitem"
                  onClick={handleTabMenuAction(item.action)}
                >
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
              ),
            )}
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

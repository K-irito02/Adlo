import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@stores/slicedStore';
import { handleBookmarkToggle } from './browserEntrySubEntriesUtils';
import { HINT_CLOSE_DELAY_MS } from '../../components/HintCardTrigger';
import { renderHintCard } from '../../utils/renderHintCard';
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
  node: _node,
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
  const hintElementsRef = useRef<HTMLElement[]>([]);
  const closeTimerRef = useRef<number | undefined>(undefined);

  const hideHint = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    hintElementsRef.current.forEach((el) => el.remove());
    hintElementsRef.current = [];
  }, []);

  const scheduleHideHint = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(hideHint, HINT_CLOSE_DELAY_MS);
  }, [hideHint]);

  const showHint = useCallback(
    (e: React.MouseEvent, hintText: string) => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = undefined;
      }
      const buttonEl = (e.target as HTMLElement).closest('button');
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`) as HTMLElement | null;
      const originalTitle = buttonEl?.getAttribute('title');
      if (originalTitle) {
        buttonEl?.setAttribute('data-original-title', originalTitle);
        buttonEl?.removeAttribute('title');
      }
      const btnRect = buttonEl?.getBoundingClientRect();
      const menuRect = menuEl?.getBoundingClientRect();
      if (btnRect && menuRect && menuEl) {
        hintElementsRef.current.forEach((el) => el.remove());
        hintElementsRef.current = renderHintCard({
          content: hintText,
          buttonRect: btnRect,
          menuRect,
          onCardMouseEnter: () => {
            if (closeTimerRef.current) {
              window.clearTimeout(closeTimerRef.current);
              closeTimerRef.current = undefined;
            }
          },
          onCardMouseLeave: scheduleHideHint,
        });
      }
    },
    [menuId, scheduleHideHint],
  );

  const showTabHint = useCallback(
    (e: React.MouseEvent, hintText: string) => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = undefined;
      }
      const buttonEl = (e.target as HTMLElement).closest('button');
      const menuEl = document.querySelector(
        '[data-menu-id="browser-tab-context-menu"]',
      ) as HTMLElement | null;
      const originalTitle = buttonEl?.getAttribute('title');
      if (originalTitle) {
        buttonEl?.setAttribute('data-original-title', originalTitle);
        buttonEl?.removeAttribute('title');
      }
      const btnRect = buttonEl?.getBoundingClientRect();
      const menuRect = menuEl?.getBoundingClientRect();
      if (btnRect && menuRect && menuEl) {
        hintElementsRef.current.forEach((el) => el.remove());
        hintElementsRef.current = renderHintCard({
          content: hintText,
          buttonRect: btnRect,
          menuRect,
          onCardMouseEnter: () => {
            if (closeTimerRef.current) {
              window.clearTimeout(closeTimerRef.current);
              closeTimerRef.current = undefined;
            }
          },
          onCardMouseLeave: scheduleHideHint,
        });
      }
    },
    [scheduleHideHint],
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
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      hintElementsRef.current.forEach((el) => el.remove());
      hintElementsRef.current = [];
    };
  }, [menuOpen, menuId, setMenuOpen, hideHint, entryBtnRef]);

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
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuForTab(null);
      }
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escHandler);
    };
  }, [contextMenuForTab, setContextMenuForTab]);

  const entryMenuSlot =
    menuOpen && menuPosition
      ? createPortal(
          <div
            className="adl-multitree-entry__menu"
            role="menu"
            data-menu-id={menuId}
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            {entryMenuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
                role="menuitem"
                onClick={handleMenuItemClick(item.action)}
              >
                <span>{item.label}</span>
                {item.hint ? (
                  <span
                    className={`adl-menu-item__hint${item.danger ? ' is-danger' : ''}`}
                    onMouseEnter={(e) => showHint(e, item.hint!)}
                    onMouseLeave={scheduleHideHint}
                  >
                    !
                  </span>
                ) : null}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  const tabContextMenuSlot = contextMenuForTab
    ? createPortal(
        <div
          className="adl-multitree-entry__menu"
          role="menu"
          data-menu-id="browser-tab-context-menu"
          style={{ top: contextMenuForTab.y, left: contextMenuForTab.x }}
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
                    contextMenuForTab.node.name,
                  );
                }
                setContextMenuForTab(null);
              },
            },
            {
              id: 'refresh',
              label: t.browserRefreshMeta,
              hint: t.browserRefreshMetaHint,
              action: () => {
                if (contextMenuForTab.node.tabId && contextMenuForTab.node.url) {
                  callbacks.onRefreshTab(contextMenuForTab.node.tabId, contextMenuForTab.node.url);
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
                  .browserBookmarks.some((b) => b.url === contextMenuForTab.node.url)
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
                    callbacks.onDeleteTab(contextMenuForTab.node.tabId, contextMenuForTab.node.url);
                  }
                }
                setContextMenuForTab(null);
              },
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`adl-multitree-entry__menu-item${item.danger ? ' is-danger' : ''}`}
              role="menuitem"
              onClick={item.action}
            >
              <span>{item.label}</span>
              {item.hint ? (
                <span
                  className={`adl-menu-item__hint${item.danger ? ' is-danger' : ''}`}
                  onMouseEnter={(e) => showTabHint(e, item.hint!)}
                  onMouseLeave={scheduleHideHint}
                >
                  !
                </span>
              ) : null}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return { entryMenuSlot, tabContextMenuSlot };
}

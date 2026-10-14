import { useEffect, useRef } from 'react';

/**
 * Shared menu item type used by both BrowserTreeEntry and GitHubTreeEntry child menus.
 * Supports both regular action items and separator items.
 */
export type ChildMenuItem =
  | {
      id: string;
      label: string;
      badge?: string;
      danger?: boolean;
      action: () => void;
      hasHint?: boolean;
      hint?: string;
    }
  | {
      id: string;
      separator: true;
    };

/**
 * Shared hook that closes a menu when clicking outside or pressing Escape.
 *
 * Uses a ref internally to avoid re-subscribing when the close callback changes.
 * Used by BrowserTreeEntry, GitHubTreeEntry, and their sub-entry components
 * for both entry-level and child-level context menus.
 */
export function useMenuCloseOnOutsideClick(
  menuOpen: boolean,
  menuId: string,
  closeMenu: () => void,
): void {
  const closeMenuRef = useRef(closeMenu);
  closeMenuRef.current = closeMenu;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menuEl = document.querySelector(`[data-menu-id="${menuId}"]`);
      if (menuEl?.contains(target)) {
        return;
      }
      closeMenuRef.current();
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenuRef.current();
      }
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escHandler);
    };
  }, [menuOpen, menuId]);
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

export interface MenuViewportPosition {
  top: number;
  left: number;
}

/**
 * 右键菜单视口钳制（事项 15）：portal 菜单按点击坐标定位时，底部行会溢出应用
 * 下边缘被裁。与 ContextMenu 组件同口径（8px 边距），底部/右侧溢出时上移/左移。
 * entryMenuSlot 与 tabContextMenuSlot 共用（覆盖标签目录/文件列表两模式）。
 */
export function useClampedMenuPosition(
  position: MenuViewportPosition | null,
  margin = 8,
  slot = 'menu',
): {
  menuRef: (el: HTMLDivElement | null) => void;
  adjusted: MenuViewportPosition | null;
} {
  const [adjusted, setAdjusted] = useState<MenuViewportPosition | null>(position);

  // position 变化即同步（菜单复开/换点）：否则 adjusted 停留旧值，首开门控永假死锁（R1）。
  // 用 layout effect：paint 前同步，无首帧旧坐标闪位（R1 G1）。
  useLayoutEffect(() => {
    setAdjusted(position);
  }, [position]);

  const menuRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !position) {
        setAdjusted(position);
        return;
      }
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let { top, left } = position;
      if (left + rect.width > vw - margin) {
        left = Math.max(margin, vw - rect.width - margin);
      }
      if (top + rect.height > vh - margin) {
        top = Math.max(margin, vh - rect.height - margin);
      }
      // [ADL-DEBUG] 事项16排查用：底部行右键菜单仍被裁。定案后删除本日志。
      console.debug(
        '[ADL-DEBUG] [menu::clamp] slot=%s raw=(%d,%d) rect=%dx%d viewport=%dx%d adjusted=(%d,%d)',
        slot,
        position.top,
        position.left,
        Math.round(rect.width),
        Math.round(rect.height),
        vw,
        vh,
        top,
        left,
      );
      setAdjusted((prev) =>
        prev && prev.top === top && prev.left === left ? prev : { top, left },
      );
    },
    [position, margin, slot],
  );

  return { menuRef, adjusted };
}

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

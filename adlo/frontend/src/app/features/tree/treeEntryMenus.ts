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
 * entryMenuSlot 与 tabContextMenuSlot 共用（覆盖书签目录/书签列表两模式）。
 *
 * 无位移实现（2026-11-14）：量测必须发生在**本次 commit 的 layout 阶段**，且
 * 钳制结果绑定本次坐标。旧实现把上一次打开时的 adjusted 留在 state 里，重开时
 * 会先用上个菜单的坐标画一帧再纠正——用户可见「菜单卡片轻微位移」（事项 5）。
 */
export function useClampedMenuPosition(
  position: MenuViewportPosition | null,
  margin = 8,
): {
  menuRef: (el: HTMLDivElement | null) => void;
  adjusted: MenuViewportPosition | null;
} {
  const menuElRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<
    (MenuViewportPosition & { sourceTop: number; sourceLeft: number }) | null
  >(null);

  const menuRef = useCallback((el: HTMLDivElement | null) => {
    menuElRef.current = el;
  }, []);

  useLayoutEffect(() => {
    const el = menuElRef.current;
    if (!position || !el) {
      return;
    }
    // layout 阶段量测并在 paint 前完成纠正，不产生可见位移。
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
    const next = { top, left, sourceTop: position.top, sourceLeft: position.left };
    setMeasured((prev) =>
      prev &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.sourceTop === next.sourceTop &&
      prev.sourceLeft === next.sourceLeft
        ? prev
        : next,
    );
  }, [position, margin]);

  // 只复用「与本次坐标匹配」的量测结果；否则返回 null（先按原始坐标渲染，
  // 本轮 layout 阶段立即纠正）。
  const adjusted =
    position &&
    measured &&
    measured.sourceTop === position.top &&
    measured.sourceLeft === position.left
      ? { top: measured.top, left: measured.left }
      : null;

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

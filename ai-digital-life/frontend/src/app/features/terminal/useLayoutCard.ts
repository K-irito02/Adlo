import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface UseLayoutCardReturn {
  open: boolean;
  anchorRef: RefObject<HTMLDivElement | null>;
  toggle: () => void;
  close: () => void;
}

/**
 * 自定义布局卡片的开合本地态：锚点 ref + 外部点击 / Esc 关闭。
 *
 * 两处宿主（右面板 `TerminalPanel` 与中心视图 `CenterTerminalView`）复用同一实现，
 * 关闭方式与既有菜单下拉一致（`document` 级 `mousedown` / `keydown` + ref 包含判定）。
 */
export function useLayoutCard(): UseLayoutCardReturn {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return { open, anchorRef, toggle, close };
}

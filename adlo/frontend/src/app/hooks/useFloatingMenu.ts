import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export interface UseFloatingMenuOptions {
  initialOpen?: boolean;
  initialLeft?: number;
  initialTop?: number;
  initialWidth?: number;
}

export interface UseFloatingMenuReturn {
  open: boolean;
  left: number;
  top: number;
  width: number;
  setOpen: Dispatch<SetStateAction<boolean>>;
  setPosition: (left: number, top: number, width: number) => void;
  reset: () => void;
}

/**
 * Reusable floating-menu state hook. Owns open/close and position state for any
 * floating UI (dropdowns, context menus, popovers). Contains no feature-
 * specific logic so it can be shared across panels.
 */
export function useFloatingMenu(options: UseFloatingMenuOptions = {}): UseFloatingMenuReturn {
  const { initialOpen = false, initialLeft = 0, initialTop = 0, initialWidth = 130 } = options;

  const [open, setOpen] = useState(initialOpen);
  const [left, setLeft] = useState(initialLeft);
  const [top, setTop] = useState(initialTop);
  const [width, setWidth] = useState(initialWidth);

  const setPosition = useCallback((newLeft: number, newTop: number, newWidth: number) => {
    setLeft(newLeft);
    setTop(newTop);
    setWidth(newWidth);
  }, []);

  const reset = useCallback(() => {
    setOpen(false);
    setLeft(initialLeft);
    setTop(initialTop);
    setWidth(initialWidth);
  }, [initialLeft, initialTop, initialWidth]);

  return { open, left, top, width, setOpen, setPosition, reset };
}

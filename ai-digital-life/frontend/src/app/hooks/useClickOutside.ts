import { useEffect, type RefObject } from 'react';

export interface UseClickOutsideOptions {
  onOutsideClick?: () => void;
  onEscape?: () => void;
}

export function useClickOutside(
  ref: RefObject<Element | null>,
  enabled: boolean,
  { onOutsideClick, onEscape }: UseClickOutsideOptions
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutsideClick?.();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape?.();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, enabled, onOutsideClick, onEscape]);
}

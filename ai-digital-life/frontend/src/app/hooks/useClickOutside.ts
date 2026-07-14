import { useEffect, type RefObject } from 'react';

export interface UseClickOutsideOptions {
  onOutsideClick?: () => void;
  onEscape?: () => void;
}

type ClickOutsideRef = RefObject<Element | null>;

export function useClickOutside(
  ref: ClickOutsideRef | readonly ClickOutsideRef[],
  enabled: boolean,
  { onOutsideClick, onEscape }: UseClickOutsideOptions
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refs = Array.isArray(ref) ? ref : [ref];

    const handleMouseDown = (e: MouseEvent) => {
      const isOutside = refs.every((r) => !r.current?.contains(e.target as Node));
      if (isOutside) {
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

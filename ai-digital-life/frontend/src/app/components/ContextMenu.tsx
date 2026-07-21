import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HINT_CLOSE_DELAY_MS } from './HintCardTrigger';
import { renderHintCard } from '../utils/renderHintCard';

export interface ContextMenuItem {
  id: string;
  label?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  action?: () => void;
  hint?: string;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const hintElementsRef = useRef<HTMLElement[]>([]);
  const closeTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('mousedown', handlePointer);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('keydown', handleEscape);
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      hintElementsRef.current.forEach((el) => el.remove());
      hintElementsRef.current = [];
    };
  }, [onClose]);

  const nonSeparatorItems = items.filter((item) => !item.separator);
  const firstItemIndex = nonSeparatorItems.findIndex((item) => !item.disabled);

  const hideHint = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    hintElementsRef.current.forEach((el) => el.remove());
    hintElementsRef.current = [];
  };

  const scheduleHideHint = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(hideHint, HINT_CLOSE_DELAY_MS);
  };

  const showHint = (e: React.MouseEvent, hintText: string) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    const buttonEl = (e.target as HTMLElement).closest('button');
    const originalTitle = buttonEl?.getAttribute('title');
    if (originalTitle) {
      buttonEl?.setAttribute('data-original-title', originalTitle);
      buttonEl?.removeAttribute('title');
    }
    const btnRect = buttonEl?.getBoundingClientRect();
    const menuEl = ref.current;
    const menuRect = menuEl?.getBoundingClientRect();
    if (btnRect && menuRect && ref.current) {
      hintElementsRef.current.forEach((el) => el.remove());
      hintElementsRef.current = renderHintCard({
        content: hintText,
        buttonRect: btnRect,
        menuRect,
        containerEl: ref.current,
        onCardMouseEnter: () => {
          if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = undefined;
          }
        },
        onCardMouseLeave: scheduleHideHint,
      });
    }
  };

  return createPortal(
    <div
      ref={ref}
      className="adl-sidebar-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item) => {
        if (item.separator) {
          return <div key={item.id} className="adl-sidebar-menu__sep" role="separator" />;
        }
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`adl-sidebar-menu__item${item.danger ? ' is-danger' : ''}`}
            disabled={item.disabled}
            tabIndex={item.disabled ? -1 : 0}
            autoFocus={nonSeparatorItems.indexOf(item) === firstItemIndex}
            onClick={() => {
              if (item.disabled) {
                return;
              }
              item.action?.();
              onClose();
            }}
          >
            {item.icon ? <span className="adl-sidebar-menu__icon">{item.icon}</span> : null}
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
        );
      })}
    </div>,
    document.body,
  );
}

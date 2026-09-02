import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHintCard, HintCard } from './HintCard';

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

const CONTEXT_MENU_MARGIN = 8;

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const {
    hintState,
    showHint: showHintCard,
    hideHint,
    scheduleHide,
    hintCardProps,
  } = useHintCard();
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (!ref.current) {
      setAdjustedPosition(position);
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = position;

    // Adjust horizontal position if menu extends beyond right edge
    if (x + rect.width > vw - CONTEXT_MENU_MARGIN) {
      x = Math.max(CONTEXT_MENU_MARGIN, vw - rect.width - CONTEXT_MENU_MARGIN);
    }
    // Adjust vertical position if menu extends beyond bottom edge
    if (y + rect.height > vh - CONTEXT_MENU_MARGIN) {
      y = Math.max(CONTEXT_MENU_MARGIN, vh - rect.height - CONTEXT_MENU_MARGIN);
    }

    setAdjustedPosition({ x, y });
  }, [position]);

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
      hideHint();
    };
  }, [onClose]);

  const nonSeparatorItems = items.filter((item) => !item.separator);
  const firstItemIndex = nonSeparatorItems.findIndex((item) => !item.disabled);

  const handleShowHint = (e: React.MouseEvent, hintText: string) => {
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
  };

  return createPortal(
    <>
      <div
        ref={ref}
        className="adl-sidebar-menu"
        role="menu"
        style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
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
                  onMouseEnter={(e) => handleShowHint(e, item.hint!)}
                  onMouseLeave={scheduleHide}
                >
                  !
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <HintCard {...hintCardProps} placement="right">
        {hintState?.content}
      </HintCard>
    </>,
    document.body,
  );
}

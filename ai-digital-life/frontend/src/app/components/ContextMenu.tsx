import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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
      hintElementsRef.current.forEach((el) => el.remove());
      hintElementsRef.current = [];
    };
  }, [onClose]);

  const nonSeparatorItems = items.filter((item) => !item.separator);
  const firstItemIndex = nonSeparatorItems.findIndex((item) => !item.disabled);

  const showHint = (e: React.MouseEvent, hintText: string) => {
    const buttonEl = (e.target as HTMLElement).closest('button');
    const originalTitle = buttonEl?.getAttribute('title');
    if (originalTitle) {
      buttonEl?.setAttribute('data-original-title', originalTitle);
      buttonEl?.removeAttribute('title');
    }
    const btnRect = buttonEl?.getBoundingClientRect();
    const menuEl = ref.current;
    const menuRect = menuEl?.getBoundingClientRect();
    if (btnRect && menuRect) {
      const centerY = btnRect.top + btnRect.height / 2;
      const card = document.createElement('div');
      card.className = 'adl-sub-hint-card';
      card.textContent = hintText;
      card.style.left = `${menuRect.right + 1}px`;
      card.style.top = `${centerY}px`;
      card.style.transform = 'translateY(-50%)';
      const arrow = document.createElement('div');
      arrow.className = 'adl-sub-hint-card__arrow';
      arrow.style.left = `${menuRect.right - 4}px`;
      arrow.style.top = `${centerY - 4}px`;
      const arrowBorder = document.createElement('div');
      arrowBorder.className = 'adl-sub-hint-card__arrow-border';
      arrowBorder.style.left = `${menuRect.right - 5}px`;
      arrowBorder.style.top = `${centerY - 5}px`;
      document.body.appendChild(card);
      document.body.appendChild(arrow);
      document.body.appendChild(arrowBorder);
      hintElementsRef.current.forEach((el) => el.remove());
      hintElementsRef.current = [card, arrow, arrowBorder];
    }
  };

  const hideHint = () => {
    hintElementsRef.current.forEach((el) => el.remove());
    hintElementsRef.current = [];
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
                onMouseLeave={hideHint}
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

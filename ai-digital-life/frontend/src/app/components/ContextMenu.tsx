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
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

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
    };
  }, [onClose]);

  const nonSeparatorItems = items.filter((item) => !item.separator);
  const firstItemIndex = nonSeparatorItems.findIndex((item) => !item.disabled);

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
              if (item.disabled) return;
              item.action?.();
              onClose();
            }}
          >
            {item.icon ? <span className="adl-sidebar-menu__icon">{item.icon}</span> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}

import { useEffect, useRef } from 'react';
import type { SidebarMenuItem } from './SidebarContextMenu.utils';

export function SidebarContextMenu({
  items,
  x,
  y,
  onClose,
}: {
  items: SidebarMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}) {
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

  return (
    <div ref={ref} className="adl-sidebar-menu" role="menu" style={{ left: x, top: y }}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`adl-sidebar-menu__item${item.danger ? ' is-danger' : ''}`}
          onClick={() => {
            item.action();
            onClose();
          }}
        >
          <span className="adl-sidebar-menu__icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

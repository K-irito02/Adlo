import { useEffect, useRef } from 'react';
import type { MenuItem } from './titleBarMenus';

export function MenuDropdown({
  id,
  label,
  open,
  items,
  onToggle,
  onClose,
}: {
  id: string;
  label: string;
  open: boolean;
  items: MenuItem[];
  onToggle: () => void;
  onClose: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  return (
    <div ref={wrapperRef} className="adl-menu" data-menu-id={id}>
      <button
        type="button"
        className={`adl-menu__trigger adl-iconstrip__button adl-iconstrip__button--label${open ? ' is-open' : ''}`}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      {open ? (
        <div className="adl-menu__dropdown" role="menu">
          {items.map((item, index) => {
            if (item.separator) {
              return <div key={`sep-${index}`} className="adl-menu__sep" role="separator" />;
            }
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="adl-menu__item"
                disabled={item.disabled}
                onClick={() => {
                  item.action?.();
                  onClose();
                }}
              >
                <span>{item.label}</span>
                {item.shortcut ? <span className="adl-menu__shortcut">{item.shortcut}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

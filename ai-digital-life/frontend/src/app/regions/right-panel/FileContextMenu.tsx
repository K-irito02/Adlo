import React, { useEffect, useRef, useState } from 'react';
import { IconMoreVertical } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@i18n/useTCopy';

interface FileMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  action?: () => void;
}

interface FileMenuDivider {
  id: string;
  separator: true;
}

type FileMenuEntry = FileMenuItem | FileMenuDivider;

interface FileContextMenuProps {
  menuItems: FileMenuEntry[];
  checkState: {
    lineNumbersEnabled: boolean;
    wordWrapEnabled: boolean;
  };
}

function FileContextMenu({ menuItems, checkState }: FileContextMenuProps) {
  const { t } = useTCopy();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={menuRef} className="adl-menu adl-file-context__menu">
      <TooltipSimple content={t.fileMoreActions as string} placement="top">
        <button
          type="button"
          className={`adl-tool-context__iconbtn${open ? ' is-open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-label={t.fileMoreActions as string}
          aria-haspopup="menu"
          aria-expanded={open ? 'true' : 'false'}
        >
          <IconMoreVertical size={14} decorative />
        </button>
      </TooltipSimple>
      {open ? (
        <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
          {menuItems.map((item) =>
            'separator' in item ? (
              <div key={item.id} className="adl-menu__sep" role="separator" />
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={
                  item.id === 'line-numbers'
                    ? checkState.lineNumbersEnabled
                      ? 'true'
                      : 'false'
                    : item.id === 'word-wrap'
                      ? checkState.wordWrapEnabled
                        ? 'true'
                        : 'false'
                      : undefined
                }
                className="adl-menu__item"
                disabled={item.disabled}
                onClick={() => {
                  item.action?.();
                  if (!item.action) {
                    setOpen(false);
                  }
                }}
              >
                <span>{item.label}</span>
                {item.shortcut ? <span className="adl-menu__shortcut">{item.shortcut}</span> : null}
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

export { FileContextMenu };
export type { FileMenuItem, FileMenuDivider, FileMenuEntry, FileContextMenuProps };

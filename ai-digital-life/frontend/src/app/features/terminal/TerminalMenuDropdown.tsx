import React from 'react';
import { IconMoreVertical } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import type { TerminalMenuItem } from './useTerminalPanel';
import { useTCopy } from '@i18n/useTCopy';

interface TerminalMenuDropdownProps {
  menuOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuItems: TerminalMenuItem[];
  onToggle: () => void;
  onClose: () => void;
}

export const TerminalMenuDropdown = React.memo(function TerminalMenuDropdown({
  menuOpen,
  menuRef,
  menuItems,
  onToggle,
  onClose,
}: TerminalMenuDropdownProps) {
  const { t } = useTCopy();
  return (
    <div ref={menuRef} className="adl-menu adl-file-context__menu">
      <TooltipSimple content={t.terminalMoreActions} placement="top">
        <button
          type="button"
          className={`adl-tool-context__iconbtn${menuOpen ? ' is-open' : ''}`}
          onClick={onToggle}
          aria-label={t.terminalMoreActions}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <IconMoreVertical size={14} decorative />
        </button>
      </TooltipSimple>
      {menuOpen ? (
        <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
          {menuItems.map((item) =>
            'separator' in item ? (
              <div key={item.id} className="adl-menu__sep" role="separator" />
            ) : (
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
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
});

import React from 'react';
import {
  IconFolderPlus,
  IconPlus,
  IconTrash,
  IconRefreshCw,
  IconCpu,
  IconSearch,
  IconMoreVertical,
} from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { BrowserMenuHintItem } from './BrowserMenuHintItem';
import type { BrowserMenuItem } from './useBrowserMenus';
import { useTCopy } from '@i18n/useTCopy';

interface BrowserMenuDropdownProps {
  menuOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuItems: BrowserMenuItem[];
  onToggle: () => void;
  onClose: () => void;
}

const menuItemIcons: Record<string, React.ReactNode> = {
  'new-tab-folder': <IconFolderPlus size={14} decorative />,
  'new-tab': <IconPlus size={14} decorative />,
  'clear-history': <IconTrash size={14} decorative />,
  'clear-cookies': <IconTrash size={14} decorative />,
  'clear-cache': <IconTrash size={14} decorative />,
  devtools: <IconCpu size={14} decorative />,
  'zoom-in': <IconSearch size={14} decorative />,
  'zoom-out': <IconSearch size={14} decorative />,
  'zoom-reset': <IconRefreshCw size={14} decorative />,
};

export const BrowserMenuDropdown = React.memo(function BrowserMenuDropdown({
  menuOpen,
  menuRef,
  menuItems,
  onToggle,
  onClose,
}: BrowserMenuDropdownProps) {
  const { t } = useTCopy();
  return (
    <div ref={menuRef} className="adl-menu adl-file-context__menu">
      <TooltipSimple content={t.browserContextMore} placement="top">
        <button
          type="button"
          className={`adl-tool-context__iconbtn${menuOpen ? ' is-open' : ''}`}
          onClick={onToggle}
          aria-label={t.browserContextMore}
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
              <BrowserMenuHintItem
                key={item.id}
                id={item.id}
                label={item.label}
                icon={menuItemIcons[item.id]}
                disabled={item.disabled}
                hint={item.hint}
                action={item.action}
                onClose={onClose}
                menuRef={menuRef}
              />
            )
          )}
        </div>
      ) : null}
    </div>
  );
});

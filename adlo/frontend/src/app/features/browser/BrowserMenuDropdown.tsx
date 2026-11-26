import React from 'react';
import {
  IconDelete,
  IconRefreshCw,
  IconCpu,
  IconSearch,
  IconMoreVertical,
  IconDownload,
  IconUpload,
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
  'clear-site-cookies': <IconDelete size={14} decorative />,
  'clear-cookies': <IconDelete size={14} decorative />,
  'clear-site-cache': <IconDelete size={14} decorative />,
  'clear-cache': <IconDelete size={14} decorative />,
  devtools: <IconCpu size={14} decorative />,
  'zoom-in': <IconSearch size={14} decorative />,
  'zoom-out': <IconSearch size={14} decorative />,
  'zoom-reset': <IconRefreshCw size={14} decorative />,
  'import-bookmarks': <IconDownload size={14} decorative />,
  'export-bookmarks': <IconUpload size={14} decorative />,
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
            ),
          )}
        </div>
      ) : null}
    </div>
  );
});

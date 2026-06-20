import React, { useEffect, useRef, useState } from 'react';
import { CopyIcon } from 'lucide-animated';
import type { CopyIconHandle } from 'lucide-animated';
import {
  IconArrowLeft,
  IconArrowRight,
  IconLink,
  IconPlus,
  IconRefreshCw,
  IconStar,
  IconStarFilled,
  IconPanelLeftClose,
} from '../../icons';
import { TooltipSimple } from '../../components/Tooltip';
import { BrowserNavModeSwitch } from './BrowserNavModeSwitch';
import type { CopyDict } from '../../i18n';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { BrowserMenuItem } from './useBrowserMenus';
import { BrowserMenuDropdown } from './BrowserMenuDropdown';

interface BrowserToolbarProps {
  t: CopyDict;
  navigatorCollapsed: boolean;
  address: string;
  addressExpanded: boolean;
  addressSearchRef: React.RefObject<HTMLLabelElement | null>;
  addressInputRef: React.RefObject<HTMLInputElement | null>;
  activeTab?: BrowserTabState;
  isBookmarked: boolean;
  browserMenuOpen: boolean;
  browserMenuRef: React.RefObject<HTMLDivElement | null>;
  browserMenuItems: BrowserMenuItem[];
  onToggleNavigator: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onAddressChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onAddressKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onAddressBlur: () => void;
  onSearchClick: () => void;
  onCopyUrl: (url: string) => void;
  browserNavigateInPlace: boolean;
  onNewTab: () => void;
  onOpenBookmarkDialog: () => void;
  onToggleNavigateMode: (checked: boolean) => void;
  onToggleBrowserMenu: () => void;
  onCloseBrowserMenu: () => void;
}

export const BrowserToolbar = React.memo(function BrowserToolbar(props: BrowserToolbarProps) {
  const [copied, setCopied] = useState(false);
  const copyIconRef = useRef<CopyIconHandle>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== undefined) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const {
    t,
    address,
    addressExpanded,
    addressSearchRef,
    addressInputRef,
    activeTab,
    isBookmarked,
    browserMenuOpen,
    browserMenuRef,
    browserMenuItems,
    onToggleNavigator,
    onGoBack,
    onGoForward,
    onReload,
    browserNavigateInPlace,
    onToggleNavigateMode,
    onAddressChange,
    onAddressKeyDown,
    onAddressBlur,
    onSearchClick,
    onCopyUrl,
    onNewTab,
    onOpenBookmarkDialog,
    onToggleBrowserMenu,
    onCloseBrowserMenu,
  } = props;

  return (
    <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolBrowser}>
      <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
        <TooltipSimple content={t.panelNavigatorToggle} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
            onClick={onToggleNavigator}
            aria-label={t.panelNavigatorToggle}
          >
            <IconPanelLeftClose size={14} decorative />
          </button>
        </TooltipSimple>
        <TooltipSimple content={t.browserBack} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn"
            onClick={onGoBack}
            aria-label={t.browserBack}
          >
            <IconArrowLeft size={14} decorative />
          </button>
        </TooltipSimple>
        <TooltipSimple content={t.browserForward} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn"
            onClick={onGoForward}
            aria-label={t.browserForward}
          >
            <IconArrowRight size={14} decorative />
          </button>
        </TooltipSimple>
        <TooltipSimple content={t.browserRefresh} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn"
            onClick={onReload}
            aria-label={t.browserRefresh}
          >
            <IconRefreshCw size={14} decorative />
          </button>
        </TooltipSimple>
        <TooltipSimple
          content={browserNavigateInPlace ? t.browserNavigateInPlace : t.browserNavigateNewTab}
          placement="top"
        >
          <BrowserNavModeSwitch
            checked={browserNavigateInPlace}
            onCheckedChange={onToggleNavigateMode}
            leftLabel={t.browserNavigateInPlace}
            rightLabel={t.browserNavigateNewTab}
          />
        </TooltipSimple>
        <label
          ref={addressSearchRef}
          className={`adl-tool-search adl-tool-search--address${addressExpanded ? ' is-expanded' : ''}`}
          onClick={onSearchClick}
        >
          <IconLink
            size={14}
            decorative
            className="adl-tool-search__icon adl-tool-search__icon--address"
          />
          <span className="adl-tool-search__preview" aria-hidden={addressExpanded}>
            {address.trim()}
          </span>
          <input
            ref={addressInputRef}
            type="search"
            value={address}
            onChange={onAddressChange}
            onKeyDown={onAddressKeyDown}
            onBlur={onAddressBlur}
            placeholder={t.browserAddress}
            aria-label={t.browserAddress}
          />
          <TooltipSimple
            content={copied ? t.copySuccessClipboard : t.browserCopyLink}
            placement="top"
          >
            <button
              type="button"
              className={`adl-tool-search__copy${copied ? ' is-copied' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const url = (activeTab?.url ?? address) || '';
                onCopyUrl(url);
                if (resetTimerRef.current !== undefined) {
                  clearTimeout(resetTimerRef.current);
                }
                copyIconRef.current?.startAnimation();
                setCopied(true);
                resetTimerRef.current = setTimeout(() => {
                  copyIconRef.current?.stopAnimation();
                  setCopied(false);
                }, 1500);
              }}
            >
              <CopyIcon ref={copyIconRef} size={14} />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.newTabPage} placement="top">
            <button
              type="button"
              className="adl-tool-search__copy"
              onClick={(e) => {
                e.stopPropagation();
                onNewTab();
              }}
            >
              <IconPlus size={14} decorative />
            </button>
          </TooltipSimple>
        </label>
      </div>
      <div className="adl-tool-context__group adl-tool-context__group--files-actions">
        <TooltipSimple content={isBookmarked ? t.unbookmark : t.bookmark} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn"
            aria-label={isBookmarked ? t.unbookmark : t.bookmark}
            onClick={onOpenBookmarkDialog}
          >
            {isBookmarked ? (
              <IconStarFilled size={14} decorative />
            ) : (
              <IconStar size={14} decorative />
            )}
          </button>
        </TooltipSimple>
        <BrowserMenuDropdown
          menuOpen={browserMenuOpen}
          menuRef={browserMenuRef}
          menuItems={browserMenuItems}
          onToggle={onToggleBrowserMenu}
          onClose={onCloseBrowserMenu}
        />
      </div>
    </div>
  );
});

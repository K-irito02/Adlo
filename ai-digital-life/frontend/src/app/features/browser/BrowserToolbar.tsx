import React from 'react';
import {
  IconArrowLeft,
  IconArrowRight,
  IconLink,
  IconPlus,
  IconRefreshCw,
  IconStar,
  IconStarFilled,
  IconPanelLeft,
  IconPanelLeftClose,
} from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { CopyButton } from '@components/CopyButton';
import { BrowserNavModeSwitch } from './BrowserNavModeSwitch';
import { BrowserMenuDropdown } from './BrowserMenuDropdown';
import { useBrowserPanelState } from './BrowserPanelStateContext';
import { useBrowserPanelActions } from './BrowserPanelActionsContext';
import { useAppStore } from '@stores/slicedStore';

export const BrowserToolbar = React.memo(function BrowserToolbar() {
  const {
    t,
    navigatorCollapsed,
    activeTab,
    isBookmarked,
    browserMenuOpen,
    browserMenuRef,
    browserMenuItems,
    urlState: {
      address,
      addressExpanded,
      addressSearchRef,
      addressInputRef,
      handleAddressChange,
      handleAddressKeyDown,
      handleAddressBlur,
      handleSearchClick,
    },
  } = useBrowserPanelState();

  const {
    handleGoBack,
    handleGoForward,
    handleReload,
    browserOpenTab,
    handleOpenBookmarkDialog,
    setBrowserMenuOpen,
    handleToggleNavigateMode,
    toggleNavigator,
  } = useBrowserPanelActions();

  const browserNavigateInPlace = useAppStore((s) => s.browserNavigateInPlace);
  const browserNavigateActiveTab = useAppStore((s) => s.browserNavigateActiveTab);

  return (
    <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolBrowser}>
      <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
        <TooltipSimple content={t.panelNavigatorToggle} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
            onClick={() => toggleNavigator('browser')}
            aria-label={t.panelNavigatorToggle}
          >
            {navigatorCollapsed ? (
              <IconPanelLeftClose size={14} decorative />
            ) : (
              <IconPanelLeft size={14} decorative />
            )}
          </button>
        </TooltipSimple>
        <TooltipSimple content={t.browserBack} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn"
            onClick={handleGoBack}
            aria-label={t.browserBack}
          >
            <IconArrowLeft size={14} decorative />
          </button>
        </TooltipSimple>
        <TooltipSimple content={t.browserForward} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn"
            onClick={handleGoForward}
            aria-label={t.browserForward}
          >
            <IconArrowRight size={14} decorative />
          </button>
        </TooltipSimple>
        <TooltipSimple content={t.browserRefresh} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn"
            onClick={handleReload}
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
            onCheckedChange={handleToggleNavigateMode}
            leftLabel={t.browserNavigateNewTab}
            rightLabel={t.browserNavigateInPlace}
          />
        </TooltipSimple>
        <label
          ref={addressSearchRef}
          className={`adl-tool-search adl-tool-search--address${addressExpanded ? ' is-expanded' : ''}`}
          onClick={handleSearchClick}
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
            onChange={handleAddressChange}
            onKeyDown={handleAddressKeyDown}
            onBlur={handleAddressBlur}
            placeholder={t.browserAddress}
            aria-label={t.browserAddress}
          />
          <CopyButton
            text={activeTab?.url ?? address ?? ''}
            tooltip={t.browserCopyLink as string}
            tooltipCopied={t.copySuccessClipboard as string}
          />
          <TooltipSimple content={t.newTabPage} placement="top">
            <button
              type="button"
              className="adl-copy-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (browserNavigateInPlace) {
                  browserNavigateActiveTab('about:blank');
                } else {
                  browserOpenTab(undefined, t.browserNewTabPage);
                }
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
            onClick={() => {
              if (address) {
                handleOpenBookmarkDialog();
              }
            }}
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
          onToggle={() => setBrowserMenuOpen((v) => !v)}
          onClose={() => setBrowserMenuOpen(false)}
        />
      </div>
    </div>
  );
});

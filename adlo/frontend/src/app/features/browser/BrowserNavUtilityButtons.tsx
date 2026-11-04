import { IconPlus, IconDelete, IconBookmarkPlus } from '@icons';
import { TooltipSimple } from '@components/Tooltip';

interface BrowserNavUtilityButtonsProps {
  navigatorMode: 'tabs' | 'open' | 'list' | 'search';
  alwaysNewTabLabel: string;
  clearOpenTabsLabel: string;
  newBookmarkLabel: string;
  onAlwaysNewTab: () => void;
  onClearOpenTabs: () => void;
}

export function BrowserNavUtilityButtons({
  navigatorMode,
  alwaysNewTabLabel,
  clearOpenTabsLabel,
  newBookmarkLabel,
  onAlwaysNewTab,
  onClearOpenTabs,
}: BrowserNavUtilityButtonsProps) {
  const showPlus = navigatorMode === 'tabs' || navigatorMode === 'open';
  const showClear = navigatorMode === 'open';
  const plusLabel = navigatorMode === 'tabs' ? newBookmarkLabel : alwaysNewTabLabel;
  const plusButton = (
    <button
      type="button"
      className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
      onClick={onAlwaysNewTab}
      aria-label={plusLabel}
    >
      {navigatorMode === 'tabs' ? (
        <IconBookmarkPlus size={14} decorative />
      ) : (
        <IconPlus size={14} decorative />
      )}
    </button>
  );
  return (
    <>
      {showPlus && (
        <TooltipSimple content={plusLabel} placement="top">
          {plusButton}
        </TooltipSimple>
      )}
      {showClear && (
        <TooltipSimple content={clearOpenTabsLabel} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
            onClick={onClearOpenTabs}
            aria-label={clearOpenTabsLabel}
          >
            <IconDelete size={14} decorative />
          </button>
        </TooltipSimple>
      )}
    </>
  );
}

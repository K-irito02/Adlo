import { IconPlus, IconDelete } from '@icons';
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
      <IconPlus size={14} decorative />
    </button>
  );
  return (
    <>
      {showPlus &&
        (navigatorMode === 'tabs' ? (
          <TooltipSimple content={plusLabel} placement="top">
            {plusButton}
          </TooltipSimple>
        ) : (
          <button
            type="button"
            className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
            onClick={onAlwaysNewTab}
            aria-label={plusLabel}
            title={plusLabel}
          >
            <IconPlus size={14} decorative />
          </button>
        ))}
      {showClear && (
        <button
          type="button"
          className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
          onClick={onClearOpenTabs}
          aria-label={clearOpenTabsLabel}
          title={clearOpenTabsLabel}
        >
          <IconDelete size={14} decorative />
        </button>
      )}
    </>
  );
}

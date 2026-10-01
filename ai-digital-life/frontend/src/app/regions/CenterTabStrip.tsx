import React, { useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { BrowserFavicon } from '@components/BrowserFavicon';
import { TooltipSimple } from '@components/Tooltip';
import { IconClose, IconNewTabPage, IconPanelRight, IconPlus, IconTerminal } from '@icons';
import { TerminalProfileIcon } from '@features/terminal/TerminalProfileIcon';
import { terminalPtyRuntime } from '@features/terminal/terminalPtyRuntime';
import type { CenterTabState } from '@stores/slices/centerTabsSlice';

/**
 * 标题栏中心标签条：单行、溢出裁切（滚动条隐藏，`onWheel` 把纵向滚轮映射到横向
 * `scrollLeft`），可拖拽区由容器的 `data-tauri-drag-region` 提供（标签/按钮不设该属性，
 * 点击标签不会拖动窗口）。右端 `+` 固定不随标签滚动。
 */
export const CenterTabStrip = React.memo(function CenterTabStrip() {
  const { t } = useTCopy();
  const {
    centerTabs,
    centerActiveTabId,
    browserTabsById,
    terminalTabsById,
    centerSelectTab,
    centerRemoveTab,
    centerAddTab,
    centerReturnToPanel,
    browserCloseTab,
  } = useAppStore(
    useShallow((state) => ({
      centerTabs: state.centerTabs,
      centerActiveTabId: state.centerActiveTabId,
      browserTabsById: state.browserTabsById,
      terminalTabsById: state.terminalTabsById,
      centerSelectTab: state.centerSelectTab,
      centerRemoveTab: state.centerRemoveTab,
      centerAddTab: state.centerAddTab,
      centerReturnToPanel: state.centerReturnToPanel,
      browserCloseTab: state.browserCloseTab,
    })),
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollLeft += event.deltaY;
  }, []);

  const handleClose = useCallback(
    (tab: CenterTabState) => {
      if (tab.kind === 'browser' && tab.refId) {
        const browserTab = browserTabsById[tab.refId];
        if (browserTab?.isDsh) {
          void useAppStore.getState().closeDsh(false);
        }
        browserCloseTab(tab.refId);
      } else if (tab.kind === 'terminal' && tab.refId) {
        terminalPtyRuntime.handleCloseTab(tab.refId);
      }
      centerRemoveTab(tab.id);
    },
    [browserTabsById, browserCloseTab, centerRemoveTab],
  );

  const handleAdd = useCallback(() => {
    centerAddTab('launcher', null);
  }, [centerAddTab]);

  return (
    <div className="adl-center-tab-strip">
      <div
        ref={scrollRef}
        className="adl-center-tab-strip__scroll"
        role="tablist"
        aria-label={t.centerNewTab}
        data-tauri-drag-region
        onWheel={handleWheel}
      >
        {centerTabs.map((tab) => {
          const isActive = tab.id === centerActiveTabId;
          const browserTab =
            tab.kind === 'browser' && tab.refId ? browserTabsById[tab.refId] : null;
          const terminalTab =
            tab.kind === 'terminal' && tab.refId ? terminalTabsById[tab.refId] : null;

          let label: string;
          let icon: React.ReactNode;
          if (tab.kind === 'browser') {
            label = browserTab?.titleResolved ? browserTab.title : t.newTabPage;
            icon = <BrowserFavicon url={browserTab?.url ?? ''} />;
          } else if (tab.kind === 'terminal') {
            label = terminalTab?.title || t.terminalNewTerminal;
            icon = terminalTab ? (
              <TerminalProfileIcon profile={terminalTab.profile} />
            ) : (
              <IconTerminal size={14} decorative />
            );
          } else {
            label = t.centerNewTab;
            icon = <IconNewTabPage size={14} decorative />;
          }

          const showInPanelLabel =
            tab.kind === 'browser' ? t.centerTabShowInBrowserPanel : t.centerTabShowInTerminalPanel;

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              className={`adl-center-tab${isActive ? ' is-active' : ''}`}
              onClick={() => centerSelectTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  centerSelectTab(tab.id);
                }
              }}
            >
              <span className="adl-center-tab__icon" aria-hidden="true">
                {icon}
              </span>
              <span className="adl-center-tab__label">{label}</span>
              <span className="adl-center-tab__actions">
                {tab.kind !== 'launcher' && (
                  <TooltipSimple content={showInPanelLabel} placement="bottom">
                    <button
                      type="button"
                      className="adl-icon-btn adl-icon-btn--xs"
                      onClick={(event) => {
                        event.stopPropagation();
                        centerReturnToPanel(tab.id);
                      }}
                      aria-label={showInPanelLabel}
                    >
                      <IconPanelRight size={12} decorative />
                    </button>
                  </TooltipSimple>
                )}
                <TooltipSimple content={t.close} placement="bottom">
                  <button
                    type="button"
                    className="adl-icon-btn adl-icon-btn--xs adl-icon-btn--danger-hover"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleClose(tab);
                    }}
                    aria-label={t.close}
                  >
                    <IconClose size={12} decorative />
                  </button>
                </TooltipSimple>
              </span>
            </div>
          );
        })}
      </div>
      <div className="adl-center-tab-strip__add">
        <TooltipSimple content={t.centerNewTab} placement="bottom">
          <button
            type="button"
            className="adl-icon-btn adl-icon-btn--xs"
            onClick={handleAdd}
            aria-label={t.centerNewTab}
          >
            <IconPlus size={14} decorative />
          </button>
        </TooltipSimple>
      </div>
    </div>
  );
});

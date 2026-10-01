import { memo, useEffect, useRef } from 'react';
import { SafeIframe } from './SafeIframe';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { ExternalLinkError } from './ExternalLinkError';
import { BrowserIframeErrorOverlay } from './BrowserIframeErrorOverlay';
import { useAppStore } from '@stores/slicedStore';
import { BrowserLandingPage } from './browser-landing';
import { useBrowserPanelState } from './BrowserPanelStateContext';
import { useBrowserPanelActions } from './BrowserPanelActionsContext';

export const BrowserIframeStack = memo(function BrowserIframeStack() {
  const {
    t,
    activeTab,
    hasActiveTab,
    browserTabs,
    isBrowserVisible,
    loadingTabId,
    iframeRef,
    iframeBlockedDetected,
    iframeLoadError,
    isEmbedPending,
    validatedUrlsRef,
    activatedTabIdsRef,
  } = useBrowserPanelState();
  const { handleIframeLoad, handleIframeError } = useBrowserPanelActions();
  const inactiveIframeRef = useRef<HTMLIFrameElement | null>(null);
  const isTauri = useAppStore((s) => s.isTauri);

  useEffect(() => {
    if (!window.digitalLife?.browser?.onAudioStateChanged) {
      return;
    }
    const unsub = window.digitalLife.browser.onAudioStateChanged((payload) => {
      useAppStore
        .getState()
        .browserUpdateTabAudioState(payload.tabId, payload.isPlaying, payload.isMuted);
    });
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (isTauri || !activeTab) {
      return;
    }
    const audioMonitor = (window as unknown as Record<string, unknown>)['__adlAudioMonitor'] as
      | { startMonitoring: (tabId: string, iframe: HTMLIFrameElement | null) => void }
      | undefined;
    if (audioMonitor) {
      audioMonitor.startMonitoring(activeTab.id, iframeRef.current);
    }
  }, [activeTab, iframeRef, isTauri]);

  useEffect(() => {
    const currentTabIds = new Set(browserTabs.map((t) => t.id));
    for (const tabId of activatedTabIdsRef.current) {
      if (!currentTabIds.has(tabId)) {
        activatedTabIdsRef.current.delete(tabId);
      }
    }
  }, [browserTabs, activatedTabIdsRef]);

  return (
    <>
      {!activeTab?.url || !hasActiveTab || activeTab?.url === 'about:blank' ? (
        <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser">
          <BrowserLandingPage t={t} />
        </div>
      ) : (
        <div className="adl-browser-iframe-stack">
          {!isTauri &&
            browserTabs.map((tab) => {
              const isActive = tab.id === activeTab?.id;
              const wasActivated = isActive || activatedTabIdsRef.current.has(tab.id);
              const shouldRender =
                wasActivated &&
                !!tab.url &&
                tab.url !== 'about:blank' &&
                validatedUrlsRef.current.has(tab.url);
              if (!wasActivated && isActive) {
                activatedTabIdsRef.current.add(tab.id);
              }
              if (!shouldRender) {
                return null;
              }
              return (
                <div
                  key={tab.id}
                  className="adl-browser-iframe-layer"
                  style={{ display: isActive ? 'block' : 'none' }}
                >
                  <ErrorBoundary
                    t={t}
                    fallback={
                      <ExternalLinkError
                        errorKey="browserCannotOpenEmbedded"
                        activeTabUrl={tab.url!}
                        t={t}
                        variant="active"
                      />
                    }
                  >
                    <SafeIframe
                      iframeRef={isActive ? iframeRef : inactiveIframeRef}
                      src={tab.url!}
                      className="adl-browser-iframe"
                      dataTabId={tab.id}
                      title={tab.title}
                      onLoad={isActive ? handleIframeLoad : () => {}}
                      onError={isActive ? handleIframeError : () => {}}
                      sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                      style={{ display: isBrowserVisible ? undefined : 'none' }}
                    />
                  </ErrorBoundary>
                </div>
              );
            })}

          {isTauri && (
            <BrowserIframeErrorOverlay
              t={t}
              activeTab={activeTab}
              loadingTabId={loadingTabId}
              iframeBlockedDetected={iframeBlockedDetected}
              iframeLoadError={iframeLoadError}
              isEmbedPending={isEmbedPending}
            />
          )}
        </div>
      )}
    </>
  );
});

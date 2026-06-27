import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeIframe } from './SafeIframe';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ExternalLinkError } from './ExternalLinkError';
import { useAppStore } from '../../stores/slicedStore';
import { isTauriShell } from '../../../tauri-bridge';
import { OrbitalLoader } from '../../components/OrbitalLoader';
import { BrowserLandingPage } from './browser-landing';
import type { BrowserTabState } from '../../stores/slices/browserSlice';
import type { CopyDict } from '../../i18n/types';

const IFRAME_POOL_SIZE = 5;

interface BrowserIframeStackProps {
  t: CopyDict;
  activeTab: BrowserTabState | undefined;
  hasActiveTab: boolean;
  browserTabs: BrowserTabState[];
  isBrowserVisible: boolean;
  loadingTabId: string | null;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  iframeBlockedDetected: boolean;
  iframeLoadError: boolean;
  isEmbedPending: boolean;
  validatedUrlsRef: React.MutableRefObject<Set<string>>;
  activatedTabIdsRef: React.MutableRefObject<Set<string>>;
}

export function BrowserIframeStack({
  t,
  activeTab,
  hasActiveTab,
  browserTabs,
  isBrowserVisible,
  loadingTabId,
  iframeRef,
  handleIframeLoad,
  handleIframeError,
  iframeBlockedDetected,
  iframeLoadError,
  isEmbedPending,
  validatedUrlsRef,
  activatedTabIdsRef,
}: BrowserIframeStackProps) {
  const inactiveIframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeLruOrderRef = useRef<string[]>([]);
  const evictedIframeTabsRef = useRef<Set<string>>(new Set());
  const [iframeEvictionVersion, setIframeEvictionVersion] = useState(0);

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
    if (isTauriShell() || !activeTab) {
      return;
    }
    const audioMonitor = (window as unknown as Record<string, unknown>)['__adlAudioMonitor'] as
      | { startMonitoring: (tabId: string, iframe: HTMLIFrameElement | null) => void }
      | undefined;
    if (audioMonitor) {
      audioMonitor.startMonitoring(activeTab.id, iframeRef.current);
    }
  }, [activeTab?.id]);

  useEffect(() => {
    const currentTabIds = new Set(browserTabs.map((t) => t.id));
    for (const tabId of activatedTabIdsRef.current) {
      if (!currentTabIds.has(tabId)) {
        activatedTabIdsRef.current.delete(tabId);
      }
    }
  }, [browserTabs, activatedTabIdsRef]);

  useEffect(() => {
    if (isTauriShell() || !activeTab) {
      return;
    }
    const tabId = activeTab.id;
    let changed = evictedIframeTabsRef.current.delete(tabId);
    iframeLruOrderRef.current = iframeLruOrderRef.current.filter((id) => id !== tabId);
    iframeLruOrderRef.current.push(tabId);
    while (iframeLruOrderRef.current.length > IFRAME_POOL_SIZE) {
      const evictId = iframeLruOrderRef.current.shift();
      if (evictId) {
        evictedIframeTabsRef.current.add(evictId);
        changed = true;
      }
    }
    if (changed) {
      setIframeEvictionVersion((n) => n + 1);
    }
  }, [activeTab, setIframeEvictionVersion]);

  const mergedEvictedTabIds = useMemo(() => {
    const merged = new Set<string>();
    for (const id of evictedIframeTabsRef.current) {
      merged.add(id);
    }
    return merged;
  }, [iframeEvictionVersion]);

  return (
    <>
      {!activeTab?.url ||
      !hasActiveTab ||
      activeTab?.url === 'about:blank' ? (
        <div className="adl-tool-primary__scroll adl-tool-primary__scroll--browser">
          <BrowserLandingPage t={t} />
        </div>
      ) : (
        <div className="adl-browser-iframe-stack">
          {!isTauriShell() &&
            browserTabs.map((tab) => {
              const isActive = tab.id === activeTab?.id;
              const wasActivated = isActive || activatedTabIdsRef.current.has(tab.id);
              const shouldRender =
                wasActivated && !!tab.url && tab.url !== 'about:blank' && validatedUrlsRef.current.has(tab.url);
              if (!isActive && mergedEvictedTabIds.has(tab.id)) {
                return null;
              }
              if (isActive && evictedIframeTabsRef.current.has(tab.id)) {
                evictedIframeTabsRef.current.delete(tab.id);
                setIframeEvictionVersion((n) => n + 1);
              }
              if (!wasActivated && isActive) {
                activatedTabIdsRef.current.add(tab.id);
              }
              if (!shouldRender) {
                return null;
              }
              return (
                <div key={tab.id} className="adl-browser-iframe-layer" style={{ display: isActive ? 'block' : 'none' }}>
                  <ErrorBoundary
                    fallback={
                      <ExternalLinkError errorKey="browserCannotOpenEmbedded" activeTabUrl={tab.url!} t={t} variant="active" />
                    }
                  >
                    <SafeIframe
                      iframeRef={isActive ? iframeRef : inactiveIframeRef}
                      src={tab.url!}
                      className="adl-browser-iframe"
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

          {isTauriShell() &&
            (() => {
              if (!activeTab?.url) {
                return null;
              }
              if (loadingTabId === activeTab.id) {
                return <OrbitalLoader />;
              }
              return (
                <>
                  {iframeBlockedDetected && (
                    <ExternalLinkError
                      errorKey="browserCannotOpenEmbedded"
                      activeTabUrl={activeTab?.url}
                      t={t}
                      variant="blocked"
                    />
                  )}
                  {iframeLoadError && !iframeBlockedDetected && (
                    <ExternalLinkError
                      errorKey="browserConnectionFailed"
                      activeTabUrl={activeTab?.url}
                      t={t}
                      variant="blocked"
                    />
                  )}
                  {isEmbedPending && (
                    <div className="adl-browser-loading">
                      <div className="adl-browser-loading__spinner" />
                    </div>
                  )}
                </>
              );
            })()}
        </div>
      )}
    </>
  );
}

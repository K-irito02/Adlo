import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriShell } from '@shared/env';
import { useAppStore } from '@stores/slicedStore';
import { historyDedupKey } from '@utils/browserDisplayUtils';

interface UseBrowserNavigationOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  iframeHistory: { index: number; entries: string[] };
  navigateBrowser: (url: string) => void;
  activeTabId?: string;
}

/**
 * Max consecutive GoBack steps the smart-back loop will issue while the target
 * URL collapses to the same history dedup key as the starting URL (e.g. Bilibili
 * full-page navigations that each create a trailing-slash variant entry on top of
 * the SPA pushState entry). Bounds the loop so a pathological page can never
 * trigger an unbounded chain.
 */
const SMART_BACK_MAX_STEPS = 6;

/**
 * Decide whether the smart-back loop should keep going after a GoBack landed on
 * `landedUrl`. Pure: returns true when the landed URL still dedups to the same
 * key as the starting URL (so the native stack holds another entry for the same
 * visual page) and we have not exhausted the step budget.
 *
 * A differing hash stops the loop: `#a` → `#b` is a real in-page anchor
 * navigation that must not be skipped (historyDedupKey ignores hash).
 */
export function shouldContinueSmartBack(
  fromUrl: string,
  landedUrl: string,
  steps: number,
): boolean {
  if (steps >= SMART_BACK_MAX_STEPS) {
    return false;
  }
  if (!fromUrl || !landedUrl) {
    return false;
  }
  if (hashOf(fromUrl) !== hashOf(landedUrl)) {
    return false;
  }
  return historyDedupKey(fromUrl) === historyDedupKey(landedUrl);
}

function hashOf(url: string): string {
  try {
    return new URL(url).hash;
  } catch {
    return '';
  }
}

/**
 * Derive whether the back/forward toolbar buttons should be enabled for the
 * iframe navigation stack used in browser (non-Tauri) mode. `index` is the
 * current position; there is history behind it when `index > 0` and ahead of
 * it when `index` is before the last entry. Pure so it can be unit-tested for
 * dual-end (Tauri vs browser) button parity.
 */
export function deriveIframeCanNavigate(
  index: number,
  entryCount: number,
): {
  canGoBack: boolean;
  canGoForward: boolean;
} {
  return {
    canGoBack: index > 0,
    canGoForward: index >= 0 && index < entryCount - 1,
  };
}

export function useBrowserNavigation(options: UseBrowserNavigationOptions) {
  const { iframeRef, iframeHistory, navigateBrowser, activeTabId } = options;
  /** Guards against re-entrancy: a smart-back chain in progress for a tab. */
  const smartBackRunningRef = useRef<Set<string>>(new Set());

  /**
   * Issue one native GoBack, then wait for the resulting url-changed events to
   * settle (WebView2 can emit more than one per navigation, e.g. a trailing-slash
   * + normalized variant), and if the final landed URL still dedups to the same
   * key as the starting URL, issue another GoBack — the native stack holds
   * multiple entries for what is visually one page (Bilibili: full-page
   * navigation adds a trailing-slash/tracking-param entry on top of the SPA
   * pushState entry). Debounced so a single GoBack's burst of url-changed events
   * drives exactly one follow-up step.
   */
  const smartGoBack = useCallback((tabId: string, fromUrl: string) => {
    if (smartBackRunningRef.current.has(tabId)) {
      return;
    }
    smartBackRunningRef.current.add(tabId);

    let steps = 0;
    let unlisten: (() => void) | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let guardTimer: ReturnType<typeof setTimeout> | null = null;
    let lastLandedUrl = '';
    let cancelled = false;

    const stop = () => {
      cancelled = true;
      smartBackRunningRef.current.delete(tabId);
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (guardTimer) {
        clearTimeout(guardTimer);
        guardTimer = null;
      }
      unlisten?.();
    };

    const settleAndMaybeContinue = () => {
      settleTimer = null;
      if (cancelled || !shouldContinueSmartBack(fromUrl, lastLandedUrl, steps)) {
        stop();
        return;
      }
      // Also stop when the WebView reports it can no longer go back (reached the
      // bottom of the native stack — e.g. back on the first page of a tab that
      // was opened into a video directly). Otherwise the loop would keep issuing
      // no-op GoBack calls while the back button still shows enabled.
      void window.digitalLife?.browser
        ?.canGoBackTab(tabId)
        .then((can) => {
          if (cancelled) {
            return;
          }
          if (!can) {
            // Reached the bottom of the native stack — reflect it immediately so
            // the back button turns transparent without waiting for a later
            // url-changed refresh.
            setTauriCanGoBack(false);
            stop();
            return;
          }
          steps++;
          lastLandedUrl = '';
          void window.digitalLife?.browser
            ?.goBackTab(tabId)
            .then((issued) => {
              if (cancelled) {
                return;
              }
              if (!issued) {
                stop();
              }
            })
            .catch((err) => {
              if (!cancelled) {
                console.warn('browser navigate back failed', err);
              }
              stop();
            });
        })
        .catch(() => {
          // Can't determine can_go_back — stop to be safe.
          stop();
        });
    };

    unlisten = window.digitalLife?.browser?.onUrlChanged((eventTabId, url) => {
      if (eventTabId !== tabId) {
        return;
      }
      // Debounce: a single GoBack can produce several url-changed events
      // (e.g. slash variant then normalized variant). Only the last one within
      // the settle window drives the next step.
      lastLandedUrl = url;
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      settleTimer = setTimeout(settleAndMaybeContinue, 300);
    });

    void window.digitalLife?.browser
      ?.goBackTab(tabId)
      .then((issued) => {
        if (cancelled) {
          return;
        }
        if (!issued) {
          stop();
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('browser navigate back failed', err);
        }
        stop();
      });

    // Total safety net: never leave a tab in the smart-back state.
    guardTimer = setTimeout(stop, 3000);
  }, []);

  const handleGoBack = useCallback(() => {
    if (isTauriShell()) {
      if (!activeTabId) {
        return;
      }
      const s = useAppStore.getState();
      const tab = s.browserTabs.find((t) => t.id === activeTabId);
      const fromUrl = tab?.url || '';
      smartGoBack(activeTabId, fromUrl);
    } else if (
      iframeRef.current &&
      iframeHistory.index > 0 &&
      iframeHistory.entries[iframeHistory.index - 1]
    ) {
      navigateBrowser(iframeHistory.entries[iframeHistory.index - 1]);
    }
  }, [iframeRef, iframeHistory, navigateBrowser, activeTabId, smartGoBack]);

  const handleGoForward = useCallback(() => {
    if (isTauriShell()) {
      if (!activeTabId) {
        return;
      }
      window.digitalLife?.browser?.goForwardTab(activeTabId).catch((err) => {
        console.warn('browser navigate forward failed', err);
      });
    } else if (
      iframeRef.current &&
      iframeHistory.index < iframeHistory.entries.length - 1 &&
      iframeHistory.entries[iframeHistory.index + 1]
    ) {
      navigateBrowser(iframeHistory.entries[iframeHistory.index + 1]);
    }
  }, [iframeRef, iframeHistory, navigateBrowser, activeTabId]);

  const handleReload = useCallback(() => {
    if (isTauriShell()) {
      if (!activeTabId) {
        return;
      }
      window.digitalLife?.browser?.reloadTab(activeTabId).catch((err) => {
        console.warn('browser reload failed', err);
      });
    } else if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.location.reload();
    }
  }, [iframeRef, activeTabId]);

  // Track whether the active tab's WebView can go back/forward in its native
  // history. A freshly-opened tab (e.g. a Bilibili video opened from the
  // homepage) has no previous entry, so the back button must render disabled.
  // In browser (non-Tauri) mode there is no native WebView — the buttons are
  // instead driven by the iframe navigation stack, so both modes must derive a
  // usable state here to keep the toolbar behavior consistent (dual-end parity).
  const [tauriCanGoBack, setTauriCanGoBack] = useState(false);
  const [tauriCanGoForward, setTauriCanGoForward] = useState(false);

  const { canGoBack: iframeCanGoBack, canGoForward: iframeCanGoForward } = deriveIframeCanNavigate(
    iframeHistory.index,
    iframeHistory.entries.length,
  );

  const refreshCanNavigate = useCallback(async () => {
    if (!isTauriShell() || !activeTabId) {
      return;
    }
    const bridge = window.digitalLife?.browser;
    if (!bridge) {
      return;
    }
    try {
      const [back, forward] = await Promise.all([
        bridge.canGoBackTab(activeTabId),
        bridge.canGoForwardTab(activeTabId),
      ]);
      setTauriCanGoBack(back);
      setTauriCanGoForward(forward);
    } catch {
      // Keep the last known state; a failed query is not a reason to flash the
      // buttons between enabled/disabled.
    }
  }, [activeTabId]);

  useEffect(() => {
    void refreshCanNavigate();
  }, [refreshCanNavigate, activeTabId]);

  // Re-query after the WebView reports a URL change (navigation history may
  // have shifted: reached a dead end, or gained a forward entry after going back).
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const bridge = window.digitalLife?.browser;
    if (!bridge) {
      return;
    }
    const unsub = bridge.onUrlChanged((tabId) => {
      if (tabId === activeTabId) {
        void refreshCanNavigate();
      }
    });
    return () => {
      unsub();
    };
  }, [activeTabId, refreshCanNavigate]);

  const canGoBack = isTauriShell() ? tauriCanGoBack : iframeCanGoBack;
  const canGoForward = isTauriShell() ? tauriCanGoForward : iframeCanGoForward;

  return { handleGoBack, handleGoForward, handleReload, canGoBack, canGoForward };
}

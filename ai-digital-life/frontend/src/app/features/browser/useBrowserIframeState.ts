import { useCallback, useEffect, useRef, useState } from 'react';
import { checkEmbed, isEmbedBlocked } from './checkEmbed';
import { isTauriShell } from '@shared/env';
import type { BrowserTabState } from '@stores/slices/browserSlice';

interface UseBrowserIframeStateOptions {
  activeTab?: BrowserTabState;
}

/**
 * BrowserPanel iframe 状态子 Hook：
 * - 持有 iframe 元素引用、错误/阻断状态与历史记录栈
 * - 提供 navigateBrowser（写入 iframe src 并维护历史）与 markUrlSeen
 * - 在 activeTab.url 变化时执行嵌入可达性校验（同步缓存 + 异步 checkEmbed）
 *
 * 该 Hook 不直接消费 i18n；外部 Toast / PageMeta 由编排层处理。
 */
export function useBrowserIframeState({ activeTab }: UseBrowserIframeStateOptions) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const activeTabRef = useRef(activeTab);
  const expectedNavigationUrlRef = useRef<string | null>(null);
  const validatedUrlsRef = useRef(new Set<string>());
  const recentNavigatedUrlsRef = useRef<Map<string, number>>(new Map());
  const [, forceRender] = useState(0);

  const [iframeLoadError, setIframeLoadError] = useState(false);
  const [iframeBlockedDetected, setIframeBlockedDetected] = useState(false);
  const [iframeHistory, setIframeHistory] = useState<{ index: number; entries: string[] }>({
    index: -1,
    entries: [],
  });

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const markUrlSeen = useCallback((url: string) => {
    recentNavigatedUrlsRef.current.set(url, Date.now());
  }, []);

  const navigateBrowser = useCallback((url: string) => {
    if (iframeRef.current) {
      setIframeHistory((prev) => {
        const newEntries = prev.entries.slice(0, prev.index + 1);
        newEntries.push(url);
        if (newEntries.length > 50) {
          newEntries.shift();
        }
        return { index: newEntries.length - 1, entries: newEntries };
      });
      try {
        iframeRef.current.src = url;
      } catch {
        /* fail silently */
      }
    }
  }, []);

  // Validate active tab URL before allowing iframe to render
  // Handles page reload, bookmark/history clicks, and tab switches
  useEffect(() => {
    const url = activeTab?.url;
    if (!url || url === 'about:blank' || isTauriShell()) {
      return;
    }

    setIframeLoadError(false);
    setIframeBlockedDetected(false);

    if (validatedUrlsRef.current.has(url)) {
      return;
    }

    const cached = isEmbedBlocked(url);
    if (cached !== undefined) {
      if (cached) {
        setIframeBlockedDetected(true);
        setIframeLoadError(true);
      } else {
        validatedUrlsRef.current.add(url);
        forceRender((v) => v + 1);
      }
      return;
    }

    checkEmbed(url).then((blocked) => {
      if (blocked) {
        setIframeBlockedDetected(true);
        setIframeLoadError(true);
      } else {
        validatedUrlsRef.current.add(url);
        setIframeLoadError(false);
        setIframeBlockedDetected(false);
        forceRender((v) => v + 1);
      }
    });
  }, [activeTab?.url, setIframeBlockedDetected, setIframeLoadError, forceRender]);

  return {
    iframeRef,
    activeTabRef,
    expectedNavigationUrlRef,
    validatedUrlsRef,
    recentNavigatedUrlsRef,
    iframeLoadError,
    setIframeLoadError,
    iframeBlockedDetected,
    setIframeBlockedDetected,
    iframeHistory,
    setIframeHistory,
    markUrlSeen,
    navigateBrowser,
  };
}

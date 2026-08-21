import { useState, useEffect, useCallback, useRef } from 'react';
import { getFaviconUrl } from '../utils/favicon';
import {
  subscribeSiteMeta,
  subscribeSiteMetaReady,
  isSiteMetaCacheReady,
  initSiteMetaCache,
  isSiteMetaResolved,
  isFaviconConfirmed,
} from '../utils/siteMetaCache';
import { pageMetaClient } from '../utils/pageMetaClient';
import { IconNewTabPage, type IconSize } from '../icons';

const EXTERNAL_FAVICON_TIMEOUT_MS = 3000;

/**
 * 取站点首字母作为终级兜底：解析 host 首字符，字母转大写；
 * 数字、非字母（如 '-'、'_'）或解析失败统一回退 '#'。
 */
function siteInitial(url: string): string {
  try {
    const first = new URL(url).hostname.charAt(0).toUpperCase();
    return /[A-Z]/.test(first) ? first : '#';
  } catch {
    return '#';
  }
}

interface BrowserFaviconProps {
  url: string;
  size?: IconSize;
}

export function BrowserFavicon({ url, size = 14 }: BrowserFaviconProps) {
  const [ready, setReady] = useState(isSiteMetaCacheReady());
  const [faviconUrl, setFaviconUrl] = useState('');
  const [degraded, setDegraded] = useState(false);
  const [imgReady, setImgReady] = useState(false);
  const faviconUrlRef = useRef('');
  const resolvedRef = useRef(url ? isSiteMetaResolved(url) : false);
  const [resolved, setResolved] = useState(resolvedRef.current);

  const applyMetaUpdate = useCallback(() => {
    const prev = faviconUrlRef.current;
    const next = url ? getFaviconUrl(url) : '';
    if (prev !== next) {
      faviconUrlRef.current = next;
      setFaviconUrl(next);
      setDegraded(false);
      setImgReady(false);
      console.info(`[ADL-BROWSER-FAVICON] meta update: ${url?.slice(0, 80)} → ${next ? (next.startsWith('data:') ? 'data-URI' : next.slice(0, 80)) : 'empty'}`);
    }
    const r = url ? isSiteMetaResolved(url) : false;
    if (r !== resolvedRef.current) {
      resolvedRef.current = r;
      setResolved(r);
    }
  }, [url]);

  useEffect(() => {
    void initSiteMetaCache();
    if (isSiteMetaCacheReady()) {
      setReady(true);
    }
    const unsubReady = subscribeSiteMetaReady(() => setReady(true));
    return unsubReady;
  }, []);

  useEffect(() => {
    applyMetaUpdate();
    if (!url) {
      return;
    }
    const unsubMeta = subscribeSiteMeta(url, applyMetaUpdate);
    const unsubUpdated = pageMetaClient.subscribeUpdated((p) => {
      if (p.url === url) {
        applyMetaUpdate();
      }
    });
    return () => {
      unsubMeta();
      unsubUpdated();
    };
  }, [url, ready, applyMetaUpdate]);

  useEffect(() => {
    const src = faviconUrlRef.current;
    if (!src || src.startsWith('data:')) {
      return;
    }
    const confirmed = url ? isFaviconConfirmed(url) : false;
    if (confirmed) {
      return;
    }
    console.info(`[ADL-BROWSER-FAVICON] preload check: ${url?.slice(0, 80)} confirmed=${confirmed} src=${src.slice(0, 80)}`);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        console.warn(`[ADL-BROWSER-FAVICON] external favicon timeout (${EXTERNAL_FAVICON_TIMEOUT_MS}ms): ${url?.slice(0, 80)} (src: ${src.slice(0, 80)})`);
        setDegraded(true);
        controller.abort();
      }
    }, EXTERNAL_FAVICON_TIMEOUT_MS);

    const img = new Image();
    img.onload = () => {
      clearTimeout(timer);
      if (!controller.signal.aborted) {
        console.info(`[ADL-BROWSER-FAVICON] external favicon loaded: ${url?.slice(0, 80)} (src: ${src.slice(0, 80)})`);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      if (!controller.signal.aborted) {
        console.warn(`[ADL-BROWSER-FAVICON] external favicon failed: ${url?.slice(0, 80)} (src: ${src.slice(0, 80)})`);
        setDegraded(true);
        controller.abort();
      }
    };
    img.src = src;

    return () => {
      clearTimeout(timer);
      controller.abort();
      img.onload = null;
      img.onerror = null;
    };
  }, [faviconUrl, url]);

  // 未命中/未就绪：显示占位图标（非空白）
  const current = faviconUrl;
  const isDataUri = current.startsWith('data:');
  const showImg = Boolean(current) && !degraded && (isDataUri || imgReady);
  const handleError = useCallback(() => {
    console.warn(`[ADL-BROWSER-FAVICON] img load failed, degrading: ${url?.slice(0, 80)} (src: ${faviconUrlRef.current?.startsWith('data:') ? 'data-URI' : faviconUrlRef.current?.slice(0, 80)})`);
    setDegraded(true);
  }, [url]);

  const handleLoad = useCallback(() => {
    setImgReady(true);
    console.info(`[ADL-BROWSER-FAVICON] img loaded: ${url?.slice(0, 80)} (src: ${faviconUrlRef.current?.startsWith('data:') ? 'data-URI' : faviconUrlRef.current?.slice(0, 80)})`);
  }, [url]);

  // 新标签页（无 URL/about:blank）没有站点 favicon：显示内置"新标签页"图标，
  // 避免空白占位（用户 2026-08-20 报告：open 模式下新建标签页标签图标缺失）。
  if (!url || url === 'about:blank') {
    return (
      <span className="adl-filetree__file-icon adl-filetree__file-icon--default">
        <IconNewTabPage size={size} decorative />
      </span>
    );
  }

  return (
    <span
      className={`adl-filetree__file-icon ${showImg ? 'adl-filetree__file-icon--favicon' : 'adl-filetree__file-icon--default'}`}
    >
      {showImg && (
        <img
          src={current}
          alt=""
          className="adl-browser-tree__favicon"
          style={{ width: size, height: size, transition: 'opacity 0.15s ease-in-out' }}
          onError={handleError}
          onLoad={handleLoad}
        />
      )}
      <span
        className="adl-browser-tree__link-fallback"
        style={showImg ? { display: 'none' } : undefined}
      >
        {showImg ? '' : resolved ? siteInitial(url) : ''}
      </span>
    </span>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { getFaviconUrl, getGoogleFaviconUrl } from '../utils/favicon';
import {
  subscribeSiteMeta,
  subscribeSiteMetaReady,
  isSiteMetaCacheReady,
  initSiteMetaCache,
} from '../utils/siteMetaCache';
import { pageMetaClient } from '../utils/pageMetaClient';
import { IconLink, type IconSize } from '../icons';

interface BrowserFaviconProps {
  url: string;
  size?: IconSize;
}

export function BrowserFavicon({ url, size = 14 }: BrowserFaviconProps) {
  const [ready, setReady] = useState(isSiteMetaCacheReady());
  const [faviconUrl, setFaviconUrl] = useState('');
  // 渲染降级状态（React 驱动，避免 DOM 直接操作导致 display:none 残留）：
  // 真实图标与 Google S2 均加载失败时置 true → 显示内置占位图标；新图标到来时重置
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    void initSiteMetaCache();
    if (isSiteMetaCacheReady()) setReady(true);
    const unsubReady = subscribeSiteMetaReady(() => setReady(true));
    return unsubReady;
  }, []);

  useEffect(() => {
    setFaviconUrl(url ? getFaviconUrl(url) : '');
    setDegraded(false);
    if (!url) return;
    const unsubMeta = subscribeSiteMeta(url, () => setFaviconUrl(getFaviconUrl(url)));
    const unsubUpdated = pageMetaClient.subscribeUpdated((p) => {
      if (p.url === url) {
        setFaviconUrl(getFaviconUrl(url));
        setDegraded(false);
      }
    });
    return () => { unsubMeta(); unsubUpdated(); };
  }, [url, ready]);

  // 未命中/未就绪：显示占位图标（非空白）
  const current = faviconUrl;
  const showImg = Boolean(current) && !degraded;
  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    // 本次降级显示：先切 Google S2；再失败则置 degraded（显示内置图标）。绝不删缓存
    const img = e.target as HTMLImageElement;
    if (!img.src.includes('google.com/s2/favicons')) {
      const fallback = getGoogleFaviconUrl(url);
      if (fallback) { img.src = fallback; return; }
    }
    setDegraded(true);
  }, [url]);

  return (
    <span className={`adl-filetree__file-icon ${showImg ? 'adl-filetree__file-icon--favicon' : 'adl-filetree__file-icon--default'}`}>
      {showImg && (
        <img
          src={current}
          alt=""
          className="adl-browser-tree__favicon"
          style={{ width: size, height: size, transition: 'opacity 0.15s ease-in-out' }}
          onError={handleError}
        />
      )}
      <IconLink
        size={size}
        decorative
        className="adl-browser-tree__link-fallback"
        style={showImg ? { display: 'none' } : undefined}
      />
    </span>
  );
}

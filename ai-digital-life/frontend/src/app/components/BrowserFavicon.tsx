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

  useEffect(() => {
    void initSiteMetaCache();
    if (isSiteMetaCacheReady()) setReady(true);
    const unsubReady = subscribeSiteMetaReady(() => setReady(true));
    return unsubReady;
  }, []);

  useEffect(() => {
    setFaviconUrl(url ? getFaviconUrl(url) : '');
    if (!url) return;
    const unsubMeta = subscribeSiteMeta(url, () => setFaviconUrl(getFaviconUrl(url)));
    const unsubUpdated = pageMetaClient.subscribeUpdated((p) => {
      if (p.url === url) setFaviconUrl(getFaviconUrl(url));
    });
    return () => { unsubMeta(); unsubUpdated(); };
  }, [url, ready]);

  // 未命中/未就绪：显示占位图标（非空白）
  const current = faviconUrl;
  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    // 本次降级显示：切换到 Google S2 或隐藏 img 显示内置图标；绝不删缓存
    const img = e.target as HTMLImageElement;
    if (!img.src.includes('google.com/s2/favicons')) {
      const fallback = getGoogleFaviconUrl(url);
      if (fallback) { img.src = fallback; return; }
    }
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent) {
      parent.classList.remove('adl-filetree__file-icon--favicon');
      parent.classList.add('adl-filetree__file-icon--default');
    }
  }, [url]);

  return (
    <span className={`adl-filetree__file-icon ${current ? 'adl-filetree__file-icon--favicon' : 'adl-filetree__file-icon--default'}`}>
      {current && (
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
        style={current ? { display: 'none' } : undefined}
      />
    </span>
  );
}

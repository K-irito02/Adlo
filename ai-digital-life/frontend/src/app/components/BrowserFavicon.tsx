import { useState, useEffect, useCallback } from 'react';
import { getFaviconUrl } from '../utils/favicon';
import {
  subscribeSiteMeta,
  subscribeSiteMetaReady,
  isSiteMetaCacheReady,
  initSiteMetaCache,
} from '../utils/siteMetaCache';
import { pageMetaClient } from '../utils/pageMetaClient';
import { IconWorld, type IconSize } from '../icons';

interface BrowserFaviconProps {
  url: string;
  size?: IconSize;
}

export function BrowserFavicon({ url, size = 14 }: BrowserFaviconProps) {
  const [ready, setReady] = useState(isSiteMetaCacheReady());
  const [faviconUrl, setFaviconUrl] = useState('');
  // 渲染降级状态（React 驱动，避免 DOM 直接操作导致 display:none 残留）：
  // 真实图标加载失败时置 true → 显示内置占位图标；新图标到来时重置（Fix D：
  // 不再重试 Google S2 代理——被墙/不稳定，且对无收录域名返回默认图标）。
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    void initSiteMetaCache();
    if (isSiteMetaCacheReady()) {
      setReady(true);
    }
    const unsubReady = subscribeSiteMetaReady(() => setReady(true));
    return unsubReady;
  }, []);

  useEffect(() => {
    setFaviconUrl(url ? getFaviconUrl(url) : '');
    setDegraded(false);
    if (!url) {
      return;
    }
    const unsubMeta = subscribeSiteMeta(url, () => {
      setFaviconUrl(getFaviconUrl(url));
      setDegraded(false);
    });
    const unsubUpdated = pageMetaClient.subscribeUpdated((p) => {
      if (p.url === url) {
        setFaviconUrl(getFaviconUrl(url));
        setDegraded(false);
      }
    });
    return () => {
      unsubMeta();
      unsubUpdated();
    };
  }, [url, ready]);

  // 未命中/未就绪：显示占位图标（非空白）
  const current = faviconUrl;
  const showImg = Boolean(current) && !degraded;
  const handleError = useCallback(() => {
    // 真实图标加载失败 → 直接降级为内置占位图标（Fix D：不再重试 Google S2）。
    // 绝不删除缓存：后续广播更新会重置 degraded 并尝试新图标。
    setDegraded(true);
  }, []);

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
        />
      )}
      <IconWorld
        size={size}
        decorative
        className="adl-browser-tree__link-fallback"
        style={showImg ? { display: 'none' } : undefined}
      />
    </span>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
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
  // DEBUG(问题1): 记录初始渲染状态，用于判断是否在缓存水合前就显示了兜底图标
  console.warn('[browser-favicon] render', {
    url,
    ready: isSiteMetaCacheReady(),
    cached: getFaviconUrl(url),
  });
  // 渲染降级状态（React 驱动，避免 DOM 直接操作导致 display:none 残留）：
  // 真实图标加载失败时置 true → 显示内置占位图标；新图标到来时重置（Fix D：
  // 不再重试 Google S2 代理——被墙/不稳定，且对无收录域名返回默认图标）。
  const [degraded, setDegraded] = useState(false);
  // 同步 faviconUrl 的 ref：镜像更新时对比是否真的变化（L6）。
  // 仅在 faviconUrl 变化时重置降级态——未变化时保持降级，避免每次广播
  // 重挂 img → 404 → 再降级的闪烁。
  const faviconUrlRef = useRef('');

  const applyMetaUpdate = useCallback(() => {
    const prev = faviconUrlRef.current;
    const next = url ? getFaviconUrl(url) : '';
    // DEBUG(问题1): 记录 favicon 从兜底/旧值切换到新值的过程，含缓存命中来源
    if (prev !== next) {
      console.warn('[browser-favicon] applyMetaUpdate changed', {
        url,
        prev,
        next,
        nextLen: next.length,
        isDataUri: next.startsWith('data:'),
        ready,
      });
      faviconUrlRef.current = next;
      setFaviconUrl(next);
      setDegraded(false);
    }
  }, [url, ready]);

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

  // 未命中/未就绪：显示占位图标（非空白）
  const current = faviconUrl;
  const showImg = Boolean(current) && !degraded;
  const handleError = useCallback(() => {
    // DEBUG(问题1): 真实图标加载失败 → 降级为内置占位图标
    console.warn('[browser-favicon] real favicon load failed', { url, faviconUrl });
    // 真实图标加载失败 → 直接降级为内置占位图标（Fix D：不再重试 Google S2）。
    // 绝不删除缓存：后续广播更新会重置 degraded 并尝试新图标。
    setDegraded(true);
  }, [url, faviconUrl]);

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

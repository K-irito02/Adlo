import { useState, useEffect, useCallback, useRef } from 'react';
import { getFaviconUrl } from '../utils/favicon';
import {
  subscribeSiteMeta,
  subscribeSiteMetaReady,
  isSiteMetaCacheReady,
  initSiteMetaCache,
  isSiteMetaResolved,
  normalizeUrlForCache,
} from '../utils/siteMetaCache';
import { pageMetaClient } from '../utils/pageMetaClient';
import { IconNewTabPage, type IconSize } from '../icons';
import { Spinner } from '@components/Spinner';

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
    const unsubReady = subscribeSiteMetaReady(() => {
      setReady(true);
    });
    return unsubReady;
  }, []);

  useEffect(() => {
    applyMetaUpdate();
    if (!url) {
      return;
    }
    const unsubMeta = subscribeSiteMeta(url, applyMetaUpdate);
    const unsubUpdated = pageMetaClient.subscribeUpdated((p) => {
      if (normalizeUrlForCache(p.url) === normalizeUrlForCache(url)) {
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
  const isLoading = !resolved && !current && !degraded;
  const handleError = useCallback(() => {
    setDegraded(true);
  }, []);

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
        />
      )}
      {isLoading && <Spinner size="sm" speed="normal" />}
      <span
        className="adl-browser-tree__link-fallback"
        style={showImg || isLoading ? { display: 'none' } : undefined}
      >
        {showImg || isLoading ? '' : resolved ? siteInitial(url) : ''}
      </span>
    </span>
  );
}

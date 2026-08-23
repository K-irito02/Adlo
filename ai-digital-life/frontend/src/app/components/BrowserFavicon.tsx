import { useState, useEffect, useCallback, useRef } from 'react';
import { getFaviconUrl } from '../utils/favicon';
import {
  subscribeSiteMeta,
  subscribeSiteMetaReady,
  isSiteMetaCacheReady,
  initSiteMetaCache,
  isSiteMetaResolvedOrRedirected,
  normalizeUrlForCache,
  getRedirectTarget,
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
  const resolvedRef = useRef(url ? isSiteMetaResolvedOrRedirected(url) : false);
  const [resolvedFaviconEmpty, setResolvedFaviconEmpty] = useState(false);

  const applyMetaUpdate = useCallback(() => {
    const prev = faviconUrlRef.current;
    const next = url ? getFaviconUrl(url) : '';
    if (prev !== next) {
      faviconUrlRef.current = next;
      setFaviconUrl(next);
      setDegraded(false);
    }
    const r = url ? isSiteMetaResolvedOrRedirected(url) : false;
    if (r !== resolvedRef.current) {
      resolvedRef.current = r;
    }
    // 已结算但 favicon URL 仍为空，标记为"确认无 favicon"（无条件检查，处理初始已结算场景）
    if (r && !next) {
      setResolvedFaviconEmpty(true);
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
    // 跨域重定向场景：元数据广播以重定向目标 URL 到达，原始 URL 的订阅收不到，
    // 额外订阅目标 URL，使 favicon 在目标数据落地后立即刷新（参考 Chromium
    // `page_url_type`/重定向链语义）。
    const redirectTarget = getRedirectTarget(url);
    const unsubTargetMeta =
      redirectTarget && redirectTarget !== normalizeUrlForCache(url)
        ? subscribeSiteMeta(redirectTarget, applyMetaUpdate)
        : () => {};
    const unsubUpdated = pageMetaClient.subscribeUpdated((p) => {
      const norm = normalizeUrlForCache(p.url);
      if (norm === normalizeUrlForCache(url) || (redirectTarget && norm === redirectTarget)) {
        applyMetaUpdate();
      }
    });
    return () => {
      unsubMeta();
      unsubTargetMeta();
      unsubUpdated();
    };
  }, [url, ready, applyMetaUpdate]);

  // 跨域重定向等场景：URL 永远不会被结算（元数据存储在重定向后的域名下），
  // 超时后降级为兜底字母，避免 spinner 永久旋转
  useEffect(() => {
    if (!url || resolvedFaviconEmpty || faviconUrlRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      if (!faviconUrlRef.current && !resolvedRef.current) {
        setResolvedFaviconEmpty(true);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [url, resolvedFaviconEmpty]);

  // 未命中/未就绪：显示占位图标（非空白）
  const current = faviconUrl;
  const showImg = Boolean(current) && !degraded;
  // 已结算但 favicon URL 仍为空时继续显示 spinner，避免"加载中 → 兜底字母 → 真实图标"的闪烁
  const isLoading = !current && !degraded && !resolvedFaviconEmpty;
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
        {showImg || isLoading ? '' : resolvedFaviconEmpty ? siteInitial(url) : ''}
      </span>
    </span>
  );
}

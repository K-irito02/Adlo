import { useState, useEffect, useCallback, useRef } from 'react';
import { getFaviconUrl } from '../utils/favicon';
import {
  subscribeSiteMeta,
  subscribeSiteMetaReady,
  isSiteMetaCacheReady,
  initSiteMetaCache,
  isSiteMetaResolved,
  persistFaviconUrl,
} from '../utils/siteMetaCache';
import { pageMetaClient } from '../utils/pageMetaClient';
import { IconNewTabPage, type IconSize } from '../icons';

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
  const backfillTriggeredRef = useRef('');
  const resolvedRef = useRef(url ? isSiteMetaResolved(url) : false);
  const [resolved, setResolved] = useState(resolvedRef.current);

  const applyMetaUpdate = useCallback(() => {
    const prev = faviconUrlRef.current;
    const next = url ? getFaviconUrl(url) : '';
    if (prev !== next) {
      faviconUrlRef.current = next;
      setFaviconUrl(next);
      setDegraded(false);
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

  // data-URI 回填触发：当前 favicon 是外部 URL（缺 data-URI）时，调用
  // pageMetaClient.get(url, { force: true }) 走 Rust `browser_page_meta_get` 的
  // force 路径 → fetch_silent_meta 创建 silent webview 渲染页面 → **WebView2 原生
  // GetFavicon 获取 favicon 字节**（WebView2 用自己的网络栈，能访问 reqwest 无法
  // 直连的站点，如无代理环境下的 YouTube）→ data-URI 持久化 SQLite 并广播回前端。
  //
  // 背景：persistFaviconUrl 把外部 faviconUrl 落库后，warmup 会因 faviconUrl 非空
  // 视为"有效缓存"跳过静默渲染，导致 data-URI 永不生成。此处在组件渲染时显式
  // force 补触发一次（幂等：同一 URL 只触发一次，直到 data-URI 落地）。
  useEffect(() => {
    if (!url || !faviconUrl || faviconUrl.startsWith('data:')) {
      return;
    }
    if (backfillTriggeredRef.current === url) {
      return;
    }
    backfillTriggeredRef.current = url;
    console.info(
      `[ADL-BROWSER-FAVICON] triggering WebView2 data-URI backfill: ${url.slice(0, 80)} (src: ${faviconUrl.slice(0, 80)})`,
    );
    void pageMetaClient.get(url, { force: true });
  }, [url, faviconUrl]);

  // 未命中/未就绪：显示占位图标（非空白）
  const current = faviconUrl;
  const showImg = Boolean(current) && !degraded;
  const handleError = useCallback(() => {
    console.warn(`[ADL-BROWSER-FAVICON] img load failed, degrading: ${url?.slice(0, 80)} (src: ${faviconUrlRef.current?.startsWith('data:') ? 'data-URI' : faviconUrlRef.current?.slice(0, 80)})`);
    setDegraded(true);
  }, [url]);

  // 外部 URL 成功加载 → 回写 SQLite（Chrome/Edge 式兜底持久化）：
  // 即使 data-URI 生成失败（CORS/无代理），URL 也落库，重启后水合命中立即显示。
  const handleLoad = useCallback(() => {
    const src = faviconUrlRef.current;
    if (!src || src.startsWith('data:')) {
      return;
    }
    console.info(
      `[ADL-BROWSER-FAVICON] external favicon loaded & persisted: ${url?.slice(0, 80)} (src: ${src.slice(0, 80)})`,
    );
    void persistFaviconUrl(url, src);
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

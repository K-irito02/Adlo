import { useState, useEffect, useCallback, useRef } from 'react';
import { getFaviconUrl } from '../utils/favicon';
import {
  subscribeSiteMetaGlobal,
  subscribeSiteMetaReady,
  isSiteMetaCacheReady,
  initSiteMetaCache,
  isSiteMetaResolvedOrRedirected,
  normalizeUrlForCache,
  getRedirectTarget,
} from '../utils/siteMetaCache';
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
  /**
   * 未结算（站点元数据镜像里既无条目也无图标）时的占位表现。
   *
   * - `'spinner'`（默认）：确实有在途抓取预期（打开的标签页、标签条）→ 转圈，
   *   并在 5s 后仍无结果时降级为首字母。
   * - `'initial'`：被动列表（书签/历史树行）→ 直接显示站点首字母，不转圈、
   *   不挂 5s 计时器；真实图标到达后原地替换（书签树每次展开不再重复转圈）。
   */
  pending?: 'spinner' | 'initial';
}

/**
 * `<img>` 加载失败的重试预算与间隔。
 *
 * 失败可能是**瞬时的**——典型：应用启动时标签已恢复、站点元数据镜像里已有 favicon URL，
 * 但本地服务（如 dsh）尚未就绪，首次 `<img>` 请求被拒。若一次性永久降级为兜底字母，
 * 服务随后就绪也不会恢复（且相同 URL 的元数据广播因 `prev === next` 不会清降级）。
 * 故在此做有限次重试；耗尽后仍失败才永久降级（避免"永远闪烁"）。
 */
const FAVICON_RETRY_MAX = 6;
const FAVICON_RETRY_DELAY_MS = 2000;

export function BrowserFavicon({ url, size = 14, pending = 'spinner' }: BrowserFaviconProps) {
  const [ready, setReady] = useState(isSiteMetaCacheReady());
  const [faviconUrl, setFaviconUrl] = useState('');
  const [degraded, setDegraded] = useState(false);
  const faviconUrlRef = useRef('');
  const [resolvedFaviconEmpty, setResolvedFaviconEmpty] = useState(false);
  // 重试预算/计时器 + 强制重挂 <img> 的 key（瞬时失败恢复用）。
  const [retryKey, setRetryKey] = useState(0);
  const retryLeftRef = useRef(FAVICON_RETRY_MAX);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const applyMetaUpdate = useCallback(() => {
    const prev = faviconUrlRef.current;
    const next = url ? getFaviconUrl(url) : '';
    if (prev !== next) {
      faviconUrlRef.current = next;
      setFaviconUrl(next);
      setDegraded(false);
      // 拿到（变化的）favicon → 重置重试预算并取消在途重试。
      retryLeftRef.current = FAVICON_RETRY_MAX;
      clearRetryTimer();
    }
    // 已结算但 favicon URL 仍为空，标记为"确认无 favicon"（无条件检查，处理初始已结算场景）
    if (url && isSiteMetaResolvedOrRedirected(url) && !next) {
      setResolvedFaviconEmpty(true);
    }
  }, [url, clearRetryTimer]);

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

  // URL 变化时重置状态：`resolvedFaviconEmpty`/`degraded` 是单向闩锁，
  // 复用组件实例切换 URL 时若不重置，新 URL（未结算）会跳过 spinner 直接
  // 显示兜底字母（旧 URL 已结算为空的状态残留）。同时清空 faviconUrl state，
  // 避免 URL 变化到"永不解析"的目标时残留上一页的旧图标（R3）。
  useEffect(() => {
    setResolvedFaviconEmpty(false);
    setDegraded(false);
    setFaviconUrl('');
    faviconUrlRef.current = '';
    retryLeftRef.current = FAVICON_RETRY_MAX;
    clearRetryTimer();
  }, [url, clearRetryTimer]);

  // 卸载时取消在途重试计时器（避免对已卸载组件的 setState）。
  useEffect(() => clearRetryTimer, [clearRetryTimer]);

  useEffect(() => {
    applyMetaUpdate();
    if (!url) {
      return;
    }
    // 跨域重定向场景：原始 URL 的精确订阅收不到目标 origin 的元数据广播，
    // 且重定向映射可能在组件挂载后才由导航记录（书签等先渲染场景）。
    // 因此用全局订阅在事件发生时实时计算 getRedirectTarget(url)（而非建立时
    // 一次性捕获），目标数据落地即可刷新（参考 Chromium `page_url_type` 语义）。
    // 全局订阅覆盖所有镜像写入口（广播 applyBroadcastUpdate→notify、persistFaviconDataUri
    // 等），回调收到的已是归一化 key（F2），无需再 URL 解析；同次广播只触发一次
    // applyMetaUpdate，无双重订阅冗余/陈旧读（F3）。
    const normUrl = normalizeUrlForCache(url);
    const unsubGlobal = subscribeSiteMetaGlobal((updatedKey) => {
      if (updatedKey === normUrl || getRedirectTarget(url) === updatedKey) {
        applyMetaUpdate();
      }
    });
    return () => {
      unsubGlobal();
    };
  }, [url, ready, applyMetaUpdate]);

  // 跨域重定向等场景：URL 永远不会被结算（元数据存储在重定向后的域名下），
  // 超时后降级为兜底字母，避免 spinner 永久旋转。
  // 仅 spinner 模式需要：被动列表（initial）直接显示首字母，不挂计时器。
  useEffect(() => {
    if (pending !== 'spinner' || !url || resolvedFaviconEmpty || faviconUrlRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      // 已结算但 favicon URL 仍为空时标记为"确认无 favicon"（兜底字母）。
      // 若期间拿到了 favicon（faviconUrlRef 非空）则跳过降级。
      if (!faviconUrlRef.current) {
        setResolvedFaviconEmpty(true);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [pending, url, resolvedFaviconEmpty]);

  // 未命中/未就绪：显示占位图标（非空白）
  const current = faviconUrl;
  const showImg = Boolean(current) && !degraded;
  // 转圈只在「确有在途抓取预期」的 spinner 模式出现；被动列表不再用加载态占位
  const isLoading = pending === 'spinner' && !current && !degraded && !resolvedFaviconEmpty;
  // degraded（img 加载失败）时 current 非空但不可显示 → 显示兜底字母，
  // 否则图标槽位变空白（H1-A）。被动列表在未结算时同样直接显示首字母。
  const showLetter = !showImg && !isLoading;
  const handleError = useCallback(() => {
    setDegraded(true);
    // 有限次重试：瞬时失败（本地服务未就绪等）可恢复；预算耗尽后才永久降级。
    if (retryLeftRef.current > 0) {
      retryLeftRef.current -= 1;
      clearRetryTimer();
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        // 清降级 + 重挂 <img>（key 变化）再试一次。
        setDegraded(false);
        setRetryKey((k) => k + 1);
      }, FAVICON_RETRY_DELAY_MS);
    }
  }, [clearRetryTimer]);

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
          key={retryKey}
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
        {showLetter ? siteInitial(url) : ''}
      </span>
    </span>
  );
}

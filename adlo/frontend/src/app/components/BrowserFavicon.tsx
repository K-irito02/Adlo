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
import {
  forgetPageFavicon,
  getRememberedPageFavicon,
  isFaviconSourceReady,
  markFaviconSourceFailed,
  markFaviconSourceLoaded,
  rememberPageFavicon,
} from './faviconDisplayCache';

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
   * 书签条目自带的内联图标快照（导入文件的 `ICON`、或收藏时抓取到的 data-URI）。
   *
   * 书签是**被动列表**：没有在途抓取时不应为了等站点元数据而先显示首字母。
   * 快照可同步显示，重挂/重启后也直接可用；站点元数据后来居上时再原地升级。
   */
  snapshot?: string;
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
 * 但本地服务（如 dsh）尚未就绪，首次 `<img>` 请求被拒。若首次失败就降级为兜底字母，
 * 服务随后就绪也不会恢复（且相同 URL 的元数据广播因 `prev === next` 不会清降级）。
 * 故在此做有限次重试；耗尽后本次挂载内不再探测该来源，换源/重挂后重新获得预算。
 */
const FAVICON_RETRY_MAX = 6;
const FAVICON_RETRY_DELAY_MS = 2000;

/**
 * 一次渲染期快照：候选来源、可直接显示的来源、需要探测加载的来源。
 *
 * 显示优先级：内联快照（本地、可同步显示）> 已就绪的站点元数据 > 后台探测。
 * 站点元数据即使未就绪也进入 probe，加载成功后替换快照（图标→图标，无首字母中间态）。
 */
function resolveInitialSources(url: string, snapshot: string | undefined) {
  const meta = url ? getFaviconUrl(url) : '';
  const preferred = meta || snapshot || '';
  const metaReady = isFaviconSourceReady(meta);
  const snapshotReady = isFaviconSourceReady(snapshot ?? '');
  // 该页面上次成功显示过的图标优先：重挂首帧直接复用，绝不退回占位态。
  const remembered = url ? getRememberedPageFavicon(url) : '';
  const rememberedReady = isFaviconSourceReady(remembered);
  const display = rememberedReady
    ? remembered
    : metaReady
      ? meta
      : snapshotReady
        ? (snapshot ?? '')
        : '';
  let probe = '';
  if (meta && !metaReady && meta !== display) {
    probe = meta;
  } else if (snapshot && !snapshotReady && snapshot !== display) {
    probe = snapshot;
  }
  return { meta, preferred, display, probe };
}

export function BrowserFavicon({
  url,
  size = 14,
  snapshot,
  pending = 'spinner',
}: BrowserFaviconProps) {
  const [ready, setReady] = useState(isSiteMetaCacheReady());
  // 渲染期同步读缓存：折叠/展开/切换导航模式通常会重挂树行，若初值为空、等 effect
  // 再取值，就会先画一帧「首字母 → 图标」的闪烁（用户 2026-11-14 报告）。
  const [initial] = useState(() => resolveInitialSources(url, snapshot));
  const [faviconUrl, setFaviconUrl] = useState(initial.meta);
  // displaySrc：当前**可见**的图标来源；只有成功加载过（或内联 data-URI）才进入。
  // 加载新来源期间它保持不变，旧图标不会消失 → 不会出现「图标 → 首字母 → 图标」。
  const [displaySrc, setDisplaySrc] = useState(initial.display);
  // probe：正在后台试加载的来源 + **它所属的页面 URL**。两者放在同一个 state 里，
  // 保证渲染闭包看到的 src 与 ownerUrl 永远来自同一次提交（若用 ref 记录归属，
  // 会被 effect 提前改写，旧 probe 的 load 可能在间隙里落到新页名下）。
  const [probe, setProbe] = useState(() => ({
    src: initial.probe,
    ownerUrl: initial.probe ? url : '',
  }));
  const probeSrc = probe.src;
  const probeOwnerUrl = probe.ownerUrl;
  const [degraded, setDegraded] = useState(false);
  const faviconUrlRef = useRef(initial.meta);
  const [resolvedFaviconEmpty, setResolvedFaviconEmpty] = useState(() =>
    Boolean(url && !initial.preferred && isSiteMetaResolvedOrRedirected(url)),
  );
  // 重试预算/计时器 + 强制重挂 probe <img> 的 key（瞬时失败恢复用）。
  const [retryKey, setRetryKey] = useState(0);
  const retryLeftRef = useRef(FAVICON_RETRY_MAX);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeRef = useRef<HTMLImageElement | null>(null);
  // 可见图标 `displaySrc` 属于哪个页面 URL。同一组件实例会随标签导航换 URL，
  // 旧图标在过渡期可以继续显示，但绝不能被记到新 URL 名下（会跨站错图标）。
  const displayUrlRef = useRef(url);
  // 本次挂载内已耗尽重试预算的来源：阻止协调 effect 立刻重新探测造成死循环。
  // 换源/重挂后自动失效（模块级只记录"成功过"的来源，不记录永久失败）。
  const [exhaustedSrc, setExhaustedSrc] = useState('');

  const preferredSrc = faviconUrl || snapshot || '';
  // 该页面上次成功显示过的图标（会话级），作为「无候选来源」时的稳定兜底。
  const rememberedSrc = getRememberedPageFavicon(url);

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
      setExhaustedSrc('');
      // 拿到（变化的）favicon → 重置重试预算并取消在途重试。
      retryLeftRef.current = FAVICON_RETRY_MAX;
      clearRetryTimer();
    }
    // 已结算但 favicon URL 仍为空，标记为"确认无 favicon"（无条件检查，处理初始已结算场景）；
    // 反过来，拿到图标后必须解除该闩锁，否则迟到的图标仍会被兜底字母遮住。
    if (url && isSiteMetaResolvedOrRedirected(url)) {
      setResolvedFaviconEmpty(!next);
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

  // URL 变化时重置元数据状态。`displaySrc` 刻意不立即清空：同一标签导航到新站时，
  // 旧图标保留到新图标加载完成（没有「图标 → 首字母」的中间态）；只有完全没有
  // 候选来源（既无元数据也无快照）时才清空，避免残留上一站图标。
  useEffect(() => {
    const initialMeta = url ? getFaviconUrl(url) : '';
    faviconUrlRef.current = initialMeta;
    setFaviconUrl(initialMeta);
    const preferred = initialMeta || snapshot || '';
    setResolvedFaviconEmpty(Boolean(url && !preferred && isSiteMetaResolvedOrRedirected(url)));
    setDegraded(false);
    setExhaustedSrc('');
    retryLeftRef.current = FAVICON_RETRY_MAX;
    clearRetryTimer();
    // 旧 probe 属于上一个 URL，换页后必须丢弃，避免旧图 onLoad 落到新页。
    setProbe({ src: '', ownerUrl: '' });
    const remembered = getRememberedPageFavicon(url);
    if (remembered && isFaviconSourceReady(remembered)) {
      setDisplaySrc(remembered);
      displayUrlRef.current = url;
    } else if (!preferred) {
      setDisplaySrc('');
      displayUrlRef.current = url;
    }
    // 有候选但未就绪时保留旧图标过渡；`displayUrlRef` 仍指向旧 URL，不会被误记。
    // snapshot 由父级随书签数据更新；其变化也走同一套候选来源协调（下方 effect）。
  }, [url, clearRetryTimer, snapshot]);

  // 说明：snapshot 变化时同样需要重置重试/耗尽状态（换了图标快照相当于换源）。

  // 候选来源协调：就绪来源直接显示；未就绪来源进入 probe，旧图标保持可见。
  useEffect(() => {
    const preferred = preferredSrc;
    if (!preferred) {
      setProbe({ src: '', ownerUrl: '' });
      if (isFaviconSourceReady(rememberedSrc)) {
        // 元数据暂缺时不要清掉已记住的真实图标（否则每次重挂都退回占位）。
        setDisplaySrc(rememberedSrc);
        displayUrlRef.current = url;
      } else if (displayUrlRef.current !== url) {
        // 上一页的图标不属于当前 URL：新页无图标时必须清掉，不能跨站残留。
        setDisplaySrc('');
        displayUrlRef.current = url;
      }
      return;
    }
    if (preferred === displaySrc) {
      setProbe({ src: '', ownerUrl: '' });
      return;
    }
    if (isFaviconSourceReady(preferred)) {
      setProbe({ src: '', ownerUrl: '' });
      setDisplaySrc(preferred);
      displayUrlRef.current = url;
      setDegraded(false);
      return;
    }
    // 站点图标还没就绪，但书签快照可用：先显示快照（首字母不出现），
    // 同时继续把站点图标放进 probe，加载成功后升级。
    if (!displaySrc && snapshot && isFaviconSourceReady(snapshot)) {
      setDisplaySrc(snapshot);
      displayUrlRef.current = url;
    } else if (!displaySrc && isFaviconSourceReady(rememberedSrc)) {
      setDisplaySrc(rememberedSrc);
      displayUrlRef.current = url;
    }
    if (preferred === exhaustedSrc) {
      // 新页图标耗尽重试：旧页图标不能继续冒充新页。
      if (displayUrlRef.current !== url) {
        setDisplaySrc(snapshot && isFaviconSourceReady(snapshot) ? snapshot : '');
        displayUrlRef.current = url;
      }
      setProbe({ src: '', ownerUrl: '' });
      return;
    }
    setProbe({ src: preferred, ownerUrl: url });
  }, [preferredSrc, displaySrc, exhaustedSrc, snapshot, rememberedSrc, url]);

  // 记住该图标来源，供后续重挂首帧复用。归属以 `displayUrlRef` 为准，
  // 而不是渲染时的 `url`（换页过渡期两者可能不同）。
  useEffect(() => {
    if (displaySrc) {
      rememberPageFavicon(displayUrlRef.current, displaySrc);
    }
  }, [displaySrc]);

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
    if (pending !== 'spinner' || !url || resolvedFaviconEmpty || preferredSrc) {
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
  }, [pending, url, resolvedFaviconEmpty, preferredSrc]);

  const handleProbeLoad = useCallback(() => {
    const loaded = probeSrc;
    if (!loaded) {
      return;
    }
    const ownerUrl = probeOwnerUrl;
    if (!ownerUrl) {
      return;
    }
    markFaviconSourceLoaded(loaded);
    displayUrlRef.current = ownerUrl;
    rememberPageFavicon(ownerUrl, loaded);
    setDisplaySrc(loaded);
    setProbe({ src: '', ownerUrl: '' });
    setDegraded(false);
  }, [probeSrc, probeOwnerUrl]);

  const handleProbeError = useCallback(() => {
    const failed = probeSrc;
    if (failed) {
      markFaviconSourceFailed(failed);
    }
    setDegraded(true);
    // 有限次重试：瞬时失败（本地服务未就绪等）可恢复；预算耗尽后才永久降级。
    if (retryLeftRef.current > 0) {
      retryLeftRef.current -= 1;
      clearRetryTimer();
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        // 清降级 + 重挂 probe <img>（key 变化）再试一次。
        setDegraded(false);
        setRetryKey((k) => k + 1);
      }, FAVICON_RETRY_DELAY_MS);
      return;
    }
    // 重试耗尽：标记本次挂载不再探测该来源，并在有内联快照时退回快照，
    // 避免有图标时仍长期停在首字母。
    setExhaustedSrc(failed);
    if (probeOwnerUrl === url) {
      if (displayUrlRef.current !== url) {
        setDisplaySrc(
          snapshot && snapshot !== failed && isFaviconSourceReady(snapshot) ? snapshot : '',
        );
        displayUrlRef.current = url;
      } else if (snapshot && snapshot !== failed && isFaviconSourceReady(snapshot)) {
        setDisplaySrc(snapshot);
      }
    }
    setProbe({ src: '', ownerUrl: '' });
  }, [probeSrc, probeOwnerUrl, clearRetryTimer, snapshot, url]);

  const handleDisplayError = useCallback(() => {
    const failed = displaySrc;
    const failedUrl = displayUrlRef.current;
    if (failed) {
      markFaviconSourceFailed(failed);
      forgetPageFavicon(failedUrl, failed);
    }
    displayUrlRef.current = url;
    setDisplaySrc('');
    // 回到候选来源重试（若仍有快照会立即重新显示）。
    if (preferredSrc && preferredSrc !== failed) {
      setProbe({ src: preferredSrc, ownerUrl: url });
    }
  }, [displaySrc, preferredSrc, url]);

  // 命中浏览器缓存时 onLoad 可能在监听挂载前就已触发：挂载后补一次 complete 检查。
  useEffect(() => {
    const el = probeRef.current;
    if (el?.complete && el.naturalWidth > 0 && probeSrc) {
      const loaded = probeSrc;
      // 归属与 src 同属一个 state，保证是这次 probe 自己的页面。
      const ownerUrl = probeOwnerUrl;
      if (!ownerUrl) {
        return;
      }
      markFaviconSourceLoaded(el.currentSrc || loaded);
      displayUrlRef.current = ownerUrl;
      rememberPageFavicon(ownerUrl, loaded);
      setDisplaySrc(loaded);
      setProbe({ src: '', ownerUrl: '' });
    }
  }, [probeSrc, probeOwnerUrl, retryKey]);

  // 新标签页（无 URL/about:blank）没有站点 favicon：显示内置"新标签页"图标，
  // 避免空白占位（用户 2026-08-20 报告：open 模式下新建标签页标签图标缺失）。
  if (!url || url === 'about:blank') {
    return (
      <span className="adl-filetree__file-icon adl-filetree__file-icon--default">
        <IconNewTabPage size={size} decorative />
      </span>
    );
  }

  const showImg = Boolean(displaySrc);
  // 转圈只在「确有在途抓取预期」且完全没有候选来源的 spinner 模式出现。
  const isLoading =
    pending === 'spinner' && !showImg && !preferredSrc && !degraded && !resolvedFaviconEmpty;
  // 首字母只在没有可显示图标时出现；加载新来源期间旧图标保持可见（不闪）。
  const showLetter = !showImg && !isLoading;

  return (
    <span
      className={`adl-filetree__file-icon ${showImg ? 'adl-filetree__file-icon--favicon' : 'adl-filetree__file-icon--default'}`}
    >
      {showImg && (
        <img
          key={displaySrc}
          src={displaySrc}
          alt=""
          className="adl-browser-tree__favicon"
          style={{ width: size, height: size }}
          onError={handleDisplayError}
        />
      )}
      {probeSrc && probeSrc !== displaySrc && (
        <img
          key={`probe-${retryKey}`}
          ref={probeRef}
          src={probeSrc}
          alt=""
          aria-hidden="true"
          className="adl-browser-tree__favicon adl-browser-tree__favicon--probe"
          style={{ width: size, height: size }}
          onLoad={handleProbeLoad}
          onError={handleProbeError}
        />
      )}
      {isLoading && <Spinner size="sm" speed="normal" />}
      <span
        className="adl-browser-tree__link-fallback"
        style={showLetter ? undefined : { display: 'none' }}
      >
        {showLetter ? siteInitial(url) : ''}
      </span>
    </span>
  );
}

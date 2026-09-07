import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';
import { useDshWebViewBounds } from './useDshWebViewBounds';
import { useDshWebViewVisibility } from './useDshWebViewVisibility';

/**
 * 中间区 dsh 宿主渲染层。
 * - 浏览器模式：用 `<iframe>` 显示 dsh 进程 URL（悬浮层天然置顶）。
 * - Tauri 桌面：由独立 WebView2 子窗口承载，此处渲染占位容器。
 * - 若 iframe 加载被拒（X-Frame-Options / CSP），退化为"在外部浏览器打开"按钮。
 *   注：onError 不会为 X-Frame-Options/CSP 拦截触发，使用 load 事件 + 超时检测。
 */
export function DshHostRegion() {
  const { t } = useTCopy();
  const url = useAppStore((s) => s.url);
  const isTauri = useMemo(() => isTauriShell(), []);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadDetected = useRef(false);
  const { containerRef, updateBounds } = useDshWebViewBounds();

  // Detect when center area is obscured by right panel overlay expansion.
  // When the parent .adl-shell__body gets class 'is-rightpanel-overlay-expanded',
  // the center area becomes opacity:0 and the DSH WebView should be hidden.
  const [centerAreaHidden, setCenterAreaHidden] = useState(false);
  useEffect(() => {
    if (!isTauri) {
      return;
    }
    const el = containerRef.current?.closest('.adl-shell__body');
    if (!el) {
      return;
    }
    const check = () => {
      setCenterAreaHidden(el.classList.contains('is-rightpanel-overlay-expanded'));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [isTauri, containerRef]);

  useDshWebViewVisibility({
    containerRef,
    isVisible: isTauri && !!url,
    overlayActive: centerAreaHidden,
    updateBounds,
  });

  const handleOpenExternal = useCallback(() => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [url]);

  // Tauri 模式：挂载后立即同步一次精确 bounds（ ResizeObserver 首次回调可能延迟）
  useEffect(() => {
    if (isTauri && url) {
      updateBounds();
    }
  }, [isTauri, url, updateBounds]);

  // 检测 iframe 是否被 CSP/X-Frame-Options 拦截：
  // load 事件触发后，尝试访问 contentDocument；若跨域则为 blocked。
  useEffect(() => {
    if (!url || isTauri || iframeBlocked) {
      return;
    }
    const timer = setTimeout(() => {
      if (loadDetected.current) {
        return;
      }
      // load 事件未在 3 秒内触发 → 可能被拦截
      setIframeBlocked(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [url, isTauri, iframeBlocked]);

  const handleIframeLoad = useCallback(() => {
    loadDetected.current = true;
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }
    // 尝试访问 contentDocument；跨域时抛出 SecurityError → 被拦截
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body || doc.body.innerHTML === '') {
        setIframeBlocked(true);
      }
    } catch {
      // SecurityError: 跨域 → iframe 被 CSP/X-Frame-Options 拦截
      setIframeBlocked(true);
    }
  }, []);

  if (!url) {
    return (
      <section className="adl-center adl-center--dsh-placeholder">
        <div className="adl-center__body adl-center__body--empty">
          <div className="adl-center__empty">{t.dshWelcomeEmpty}</div>
        </div>
      </section>
    );
  }

  // Tauri 桌面：由独立 WebView2 子窗口承载，前端不渲染 iframe。
  if (isTauri) {
    return (
      <section
        ref={containerRef}
        id="dsh-host-region"
        className="adl-app-host"
        data-shell="tauri"
        aria-label={t.dshTitle}
      />
    );
  }

  // iframe 被拒：退化为外部浏览器打开
  if (iframeBlocked) {
    return (
      <section className="adl-app-host" data-shell="browser-fallback" aria-label={t.dshTitle}>
        <div className="adl-app-host__fallback">
          <svg
            className="adl-app-host__fallback-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          <h3 className="adl-app-host__fallback-title">{t.dshOpenExternal}</h3>
          <p className="adl-app-host__fallback-desc">{t.dshWelcomeEmpty}</p>
          <button type="button" className="adl-btn adl-btn--primary" onClick={handleOpenExternal}>
            {t.dshOpenExternal}
          </button>
        </div>
      </section>
    );
  }

  // 浏览器模式：iframe 渲染
  return (
    <section className="adl-app-host" data-shell="browser" aria-label={t.dshTitle}>
      <iframe
        ref={iframeRef}
        src={url}
        title={t.dshTitle}
        className="adl-app-host__frame"
        onLoad={handleIframeLoad}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </section>
  );
}

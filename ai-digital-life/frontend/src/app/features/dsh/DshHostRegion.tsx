import { useCallback, useMemo, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';

/**
 * 中间区 dsh 宿主渲染层。
 * - 浏览器模式：用 `<iframe>` 显示 dsh 进程 URL（悬浮层天然置顶）。
 * - Tauri 桌面：由独立 WebView2 子窗口承载，此处渲染占位容器。
 * - 若 iframe 加载被拒（X-Frame-Options / CSP），退化为"在外部浏览器打开"按钮。
 */
export function DshHostRegion() {
  const { t } = useTCopy();
  const url = useAppStore((s) => s.url);
  const isTauri = useMemo(() => isTauriShell(), []);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  const handleOpenExternal = useCallback(() => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [url]);

  const handleIframeError = useCallback(() => {
    setIframeBlocked(true);
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
        src={url}
        title={t.dshTitle}
        className="adl-app-host__frame"
        onError={handleIframeError}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </section>
  );
}

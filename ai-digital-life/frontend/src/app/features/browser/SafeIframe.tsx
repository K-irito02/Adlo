import { useEffect, useRef } from 'react';

interface SafeIframeProps {
  src: string;
  title: string;
  className: string;
  sandbox: string;
  /** 标签 id，落到容器 `data-tab-id` 供批量清理按标签过滤。 */
  dataTabId?: string;
  style?: React.CSSProperties;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onLoad: () => void;
  onError: React.ReactEventHandler<HTMLIFrameElement>;
}

export function SafeIframe({
  src,
  title,
  className,
  sandbox,
  dataTabId,
  style,
  iframeRef,
  onLoad,
  onError,
}: SafeIframeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);

  onLoadRef.current = onLoad;
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Cache the shadow root ourselves — element.shadowRoot returns null
    // for mode:'closed' shadow roots even from the same JS context.
    let shadow = shadowRef.current;
    if (!shadow) {
      shadow = container.attachShadow({ mode: 'closed' });
      shadowRef.current = shadow;
    }

    while (shadow.firstChild) {
      shadow.removeChild(shadow.firstChild);
    }

    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = title;
    iframe.className = className;
    iframe.setAttribute('sandbox', sandbox);
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.display = style?.display ?? 'block';

    if (iframeRef) {
      (iframeRef as React.MutableRefObject<HTMLIFrameElement | null>).current = iframe;
    }

    const handleLoad = () => {
      onLoadRef.current();
    };
    const handleError = () => {
      onErrorRef.current({} as React.SyntheticEvent<HTMLIFrameElement>);
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);
    shadow.appendChild(iframe);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
      // 先设为 about:blank 强制卸载页面（停止音频/视频/定时器）
      try {
        iframe.src = 'about:blank';
      } catch {
        /* ignore cross-origin errors */
      }
      if (shadow!.contains(iframe)) {
        shadow!.removeChild(iframe);
      }
      if (iframeRef) {
        (iframeRef as React.MutableRefObject<HTMLIFrameElement | null>).current = null;
      }
    };
    // onLoad/onError are intentionally excluded — refs (onLoadRef/onErrorRef)
    // keep the latest callback values without recreating the iframe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, title, className, sandbox]);

  return <div ref={containerRef} className={className} style={style} data-tab-id={dataTabId} />;
}

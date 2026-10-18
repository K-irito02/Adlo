import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { MarkdownPreviewProps } from './markdownPreviewUtils';
import { useMarkdownPreviewHtml } from './markdownPreviewUtils';
import { ensureMarkdownThemeCss, useResolvedMarkdownTheme } from './markdownTheme';
import DOMPurify from 'dompurify';

export function MarkdownPreview({ content, linkHandlers }: MarkdownPreviewProps) {
  const mdTheme = useResolvedMarkdownTheme();
  const html = useMarkdownPreviewHtml(content);
  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html]);
  // 包装对象必须按内容 memo：React 对 dangerouslySetInnerHTML 按包装对象恒等比较，
  // 内联字面量每次渲染都是新对象 → React 每次都重写 innerHTML（即使字符串相同），
  // 触发滚动锚定抖动（事项 9：悬停换肤内容逐次下移）。memo 后同内容零 DOM 写入。
  const innerHtml = useMemo(() => ({ __html: sanitizedHtml }), [sanitizedHtml]);
  const rootRef = useRef<HTMLDivElement>(null);

  // 单一样式表常驻，切换只翻容器 data-md-theme（变量重算，原子同步，事项 8 方案 A）。
  // useLayoutEffect（R1-F5）：首屏挂载即注入，避免绘制后再插 <style> 闪一下无样式帧。
  useLayoutEffect(() => {
    ensureMarkdownThemeCss();
  }, []);

  // 点击委托：预览正文由 dangerouslySetInnerHTML 生成，无法在 JSX 上挂 onClick，
  // 故在容器上统一代理。凡命中 <a href> 一律 preventDefault——宿主 WebView 绝不能
  // 因预览内链接而导航离开（会丢整个应用界面）。
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (e.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href');
      if (!anchor || !href) {
        return;
      }
      e.preventDefault();
      if (href.startsWith('#')) {
        const id = href.slice(1);
        const el = rootRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (/^https?:/i.test(href)) {
        // 未注入处理器时的兜底：直接外部打开，绝不就地导航。
        (
          linkHandlers?.onOpenUrl ??
          ((u: string) => void window.digitalLife?.window?.openExternal(u))
        )(href);
        return;
      }
      if (/^file:\/\//i.test(href)) {
        linkHandlers?.onOpenFile?.(href);
        return;
      }
      if (href.includes('://') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        void window.digitalLife?.window?.openExternal(href);
        return;
      }
      linkHandlers?.onOpenFile?.(href);
    },
    [linkHandlers],
  );

  return (
    <div
      ref={rootRef}
      className="adl-markdown-preview markdown-body"
      data-md-theme={mdTheme}
      onClick={handleClick}
      dangerouslySetInnerHTML={innerHtml}
    />
  );
}

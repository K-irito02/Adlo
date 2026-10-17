import { useLayoutEffect, useMemo } from 'react';
import type { MarkdownPreviewProps } from './markdownPreviewUtils';
import { useMarkdownPreviewHtml } from './markdownPreviewUtils';
import { ensureMarkdownThemeCss, useResolvedMarkdownTheme } from './markdownTheme';
import DOMPurify from 'dompurify';

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const mdTheme = useResolvedMarkdownTheme();
  const html = useMarkdownPreviewHtml(content);
  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html]);
  // 包装对象必须按内容 memo：React 对 dangerouslySetInnerHTML 按包装对象恒等比较，
  // 内联字面量每次渲染都是新对象 → React 每次都重写 innerHTML（即使字符串相同），
  // 触发滚动锚定抖动（事项 9：悬停换肤内容逐次下移）。memo 后同内容零 DOM 写入。
  const innerHtml = useMemo(() => ({ __html: sanitizedHtml }), [sanitizedHtml]);

  // 单一样式表常驻，切换只翻容器 data-md-theme（变量重算，原子同步，事项 8 方案 A）。
  // useLayoutEffect（R1-F5）：首屏挂载即注入，避免绘制后再插 <style> 闪一下无样式帧。
  useLayoutEffect(() => {
    ensureMarkdownThemeCss();
  }, []);

  return (
    <div
      className="adl-markdown-preview markdown-body"
      data-md-theme={mdTheme}
      dangerouslySetInnerHTML={innerHtml}
    />
  );
}

import { useEffect, useMemo } from 'react';
import type { MarkdownPreviewProps } from './markdownPreviewUtils';
import { useMarkdownPreviewHtml } from './markdownPreviewUtils';
import {
  ensureMarkdownThemeCss,
  useResolvedMarkdownTheme,
} from './markdownTheme';
import DOMPurify from 'dompurify';

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const mdTheme = useResolvedMarkdownTheme();
  const html = useMarkdownPreviewHtml(content);
  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html]);

  // 单一样式表常驻，切换只翻容器 data-md-theme（变量重算，原子同步，事项 8 方案 A）。
  useEffect(() => {
    ensureMarkdownThemeCss();
  }, []);

  return (
    <div
      className="adl-markdown-preview markdown-body"
      data-md-theme={mdTheme}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

import { useMemo } from 'react';
import type { MarkdownPreviewProps } from './markdownPreviewUtils';
import { useMarkdownPreviewHtml } from './markdownPreviewUtils';
import DOMPurify from 'dompurify';

export function MarkdownPreview({ content, theme = 'dark' }: MarkdownPreviewProps) {
  const html = useMarkdownPreviewHtml(content, theme);
  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html]);

  return (
    <div
      className="adl-markdown-preview adl-markdown-preview--dark"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

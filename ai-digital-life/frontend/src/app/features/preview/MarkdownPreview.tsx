import React from 'react';
import type { MarkdownPreviewProps } from './markdownPreviewUtils';
import { useMarkdownPreviewHtml } from './markdownPreviewUtils';

export function MarkdownPreview({ content, theme = 'dark' }: MarkdownPreviewProps) {
  const html = useMarkdownPreviewHtml(content, theme);

  return (
    <div
      className="adl-markdown-preview adl-markdown-preview--dark"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

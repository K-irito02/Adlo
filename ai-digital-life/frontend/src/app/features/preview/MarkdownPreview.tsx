import React, { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/common';

export type MarkdownPreviewProps = {
  content: string;
  theme?: 'light' | 'dark';
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createMdInstance(theme: 'light' | 'dark'): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight(str: string, lang: string): string {
      if (lang && hljs.getLanguage(lang)) {
        try {
          const highlighted = hljs.highlight(str, {
            language: lang,
            ignoreIllegals: true,
          }).value;
          return (
            `<div class="adl-md-code-header"><span class="adl-md-code-lang">${escapeHtml(lang)}</span></div>` +
            `<pre class="hljs"><code>${highlighted}</code></pre>`
          );
        } catch {
          // fallback
        }
      }
      const escaped = escapeHtml(str);
      return `<pre class="hljs"><code>${escaped}</code></pre>`;
    },
  });

  const defaultHeadingOpen =
    md.renderer.rules.heading_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const sourceLine = typeof token.map?.[0] === 'number' ? token.map[0] + 1 : undefined;
    if (sourceLine) {
      token.attrSet('data-source-line', String(sourceLine));
      token.attrSet('id', `adl-heading-${sourceLine}`);
    }
    return defaultHeadingOpen(tokens, idx, options, env, self);
  };

  return md;
}

export function renderMarkdownPreviewHtml(
  content: string,
  theme: 'light' | 'dark' = 'dark'
): string {
  return createMdInstance(theme).render(content);
}

function useMarkdownPreviewHtml(content: string, theme: 'light' | 'dark'): string {
  const md = useMemo(() => createMdInstance(theme), [theme]);
  return useMemo(() => md.render(content), [content, md]);
}

export function MarkdownPreview({ content, theme = 'dark' }: MarkdownPreviewProps) {
  const html = useMarkdownPreviewHtml(content, theme);

  return (
    <div
      className={`adl-markdown-preview adl-markdown-preview--${theme}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

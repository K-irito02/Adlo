import React, { useMemo } from "react";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";

export type MarkdownPreviewProps = {
  content: string;
  theme?: "light" | "dark";
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createMdInstance(theme: "light" | "dark"): MarkdownIt {
  return new MarkdownIt({
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
}

export function MarkdownPreview({ content, theme = "dark" }: MarkdownPreviewProps) {
  const md = useMemo(() => createMdInstance(theme), [theme]);

  const html = useMemo(() => md.render(content), [md, content]);

  return (
    <div
      className={`adl-markdown-preview adl-markdown-preview--${theme}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

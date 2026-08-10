import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import type { PartComponent } from './PartRenderer';

const md: MarkdownIt = new MarkdownIt({
  highlight: (code, lang) => {
    const safeLang = md.utils.escapeHtml(lang ?? '');
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="adl-part-code"><code class="hljs language-${safeLang}">${hljs.highlight(code, { language: lang }).value}</code></pre>`;
      } catch {
        /* fallthrough */
      }
    }
    return `<pre class="adl-part-code"><code>${md.utils.escapeHtml(code)}</code></pre>`;
  },
});

export function StreamingMarkdown({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const html = useMemo(() => md.render(text), [text]);
  const dataStreaming = isStreaming ? 'true' : 'false';
  return (
    <div
      className="adl-part-scope adl-part-markdown"
      data-streaming={dataStreaming}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export const StreamingMarkdownPart: PartComponent = ({ part }) => {
  const data = part.data;
  const text = data.type === 'text' ? data.text : '';
  return <StreamingMarkdown text={text} isStreaming />;
};

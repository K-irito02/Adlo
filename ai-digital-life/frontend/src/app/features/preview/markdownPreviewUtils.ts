import { useMemo } from 'react';
import { escapeHtml } from '../../../design-system/html';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', typescript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('python', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);

export interface MarkdownPreviewProps {
  content: string;
  theme?: 'light' | 'dark';
}

function createMdInstance(): MarkdownIt {
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

  // 块级源行映射（业界做法，参照 VS Code markdown preview 的 pluginSourceMap）：
  // 为每个带 map 的块级 token 标注源行范围，使预览可跳转到任意行，而不仅限于标题。
  // 语义：start = map[0] + 1（首行行号），end = map[1]（闭区间末行号，单行块 start === end）。
  // 仅标题仍保留 data-source-line（文档大纲依赖它）。
  md.core.ruler.push('adl-source-map', (state) => {
    for (const token of state.tokens) {
      if (token.map && token.type !== 'inline') {
        token.attrSet('data-source-line-start', String(token.map[0] + 1));
        token.attrSet('data-source-line-end', String(token.map[1]));
      }
    }
  });

  return md;
}

export function renderMarkdownPreviewHtml(
  content: string,
  _theme: 'light' | 'dark' = 'dark',
): string {
  return createMdInstance().render(content);
}

export function useMarkdownPreviewHtml(content: string, _theme: 'light' | 'dark'): string {
  const md = useMemo(() => createMdInstance(), []);
  return useMemo(() => md.render(content), [content, md]);
}

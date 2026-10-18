import { useEffect, useMemo, useState } from 'react';
import { escapeHtml } from '../../../design-system/html';
import MarkdownIt from 'markdown-it';
import {
  ensureStarryNight,
  highlightWithStarry,
  isStarryReady,
  subscribeStarryReady,
} from './starryNight';

export interface MarkdownLinkHandlers {
  /** http/https 链接：按「网址打开方式」设置打开（默认走 openUrlByMethod）。 */
  onOpenUrl?: (url: string) => void;
  /** 工作区内的相对/绝对文件链接：收到原始 href，由调用方解析为绝对路径后打开。 */
  onOpenFile?: (rawHref: string) => void;
}

export interface MarkdownPreviewProps {
  content: string;
  /** 链接点击委托（可选）：不传时正文内链接仍可识别，但仅做默认兜底。 */
  linkHandlers?: MarkdownLinkHandlers;
}

/**
 * 代码高亮（官方推荐 starry-night，见 `starryNight.ts`）。
 * - starry 就绪后：同步输出 `pl-*` span（`highlight` 本身是同步的，仅实例创建是异步）。
 * - 未就绪/未知语言/异常：HTML 转义纯文本，保证永不白屏。
 * - 始终以 `<div class="adl-md-code-header">` 开头：markdown-it 仅当高亮结果不以 `<pre`
 *   开头时才包一层带 token 属性（含块级源行映射 `data-source-line-start/end`）的
 *   `<pre><code>`；以 `<pre>` 开头会丢掉跳转锚点（回归：首屏回退曾丢 fence 块锚点）。
 * - `pre` 统一用 `adl-md-code`（首屏回退与高亮后类名一致，避免布局跳变；
 *   旧 `hljs` 类已随 highlight.js 移除，样式见 `markdown-preview.css`）。
 */
function highlightCode(str: string, lang: string, starryEnabled: boolean): string {
  const header = `<div class="adl-md-code-header"><span class="adl-md-code-lang">${escapeHtml(lang)}</span></div>`;
  if (starryEnabled) {
    const highlighted = highlightWithStarry(str, lang);
    if (highlighted !== null) {
      return header + `<pre class="adl-md-code"><code>${highlighted}</code></pre>`;
    }
  }
  const escaped = escapeHtml(str);
  return header + `<pre class="adl-md-code"><code>${escaped}</code></pre>`;
}

/**
 * GitHub-style heading slug: lowercase, strip punctuation (PRESERVING `-` and
 * `_`, matching GitHub anchors so `my-file` stays `my-file`), turn whitespace
 * runs into `-`, collapse repeated `-`, trim leading/trailing `-`. Stripping is
 * Unicode-aware — CJK (and every other letter script) is preserved; only
 * ASCII punctuation plus the CJK/typographic punctuation set is removed.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[!-,\.\/:-@\[-\^`\{-~。，、；：？！“”‘’（）《》【】…—]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createMdInstance(starryEnabled: boolean): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight(str: string, lang: string): string {
      return highlightCode(str, lang, starryEnabled);
    },
  });
  // 裸域名不自动成链（如 `AGENTS.md` 会被当成网址）：`md` 是合法顶级域，
  // linkify 的 fuzzy 匹配会把正文里的文件名误判为链接（事项 6 用户反馈）。
  // 仅保留带协议（http/https/mailto/…）与邮箱的自动链接；裸 `www.`/`example.com`
  // 不再可点，需要的话请写全协议。
  md.linkify.set({ fuzzyLink: false });

  const defaultHeadingOpen =
    md.renderer.rules.heading_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  // GitHub 风格标题 slug 计数（每次渲染重置，见下方 adl-source-map core 规则）。
  const slugCounts = new Map<string, number>();

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const sourceLine = typeof token.map?.[0] === 'number' ? token.map[0] + 1 : undefined;
    if (sourceLine) {
      token.attrSet('data-source-line', String(sourceLine));
      const headingText = tokens[idx + 1]?.content ?? '';
      let slug = slugify(headingText) || `section-${sourceLine}`;
      const seen = slugCounts.get(slug) ?? 0;
      slugCounts.set(slug, seen + 1);
      if (seen > 0) {
        slug = `${slug}-${seen}`;
      }
      token.attrSet('id', slug);
    }
    return defaultHeadingOpen(tokens, idx, options, env, self);
  };

  // 块级源行映射（业界做法，参照 VS Code markdown preview 的 pluginSourceMap）：
  // 为每个带 map 的块级 token 标注源行范围，使预览可跳转到任意行，而不仅限于标题。
  // 语义：start = map[0] + 1（首行行号），end = map[1]（闭区间末行号，单行块 start === end）。
  // 仅标题仍保留 data-source-line（文档大纲依赖它）。
  md.core.ruler.push('adl-source-map', (state) => {
    // 每次渲染重置 slug 计数：md 实例跨内容变化复用，计数不得跨渲染累积。
    slugCounts.clear();
    for (const token of state.tokens) {
      if (token.map && token.type !== 'inline') {
        token.attrSet('data-source-line-start', String(token.map[0] + 1));
        token.attrSet('data-source-line-end', String(token.map[1]));
      }
    }
  });

  return md;
}

/** 同步渲染（回退纯文本代码块）：测试与首屏用，不等待 starry-night WASM。 */
export function renderMarkdownPreviewHtml(content: string): string {
  return createMdInstance(false).render(content);
}

/**
 * 两段式渲染：首屏同步回退（零等待），starry-night 就绪后重渲一次带上高亮。
 * starry 加载失败则永远停留在回退态（`subscribeStarryReady` 永不触发）。
 */
export function useMarkdownPreviewHtml(content: string): string {
  const [starryTick, setStarryTick] = useState(() => (isStarryReady() ? 1 : 0));
  useEffect(() => {
    if (isStarryReady()) {
      return undefined;
    }
    const unsubscribe = subscribeStarryReady(() => setStarryTick(1));
    void ensureStarryNight();
    return unsubscribe;
  }, []);
  const md = useMemo(() => createMdInstance(starryTick > 0), [starryTick]);
  return useMemo(() => md.render(content), [content, md]);
}

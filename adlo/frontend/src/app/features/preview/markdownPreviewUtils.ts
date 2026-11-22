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
  /** 链接点击委托（可选）：不传时 http(s) 链接走外部打开兜底，
   * 文件链接保持静默（调用方必须注入 onOpenFile 才能打开工作区文件）。 */
  linkHandlers?: MarkdownLinkHandlers;
}

export interface FrontmatterEntry {
  key: string;
  values: string[];
  /** 值为列表（块列表或行内 `[a, b]`）时为 true：按普通文本渲染。 */
  list?: boolean;
}

export interface SplitMarkdown {
  entries: FrontmatterEntry[];
  body: string;
  /** frontmatter 占用的源行数：正文块级行号需整体后移，保证跳转锚点仍指向真实行。 */
  lineOffset: number;
}

/** 仅识别文档首部块；中途出现的 `---` 仍按 markdown 分隔线处理。CRLF 容错。 */
const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/** 行内列表按「引号感知」切分：`["a, b", c]` 不能被逗号切坏。 */
function splitListItems(inner: string): string[] {
  const items: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const char of inner) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      current += char;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ',') {
      items.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  items.push(current);
  // 空项（`[]`、`[a,]`、`[a, , b]`）不产生多余分隔符。
  return items.map((item) => unquote(item)).filter((item) => item !== '');
}

function splitInlineList(value: string): string[] | null {
  if (!/^\[.*\]$/s.test(value)) {
    return null;
  }
  return splitListItems(value.slice(1, -1).trim());
}

/** 块标量头：`|` / `>`，可带 chomping（`+`/`-`）与缩进指示（1-9）。 */
const BLOCK_SCALAR_RE = /^[|>](?:[+-]?[1-9]?|[1-9][+-]?)$/;

/**
 * 通用 frontmatter 解析（不按字段名特判——规则/技能/文章生态的字段集合并不固定）。
 * 支持常见 YAML 子集：`key: value`、引号值、行内列表 `[a, b]`、块列表 `- item`、
 * 块标量 `|` / `>`、缩进续行（按原样保留换行）。嵌套映射不做结构化展开，按文本保留。
 *
 * 返回 null 表示“看起来不是 frontmatter”（没有任何键 / 出现无法归属的内容行），
 * 调用方必须整体回退到原样渲染，绝不能吞掉正文。
 */
export function parseFrontmatter(block: string): FrontmatterEntry[] | null {
  const entries: FrontmatterEntry[] = [];
  let current: FrontmatterEntry | null = null;
  let blockScalar: {
    entry: FrontmatterEntry;
    fold: boolean;
    keepTrailing: boolean;
    /** 折叠标量里上一个有效行是否是空行（决定下一行用换行还是空格连接）。 */
    pendingBlank: boolean;
  } | null = null;

  const finalizeBlockScalar = () => {
    if (!blockScalar) {
      return;
    }
    if (!blockScalar.keepTrailing) {
      // 默认 clip / `-` strip：去掉尾部空行（`+` 保留）。
      blockScalar.entry.values[0] = (blockScalar.entry.values[0] ?? '').replace(/\n+$/, '');
    }
    blockScalar = null;
  };

  const appendContinuation = (entry: FrontmatterEntry, text: string) => {
    const existing = entry.values[0] ?? '';
    entry.values[0] = existing ? `${existing}\n${text}` : text;
  };

  for (const raw of block.split(/\r?\n/)) {
    if (blockScalar) {
      if (raw.trim() === '') {
        blockScalar.entry.values[0] += '\n';
        blockScalar.pendingBlank = true;
        continue;
      }
      if (/^[ \t]/.test(raw)) {
        const text = raw.replace(/^[ \t]+/, '');
        const existing = blockScalar.entry.values[0] ?? '';
        // 折叠标量（`>`）段落之间用换行，且不留前导空格。
        // 折叠模式下空行本身已写入换行符，这里不再重复分隔符，避免多出空行。
        const separator = !existing
          ? ''
          : blockScalar.fold
            ? blockScalar.pendingBlank
              ? ''
              : ' '
            : '\n';
        blockScalar.entry.values[0] = `${existing}${separator}${text}`;
        blockScalar.pendingBlank = false;
        continue;
      }
      finalizeBlockScalar();
    }

    if (raw.trim() === '' || /^[ \t]*#/.test(raw)) {
      continue;
    }

    const listItem = /^[ \t]*-(?:[ \t]+(.*))?$/.exec(raw);
    if (listItem) {
      if (!current) {
        return null;
      }
      current.list = true;
      current.values.push(unquote(listItem[1] ?? ''));
      continue;
    }

    // 缩进且非列表：嵌套映射/续行，按文本并入当前值（不做结构化解析）。
    if (/^[ \t]/.test(raw)) {
      if (!current) {
        return null;
      }
      appendContinuation(current, raw.trim());
      continue;
    }

    const keyMatch = /^([^\s:#][^:]*?)[ \t]*:[ \t]*(.*)$/u.exec(raw);
    if (!keyMatch) {
      return null;
    }
    const key = keyMatch[1].trim();
    const rawValue = keyMatch[2].trim();
    if (!key) {
      return null;
    }

    const entry: FrontmatterEntry = { key, values: [] };
    entries.push(entry);
    current = entry;

    if (rawValue === '') {
      continue;
    }
    if (BLOCK_SCALAR_RE.test(rawValue)) {
      entry.values = [''];
      blockScalar = {
        entry,
        fold: rawValue.startsWith('>'),
        // chomping 指示符可与缩进指示符互换顺序（`|+2` 与 `|2+` 等价）。
        keepTrailing: rawValue.includes('+'),
        pendingBlank: false,
      };
      continue;
    }
    const inline = splitInlineList(rawValue);
    if (inline) {
      entry.values = inline;
      entry.list = true;
      continue;
    }
    entry.values = [unquote(rawValue)];
  }

  finalizeBlockScalar();
  if (entries.length === 0) {
    return null;
  }
  for (const entry of entries) {
    // 空列表保持空数组（渲染成空单元格），不要把列表补成空字符串。
    if (!entry.list && entry.values.length === 0) {
      entry.values = [''];
    }
  }
  return entries;
}

export function splitFrontmatter(content: string): SplitMarkdown {
  // BOM 容错：Windows 工具产出的 md 常带 U+FEFF。必须在所有分支都去掉，
  // 否则无 frontmatter 的文件首行标题会被 markdown-it 当成普通段落。
  const source = content.startsWith('\uFEFF') ? content.slice(1) : content;
  const none: SplitMarkdown = { entries: [], body: source, lineOffset: 0 };
  const match = FRONTMATTER_RE.exec(source);
  if (!match) {
    return none;
  }
  const entries = parseFrontmatter(match[1]);
  if (!entries) {
    return none;
  }
  const newlines = (match[0].match(/\n/g) ?? []).length;
  // 闭合 `---` 在文件末尾且无换行时，行数比换行数多 1。
  const lineOffset = newlines + (match[0].endsWith('\n') ? 0 : 1);
  return { entries, body: source.slice(match[0].length), lineOffset };
}

/**
 * 属性表（通用键值，值全部转义；列表项用两个空格连接为普通文本）。
 * `lineOffset` 是 frontmatter 占用的源行数：整块挂 `data-source-line-start/end`
 * 覆盖 1..lineOffset，检索跳转到 frontmatter 内任意行时仍能定位到属性表。
 */
export function renderFrontmatterTable(entries: FrontmatterEntry[], lineOffset = 0): string {
  if (entries.length === 0) {
    return '';
  }
  const rows = entries
    .map(({ key, values, list }) => {
      const items = list ? values.filter((value) => value !== '') : values;
      // 列表值与标量值同一套普通文本样式：两个空格连接，不做胶囊/边框。
      const text = list ? items.join('  ') : (values[0] ?? '');
      return `<div class="adl-md-frontmatter__row"><dt>${escapeHtml(key)}</dt><dd><span class="adl-md-frontmatter__value">${escapeHtml(text)}</span></dd></div>`;
    })
    .join('');
  const lineAttrs =
    lineOffset > 0 ? ` data-source-line-start="1" data-source-line-end="${lineOffset}"` : '';
  return `<dl class="adl-md-frontmatter"${lineAttrs}>${rows}</dl>`;
}

/** 源行偏移：frontmatter 被剥离后，块级锚点必须补回其占用的行数。 */
function readLineOffset(env: unknown): number {
  const value = (env as { lineOffset?: unknown } | undefined)?.lineOffset;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
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

  // 显式 `[doc](file:///…)` 链接需要可点击（走内部文件打开链）：markdown-it
  // 默认 validateLink 拦截 file: 协议，此处仅追加 file: 白名单，其余口径不变。
  const defaultValidateLink = md.validateLink.bind(md);
  md.validateLink = (url: string): boolean => {
    if (url.trim().toLowerCase().startsWith('file:')) {
      return true;
    }
    return defaultValidateLink(url);
  };

  const defaultHeadingOpen =
    md.renderer.rules.heading_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  // GitHub 风格标题 slug 计数（每次渲染重置，见下方 adl-source-map core 规则）。
  const slugCounts = new Map<string, number>();

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const sourceLine =
      typeof token.map?.[0] === 'number' ? token.map[0] + 1 + readLineOffset(env) : undefined;
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
    // frontmatter 已从正文剥离，行号必须补回其占用的行数（否则检索跳转会错位）。
    const offset = readLineOffset(state.env);
    for (const token of state.tokens) {
      if (token.map && token.type !== 'inline') {
        token.attrSet('data-source-line-start', String(token.map[0] + 1 + offset));
        token.attrSet('data-source-line-end', String(token.map[1] + offset));
      }
    }
  });

  return md;
}

/** frontmatter 属性表 + 正文渲染：两个入口共用，避免契约分叉。 */
function renderWithFrontmatter(md: MarkdownIt, content: string): string {
  const { entries, body, lineOffset } = splitFrontmatter(content);
  return `${renderFrontmatterTable(entries, lineOffset)}${md.render(body, { lineOffset })}`;
}

/** 同步渲染（回退纯文本代码块）：测试与首屏用，不等待 starry-night WASM。 */
export function renderMarkdownPreviewHtml(content: string): string {
  return renderWithFrontmatter(createMdInstance(false), content);
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
  return useMemo(() => renderWithFrontmatter(md, content), [content, md]);
}

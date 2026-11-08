/**
 * Netscape bookmarks HTML 编解码（纯函数）。
 *
 * 只处理结构、不做 IO：读文件与落盘由调用方负责，因此这里可以在 node/jsdom 下
 * 完整测试嵌套目录、空目录、无效链接与属性缺失等边界。
 *
 * 格式参考：Edge / Chrome / Firefox / Safari 导出文件共用的
 * `<!DOCTYPE NETSCAPE-Bookmark-file-1>` 结构。
 */
import type { ParsedBookmarkFile, TransferFolder, TransferNode } from './bookmarkTransferTypes';

const DOCTYPE_LINE = '<!DOCTYPE NETSCAPE-Bookmark-file-1>';
const META_LINE = '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">';

/** 协议白名单：只接受 http(s)，其余（javascript/data/file/about）一律忽略。 */
function isSupportedUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function fallbackTitle(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

/** Netscape 文件里的时间是秒级 unix 时间戳；缺失时回退到给定默认值。 */
function parseTimestampAttr(raw: string | null, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const seconds = Number(raw.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return fallback;
  }
  return Math.round(seconds * 1000);
}

function readText(el: Element | null): string {
  return (el?.textContent ?? '').trim();
}

/**
 * 解析一个 `<DL>` 的直接子项。
 *
 * 浏览器导出的结构是 `<DL><p><DT><A …></DT><DT><H3>…</H3><DL>…</DL></DT></DL>`：
 * 嵌套的 `<DL>` 可能作为 `<DT>` 的下一个兄弟，也可能被 HTML 解析器塞进 `<DT>` 内部，
 * 两种形态都要认。
 */
function parseList(
  dl: Element,
  result: { nodes: TransferNode[]; invalidCount: number },
  now: number,
): void {
  const children = Array.from(dl.children);
  let index = 0;
  while (index < children.length) {
    const el = children[index];
    if (el.tagName === 'DT') {
      const anchor = el.querySelector(':scope > A');
      const heading = el.querySelector(':scope > H3');
      if (anchor) {
        const href = anchor.getAttribute('HREF')?.trim() ?? '';
        if (!href || !isSupportedUrl(href)) {
          result.invalidCount += 1;
        } else {
          const addedAt = parseTimestampAttr(anchor.getAttribute('ADD_DATE'), now);
          const lastModifiedAt = parseTimestampAttr(anchor.getAttribute('LAST_MODIFIED'), addedAt);
          const icon = anchor.getAttribute('ICON')?.trim() || undefined;
          const title = readText(anchor) || fallbackTitle(href);
          result.nodes.push({
            kind: 'bookmark',
            url: href,
            title,
            addedAt,
            lastModifiedAt,
            ...(icon ? { icon } : {}),
          });
        }
      } else if (heading) {
        const nested = findNestedList(el, children, index);
        const folder: TransferFolder = { name: readText(heading) || 'Folder', children: [] };
        if (nested) {
          const sub = { nodes: folder.children, invalidCount: 0 };
          parseList(nested.el, sub, now);
          result.invalidCount += sub.invalidCount;
          if (nested.consumedSibling) {
            index += 1;
          }
        }
        result.nodes.push({ kind: 'folder', folder });
      }
    }
    index += 1;
  }
}

function findNestedList(
  dt: Element,
  siblings: Element[],
  index: number,
): { el: Element; consumedSibling: boolean } | null {
  const inside = dt.querySelector('DL');
  if (inside) {
    return { el: inside, consumedSibling: false };
  }
  const next = siblings[index + 1];
  if (next && next.tagName === 'DL') {
    return { el: next, consumedSibling: true };
  }
  return null;
}

/**
 * 解析书签 HTML。
 *
 * - 只认 http(s) 链接；其余计入 `invalidCount`
 * - 标题缺失时回退主机名
 * - `ADD_DATE` / `LAST_MODIFIED` 缺失时用当前时间，保证导入条目有可展示的时间
 */
export function parseBookmarkHtml(html: string, now: number = Date.now()): ParsedBookmarkFile {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rootName = readText(doc.querySelector('H1')) || readText(doc.querySelector('title'));
  const rootList = doc.querySelector('DL');
  if (!rootList) {
    return { rootName, nodes: [], invalidCount: 0 };
  }
  const result: { nodes: TransferNode[]; invalidCount: number } = {
    nodes: [],
    invalidCount: 0,
  };
  parseList(rootList, result, now);
  return { rootName, nodes: result.nodes, invalidCount: result.invalidCount };
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

function toSeconds(ms: number): number {
  return Math.max(0, Math.floor(ms / 1000));
}

function serializeNodes(nodes: TransferNode[], indent: string, icons: Map<string, string>): string {
  const lines: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      // 空目录不写：导入到其它浏览器后只会变成空壳文件夹
      if (node.folder.children.length === 0) {
        continue;
      }
      lines.push(`${indent}<DT><H3>${escapeText(node.folder.name)}</H3>`);
      lines.push(`${indent}<DL><p>`);
      lines.push(serializeNodes(node.folder.children, indent, icons));
      lines.push(`${indent}</DL><p>`);
      continue;
    }
    const icon = icons.get(node.url) ?? node.icon;
    const attrs = [
      `HREF="${escapeAttr(node.url)}"`,
      `ADD_DATE="${toSeconds(node.addedAt)}"`,
      `LAST_MODIFIED="${toSeconds(node.lastModifiedAt)}"`,
      ...(icon ? [`ICON="${escapeAttr(icon)}"`] : []),
    ];
    lines.push(`${indent}<DT><A ${attrs.join(' ')}>${escapeText(node.title)}</A>`);
  }
  return lines.join('\n');
}

/**
 * 序列化为 Netscape 书签 HTML。
 *
 * `icons` 以 URL 为键提供内联图标（`data:` URI）；调用方按 URL 从站点元数据缓存取。
 * 空目录会被跳过。
 */
export function serializeBookmarkHtml(
  rootName: string,
  nodes: TransferNode[],
  icons: Map<string, string> = new Map(),
): string {
  const title = rootName.trim() || 'Bookmarks';
  const body = serializeNodes(nodes, '    ', icons);
  return [
    DOCTYPE_LINE,
    META_LINE,
    `<TITLE>${escapeText(title)}</TITLE>`,
    `<H1>${escapeText(title)}</H1>`,
    '',
    '<DL><p>',
    body,
    '</DL><p>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

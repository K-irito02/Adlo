/**
 * previewFetchPageMeta.ts —— 浏览器预览模式的共享抓取函数。
 *
 * 语义真源：Rust `src-tauri/src/commands/browser.rs::fetch_page_meta_inner`
 * （HTML 抓取 → `<title>`/`og:title` 解析 → `<link rel=icon>` 解析 →
 * `{origin}/favicon.ico` 兜底 → DDG 图标服务兜底 → favicon 字节下载转 dataUri），
 * 以及 `crates/browser/src/html_meta.rs` 的 `duckduckgo_favicon_url` /
 * `google_favicon_url` 私网豁免规则。
 *
 * 门控分工：HTML 级 robots/限速门控由调用方（vite.config.ts 中间件）先行执行
 * （本函数入参 url 已通过门控）；favicon 下载的 robots-only 门控
 * （`pageMetaGateAllows(..., { rateLimit: false })`）在本函数内部执行，
 * 与 Rust `fetch_page_meta_inner` 对 favicon URL 的二次 robots 检查同构。
 *
 * 任何失败（非 http(s) URL / 网络错误 / 下载超限）均返回空字段 PageMeta，
 * 由上层 `pageMetaService` 走失败退避路径（不删缓存）。
 */
import { USER_AGENT } from '../src/shared/userAgent';
import { pageMetaGateAllows } from './previewCrawlerGate';
import type { PageMeta } from '../src/shared/ipc/browser';

const FETCH_TIMEOUT_MS = 5000;
const HTML_MAX_LEN = 65536;
const FAVICON_MAX_BYTES = 64 * 1024;

function emptyPageMeta(url: string): PageMeta {
  return { title: '', favicon: '', faviconDataUri: '', url };
}

/**
 * 提取页面标题：`<title>` 优先，其次 `<meta property="og:title">`。
 * 保留 vite.config.ts 中间件既有正则与 HTML 实体解码集（&amp;/&lt;/&gt;/&quot;/&#x27;）。
 */
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  let title = titleMatch?.[1]?.trim() || '';
  if (!title) {
    const ogTitle = html.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    );
    title = ogTitle?.[1]?.trim() || '';
  }
  return title
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
}

const ICON_PATTERNS = [
  /<link[^>]*rel=["']icon["'][^>]*sizes=["']any["'][^>]*href=["']([^"']+)["']/i,
  /<link[^>]*rel=["']icon["'][^>]*type=["']image\/svg\+xml["'][^>]*href=["']([^"']+)["']/i,
  /<link[^>]*rel=["']icon["'][^>]*href=["']([^"']+)["']/i,
  /<link[^>]*rel=["']shortcut icon["'][^>]*href=["']([^"']+)["']/i,
  /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
];

/**
 * 提取 `<link rel="icon">` favicon 并解析为绝对 URL
 * （协议相对 `//` → https，相对路径 → 基于页面 origin 拼接）。
 */
function extractFavicon(html: string, origin: string): string {
  let favicon = '';
  for (const pattern of ICON_PATTERNS) {
    const m = html.match(pattern);
    if (m) {
      favicon = m[1] as string;
      break;
    }
  }
  if (!favicon) return '';
  if (favicon.startsWith('//')) return `https:${favicon}`;
  if (favicon.startsWith('http')) return favicon;
  return `${origin}${favicon.startsWith('/') ? '' : '/'}${favicon}`;
}

/**
 * DuckDuckGo 图标服务 URL。私网/本地地址返回空（与 Rust
 * `html_meta.rs::duckduckgo_favicon_url` 的 localhost / 127.* / 192.168.* 豁免一致）。
 */
function duckduckgoFaviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host.startsWith('127.') || host.startsWith('192.168.')) {
      return '';
    }
    return `https://icons.duckduckgo.com/ip3/${host}.png`;
  } catch {
    return '';
  }
}

/**
 * Google S2 图标服务 URL（DDG 为空时的末级兜底，与 Rust `_` 分支同构）。
 */
function googleFaviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host.startsWith('127.') || host.startsWith('192.168.')) {
      return '';
    }
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return '';
  }
}

/**
 * 下载 favicon 字节并转 data URI：≤64KB、content-type 以 image/ 开头
 * （与 Rust `download_favicon_data_uri` 及 vite 中间件既有约束一致）。
 */
async function downloadFaviconDataUri(favicon: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(favicon, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!resp.ok) return '';
    const declared = Number(resp.headers.get('content-length'));
    if (declared && declared > FAVICON_MAX_BYTES) return '';
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > FAVICON_MAX_BYTES) return '';
    const contentType =
      resp.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!contentType.startsWith('image/')) return '';
    return `data:${contentType};base64,${Buffer.from(buf).toString('base64')}`;
  } catch {
    return '';
  }
}

/**
 * 抓取一次页面元数据（不缓存、不合并，纯抓取层）。
 * 回退链与 Rust `fetch_page_meta_inner` 一致：
 * `<link rel=icon>` → `{origin}/favicon.ico` → DDG（仍无时）→ Google S2（DDG 为空时）。
 * 任何失败返回空字段 PageMeta。
 */
export async function fetchPageMetaOnce(url: string): Promise<PageMeta> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return emptyPageMeta(url);
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    const html = (await response.text()).slice(0, HTML_MAX_LEN);
    const origin = new URL(url).origin;
    const title = extractTitle(html);

    let favicon = extractFavicon(html, origin);
    if (!favicon) {
      favicon = `${origin}/favicon.ico`;
    }
    if (!favicon) {
      const ddg = duckduckgoFaviconUrl(url);
      favicon = ddg || googleFaviconUrl(url);
    }

    let faviconDataUri = '';
    if (
      favicon &&
      (favicon.startsWith('http://') || favicon.startsWith('https://')) &&
      (await pageMetaGateAllows(favicon, undefined, undefined, { rateLimit: false }))
    ) {
      faviconDataUri = await downloadFaviconDataUri(favicon);
    }

    return { title, favicon, faviconDataUri, url };
  } catch {
    return emptyPageMeta(url);
  }
}

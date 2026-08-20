/**
 * previewFetchPageMeta.ts —— 浏览器预览模式的 HTTP 爬虫抓取函数。
 *
 * 【模式分离】预览模式与 Tauri 桌面应用各自独立：
 * - Tauri 模式：使用静默 WebView2 渲染抓取（`fetch_silent_meta`），无 HTTP 爬虫。
 * - 预览模式：使用本文件的 HTTP 爬虫（HTML 抓取 → `<title>`/`og:title` 解析 →
 *   `<link rel=icon>` 解析 → `{origin}/favicon.ico` 惯例兜底）。本文件是
 *   预览模式专属实现，不再对应对应 Rust 函数（Tauri 侧爬虫已删除）。
 *
 * 解析语义为本地 TS 独立实现（`extract_title`/`extract_favicon`/
 * `origin_favicon_fallback` 同构语义；Rust 侧 `html_meta.rs` 已随 Tauri 爬虫
 * 一并删除）；私网豁免/限速语义与本地 `crawlerPolicy.ts` 对齐。
 * DDG / Google S2 代理图标兜底已移除（Fix C/D）。
 *
 * 门控分工：HTML 级 robots/限速门控由调用方（vite.config.ts 中间件）先行执行
 * （本函数入参 url 已通过门控）；favicon 下载的 robots-only 门控
 * （`pageMetaGateAllows(..., { rateLimit: false })`）在本函数内部执行，
 * 对 favicon URL 做二次 robots 检查。
 *
 * 任何失败（非 http(s) URL / 网络错误 / 下载超限）均返回空字段 PageMeta，
 * 由上层 `pageMetaService` 走失败退避路径（不删缓存）。
 */
import { USER_AGENT } from '../src/shared/userAgent';
import { pageMetaGateAllows } from './previewCrawlerGate';
import type { PageMeta } from '../src/shared/ipc/browser';

const FETCH_TIMEOUT_MS = 5000;
const HTML_MAX_LEN = 65536;
// 与 Tauri 后端 `MAX_FAVICON_BYTES`（512KB）保持一致（双端一致性）。
// 每次 favicon 会以 base64 data-URI 持久化入站点缓存，上限需有界但容纳
// 合法的多分辨率 .ico / PNG / SVG 图标（常超 64KB）。
const FAVICON_MAX_BYTES = 512 * 1024;
const TITLE_MAX_LEN = 200;

function emptyPageMeta(url: string): PageMeta {
  return { title: '', favicon: '', faviconDataUri: '', url };
}

/** 与 Rust 已删除 `html_meta.rs` 同构的实体解码集（本地 TS 实现）。 */
function htmlEntityDecode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

/** 从 `<meta>` 标签片段中按属性名取值（双引号/单引号均可）。本地 TS 独立实现，
 * 与 Rust 侧已删除 `html_meta.rs::extract_attr_value` 同构语义。 */
function metaContentOf(tag: string, attr: string): string {
  for (const marker of [`${attr}="`, `${attr}='`]) {
    const idx = tag.indexOf(marker);
    if (idx !== -1) {
      const valueStart = idx + marker.length;
      const quote = marker[marker.length - 1];
      const end = tag.indexOf(quote, valueStart);
      if (end !== -1) {
        const raw = tag.slice(valueStart, end);
        if (raw.length > 0) return raw;
      }
    }
  }
  return '';
}

/** 从 HTML 中按 property 值提取 `<meta>` 的 content。本地 TS 独立实现，与 Rust 侧
 * 已删除 `html_meta.rs::extract_meta_content` 同构语义。 */
function extractMetaContent(html: string, property: string): string {
  const lower = html.toLowerCase();
  const propLower = property.toLowerCase();
  const markers = [
    `property="${propLower}"`,
    `property='${propLower}'`,
    `property = "${propLower}"`,
    `property = '${propLower}'`,
  ];
  for (const marker of markers) {
    const start = lower.indexOf(marker);
    if (start !== -1) {
      const tagStart = lower.lastIndexOf('<meta', start);
      if (tagStart === -1) continue;
      const tagEnd = lower.indexOf('>', tagStart);
      if (tagEnd === -1) continue;
      const tag = html.slice(tagStart, tagEnd);
      const content = metaContentOf(tag, 'content');
      if (content.length > 0) return content;
    }
  }
  return '';
}

/**
 * 提取页面标题：`<title>` 优先，其次 `<meta property="og:title">`。
 * 语义与 Rust 侧已删除 `html_meta.rs::extract_title` 同构：实体解码全集、
 * og:title 属性顺序/引号/空格鲁棒、标题截断 200 字符。
 */
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  let title = titleMatch?.[1]?.trim() || '';
  if (!title) {
    title = extractMetaContent(html, 'og:title').trim();
  }
  return htmlEntityDecode(title).slice(0, TITLE_MAX_LEN);
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
 * 魔数内容嗅探兜底：很多 CDN 提供 `.ico`/`.png` 时不带（或带非 image）Content-Type，
 * 会阻塞 data-URI 生成。与 Rust `sniff_image_content_type`（commands/browser.rs）
 * 保持同构，使预览与 Tauri 双端接受相同的 favicon 集合。返回稳定的 `image/*` mime
 * 或 `None`（未知格式）。
 */
function sniffImageContentType(bytes: Uint8Array): string | null {
  const sig = (offset: number, expected: number[]) =>
    bytes.length >= offset + expected.length && expected.every((b, i) => bytes[offset + i] === b);
  if (sig(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (sig(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (sig(0, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (sig(0, [0x00, 0x00, 0x01, 0x00])) return 'image/x-icon';
  if (bytes.length >= 12 && sig(0, [0x52, 0x49, 0x46, 0x46]) && sig(8, [0x57, 0x45, 0x42, 0x50]))
    return 'image/webp';
  if (sig(0, [0x42, 0x4d])) return 'image/bmp';
  return null;
}

/**
 * 下载 favicon 字节并转 data URI：≤`FAVICON_MAX_BYTES`（512KB，与 Tauri 双端一致），
 * 声明头为 image/* 或魔数可识别（与 Rust `download_favicon_data_uri` 同构）。
 * `referer` 为页面 URL（模拟页面内资源加载以规避 CDN 防盗链，与 Rust 端
 * `download_favicon_data_uri(..., Some(referer))` 双端一致）。
 * 任何失败返回空串。
 */
async function downloadFaviconDataUri(favicon: string, referer: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(favicon, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Referer: referer },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!resp.ok) return '';
    const declared = Number(resp.headers.get('content-length'));
    if (declared && declared > FAVICON_MAX_BYTES) return '';
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > FAVICON_MAX_BYTES) return '';
    const bytes = new Uint8Array(buf);
    const contentType = resp.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    // 声明头缺失或非 image/* 时，用魔数判定真实格式（同 Rust 兜底语义）。
    const mime = contentType.startsWith('image/')
      ? contentType
      : (sniffImageContentType(bytes) ?? '');
    if (!mime) return '';
    return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return '';
  }
}

/**
 * 抓取一次页面元数据（不缓存、不合并，纯抓取层）。
 * 预览模式专属 HTTP 爬虫，回退链与 Rust 侧已删除 `html_meta.rs` 同构：
 * `<link rel=icon>` → `{origin}/favicon.ico`，无代理兜底（Fix C）。
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
    // Fix C：不再回退 DDG / Google S2 代理图标（对无收录域名返回默认地球图标、
    // 且被墙/不稳定），仅接受页面真实声明或 origin 惯例兜底。

    let faviconDataUri = '';
    // favicon 在上方兜底后必非空（origin 惯例），无需再判 truthy。
    if (
      (favicon.startsWith('http://') || favicon.startsWith('https://')) &&
      (await pageMetaGateAllows(favicon, undefined, undefined, { rateLimit: false }))
    ) {
      faviconDataUri = await downloadFaviconDataUri(favicon, url);
    }

    return { title, favicon, faviconDataUri, url };
  } catch {
    return emptyPageMeta(url);
  }
}

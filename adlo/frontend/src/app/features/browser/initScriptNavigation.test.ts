import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * C1 回归测试：验证注入到 WebView2 的 `init_script.js` 中的两个纯函数
 * （`__adlNormalizeHistoryUrl` / `__adlResolveHistoryNavigation`）与前端
 * `historyDedupKey` 规则一致，确保 SPA URL 变体（Bilibili vd_source /
 * spm_id_from / trackid 等跟踪参数）在原生历史栈中折叠为同一条目。
 *
 * 从 Rust crate 直接读取真源（`include_str!` 内联的同一文件），通过
 * marker 注释提取纯函数块并 eval，避免双份实现漂移。
 */
const INIT_SCRIPT_PATH = resolve(process.cwd(), '../crates/browser/src/init_script.js');
const initScript = readFileSync(INIT_SCRIPT_PATH, 'utf8');

function extractPureBlock(): string {
  const startMarker = '// __ADL_PURE_START__';
  const endMarker = '// __ADL_PURE_END__';
  const start = initScript.indexOf(startMarker);
  const end = initScript.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`missing pure markers in init_script.js (start=${start}, end=${end})`);
  }
  return initScript.slice(start + startMarker.length, end);
}

interface ResolveResult {
  action: 'push' | 'replace';
  url: string;
}

function loadPure(): {
  normalize: (rawUrl: string, baseHref: string) => string | null;
  resolve: (rawUrl: string, baseHref: string) => ResolveResult;
  truncate: (name: string) => string;
} {
  const block = extractPureBlock();
  const factory = new Function(
    `${block}\nreturn { normalize: __adlNormalizeHistoryUrl, resolve: __adlResolveHistoryNavigation, truncate: __adlTruncateName };`,
  );
  return factory() as {
    normalize: (rawUrl: string, baseHref: string) => string | null;
    resolve: (rawUrl: string, baseHref: string) => ResolveResult;
    truncate: (name: string) => string;
  };
}

const BILI_BASE = 'https://www.bilibili.com/video/BV1eSGP6BEfn';
const YT_BASE = 'https://www.youtube.com/watch?v=AAA';

describe('init_script.js blob name truncation', () => {
  const { truncate } = loadPure();

  it('caps at 255 code units, keeps the extension and avoids lone surrogates', () => {
    expect(truncate('a'.repeat(300))).toHaveLength(255);

    const long = 'x'.repeat(300) + '.pdf';
    const out = truncate(long);
    expect(out.length).toBeLessThanOrEqual(255);
    expect(out.endsWith('.pdf')).toBe(true);

    const cut = truncate('😀'.repeat(200));
    expect(cut.length).toBeLessThanOrEqual(255);
    expect(/[\uD800-\uDBFF]$/.test(cut)).toBe(false);
  });

  it('keeps only the basename for directory-like download names', () => {
    expect(truncate('dir/name.ext')).toBe('name.ext');
    expect(truncate('C:\\dir\\name.ext')).toBe('name.ext');
    expect(truncate('/')).toBe('download');
  });
});

describe('init_script.js C1 URL normalization', () => {
  const { normalize } = loadPure();

  it('strips vd_source tracking param so variants collapse', () => {
    expect(normalize(`${BILI_BASE}?vd_source=f2043`, BILI_BASE)).toBe(BILI_BASE);
  });

  it('strips multiple tracking params (vd_source, spm_id_from, trackid)', () => {
    const withTrackers = `${BILI_BASE}?vd_source=f2043&spm_id_from=333.851.b_626c5638312c7433314.1&trackid=abc`;
    expect(normalize(withTrackers, BILI_BASE)).toBe(BILI_BASE);
  });

  it('keeps meaningful params while stripping tracking params', () => {
    expect(normalize(`${BILI_BASE}?vd_source=f2043&p=2`, BILI_BASE)).toBe(`${BILI_BASE}?p=2`);
  });

  it('keeps youtube video identity params distinct', () => {
    expect(normalize(`${YT_BASE}`, YT_BASE)).toBe(YT_BASE);
    expect(normalize(`${YT_BASE}&utm_source=x`, YT_BASE)).toBe(YT_BASE);
  });

  it('sorts remaining params so reordered variants collapse', () => {
    const a = normalize(`${BILI_BASE}?p=2&b=1`, BILI_BASE);
    const b = normalize(`${BILI_BASE}?b=1&p=2`, BILI_BASE);
    expect(a).toBe(b);
    expect(a).toBe(`${BILI_BASE}?b=1&p=2`);
  });

  it('strips trailing slash so /path/ and /path collapse', () => {
    expect(normalize(`${BILI_BASE}/`, BILI_BASE)).toBe(BILI_BASE);
  });

  it('keeps hash for anchor navigation (page#a vs page#b stay distinct)', () => {
    expect(normalize(`${BILI_BASE}#comment`, BILI_BASE)).toBe(`${BILI_BASE}#comment`);
  });

  it('keeps the origin so the normalized URL stays pushState-safe', () => {
    // The URL passed to pushState/replaceState must keep the page's own origin;
    // www-variants are only collapsed in the *comparison* key, never rewritten.
    expect(normalize(`${BILI_BASE}?vd_source=x`, BILI_BASE)).toBe(BILI_BASE);
    expect(normalize(BILI_BASE, BILI_BASE)).toContain('https://www.bilibili.com');
  });

  it('returns null for invalid URLs', () => {
    expect(normalize('http://[invalid', BILI_BASE)).toBe(null);
  });

  it('collapses YouTube radio churn (list=RD / start_radio / pp / index)', () => {
    const entry = 'https://www.youtube.com/watch?v=GwoY5ooF8oQ&list=RDGwoY5ooF8oQ&start_radio=1';
    const withPp =
      'https://www.youtube.com/watch?v=GwoY5ooF8oQ&list=RDGwoY5ooF8oQ&start_radio=1&pp=oAcB';
    const withIndex = 'https://www.youtube.com/watch?v=GwoY5ooF8oQ&list=RDGwoY5ooF8oQ&index=8';
    expect(normalize(withPp, entry)).toBe(normalize(entry, entry));
    expect(normalize(withIndex, entry)).toBe(normalize(entry, entry));
    expect(normalize(entry, entry)).toBe('https://www.youtube.com/watch?v=GwoY5ooF8oQ');
  });

  it('keeps a real YouTube playlist (list=PL...) in the identity', () => {
    const playlist = 'https://www.youtube.com/watch?v=AAA&list=PLabc123&index=2';
    const normalized = normalize(playlist, playlist);
    expect(normalized).toContain('list=PLabc123');
    expect(normalized).toContain('index=2');
  });
});

describe('init_script.js C1 push/replace decision', () => {
  const { resolve } = loadPure();

  it('uses replaceState when normalized URL equals current location', () => {
    const result = resolve(`${BILI_BASE}?vd_source=f2043`, BILI_BASE);
    expect(result.action).toBe('replace');
    expect(result.url).toBe(BILI_BASE);
  });

  it('uses pushState when URL changes to a different page', () => {
    const other = 'https://www.bilibili.com/video/BV1W9enziEGi';
    const result = resolve(other, BILI_BASE);
    expect(result.action).toBe('push');
    expect(result.url).toBe(other);
  });

  it('uses pushState when a meaningful param changes (p=1 -> p=2)', () => {
    const current = `${BILI_BASE}?p=1`;
    const next = `${BILI_BASE}?vd_source=x&p=2`;
    const result = resolve(next, current);
    expect(result.action).toBe('push');
    expect(result.url).toBe(`${BILI_BASE}?p=2`);
  });

  it('uses pushState for hash anchor navigation (page#a -> page#b)', () => {
    const result = resolve(`${BILI_BASE}#b`, `${BILI_BASE}#a`);
    expect(result.action).toBe('push');
  });

  it('falls back to push with the raw url when normalization fails', () => {
    const result = resolve('http://[invalid', BILI_BASE);
    expect(result.action).toBe('push');
    expect(result.url).toBe('http://[invalid');
  });
});

describe('init_script.js new-tab interception markers', () => {
  it('defines the new-tab helper and open-new-tab postMessage payload', () => {
    expect(initScript).toContain('__adlTryOpenNewTab');
    expect(initScript).toContain("type: 'open-new-tab'");
    expect(initScript).toContain('chrome.webview.postMessage');
  });

  it('routes the shell plugin open command to the in-app new-tab channel', () => {
    // Tauri shell 插件的 body 点击处理器把 target=_blank 交给 plugin:shell|open，
    // 浏览器子 WebView 中 browser-remote 只覆盖 https 源（remote.urls: ["https://*"]，
    // 仅 core:default）；http 页（DSH 的 http://127.0.0.1:3080）没有任何 capability
    // 覆盖其 remote 源。两处 plugin:shell|open 都被 ACL 拒绝，preventDefault 已生效，
    // 原生新窗口路由无法执行（2026-11-25 DSH 设置弹窗链接无反应）。
    expect(initScript).toContain("cmd === 'plugin:shell|open'");
    expect(initScript).toContain('__adlShellOpenPatched');
    expect(initScript).toContain('__adlPatchShellOpen');
  });

  it('routes target=_blank and modified clicks to the new-tab helper', () => {
    expect(initScript).toContain('__adlTryOpenNewTab(href, __adlReferrerForLink(target, href))');
    // target="_blank" links and modified clicks (ctrl/meta/shift/middle) use the
    // postMessage new-tab channel; ordinary same-tab clicks stay native.
    const helperUsage = initScript.indexOf(
      '__adlTryOpenNewTab(href, __adlReferrerForLink(target, href)))',
    );
    const helperStart = initScript.lastIndexOf('function __adlRouteNewWindowEvent', helperUsage);
    const helperBlock = initScript.slice(helperStart, helperUsage + 80);
    expect(helperBlock).toContain("linkTarget === '_blank'");
    expect(helperBlock).toContain('modifiedClick');
    expect(helperBlock).toContain('ctrlKey');
    // 中键由 auxclick 投递，不能依赖 click 的 event.button。
    expect(helperBlock).toContain("event.type === 'auxclick' && event.button === 1");
    // 安装期 gate 的 window.open 包装不再吞掉 agent 站点的 URL（无 DOM 上下文，
    // 站点自身的登录/反馈/充值必须走原生新窗口路径）。
    expect(initScript).not.toContain(
      "if (__adlIsAgentHost() && __adlSendAgentLink('url', resolvedUrl))",
    );
    // 站点 chrome（设置弹窗/菜单/导航）不被 agent 拦截，交回全站新窗口路由。
    expect(initScript).toContain('function __adlIsSiteChrome(el)');
    expect(initScript).toContain(
      'if (__adlIsAgentHost() && !__adlIsSiteChrome(event.target)) return;',
    );
    expect(initScript).toContain(
      "window.addEventListener('auxclick', __adlRouteNewWindowEvent, false);",
    );
    // bubble 阶段 + 先判 defaultPrevented：页面自身的取消/接管优先。
    expect(initScript).toContain(
      "window.addEventListener('click', __adlRouteNewWindowEvent, false);",
    );
    expect(initScript).toContain('if (event.defaultPrevented) return;');
  });

  it('forwards the originating URL as referrer and honors rel=noreferrer', () => {
    expect(initScript).toContain('payload.referrer = referrer');
    expect(initScript).toContain("rel.indexOf('noreferrer')");
    expect(initScript).toContain('location.href.split');
    // 默认 strict-origin-when-cross-origin：同源全 URL、跨源仅 origin、HTTPS→HTTP 不发；
    // 并尊重链接 referrerpolicy 与文档级 meta referrer 的 opt-out。
    expect(initScript).toContain('var crossOrigin = target.origin !== location.origin;');
    expect(initScript).toContain("location.protocol === 'https:'");
    expect(initScript).toContain("target.protocol === 'http:'");
    expect(initScript).toContain('link.referrerPolicy');
    expect(initScript).toContain('meta[name="referrer"]');
  });

  it('only posts host messages from http(s) documents', () => {
    // wry parses the WebView message source URL; file:// documents with
    // non-ASCII paths can make that parse fail and abort the app. Adlo only
    // sends host messages from real web documents.
    expect(initScript).toContain('function __adlCanPostToHost()');
    expect(initScript).toContain("location.protocol !== 'http:'");
    expect(initScript).toContain("location.protocol !== 'https:'");
    expect(initScript).toContain('function __adlPostToHost(');
    expect(initScript).not.toContain('chrome.webview.postMessage(JSON.stringify');
  });

  it('routes blob: links to the host save channel on every site', () => {
    // Blob downloads have no native WebView2 path; the handler runs outside the
    // agent-only branch and the host channel is postMessage (not __TAURI__).
    expect(initScript).toContain("type: 'save-blob'");
    expect(initScript).toContain('__adlDownloadBlob(blobHref, blobName)');
    const blobHandler = initScript.slice(
      initScript.indexOf('// Blob downloads:'),
      initScript.indexOf('// New-window links:'),
    );
    expect(blobHandler).toContain('isBlobUrl(target.href)');
    expect(blobHandler).toContain('stopImmediatePropagation');
    // 普通站点仅在显式 download 链接时接管；agent 站点保留全量 blob 链接保存。
    expect(blobHandler).toContain("target.hasAttribute('download')");
    // 页面侧失败（超限/抓取失败）也回传宿主，让用户看到同一条失败提示。
    expect(initScript).toContain("type: 'save-blob-failed'");
    expect(initScript).toContain('__adlNotifyBlobFailed(filename');
    // 长导出名先截断（不切断代理对），避免宿主解析层静默丢弃。
    expect(initScript).toContain('function __adlTruncateName(name)');
    expect(initScript).toContain('filename = __adlTruncateName(filename);');
    const blobSection = initScript.slice(
      initScript.indexOf('function __adlDownloadBlob'),
      initScript.indexOf('// 处理导航'),
    );
    expect(blobSection).toContain('__adlSaveBlobDownload(filename, b64);');
    expect(blobSection).toContain("__adlNotifyBlobFailed(filename, 'too large')");
    expect(blobSection).toContain("__adlNotifyBlobFailed(filename, 'fetch failed: ' + String(e))");
  });

  it('leaves plain same-tab clicks to native navigation (no nav-guard interception)', () => {
    // The agent-only nav-guard remains for agent sites, but ordinary sites use
    // native navigation; the new-window handler only prevents default for
    // target=_blank/forced clicks.
    const handlerStart = initScript.indexOf('// New-window links:');
    const handlerEnd = initScript.indexOf('// Click interception:', handlerStart);
    const block = initScript.slice(handlerStart, handlerEnd);
    expect(block).toContain("linkTarget === '_blank'");
    expect(block).toContain('modifiedClick');
    expect(block).not.toContain('__startNavGuard');
  });

  it('does not start the SPA nav-guard in the new-tab path', () => {
    const usage = initScript.indexOf(
      '__adlTryOpenNewTab(href, __adlReferrerForLink(target, href)))',
    );
    const tail = initScript.slice(usage, usage + 120);
    expect(tail).not.toContain('__startNavGuard');
  });

  it('uses a hidden iframe for target=_blank download links, not window.location.assign', () => {
    const branchMarker = "(target.hasAttribute('download') || __adlIsDownloadExtensionUrl(href))";
    const branchStart = initScript.indexOf(branchMarker);
    expect(branchStart).toBeGreaterThan(-1);
    const branchEnd = initScript.indexOf('if (__adlTryOpenNewTab(href', branchStart);
    expect(branchEnd).toBeGreaterThan(branchStart);
    const branch = initScript.slice(branchStart, branchEnd);
    const helperStart = initScript.indexOf('function __adlTriggerNativeDownload');
    const helperEnd = initScript.indexOf('// New-window links:', helperStart);
    const helper = initScript.slice(helperStart, helperEnd);
    expect(branch).toContain('event.preventDefault()');
    expect(branch).toContain('__adlTriggerNativeDownload(href)');
    expect(helper).toContain("document.createElement('iframe')");
    expect(helper).toContain("dlFrame.style.display = 'none'");
    expect(helper).toContain('dlFrame.src = url');
    expect(helper).toContain('document.body || document.documentElement');
    expect(helper).toContain('container.appendChild(dlFrame)');
    expect(helper).toContain('removeChild(dlFrame)');
    expect(helper).toContain('30000');
    expect(branch).not.toContain('window.location.assign');
    expect(initScript).not.toContain('window.location.assign(resolvedUrl)');
  });

  it('delegates window.open(http) to native handling', () => {
    const marker = 'var origOpen = window.open;';
    const openRewrite = initScript.slice(
      initScript.indexOf(marker) - 50,
      initScript.indexOf(marker) + 900,
    );
    expect(openRewrite).toContain('window.open');
    expect(openRewrite).toContain('origOpen');
  });

  it('resolves relative window.open URLs and triggers a hidden download frame', () => {
    // 用户自建网站通过 window.open('/uploads/.../file.exe', '_blank') 触发下载。
    // Chrome/Edge 会先把相对路径解析为完整 URL 再打开；旧实现将相对路径判为
    // invalid URL 返回 null 导致下载不触发。回归断言：window.open 重写必须
    // 用 new URL(rawUrl, location.href) 解析相对路径，且下载 URL 走隐藏 iframe
    // → 原生 DownloadStarting。
    const marker = 'var origOpen = window.open;';
    const openRewrite = initScript.slice(initScript.indexOf(marker), initScript.length);
    expect(openRewrite).toContain('new URL(rawUrl, location.href)');
    expect(openRewrite).toContain("parsed.protocol === 'http:'");
    expect(openRewrite).toContain('__adlIsDownloadExtensionUrl(resolvedUrl)');
    expect(openRewrite).not.toContain('isDownloadUrl(resolvedUrl)');
    expect(openRewrite).toContain('__adlTriggerNativeDownload(resolvedUrl)');
    expect(openRewrite).toContain(
      "__adlSendLog('info', 'window.open: download URL routed to hidden iframe native DownloadStarting'",
    );
  });

  function loadWindowOpenRewrite(
    isAgentHost = false,
    isDownloadExtensionUrl: (value: string) => boolean = (value) => /\.exe(?:[?#]|$)/i.test(value),
    hasBody = true,
  ) {
    const nativeOpen = vi.fn((_url?: string, _name?: string, _features?: string) => ({
      native: true,
    }));
    const assign = vi.fn();
    const frames: {
      style: { display: string };
      src: string;
      parentNode: unknown;
    }[] = [];
    const body = {
      appendChild(frame: (typeof frames)[number]) {
        frame.parentNode = body;
        frames.push(frame);
      },
      removeChild(frame: (typeof frames)[number]) {
        frame.parentNode = null;
        const index = frames.indexOf(frame);
        if (index !== -1) {
          frames.splice(index, 1);
        }
      },
    };
    const fakeDocument = {
      body: hasBody ? body : null,
      documentElement: body,
      createElement: (tagName: string) => ({
        tagName,
        style: { display: '' },
        src: '',
        parentNode: null as unknown,
      }),
    };
    const fakeWindow = {
      open: nativeOpen,
      location: {
        href: 'https://weishi.safe.360.cn/product-douyin.html',
        assign,
      },
    };
    const helperMarker = 'function __adlTriggerNativeDownload';
    const helperEndMarker = '// New-window links:';
    const openMarker = 'var origOpen = window.open;';
    const endMarker = '// 2. 监听表单提交';
    const helper = initScript.slice(
      initScript.indexOf(helperMarker),
      initScript.indexOf(helperEndMarker),
    );
    const openBlock = initScript.slice(
      initScript.indexOf(openMarker),
      initScript.indexOf(endMarker),
    );
    const block = `${helper}\n${openBlock}`;
    new Function(
      'window',
      'location',
      'document',
      'isValidWebUrl',
      '__adlIsDownloadExtensionUrl',
      '__adlSendLog',
      '__adlIsAgentHost',
      block,
    )(
      fakeWindow,
      fakeWindow.location,
      fakeDocument,
      (value: string) => /^https?:/i.test(value),
      isDownloadExtensionUrl,
      vi.fn(),
      () => isAgentHost,
    );
    return { open: fakeWindow.open, nativeOpen, assign, frames };
  }

  it('routes normal-site window.open downloads through a hidden current-document frame', () => {
    const { open, nativeOpen, assign, frames } = loadWindowOpenRewrite(false);
    const result = open('/package.exe', '_blank');

    expect(result).toBeNull();
    expect(nativeOpen).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    expect(frames[0].style.display).toBe('none');
    expect(frames[0].src).toBe('https://weishi.safe.360.cn/package.exe');
  });

  it('triggers window.open downloads before document.body exists', () => {
    const { open, nativeOpen, assign, frames } = loadWindowOpenRewrite(false, undefined, false);
    const result = open('/package.exe', '_blank');

    expect(result).toBeNull();
    expect(nativeOpen).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    expect(frames[0].style.display).toBe('none');
    expect(frames[0].src).toBe('https://weishi.safe.360.cn/package.exe');
  });

  it('keeps inline-renderable window.open download candidates off the current document', () => {
    const { open, nativeOpen, assign, frames } = loadWindowOpenRewrite(false, (value) =>
      /\.pdf(?:[?#]|$)/i.test(value),
    );
    const result = open('/brochure.pdf', '_blank');

    expect(result).toBeNull();
    expect(nativeOpen).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    expect(frames[0].style.display).toBe('none');
    expect(frames[0].src).toBe('https://weishi.safe.360.cn/brochure.pdf');
  });

  it('delegates loose-path window.open candidates to the native new-tab path', () => {
    const { open, nativeOpen, assign, frames } = loadWindowOpenRewrite(false);
    const result = open('/files/help', '_blank');

    expect(result).toEqual({ native: true });
    expect(nativeOpen).toHaveBeenCalledWith(
      'https://weishi.safe.360.cn/files/help',
      '_blank',
      undefined,
    );
    expect(assign).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it('keeps normal-site window.open page links on the native new-tab path', () => {
    const { open, nativeOpen, assign, frames } = loadWindowOpenRewrite(false);
    const result = open('https://target.example/page', '_blank');

    expect(result).toEqual({ native: true });
    expect(nativeOpen).toHaveBeenCalledWith('https://target.example/page', '_blank', undefined);
    expect(assign).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it('keeps normal-site non-web window.open URLs on the native path', () => {
    const { open, nativeOpen, assign, frames } = loadWindowOpenRewrite(false);
    const result = open('mailto:test@example.com', '_blank');

    expect(result).toEqual({ native: true });
    expect(nativeOpen).toHaveBeenCalledWith('mailto:test@example.com', '_blank', undefined);
    expect(assign).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it('normalizes download forms with target=_blank to _self (native DownloadStarting)', () => {
    // 下载表单 target=_blank 会经 new_window_handler 打开新窗口被 DENY 取消下载。
    // 回归断言：submit 处理在 action 为下载 URL 且 target 非 _self 时，改写
    // target='_self' 使其走同文档原生下载管线（与 <a download> 归一化一致）。
    const marker = "document.addEventListener('submit', function(event)";
    const formSubmit = initScript.slice(initScript.indexOf(marker), initScript.length);
    expect(formSubmit).toContain("if (form.target && form.target !== '_self')");
    expect(formSubmit).toContain("form.target = '_self'");
    expect(formSubmit).toContain("'form submit: download form normalized target'");
  });

  it('routes download links with target=_blank via origOpen (not _self) for new-tab native download', () => {
    // Download links with target="_blank" now use origOpen() to trigger
    // NewWindowRequested → new_window_handler → new tab → native DownloadStarting.
    // This aligns with Chrome/Edge behavior instead of forcing _self.
    const clickMarker =
      "if ((target.hasAttribute('download') || isDownloadUrl(href)) && isValidWebUrl(href))";
    const clickStart = initScript.indexOf(clickMarker);
    expect(clickStart).toBeGreaterThan(-1);
    const clickSection = initScript.slice(clickStart, clickStart + 1400);
    // The download handler now routes target="_blank" via origOpen, not _self
    expect(clickSection).toContain("if (linkTarget === '_blank')");
    expect(clickSection).toContain("origOpen.call(window, href, '_blank')");
    expect(clickSection).not.toContain("target.target = '_self'");
  });
});

describe('init_script.js agent-link interception', () => {
  const posted: Record<string, unknown>[] = [];
  const DEFAULT_TEST_RULES = [
    {
      id: 'builtin-file-like-attribute',
      enabled: true,
      matchSelector: 'button, a, [role="button"], [role="link"]',
      attributes: [
        'title',
        'aria-label',
        'data-path',
        'data-file-path',
        'data-file',
        'data-url',
        'data-src',
      ],
      pathPreset: 'fileLike',
      action: 'file',
    },
  ];

  beforeAll(() => {
    (window as unknown as Record<string, unknown>).chrome = {
      webview: {
        postMessage: (raw: string) => {
          try {
            posted.push(JSON.parse(raw) as Record<string, unknown>);
          } catch {
            /* ignore non-JSON payloads */
          }
        },
      },
    };
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: async () => undefined,
    };
    try {
      // Execute the injected script once into the jsdom document. The click
      // delegation listener is registered before any WebView2-only API is
      // touched, so later jsdom gaps cannot disable the interception branch.
      new Function(initScript)();
    } catch {
      /* jsdom may lack a WebView2-only API; the click listener is already live */
    }
  });

  beforeEach(() => {
    posted.length = 0;
    const w = window as unknown as Record<string, unknown>;
    w.__adlAgentRules = DEFAULT_TEST_RULES;
    delete w.__adlAgentOverridesByOrigin;
  });

  function setAgent(origins: string[], enabled: boolean) {
    const w = window as unknown as Record<string, unknown>;
    w.__adlAgentOrigins = origins;
    w.__adlAgentInterceptEnabled = enabled;
  }

  function setAgentRules(
    rules: Record<string, unknown>[],
    overrides: Record<string, unknown>[] = [],
  ) {
    const w = window as unknown as Record<string, unknown>;
    w.__adlAgentRules = rules;
    w.__adlAgentOverridesByOrigin = overrides;
  }

  function clickAnchor(href: string): MouseEvent {
    const a = document.createElement('a');
    a.href = href;
    document.body.appendChild(a);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(event);
    a.remove();
    return event;
  }

  function clickButtonWithAttrs(attrs: Record<string, string>): MouseEvent {
    const button = document.createElement('button');
    for (const [name, value] of Object.entries(attrs)) {
      button.setAttribute(name, value);
    }
    document.body.appendChild(button);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    button.dispatchEvent(event);
    button.remove();
    return event;
  }

  function agentLinks(): Record<string, unknown>[] {
    return posted.filter((m) => m.type === 'adl-agent-link');
  }

  it('intercepts an http link on a whitelisted agent host as kind=url', () => {
    setAgent([window.location.origin], true);
    clickAnchor('https://example.com/x');
    expect(agentLinks()).toEqual([
      { type: 'adl-agent-link', kind: 'url', url: 'https://example.com/x' },
    ]);
  });

  it('leaves site chrome links to the native new-tab route', () => {
    setAgent([window.location.origin], true);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const href = 'https://platform.deepseek.com/';
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    dialog.appendChild(a);
    document.body.appendChild(dialog);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(event);
    dialog.remove();
    // 站点自身设置弹窗里的链接绝不是 agent 内容：不得走 adl-agent-link。
    expect(agentLinks()).toHaveLength(0);
    expect(posted.some((message) => message.type === 'open-new-tab' && message.url === href)).toBe(
      true,
    );
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves native <dialog> links to the app open-new-tab route', () => {
    setAgent([window.location.origin], true);
    const dialog = document.createElement('dialog');
    const href = 'https://platform.deepseek.com/usage';
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    dialog.appendChild(a);
    document.body.appendChild(dialog);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(event);
    dialog.remove();

    // 原生 <dialog> 没有显式 role：按标签名识别为站点 chrome，不能吞进 agent 通道。
    expect(agentLinks()).toHaveLength(0);
    expect(posted.some((message) => message.type === 'open-new-tab' && message.url === href)).toBe(
      true,
    );
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores aria-modal="false" when classifying site chrome', () => {
    setAgent([window.location.origin], true);
    const host = document.createElement('div');
    host.setAttribute('aria-modal', 'false');
    const href = 'https://example.com/body-link';
    const a = document.createElement('a');
    a.href = href;
    host.appendChild(a);
    document.body.appendChild(host);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    host.remove();

    // aria-modal="false" 不是 modal chrome；正文链接仍按 agent 内容拦截。
    expect(agentLinks()).toEqual([{ type: 'adl-agent-link', kind: 'url', url: href }]);
  });

  it('treats <header> content as site chrome (pins the intentional breadth)', () => {
    setAgent([window.location.origin], true);
    const header = document.createElement('header');
    const a = document.createElement('a');
    a.href = 'https://example.com/header-link';
    header.appendChild(a);
    document.body.appendChild(header);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    header.remove();

    // 设计取舍：header/aside/footer 整棵子树都按站点 chrome 处理，避免站点导航被拦截。
    expect(agentLinks()).toHaveLength(0);
  });

  it('applies rules whose id collides with Object.prototype members', () => {
    setAgent([window.location.origin], true);
    const rule = {
      id: 'constructor',
      enabled: true,
      matchSelector: 'button',
      attributes: ['data-file-path'],
      pathPreset: 'fileLike',
      action: 'file',
    };
    setAgentRules([], [{ origin: window.location.origin, siteRules: [rule] }]);
    clickButtonWithAttrs({ 'data-file-path': 'E:\\ws\\constructor.md' });
    expect(agentLinks()).toEqual([
      { type: 'adl-agent-link', kind: 'file', url: 'E:\\ws\\constructor.md' },
    ]);
  });

  it('applies a rule whose id is __proto__', () => {
    setAgent([window.location.origin], true);
    const protoRule = {
      id: '__proto__',
      enabled: true,
      matchSelector: 'button',
      attributes: ['data-file-path'],
      pathPreset: 'fileLike',
      action: 'file',
    };
    setAgentRules([], [{ origin: window.location.origin, siteRules: [protoRule] }]);
    clickButtonWithAttrs({ 'data-file-path': 'E:\\ws\\proto.md' });
    expect(agentLinks()).toEqual([
      { type: 'adl-agent-link', kind: 'file', url: 'E:\\ws\\proto.md' },
    ]);
  });

  it('ignores the Tauri shell plugin auto-open link listener', () => {
    (window as unknown as Record<string, unknown>).__shellCalls = [];
    const shellLike = new Function(
      'event',
      'window.__shellCalls.push(1); void "plugin:shell|open";',
    );
    document.body.addEventListener('click', shellLike as EventListener);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect((window as unknown as { __shellCalls: number[] }).__shellCalls).toHaveLength(0);
  });

  it('keeps ordinary body click listeners working', () => {
    const calls: number[] = [];
    const normal = () => {
      calls.push(1);
    };
    document.body.addEventListener('click', normal);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.body.removeEventListener('click', normal);
    expect(calls).toHaveLength(1);
  });

  it('routes plugin:shell|open to open-new-tab (browser sub-webview capability denial)', async () => {
    const internals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ as {
      invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
    };
    await internals.invoke('plugin:shell|open', {
      path: 'https://platform.deepseek.com/',
    });
    expect(
      posted.some(
        (message) =>
          message.type === 'open-new-tab' && message.url === 'https://platform.deepseek.com/',
      ),
    ).toBe(true);
  });

  it('stops page click handlers after agent-link interception (no duplicate window.open)', () => {
    setAgent([window.location.origin], true);
    const href = 'https://www.deepseek.com/harness/';
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    let pageHandlerCalls = 0;
    a.addEventListener('click', () => {
      pageHandlerCalls += 1;
      window.open(href, '_blank');
    });
    // 后注册的 document 捕获监听器：只有 stopImmediatePropagation 能阻止它
    // （stopPropagation 仍会执行同节点后续监听器）。
    let documentCaptureCalls = 0;
    const documentHandler = () => {
      documentCaptureCalls += 1;
    };
    document.addEventListener('click', documentHandler, true);
    document.body.appendChild(a);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(event);
    a.remove();
    document.removeEventListener('click', documentHandler, true);
    expect(pageHandlerCalls).toBe(0);
    expect(documentCaptureCalls).toBe(0);
    expect(agentLinks()).toEqual([{ type: 'adl-agent-link', kind: 'url', url: href }]);
  });

  it('does not treat a site-relative attribute path as a local file', () => {
    setAgent([window.location.origin], true);
    const event = clickButtonWithAttrs({ 'data-src': '/assets/hero.png' });
    expect(agentLinks()).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('intercepts a file-like title on a clickable button on a whitelisted agent host', () => {
    setAgent([window.location.origin], true);
    clickButtonWithAttrs({
      title: 'E:\\Test-Workspace-1\\current-time.md',
      class: '_fileMention_1ypvv_85 _fileLink_1ypvv_59',
    });
    expect(agentLinks()).toEqual([
      {
        type: 'adl-agent-link',
        kind: 'file',
        url: 'E:\\Test-Workspace-1\\current-time.md',
      },
    ]);
  });

  it('trims surrounding whitespace before sending a matched local path', () => {
    setAgent([window.location.origin], true);
    clickButtonWithAttrs({ title: '  E:\\ws\\a.md  ' });
    expect(agentLinks()).toEqual([{ type: 'adl-agent-link', kind: 'file', url: 'E:\\ws\\a.md' }]);
  });

  it('does not intercept a button without a local-file attribute value', () => {
    setAgent([window.location.origin], true);
    const event = clickButtonWithAttrs({ title: 'Something else' });
    expect(agentLinks()).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('intercepts a file:// link on a whitelisted agent host as kind=file', () => {
    setAgent([window.location.origin], true);
    clickAnchor('file:///C:/ws/a.md');
    expect(agentLinks()).toEqual([
      { type: 'adl-agent-link', kind: 'file', url: 'file:///C:/ws/a.md' },
    ]);
  });

  it('does NOT intercept a mailto: link (native action must proceed)', () => {
    setAgent([window.location.origin], true);
    const event = clickAnchor('mailto:a@b.example');
    expect(agentLinks()).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does NOT intercept a same-document #hash link (native in-page scroll)', () => {
    setAgent([window.location.origin], true);
    const event = clickAnchor('#section');
    expect(agentLinks()).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not intercept when the feature toggle is off', () => {
    setAgent([window.location.origin], false);
    clickAnchor('file:///C:/ws/a.md');
    expect(agentLinks()).toHaveLength(0);
  });

  it('does not intercept when the site origin is not whitelisted', () => {
    setAgent(['https://other.example'], true);
    clickAnchor('file:///C:/ws/a.md');
    expect(agentLinks()).toHaveLength(0);
  });

  it('applies a configured regex rule', () => {
    setAgent([window.location.origin], true);
    setAgentRules([
      {
        id: 'custom-regex',
        enabled: true,
        matchSelector: 'button',
        attributes: ['data-path'],
        pathPreset: 'regex',
        valueRegex: '^https://cdn\\.example/',
        action: 'url',
      },
    ]);
    clickButtonWithAttrs({ 'data-path': 'https://cdn.example/x.md' });
    expect(agentLinks()).toEqual([
      { type: 'adl-agent-link', kind: 'url', url: 'https://cdn.example/x.md' },
    ]);

    posted.length = 0;
    clickButtonWithAttrs({ 'data-path': 'https://other.example/x' });
    expect(agentLinks()).toHaveLength(0);
  });

  it('honors disabledRuleIds from a site override', () => {
    setAgent([window.location.origin], true);
    setAgentRules(
      [
        {
          id: 'custom-regex',
          enabled: true,
          matchSelector: 'button',
          attributes: ['data-path'],
          pathPreset: 'regex',
          valueRegex: '^E:\\\\',
          action: 'file',
        },
      ],
      [{ origin: window.location.origin, disabledRuleIds: ['custom-regex'], siteRules: [] }],
    );
    const event = clickButtonWithAttrs({ 'data-path': 'E:\\ws\\a.md' });
    expect(agentLinks()).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('appends site-specific rules from an override', () => {
    setAgent([window.location.origin], true);
    setAgentRules(
      [],
      [
        {
          origin: window.location.origin,
          disabledRuleIds: [],
          siteRules: [
            {
              id: 'site-rule',
              enabled: true,
              matchSelector: 'button',
              attributes: ['data-file'],
              pathPreset: 'fileLike',
              action: 'file',
            },
          ],
        },
      ],
    );
    clickButtonWithAttrs({ 'data-file': 'D:\\ws\\b.md' });
    expect(agentLinks()).toEqual([{ type: 'adl-agent-link', kind: 'file', url: 'D:\\ws\\b.md' }]);
  });

  it('ignores invalid attribute names without breaking the click chain', () => {
    setAgent([window.location.origin], true);
    setAgentRules([
      {
        id: 'bad-attr',
        enabled: true,
        matchSelector: 'button',
        attributes: ['data file'],
        pathPreset: 'fileLike',
        action: 'file',
      },
    ]);
    expect(() => clickButtonWithAttrs({ title: 'E:\\ws\\a.md' })).not.toThrow();
    expect(agentLinks()).toHaveLength(0);
  });

  it('treats an empty attribute list as matching nothing', () => {
    setAgent([window.location.origin], true);
    setAgentRules([
      {
        id: 'empty-attrs',
        enabled: true,
        matchSelector: 'button',
        attributes: [],
        pathPreset: 'fileLike',
        action: 'file',
      },
    ]);
    clickButtonWithAttrs({ title: 'E:\\ws\\a.md' });
    expect(agentLinks()).toHaveLength(0);
  });

  it('prefers site-specific rules over global rules for the same element', () => {
    setAgent([window.location.origin], true);
    setAgentRules(
      [
        {
          id: 'global-file',
          enabled: true,
          matchSelector: 'button',
          attributes: ['title'],
          pathPreset: 'fileLike',
          action: 'file',
        },
      ],
      [
        {
          origin: window.location.origin,
          disabledRuleIds: [],
          siteRules: [
            {
              id: 'site-url',
              enabled: true,
              matchSelector: 'button',
              attributes: ['data-url'],
              pathPreset: 'regex',
              valueRegex: '^https://cdn\\.example/',
              action: 'url',
            },
          ],
        },
      ],
    );
    clickButtonWithAttrs({
      title: 'E:\\ws\\a.md',
      'data-url': 'https://cdn.example/x.md',
    });
    expect(agentLinks()).toEqual([
      { type: 'adl-agent-link', kind: 'url', url: 'https://cdn.example/x.md' },
    ]);
  });

  it('applies disabledRuleIds to global rules only, never to same-id site rules', () => {
    setAgent([window.location.origin], true);
    setAgentRules(
      [
        {
          id: 'shared-id',
          enabled: true,
          matchSelector: 'button',
          attributes: ['title'],
          pathPreset: 'fileLike',
          action: 'file',
        },
      ],
      [
        {
          origin: window.location.origin,
          disabledRuleIds: ['shared-id'],
          siteRules: [
            {
              id: 'shared-id',
              enabled: true,
              matchSelector: 'button',
              attributes: ['data-url'],
              pathPreset: 'regex',
              valueRegex: '^https://cdn\\.example/',
              action: 'url',
            },
          ],
        },
      ],
    );
    clickButtonWithAttrs({
      title: 'E:\\ws\\a.md',
      'data-url': 'https://cdn.example/x.md',
    });
    expect(agentLinks()).toEqual([
      { type: 'adl-agent-link', kind: 'url', url: 'https://cdn.example/x.md' },
    ]);
  });

  it('replaces a global rule with the same id by the site rule', () => {
    setAgent([window.location.origin], true);
    setAgentRules(
      [
        {
          id: 'dup',
          enabled: true,
          matchSelector: 'button',
          attributes: ['title'],
          pathPreset: 'fileLike',
          action: 'file',
        },
      ],
      [
        {
          origin: window.location.origin,
          disabledRuleIds: [],
          siteRules: [
            {
              id: 'dup',
              enabled: true,
              matchSelector: 'button',
              attributes: ['data-url'],
              pathPreset: 'regex',
              valueRegex: '^https://cdn\\.example/',
              action: 'url',
            },
          ],
        },
      ],
    );
    clickButtonWithAttrs({
      title: 'E:\\ws\\a.md',
      'data-url': 'https://cdn.example/x.md',
    });
    expect(agentLinks()).toEqual([
      { type: 'adl-agent-link', kind: 'url', url: 'https://cdn.example/x.md' },
    ]);
  });

  it('does not fall back to a global rule when the same-id site rule is disabled', () => {
    setAgent([window.location.origin], true);
    setAgentRules(
      [
        {
          id: 'dup-disabled',
          enabled: true,
          matchSelector: 'button',
          attributes: ['title'],
          pathPreset: 'fileLike',
          action: 'file',
        },
      ],
      [
        {
          origin: window.location.origin,
          disabledRuleIds: [],
          siteRules: [
            {
              id: 'dup-disabled',
              enabled: false,
              matchSelector: 'button',
              attributes: ['title'],
              pathPreset: 'fileLike',
              action: 'file',
            },
          ],
        },
      ],
    );
    clickButtonWithAttrs({ title: 'E:\\ws\\a.md' });
    // 站点规则替换全局同 id；自身停用后该 id 在该站点不再生效，不回退到全局。
    expect(agentLinks()).toHaveLength(0);
  });

  it('skips a matched rule whose target cannot be opened and tries the next rule', () => {
    setAgent([window.location.origin], true);
    setAgentRules([
      {
        id: 'unopenable-url',
        enabled: true,
        matchSelector: 'button',
        attributes: ['data-bad'],
        pathPreset: 'regex',
        valueRegex: '^ftp://',
        action: 'url',
      },
      {
        id: 'openable-url',
        enabled: true,
        matchSelector: 'button',
        attributes: ['data-good'],
        pathPreset: 'regex',
        valueRegex: '^https://cdn\\.example/',
        action: 'url',
      },
    ]);
    clickButtonWithAttrs({
      'data-bad': 'ftp://example.com/x.md',
      'data-good': 'https://cdn.example/x.md',
    });
    expect(agentLinks()).toEqual([
      { type: 'adl-agent-link', kind: 'url', url: 'https://cdn.example/x.md' },
    ]);
  });

  it('resolves a relative url-action match against the page URL', () => {
    setAgent([window.location.origin], true);
    setAgentRules([
      {
        id: 'relative-url',
        enabled: true,
        matchSelector: 'button',
        attributes: ['data-href'],
        pathPreset: 'regex',
        valueRegex: '^/docs/',
        action: 'url',
      },
    ]);
    clickButtonWithAttrs({ 'data-href': '/docs/a.md' });
    expect(agentLinks()).toEqual([
      {
        type: 'adl-agent-link',
        kind: 'url',
        url: new URL('/docs/a.md', window.location.href).href,
      },
    ]);
  });

  it('does not send an unopenable file-kind payload for a web URL match', () => {
    setAgent([window.location.origin], true);
    setAgentRules([
      {
        id: 'bad-file-action',
        enabled: true,
        matchSelector: 'button',
        attributes: ['data-href'],
        pathPreset: 'regex',
        valueRegex: '^https://',
        action: 'file',
      },
    ]);
    const event = clickButtonWithAttrs({ 'data-href': 'https://cdn.example/x.md' });
    expect(agentLinks()).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('defines the agent-link helper and postMessage payload', () => {
    expect(initScript).toContain('__adlIsAgentHost');
    expect(initScript).toContain('__adlSendAgentLink');
    expect(initScript).toContain("type: 'adl-agent-link'");
  });

  it('routes a normal-site target=_blank click from the window bubble phase', () => {
    setAgent([], false);
    const a = document.createElement('a');
    a.href = 'https://target.example/page';
    a.target = '_blank';
    document.body.appendChild(a);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(event);
    a.remove();
    const msg = posted.find((p) => p.type === 'open-new-tab');
    expect(msg).toMatchObject({ url: 'https://target.example/page' });
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not navigate the page for a target=_blank download link (hidden iframe)', () => {
    setAgent([], false);
    const a = document.createElement('a');
    a.href = 'https://target.example/report.pdf';
    a.target = '_blank';
    document.body.appendChild(a);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(event);
    const frames = document.querySelectorAll('iframe');
    expect(event.defaultPrevented).toBe(true);
    expect(posted.filter((p) => p.type === 'open-new-tab')).toHaveLength(0);
    expect(frames).toHaveLength(1);
    expect(frames[0].style.display).toBe('none');
    expect(frames[0].getAttribute('src')).toBe('https://target.example/report.pdf');
    a.remove();
    for (const frame of frames) {
      frame.remove();
    }
  });

  it('does not open a new tab when the page already cancelled the click', () => {
    setAgent([], false);
    const a = document.createElement('a');
    a.href = 'https://target.example/page';
    a.target = '_blank';
    document.body.appendChild(a);
    const cancel = (e: Event) => e.preventDefault();
    document.addEventListener('click', cancel);
    try {
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } finally {
      document.removeEventListener('click', cancel);
      a.remove();
    }
    expect(posted.filter((p) => p.type === 'open-new-tab')).toHaveLength(0);
  });

  it('leaves a plain same-tab click to native navigation', () => {
    setAgent([], false);
    const a = document.createElement('a');
    a.href = 'https://target.example/page';
    document.body.appendChild(a);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(event);
    a.remove();
    expect(posted.filter((p) => p.type === 'open-new-tab')).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('falls back to direct navigation when the nav-guard is not installed', () => {
    // Enabling the agent switch after load leaves window.__startNavGuard absent;
    // both the <a> and <area> branches must navigate instead of swallowing.
    const noComments = initScript.replace(/\/\/[^\n]*/g, '');
    const compact = noComments.replace(/\s+/g, '');
    const hits = compact.split('}else{navigateToUrl(href);}').length - 1;
    expect(hits).toBe(2);
  });

  it('ignores right-click (non-middle auxclick) on target=_blank links', () => {
    setAgent([], false);
    const a = document.createElement('a');
    a.href = 'https://target.example/page';
    a.target = '_blank';
    document.body.appendChild(a);
    const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 });
    a.dispatchEvent(event);
    a.remove();
    expect(posted.filter((p) => p.type === 'open-new-tab')).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('routes an agent-site middle-click as a new tab before agent-link', () => {
    setAgent([window.location.origin], true);
    const a = document.createElement('a');
    a.href = 'https://target.example/page';
    document.body.appendChild(a);
    const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    a.dispatchEvent(event);
    a.remove();
    expect(posted.find((p) => p.type === 'open-new-tab')).toMatchObject({
      url: 'https://target.example/page',
    });
    expect(posted.filter((p) => p.type === 'adl-agent-link')).toHaveLength(0);
    expect(event.defaultPrevented).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
} {
  const block = extractPureBlock();
  const factory = new Function(
    `${block}\nreturn { normalize: __adlNormalizeHistoryUrl, resolve: __adlResolveHistoryNavigation };`,
  );
  return factory() as {
    normalize: (rawUrl: string, baseHref: string) => string | null;
    resolve: (rawUrl: string, baseHref: string) => ResolveResult;
  };
}

const BILI_BASE = 'https://www.bilibili.com/video/BV1eSGP6BEfn';
const YT_BASE = 'https://www.youtube.com/watch?v=AAA';

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

  it('uses the helper ONLY for modified clicks (explicit new-tab intent)', () => {
    expect(initScript).toContain('__adlTryOpenNewTab(href)');
    // 2026-08-20 用户决策：target="_blank" 的普通点击不再触发新标签（网页内跳转
    // 就地当前标签导航）；仅修饰键/中键点击保留新标签通道。
    expect(initScript).not.toContain("linkTarget === '_blank'");
    expect(initScript).not.toContain("areaTarget === '_blank'");
  });

  it('routes plain in-page clicks (incl. target=_blank) to the SPA nav-guard', () => {
    // 定位 __startNavGuard(href) 调用处（非定义处），断言其前置 preventDefault，
    // 且从最近的 preventDefault 到该调用之间不含新标签通道（__adlTryOpenNewTab）。
    // 注：从最后一个 preventDefault 起切块，避免回溯过远误伤更早的强制新标签分支。
    const guardCall = initScript.indexOf('window.__startNavGuard(href)');
    expect(guardCall).toBeGreaterThan(-1);
    const pdBefore = initScript.lastIndexOf('event.preventDefault()', guardCall);
    const block = initScript.slice(pdBefore, guardCall + 30);
    expect(block).toContain('event.preventDefault()');
    expect(block).not.toContain('__adlTryOpenNewTab');
  });

  it('does not start the SPA nav-guard in the new-tab path', () => {
    const usage = initScript.indexOf('__adlTryOpenNewTab(href))');
    const tail = initScript.slice(usage, usage + 120);
    expect(tail).not.toContain('__startNavGuard');
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

  it('resolves relative window.open URLs against the current document (download sites)', () => {
    // 用户自建网站通过 window.open('/uploads/.../file.exe', '_blank') 触发下载。
    // Chrome/Edge 会先把相对路径解析为完整 URL 再打开；旧实现将相对路径判为
    // invalid URL 返回 null 导致下载不触发。回归断言：window.open 重写必须
    // 用 new URL(rawUrl, location.href) 解析相对路径，且下载 URL 走同文档
    // location.assign → 原生 DownloadStarting。
    const marker = 'var origOpen = window.open;';
    const openRewrite = initScript.slice(initScript.indexOf(marker), initScript.length);
    expect(openRewrite).toContain('new URL(rawUrl, location.href)');
    expect(openRewrite).toContain("parsed.protocol === 'http:'");
    expect(openRewrite).toContain('window.location.assign(resolvedUrl)');
    expect(openRewrite).toContain(
      "__adlSendLog('info', 'window.open: download URL routed to same-document native DownloadStarting'",
    );
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

  it('forces any download link with target=_blank to _self, not just <a download>', () => {
    // F1 回归：点击处理器下载分支仅放行不带 download 属性、靠扩展名命中的链接。
    // new_window_handler 会 DENY 新窗口下载 → 整体取消。断言 target 归一化
    // 不再被 hasAttribute('download') 限定，而是对整个下载分支生效。
    const clickMarker =
      "if ((target.hasAttribute('download') || isDownloadUrl(href)) && isValidWebUrl(href))";
    const clickStart = initScript.indexOf(clickMarker);
    expect(clickStart).toBeGreaterThan(-1);
    // 切片窗口需覆盖到 target.target = '_self'（clickStart 起 1000+ 字符，含新增注释/日志行）
    const clickSection = initScript.slice(clickStart, clickStart + 1400);
    // 归一化条件已放宽为任何非 _self target，不含 hasAttribute('download') 前置判断
    expect(clickSection).not.toContain(
      "if (target.hasAttribute('download') && target.target && target.target !== '_self')",
    );
    expect(clickSection).toContain("if (target.target && target.target !== '_self')");
    expect(clickSection).toContain("target.target = '_self'");
    expect(clickSection).toContain("'download link forced in-place (target -> _self)'");
  });
});

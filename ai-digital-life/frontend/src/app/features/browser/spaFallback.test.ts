import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SPA 兜底标题提取（`crates/browser/src/spa_fallback.js`）回归测试。
 *
 * 与 Chrome/Edge 对齐的契约：标题事件必须与其 URL 原子配对。兜底只在
 * 「触发页仍在当前页（URL 未前进）」且「视频页 h1 存在（SPA 更新的当前
 * 内容标题）」时上报；绝不使用 og:title / twitter:title / document.title
 * 兜底（这些在文档加载时设置，YouTube Shorts/radio 队列会钉死在第一个
 * 视频，配对新 URL 即造成历史标题污染——本 bug 的根因）。
 *
 * 从 Rust crate 直接读取真源（`include_str!` 内联的同一文件），通过
 * marker 注释提取纯函数块并 eval，避免双份实现漂移。
 */
const FALLBACK_PATH = resolve(process.cwd(), '../crates/browser/src/spa_fallback.js');
const fallbackScript = readFileSync(FALLBACK_PATH, 'utf8');

function extractPureBlock(): string {
  const startMarker = '// __ADL_FALLBACK_PURE_START__';
  const endMarker = '// __ADL_FALLBACK_PURE_END__';
  const start = fallbackScript.indexOf(startMarker);
  const end = fallbackScript.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`missing pure markers in spa_fallback.js (start=${start}, end=${end})`);
  }
  return fallbackScript.slice(start + startMarker.length, end);
}

function loadPure(): {
  samePage: (locHref: string, triggerUrl: string) => boolean;
  isVideoPage: (host: string, path: string) => boolean;
} {
  const block = extractPureBlock();
  const factory = new Function(
    `${block}\nreturn { samePage: __adlFallbackSamePage, isVideoPage: __adlFallbackIsVideoPage };`,
  );
  return factory() as {
    samePage: (locHref: string, triggerUrl: string) => boolean;
    isVideoPage: (host: string, path: string) => boolean;
  };
}

describe('spa_fallback.js — atomic URL pairing (Chrome/Edge semantics)', () => {
  const { samePage } = loadPure();

  it('emits only for the page that triggered the fallback', () => {
    const url = 'https://www.youtube.com/watch?v=AAA';
    expect(samePage(url, url)).toBe(true);
  });

  it('treats hash-only differences as the same page', () => {
    expect(
      samePage('https://www.youtube.com/watch?v=AAA#a', 'https://www.youtube.com/watch?v=AAA#b'),
    ).toBe(true);
  });

  it('treats trailing-slash differences as the same page', () => {
    expect(
      samePage('https://www.youtube.com/shorts/AAA/', 'https://www.youtube.com/shorts/AAA'),
    ).toBe(true);
  });

  it('rejects when the URL advanced to a different page (fast scrolling)', () => {
    expect(
      samePage('https://www.youtube.com/shorts/BBB', 'https://www.youtube.com/shorts/AAA'),
    ).toBe(false);
  });

  it('rejects different hosts', () => {
    expect(samePage('https://b.com/page', 'https://a.com/page')).toBe(false);
  });

  it('rejects empty URLs', () => {
    expect(samePage('', 'https://a.com/page')).toBe(false);
    expect(samePage('https://a.com/page', '')).toBe(false);
  });
});

describe('spa_fallback.js — content-title scope (h1 only, no pinned meta)', () => {
  const { isVideoPage } = loadPure();

  it('recognizes youtube /watch pages', () => {
    expect(isVideoPage('youtube.com', '/watch?v=AAA')).toBe(true);
    expect(isVideoPage('www.youtube.com', '/watch')).toBe(true);
    expect(isVideoPage('m.youtube.com', '/watch')).toBe(true);
  });

  it('does NOT recognize youtube /shorts (no h1 content title; server fetch covers it)', () => {
    expect(isVideoPage('www.youtube.com', '/shorts/AAA')).toBe(false);
  });

  it('does NOT recognize non-video youtube pages', () => {
    expect(isVideoPage('www.youtube.com', '/')).toBe(false);
    expect(isVideoPage('www.youtube.com', '/feed/subscriptions')).toBe(false);
  });

  it('recognizes bilibili/douyin /video pages', () => {
    expect(isVideoPage('www.bilibili.com', '/video/BV1eSGP6BEfn')).toBe(true);
    expect(isVideoPage('www.douyin.com', '/video/123')).toBe(true);
  });

  it('rejects unrelated hosts', () => {
    expect(isVideoPage('www.example.com', '/watch')).toBe(false);
  });
});

describe('spa_fallback.js — anti-contamination structure', () => {
  // 仅检查运行时代码段（纯函数 marker 之后）：头部注释是文档说明，可提及 og:title。
  const runtime = fallbackScript.slice(fallbackScript.indexOf('// __ADL_FALLBACK_PURE_END__'));

  it('never reads og:title / twitter:title (pinned-meta sources)', () => {
    expect(runtime).not.toContain('og:title');
    expect(runtime).not.toContain('twitter:title');
    expect(runtime).not.toContain('pickContent');
  });

  it('gates emission behind the atomic same-page check and a content title', () => {
    // 上报路径必须同时满足：同页守卫（短路 return）+ 视频页检查 + h1 内容标题。
    expect(runtime).toContain('__adlFallbackSamePage');
    expect(runtime).toContain('__adlFallbackIsVideoPage');
    const metaEmit = runtime.indexOf("type: 'meta'");
    expect(metaEmit).toBeGreaterThan(-1);
    // meta 上报位于 h1 检查之后（只能来自 h1 内容标题）；同页/视频页不满足直接 return。
    const h1Check = runtime.lastIndexOf('if (!h1) {', metaEmit);
    expect(h1Check).toBeGreaterThan(-1);
  });
});

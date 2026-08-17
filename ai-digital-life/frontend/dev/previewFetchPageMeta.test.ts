import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPageMetaOnce } from './previewFetchPageMeta';

/**
 * previewFetchPageMeta 与 Rust `src-tauri/src/commands/browser.rs::fetch_page_meta_inner`
 * + `crates/browser/src/html_meta.rs` 的抓取层对齐测试（④）：
 * 实体解码集 / og:title 提取鲁棒性 / 标题截断（200 字符）。
 */

function stubFetch(html: string): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/robots.txt')) {
      return new Response('', { status: 404 });
    }
    if (url.includes('favicon')) {
      return new Response('', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  });
  vi.stubGlobal('fetch', fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('previewFetchPageMeta (isomorphic to Rust fetch_page_meta_inner)', () => {
  it('decodes full entity set (&#39; &#x2F; &nbsp;) like Rust html_entity_decode', async () => {
    stubFetch('<html><head><title>IT&#39;s a&#x2F;b&nbsp;c</title></head></html>');
    const meta = await fetchPageMetaOnce('https://example.com/page');
    expect(meta.title).toBe("IT's a/b c");
  });

  it('extracts og:title with spaces around property = and single quotes', async () => {
    stubFetch(
      "<html><head><meta property = 'og:title' content='OG Value'></head></html>",
    );
    const meta = await fetchPageMetaOnce('https://example.com/page');
    expect(meta.title).toBe('OG Value');
  });

  it('extracts og:title content even when content attribute precedes property', async () => {
    stubFetch(
      "<html><head><meta content='OG Early' property='og:title'></head></html>",
    );
    const meta = await fetchPageMetaOnce('https://example.com/page');
    expect(meta.title).toBe('OG Early');
  });

  it('truncates title to 200 chars like Rust final_title.take(200)', async () => {
    const long = 'a'.repeat(250);
    stubFetch(`<html><head><title>${long}</title></head></html>`);
    const meta = await fetchPageMetaOnce('https://example.com/page');
    expect(meta.title.length).toBe(200);
  });
});
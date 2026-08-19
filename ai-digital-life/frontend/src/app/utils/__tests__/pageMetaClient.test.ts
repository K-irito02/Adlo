import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPageMetaClient } from '../../../mock-bridge';
import type { PageMetaUpdatedPayload } from '../../../shared/ipc/browser';

const shell = vi.hoisted(() => ({ isTauri: true, requestPreviewApi: vi.fn() }));

vi.mock('../../../tauri-bridge/tauri-shared', () => ({
  invokeIpc: vi.fn(),
  isTauriShell: () => shell.isTauri,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('../../../preview-bridge/preview-api', () => ({
  requestPreviewApi: shell.requestPreviewApi,
}));

describe('pageMetaClient (tauri adapter)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  it('get maps invokeIpc result to PageMeta and null on failure', async () => {
    const { invokeIpc } = await import('../../../tauri-bridge/tauri-shared');
    vi.mocked(invokeIpc).mockResolvedValue({
      ok: true,
      data: {
        title: 'T',
        favicon: 'https://a.com/f.ico',
        faviconDataUri: '',
        url: 'https://a.com/',
      },
    });
    const { pageMetaClient } = await import('../pageMetaClient');
    const meta = await pageMetaClient.get('https://a.com/');
    expect(meta?.title).toBe('T');
    expect(invokeIpc).toHaveBeenCalledWith('browser_page_meta_get', expect.any(Object));
    vi.mocked(invokeIpc).mockResolvedValue({
      ok: false,
      error: { code: 'E', message: 'x' },
    } as never);
    expect(await pageMetaClient.get('https://a.com/')).toBeNull();
  });
  it('report invokes browser_page_meta_report with source', async () => {
    const { invokeIpc } = await import('../../../tauri-bridge/tauri-shared');
    vi.mocked(invokeIpc).mockResolvedValue({ ok: true, data: true });
    const { pageMetaClient } = await import('../pageMetaClient');
    await pageMetaClient.report({ title: 'X', favicon: '', url: 'https://a.com/' }, 'com');
    expect(invokeIpc).toHaveBeenCalledWith('browser_page_meta_report', {
      url: 'https://a.com/',
      title: 'X',
      favicon: '',
      source: 'com',
    });
  });
  it('subscribeUpdated tolerates a rejected listen (no unhandled rejection) (⑬c)', async () => {
    vi.resetModules();
    const { listen } = await import('@tauri-apps/api/event');
    vi.mocked(listen).mockRejectedValueOnce(new Error('listen failed'));
    const { pageMetaClient } = await import('../pageMetaClient');
    const unsub = pageMetaClient.subscribeUpdated(() => {});
    unsub();
    // flush microtasks so an unhandled rejection would surface as a test failure
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unsub).toBeInstanceOf(Function);
  });
});

describe('createMockPageMetaClient (in-memory mock adapter)', () => {
  it('mock pageMetaClient keeps state in memory and broadcasts', async () => {
    const mock = createMockPageMetaClient();
    const seen: PageMetaUpdatedPayload[] = [];
    mock.subscribeUpdated((p) => seen.push(p));
    await mock.report({ title: 'T', favicon: '', url: 'https://a.com/' }, 'http');
    expect(seen.some((p) => p.title === 'T')).toBe(true);
    expect(mock.peek('https://a.com/')?.title).toBe('T');
  });
  it('mock report respects merge gate (com does not clobber http)', async () => {
    const mock = createMockPageMetaClient();
    await mock.report({ title: '真实', favicon: '', url: 'https://a.com/' }, 'http');
    await mock.report({ title: '陈旧', favicon: '', url: 'https://a.com/' }, 'com');
    expect(mock.peek('https://a.com/')?.title).toBe('真实');
  });
});

describe('pageMetaClient (preview adapter) warmup mirror propagation (⑦)', () => {
  beforeEach(async () => {
    shell.isTauri = false;
    shell.requestPreviewApi.mockReset();
    vi.resetModules();
    const siteMetaCache = await import('@utils/siteMetaCache');
    siteMetaCache.setSiteMetaBackendForTest(siteMetaCache.createMockSiteMetaBackend());
    await siteMetaCache.initSiteMetaCache();
  });

  it('warmup applies returned metas to the local mirror', async () => {
    shell.requestPreviewApi.mockResolvedValue({
      ok: true,
      data: [
        {
          title: 'Warm',
          favicon: 'https://a.com/f.ico',
          faviconDataUri: '',
          url: 'https://a.com/',
        },
      ],
    });
    const { pageMetaClient } = await import('../pageMetaClient');
    await pageMetaClient.warmup(['https://a.com/']);
    const siteMetaCache = await import('@utils/siteMetaCache');
    const entry = siteMetaCache.getCachedSiteMeta('https://a.com/');
    expect(entry?.title).toBe('Warm');
    expect(entry?.titleSource).toBe('http');
  });

  it('refresh applies the returned meta to the local mirror (⑧)', async () => {
    shell.requestPreviewApi.mockResolvedValue({
      ok: true,
      data: {
        title: 'Refreshed',
        favicon: 'https://a.com/f.ico',
        faviconDataUri: '',
        url: 'https://a.com/',
      },
    });
    const { pageMetaClient } = await import('../pageMetaClient');
    const meta = await pageMetaClient.refresh('https://a.com/');
    expect(meta?.title).toBe('Refreshed');
    const siteMetaCache = await import('@utils/siteMetaCache');
    const entry = siteMetaCache.getCachedSiteMeta('https://a.com/');
    expect(entry?.title).toBe('Refreshed');
    expect(entry?.titleSource).toBe('http');
  });
});

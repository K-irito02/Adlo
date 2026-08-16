import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPageMetaClient } from '../../../mock-bridge';
import type { PageMetaUpdatedPayload } from '../../../shared/ipc/browser';

vi.mock('../../../tauri-bridge/tauri-shared', () => ({
  invokeIpc: vi.fn(),
  isTauriShell: () => true,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

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

import { describe, expect, it } from 'vitest';
import { createHttpBridge } from '../../../httpBridge';
import { mockClipboard } from '../../../mock/mock-clipboard';

describe('clipboard bridge contract', () => {
  const bridge = createHttpBridge({ baseUrl: 'http://127.0.0.1:1' });

  it('keeps the clipboard method key set identical between http and mock bridges', () => {
    // 穷尽键 parity：契约增删必须两端同步。tauri/preview 的 clipboard 系
    // http spread + 覆盖（构造即继承），故只锁手写两端 http↔mock。
    expect(Object.keys(mockClipboard).sort()).toEqual(Object.keys(bridge.clipboard).sort());
  });

  it('exposes write + asset url builders, not writeImage', () => {
    expect(typeof bridge.clipboard.write).toBe('function');
    expect(typeof bridge.clipboard.exportUrl).toBe('function');
    expect(typeof bridge.clipboard.getHtmlUrl).toBe('function');
    expect(typeof bridge.clipboard.getRtfUrl).toBe('function');
    expect('writeImage' in bridge.clipboard).toBe(false);
  });

  it('exposes saveToFile and reports it as NOT_SUPPORTED on httpBridge', async () => {
    // 系统原生「另存为」是壳层能力：ad-server 只提供载荷（export 路由），
    // 落盘由 tauri-bridge / preview-bridge 覆盖，httpBridge 恒 NOT_SUPPORTED。
    const result = await bridge.clipboard.saveToFile({
      suggestedName: 'clipboard-c1.txt',
      dataBase64: 'aGk=',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('NOT_SUPPORTED');
  });

  it('builds asset urls from basename only', () => {
    expect(bridge.clipboard.getHtmlUrl('/data/clipboard/html/abc.html')).toBe(
      'http://127.0.0.1:1/clipboard/html/abc.html',
    );
    expect(bridge.clipboard.getRtfUrl('')).toBe('');
  });

  it('builds the export url from the ad-server base url and the item id', () => {
    const url = bridge.clipboard.exportUrl('abc-1');
    expect(url).toContain('abc-1');
    expect(url).toBe('http://127.0.0.1:1/clipboard/export?id=abc-1');
  });
});
